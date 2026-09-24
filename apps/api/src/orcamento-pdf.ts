// O PDF de um orçamento — documento comercial que vai direto pro cliente.
//
// ─── CÓPIA POR VALOR DE `lib/orcamentos-pdf.ts` DO SITE ─────────────────────
//
// Mesma biblioteca (jsPDF), mesma margem, mesma paleta, mesma ordem de
// seções. Não é coincidência nem gosto: o cliente pode receber a proposta do
// site hoje e a do app amanhã, e duas propostas com cara diferente da mesma
// agência é o tipo de detalhe que cria dúvida na hora de fechar. Ver
// `docs/decisoes/007-sincronizar-com-o-sistema-web.md` — quando o layout
// mudar lá, alguém muda aqui.
//
// ─── POR QUE NO SERVIDOR, E NÃO NO CELULAR ──────────────────────────────────
//
// A primeira ideia foi `expo-print` (HTML → PDF pelo motor do aparelho). Três
// coisas mataram isso: exigiria um build novo do aplicativo pra chegar em
// quem já tem o APK, o layout seria uma SEGUNDA implementação (HTML) do mesmo
// documento — divergindo do site na primeira mudança — e nada disso é
// necessário, porque o site já gera o PDF em Node, não no navegador. Aqui é o
// mesmo código rodando no mesmo lugar, e o app só pede e compartilha o link,
// exatamente como já faz com a planilha de relatórios.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { jsPDF } from 'jspdf'
import { numeroDoOrcamento } from '@credenciei/dominio'
import type { OrcamentoDetalhado } from '@credenciei/contrato'

export const PDF_MIME = 'application/pdf'

const LARANJA: [number, number, number] = [255, 74, 15]
const LARANJA_CLARO: [number, number, number] = [255, 241, 234]
const ESCURO: [number, number, number] = [31, 33, 36]
const CINZA: [number, number, number] = [120, 124, 130]
const BORDA: [number, number, number] = [222, 224, 228]

/*
 * Resolvido pelo arquivo, NÃO por `process.cwd()`.
 *
 * O site pode usar o cwd porque o Next sempre roda da raiz do projeto. Aqui a
 * API sobe de três jeitos diferentes (`npm run dev` da raiz do monorepo, `npm
 * run start --workspace`, e o contêiner do EasyPanel) e o cwd é diferente em
 * cada um — a logo sumiria em produção e em lugar nenhum mais.
 */
const PASTA_DA_MARCA = join(dirname(fileURLToPath(import.meta.url)), '..', 'marca')

/*
 * O espaço entre "R$" e o número é NÃO-QUEBRÁVEL (U+00A0), não o espaço
 * comum.
 *
 * Não é capricho tipográfico: é o que o site imprime hoje. O `brl` de lá é
 * `toLocaleString('pt-BR', …)`, e o pt-BR usa U+00A0 aí. Com espaço comum os
 * dois PDFs sairiam diferentes — e "diferente" num documento que o cliente
 * compara lado a lado com a proposta anterior é o tipo de detalhe que gera
 * pergunta. Conferido em 24/09/2026 comparando o texto impresso dos dois
 * geradores, caractere a caractere.
 */
const ESPACO_FIXO = ' '

/**
 * O real escrito à mão — mesma razão de `emReais` no app.
 *
 * O site pode usar `toLocaleString('pt-BR')` porque a Vercel roda Node com
 * ICU completo. Aqui não dá essa garantia: o contêiner do EasyPanel é montado
 * pelo Nixpacks, e um Node `small-icu` devolveria "R$ 3,000.00" — ou até
 * "BRL 3000.00" — calado, num documento que vai direto pro cliente. A conta
 * feita à mão sempre dá o mesmo resultado; o teste prende os dois formatos
 * ao mesmo texto.
 */
export function brl(valor: number): string {
  const centavos = Math.round(valor * 100)
  const negativo = centavos < 0
  const inteiros = String(Math.floor(Math.abs(centavos) / 100))
  const resto = String(Math.abs(centavos) % 100).padStart(2, '0')

  let comPontos = ''
  for (let i = 0; i < inteiros.length; i++) {
    const faltam = inteiros.length - i
    comPontos += inteiros[i]
    if (faltam > 1 && (faltam - 1) % 3 === 0) comPontos += '.'
  }
  return `${negativo ? '-' : ''}R$${ESPACO_FIXO}${comPontos},${resto}`
}

