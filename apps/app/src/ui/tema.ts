// O sistema visual — o MESMO do Credenciei que já está no ar: o tema "Arena".
//
// ─── DE ONDE ISTO VEIO ──────────────────────────────────────────────────────
//
// Não foi inventado aqui. Cada valor abaixo é a cópia do que está em
// `c:\Dev\credenciei\app\globals.css`, o sistema em produção. O app precisa
// parecer o mesmo produto: quem usa o painel no computador e o app no celular
// tem que reconhecer que são a mesma coisa.
//
// Isso é cópia por VALOR, não por referência — o arquivo de produção não é
// importado, e não pode ser. Quando a marca mudar lá, alguém muda aqui. É o
// preço de manter os dois repositórios separados, e está escrito para não
// virar surpresa.
//
// ─── O REBRANDING "ARENA" (portado em 11/09/2026) ───────────────────────────
//
// O site trocou de identidade: roxo → laranja (#FF4A0F), fundo quase-preto
// como PADRÃO (o claro virou a opção), fonte Inter → Archivo, cantos mais
// arredondados. O app traz os dois temas — claro continua sendo o padrão
// AQUI (decisão distinta da do site, ver `docs/decisoes/`), mas os dois usam
// a marca nova.
//
// Simplificação deliberada: os painéis "de vidro" do site (gradiente sutil +
// blur) viram superfície de cor sólida aqui — React Native não tem uma
// tradução direta e barata para isso, e a MESMA cor sólida que o site usa por
// baixo do vidro (`--vidro-solido`) já entrega o essencial: superfície um tom
// acima do fundo, com borda de 1px. Ver `docs/decisoes/`.
//
// `gradienteMarca`, `eventoAoVivo` e `corDaEtapa` ficam FORA do par claro/escuro
// de propósito: no site eles já são os blocos que continuam escuros mesmo no
// tema claro ("os únicos blocos escuros da tela", diz o comentário de lá) —
// então aqui eles têm um valor só, que não muda com o toggle.

// ─── Os dois temas ──────────────────────────────────────────────────────────

export type Modo = 'claro' | 'escuro'

type Cor = {
  fundo: string
  neutro0: string; neutro25: string; neutro50: string; neutro100: string
  neutro200: string; neutro300: string; neutro400: string; neutro500: string
  neutro600: string; neutro700: string; neutro800: string; neutro900: string; neutro950: string
  acento50: string; acento100: string; acento200: string
  acento500: string; acento600: string; acento700: string
  marca: string
  sucesso50: string; sucesso200: string; sucesso600: string; sucesso700: string
  aviso50: string; aviso200: string; aviso600: string; aviso700: string
  erro50: string; erro200: string; erro600: string; erro700: string
  info50: string; info200: string; info600: string; info700: string
  /** Sempre branco — texto sobre botão colorido, nos dois temas. */
  sobreEscuro: string
  /** O fundo da tela de entrar, que é sempre escura — ver `entrar.tsx`. */
  fundoEscuro: string
  /** O rótulo do indicador (KPI), por tom — muda de tonalidade entre os temas. */
  rotuloIndicador: Record<TomDeIndicador, string>
}

type Uso = {
  superficie: string
  superficieFraca: string
  borda: string
  bordaForte: string
  tinta: string
  tintaMedia: string
  tintaFraca: string
  desabilitado: string
}

type Sombra = { xs: { boxShadow: string }; sm: { boxShadow: string }; lg: { boxShadow: string } }

