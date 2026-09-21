/*
 * A equipe de UM setor — a visão do admin, com os quatro estados de cada
 * etapa (`feito`/`aberto`/`fechado`/`indefinido`) e o escopo de quem pode ver.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import ExcelJS from 'exceljs'
import { cenarioHenriqueEJuliano } from '../dados/memoria.js'
import { ArquivosEmMemoria } from '../arquivos.js'
import { registrarBatida } from './batidas.js'
import { baixarModelo, equipeDoSetor, exportarEquipe, importarPlanilha } from './setor.js'

const URL_BASE = 'http://api.local'

/** O token é a última parte do endereço — o que `ArquivosEmMemoria.buscar` espera. */
const tokenDoArquivo = (url: string) => url.split('/').pop()!

async function planilhaDeImportacao(linhas: Record<string, string | number>[]): Promise<string> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Planilha')
  ws.columns = [
    { header: 'Nome', key: 'Nome' },
    { header: 'CPF', key: 'CPF' },
    { header: 'Telefone', key: 'Telefone' },
    { header: 'Cargo', key: 'Cargo' },
    { header: 'Cidade', key: 'Cidade' },
    { header: 'Valor a receber', key: 'Valor a receber' },
  ]
  for (const linha of linhas) ws.addRow(linha)
  const bytes = Buffer.from(await wb.xlsx.writeBuffer())
  return bytes.toString('base64')
}

const bate = (participacaoId: string, tipo: 'entrada' | 'meio' | 'fim', em: string) => ({
  id: `${participacaoId}-${tipo}`, participacaoId, tipo, registradoEm: em,
})

// ─── Escopo ─────────────────────────────────────────────────────────────────

test('colaborador não vê a equipe de um setor', async () => {
  const { repo, pessoa } = cenarioHenriqueEJuliano()
  await assert.rejects(equipeDoSetor(repo, pessoa.id, 'eq-1'), /permissão/)
})

test('admin da mesma organização vê o setor', async () => {
  const { repo, admin } = cenarioHenriqueEJuliano()
  const e = await equipeDoSetor(repo, admin.id, 'eq-1')
  assert.equal(e.setorNome, 'Produção')
  assert.equal(e.pessoas.length, 1)
})

test('admin de outra organização não vê o setor', async () => {
  const { repo } = cenarioHenriqueEJuliano()
  repo.perfis.push({ id: 'auth-outro', nome: 'Bia', papel: 'admin', organizacaoId: 'org-2', ativo: true })
  await assert.rejects(equipeDoSetor(repo, 'auth-outro', 'eq-1'), /Não encontramos/)
})

test('supervisor vê o próprio setor, mas não o de outro supervisor', async () => {
  const { repo, evento } = cenarioHenriqueEJuliano()
  repo.equipes.push({ id: 'eq-2', nome: 'Bar', eventoId: evento.id })
  repo.perfis.push({ id: 'auth-sup', nome: 'Carlos', papel: 'supervisor', organizacaoId: 'org-1', ativo: true })
  repo.equipes[0]!.supervisorPessoaId = 'auth-sup'

  const e = await equipeDoSetor(repo, 'auth-sup', 'eq-1')
  assert.equal(e.setorNome, 'Produção')

  await assert.rejects(equipeDoSetor(repo, 'auth-sup', 'eq-2'), /Não encontramos/)
})

test('setor inexistente responde "não encontramos", igual a um que não é seu', async () => {
  const { repo, admin } = cenarioHenriqueEJuliano()
  await assert.rejects(equipeDoSetor(repo, admin.id, 'eq-999'), /Não encontramos/)
})

// ─── O "a receber" é escondido do supervisor ────────────────────────────────

test('o admin vê "a receber"; o supervisor, não', async () => {
  const { repo, admin, evento } = cenarioHenriqueEJuliano()
  repo.perfis.push({ id: 'auth-sup', nome: 'Carlos', papel: 'supervisor', organizacaoId: 'org-1', ativo: true })
  repo.equipes[0]!.supervisorPessoaId = 'auth-sup'
  void evento

  const doAdmin = await equipeDoSetor(repo, admin.id, 'eq-1')
  assert.ok(doAdmin.indicadores.some(i => i.chave === 'a_receber'))

  const doSupervisor = await equipeDoSetor(repo, 'auth-sup', 'eq-1')
  assert.ok(!doSupervisor.indicadores.some(i => i.chave === 'a_receber'))
})

// ─── O estado de cada etapa, AGORA ──────────────────────────────────────────

test('antes da janela abrir, a entrada é "indefinido"', async () => {
  const { repo, admin } = cenarioHenriqueEJuliano()
  const e = await equipeDoSetor(repo, admin.id, 'eq-1', new Date('2026-09-05T06:00:00-03:00'))
  assert.equal(e.pessoas[0]?.statusEntrada, 'indefinido')
})

