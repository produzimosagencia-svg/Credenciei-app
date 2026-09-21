// A ficha de uma pessoa da equipe — o que "equipeDoSetor" abre ao tocar em
// alguém: dados de contato, financeiro, presença de hoje e o histórico dos
// dias trabalhados. Cópia do site's `FuncionarioDetalheModal.tsx` (abas
// "Dados"/"Histórico de batidas"), 13/09/2026.
//
// A regra de escopo é a MESMA de `equipeDoSetor` (`rotas/setor.ts`): master
// vê qualquer um; os demais papéis que gerenciam ficam presos à própria
// organização; supervisor só vê quem está no PRÓPRIO setor. "Não encontramos
// esta pessoa" serve para id inexistente e para id de outra organização, de
// propósito — diferenciar entregaria um jeito de varrer ids.

import {
  diaBRT, ehMaster, formatCpf, podeAcompanhar, podeExcluirDaEquipe, podeGerenciarEventos, podeGerenciarUsuarios,
} from '@credenciei/dominio'
import type { FichaDaPessoa } from '@credenciei/contrato'
import type { Participacao, Perfil, Evento, Repositorio } from '../dados/repositorio.js'
import { diasDaParticipacao } from './eventos.js'

/**
 * A leitura da ficha: master vê tudo; quem acompanha fica preso à
 * organização; supervisor só o PRÓPRIO setor. "Não encontramos esta
 * pessoa" serve pra id inexistente e pra id fora do alcance, de propósito
 * — diferenciar entregaria um jeito de varrer ids.
 */
async function exigirAcessoAParticipacao(
  repo: Repositorio, pessoaId: string, participacaoId: string,
): Promise<{ perfil: Perfil; participacao: Participacao; evento: Evento }> {
  const perfil = await repo.perfilPorId(pessoaId)
  if (!perfil || !podeAcompanhar(perfil)) throw new Error('Você não tem permissão para ver esta ficha.')

  const participacao = await repo.participacaoPorId(participacaoId)
  if (!participacao) throw new Error('Não encontramos esta pessoa.')

  const evento = await repo.eventoPorId(participacao.eventoId)
  if (!evento) throw new Error('Não encontramos esta pessoa.')

  if (perfil.papel === 'supervisor') {
    const equipe = await repo.equipeDoSupervisor(pessoaId)
    if (!equipe || equipe.id !== participacao.equipeId) throw new Error('Não encontramos esta pessoa.')
  } else if (!ehMaster(perfil.papel) && evento.organizacaoId !== perfil.organizacaoId) {
    throw new Error('Não encontramos esta pessoa.')
  }

  return { perfil, participacao, evento }
}

/**
 * Mutações do financeiro/situação da equipe — mesma régua do site's
 * `exigirAcessoFuncionarios`: supervisor DO PRÓPRIO SETOR (já filtrado por
 * `exigirAcessoAParticipacao`), ou quem gerencia eventos da organização.
 * Nunca suporte nem operador de portão — de propósito, aqui é financeiro.
 */
function podeMexerNaEquipe(perfil: Perfil, evento: Evento): boolean {
  if (perfil.papel === 'supervisor') return true
  return podeGerenciarEventos(perfil.papel) && (ehMaster(perfil.papel) || evento.organizacaoId === perfil.organizacaoId)
}