const CLARO: { cor: Cor; uso: Uso; sombra: Sombra } = {
  cor: {
    fundo: '#f3f2f2',
    neutro0: '#ffffff',
    neutro25: '#fbfafa',
    neutro50: 'rgba(32, 30, 29, 0.04)',
    neutro100: 'rgba(32, 30, 29, 0.07)',
    neutro200: 'rgba(32, 30, 29, 0.12)',
    neutro300: 'rgba(32, 30, 29, 0.20)',
    neutro400: 'rgba(32, 30, 29, 0.45)',
    neutro500: 'rgba(32, 30, 29, 0.60)',
    neutro600: 'rgba(32, 30, 29, 0.72)',
    neutro700: 'rgba(32, 30, 29, 0.85)',
    neutro800: '#201e1d',
    neutro900: '#111010',
    neutro950: '#000000',

    acento50: 'rgba(255, 74, 15, 0.10)',
    acento100: 'rgba(255, 74, 15, 0.16)',
    acento200: 'rgba(255, 74, 15, 0.35)',
    acento500: '#FF4A0F',
    acento600: '#E33C06',
    /** Mais fechado que no escuro — texto laranja precisa de mais contraste sobre branco. */
    acento700: '#7c1405',
    marca: '#FF4A0F',

    sucesso50: 'rgba(34, 197, 94, 0.12)',
    sucesso200: 'rgba(34, 197, 94, 0.35)',
    sucesso600: '#16a34a',
    sucesso700: '#15803d',

    aviso50: 'rgba(245, 158, 11, 0.12)',
    aviso200: 'rgba(245, 158, 11, 0.35)',
    aviso600: '#d97706',
    aviso700: '#b45309',

    erro50: 'rgba(239, 68, 68, 0.12)',
    erro200: 'rgba(239, 68, 68, 0.35)',
    erro600: '#dc2626',
    erro700: '#b91c1c',

    info50: 'rgba(59, 130, 246, 0.12)',
    info200: 'rgba(59, 130, 246, 0.35)',
    info600: '#2563eb',
    info700: '#1d4ed8',

    sobreEscuro: '#ffffff',
    fundoEscuro: '#0d0c0c',
    rotuloIndicador: {
      neutro: '#DD2B0F', acento: '#DD2B0F', sucesso: '#15803d',
      aviso: '#b45309', info: '#1d4ed8', erro: '#b91c1c',
    },
  },
  uso: {
    superficie: '#ffffff',
    superficieFraca: 'rgba(32, 30, 29, 0.04)',
    borda: 'rgba(32, 30, 29, 0.12)',
    bordaForte: 'rgba(32, 30, 29, 0.20)',
    tinta: '#201e1d',
    tintaMedia: 'rgba(32, 30, 29, 0.60)',
    tintaFraca: 'rgba(32, 30, 29, 0.45)',
    desabilitado: 'rgba(32, 30, 29, 0.20)',
  },
  sombra: {
    xs: { boxShadow: '0 1px 2px rgba(32, 30, 29, 0.05)' },
    sm: { boxShadow: '0 1px 3px rgba(32, 30, 29, 0.08)' },
    lg: { boxShadow: '0 12px 32px rgba(32, 30, 29, 0.14)' },
  },
}

const ESCURO: { cor: Cor; uso: Uso; sombra: Sombra } = {
  cor: {
    fundo: '#0d0c0c',
    neutro0: '#0d0c0c',
    neutro25: '#111010',
    neutro50: 'rgba(255, 255, 255, 0.04)',
    neutro100: 'rgba(255, 255, 255, 0.07)',
    neutro200: 'rgba(255, 255, 255, 0.10)',
    neutro300: 'rgba(255, 255, 255, 0.18)',
    neutro400: 'rgba(243, 242, 242, 0.45)',
    neutro500: 'rgba(243, 242, 242, 0.60)',
    neutro600: 'rgba(243, 242, 242, 0.72)',
    neutro700: 'rgba(243, 242, 242, 0.85)',
    neutro800: '#f3f2f2',
    neutro900: '#ffffff',
    neutro950: '#ffffff',

    acento50: 'rgba(255, 74, 15, 0.10)',
    acento100: 'rgba(255, 74, 15, 0.16)',
    acento200: 'rgba(255, 74, 15, 0.35)',
    acento500: '#FF4A0F',
    acento600: '#E33C06',
    acento700: '#A31B05',
    marca: '#FF4A0F',

    sucesso50: 'rgba(34, 197, 94, 0.12)',
    sucesso200: 'rgba(34, 197, 94, 0.35)',
    sucesso600: '#22c55e',
    sucesso700: '#7ee2a8',

    aviso50: 'rgba(245, 158, 11, 0.12)',
    aviso200: 'rgba(245, 158, 11, 0.35)',
    aviso600: '#f59e0b',
    aviso700: '#fcd27a',

    erro50: 'rgba(239, 68, 68, 0.12)',
    erro200: 'rgba(239, 68, 68, 0.35)',
    erro600: '#f05252',
    erro700: '#fca5a5',

    info50: 'rgba(59, 130, 246, 0.12)',
    info200: 'rgba(59, 130, 246, 0.35)',
    info600: '#60a5fa',
    info700: '#93c5fd',

    sobreEscuro: '#ffffff',
    fundoEscuro: '#0d0c0c',
    rotuloIndicador: {
      neutro: '#E8541A', acento: '#E8541A', sucesso: '#4ade80',
      aviso: '#fbbf24', info: '#60a5fa', erro: '#f87171',
    },
  },
  uso: {
    superficie: '#161515',
    superficieFraca: 'rgba(255, 255, 255, 0.04)',
    borda: 'rgba(255, 255, 255, 0.10)',
    bordaForte: 'rgba(255, 255, 255, 0.18)',
    tinta: '#f3f2f2',
    tintaMedia: 'rgba(243, 242, 242, 0.60)',
    tintaFraca: 'rgba(243, 242, 242, 0.45)',
    desabilitado: 'rgba(255, 255, 255, 0.18)',
  },
  sombra: {
    xs: { boxShadow: '0 1px 3px rgba(0, 0, 0, 0.35)' },
    sm: { boxShadow: '0 2px 6px rgba(0, 0, 0, 0.35)' },
    lg: { boxShadow: '0 12px 32px rgba(0, 0, 0, 0.45)' },
  },
}

