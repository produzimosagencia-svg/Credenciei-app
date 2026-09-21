// Conferência de equipe — a tela que o supervisor usa 1 dia antes do evento
// pra ver a equipe, tirar quem não é dele, e confirmar que a lista está
// certa. Trazido do site em 11/09/2026 — a régua pura da janela já veio
// junto (`packages/dominio/src/conferencia.ts`), só a API que faltava.
//
// ─── QUEM PODE MEXER NUM SETOR ──────────────────────────────────────────────
//
// Mesma régua de `equipeDoSetor` (`rotas/setor.ts`): master vê tudo; os
// demais papéis que `podeAcompanhar` cobre (admin, gerente, cliente,
// operador de portão, suporte) ficam presos à própria organização;
// supervisor só o PRÓPRIO setor, resolvido por `equipeDoSupervisor`.
//
// ─── "TIRAR" É DESCREDENCIAR, NÃO APAGAR ────────────────────────────────────
//
// A pessoa continua existindo — só o vínculo com o evento fecha
// (`descredenciadoEm`). O histórico de quem já trabalhou continua intacto;
// é a mesma operação que qualquer descredenciamento usa em outro lugar,
// só com o motivo sendo esta tela.

import { abreEm, conferenciaAberta, ehMaster, podeAcompanhar } from '@credenciei/dominio'
import type { ArquivoDePlanilha, ConferenciaDoSetor, LinhaConferencia } from '@credenciei/contrato'
import type { Arquivos } from '../arquivos.js'
import type { Perfil, Repositorio } from '../dados/repositorio.js'

async function exigirSetor(repo: Repositorio, pessoaId: string, setorId: string) {
  const perfil = await repo.perfilPorId(pessoaId)
  if (!perfil || !podeAcompanhar(perfil)) {
    throw new Error('Você não tem permissão para mexer nesta equipe.')
  }

  const setor = await repo.setorPorId(setorId)
  if (!setor) throw new Error('Não encontramos este setor.')
  const evento = await repo.eventoPorId(setor.eventoId)
  // "Não encontramos" para os dois casos — setor sem evento não devia
  // existir, mas se existir não é diferente de não encontrar nada.
  if (!evento) throw new Error('Não encontramos este setor.')

  if (perfil.papel === 'supervisor') {
    const equipe = await repo.equipeDoSupervisor(pessoaId)
    // Mesma resposta de "não existe": diferenciar entregaria um jeito de
    // varrer setorId e descobrir quais existem.
    if (!equipe || equipe.id !== setorId) throw new Error('Não encontramos este setor.')
  } else if (!ehMaster(perfil.papel) && evento.organizacaoId !== perfil.organizacaoId) {
    throw new Error('Não encontramos este setor.')
  }

  return { perfil, setor, evento }
}

/** A visão geral do organizador: todos os setores do evento, com supervisor e o estado da conferência. */
export async function conferenciasDoEvento(
  repo: Repositorio, pessoaId: string, eventoId: string,
): Promise<LinhaConferencia[]> {
  const perfil = await repo.perfilPorId(pessoaId)
  if (!perfil || !podeAcompanhar(perfil)) {
    throw new Error('Você não tem permissão para ver isto.')
  }
  const evento = await repo.eventoPorId(eventoId)
  if (!evento) throw new Error('Não encontramos este evento.')
  if (perfil.papel !== 'supervisor' && !ehMaster(perfil.papel) && evento.organizacaoId !== perfil.organizacaoId) {
    throw new Error('Não encontramos este evento.')
  }

  const linhas = await repo.conferenciasDoEvento(eventoId)
  // Setor sem supervisor nem entra na lista — mesma régua do site: sem
  // supervisor não há quem confirme, e a linha só confundiria a contagem
  // ("faltam 8" quando na verdade ninguém ia mexer nesses 3 mesmo).
  return linhas
    .filter(l => l.supervisorNome !== null)
    .map(l => ({
      setorId: l.setorId,
      setorNome: l.setorNome,
      supervisorNome: l.supervisorNome,
      temSupervisor: true,
      status: l.estado?.status ?? 'pendente',
      confirmadaEm: l.estado?.confirmadaEm ?? null,
      totalMantidos: l.estado?.totalMantidos ?? null,
      totalRemovidos: l.estado?.totalRemovidos ?? null,
    }))
}

async function nomeDoConfirmador(repo: Repositorio, pessoaId: string | null): Promise<string | null> {
  if (!pessoaId) return null
  const perfil = await repo.perfilPorId(pessoaId)
  return perfil?.nome ?? null
}

