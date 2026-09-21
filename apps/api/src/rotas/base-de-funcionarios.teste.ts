/*
 * Base de funcionários / Encontrar colaborador — só o master, porque
 * atravessa toda organização da plataforma. Agrupado por CPF: a mesma
 * pessoa em vários eventos é UMA linha.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cenarioHenriqueEJuliano } from '../dados/memoria.js'
import {
  atribuirPessoaAoEvento, baseDeFuncionarios, encontrarColaborador, fichaDaPessoaNaBase,
} from './base-de-funcionarios.js'

test('admin não vê a base de funcionários — atravessa organização', async () => {
  const { repo, admin } = cenarioHenriqueEJuliano()
  await assert.rejects(baseDeFuncionarios(repo, admin.id), /permissão/)
  await assert.rejects(encontrarColaborador(repo, admin.id), /permissão/)
  await assert.rejects(fichaDaPessoaNaBase(repo, admin.id, '12345678901'), /permissão/)
  await assert.rejects(atribuirPessoaAoEvento(repo, admin.id, '12345678901', 'eq-1'), /permissão/)
})

test('colaborador não vê a base de funcionários', async () => {
  const { repo, pessoa } = cenarioHenriqueEJuliano()
  await assert.rejects(baseDeFuncionarios(repo, pessoa.id), /permissão/)
})

test('master vê quem já foi credenciado, com os indicadores certos', async () => {
  const { repo, master, pessoa } = cenarioHenriqueEJuliano()
  const r = await baseDeFuncionarios(repo, master.id)

  assert.equal(r.total, 1)
  assert.equal(r.pessoas[0]?.nome, pessoa.nome)
  assert.equal(r.pessoas[0]?.eventos, 1)

  const pessoasNaBase = r.indicadores.find(i => i.chave === 'pessoas')
  assert.equal(pessoasNaBase?.valor, 1)
  const recorrentes = r.indicadores.find(i => i.chave === 'recorrentes')
  assert.equal(recorrentes?.valor, 0, 'só um evento — ainda não é recorrente')
})

test('a busca filtra por nome (sem acento) e por CPF', async () => {
  const { repo, master } = cenarioHenriqueEJuliano()
  const porNome = await baseDeFuncionarios(repo, master.id, 'joao')
  assert.equal(porNome.pessoas.length, 1)

  const semAchado = await baseDeFuncionarios(repo, master.id, 'ninguem-com-este-nome')
  assert.equal(semAchado.pessoas.length, 0)

  const porCpf = await baseDeFuncionarios(repo, master.id, '12345678901')
  assert.equal(porCpf.pessoas.length, 1)
})

test('a mesma pessoa em dois eventos conta como UMA linha, com 2 eventos', async () => {
  const { repo, master, pessoa, evento } = cenarioHenriqueEJuliano()

  const segundoEvento = { ...evento, id: 'ev-2', nome: 'Segundo Evento', organizacaoId: 'org-2' }
  repo.eventos.push(segundoEvento)
  repo.equipes.push({ id: 'eq-2', nome: 'Bar', eventoId: 'ev-2' })
  await repo.criarParticipacao({
    pessoaId: pessoa.id, eventoId: 'ev-2', equipeId: 'eq-2', equipeNome: 'Bar',
    funcao: 'Bar', supervisorNome: null, ativo: true, descredenciadoEm: null,
    valorReceber: null, pago: false, pagoEm: null, qrToken: 'tk-joao-2',
    cidade: null, criadoEm: new Date().toISOString(),
  })

  const r = await baseDeFuncionarios(repo, master.id)
  assert.equal(r.total, 1)
  assert.equal(r.pessoas[0]?.eventos, 2)

  const recorrentes = r.indicadores.find(i => i.chave === 'recorrentes')
  assert.equal(recorrentes?.valor, 1)
})

// ─── Encontrar colaborador ──────────────────────────────────────────────────

test('encontrarColaborador filtra por cidade', async () => {
  const { repo, master } = cenarioHenriqueEJuliano()
  // O cenário já tem João em Vitória (ver `cenarioHenriqueEJuliano`).
  const emVitoria = await encontrarColaborador(repo, master.id, { cidade: 'vitoria' })
  assert.equal(emVitoria.pessoas.length, 1)

  const emOutraCidade = await encontrarColaborador(repo, master.id, { cidade: 'Recife' })
  assert.equal(emOutraCidade.pessoas.length, 0)
})

test('eventosTrabalhados só conta quem bateu entrada — cadastro sozinho não basta', async () => {
  const { repo, master, participacao } = cenarioHenriqueEJuliano()

  const semBatida = await encontrarColaborador(repo, master.id)
  assert.equal(semBatida.pessoas[0]?.eventosTrabalhados, 0)

  await repo.gravarRegistro({
    id: 'reg-1', participacaoId: participacao.id, tipo: 'entrada',
    dataRef: '2026-09-05', registradoEm: '2026-09-05T10:00:00-03:00',
    fotoPath: null, lat: null, lng: null, manual: false,
  })

  const comBatida = await encontrarColaborador(repo, master.id)
  assert.equal(comBatida.pessoas[0]?.eventosTrabalhados, 1)
  const comHistorico = comBatida.indicadores.find(i => i.chave === 'com_historico')
  assert.equal(comHistorico?.valor, 1)
})

// ─── Ficha da pessoa ────────────────────────────────────────────────────────

test('ficha de CPF que não está na base lança', async () => {
  const { repo, master } = cenarioHenriqueEJuliano()
  await assert.rejects(fichaDaPessoaNaBase(repo, master.id, '00000000000'), /Não encontramos/)
})

test('a ficha traz o histórico, e não mostra valor pago', async () => {
  const { repo, master, pessoa } = cenarioHenriqueEJuliano()
  const r = await fichaDaPessoaNaBase(repo, master.id, pessoa.cpf)

  assert.equal(r.nome, pessoa.nome)
  assert.equal(r.trabalhos.length, 1)
  assert.equal(r.trabalhos[0]?.evento, 'Henrique e Juliano — Kleber Andrade')
  assert.equal(r.jaNosEventos.length, 1)
  assert.ok(!('valorReceber' in r.trabalhos[0]!), 'ficha da base não mostra valor pago')
})

// ─── Atribuir pessoa a um evento ────────────────────────────────────────────

test('recusa atribuir CPF que não está na base', async () => {
  const { repo, master } = cenarioHenriqueEJuliano()
  const r = await atribuirPessoaAoEvento(repo, master.id, '00000000000', 'eq-1')
  assert.match(r.erro ?? '', /Não encontramos ninguém/)
})

test('recusa setor inexistente', async () => {
  const { repo, master, pessoa } = cenarioHenriqueEJuliano()
  const r = await atribuirPessoaAoEvento(repo, master.id, pessoa.cpf, 'eq-fantasma')
  assert.match(r.erro ?? '', /Não encontramos este setor/)
})

test('recusa quem já está no evento', async () => {
  const { repo, master, pessoa } = cenarioHenriqueEJuliano()
  const r = await atribuirPessoaAoEvento(repo, master.id, pessoa.cpf, 'eq-1')
  assert.match(r.erro ?? '', /já está neste evento/)
})

test('atribui a pessoa a um setor de outro evento — sempre ativa, sem teto', async () => {
  const { repo, master, pessoa, evento } = cenarioHenriqueEJuliano()
  const segundoEvento = { ...evento, id: 'ev-2', nome: 'Segundo Evento' }
  repo.eventos.push(segundoEvento)
  repo.equipes.push({ id: 'eq-2', nome: 'Bar', eventoId: 'ev-2' })

  const r = await atribuirPessoaAoEvento(repo, master.id, pessoa.cpf, 'eq-2')
  assert.equal(r.erro, undefined)
  assert.equal(r.resultado?.evento, 'Segundo Evento')
  assert.equal(r.resultado?.setor, 'Bar')
  assert.equal(r.resultado?.ativo, true)

  const participacoes = await repo.participacoesDaPessoa(pessoa.id)
  assert.ok(participacoes.some(p => p.eventoId === 'ev-2'))
})