export async function fichaDaPessoa(
  repo: Repositorio, pessoaId: string, participacaoId: string, agora: Date = new Date(),
): Promise<FichaDaPessoa> {
  const { perfil, participacao, evento } = await exigirAcessoAParticipacao(repo, pessoaId, participacaoId)

  const pessoa = await repo.pessoaPorId(participacao.pessoaId)
  if (!pessoa) throw new Error('Não encontramos esta pessoa.')

  const hoje = diaBRT(agora)
  const [dias, registrosHoje, setoresDoEvento, contestacoesAbertas] = await Promise.all([
    diasDaParticipacao(repo, participacao, evento.dataInicio),
    repo.registrosDoDia(participacao.id, hoje),
    repo.setoresDoEvento(evento.id),
    repo.contestacoesAbertas(participacao.id),
  ])
  const pegaHoje = (t: 'entrada' | 'meio' | 'fim') => registrosHoje.find(r => r.tipo === t)?.registradoEm ?? null

  return {
    participacaoId: participacao.id,
    nome: pessoa.nome,
    cpf: pessoa.cpf,
    telefone: pessoa.telefone,
    fotoUrl: pessoa.fotoPath,
    empresa: participacao.empresa ?? null,
    funcao: participacao.funcao,
    eventoNome: evento.nome,
    setorId: participacao.equipeId,
    setorNome: participacao.equipeNome,
    ativo: participacao.ativo,
    descredenciadoEm: participacao.descredenciadoEm,
    valorReceber: participacao.valorReceber ?? 0,
    pago: participacao.pago,
    pagoEm: participacao.pagoEm,
    chavePix: participacao.chavePix ?? null,
    presencaHoje: { entrada: pegaHoje('entrada'), meio: pegaHoje('meio'), fim: pegaHoje('fim') },
    dias,
    outrosSetores: setoresDoEvento
      .filter(s => s.setorId !== participacao.equipeId)
      .map(s => ({ setorId: s.setorId, nome: s.nome })),
    podeMover: podeGerenciarEventos(perfil.papel),
    podeTornarSupervisor: podeGerenciarUsuarios(perfil.papel),
    podeExcluirDaEquipe: podeExcluirDaEquipe(perfil.papel) && podeMexerNaEquipe(perfil, evento),
    podeCorrigirTelefone: podeMexerNaEquipe(perfil, evento),
    podeAtivarDesativar: podeMexerNaEquipe(perfil, evento),
    contestacoesAbertas: contestacoesAbertas.map(c => ({
      id: c.id, tipo: c.tipo, dataRef: c.dataRef, motivo: c.motivo, criadoEm: c.criadoEm,
    })),
  }
}

/**
 * Move a pessoa para outro setor do MESMO evento — cópia do site's
 * `moverFuncionarioDeSetor`, na parte que já é promessa do app hoje
 * (`podeMover` = `podeGerenciarEventos`). O site também deixa supervisor e
 * suporte moverem dentro do próprio alcance, com motivo obrigatório; o app
 * ainda não modela "todos os setores de um supervisor" (`meusSetores`, no
 * site) — só o último que ele viu — então essa extensão fica para quando
 * essa tela existir (ver "Limitações conhecidas" no CLAUDE.md).
 */
export async function moverDeSetor(
  repo: Repositorio, pessoaId: string, participacaoId: string, novoSetorId: string,
): Promise<{ erro?: string }> {
  const { perfil, participacao, evento } = await exigirAcessoAParticipacao(repo, pessoaId, participacaoId)
  if (!podeGerenciarEventos(perfil.papel)) {
    return { erro: 'Você não tem permissão para mover esta pessoa de setor.' }
  }

  if (participacao.equipeId === novoSetorId) return { erro: 'Ela já está neste setor.' }

  const destino = await repo.setorPorId(novoSetorId)
  if (!destino || destino.eventoId !== participacao.eventoId) {
    return { erro: 'Setor de destino não encontrado neste evento.' }
  }

  const pessoa = await repo.pessoaPorId(participacao.pessoaId)
  if (!pessoa) return { erro: 'Não encontramos esta pessoa.' }

  // Mesma regra do cadastro público: uma pessoa não pode estar em dois
  // setores do mesmo evento ao mesmo tempo.
  const jaNoDestino = await repo.participacoesDaEquipe(novoSetorId)
  if (jaNoDestino.some(m => m.pessoa.cpf === pessoa.cpf)) {
    return { erro: `Já existe um cadastro com este CPF no setor ${destino.nome}.` }
  }

  const setorAnterior = participacao.equipeNome
  await repo.moverParticipacao(participacaoId, novoSetorId)

  await repo.registrarAuditoria({
    autorId: pessoaId, autorNome: perfil.nome, acao: 'ALTERACAO_SETOR', campoAlterado: 'setor',
    valorAnterior: setorAnterior, valorNovo: destino.nome,
    participacaoId, eventoId: evento.id, organizacaoId: evento.organizacaoId ?? undefined,
  })
  return {}
}

