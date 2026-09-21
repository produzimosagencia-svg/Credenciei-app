// Bloquear CPF — quem não pode se cadastrar NESTE evento.
//
// Vale para o evento INTEIRO, não um setor: barrar só num setor deixaria a
// pessoa se cadastrar no setor ao lado pelo mesmo link. E vale SÓ deste
// evento — ela segue livre para trabalhar em qualquer outro da plataforma;
// isto é uma decisão operacional de um evento, não um veto permanente.
// Bloquear não apaga quem já está cadastrado nem o histórico de batidas.

import { ehMaster, formatCpf, podeBloquearCpf } from '@credenciei/dominio'
import type { CpfBloqueado, EventoEscaneavel } from '@credenciei/contrato'
import type { Perfil, Repositorio } from '../dados/repositorio.js'

async function exigirAcessoAoEvento(
  repo: Repositorio, pessoaId: string, eventoId: string,
): Promise<Perfil> {
  const perfil = await repo.perfilPorId(pessoaId)
  if (!perfil || !podeBloquearCpf(perfil.papel)) {
    throw new Error('Você não tem permissão para bloquear CPF.')
  }

  // O supervisor só bloqueia no evento onde tem setor — mesma régua de
  // `equipeDoAcesso` em `atividades.ts`.
  if (perfil.papel === 'supervisor') {
    const equipe = await repo.equipeDoSupervisor(pessoaId)
    if (!equipe || equipe.eventoId !== eventoId) throw new Error('Você não tem setor neste evento.')
    return perfil
  }

  const evento = await repo.eventoPorId(eventoId)
  if (!evento || (!ehMaster(perfil.papel) && evento.organizacaoId !== perfil.organizacaoId)) {
    throw new Error('Não encontramos este evento.')
  }
  return perfil
}

export async function eventosParaBloqueio(repo: Repositorio, pessoaId: string): Promise<EventoEscaneavel[]> {
  const perfil = await repo.perfilPorId(pessoaId)
  if (!perfil || !podeBloquearCpf(perfil.papel)) {
    throw new Error('Você não tem permissão para bloquear CPF.')
  }

  if (perfil.papel === 'supervisor') {
    const equipe = await repo.equipeDoSupervisor(pessoaId)
    if (!equipe) return []
    const evento = await repo.eventoPorId(equipe.eventoId)
    return evento?.ativo ? [{ eventoId: evento.id, nome: evento.nome }] : []
  }

  const eventos = await repo.eventosComContagens(ehMaster(perfil.papel) ? {} : { organizacaoId: perfil.organizacaoId })
  return eventos.filter(e => e.ativo).map(e => ({ eventoId: e.id, nome: e.nome }))
}

export async function bloqueiosDoEvento(
  repo: Repositorio, pessoaId: string, eventoId: string,
): Promise<CpfBloqueado[]> {
  await exigirAcessoAoEvento(repo, pessoaId, eventoId)
  const bloqueios = await repo.bloqueiosDoEvento(eventoId)
  return bloqueios.map(b => ({ id: b.id, cpf: b.cpf, motivo: b.motivo, criadoEm: b.criadoEm, bloqueadoPor: b.bloqueadoPorNome }))
}

export async function bloquearCpf(
  repo: Repositorio, pessoaId: string, eventoId: string, cpfDigitado: string, motivo?: string,
): Promise<{ cpf?: string; erro?: string }> {
  const perfil = await exigirAcessoAoEvento(repo, pessoaId, eventoId)

  const cpf = (cpfDigitado ?? '').replace(/\D/g, '')
  if (cpf.length !== 11) return { erro: 'O CPF precisa ter 11 dígitos.' }

  if (await repo.existeBloqueio(eventoId, cpf)) return { erro: 'Este CPF já está bloqueado neste evento.' }

  const bloqueio = await repo.criarBloqueio({
    eventoId,
    cpf,
    motivo: (motivo ?? '').trim() || null,
    bloqueadoPorId: pessoaId,
    bloqueadoPorNome: perfil.nome,
  })

  await repo.registrarAuditoria({
    autorId: pessoaId, autorNome: perfil.nome, acao: 'BLOQUEIO_CPF',
    campoAlterado: 'CPF bloqueado', valorNovo: formatCpf(bloqueio.cpf),
    motivo: (motivo ?? '').trim() || null, eventoId, organizacaoId: perfil.organizacaoId ?? undefined,
  })

  return { cpf: bloqueio.cpf }
}

/** Mesma régua de quem pode bloquear: quem bloqueia pode liberar. */
export async function desbloquearCpf(
  repo: Repositorio, pessoaId: string, bloqueioId: string, eventoId: string,
): Promise<{ erro?: string }> {
  const perfil = await exigirAcessoAoEvento(repo, pessoaId, eventoId)
  const alvo = (await repo.bloqueiosDoEvento(eventoId)).find(b => b.id === bloqueioId)
  const apagou = await repo.removerBloqueio(bloqueioId, eventoId)
  if (!apagou) return { erro: 'Não encontramos este bloqueio.' }

  await repo.registrarAuditoria({
    autorId: pessoaId, autorNome: perfil.nome, acao: 'DESBLOQUEIO_CPF',
    campoAlterado: 'CPF desbloqueado', valorNovo: alvo ? formatCpf(alvo.cpf) : null,
    eventoId, organizacaoId: perfil.organizacaoId ?? undefined,
  })
  return {}
}
