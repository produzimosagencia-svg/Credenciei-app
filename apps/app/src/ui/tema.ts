// As decisões visuais, num lugar só.
//
// ─── PARA QUEM ESTE APP É DESENHADO ─────────────────────────────────────────
//
// Não é para alguém sentado numa mesa. É para quem está em pé no portão de um
// estádio, com sol na tela, pressa, uma caixa na outra mão e — muitas vezes —
// um celular antigo com a tela riscada.
//
// Daí vêm quase todas as escolhas abaixo:
//
//   contraste alto      cinza claro sobre branco some no sol das 14h;
//   alvo grande         54px de altura é o dedo com pressa, não o mouse;
//   pouca cor           cor aqui é sinal, não enfeite — se tudo é colorido,
//                       o vermelho do problema deixa de ser visto;
//   texto curto         ninguém lê parágrafo em pé.

export const cor = {
  /** O fundo de tudo. Cinza levíssimo, para o cartão branco se destacar. */
  fundo: '#F3F4F6',
  superficie: '#FFFFFF',
  borda: '#E3E5E9',

  /** A cor da marca, e também a do botão principal. */
  marca: '#0B1F3A',
  marcaClara: '#1B3A63',

  tinta: '#111827',
  tintaMedia: '#4B5563',
  /** Só para o que é acessório. Nunca para informação que precisa ser lida. */
  tintaFraca: '#6B7280',
  sobreEscuro: '#FFFFFF',

  ok: '#0F7B3E',
  okFundo: '#E6F4EC',
  atencao: '#B54708',
  atencaoFundo: '#FEF3E2',
  erro: '#B42318',
  erroFundo: '#FDECEA',
  informacao: '#1B4E8F',
  informacaoFundo: '#E8F0FA',

  desabilitado: '#C7CBD3',
} as const

/** Escala de espaço. Múltiplos de 4 — o olho percebe o ritmo. */
export const espaco = {
  xs: 4,
  s: 8,
  m: 12,
  g: 16,
  gg: 24,
  ggg: 32,
} as const

export const raio = {
  s: 8,
  m: 12,
  g: 16,
} as const

export const fonte = {
  legenda: 13,
  corpo: 15,
  destaque: 17,
  titulo: 22,
  numero: 30,
} as const

/**
 * A altura mínima de qualquer coisa em que se toca.
 *
 * 54 e não 44 (o mínimo das plataformas) porque o dedo aqui está com pressa,
 * às vezes com luva, e um toque errado no botão de bater ponto custa uma
 * batida perdida.
 */
export const ALVO_MINIMO = 54

export const tema = { cor, espaco, raio, fonte, ALVO_MINIMO }
