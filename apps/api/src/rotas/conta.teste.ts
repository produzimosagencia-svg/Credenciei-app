/*
 * Autoatendimento sobre a própria conta — excluir e baixar meus dados
 * (LGPD, direito ao esquecimento e de acesso/portabilidade).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cenarioHenriqueEJuliano } from '../dados/memoria.js'
import { ArquivosEmMemoria } from '../arquivos.js'
import { registrarBatida } from './batidas.js'
import { meusDados, revogarConsentimentoDeBase } from './conta.js'

const URL_BASE = 'http://api.local'

test('pessoa que não existe é recusada', async () => {
  const { repo } = cenarioHenriqueEJuliano()
  const arquivos = new ArquivosEmMemoria(URL_BASE)
  await assert.rejects(() => meusDados(repo, arquivos, 'pes-fantasma'), /não encontrada/i)
})

test('devolve um arquivo com nome e url', async () => {
  const { repo, pessoa } = cenarioHenriqueEJuliano()
  const arquivos = new ArquivosEmMemoria(URL_BASE)
  const r = await meusDados(repo, arquivos, pessoa.id, new Date('2026-09-05T12:00:00-03:00'))
  assert.equal(r.nome, 'meus-dados-2026-09-05.json')
  assert.ok(r.url.startsWith('http://api.local/arquivos/'))
})

/** Lê de volta o JSON gravado, pra conferir o conteúdo de verdade. */
async function conteudo(arquivos: ArquivosEmMemoria, url: string) {
  const token = url.split('/').pop()!
  const arquivo = arquivos.buscar(token)!
  return JSON.parse(arquivo.bytes.toString('utf-8'))
}

test('traz a identidade, o evento, e a batida já registrada', async () => {
  const { repo, pessoa, participacao } = cenarioHenriqueEJuliano()
  await registrarBatida(repo, pessoa.id, {
    id: 'e1', participacaoId: participacao.id, tipo: 'entrada', registradoEm: '2026-09-05T08:00:00-03:00',
  })

  const arquivos = new ArquivosEmMemoria(URL_BASE)
  const r = await meusDados(repo, arquivos, pessoa.id)
  const dados = await conteudo(arquivos, r.url)

  assert.equal(dados.pessoa.nome, pessoa.nome)
  assert.equal(dados.pessoa.cpf, pessoa.cpf)
  assert.equal(dados.participacoes.length, 1)
  assert.equal(dados.participacoes[0].evento, 'Henrique e Juliano — Kleber Andrade')
  assert.equal(dados.participacoes[0].registros.length, 1)
  assert.equal(dados.participacoes[0].registros[0].tipo, 'entrada')
})

test('traz contestação em aberto, e preferências de aviso desligadas', async () => {
  const { repo, pessoa, participacao } = cenarioHenriqueEJuliano()
  await repo.criarContestacao({
    participacaoId: participacao.id, tipo: 'meio', dataRef: '2026-09-05', motivo: 'não gravou o meio',
  })
  await repo.salvarPreferencias(pessoa.id, ['lembrete_entrada', 'dia_evento'], ['dia_evento'])

  const arquivos = new ArquivosEmMemoria(URL_BASE)
  const r = await meusDados(repo, arquivos, pessoa.id)
  const dados = await conteudo(arquivos, r.url)

  assert.equal(dados.participacoes[0].contestacoesEmAberto.length, 1)
  assert.equal(dados.participacoes[0].contestacoesEmAberto[0].motivo, 'não gravou o meio')
  assert.ok(dados.preferenciasDeAvisoDesligadas.includes('lembrete_entrada'))
  assert.ok(!dados.preferenciasDeAvisoDesligadas.includes('dia_evento'))
})

test('quem nunca trabalhou em nada tem participações vazias, sem quebrar', async () => {
  const { repo } = cenarioHenriqueEJuliano()
  repo.pessoas.push({ id: 'pes-maria', nome: 'Maria Souza', cpf: '98765432100', telefone: null, fotoPath: null })

  const arquivos = new ArquivosEmMemoria(URL_BASE)
  const r = await meusDados(repo, arquivos, 'pes-maria')
  const dados = await conteudo(arquivos, r.url)

  assert.deepEqual(dados.participacoes, [])
  assert.deepEqual(dados.avisosRecebidos, [])
})

