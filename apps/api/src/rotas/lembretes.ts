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
