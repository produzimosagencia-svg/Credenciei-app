/*
 * O PDF é o produto final: o que chega no cliente da agência.
 *
 * Não dá para "olhar" um PDF num teste automatizado, e fingir que dá seria
 * pior que não testar. O que dá — e é o que pega erro de verdade — é: os
 * bytes são um PDF mesmo, o texto que está lá dentro é o certo, e a conta
 * impressa bate com a do domínio. Um PDF que gera sem erro e traz o valor
 * errado é exatamente o defeito que ninguém percebe até o cliente perceber.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { OrcamentoDetalhado } from '@credenciei/contrato'
import { brl, montarPdfDoOrcamento, nomeDoPdfDoOrcamento } from './orcamento-pdf.js'

const ORCAMENTO: OrcamentoDetalhado = {
  id: 'orc-1',
  numero: 7,
  nomeEvento: 'Fantástico Mundo do Lukão',
  responsavel: 'Lucas Andrade',
  telefone: '27999990000',
  dataEvento: '2026-11-14',
  valorDia: 1000,
  valorFuncionario: 2,
  valorTecnico: 300,
  dias: 3,
  desconto: 100,
  observacoes: 'Pagamento em duas parcelas.',
  status: 'gerado',
  itens: [{ id: 'it-1', descricao: 'Projetor', valor: 500 }],
  total: 4306,
  criadoEm: '2026-09-23T10:00:00-03:00',
}

/**
 * O texto que o PDF carrega, desembrulhado dos fluxos comprimidos.
 *
 * O jsPDF escreve o conteúdo em `Tj`/`TJ` dentro de streams `FlateDecode`, e
 * ler isso à mão exigiria um parser de PDF inteiro. Em vez disso o teste pede
 * o documento sem compressão e varre os operadores de texto — o suficiente
 * para afirmar "este número está impresso na página".
 */
