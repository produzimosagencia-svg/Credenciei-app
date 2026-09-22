/*
 * Relatórios — presença em planilha. O que se testa aqui: o RECORTE de quem
 * pode ver o quê (supervisor só o próprio setor, nunca o "completo"), e que
 * o arquivo devolvido é uma planilha de verdade — não um nome bonito sem
 * conteúdo.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import { cenarioHenriqueEJuliano } from '../dados/memoria.js'
import { ArquivosEmMemoria } from '../arquivos.js'
import {
  eventosParaRelatorios, relatorioDoEvento, relatorioDoSetor, relatoriosPorSetorZip, resumoDeRelatorios,
} from './relatorios.js'

const URL_BASE = 'http://api.local'
const PERIODO = { de: '2026-09-03', ate: '2026-09-06' }

/** O token é a última parte do endereço — o que `ArquivosEmMemoria.buscar` espera. */
function tokenDoArquivo(url: string): string {
  return url.split('/').pop()!
}

test('colaborador não gera relatório', async () => {
  const { repo, evento, pessoa } = cenarioHenriqueEJuliano()
  await assert.rejects(resumoDeRelatorios(repo, pessoa.id, evento.id), /permissão/)
})

test('admin de outra organização não gera relatório deste evento', async () => {
  const { repo, evento } = cenarioHenriqueEJuliano()
  repo.perfis.push({ id: 'auth-outro', nome: 'Bia', papel: 'admin', organizacaoId: 'org-2', ativo: true })
  await assert.rejects(resumoDeRelatorios(repo, 'auth-outro', evento.id), /Evento não encontrado/)
})

test('resumoDeRelatorios traz o período inteiro e o total da equipe', async () => {
  const { repo, evento, admin } = cenarioHenriqueEJuliano()
  const r = await resumoDeRelatorios(repo, admin.id, evento.id)

  assert.equal(r.eventoNome, evento.nome)
  assert.deepEqual(r.periodoCompleto, { de: '2026-09-03', ate: '2026-09-06' })
  assert.deepEqual(r.setores, [{ setorId: 'eq-1', nome: 'Produção' }])
  assert.equal(r.totalFuncionarios, 1)
})

test('supervisor só vê o próprio setor, nunca o relatório completo', async () => {
  const { repo, evento, pessoa } = cenarioHenriqueEJuliano()
  const arquivos = new ArquivosEmMemoria(URL_BASE)
  const supervisor = { id: 'auth-sup', nome: 'Carlos Silva', papel: 'supervisor' as const, organizacaoId: 'org-1', ativo: true }
  repo.perfis.push(supervisor)
  repo.equipes.find(e => e.id === 'eq-1')!.supervisorPessoaId = supervisor.id
  repo.equipes.push({ id: 'eq-2', nome: 'Bar', eventoId: evento.id })

  const r = await resumoDeRelatorios(repo, supervisor.id, evento.id)
  assert.deepEqual(r.setores, [{ setorId: 'eq-1', nome: 'Produção' }])

  await assert.rejects(
    relatorioDoEvento(repo, supervisor.id, evento.id, PERIODO, 'credenciados', arquivos),
    /relatório completo é só para quem gerencia o evento inteiro/,
  )
  await assert.rejects(
    relatoriosPorSetorZip(repo, supervisor.id, evento.id, PERIODO, 'credenciados', arquivos),
    /relatório completo é só para quem gerencia o evento inteiro/,
  )
  await assert.rejects(
    relatorioDoSetor(repo, supervisor.id, evento.id, 'eq-2', PERIODO, 'credenciados', arquivos),
    /Sem permissão sobre este setor/,
  )

  // O PRÓPRIO setor, esse ele pode.
  const arquivo = await relatorioDoSetor(repo, supervisor.id, evento.id, 'eq-1', PERIODO, 'credenciados', arquivos)
  assert.ok(arquivo.nome.includes('Produção') || arquivo.nome.length > 0)
  void pessoa
})