export const PALETAS: Record<Modo, { cor: Cor; uso: Uso; sombra: Sombra }> = { claro: CLARO, escuro: ESCURO }

/** Fallback pré-hidratação e valor de quem não passa por dentro do provedor. */
export const cor = CLARO.cor
export const uso = CLARO.uso
export const sombra = CLARO.sombra

/**
 * O indicador (KPI) NÃO é um bloco de cor sólida — era a leitura errada da
 * primeira versão deste arquivo, corrigida em 12/09/2026 ao reconferir contra
 * o `.indicador` de verdade em `globals.css`. O cartão é a MESMA superfície
 * neutra do resto do tema (`uso.superficie`/`uso.borda`); a cor do tom aparece
 * só em três lugares: o fio de luz de 2px no topo, o círculo do ícone (12% de
 * opacidade) e o rótulo em maiúsculas. O número continua com `uso.tinta` —
 * quase preto no claro, quase branco no escuro — porque o número é o
 * conteúdo, e cor nele lê pior.
 *
 * `neutro` não existe como tom próprio no site: a classe `.indicador` sem
 * modificador cai nos valores padrão da regra base, que são os MESMOS do
 * `acento` — por isso os dois apontam para a mesma cor aqui.
 *
 * O rótulo muda de tom entre claro e escuro (mais escuro no claro, para
 * contraste em cima de branco) — por isso mora nas duas paletas, não aqui.
 */
export const corDoIndicador: Record<TomDeIndicador, string> = {
  neutro: '#FF4A0F',
  acento: '#FF4A0F',
  info: '#3b82f6',
  sucesso: '#22c55e',
  aviso: '#f59e0b',
  erro: '#ef4444',
}

export type TomDeIndicador = 'neutro' | 'acento' | 'info' | 'sucesso' | 'aviso' | 'erro'

/**
 * A cor de cada etapa do dia, igual à dos gráficos do sistema web.
 *
 * Verde, azul e âmbar — e NÃO verde-amarelo-vermelho: as três etapas não são
 * bom, mais ou menos e ruim. São momentos diferentes do mesmo dia, e pintar de
 * semáforo faria a saída parecer um problema. Fora do par claro/escuro pela
 * mesma razão de `corDoIndicador`: é a mesma cor nos dois temas.
 */
export const corDaEtapa = {
  entrada: '#22c55e',
  meio: '#60a5fa',
  fim: '#f59e0b',
} as const

/**
 * O gradiente da marca — `--gradiente-marca`/`--brilho-marca` no site,
 * usado no botão primário (`.btn-primario`) e em outros poucos lugares de
 * destaque máximo. Fora do par claro/escuro pela mesma razão de
 * `corDoIndicador`: é o mesmo gradiente nos dois temas.
 *
 * `inicio`/`fim` viram `start`/`end` do `LinearGradient` (`expo-linear-
 * gradient`) — 135deg no CSS não tem tradução direta em pontos, canto a
 * canto (0,0)→(1,1) é a aproximação mais próxima.
 */
