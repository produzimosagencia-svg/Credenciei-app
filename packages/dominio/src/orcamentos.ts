// Orçamentos — a proposta comercial que a agência manda pro cliente.
//
// Cópia por VALOR de `lib/orcamentos-constantes.ts` e da conta que mora em
// `lib/orcamentos.ts` (`orcamentoPorId`) do sistema web. Ver
// `docs/decisoes/007-sincronizar-com-o-sistema-web.md`: quando a regra mudar
// lá, alguém muda aqui.
//
// ─── O TOTAL É SEMPRE RECALCULADO ───────────────────────────────────────────
//
// A tabela tem uma coluna `valor_total`, gravada no último save, e o site
// avisa no próprio comentário para NUNCA confiar nela: um orçamento editado
// por fora, ou salvo por uma versão antiga do código, fica com a coluna
// mentindo. A conta abaixo é a verdade, e roda toda vez que alguém abre.
//
// ─── O QUE MULTIPLICA POR DIA, E O QUE NÃO ──────────────────────────────────
//
// Valor do dia, por funcionário e do técnico são DIÁRIOS: multiplicam pelos
// dias do evento. Os itens adicionais não — são avulsos, entram uma vez só.
// Confundir os dois é a diferença entre cobrar um projetor uma vez e cobrar
// por três dias de evento.

export type StatusOrcamento = 'rascunho' | 'gerado' | 'enviado' | 'aprovado' | 'recusado'

export const STATUS_ORCAMENTO: StatusOrcamento[] = [
  'rascunho', 'gerado', 'enviado', 'aprovado', 'recusado',
]

export const ROTULO_STATUS_ORCAMENTO: Record<StatusOrcamento, string> = {
  rascunho: 'Rascunho',
  gerado: 'Gerado',
  enviado: 'Enviado',
  aprovado: 'Aprovado',
  recusado: 'Recusado',
}

/** O tom do selo de cada status — equivalente ao `TOM_STATUS` do site. */
export const TOM_STATUS_ORCAMENTO: Record<StatusOrcamento, 'info' | 'aviso' | 'sucesso' | 'erro'> = {
  rascunho: 'info',
  gerado: 'info',
  enviado: 'aviso',
  aprovado: 'sucesso',
  recusado: 'erro',
}

/** Status desconhecido vira rascunho, nunca quebra a tela. */
export function statusDeOrcamentoValido(bruto: string | null | undefined): StatusOrcamento {
  return STATUS_ORCAMENTO.includes(bruto as StatusOrcamento)
    ? (bruto as StatusOrcamento)
    : 'rascunho'
}

/** "#000001" — nunca digitado, só exibido. */
export function numeroDoOrcamento(n: number): string {
  return `#${String(n).padStart(6, '0')}`
}

/** A forma mínima que a conta precisa — não o tipo inteiro do contrato. */
export type OrcamentoParaCalculo = {
  valorDia: number
  valorFuncionario: number
  valorTecnico: number
  dias: number
  desconto: number
  itens: { valor: number }[]
}

/**
 * O subtotal: as três diárias multiplicadas pelos dias, mais os avulsos.
 *
 * Separado do total porque a tela mostra os dois, e porque é aqui que mora a
 * distinção entre o que multiplica e o que não.
 */
export function subtotalDoOrcamento(o: OrcamentoParaCalculo): number {
  const dias = Math.max(1, o.dias || 1)
  const diarias = (o.valorDia + o.valorFuncionario + o.valorTecnico) * dias
  const avulsos = o.itens.reduce((soma, i) => soma + i.valor, 0)
  return diarias + avulsos
}

/**
 * O total: subtotal menos desconto, **nunca negativo**.
 *
 * O piso em zero é do site, e não é detalhe de exibição: um desconto digitado
 * maior que o orçamento viraria um valor negativo gravado no banco e enviado
 * ao cliente num PDF.
 */
export function totalDoOrcamento(o: OrcamentoParaCalculo): number {
  return Math.max(0, subtotalDoOrcamento(o) - o.desconto)
}

/**
 * O desconto que pode ser GRAVADO: entre zero e o subtotal.
 *
 * O site apara na escrita, não só na exibição, e a diferença importa: sem
 * isso o banco guarda "desconto de R$ 99.999" num orçamento de R$ 1.302, e
 * qualquer tela que recalcule depois mostra um número diferente do que foi
 * enviado ao cliente. No limite, o desconto zera o orçamento — de graça é
 * possível, negativo não.
 */
export function descontoQuePodeSerGravado(bruto: number, subtotal: number): number {
  return Math.min(Math.max(0, bruto || 0), subtotal)
}