function dataBR(iso: string | null): string {
  if (!iso) return 'sem data'
  const [ano, mes, dia] = iso.slice(0, 10).split('-')
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : iso
}

/** O nome do arquivo que a pessoa vê ao compartilhar. */
export function nomeDoPdfDoOrcamento(numero: number): string {
  return `orcamento-${numeroDoOrcamento(numero).slice(1)}.pdf`
}

export function montarPdfDoOrcamento(orcamento: OrcamentoDetalhado): Buffer {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })

  const margem = 48
  const largura = doc.internal.pageSize.getWidth() - margem * 2
  let y = 60

  // ── Cabeçalho: logo + "ORÇAMENTO" + número + data de emissão ───────────────
  /*
   * ─── O 'FAST' NO FIM DO addImage NÃO É VELOCIDADE: É TAMANHO ─────────────
   *
   * Sem ele o jsPDF embute o bitmap CRU das duas imagens da marca, e a
   * proposta de uma página sai com 2,4 MB. Com ele (Flate, sem perda nenhuma
   * de qualidade) sai com 64 KB — 38 vezes menor, pixel por pixel idêntica.
   *
   * Importa porque o caminho normal deste arquivo é o WhatsApp, de dentro de
   * um evento, no 4G disputado por duas mil pessoas — e porque o link que o
   * app gera vale 15 minutos. Achado em 24/09/2026 medindo o PDF; o site
   * tinha o mesmo defeito e foi corrigido junto.
   */
  let alturaLogo = 0
  const logo = imagemDaMarca('logo-preto.png')
  if (logo) {
    // Sem logo é melhor que sem PDF — o orçamento continua legível e correto.
    const props = doc.getImageProperties(logo)
    const larguraLogo = 110
    alturaLogo = (props.height / props.width) * larguraLogo
    doc.addImage(logo, 'PNG', margem, y - alturaLogo + 6, larguraLogo, alturaLogo, undefined, 'FAST')
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.setTextColor(...LARANJA)
  doc.text('ORÇAMENTO', margem + largura, y - 10, { align: 'right' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(...CINZA)
  doc.text(
    `${numeroDoOrcamento(orcamento.numero)}  ·  Emitido em ${dataBR(new Date().toISOString().slice(0, 10))}`,
    margem + largura, y + 8, { align: 'right' },
  )

  y += Math.max(alturaLogo, 24) + 18
  doc.setDrawColor(...BORDA)
  doc.setLineWidth(1)
  doc.line(margem, y, margem + largura, y)
  y += 28

  // ── Dados do evento ──────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...CINZA)
  doc.text('DADOS DO EVENTO', margem, y)
  y += 18

  const linhas: [string, string][] = [
    ['Evento', orcamento.nomeEvento],
    ['Responsável', orcamento.responsavel],
    ['Telefone', orcamento.telefone ?? '—'],
    ['Data do evento', dataBR(orcamento.dataEvento)],
  ]
  doc.setFontSize(10.5)
  for (const [rotulo, valor] of linhas) {
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...ESCURO)
    doc.text(`${rotulo}:`, margem, y)
    doc.setFont('helvetica', 'normal')
    doc.text(valor, margem + 118, y)
    y += 17
  }
  y += 14

  // ── Investimento ─────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...CINZA)
  doc.text('INVESTIMENTO', margem, y)
  y += 8
  doc.setDrawColor(...BORDA)
  doc.line(margem, y, margem + largura, y)
  y += 22

  const colValor = margem + largura
  const diasTexto = orcamento.dias > 1 ? ` (${orcamento.dias} dias)` : ''
  /*
   * As três diárias já vêm MULTIPLICADAS pelos dias; os itens, não.
   *
   * É a mesma distinção de `subtotalDoOrcamento`, e a linha do PDF é onde ela
   * fica visível pro cliente: "Valor do dia (3 dias) — R$ 3.600" contra
   * "Projetor — R$ 500". Somar o projetor três vezes aqui seria cobrar três
   * projetores.
   */
  const linhasInvestimento: [string, number][] = [
    [`Valor do dia${diasTexto}`, orcamento.valorDia * orcamento.dias],
    [`Valor por funcionário${diasTexto}`, orcamento.valorFuncionario * orcamento.dias],
    [`Valor do técnico${diasTexto}`, orcamento.valorTecnico * orcamento.dias],
    ...orcamento.itens.map((i): [string, number] => [i.descricao, i.valor]),
  ]
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10.5)
  for (const [descricao, valor] of linhasInvestimento) {
    if (valor <= 0) continue
    doc.setTextColor(...ESCURO)
    doc.text(descricao, margem, y)
    doc.text(brl(valor), colValor, y, { align: 'right' })
    y += 20
    if (y > doc.internal.pageSize.getHeight() - 220) break
  }

  if (orcamento.desconto > 0) {
    doc.setTextColor(...LARANJA)
    doc.text('Desconto', margem, y)
    /*
     * Hífen comum, NÃO o sinal de menos tipográfico (U+2212).
     *
     * As fontes padrão do jsPDF (Helvetica) não têm o glifo de U+2212, e o
     * desconto saía como lixo no PDF que vai pro cliente — em 23/09/2026 o
     * Juan viu isso acontecer no site, onde apareceu como aspas com o
     * espaçamento quebrado. Corrigido lá e nascido certo aqui.
     */
    doc.text(`- ${brl(orcamento.desconto)}`, colValor, y, { align: 'right' })
    y += 20
  }

  y += 6
  doc.setDrawColor(...BORDA)
  doc.line(margem, y, margem + largura, y)
  y += 26

  // ── Total em destaque ────────────────────────────────────────────────────
  const alturaTotal = 52
  doc.setFillColor(...LARANJA_CLARO)
  doc.roundedRect(margem, y, largura, alturaTotal, 8, 8, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...ESCURO)
  doc.text('VALOR TOTAL DO ORÇAMENTO', margem + 18, y + 32)
  doc.setFontSize(20)
  doc.setTextColor(...LARANJA)
  doc.text(brl(orcamento.total), margem + largura - 18, y + 34, { align: 'right' })
  y += alturaTotal + 30

  // ── Observações ──────────────────────────────────────────────────────────
  if (orcamento.observacoes?.trim()) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(...CINZA)
    doc.text('OBSERVAÇÕES', margem, y)
    y += 16
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(...ESCURO)
    const texto = doc.splitTextToSize(orcamento.observacoes, largura) as string[]
    doc.text(texto, margem, y)
    y += texto.length * 13 + 20
  }

  // ── Selo da marca, grande, canto inferior direito ───────────────────────
  const alturaPagina = doc.internal.pageSize.getHeight()
  const iso = imagemDaMarca('iso-laranja.png')
  if (iso) {
    const propsIso = doc.getImageProperties(iso)
    const larguraIso = 150
    const alturaIso = (propsIso.height / propsIso.width) * larguraIso
    doc.addImage(
      iso, 'PNG',
      margem + largura - larguraIso, alturaPagina - 24 - alturaIso,
      larguraIso, alturaIso, undefined, 'FAST',
    )
  }

  // ── Rodapé ───────────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...LARANJA)
  doc.text('Credenciei', margem, alturaPagina - 46)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(...CINZA)
  doc.text('Soluções profissionais para gestão e credenciamento de eventos.', margem, alturaPagina - 33)

  return Buffer.from(doc.output('arraybuffer') as ArrayBuffer)
}

/**
 * A imagem da marca em base64, ou `null` se ela não estiver lá.
 *
 * Lida uma vez só e guardada: montar o PDF relê o arquivo toda vez, e são
 * ~70KB de PNG por orçamento que não mudam nunca.
 */
const marcaEmCache = new Map<string, string | null>()

function imagemDaMarca(nome: string): string | null {
  const guardada = marcaEmCache.get(nome)
  if (guardada !== undefined) return guardada

  let imagem: string | null = null
  try {
    imagem = `data:image/png;base64,${readFileSync(join(PASTA_DA_MARCA, nome)).toString('base64')}`
  } catch (e) {
    // Sem logo é melhor que sem PDF: o orçamento continua legível e com os
    // números certos, que é o que o cliente precisa ler.
    console.error('[orcamento-pdf] imagem da marca não carregou', nome, e instanceof Error ? e.message : e)
  }
  marcaEmCache.set(nome, imagem)
  return imagem
}