function textoDoPdf(bytes: Buffer): string {
  const cru = bytes.toString('latin1')
  const pedacos: string[] = []
  // `(texto) Tj` e os pedaços de `[(a) -20 (b)] TJ` — o formato que o jsPDF usa.
  for (const m of cru.matchAll(/\(((?:\\.|[^\\()])*)\)\s*(?:Tj|TJ|')/g)) {
    pedacos.push((m[1] ?? '').replace(/\\([()\\])/g, '$1'))
  }
  for (const m of cru.matchAll(/\[((?:\\.|[^\]])*)\]\s*TJ/g)) {
    for (const t of (m[1] ?? '').matchAll(/\(((?:\\.|[^\\()])*)\)/g)) {
      pedacos.push((t[1] ?? '').replace(/\\([()\\])/g, '$1'))
    }
  }
  return pedacos.join('\n')
}

test('sai um PDF de verdade, não um arquivo vazio', () => {
  const bytes = montarPdfDoOrcamento(ORCAMENTO)
  // Todo PDF começa com `%PDF-` e termina com `%%EOF`.
  assert.equal(bytes.subarray(0, 5).toString('latin1'), '%PDF-')
  assert.match(bytes.subarray(-32).toString('latin1'), /%%EOF/)
  /*
   * A faixa prende os DOIS defeitos que já aconteceram.
   *
   * Piso: com as duas imagens da marca dentro, a proposta passa de 30KB — um
   * PDF de 4KB é o caso em que a logo sumiu e ninguém notou.
   *
   * Teto: sem `compression: 'FAST'` no `addImage`, o jsPDF embute o bitmap
   * cru e o mesmo documento vai a 2,4 MB. Passou meses assim no site antes de
   * alguém medir — este teto é pra ninguém precisar medir de novo.
   */
  assert.ok(bytes.length > 30_000, `PDF pequeno demais: ${bytes.length} bytes — a logo sumiu?`)
  assert.ok(bytes.length < 300_000, `PDF grande demais: ${bytes.length} bytes — perdeu a compressão?`)
})

test('o cabeçalho, o cliente e as observações estão impressos', () => {
  const texto = textoDoPdf(montarPdfDoOrcamento(ORCAMENTO))
  assert.match(texto, /ORÇAMENTO/)
  assert.match(texto, /#000007/)
  assert.match(texto, /Fantástico Mundo do Lukão/)
  assert.match(texto, /Lucas Andrade/)
  assert.match(texto, /14\/11\/2026/)
  assert.match(texto, /Pagamento em duas parcelas/)
})

test('as diárias saem multiplicadas pelos dias, e o item avulso não', () => {
  /*
   * A regra inteira do módulo, vista de onde ela importa: a linha impressa.
   * Se um dia alguém "simplificar" o cálculo, é aqui que aparece — cobrando
   * três projetores de um cliente que pediu um.
   */
  const texto = textoDoPdf(montarPdfDoOrcamento(ORCAMENTO))
  assert.match(texto, /Valor do dia \(3 dias\)/)
  assert.match(texto, new RegExp(escapar(brl(3000))))   // 1000 × 3
  assert.match(texto, new RegExp(escapar(brl(900))))    // 300 × 3
  assert.match(texto, /Projetor/)
  assert.match(texto, new RegExp(escapar(brl(500))))    // o projetor, UMA vez
})

test('o desconto sai com hífen comum, nunca com o sinal tipográfico', () => {
  // U+2212 não existe na Helvetica do jsPDF: em 23/09/2026 o desconto saiu
  // como aspas no PDF que foi pro cliente. Ver o comentário na fonte.
  const texto = textoDoPdf(montarPdfDoOrcamento(ORCAMENTO))
  assert.match(texto, new RegExp(`- ${escapar(brl(100))}`))
  assert.doesNotMatch(texto, /−/)
})

test('o total impresso é o recalculado, não outro número qualquer', () => {
  const texto = textoDoPdf(montarPdfDoOrcamento(ORCAMENTO))
  assert.match(texto, /VALOR TOTAL DO ORÇAMENTO/)
  // 1302 × 3 = 3906, mais 500 do projetor, menos 100 de desconto.
  assert.match(texto, new RegExp(escapar(brl(4306))))
})

test('orçamento sem desconto não imprime a linha de desconto', () => {
  const texto = textoDoPdf(montarPdfDoOrcamento({ ...ORCAMENTO, desconto: 0, total: 4406 }))
  assert.doesNotMatch(texto, /Desconto/)
})

test('valor zerado não vira uma linha "R$ 0,00" na proposta', () => {
  // A agência que não cobra técnico não quer isso escrito no orçamento.
  const texto = textoDoPdf(montarPdfDoOrcamento({ ...ORCAMENTO, valorTecnico: 0 }))
  assert.doesNotMatch(texto, /Valor do técnico/)
})

test('sem telefone e sem data, o PDF sai mesmo assim', () => {
  // Linha antiga do banco pode ter os dois nulos; o PDF é o lugar errado pra
  // descobrir isso — ele sai com o travessão e a proposta continua legível.
  const texto = textoDoPdf(montarPdfDoOrcamento({ ...ORCAMENTO, telefone: null, dataEvento: null }))
  assert.match(texto, /sem data/)
})

test('o real é escrito à mão, sem depender dos dados de idioma do Node', () => {
  // `toLocaleString('pt-BR')` num Node sem ICU completo devolveria "R$ 600.00"
  // — com ponto — num documento que vai pro cliente.
  assert.equal(brl(1302), 'R$ 1.302,00')
  assert.equal(brl(1234567.5), 'R$ 1.234.567,50')
  assert.equal(brl(0), 'R$ 0,00')
})

test('o valor sai com o MESMO caractere que o site imprime', () => {
  /*
   * U+00A0 (espaço não-quebrável) entre "R$" e o número, não o espaço comum.
   *
   * É o que o `toLocaleString('pt-BR')` do site produz, e portanto o que está
   * nas propostas já enviadas. Este teste existe porque a diferença é
   * INVISÍVEL: os dois textos parecem iguais na tela e produzem PDFs
   * diferentes. Conferido em 24/09/2026 gerando o mesmo orçamento pelos dois
   * geradores e comparando o texto impresso caractere a caractere.
   */
  assert.equal(brl(3000), `R$${String.fromCharCode(0x00a0)}3.000,00`)
  assert.ok(!brl(3000).includes('R$ '), 'não pode ser o espaço comum')
})

test('o nome do arquivo leva o número do orçamento', () => {
  assert.equal(nomeDoPdfDoOrcamento(7), 'orcamento-000007.pdf')
})

function escapar(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
