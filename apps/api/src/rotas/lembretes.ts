// Lembretes automáticos de entrada e saída — os dois primeiros dos vários
// que o site manda por WhatsApp (`lib/mensagens.ts`), agora também como
// notificação push. Chamados por um agendador externo de tempos em tempos
// (mesmo padrão de `manutencao.ts`): a rota não sabe agendar sozinha, só
// responde "manda quem precisa, agora".
//
// ─── SÓ QUEM TEM PRAZO DE VERDADE PRA PERDER ────────────────────────────────
//
// Mesma trava do site (`diaComTrava`, em `lib/mensagens.ts`): só entra aqui
// quem está num dia PRINCIPAL, não cancelado, de um evento SEM auto-
// atendimento (`batida_livre`). Fora disso não existe hora fixa pra cobrar —
// ver `participacoesSemRegistroHoje`, no repositório.
//
// ─── A JANELA DE AVISO ──────────────────────────────────────────────────────
//
// Só manda dentro de `ANTECEDENCIA_HORAS` antes do prazo (janela da etapa
// fechando) — mesmo raciocínio do site (`ANTECEDENCIA_AVISO_DIA_HORAS`):
// cedo demais é ruído que ninguém lê ainda; depois do prazo não serve pra
// nada. Sem prazo configurado (`janelaFim` nulo), não tem o que lembrar.
//
// ─── IDEMPOTÊNCIA ANTES DA REGRA ────────────────────────────────────────────
//
// O agendador externo bate nesta rota várias vezes por hora — sem a
// dedupe (`jaEnviouLembreteHoje`/`registrarLembreteEnviado`), a mesma
// pessoa levaria um push a cada chamada, até o prazo passar.

import { janelaMeio } from '@credenciei/dominio'
import type { Repositorio } from '../dados/repositorio.js'

const ANTECEDENCIA_HORAS = 2

/** Quem manda de verdade — injetado pra rota não depender do Expo em teste. */
export type EnviarPush = (
  tokens: string[],
  mensagem: { titulo: string; corpo: string; dados?: Record<string, unknown> },
) => Promise<void>

const TEXTO_POR_MOMENTO: Record<'entrada' | 'fim', { tipo: string; titulo: string; instrucao: string }> = {
  entrada: {
    tipo: 'lembrete_entrada',
    titulo: 'Falta bater a entrada',
    instrucao: 'Abra a credencial e mostre o QR no credenciamento.',
  },
  fim: {
    tipo: 'lembrete_fim',
    titulo: 'Falta bater a saída',
    instrucao: 'Abra a credencial e mostre o QR na saída, antes de ir embora.',
  },
}

async function enviarLembretes(
  repo: Repositorio, momento: 'entrada' | 'fim', enviarPush: EnviarPush, agora: Date,
): Promise<{ enviados: number }> {
  const texto = TEXTO_POR_MOMENTO[momento]
  const candidatos = await repo.participacoesSemRegistroHoje(momento, agora)

  let enviados = 0
  for (const p of candidatos) {
    if (!p.janelaFim) continue
    const fim = new Date(p.janelaFim).getTime()
    const faltamHoras = (fim - agora.getTime()) / 3_600_000
    if (faltamHoras < 0 || faltamHoras > ANTECEDENCIA_HORAS) continue

    // `diaRef`, não o calendário de `agora`: numa saída depois da meia-
    // noite os dois divergem, e a dedupe precisa do dia do PRINCIPAL.
    if (await repo.jaEnviouLembreteHoje(p.participacaoId, texto.tipo, p.diaRef)) continue

    const tokens = await repo.tokensDePush(p.pessoaId)
    if (!tokens.length) continue

    await enviarPush(tokens.map(t => t.token), {
      titulo: texto.titulo,
      corpo: `${p.nome.split(' ')[0]}, o prazo de hoje está chegando. ${texto.instrucao}`,
      dados: { tipo: texto.tipo, participacaoId: p.participacaoId },
    })
    await repo.registrarLembreteEnviado(p.participacaoId, texto.tipo, p.diaRef)
    enviados++
  }

  return { enviados }
}