test('os dados de uma pessoa não vazam pra outra', async () => {
  const { repo, pessoa, participacao } = cenarioHenriqueEJuliano()
  repo.pessoas.push({ id: 'pes-maria', nome: 'Maria Souza', cpf: '98765432100', telefone: null, fotoPath: null })
  repo.participacoes.push({
    id: 'part-maria', pessoaId: 'pes-maria', eventoId: participacao.eventoId, equipeId: 'eq-1', equipeNome: 'Produção',
    funcao: 'Bar', supervisorNome: null, ativo: true, descredenciadoEm: null, valorReceber: 200,
    pago: false, pagoEm: null, qrToken: 'tk-maria', cidade: null, criadoEm: '2026-08-20T10:00:00-03:00',
  })
  await registrarBatida(repo, pessoa.id, {
    id: 'e1', participacaoId: participacao.id, tipo: 'entrada', registradoEm: '2026-09-05T08:00:00-03:00',
  })

  const arquivos = new ArquivosEmMemoria(URL_BASE)
  const dadosDaMaria = await conteudo(arquivos, (await meusDados(repo, arquivos, 'pes-maria')).url)

  assert.equal(dadosDaMaria.pessoa.nome, 'Maria Souza')
  assert.equal(dadosDaMaria.participacoes.length, 1)
  assert.equal(dadosDaMaria.participacoes[0].registros.length, 0, 'a batida do João não pode aparecer pra Maria')
})

// ─── Revogar consentimento da busca regional ───────────────────────────────

test('revogar limpa o consentimento de TODAS as participações da pessoa, não só uma', async () => {
  const { repo, pessoa, participacao } = cenarioHenriqueEJuliano()
  repo.eventos.push({
    ...(await repo.eventoPorId(participacao.eventoId))!, id: 'ev-2', nome: 'Manos da Vila', codigoConvite: 'MDV-2026-X1Y2',
  })
  repo.participacoes.push({
    id: 'part-joao-2', pessoaId: pessoa.id, eventoId: 'ev-2', equipeId: 'eq-1', equipeNome: 'Produção',
    funcao: 'Bar', supervisorNome: null, ativo: true, descredenciadoEm: null, valorReceber: 100,
    pago: false, pagoEm: null, qrToken: 'tk-joao-2', cidade: null, criadoEm: '2026-08-20T10:00:00-03:00',
  })
  await repo.registrarConsentimentoDeBase(participacao.id, '2026-09-01T10:00:00-03:00')
  await repo.registrarConsentimentoDeBase('part-joao-2', '2026-08-25T10:00:00-03:00')

  const antes = (await repo.todasAsPessoasDaBase()).find(p => p.cpf === pessoa.cpf)!
  assert.equal(antes.autorizouBaseRegional, true)

  await revogarConsentimentoDeBase(repo, pessoa.id)

  const depois = (await repo.todasAsPessoasDaBase()).find(p => p.cpf === pessoa.cpf)!
  assert.equal(depois.autorizouBaseRegional, false)
})

test('revogar quem nunca autorizou nada não dá erro', async () => {
  const { repo, pessoa } = cenarioHenriqueEJuliano()
  const r = await revogarConsentimentoDeBase(repo, pessoa.id)
  assert.deepEqual(r, {})
})

test('revogar não afeta o consentimento de OUTRA pessoa', async () => {
  const { repo, pessoa, participacao } = cenarioHenriqueEJuliano()
  repo.pessoas.push({ id: 'pes-maria', nome: 'Maria Souza', cpf: '98765432100', telefone: null, fotoPath: null })
  repo.participacoes.push({
    id: 'part-maria', pessoaId: 'pes-maria', eventoId: participacao.eventoId, equipeId: 'eq-1', equipeNome: 'Produção',
    funcao: 'Bar', supervisorNome: null, ativo: true, descredenciadoEm: null, valorReceber: 100,
    pago: false, pagoEm: null, qrToken: 'tk-maria', cidade: null, criadoEm: '2026-08-20T10:00:00-03:00',
  })
  await repo.registrarConsentimentoDeBase('part-maria', '2026-09-01T10:00:00-03:00')

  await revogarConsentimentoDeBase(repo, pessoa.id)

  const maria = (await repo.todasAsPessoasDaBase()).find(p => p.cpf === '98765432100')!
  assert.equal(maria.autorizouBaseRegional, true, 'revogar do João não pode afetar a Maria')
})