/**
 * Promove alguém da equipe a supervisor DO PRÓPRIO SETOR — cópia do
 * site's `criarSupervisor` chamado a partir da ficha. Reaproveita nome e
 * CPF de quem já está credenciado; o telefone é pedido porque é por ele
 * que o convite vai.
 */
export async function tornarSupervisor(
  repo: Repositorio, pessoaId: string, participacaoId: string, telefoneBruto: string,
): Promise<{ erro?: string }> {
  const { perfil, participacao, evento } = await exigirAcessoAParticipacao(repo, pessoaId, participacaoId)
  if (!podeGerenciarUsuarios(perfil.papel)) {
    return { erro: 'Você não tem permissão para criar acessos.' }
  }

  const telefone = (telefoneBruto ?? '').replace(/\D/g, '')
  if (telefone.length < 10 || telefone.length > 13) {
    return { erro: 'Informe um telefone válido para enviar o acesso pelo WhatsApp.' }
  }

  const pessoa = await repo.pessoaPorId(participacao.pessoaId)
  if (!pessoa) return { erro: 'Não encontramos esta pessoa.' }

  const existente = await repo.acessoPorCpf(pessoa.cpf)
  if (existente) {
    if (existente.papel !== 'supervisor') return { erro: 'Este CPF já pertence a outro tipo de acesso no sistema.' }
    if (!ehMaster(perfil.papel) && existente.organizacaoId !== evento.organizacaoId) {
      return { erro: 'Este CPF já está cadastrado em outra organização.' }
    }
    await repo.reatribuirSupervisorAoSetor(existente.id, participacao.equipeId)
    await repo.registrarAuditoria({
      autorId: pessoaId, autorNome: perfil.nome, acao: 'ALTERACAO_SUPERVISOR',
      campoAlterado: `Supervisor do setor ${participacao.equipeNome}`,
      valorNovo: `${pessoa.nome} — CPF ${formatCpf(pessoa.cpf)} (já era supervisor, ganhou mais este setor)`,
      eventoId: evento.id, organizacaoId: evento.organizacaoId ?? undefined,
    })
    return {}
  }

  await repo.criarAcesso({
    nome: pessoa.nome, cpf: pessoa.cpf, telefone, papel: 'supervisor',
    organizacaoId: evento.organizacaoId, ativo: true, setorId: participacao.equipeId, permissoesUsuario: {},
  })
  await repo.registrarAuditoria({
    autorId: pessoaId, autorNome: perfil.nome, acao: 'ALTERACAO_SUPERVISOR',
    campoAlterado: `Supervisor do setor ${participacao.equipeNome}`,
    valorNovo: `${pessoa.nome} — CPF ${formatCpf(pessoa.cpf)} (acesso novo)`,
    eventoId: evento.id, organizacaoId: evento.organizacaoId ?? undefined,
  })
  return {}
}

/** Marca ou desmarca o pagamento. Só quem já está ativado pode ser marcado como pago. */
export async function marcarPagamento(
  repo: Repositorio, pessoaId: string, participacaoId: string, pago: boolean,
): Promise<{ erro?: string }> {
  const { perfil, participacao, evento } = await exigirAcessoAParticipacao(repo, pessoaId, participacaoId)
  if (!podeMexerNaEquipe(perfil, evento)) {
    return { erro: 'Você não tem permissão para mexer no pagamento desta pessoa.' }
  }
  if (pago && !participacao.ativo) {
    return { erro: 'Esta pessoa não está ativada. Ative antes de marcar o pagamento.' }
  }

  await repo.definirPagamentoDaParticipacao(participacaoId, pago)
  return {}
}

