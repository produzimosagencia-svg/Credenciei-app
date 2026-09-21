// Um construtor (e leitor) de planilha genérico — cabeçalho em negrito, uma
// linha por registro. Usado pelos relatórios e pela importação de equipe;
// não sabe nada sobre o que está dentro.

import ExcelJS from 'exceljs'

export type ColunaDaPlanilha = { header: string; key: string; width?: number }

export async function gerarXlsx(
  nomeDaAba: string,
  colunas: ColunaDaPlanilha[],
  linhas: Record<string, string | number>[],
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Credenciei'
  wb.created = new Date()
  // Nome de aba do Excel tem teto de 31 caracteres — cortar em silêncio é
  // melhor que a biblioteca recusar o arquivo inteiro por causa disso.
  const ws = wb.addWorksheet(nomeDaAba.slice(0, 31))
  ws.columns = colunas
  ws.getRow(1).font = { bold: true }
  for (const linha of linhas) ws.addRow(linha)
  return Buffer.from(await wb.xlsx.writeBuffer())
}

/**
 * Nomes de coluna aceitos na importação, em ordem de preferência — mesmo
 * catálogo do site (`lib/planilha.ts`), pra uma planilha feita pra lá
 * funcionar aqui sem editar nada.
 */
const COLUNAS_DE_IMPORTACAO = {
  nome: ['nome', 'name', 'nome completo'],
  cpf: ['cpf'],
  telefone: ['telefone', 'phone', 'celular', 'tel'],
  cargo: ['cargo', 'função', 'funcao', 'role'],
  cidade: ['cidade', 'cidade onde mora', 'municipio', 'município', 'city'],
  valor: ['valor', 'valor a receber', 'valor_receber'],
} satisfies Record<string, string[]>

export type LinhaDeImportacao = {
  nome: string
  cpf: string
  telefone: string
  cargo: string
  cidade: string
  valor: string
}

/**
 * Lê um .xlsx (bytes) e devolve as linhas com nome preenchido — linha sem
 * nome é descartada aqui, geralmente é rodapé ou linha em branco do fim.
 */
export async function lerXlsxDeEquipe(bytes: Buffer): Promise<LinhaDeImportacao[]> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(bytes as never)
  const ws = wb.worksheets[0]
  if (!ws) return []

  const cabecalho: string[] = []
  ws.getRow(1).eachCell((cel, i) => { cabecalho[i - 1] = String(cel.value ?? '').toLowerCase().trim() })

  const indiceDe = (apelidos: string[]): number =>
    cabecalho.findIndex(c => apelidos.includes(c))

  const indices = {
    nome: indiceDe(COLUNAS_DE_IMPORTACAO.nome),
    cpf: indiceDe(COLUNAS_DE_IMPORTACAO.cpf),
    telefone: indiceDe(COLUNAS_DE_IMPORTACAO.telefone),
    cargo: indiceDe(COLUNAS_DE_IMPORTACAO.cargo),
    cidade: indiceDe(COLUNAS_DE_IMPORTACAO.cidade),
    valor: indiceDe(COLUNAS_DE_IMPORTACAO.valor),
  }

  const valorDaCelula = (row: ExcelJS.Row, indice: number): string => {
    if (indice < 0) return ''
    const v = row.getCell(indice + 1).value
    return v === null || v === undefined ? '' : String(v).trim()
  }

  const linhas: LinhaDeImportacao[] = []
  ws.eachRow((row, numero) => {
    if (numero === 1) return // cabeçalho
    const nome = valorDaCelula(row, indices.nome)
    if (!nome) return
    linhas.push({
      nome,
      cpf: valorDaCelula(row, indices.cpf),
      telefone: valorDaCelula(row, indices.telefone),
      cargo: valorDaCelula(row, indices.cargo),
      cidade: valorDaCelula(row, indices.cidade),
      valor: valorDaCelula(row, indices.valor),
    })
  })
  return linhas
}