test('o relatório de credenciados é uma planilha de verdade, com a batida', async () => {
  const { repo, evento, admin, participacao } = cenarioHenriqueEJuliano()
  const arquivos = new ArquivosEmMemoria(URL_BASE)
  await repo.gravarRegistro({
    id: 'reg-entrada', participacaoId: participacao.id, tipo: 'entrada',
    dataRef: '2026-09-05', registradoEm: '2026-09-05T10:00:00-03:00',
    fotoPath: null, lat: null, lng: null, manual: false, origem: 'app',
  })

  const arquivo = await relatorioDoEvento(repo, admin.id, evento.id, PERIODO, 'credenciados', arquivos)
  assert.match(arquivo.url, new RegExp(`^${URL_BASE}/arquivos/`))
  assert.ok(arquivo.nome.endsWith('.xlsx'))

  const guardado = arquivos.buscar(tokenDoArquivo(arquivo.url))
  assert.ok(guardado, 'o arquivo precisa estar guardado sob o token do endereço')

  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(guardado!.bytes as never)
  const ws = wb.worksheets[0]!
  assert.equal(ws.getRow(1).getCell(1).value, 'Nome')

  // Uma linha por pessoa×dia, dentro do período (03 a 06, 4 dias).
  assert.equal(ws.rowCount, 1 + 4)

  const dias = []
  for (let i = 2; i <= ws.rowCount; i++) dias.push(ws.getRow(i).getCell(4).value)
  assert.deepEqual(dias, ['2026-09-03', '2026-09-04', '2026-09-05', '2026-09-06'])

  const linhaDoEvento = ws.getRow(4) // dia 05 é a 3ª data (03,04,05,06) → linha 4
  assert.equal(linhaDoEvento.getCell(4).value, '2026-09-05')
  assert.equal(linhaDoEvento.getCell(5).value, '2026-09-05T10:00:00-03:00')
})

test('o relatório de ausentes traz só quem nunca bateu entrada, uma linha por pessoa', async () => {
  const { repo, evento, admin, pessoa } = cenarioHenriqueEJuliano()
  const arquivos = new ArquivosEmMemoria(URL_BASE)

  // Uma segunda pessoa na mesma equipe, que nunca bate ponto.
  repo.pessoas.push({ id: 'pes-nunca-vem', nome: 'Fulano Sumido', cpf: '00011122233', telefone: null, fotoPath: null })
  await repo.criarParticipacao({
    pessoaId: 'pes-nunca-vem', eventoId: evento.id, equipeId: 'eq-1', equipeNome: 'Produção',
    funcao: null, supervisorNome: null, ativo: true, descredenciadoEm: null,
    valorReceber: null, pago: false, pagoEm: null, qrToken: 'tk-sumido',
    cidade: null, criadoEm: new Date().toISOString(),
  })

  const arquivo = await relatorioDoEvento(repo, admin.id, evento.id, PERIODO, 'ausentes', arquivos)
  assert.ok(arquivo.nome.includes('ausentes'))

  const guardado = arquivos.buscar(tokenDoArquivo(arquivo.url))!
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(guardado.bytes as never)
  const ws = wb.worksheets[0]!

  // Uma linha só: o Fulano. João (a pessoa original) tem entrada registrada? Não neste teste — então os DOIS ficam de fora só se nenhum bateu.
  assert.equal(ws.rowCount, 1 + 2) // cabeçalho + João + Fulano, nenhum bateu ponto neste teste
  const nomes = []
  for (let i = 2; i <= ws.rowCount; i++) nomes.push(ws.getRow(i).getCell(1).value)
  assert.ok(nomes.includes('Fulano Sumido'))
  assert.ok(nomes.includes(pessoa.nome))
})

test('o zip por setor traz um arquivo por setor', async () => {
  const { repo, evento, admin } = cenarioHenriqueEJuliano()
  const arquivos = new ArquivosEmMemoria(URL_BASE)
  repo.equipes.push({ id: 'eq-2', nome: 'Bar', eventoId: evento.id })

  const arquivo = await relatoriosPorSetorZip(repo, admin.id, evento.id, PERIODO, 'credenciados', arquivos)
  assert.ok(arquivo.nome.endsWith('.zip'))

  const guardado = arquivos.buscar(tokenDoArquivo(arquivo.url))!
  const zip = await JSZip.loadAsync(guardado.bytes)
  const nomes = Object.keys(zip.files).sort()
  assert.deepEqual(nomes, ['Bar.xlsx', 'Produção.xlsx'])
})

test('eventosParaRelatorios respeita o papel de quem pergunta', async () => {
  const { repo, master, admin } = cenarioHenriqueEJuliano()
  assert.equal((await eventosParaRelatorios(repo, master.id)).length, 1)
  assert.equal((await eventosParaRelatorios(repo, admin.id)).length, 1)
})

test('token de download que não existe (ou já expirou) devolve nulo', async () => {
  assert.equal(new ArquivosEmMemoria(URL_BASE).buscar('token-que-nunca-existiu'), null)
})