export async function conferenciaDoSetor(
  repo: Repositorio, pessoaId: string, setorId: string, agora: Date = new Date(),
): Promise<ConferenciaDoSetor> {
  const { setor, evento } = await exigirSetor(repo, pessoaId, setorId)
  if (!evento.dataInicio) throw new Error('Este evento ainda não tem data definida.')

  const [estado, membros] = await Promise.all([
    repo.estadoDaConferencia(setorId),
    repo.participacoesDaEquipe(setorId),
  ])
  const ativos = membros.filter(m => !m.descredenciadoEm && m.ativo)

  return {
    setorId,
    setorNome: setor.nome,
    eventoId: evento.id,
    eventoNome: evento.nome,
    dataInicio: evento.dataInicio,
    aberta: conferenciaAberta(evento.dataInicio, agora),
    abreEm: abreEm(evento.dataInicio).toISOString(),
    status: estado?.status ?? 'pendente',
    confirmadaEm: estado?.confirmadaEm ?? null,
    confirmadaPorNome: await nomeDoConfirmador(repo, estado?.confirmadaPorPessoaId ?? null),
    totalMantidos: estado?.totalMantidos ?? null,
    totalRemovidos: estado?.totalRemovidos ?? null,
    equipe: ativos.map(m => ({
      id: m.id, nome: m.pessoa.nome, cpf: m.pessoa.cpf, telefone: m.pessoa.telefone, cargo: m.funcao,
    })),
  }
}

/** Tira alguém da equipe durante a conferência — descredencia, não apaga. */
export async function removerDaConferencia(
  repo: Repositorio, pessoaId: string, setorId: string, funcionarioId: string, agora: Date = new Date(),
): Promise<{ erro?: string }> {
  await exigirSetor(repo, pessoaId, setorId)

  const participacao = await repo.participacaoPorId(funcionarioId)
  // Mesma resposta de "não encontrada" pra id de fora do setor — nunca
  // confia em id vindo de fora sem checar de quem/de onde ele é.
  if (!participacao || participacao.equipeId !== setorId) {
    return { erro: 'Não encontramos esta pessoa nesta equipe.' }
  }

  await repo.descredenciarParticipacao(funcionarioId, agora.toISOString())
  return {}
}

/** Fecha a conferência: carimba quem, quando, e os números. */
export async function confirmarConferencia(
  repo: Repositorio, pessoaId: string, setorId: string, agora: Date = new Date(),
): Promise<{ erro?: string }> {
  const { perfil, evento } = await exigirSetor(repo, pessoaId, setorId)
  if (!evento.dataInicio) return { erro: 'Este evento ainda não tem data definida.' }
  if (!conferenciaAberta(evento.dataInicio, agora)) {
    return { erro: 'A conferência abre 1 dia antes do evento.' }
  }

  const membros = await repo.participacoesDaEquipe(setorId)
  const mantidos = membros.filter(m => !m.descredenciadoEm && m.ativo).length
  const removidos = membros.filter(m => !!m.descredenciadoEm).length

  await repo.confirmarConferencia({
    setorId, eventoId: evento.id, confirmadoPorPessoaId: (perfil as Perfil).id,
    mantidos, removidos, agora: agora.toISOString(),
  })

  const setor = await repo.setorPorId(setorId)
  await repo.registrarAuditoria({
    autorId: pessoaId, autorNome: perfil.nome, acao: 'DESCREDENCIAMENTO',
    campoAlterado: `Conferência de equipe — ${setor?.nome ?? ''}`,
    valorNovo: `${mantidos} mantido(s), ${removidos} removido(s)`,
    eventoId: evento.id, organizacaoId: evento.organizacaoId ?? undefined,
  })
  return {}
}

function escaparCsv(v: unknown): string {
  const s = String(v ?? '')
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** O CSV da equipe do setor — pro botão "Baixar planilha" da tela. */
export async function planilhaDaConferencia(
  repo: Repositorio, pessoaId: string, setorId: string, arquivos: Arquivos,
): Promise<ArquivoDePlanilha> {
  const { setor, evento } = await exigirSetor(repo, pessoaId, setorId)
  const ativos = (await repo.participacoesDaEquipe(setorId)).filter(m => !m.descredenciadoEm && m.ativo)

  const linhas = [
    'Nome;CPF;Telefone;Função',
    ...ativos.map(m => [m.pessoa.nome, m.pessoa.cpf, m.pessoa.telefone, m.funcao].map(escaparCsv).join(';')),
  ]
  // BOM (﻿) pro Excel abrir os acentos certos — mesmo truque do site.
  const csv = '﻿' + linhas.join('\r\n')
  const nome = `equipe-${setor.nome}.csv`
  const url = await arquivos.guardar(
    `${evento.id}/conferencia-${setorId}.csv`, 'text/csv; charset=utf-8', Buffer.from(csv, 'utf-8'),
  )
  return { nome, url }
}
