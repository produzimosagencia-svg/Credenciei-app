// O sistema visual — o MESMO do Credenciei que já está no ar.
//
// ─── DE ONDE ISTO VEIO ──────────────────────────────────────────────────────
//
// Não foi inventado aqui. Cada valor abaixo é a cópia do que está em
// `c:\Dev\credenciei\app\globals.css`, o sistema em produção. O app precisa
// parecer o mesmo produto: quem usa o painel no computador e o app no celular
// tem que reconhecer que são a mesma coisa.
//
// Isso é cópia por VALOR, não por referência — o arquivo de produção não é
// importado, e não pode ser. Quando o roxo mudar lá, alguém muda aqui. É o
// preço de manter os dois repositórios separados, e está escrito para não
// virar surpresa.
//
// ─── O QUE ESTE SISTEMA DECIDE, E QUE É DIFERENTE DO ÓBVIO ──────────────────
//
//   a separação vem da BORDA, não da sombra. A sombra existe, mas é quase
//   imperceptível — um fio de 1px separa melhor e não suja o canto;
//
//   o fundo é cinza de verdade (#d9dce3), não quase-branco. Com fundo
//   quase-branco o cartão branco não tem de onde se destacar;
//
//   o número do indicador é branco sobre gradiente escuro. Os tons foram
//   escolhidos pelo CONTRASTE: laranja-600 dá 3.5:1 com texto branco de 12px e
//   some no sol — por isso o laranja aqui é #c2410c, que dá 4.6:1.

// ─── Cor ────────────────────────────────────────────────────────────────────

export const cor = {
  /** O fundo da aplicação. Cinza de verdade: é o que faz o cartão branco subir. */
  fundo: '#d9dce3',

  neutro0: '#ffffff',
  neutro25: '#fcfcfd',
  neutro50: '#f7f7f8',
  neutro100: '#eeeef0',
  neutro200: '#e4e4e8',
  neutro300: '#d0d0d8',
  neutro400: '#9394a1',
  neutro500: '#60646c',
  neutro600: '#4a4e56',
  neutro700: '#33373d',
  neutro800: '#1f2124',
  neutro900: '#111113',
  neutro950: '#08080a',

  /** O roxo. É acento e é marca — uma cor só, em vez de duas brigando. */
  acento50: '#f4f2ff',
  acento100: '#ebe7fe',
  acento200: '#ded5fd',
  acento500: '#6d46ff',
  acento600: '#5c33ee',
  acento700: '#4b27d0',
  /** O roxo do ícone do app. */
  marca: '#4940df',

  sucesso50: '#f0fdf4',
  sucesso200: '#bbf7d0',
  sucesso600: '#16a34a',
  sucesso700: '#15803d',

  aviso50: '#fffbeb',
  aviso200: '#fde68a',
  aviso600: '#d97706',
  aviso700: '#b45309',

  erro50: '#fef2f2',
  erro200: '#fecaca',
  erro600: '#dc2626',
  erro700: '#b91c1c',

  /** Azul não é status: é o "neutro com cor", para o que só conta coisa. */
  info50: '#eff6ff',
  info200: '#bfdbfe',
  info600: '#2563eb',
  info700: '#1d4ed8',

  sobreEscuro: '#ffffff',
  /** O fundo da tela de entrar do sistema web. Quase-preto arroxeado. */
  fundoEscuro: '#0a0918',
} as const

/** Apelidos por função, para a tela dizer o que quer e não que tom de cinza. */
export const uso = {
  superficie: cor.neutro0,
  superficieFraca: cor.neutro50,
  borda: cor.neutro200,
  bordaForte: cor.neutro300,
  tinta: cor.neutro800,
  tintaMedia: cor.neutro500,
  tintaFraca: cor.neutro400,
  desabilitado: cor.neutro300,
} as const

/**
 * Os degradês dos indicadores, copiados um a um.
 *
 * Cada par é `[de, até]` num degradê de 135°. Os tons são escuros de propósito:
 * o rótulo branco de 12px precisa de 4.5:1 para ser lido no sol do evento, e é
 * onde esta tela é usada.
 */
export const gradiente = {
  neutro: [cor.neutro700, cor.neutro900],
  acento: ['#6d46ff', '#4b27d0'],
  info: ['#2563eb', '#1e3a8a'],
  sucesso: ['#15803d', '#14532d'],
  aviso: ['#c2410c', '#7c2d12'],
  erro: ['#c81e1e', '#7f1d1d'],
} as const

export type TomDeIndicador = keyof typeof gradiente

/**
 * O cartão do evento que está acontecendo agora.
 *
 * Escuro e grande de propósito: é a única coisa da tela que exige ação NESTE
 * momento, e precisa disputar atenção com quatro indicadores coloridos logo
 * acima. Valores copiados de `.evento-vivo`.
 */
export const eventoAoVivo = {
  degrade: ['#2c2456', '#1b1830', '#131120'],
  posicoes: [0, 0.55, 1],
  borda: '#3a3168',
  brilho: 'rgba(139, 109, 255, 0.16)',
  sombra: { boxShadow: '0 8px 24px rgba(28, 20, 64, 0.24)' },
  /** Verde claro, para o rótulo "AO VIVO" ser legível sobre o roxo escuro. */
  vivo: '#7ee2a8',
  ponto: '#22c55e',
  barra: ['#22c55e', '#16a34a'],
  trilho: 'rgba(255,255,255,0.12)',
  texto: 'rgba(255,255,255,0.60)',
  textoFraco: 'rgba(255,255,255,0.45)',
} as const

