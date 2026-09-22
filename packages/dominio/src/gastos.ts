// O vocabulário e os cálculos do módulo Gastos — puro, sem I/O.
//
// Copiado de `c:\Dev\credenciei\lib\gastos-constantes.ts` e
// `c:\Dev\credenciei\lib\gastos.ts` (as partes de cálculo, não as que
// consultam o Supabase — essas ficam em `apps/api/src/dados/supabase.ts`).
// Fica no domínio porque API e app precisam da MESMA lista de categorias e
// do MESMO cálculo de KPI: se o painel do app somasse diferente do painel
// do site, o produtor veria dois totais diferentes pro mesmo evento.

export const CATEGORIAS_GASTO = [
  'Estrutura',
  'Funcionários',
  'Alimentação',
  'Transporte',
  'Hospedagem',
  'Comunicação',
  'Marketing',
  'Equipamentos',
  'Segurança',
  'Produção',
  'Fornecedores',
  'Outros',
] as const

export type CategoriaGasto = (typeof CATEGORIAS_GASTO)[number]

export const CATEGORIA_PADRAO: CategoriaGasto = 'Outros'

/** Normaliza o palpite da IA: só aceita se casar com a lista, senão null. */
export function categoriaValida(bruta: string | null | undefined): CategoriaGasto | null {
  if (!bruta) return null
  const achada = CATEGORIAS_GASTO.find(c => c.toLowerCase() === bruta.trim().toLowerCase())
  return achada ?? null
}

/**
 * Formas de pagamento — sugestão na tela, aceita texto livre. Mesma lógica
 * de `CATEGORIAS_GASTO`: a lista vive no código, não no banco.
 */
export const FORMAS_PAGAMENTO = [
  'Pix',
  'Cartão de crédito',
  'Cartão de débito',
  'Dinheiro',
  'Transferência',
  'Boleto',
  'A prazo',
] as const

/**
 * O "evento" que não é evento nenhum — gasto que não é do evento em si
 * (assinatura de ferramenta, despesa de escritório). Não é uma linha em
 * `eventos`, é `evento_id IS NULL` em `gastos_evento`, escopado por
 * `organizacao_id`.
 */
export const EVENTO_INTERNO = 'interno'

export type OrigemGasto = 'manual' | 'audio' | 'whatsapp'

export const ROTULO_ORIGEM: Record<OrigemGasto, string> = {
  manual: 'Manual',
  audio: 'Áudio',
  whatsapp: 'WhatsApp',
}

export type StatusGasto = 'confirmado' | 'rascunho'

export const ROTULO_STATUS: Record<StatusGasto, string> = {
  confirmado: 'Confirmado',
  rascunho: 'Rascunho',
}

// ─── KPIs e séries de gráfico ──────────────────────────────────────────────
//
// Tomam a FORMA mínima que precisam, não o tipo `Gasto` do contrato — o
// domínio não depende do contrato (é o contrário). Qualquer objeto com
// esses quatro campos serve.

export type GastoParaCalculo = {
  valor: number
  dataGasto: string
  categoria: string
  fornecedor: string | null
}

export type KpisGastos = {
  total: number
  quantidade: number
  maior: number
  medio: number
  hoje: number
  ultimos7: number
  mes: number
}

/** `YYYY-MM-DD` + n dias, em UTC (data pura não tem fuso). */
function somarDias(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Todos os 7 números do painel, de uma passada só na lista já carregada. */
export function kpisDeGastos(gastos: GastoParaCalculo[], hoje: string): KpisGastos {
  const total = gastos.reduce((s, g) => s + g.valor, 0)
  const seteDiasAtras = somarDias(hoje, -6)
  const mes = hoje.slice(0, 7)
  return {
    total,
    quantidade: gastos.length,
    maior: gastos.reduce((m, g) => Math.max(m, g.valor), 0),
    medio: gastos.length ? total / gastos.length : 0,
    hoje: gastos.filter(g => g.dataGasto === hoje).reduce((s, g) => s + g.valor, 0),
    ultimos7: gastos.filter(g => g.dataGasto >= seteDiasAtras && g.dataGasto <= hoje).reduce((s, g) => s + g.valor, 0),
    mes: gastos.filter(g => g.dataGasto.startsWith(mes)).reduce((s, g) => s + g.valor, 0),
  }
}

export type DadosGraficosGastos = {
  porCategoria: { categoria: string; total: number }[]
  porDia: { dia: string; total: number }[]
  porFornecedor: { fornecedor: string; total: number }[]
  acumulado: { dia: string; total: number }[]
}

export function dadosDosGraficosDeGastos(gastos: GastoParaCalculo[]): DadosGraficosGastos {
  const soma = <K extends string>(chave: (g: GastoParaCalculo) => K) => {
    const m = new Map<K, number>()
    for (const g of gastos) m.set(chave(g), (m.get(chave(g)) ?? 0) + g.valor)
    return m
  }

  const porCategoria = [...soma(g => g.categoria).entries()]
    .map(([categoria, total]) => ({ categoria, total }))
    .sort((a, b) => b.total - a.total)

  const porFornecedor = [...soma(g => g.fornecedor ?? '—').entries()]
    .map(([fornecedor, total]) => ({ fornecedor, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 8)

  const porDiaMap = soma(g => g.dataGasto)
  const diasOrdenados = [...porDiaMap.keys()].sort()
  const porDia = diasOrdenados.map(dia => ({ dia, total: porDiaMap.get(dia)! }))

  let corrida = 0
  const acumulado = porDia.map(({ dia, total }) => {
    corrida += total
    return { dia, total: corrida }
  })

  return { porCategoria, porDia, porFornecedor, acumulado }
}
