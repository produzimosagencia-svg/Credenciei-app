/*
 * Veículos — só cadastro e consulta. O condutor precisa já estar
 * credenciado no evento; a placa é única por evento.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cenarioHenriqueEJuliano } from '../dados/memoria.js'
import {
  buscarCondutorPorCpf, cadastrarVeiculo, eventosParaVeiculos, excluirVeiculo, veiculosDoEvento,
} from './veiculos.js'

const DADOS = { cpf: '123.456.789-01', placa: 'ABC1D23', modelo: 'HB20' }

test('supervisor não gerencia veículos', async () => {
  const { repo, evento } = cenarioHenriqueEJuliano()
  repo.perfis.push({ id: 'auth-sup', nome: 'Carlos', papel: 'supervisor', organizacaoId: 'org-1', ativo: true })
  await assert.rejects(veiculosDoEvento(repo, 'auth-sup', evento.id), /permissão/)
})

test('admin de outra organização não vê os veículos', async () => {
  const { repo, evento } = cenarioHenriqueEJuliano()
  repo.perfis.push({ id: 'auth-outro', nome: 'Bia', papel: 'admin', organizacaoId: 'org-2', ativo: true })
  await assert.rejects(veiculosDoEvento(repo, 'auth-outro', evento.id), /Não encontramos/)
})

test('condutor não credenciado no evento é recusado com a mensagem certa', async () => {
  const { repo, evento, admin } = cenarioHenriqueEJuliano()
  const r = await buscarCondutorPorCpf(repo, admin.id, evento.id, '99988877766')
  assert.match(r.erro ?? '', /Cadastre a pessoa na equipe/)
})

test('acha o condutor credenciado no evento', async () => {
  const { repo, evento, admin, pessoa } = cenarioHenriqueEJuliano()
  const r = await buscarCondutorPorCpf(repo, admin.id, evento.id, pessoa.cpf)
  assert.equal(r.condutor?.nome, pessoa.nome)
  assert.equal(r.condutor?.setorNome, 'Produção')
})

test('recusa placa em formato inválido', async () => {
  const { repo, evento, admin } = cenarioHenriqueEJuliano()
  const r = await cadastrarVeiculo(repo, admin.id, evento.id, { ...DADOS, placa: '1234' })
  assert.match(r.erro ?? '', /Placa inválida/)
})

test('cadastra o veículo do condutor credenciado', async () => {
  const { repo, evento, admin, pessoa } = cenarioHenriqueEJuliano()
  const r = await cadastrarVeiculo(repo, admin.id, evento.id, { ...DADOS, cpf: pessoa.cpf })
  assert.equal(r.erro, undefined)
  assert.equal(r.placa, 'ABC1D23')
  assert.equal(r.condutor, pessoa.nome)

  const lista = await veiculosDoEvento(repo, admin.id, evento.id)
  assert.equal(lista.veiculos.length, 1)
  assert.equal(lista.veiculos[0]!.placa, 'ABC1D23')
})

test('recusa placa duplicada no mesmo evento', async () => {
  const { repo, evento, admin, pessoa } = cenarioHenriqueEJuliano()
  await cadastrarVeiculo(repo, admin.id, evento.id, { ...DADOS, cpf: pessoa.cpf })
  const de_novo = await cadastrarVeiculo(repo, admin.id, evento.id, { ...DADOS, cpf: pessoa.cpf, modelo: 'Onix' })
  assert.match(de_novo.erro ?? '', /já está cadastrada/)
})

test('exclui o veículo', async () => {
  const { repo, evento, admin, pessoa } = cenarioHenriqueEJuliano()
  await cadastrarVeiculo(repo, admin.id, evento.id, { ...DADOS, cpf: pessoa.cpf })
  const [veiculo] = (await veiculosDoEvento(repo, admin.id, evento.id)).veiculos
  const r = await excluirVeiculo(repo, admin.id, veiculo!.id, evento.id)
  assert.equal(r.erro, undefined)
  assert.equal((await veiculosDoEvento(repo, admin.id, evento.id)).veiculos.length, 0)
})

test('veículo inexistente recusa a exclusão', async () => {
  const { repo, evento, admin } = cenarioHenriqueEJuliano()
  const r = await excluirVeiculo(repo, admin.id, 'vec-fantasma', evento.id)
  assert.match(r.erro ?? '', /Não encontramos/)
})

test('master vê eventos de todas as organizações', async () => {
  const { repo, master } = cenarioHenriqueEJuliano()
  const eventos = await eventosParaVeiculos(repo, master.id)
  assert.equal(eventos.length, 1)
})