export async function enviarLembretesDeEntrada(
  repo: Repositorio, enviarPush: EnviarPush, agora: Date = new Date(),
): Promise<{ enviados: number }> {
  return enviarLembretes(repo, 'entrada', enviarPush, agora)
}

export async function enviarLembretesDeSaida(
  repo: Repositorio, enviarPush: EnviarPush, agora: Date = new Date(),
): Promise<{ enviados: number }> {
  return enviarLembretes(repo, 'fim', enviarPush, agora)
}

// ─── O meio ──────────────────────────────────────────────────────────────
//
// Diferente de entrada/saída: a janela não é do EVENTO, é da PESSOA — abre
// 4h depois da entrada REAL dela (`janelaMeio`, no domínio), e vale todo
// dia, montagem incluída (ao contrário do resto, o meio fica de FORA da
// trava de "dia principal, sem batida livre" — mesmo raciocínio do site).
// Por isso usa `participacoesSemMeioHoje`, uma consulta própria, não
// `participacoesSemRegistroHoje`.

export async function enviarLembretesDeMeio(
  repo: Repositorio, enviarPush: EnviarPush, agora: Date = new Date(),
): Promise<{ enviados: number }> {
  const TIPO = 'lembrete_meio'
  const candidatos = await repo.participacoesSemMeioHoje(agora)

  let enviados = 0
  for (const p of candidatos) {
    const janela = janelaMeio(p.entradaEm)
    const fim = new Date(janela.fim).getTime()
    const faltamHoras = (fim - agora.getTime()) / 3_600_000
    if (faltamHoras < 0 || faltamHoras > ANTECEDENCIA_HORAS) continue

    if (await repo.jaEnviouLembreteHoje(p.participacaoId, TIPO, p.diaRef)) continue

    const tokens = await repo.tokensDePush(p.pessoaId)
    if (!tokens.length) continue

    await enviarPush(tokens.map(t => t.token), {
      titulo: 'Falta bater o meio',
      corpo: `${p.nome.split(' ')[0]}, o prazo da selfie do meio está chegando. `
        + 'Abra a credencial e registre com a câmera.',
      dados: { tipo: TIPO, participacaoId: p.participacaoId },
    })
    await repo.registrarLembreteEnviado(p.participacaoId, TIPO, p.diaRef)
    enviados++
  }

  return { enviados }
}

// ─── Alerta ao supervisor ───────────────────────────────────────────────────
//
// Mesma trava e mesma janela de aviso do lembrete individual — a diferença é
// PRA QUEM: um push só, por setor, com a lista de quem ainda falta, em vez
// de um push por pessoa. Cópia de `alerta_supervisor_*` no site
// (`lib/mensagens.ts`), que também cancela quando ninguém está faltando.
//
// O supervisor de um setor é resolvido por `perfis.fornecedor_id` — o setor
// ATUAL dele, não todos os que alcança (`supervisor_setores`). Mesma
// limitação já documentada no CLAUDE.md ("um supervisor só enxerga um setor
// por vez no app"); o alerta segue a mesma régua, de propósito, não uma
// nova.

const MAX_NOMES_NO_ALERTA = 8

const TEXTO_ALERTA_POR_MOMENTO: Record<'entrada' | 'fim', { tipo: string; rotulo: string }> = {
  entrada: { tipo: 'alerta_supervisor_entrada', rotulo: 'sem entrada' },
  fim: { tipo: 'alerta_supervisor_fim', rotulo: 'sem saída' },
}