/** Quanto esta pessoa recebe — pode diferir do valor combinado do setor. */
export async function salvarValorAReceber(
  repo: Repositorio, pessoaId: string, participacaoId: string, valor: number,
): Promise<{ erro?: string }> {
  const { perfil, evento } = await exigirAcessoAParticipacao(repo, pessoaId, participacaoId)
  if (!podeMexerNaEquipe(perfil, evento)) {
    return { erro: 'Você não tem permissão para mexer no valor a receber desta pessoa.' }
  }
  if (!Number.isFinite(valor) || valor < 0) return { erro: 'O valor precisa ser zero ou mais.' }

  await repo.definirValorAReceberDaParticipacao(participacaoId, valor)
  return {}
}

/**
 * "Tirar da equipe" — descredencia, sem apagar nada. Reversível por
 * `trazerDeVolta`. Mesma régua de mexer na equipe (supervisor do setor, ou
 * quem gerencia eventos da organização).
 */
export async function tirarDaEquipe(
  repo: Repositorio, pessoaId: string, participacaoId: string,
): Promise<{ erro?: string }> {
  const { perfil, participacao, evento } = await exigirAcessoAParticipacao(repo, pessoaId, participacaoId)
  if (!podeMexerNaEquipe(perfil, evento)) {
    return { erro: 'Você não tem permissão para mexer nesta equipe.' }
  }
  if (participacao.descredenciadoEm) return {}

  await repo.descredenciarParticipacao(participacaoId, new Date().toISOString())
  await repo.registrarAuditoria({
    autorId: pessoaId, autorNome: perfil.nome, acao: 'DESCREDENCIAMENTO',
    campoAlterado: 'Vínculo com o evento', valorAnterior: 'Credenciado', valorNovo: 'Descredenciado',
    participacaoId, eventoId: evento.id, organizacaoId: evento.organizacaoId ?? undefined,
  })
  return {}
}

/** Desfaz um "tirar da equipe" — reabre o vínculo, sem outro efeito colateral. Mesma régua de `tirarDaEquipe`. */
export async function trazerDeVolta(
  repo: Repositorio, pessoaId: string, participacaoId: string,
): Promise<{ erro?: string }> {
  const { perfil, evento } = await exigirAcessoAParticipacao(repo, pessoaId, participacaoId)
  if (!podeMexerNaEquipe(perfil, evento)) {
    return { erro: 'Você não tem permissão para mexer nesta equipe.' }
  }
  await repo.recredenciarParticipacao(participacaoId)
  return {}
}

/**
 * Ativa ou desativa, SEM tirar da equipe — cópia de `alternarAtivacao` no
 * site, achada comparando a ficha da pessoa (21/09/2026). Diferente de
 * "tirar da equipe": a pessoa continua na lista e no setor, só marcada
 * como inativa — pára lembrete de WhatsApp e sai da conta do fechamento,
 * mas sem perder o vínculo nem o histórico. Mesma régua de mexer na
 * equipe.
 */
export async function alternarAtivacao(
  repo: Repositorio, pessoaId: string, participacaoId: string, ativo: boolean,
): Promise<{ erro?: string }> {
  const { perfil, evento } = await exigirAcessoAParticipacao(repo, pessoaId, participacaoId)
  if (!podeMexerNaEquipe(perfil, evento)) {
    return { erro: 'Você não tem permissão para mexer nesta equipe.' }
  }
  await repo.alternarAtivacaoDaParticipacao(participacaoId, ativo)
  await repo.registrarAuditoria({
    autorId: pessoaId, autorNome: perfil.nome,
    acao: ativo ? 'ATIVACAO_FUNCIONARIO' : 'DESATIVACAO_FUNCIONARIO',
    campoAlterado: 'Situação no evento',
    valorAnterior: ativo ? 'Inativo' : 'Ativo', valorNovo: ativo ? 'Ativo' : 'Inativo',
    participacaoId, eventoId: evento.id, organizacaoId: evento.organizacaoId ?? undefined,
  })
  return {}
}

/**
 * Exclui de vez — cadastro e batidas, sem volta. Diferente de
 * `tirarDaEquipe`, que é reversível. Cópia do site's `deletarFuncionario`.
 */
