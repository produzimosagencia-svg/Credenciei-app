// Lançar ponto manual — regulariza quem já foi embora, com motivo.
//
// ─── DIFERENTE DO REGISTRO ASSISTIDO (`ponto-assistido.ts`) ─────────────────
//
// Lá o operador registra o que está acontecendo NA FRENTE dele, agora — a
// prova é a foto. Aqui se escreve o PASSADO, com hora arbitrária, e é ato
// de gestão: mais restrito (supervisor/quem gerencia eventos, não qualquer
// um que acompanha) e sem foto — a prova é a trilha (autor, motivo,
// `manual: true`), gravada via `registrarAuditoria`. Cópia de
// `lancarPontoManual` em `c:\Dev\credenciei\lib\actions.ts`.

import { diaBRT, ehMaster, formatarBR, podeGerenciarEventos } from '@credenciei/dominio'
import type { DadosParaLancarPonto, DiaDaOperacao, EventoEscaneavel, PessoaParaLancamento } from '@credenciei/contrato'
import type { TipoBatida } from '@credenciei/contrato'
import type { Perfil, Repositorio } from '../dados/repositorio.js'

const ORDEM_DAS_ETAPAS: TipoBatida[] = ['entrada', 'meio', 'fim']

const ROTULO_DA_ETAPA: Record<TipoBatida, string> = {
  entrada: 'Entrada', meio: 'Meio do evento', fim: 'Saída',
}

/**
 * Quem pode lançar ponto: quem gerencia eventos, ou o supervisor — do
 * PRÓPRIO setor. `suporte` fica de fora por ora: o app ainda não modela
 * `suporte_escopo` (mesma simplificação de `podeExcluirDaEquipe` e
 * `bloquear-cpf.ts` — suporte cai como organização inteira, não por evento
 * contratado, até esse modelo existir).
 */
async function exigirAcesso(repo: Repositorio, pessoaId: string): Promise<Perfil> {
  const perfil = await repo.perfilPorId(pessoaId)
  if (!perfil || !(podeGerenciarEventos(perfil.papel) || perfil.papel === 'supervisor')) {
    throw new Error('Você não tem permissão para lançar ponto manualmente.')
  }
  return perfil
}

export async function eventosParaLancarPonto(repo: Repositorio, pessoaId: string): Promise<EventoEscaneavel[]> {
  const perfil = await exigirAcesso(repo, pessoaId)

  if (perfil.papel === 'supervisor') {
    const equipe = await repo.equipeDoSupervisor(pessoaId)
    if (!equipe) return []
    const evento = await repo.eventoPorId(equipe.eventoId)
    return evento?.ativo ? [{ eventoId: evento.id, nome: evento.nome }] : []
  }

  const eventos = await repo.eventosComContagens(ehMaster(perfil.papel) ? {} : { organizacaoId: perfil.organizacaoId })
  return eventos.filter(e => e.ativo).map(e => ({ eventoId: e.id, nome: e.nome }))
}

/** O(s) setor(es) que este perfil pode lançar ponto NESTE evento — `null` é "todos". */
async function setoresPermitidos(repo: Repositorio, perfil: Perfil, eventoId: string): Promise<string[] | null> {
  if (perfil.papel === 'supervisor') {
    const equipe = await repo.equipeDoSupervisor(perfil.id)
    if (!equipe || equipe.eventoId !== eventoId) throw new Error('Você não tem setor neste evento.')
    return [equipe.id]
  }
  const evento = await repo.eventoPorId(eventoId)
  if (!evento || (!ehMaster(perfil.papel) && evento.organizacaoId !== perfil.organizacaoId)) {
    throw new Error('Evento não encontrado.')
  }
  return null
}

export async function dadosParaLancarPonto(
  repo: Repositorio, pessoaId: string, eventoId: string, agora: Date = new Date(),
): Promise<DadosParaLancarPonto> {
  const perfil = await exigirAcesso(repo, pessoaId)
  const permitidos = await setoresPermitidos(repo, perfil, eventoId)
  const evento = await repo.eventoPorId(eventoId)
  if (!evento) throw new Error('Evento não encontrado.')

  const setores = (await repo.equipesDoEvento(eventoId))
    .filter(s => !permitidos || permitidos.includes(s.setorId))

  /*
   * As equipes ainda vêm uma consulta por setor (setores de um evento são
   * dezenas, não milhares — tolerável). Os REGISTROS, não: um evento de
   * milhares de pessoas faria uma consulta por pessoa se buscasse aqui
   * dentro do loop. `registrosDeParticipacoes` traz todo mundo numa
   * passada só, e o mapa abaixo agrupa por participação em memória —
   * achado revisando escala (Epic 13) em 22/09/2026.
   */
  const equipesPorSetor = await Promise.all(setores.map(s => repo.participacoesDaEquipe(s.setorId)))
  const todasAsParticipacoes = equipesPorSetor.flat()
  const registros = await repo.registrosDeParticipacoes(todasAsParticipacoes.map(p => p.id))

  const registrosPorParticipacao = new Map<string, typeof registros>()
  for (const r of registros) {
    const lista = registrosPorParticipacao.get(r.participacaoId) ?? []
    lista.push(r)
    registrosPorParticipacao.set(r.participacaoId, lista)
  }

  const pessoas: PessoaParaLancamento[] = []
  setores.forEach((setor, i) => {
    for (const p of equipesPorSetor[i]!) {
      const batidas: Record<string, string> = {}
      for (const r of registrosPorParticipacao.get(p.id) ?? []) batidas[`${r.dataRef}:${r.tipo}`] = r.registradoEm
      pessoas.push({
        id: p.id, nome: p.pessoa.nome, cpf: p.pessoa.cpf, setorNome: setor.nome,
        cargo: p.funcao ?? '', ativo: p.ativo, batidas,
      })
    }
  })

  const diasBrutos = await repo.diasDoEvento(eventoId)
  const dias: DiaDaOperacao[] = diasBrutos
    .filter(d => !d.cancelado)
    .map(d => ({ data: d.data, tipo: d.tipo }))
    .sort((a, b) => a.data.localeCompare(b.data))

  const hoje = diaBRT(agora)
  const datasDisponiveis = dias.map(d => d.data)
  const diaPadrao = datasDisponiveis.includes(hoje)
    ? hoje
    : [...datasDisponiveis].reverse().find(d => d <= hoje) ?? datasDisponiveis[0] ?? hoje

  return { eventoNome: evento.nome, pessoas, dias, diaPadrao }
}