export const gradienteMarca = {
  cores: ['#A31B05', '#FF4A0F', '#FF8A4C'],
  posicoes: [0, 0.6, 1],
  inicio: { x: 0, y: 0 },
  fim: { x: 1, y: 1 },
  sombra: {
    shadowColor: '#FF4A0F', shadowOpacity: 0.45, shadowRadius: 14, shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
} as const

/**
 * O cartão do evento que está acontecendo agora.
 *
 * Escuro e grande de propósito, nos dois temas: é a única coisa da tela que
 * exige ação NESTE momento, e precisa disputar atenção com quatro indicadores
 * coloridos logo acima. Valores copiados de `.evento-vivo` e da luz de fundo
 * `--fundo-luz` do tema escuro (a versão mais forte — é a que combina com um
 * cartão que já nasce escuro).
 */
export const eventoAoVivo = {
  degrade: ['#2a1810', '#1c120c', '#120b08'],
  posicoes: [0, 0.55, 1],
  borda: 'rgba(255, 74, 15, 0.35)',
  brilho: 'rgba(255, 74, 15, 0.18)',
  sombra: { boxShadow: '0 8px 24px rgba(20, 10, 4, 0.35)' },
  /*
   * Laranja, não verde — corrigido em 13/09/2026 ao reconferir contra
   * `.evento-vivo-selo`/`.ponto-vivo` de verdade: os valores antigos
   * (#7ee2a8/#22c55e) eram os do tom "sucesso" do tema escuro, cola errada de
   * quando este bloco foi escrito. `vivo` é `--laranja-claro`, `ponto` é
   * `--laranja` — as duas variáveis reais do `globals.css`.
   */
  vivo: '#FF8A4C',
  ponto: '#FF4A0F',
  texto: 'rgba(255,255,255,0.60)',
  textoFraco: 'rgba(255,255,255,0.45)',
} as const

// ─── Tipografia ─────────────────────────────────────────────────────────────

/**
 * Archivo, a mesma do sistema web — trazida no rebranding "Arena".
 *
 * No celular o `fontWeight` é ignorado quando a fonte vem de arquivo: cada peso
 * é uma família própria. Por isso o peso está no nome. `extra` (800) é o peso
 * que dá a cara de painel de arena — sem ele Archivo vira só mais uma
 * grotesca, e por isso os títulos e os números grandes usam ele.
 */
export const tipo = {
  regular: 'Archivo_400Regular',
  media: 'Archivo_500Medium',
  semi: 'Archivo_600SemiBold',
  forte: 'Archivo_700Bold',
  extra: 'Archivo_800ExtraBold',
} as const

/**
 * A escala, igual à do sistema web — inclusive o corpo miúdo.
 *
 * Treze é menor do que se costuma usar em aplicativo, e é de propósito: esta é
 * uma interface de painel, densa, onde cabe muita linha na tela. O que sobe de
 * tamanho é o NÚMERO, que é o conteúdo de verdade.
 *
 * Sem letterSpacing manual: Archivo não pede a compensação que Inter pedia —
 * inventar um valor de tracking sem ver a fonte lado a lado com o site seria
 * "não invente", e aqui não tem de onde copiar por valor (o site não declara
 * tracking manual para o corpo do texto).
 */
export const texto = {
  metrica: { fontSize: 36, lineHeight: 40, fontFamily: tipo.extra },
  tituloTela: { fontSize: 22, lineHeight: 28, fontFamily: tipo.extra },
  xl: { fontSize: 18, lineHeight: 26, fontFamily: tipo.semi },
  tituloCartao: { fontSize: 16, lineHeight: 24, fontFamily: tipo.forte },
  base: { fontSize: 14, lineHeight: 22, fontFamily: tipo.regular },
  corpo: { fontSize: 13, lineHeight: 20, fontFamily: tipo.regular },
  corpoForte: { fontSize: 13, lineHeight: 20, fontFamily: tipo.semi },
  xs: { fontSize: 12, lineHeight: 18, fontFamily: tipo.media },
  xxs: { fontSize: 11, lineHeight: 16, fontFamily: tipo.media },
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
 * 6/8/10/12/16/20 — os mesmos do site, no rebranding "Arena" (era 4–14).
 *
 * O cartão é claramente mais arredondado que o controle que mora dentro dele.
 * Tudo com o mesmo raio é a assinatura de interface montada às pressas.
 */
export const raio = {
  selo: 6,
  campoPequeno: 8,
  campo: 10,
  peca: 12,
  cartao: 16,
  folha: 20,
  pilula: 999,
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
  cor, uso, corDoIndicador, corDaEtapa, gradienteMarca, eventoAoVivo, tipo, texto, espaco, raio,
  sombra, ALVO_MINIMO, LARGURA_MAXIMA,
}
