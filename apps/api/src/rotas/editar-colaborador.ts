// Editar colaborador (atalho) — acha a pessoa em TODOS os setores do
// evento, sem precisar saber em qual ela está.
//
// Não é funcionalidade nova: mover de setor, corrigir CPF, ajustar valor e
// tornar supervisor já existem dentro da ficha da pessoa
// (`ficha-da-pessoa.ts` + a tela que a abre). O que faltava era achar a
// pessoa sem saber o setor — num evento de muitos setores, abrir um por um
// é a diferença entre resolver na hora e não resolver.
//
// Sem supervisor de propósito: ele já tem a própria equipe na tela do
// setor, não precisa de um atalho pra procurar em setores que não são
// dele. `suporte` entra como organização inteira — mesma simplificação de
// `lancar-ponto.ts` (o app ainda não modela `suporte_escopo`).

import { ehMaster, podeGerenciarEventos } from '@credenciei/dominio'
import type { BuscaDeColaboradores, ColaboradorDoEvento, EventoEscaneavel } from '@credenciei/contrato'
import type { Perfil, Repositorio } from '../dados/repositorio.js'

async function exigirAcesso(repo: Repositorio, pessoaId: string): Promise<Perfil> {
  const perfil = await repo.perfilPorId(pessoaId)
  if (!perfil || !(podeGerenciarEventos(perfil.papel) || perfil.papel === 'suporte')) {
    throw new Error('Você não tem permissão para editar colaboradores.')
  }
  return perfil
}

export async function eventosParaEditarColaborador(repo: Repositorio, pessoaId: string): Promise<EventoEscaneavel[]> {
  const perfil = await exigirAcesso(repo, pessoaId)
  const eventos = await repo.eventosComContagens(ehMaster(perfil.papel) ? {} : { organizacaoId: perfil.organizacaoId })
  return eventos.map(e => ({ eventoId: e.id, nome: e.nome }))
}

export async function colaboradoresDoEvento(
  repo: Repositorio, pessoaId: string, eventoId: string,
): Promise<BuscaDeColaboradores> {
  const perfil = await exigirAcesso(repo, pessoaId)
  const evento = await repo.eventoPorId(eventoId)
  if (!evento || (!ehMaster(perfil.papel) && evento.organizacaoId !== perfil.organizacaoId)) {
    throw new Error('Evento não encontrado.')
  }

  const setores = await repo.equipesDoEvento(eventoId)
  const colaboradores: ColaboradorDoEvento[] = []
  for (const setor of setores) {
    const equipe = await repo.participacoesDaEquipe(setor.setorId)
    for (const p of equipe) {
      colaboradores.push({
        participacaoId: p.id, nome: p.pessoa.nome, cpf: p.pessoa.cpf,
        setorNome: setor.nome, cargo: p.funcao ?? '', ativo: p.ativo,
      })
    }
  }

  return { eventoNome: evento.nome, colaboradores }
}
