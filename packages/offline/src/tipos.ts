// O vocabulário da fila offline.
//
// ─── A DISTINÇÃO QUE SUSTENTA TUDO ──────────────────────────────────────────
//
// O servidor DIZER NÃO é diferente do servidor NÃO RESPONDER.
//
//   resposta com erro   é uma decisão: fora da janela, cadastro inativo, dia
//                       não marcado. Insistir não muda nada — a fila descarta
//                       e explica para a pessoa.
//
//   nenhuma resposta    é transporte: a rede caiu, o pedido não chegou. Aí
//                       guardar e tentar de novo é exatamente o certo.
//
// Confundir os dois é como uma fila offline estraga: tratar recusa como falha
// de rede faz o aparelho reenviar para sempre algo que nunca vai passar; tratar
// falha de rede como recusa joga fora uma batida que a pessoa fez de verdade.
//
// Esta lição veio do sistema web, onde o mesmo erro apareceu na primeira
// versão da fila do meio.

/** As três etapas do dia. Igual ao domínio. */
export type TipoBatida = 'entrada' | 'meio' | 'fim'

export type EstadoBatida =
  /** Na fila, ainda não tentou ou vai tentar de novo. */
  | 'pendente'
  /** Tentativa em andamento neste instante. */
  | 'enviando'
  /** Confirmada pelo servidor. Fica um tempo para a pessoa ver, depois some. */
  | 'enviada'
  /** O servidor recusou por uma razão que reenviar não resolve. */
  | 'recusada'

export type BatidaPendente = {
  /**
   * Gerado no aparelho, antes de qualquer envio. É a CHAVE DE IDEMPOTÊNCIA:
   * o servidor guarda esse valor e recusa o segundo envio do mesmo.
   *
   * É o que torna reenviar seguro — e reenviar sem medo é o que faz uma fila
   * funcionar numa rede ruim.
   */
  id: string

  participacaoId: string
  tipo: TipoBatida

  /**
   * O relógio DO APARELHO no momento da batida.
   *
   * É este o horário que vale na folha de chamada, não o da chegada ao
   * servidor: uma batida que sobe três horas depois entraria no relatório com
   * hora errada, contra a pessoa, justo no dado que serve para pagar.
   *
   * A brecha é conhecida — o relógio do celular pode ser mexido. A defesa é
   * tornar isso visível, não impedir: o servidor grava também a hora em que
   * recebeu, e divergência grande aparece marcada para conferência.
   */
  registradoEm: string

  /** Foto do meio, já comprimida. Ausente nas etapas de QR. */
  foto?: string
  lat?: number
  lng?: number

  estado: EstadoBatida
  /**
   * Quando o servidor confirmou. Diferente de `registradoEm`: uma batida feita
   * às 14:00 e enviada às 17:00 tem os dois horários distantes, e é o de ENVIO
   * que decide quando ela pode sumir da tela.
   */
  enviadaEm?: string
  tentativas: number
  /** Antes deste instante, não tentar de novo. É o recuo progressivo. */
  proximaTentativaEm?: string
  /** Por que foi recusada. Texto para a pessoa ler, não código de erro. */
  motivo?: string
}

/**
 * O que o servidor respondeu.
 *
 * `duplicada` é SUCESSO: significa que o envio anterior chegou e só a resposta
 * se perdeu. Tratar como erro faria a pessoa ver "você já registrou" e achar
 * que falhou.
 */
export type ResultadoEnvio =
  | { ok: true; duplicada?: boolean }
  /** O servidor decidiu não. Reenviar não muda. */
  | { ok: false; definitivo: true; motivo: string }
  /** Não chegou resposta. Vale tentar de novo. */
  | { ok: false; definitivo: false }

/** Como a batida chega ao servidor. Injetado para poder testar sem rede. */
export type Transporte = (batida: BatidaPendente) => Promise<ResultadoEnvio>

/**
 * Onde a fila persiste.
 *
 * Uma interface, e não uma escolha fixa, porque cada lugar guarda de um jeito:
 * SQLite no celular, localStorage no navegador, memória nos testes. A fila não
 * precisa saber qual é.
 */
export type Armazem = {
  ler(): Promise<string | null>
  gravar(conteudo: string): Promise<void>
}

/** Um relógio injetável — sem isso não dá para testar recuo sem esperar de verdade. */
export type Relogio = () => number