export async function excluirDaEquipe(
  repo: Repositorio, pessoaId: string, participacaoId: string, motivo?: string,
): Promise<{ erro?: string }> {
  const { perfil, participacao } = await exigirAcessoAParticipacao(repo, pessoaId, participacaoId)
  if (!podeExcluirDaEquipe(perfil.papel)) {
    return { erro: 'Você não pode excluir. Use "Tirar da equipe", que preserva o histórico.' }
  }

  const pessoa = await repo.pessoaPorId(participacao.pessoaId)
  const evento = await repo.eventoPorId(participacao.eventoId)

  await repo.excluirParticipacaoDeVez(participacaoId)

  await repo.registrarAuditoria({
    autorId: pessoaId, autorNome: perfil.nome, acao: 'EXCLUSAO_FUNCIONARIO',
    campoAlterado: 'Funcionário excluído',
    valorAnterior: pessoa ? `${pessoa.nome} — CPF ${formatCpf(pessoa.cpf)}` : null,
    motivo: (motivo ?? '').trim() || null,
    eventoId: participacao.eventoId, organizacaoId: evento?.organizacaoId ?? undefined,
  })
  return {}
}

/**
 * Corrige o telefone — é por ele que a credencial, o aviso do dia e o
 * lembrete de ponto chegam pelo WhatsApp; um dígito errado tira a pessoa
 * da comunicação do evento inteira. Cópia do site's
 * `editarTelefoneFuncionario`, escopada a ESTA participação (não a todo
 * cadastro da pessoa com o mesmo CPF — o site também só toca esta linha).
 *
 * O site também deixa o suporte corrigir, dentro do escopo dele
 * (`suporte_escopo`, com motivo obrigatório) — fica de fora aqui pela
 * mesma razão de `podeExcluirDaEquipe`: esse escopo ainda não existe
 * neste domínio.
 */
export async function corrigirTelefone(
  repo: Repositorio, pessoaId: string, participacaoId: string, telefoneBruto: string, motivo?: string,
): Promise<{ erro?: string }> {
  const { perfil, participacao, evento } = await exigirAcessoAParticipacao(repo, pessoaId, participacaoId)
  if (!podeMexerNaEquipe(perfil, evento)) {
    return { erro: 'Você não tem permissão para corrigir o telefone desta pessoa.' }
  }

  const novo = (telefoneBruto ?? '').replace(/\D/g, '')
  // Mesma régua de `tornarSupervisor`: com DDD, com ou sem o 55 na frente.
  if (novo.length < 10 || novo.length > 13) {
    return { erro: 'Telefone inválido. Informe com DDD — ex.: (27) 99999-9999.' }
  }

  const pessoa = await repo.pessoaPorId(participacao.pessoaId)
  const anterior = pessoa?.telefone ?? null
  if (anterior === novo) return {}

  await repo.corrigirTelefoneDaParticipacao(participacaoId, novo)
  await repo.registrarAuditoria({
    autorId: pessoaId, autorNome: perfil.nome, acao: 'ALTERACAO_TELEFONE', campoAlterado: 'Telefone',
    valorAnterior: anterior || '—', valorNovo: novo, motivo: (motivo ?? '').trim() || null,
    participacaoId, eventoId: evento.id, organizacaoId: evento.organizacaoId ?? undefined,
  })
  return {}
}

/**
 * Marca uma contestação de batida como resolvida — mesma régua de
 * `podeMexerNaEquipe` usada em `corrigirTelefone`/`marcarPagamento`. O
 * cliente só manda o `id` da contestação (ver `ClienteApi.resolverContestacao`
 * em `packages/contrato`), sem o `participacaoId` — por isso busca a
 * contestação primeiro, pra achar o dono e o evento antes de autorizar.
 */
export async function resolverContestacao(
  repo: Repositorio, pessoaId: string, id: string,
): Promise<{ erro?: string }> {
  const contestacao = await repo.contestacaoPorId(id)
  if (!contestacao) return { erro: 'Não encontramos esta contestação.' }

  const { perfil, evento } = await exigirAcessoAParticipacao(repo, pessoaId, contestacao.participacaoId)
  if (!podeMexerNaEquipe(perfil, evento)) {
    return { erro: 'Você não tem permissão para resolver esta contestação.' }
  }

  await repo.resolverContestacao(id, pessoaId)
  return {}
}