test('depois da janela fechar sem registro, a entrada é "fechado" — a pendência', async () => {
  const { repo, admin } = cenarioHenriqueEJuliano()
  // Ainda 05/09 (dia principal) — a janela de entrada fecha às 23:55.
  const e = await equipeDoSetor(repo, admin.id, 'eq-1', new Date('2026-09-05T23:56:00-03:00'))
  assert.equal(e.pessoas[0]?.statusEntrada, 'fechado')
})

test('quem já bateu entrada aparece "feito", e a janela do meio é a entrada + 4h', async () => {
  const { repo, admin } = cenarioHenriqueEJuliano()
  await registrarBatida(repo, 'pes-joao', bate('part-joao', 'entrada', '2026-09-05T08:00:00-03:00'))

  const antesDoMeio = await equipeDoSetor(repo, admin.id, 'eq-1', new Date('2026-09-05T10:00:00-03:00'))
  assert.equal(antesDoMeio.pessoas[0]?.statusEntrada, 'feito')
  assert.equal(antesDoMeio.pessoas[0]?.statusMeio, 'indefinido')

  const dentroDoMeio = await equipeDoSetor(repo, admin.id, 'eq-1', new Date('2026-09-05T13:00:00-03:00'))
  assert.equal(dentroDoMeio.pessoas[0]?.statusMeio, 'aberto')

  const depoisDoMeio = await equipeDoSetor(repo, admin.id, 'eq-1', new Date('2026-09-05T15:00:00-03:00'))
  assert.equal(depoisDoMeio.pessoas[0]?.statusMeio, 'fechado')
})

test('sem entrada, o meio não tem janela para comparar — fica "aberto"', async () => {
  const { repo, admin } = cenarioHenriqueEJuliano()
  const e = await equipeDoSetor(repo, admin.id, 'eq-1', new Date('2026-09-05T15:00:00-03:00'))
  assert.equal(e.pessoas[0]?.statusMeio, 'aberto')
})

test('fora do dia principal, a entrada é livre — sempre "aberto"', async () => {
  const { repo, admin } = cenarioHenriqueEJuliano()
  // 03/09 é dia de montagem (preparação) neste cenário.
  const e = await equipeDoSetor(repo, admin.id, 'eq-1', new Date('2026-09-03T03:00:00-03:00'))
  assert.equal(e.pessoas[0]?.statusEntrada, 'aberto')
})

test('"com pendências" conta quem tem alguma etapa fechada', async () => {
  const { repo, admin } = cenarioHenriqueEJuliano()
  const e = await equipeDoSetor(repo, admin.id, 'eq-1', new Date('2026-09-05T23:56:00-03:00'))
  const total = e.indicadores.find(i => i.chave === 'total')
  const pendencias = e.indicadores.find(i => i.chave === 'pendencias')
  assert.equal(total?.valor, 1)
  assert.equal(pendencias?.valor, 1)
})

test('contestação aberta também vira pendência, mesmo com todas as etapas em dia', async () => {
  const { repo, admin, participacao } = cenarioHenriqueEJuliano()
  // Antes da janela abrir: nenhuma etapa está "fechada" por si só.
  const antes = await equipeDoSetor(repo, admin.id, 'eq-1', new Date('2026-09-05T06:00:00-03:00'))
  assert.equal(antes.pessoas[0]?.temContestacaoAberta, false)
  assert.equal(antes.indicadores.find(i => i.chave === 'pendencias')?.valor, 0)

  await repo.criarContestacao({
    participacaoId: participacao.id, tipo: 'meio', dataRef: '2026-09-05', motivo: 'não gravou o meio',
  })

  const depois = await equipeDoSetor(repo, admin.id, 'eq-1', new Date('2026-09-05T06:00:00-03:00'))
  assert.equal(depois.pessoas[0]?.temContestacaoAberta, true)
  assert.equal(depois.indicadores.find(i => i.chave === 'pendencias')?.valor, 1)
})

// ─── Planilhas ──────────────────────────────────────────────────────────────

test('o modelo é uma planilha de verdade, só com o cabeçalho', async () => {
  const { repo, admin } = cenarioHenriqueEJuliano()
  const arquivos = new ArquivosEmMemoria(URL_BASE)
  const arquivo = await baixarModelo(repo, admin.id, arquivos)
  assert.ok('nome' in arquivo)
  if (!('nome' in arquivo)) return

  const guardado = arquivos.buscar(tokenDoArquivo(arquivo.url))
  assert.ok(guardado)
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(guardado!.bytes as never)
  const ws = wb.worksheets[0]!
  assert.equal(ws.getRow(1).getCell(1).value, 'Nome')
  assert.equal(ws.rowCount, 1)
})

