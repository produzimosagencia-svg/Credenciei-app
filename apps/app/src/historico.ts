// A leitura do histórico de dias.
//
// Fora da tela porque é REGRA, não desenho: o que conta como dia trabalhado, o
// que conta como incompleto, e quando um aviso deve gritar. Isso dá para testar
// sem emulador — e é bom que dê, porque é o cálculo que a pessoa confere contra
// o próprio pagamento.

import type { DiaDaParticipacao } from '@credenciei/contrato'

export type StatusDoDia = 'presente' | 'ausente' | 'incompleto' | 'cancelado'

export const NOME_DO_STATUS: Record<StatusDoDia, string> = {
  presente: 'Presente',
  ausente: 'Ausente',
  incompleto: 'Incompleto',
  cancelado: 'Cancelado',
}

/**
 * O que aconteceu naquele dia, numa palavra.
 *
 * Não é campo novo: é a tradução de `entrada`, `meio` e `saida` para o rótulo
 * que se lê de relance no fechamento. Quem não bateu entrada não esteve lá;
 * quem bateu as três esteve o dia inteiro; o resto ficou pelo meio, e é
 * justamente esse resto que muda pagamento e precisa ser visto.
 *
 * Cancelado vem antes de tudo — o produtor desmarcou o expediente depois de
 * ele existir, e "ausente" soaria como falta de quem nunca teve dia nenhum
 * pra faltar. Mesma régua do site (`lib/historico.ts` → `StatusDoDia`).
 */
export function statusDoDia(dia: DiaDaParticipacao): StatusDoDia {
  if (dia.cancelado) return 'cancelado'
  if (!dia.entrada) return 'ausente'
  if (dia.entrada && dia.meio && dia.saida) return 'presente'
  return 'incompleto'
}

/**
 * A célula vazia deve ficar quieta?
 *
 * ─── A LIÇÃO QUE VEIO DO SISTEMA WEB EM 31/08/2026 ─────────────────────────
 *
 * O selo "NÃO REALIZADA" é forte de propósito — vermelho, negrito, caixa alta —
 * porque marca uma ANOMALIA: a pessoa esteve no posto e pulou uma etapa. Isso
 * muda pagamento e precisa saltar aos olhos.
 *
 * Só que num dia em que ela nem apareceu, a mesma célula se repetia três vezes
 * na linha — entrada, meio e saída, todas em vermelho — dizendo a MESMA coisa
 * que o selo "Ausente" já tinha dito uma vez. Onze linhas assim viravam uma
 * parede vermelha sem nenhuma informação nova.
 *
 * Dia inteiro ausente: traço quieto. Etapa pulada dentro de um dia trabalhado:
 * o aviso forte continua, porque ali ele diz algo que o selo do dia não disse.
 */
export function celulaSilenciosa(dia: DiaDaParticipacao): boolean {
  const status = statusDoDia(dia)
  return status === 'ausente' || status === 'cancelado'
}

export type ResumoDoHistorico = {
  /**
   * Quantos dias a pessoa tinha pra trabalhar — todos MENOS os cancelados.
   * Sem este número, "faltou 3" não diz nada: faltou de quantos? Mesma
   * régua do site (`lib/historico.ts` → `resumo.diasEscalados`).
   */
  diasEscalados: number
  diasTrabalhados: number
  diasFaltados: number
  diasIncompletos: number
  horasTotais: number
  /**
   * As batidas de cada etapa, contadas à parte.
   *
   * "Dias trabalhados" já dizia quantos dias tiveram ENTRADA — e escondia
   * quantos desses ficaram sem o meio ou sem a saída. São perguntas diferentes,
   * e a segunda é a que aparece na conferência do pagamento.
   */
  batidas: { entrada: number; meio: number; fim: number }
}

export function resumoDoHistorico(dias: DiaDaParticipacao[]): ResumoDoHistorico {
  // Dia cancelado não conta como escalado — o produtor desmarcou o
  // expediente, então ninguém faltou a ele. Mesma régua do site.
  const valem = dias.filter(d => !d.cancelado)

  let trabalhados = 0
  let faltados = 0
  let incompletos = 0
  let horas = 0
  const batidas = { entrada: 0, meio: 0, fim: 0 }

  for (const dia of valem) {
    if (dia.entrada) batidas.entrada += 1
    if (dia.meio) batidas.meio += 1
    if (dia.saida) batidas.fim += 1
    horas += dia.horas ?? 0

    const status = statusDoDia(dia)
    if (status === 'ausente') faltados += 1
    else {
      trabalhados += 1
      if (status === 'incompleto') incompletos += 1
    }
  }

  // Uma casa decimal: hora de evento não tem precisão de segundo, e "8.42h" na
  // tela do pagamento sugere uma exatidão que o dado não tem.
  return {
    diasEscalados: valem.length,
    diasTrabalhados: trabalhados,
    diasFaltados: faltados,
    diasIncompletos: incompletos,
    horasTotais: Math.round(horas * 10) / 10,
    batidas,
  }
}
