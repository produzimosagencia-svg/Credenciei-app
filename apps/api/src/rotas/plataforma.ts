// A Plataforma — o que só o master enxerga.
//
// Não é operação de um evento: é o negócio por trás dele. Cada organização é
// um cliente, com o próprio painel, equipe e limite de eventos. Suspender
// bloqueia sem apagar — o histórico é do cliente, e ele vai querer de volta
// se voltar.

import { podeGerenciarOrganizacoes } from '@credenciei/dominio'
import type { DadosDeNovaOrganizacao, ListaDeOrganizacoes, Organizacao } from '@credenciei/contrato'
import type { OrganizacaoComContagens, Perfil, Repositorio } from '../dados/repositorio.js'
import { criarEvento } from './configurar-evento.js'

async function exigirPodeGerenciarOrganizacoes(repo: Repositorio, pessoaId: string): Promise<Perfil> {
  const perfil = await repo.perfilPorId(pessoaId)
  if (!perfil || !podeGerenciarOrganizacoes(perfil.papel)) {
    throw new Error('Você não tem permissão para gerenciar organizações.')
  }
  return perfil
}

function paraOrganizacao(o: OrganizacaoComContagens): Organizacao {
  return {
    organizacaoId: o.id,
    nome: o.nome,
    documento: o.documento,
    ativa: o.ativo,
    adminNome: o.adminNome,
    adminIdentificador: o.adminEmail,
    eventos: o.eventos,
    limiteEventos: o.limiteEventos,
    valorCobrado: o.valorCobrado,
    periodo: o.valorCobradoPeriodo,
    criadaEm: o.criadaEm,
  }
}

export async function organizacoes(repo: Repositorio, pessoaId: string): Promise<ListaDeOrganizacoes> {
  await exigirPodeGerenciarOrganizacoes(repo, pessoaId)
  const todas = await repo.organizacoesComContagens()
  return {
    itens: todas.map(paraOrganizacao),
    total: todas.length,
    ativas: todas.filter(o => o.ativo).length,
  }
}

export async function alternarOrganizacao(
  repo: Repositorio, pessoaId: string, organizacaoId: string, ativa: boolean,
): Promise<{ erro?: string }> {
  await exigirPodeGerenciarOrganizacoes(repo, pessoaId)
  const org = await repo.organizacaoPorId(organizacaoId)
  if (!org) return { erro: 'Não encontramos esta organização.' }
  await repo.definirSituacaoDaOrganizacao(organizacaoId, ativa)
  return {}
}

/**
 * Cria o cliente e o admin dono dele — e, se veio preenchido, o primeiro
 * evento.
 *
 * O primeiro evento reaproveita `criarEvento` (mesma conferência de
 * horários, mesmo código de convite): quem está chamando aqui já é o
 * master, só que a organização dona deste evento é a que acabou de nascer,
 * não a dele — o master não tem nenhuma.
 */
export async function criarOrganizacao(
  repo: Repositorio, pessoaId: string, dados: DadosDeNovaOrganizacao,
): Promise<{ organizacao?: Organizacao; erro?: string }> {
  await exigirPodeGerenciarOrganizacoes(repo, pessoaId)

  const nome = (dados.nome ?? '').trim()
  if (!nome) return { erro: 'O nome da organização é obrigatório.' }

  const email = (dados.email ?? '').trim().toLowerCase()
  if (!email) return { erro: 'O e-mail do admin é obrigatório.' }

  const adminNome = (dados.adminNome ?? '').trim()
  if (!adminNome) return { erro: 'O nome do admin é obrigatório.' }

  if ((dados.senha ?? '').length < 6) return { erro: 'A senha precisa ter pelo menos 6 caracteres.' }

  let organizacao: OrganizacaoComContagens
  try {
    organizacao = await repo.criarOrganizacao({
      nome,
      documento: dados.documento?.trim() || null,
      responsavelNome: dados.responsavelNome?.trim() || null,
      limiteEventos: dados.limiteEventos ?? 1,
      valorCobrado: dados.valorCobrado ?? null,
      valorCobradoPeriodo: dados.valorCobrado ? (dados.valorCobradoPeriodo ?? 'mensal') : null,
      adminNome,
      email,
      senha: dados.senha,
    })
  } catch (e) {
    return { erro: e instanceof Error ? e.message : 'Não foi possível criar a organização.' }
  }

  const primeiroEvento = dados.primeiroEvento
  let eventoCriado = false
  if (primeiroEvento?.nome && primeiroEvento.dataInicio && primeiroEvento.dataFim) {
    const r = await criarEvento(repo, pessoaId, {
      organizacaoId: organizacao.id,
      nome: primeiroEvento.nome,
      local: primeiroEvento.local ?? null,
      dataInicio: primeiroEvento.dataInicio,
      dataFim: primeiroEvento.dataFim,
    })
    eventoCriado = !!r.eventoId
  }

  const resultado = paraOrganizacao(organizacao)
  if (eventoCriado) resultado.eventos = 1
  return { organizacao: resultado }
}