async function enviarAlertaSupervisor(
  repo: Repositorio, momento: 'entrada' | 'fim', enviarPush: EnviarPush, agora: Date,
): Promise<{ enviados: number }> {
  const texto = TEXTO_ALERTA_POR_MOMENTO[momento]
  const candidatos = await repo.participacoesSemRegistroHoje(momento, agora)

  const dentroDaJanela = candidatos.filter(p => {
    if (!p.janelaFim) return false
    const faltamHoras = (new Date(p.janelaFim).getTime() - agora.getTime()) / 3_600_000
    return faltamHoras >= 0 && faltamHoras <= ANTECEDENCIA_HORAS
  })

  const porEquipe = new Map<string, typeof dentroDaJanela>()
  for (const p of dentroDaJanela) {
    const lista = porEquipe.get(p.equipeId) ?? []
    lista.push(p)
    porEquipe.set(p.equipeId, lista)
  }

  let enviados = 0
  for (const [equipeId, pendentes] of porEquipe) {
    // Sem pendência, sem aviso — mesma régua do site: contar o que falta
    // só faz sentido quando falta alguém.
    if (!pendentes.length) continue

    const supervisorPessoaId = await repo.supervisorDoSetor(equipeId)
    if (!supervisorPessoaId) continue

    const diaRef = pendentes[0]!.diaRef
    if (await repo.jaEnviouLembreteHoje(equipeId, texto.tipo, diaRef)) continue

    const tokens = await repo.tokensDePush(supervisorPessoaId)
    if (!tokens.length) continue

    const nomes = pendentes.slice(0, MAX_NOMES_NO_ALERTA).map(p => p.nome)
    const resto = pendentes.length > MAX_NOMES_NO_ALERTA ? `, e mais ${pendentes.length - MAX_NOMES_NO_ALERTA}` : ''
    await enviarPush(tokens.map(t => t.token), {
      titulo: `${pendentes[0]!.equipeNome}: ${pendentes.length} ${texto.rotulo}`,
      corpo: `${nomes.join(', ')}${resto} — ${pendentes[0]!.eventoNome}.`,
      dados: { tipo: texto.tipo, equipeId },
    })
    await repo.registrarLembreteEnviado(equipeId, texto.tipo, diaRef)
    enviados++
  }

  return { enviados }
}

export async function enviarAlertaSupervisorDeEntrada(
  repo: Repositorio, enviarPush: EnviarPush, agora: Date = new Date(),
): Promise<{ enviados: number }> {
  return enviarAlertaSupervisor(repo, 'entrada', enviarPush, agora)
}

export async function enviarAlertaSupervisorDeSaida(
  repo: Repositorio, enviarPush: EnviarPush, agora: Date = new Date(),
): Promise<{ enviados: number }> {
  return enviarAlertaSupervisor(repo, 'fim', enviarPush, agora)
}

// ─── Aviso do dia (evento, montagem, desmontagem) ──────────────────────────
//
// Diferente dos lembretes: não é "você está devendo algo", é "hoje tem
// trabalho". Cópia de `aviso_dia_evento`/`aviso_montagem`/`aviso_desmontagem`
// no site — o dia do evento sai na hora calculada por `quandoAvisarDoDia`
// (07:00 fixo, ou antes se o credenciamento inteiro fecha cedo); montagem e
// desmontagem saem sempre às 07:00 (`HORA_AVISO_DIA`). Sem janela futura pra
// antecipar — o aviso só existe depois que a hora combinada chega, no
// próprio dia (`diasParaAvisarHoje` já filtra pro dia de hoje).

const TITULO_POR_FASE: Record<'montagem' | 'evento' | 'desmontagem', string> = {
  montagem: 'Hoje é dia de montagem',
  evento: 'Hoje é o dia do evento',
  desmontagem: 'Hoje é dia de desmontagem',
}

export async function enviarAvisoDoDia(
  repo: Repositorio, enviarPush: EnviarPush, agora: Date = new Date(),
): Promise<{ enviados: number }> {
  const candidatos = await repo.diasParaAvisarHoje(agora)

  let enviados = 0
  for (const p of candidatos) {
    const tipo = `aviso_${p.fase === 'evento' ? 'dia_evento' : p.fase}`
    if (await repo.jaEnviouLembreteHoje(p.participacaoId, tipo, p.data)) continue

    const tokens = await repo.tokensDePush(p.pessoaId)
    if (!tokens.length) continue

    await enviarPush(tokens.map(t => t.token), {
      titulo: TITULO_POR_FASE[p.fase],
      corpo: `${p.nome.split(' ')[0]}, ${p.eventoNome} conta com você hoje. Abra a credencial pra ver os detalhes.`,
      dados: { tipo, participacaoId: p.participacaoId },
    })
    await repo.registrarLembreteEnviado(p.participacaoId, tipo, p.data)
    enviados++
  }

  return { enviados }
}