export async function lancarPontoManual(
  repo: Repositorio, pessoaId: string, participacaoId: string, tipo: TipoBatida, dataRef: string,
  quandoISO: string, motivo: string, agora: Date = new Date(),
): Promise<{ nome?: string; etapa?: string; erro?: string }> {
  const perfil = await exigirAcesso(repo, pessoaId)

  if (!ORDEM_DAS_ETAPAS.includes(tipo)) return { erro: 'Etapa inválida.' }

  const justificativa = (motivo ?? '').trim()
  if (justificativa.length < 5) {
    return { erro: 'Escreva o motivo do lançamento manual — é ele que sustenta a batida numa conferência.' }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataRef ?? '')) return { erro: 'Informe o dia de trabalho.' }
  const quando = new Date(quandoISO)
  if (Number.isNaN(quando.getTime())) return { erro: 'Informe a data e a hora da batida.' }

  const participacao = await repo.participacaoPorId(participacaoId)
  if (!participacao) return { erro: 'Funcionário não encontrado.' }

  try {
    const permitidos = await setoresPermitidos(repo, perfil, participacao.eventoId)
    if (permitidos && !permitidos.includes(participacao.equipeId)) {
      return { erro: 'Esta pessoa é de outro setor. Você só lança ponto da sua equipe.' }
    }
  } catch (e) {
    return { erro: e instanceof Error ? e.message : 'Funcionário não encontrado.' }
  }

  if (!participacao.ativo) {
    return { erro: 'Esta pessoa não está ativada no evento. Ative no painel do setor antes de lançar o ponto.' }
  }

  const dia = (await repo.diasDoEvento(participacao.eventoId)).find(d => d.data === dataRef)
  if (!dia || dia.cancelado) {
    return { erro: 'Esse dia não é um dia de trabalho deste evento. Marque-o em Editar evento antes de lançar o ponto.' }
  }

  // Rede contra o dedo escorregar no ano/mês — um turno nunca passa de ~36h
  // do início do dia de trabalho a que pertence.
  const inicioDoDia = new Date(`${dataRef}T00:00:00-03:00`).getTime()
  const distancia = quando.getTime() - inicioDoDia
  if (distancia < -12 * 60 * 60 * 1000 || distancia > 36 * 60 * 60 * 1000) {
    return { erro: `A data e hora informadas estão longe demais do dia ${dataRef.split('-').reverse().join('/')}. Confira antes de salvar.` }
  }

  await repo.apagarRegistroDoTipo(participacaoId, tipo, dataRef)
  await repo.gravarRegistro({
    id: crypto.randomUUID(), participacaoId, tipo, dataRef,
    // `registradoEm` é o horário ESCOLHIDO (o que realmente aconteceu);
    // `recebidoEm` é agora — quando a correção foi digitada. Os dois quase
    // sempre divergem aqui, de propósito: é um lançamento retroativo.
    registradoEm: quando.toISOString(), recebidoEm: agora.toISOString(), origem: 'assistido',
    fotoPath: null, lat: null, lng: null, manual: true,
  })

  const pessoa = await repo.pessoaPorId(participacao.pessoaId)
  await repo.registrarAuditoria({
    autorId: pessoaId, autorNome: perfil.nome, acao: 'CORRECAO_PONTO',
    campoAlterado: `${ROTULO_DA_ETAPA[tipo]} de ${pessoa?.nome ?? 'colaborador'}`,
    valorNovo: formatarBR(quando.toISOString(), 'completo'), motivo: justificativa,
    participacaoId, eventoId: participacao.eventoId, organizacaoId: perfil.organizacaoId ?? undefined,
  })

  return { nome: pessoa?.nome, etapa: ROTULO_DA_ETAPA[tipo] }
}