// ─── Tipografia ─────────────────────────────────────────────────────────────

/**
 * Inter, a mesma do sistema web.
 *
 * No celular o `fontWeight` é ignorado quando a fonte vem de arquivo: cada peso
 * é uma família própria. Por isso o peso está no nome.
 *
 * O que NÃO vem junto: `cv11` e `ss03`, os ajustes de desenho da letra que o
 * site aplica (o "a" de cauda reta, a cedilha e o til melhores em português).
 * Eles dependem de recursos OpenType que a fonte estática do celular não expõe.
 * A diferença é sutil e só aparece lado a lado.
 */
export const tipo = {
  regular: 'Inter_400Regular',
  media: 'Inter_500Medium',
  semi: 'Inter_600SemiBold',
  forte: 'Inter_700Bold',
} as const

/**
 * A escala, igual à do sistema web — inclusive o corpo de 13px.
 *
 * Treze é menor do que se costuma usar em aplicativo, e é de propósito: esta é
 * uma interface de painel, densa, onde cabe muita linha na tela. O que sobe de
 * tamanho é o NÚMERO, que é o conteúdo de verdade.
 *
 * O espaçamento negativo entre letras não é enfeite: em Inter, texto grande sem
 * isso fica frouxo. É o detalhe mais visível em Linear e Vercel.
 */
export const texto = {
  metrica: { fontSize: 28, lineHeight: 32, letterSpacing: -0.56, fontFamily: tipo.forte },
  tituloTela: { fontSize: 22, lineHeight: 28, letterSpacing: -0.46, fontFamily: tipo.forte },
  xl: { fontSize: 18, lineHeight: 26, letterSpacing: -0.38, fontFamily: tipo.semi },
  tituloCartao: { fontSize: 16, lineHeight: 24, letterSpacing: -0.34, fontFamily: tipo.semi },
  base: { fontSize: 14, lineHeight: 22, letterSpacing: -0.15, fontFamily: tipo.regular },
  corpo: { fontSize: 13, lineHeight: 20, letterSpacing: -0.14, fontFamily: tipo.regular },
  corpoForte: { fontSize: 13, lineHeight: 20, letterSpacing: -0.14, fontFamily: tipo.semi },
  xs: { fontSize: 12, lineHeight: 18, letterSpacing: -0.13, fontFamily: tipo.media },
  xxs: { fontSize: 11, lineHeight: 16, letterSpacing: 0, fontFamily: tipo.media },
  /** Etiqueta de grupo do menu: maiúscula, pequena, espaçada. */
  etiqueta: { fontSize: 11, lineHeight: 16, letterSpacing: 0.6, fontFamily: tipo.semi },
} as const

// ─── Espaço e forma ─────────────────────────────────────────────────────────

export const espaco = {
  xs: 4,
  s: 8,
  m: 12,
  g: 16,
  gg: 24,
  ggg: 32,
  gggg: 48,
} as const

/**
 * 4/6/8/10/12/14 — os mesmos do site.
 *
 * O cartão é claramente mais arredondado que o controle que mora dentro dele.
 * Tudo com o mesmo raio é a assinatura de interface montada às pressas.
 */
export const raio = {
  selo: 4,
  campoPequeno: 6,
  campo: 8,
  peca: 10,
  cartao: 12,
  folha: 14,
  pilula: 999,
} as const

/**
 * Sombra quase imperceptível, como no site: uma camada só.
 *
 * Ela não é o que separa as superfícies — quem faz isso é a borda de 1px. A
 * sombra só tira o cartão de cima do fundo.
 */
export const sombra = {
  /*
   * Escritas como `boxShadow`, no formato do CSS — os mesmos valores do
   * `--shadow-*` de produção, sem tradução no meio. As propriedades antigas
   * (`shadowColor`, `shadowOpacity`…) estão descontinuadas no React Native
   * atual e avisam no console a cada tela.
   */
  xs: { boxShadow: '0 1px 2px rgba(17, 17, 19, 0.04)' },
  sm: { boxShadow: '0 1px 2px rgba(17, 17, 19, 0.05)' },
  lg: { boxShadow: '0 4px 12px rgba(17, 17, 19, 0.08)' },
} as const

/**
 * A altura mínima de qualquer coisa em que se toca.
 *
 * O site usa controles de 36–40px, que é medida de mouse. No celular o dedo
 * pede 48 — e aqui pede 52, porque quem toca está em pé, com pressa, às vezes
 * de luva. É a única medida em que o app se afasta do site de propósito.
 */
export const ALVO_MINIMO = 52

/**
 * A largura máxima do conteúdo.
 *
 * No celular não muda nada. No navegador é o que impede o app de virar um
 * formulário esticado de mil e quatrocentos pixels — o que estamos construindo
 * é um aplicativo, e a janela do navegador é só uma prévia dele.
 */
export const LARGURA_MAXIMA = 460

export const tema = {
  cor, uso, gradiente, eventoAoVivo, tipo, texto, espaco, raio, sombra,
  ALVO_MINIMO, LARGURA_MAXIMA,
}
