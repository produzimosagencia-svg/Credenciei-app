// Lembrete automático de bater a entrada — o primeiro dos vários lembretes
// que o site manda por WhatsApp (`lib/mensagens.ts`), agora também como
// notificação push. Chamado por um agendador externo de tempos em tempos
// (mesmo padrão de `manutencao.ts`): a rota não sabe agendar sozinha, só
// responde "manda quem precisa, agora".
//
// ─── SÓ QUEM TEM PRAZO DE VERDADE PRA PERDER ────────────────────────────────
//
// Mesma trava do site (`diaComTrava`, em `lib/mensagens.ts`): só entra aqui
// quem está num dia PRINCIPAL, não cancelado, de um evento SEM auto-
// atendimento (`batida_livre`). Fora disso não existe hora fixa pra cobrar —
// ver `participacoesSemEntradaHoje`, no repositório.
//
// ─── A JANELA DE AVISO ──────────────────────────────────────────────────────
//
// Só manda dentro de `ANTECEDENCIA_HORAS` antes do prazo (janela de entrada
// fechando) — mesmo raciocínio do site (`ANTECEDENCIA_AVISO_DIA_HORAS`):
// cedo demais é ruído que ninguém lê ainda; depois do prazo não serve pra
// nada. Sem prazo configurado (`janelaEntradaFim` nulo), não tem o que
// lembrar.
//
// ─── IDEMPOTÊNCIA ANTES DA REGRA ────────────────────────────────────────────
//
// O agendador externo bate nesta rota várias vezes por hora — sem a
// dedupe (`jaEnviouLembreteHoje`/`registrarLembreteEnviado`), a mesma
// pessoa levaria um push a cada chamada, até o prazo passar.

import { diaBRT } from '@credenciei/dominio'
import type { Repositorio } from '../dados/repositorio.js'

const ANTECEDENCIA_HORAS = 2
const TIPO = 'lembrete_entrada'

/** Quem manda de verdade — injetado pra rota não depender do Expo em teste. */
export type EnviarPush = (
  tokens: string[],
  mensagem: { titulo: string; corpo: string; dados?: Record<string, unknown> },
) => Promise<void>

export async function enviarLembretesDeEntrada(
  repo: Repositorio, enviarPush: EnviarPush, agora: Date = new Date(),
): Promise<{ enviados: number }> {
  const hoje = diaBRT(agora)
  const candidatos = await repo.participacoesSemEntradaHoje(agora)

  let enviados = 0
  for (const p of candidatos) {
    if (!p.janelaEntradaFim) continue
    const fim = new Date(p.janelaEntradaFim).getTime()
    const faltamHoras = (fim - agora.getTime()) / 3_600_000
    if (faltamHoras < 0 || faltamHoras > ANTECEDENCIA_HORAS) continue

    if (await repo.jaEnviouLembreteHoje(p.participacaoId, TIPO, hoje)) continue

    const tokens = await repo.tokensDePush(p.pessoaId)
    if (!tokens.length) continue

    await enviarPush(tokens.map(t => t.token), {
      titulo: 'Falta bater a entrada',
      corpo: `${p.nome.split(' ')[0]}, o prazo de hoje está chegando. Abra a credencial e mostre o QR no credenciamento.`,
      dados: { tipo: TIPO, participacaoId: p.participacaoId },
    })
    await repo.registrarLembreteEnviado(p.participacaoId, TIPO, hoje)
    enviados++
  }

  return { enviados }
}