test('quem não gerencia eventos não baixa o modelo', async () => {
  const { repo, pessoa } = cenarioHenriqueEJuliano()
  const arquivos = new ArquivosEmMemoria(URL_BASE)
  const r = await baixarModelo(repo, pessoa.id, arquivos)
  assert.ok('erro' in r)
})

test('a planilha da equipe traz uma linha por pessoa', async () => {
  const { repo, admin } = cenarioHenriqueEJuliano()
  const arquivos = new ArquivosEmMemoria(URL_BASE)
  const arquivo = await exportarEquipe(repo, admin.id, 'eq-1', arquivos)

  const guardado = arquivos.buscar(tokenDoArquivo(arquivo.url))
  assert.ok(guardado)
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(guardado!.bytes as never)
  const ws = wb.worksheets[0]!
  assert.equal(ws.getRow(1).getCell(1).value, 'Nome')
  assert.equal(ws.rowCount, 2)
  assert.equal(ws.getRow(2).getCell(1).value, 'João da Silva')
})

test('importa gente nova, ignora CPF inválido e repetido, e diz quem já estava cadastrado', async () => {
  const { repo, admin, evento } = cenarioHenriqueEJuliano()
  repo.equipes.push({ id: 'eq-2', nome: 'Bar', eventoId: evento.id })
  repo.pessoas.push({ id: 'pes-bruno', nome: 'Bruno Alves', cpf: '11144477735', telefone: null, fotoPath: null })
  repo.participacoes.push({
    id: 'part-bruno', pessoaId: 'pes-bruno', eventoId: evento.id, equipeId: 'eq-2', equipeNome: 'Bar',
    funcao: null, supervisorNome: null, ativo: true, descredenciadoEm: null, valorReceber: 0, pago: false,
    pagoEm: null, qrToken: 'token-bruno', cidade: null, criadoEm: '2026-08-20T10:00:00-03:00',
  })

  const base64 = await planilhaDeImportacao([
    { Nome: 'Fernanda Reis', CPF: '52998224725', Telefone: '27988776655', Cargo: 'Auxiliar', Cidade: 'Vila Velha', 'Valor a receber': 120 },
    { Nome: 'Alguém sem CPF', CPF: 'não é cpf', Telefone: '', Cargo: '', Cidade: '', 'Valor a receber': '' },
    { Nome: 'Fernanda Reis', CPF: '529.982.247-25', Telefone: '', Cargo: '', Cidade: '', 'Valor a receber': '' },
    { Nome: 'Bruno Alves', CPF: '111.444.777-35', Telefone: '', Cargo: '', Cidade: '', 'Valor a receber': '' },
  ])

  const r = await importarPlanilha(repo, admin.id, 'eq-1', base64)
  assert.equal(r.erro, undefined)
  assert.equal(r.resultado?.criados, 1)
  assert.equal(r.resultado?.ignorados, 3)
  assert.equal(r.resultado?.erros.length, 3)
  assert.ok(r.resultado?.erros.some(e => e.includes('CPF inválido')))
  assert.ok(r.resultado?.erros.some(e => e.includes('CPF repetido na própria planilha')))
  assert.ok(r.resultado?.erros.some(e => e.includes('já está cadastrado no setor Bar')))

  const nova = await repo.participacaoPorCpfNoEvento(evento.id, '52998224725')
  assert.equal(nova?.nome, 'Fernanda Reis')
  assert.equal(nova?.setorNome, 'Produção')
})

test('planilha vazia ou ilegível é recusada com uma mensagem, não um resultado vazio', async () => {
  const { repo, admin } = cenarioHenriqueEJuliano()
  assert.equal((await importarPlanilha(repo, admin.id, 'eq-1', '')).erro, 'O arquivo veio vazio. Escolha de novo.')

  const base64Invalido = Buffer.from('isto não é um xlsx').toString('base64')
  const r = await importarPlanilha(repo, admin.id, 'eq-1', base64Invalido)
  assert.match(r.erro ?? '', /Não conseguimos ler este arquivo/)
})

test('quem não gerencia eventos não importa planilha', async () => {
  const { repo, pessoa } = cenarioHenriqueEJuliano()
  repo.perfis.push({ id: 'auth-sup', nome: 'Carlos', papel: 'supervisor', organizacaoId: 'org-1', ativo: true })
  repo.equipes[0]!.supervisorPessoaId = 'auth-sup'
  void pessoa

  const base64 = await planilhaDeImportacao([
    { Nome: 'Fernanda Reis', CPF: '52998224725', Telefone: '', Cargo: '', Cidade: '', 'Valor a receber': '' },
  ])
  const r = await importarPlanilha(repo, 'auth-sup', 'eq-1', base64)
  assert.match(r.erro ?? '', /permissão/)
})
