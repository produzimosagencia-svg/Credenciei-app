/*
 * A camada de ORGANIZAÇÃO de "Funções ligadas" — a tela de Configurações
 * (master-only) e a leitura das duas camadas de override que valem para um
 * acesso. A régua real (o que cada camada faz valer) é testada em
 * `packages/dominio/src/permissoes.teste.ts`; aqui é só a rota: quem pode
 * entrar, o que ela grava e o que devolve.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cenarioHenriqueEJuliano } from '../dados/memoria.js'
import { minhasPermissoes, permissoesDaOrganizacao, salvarPermissaoDaOrganizacao } from './configuracoes.js'
import { criarAcesso } from './acessos.js'

test('só o master abre Configurações', async () => {
  const { repo, admin, pessoa } = cenarioHenriqueEJuliano()
  await assert.rejects(() => permissoesDaOrganizacao(repo, admin.id, null), /Só o master/)
  await assert.rejects(() => permissoesDaOrganizacao(repo, pessoa.id, null), /Só o master/)
  await assert.rejects(() => salvarPermissaoDaOrganizacao(repo, admin.id, null, 'supervisor', 'escanear', true), /Só o master/)
})

test('a lista de organizações vem junto — é o seletor de escopo da tela', async () => {
  const { repo, master } = cenarioHenriqueEJuliano()
  const r = await permissoesDaOrganizacao(repo, master.id, null)
  assert.ok(r.organizacoes.some(o => o.nome === 'Produzimos'))
  assert.deepEqual(r.salvas, [])
})

test('liga uma exceção, aparece na leitura, some quando volta ao padrão', async () => {
  const { repo, master } = cenarioHenriqueEJuliano()

  const r1 = await salvarPermissaoDaOrganizacao(repo, master.id, 'org-1', 'supervisor', 'escanear', true)
  assert.equal(r1.erro, undefined)

  const lidas = await permissoesDaOrganizacao(repo, master.id, 'org-1')
  assert.deepEqual(lidas.salvas, [{ organizacaoId: 'org-1', papel: 'supervisor', chave: 'escanear', permitido: true }])

  // `permitido: null` apaga a linha — volta ao padrão do código.
  await salvarPermissaoDaOrganizacao(repo, master.id, 'org-1', 'supervisor', 'escanear', null)
  const depois = await permissoesDaOrganizacao(repo, master.id, 'org-1')
  assert.deepEqual(depois.salvas, [])
})

test('o padrão da PLATAFORMA (organizacaoId nulo) é um escopo à parte', async () => {
  const { repo, master } = cenarioHenriqueEJuliano()
  await salvarPermissaoDaOrganizacao(repo, master.id, null, 'suporte', 'gerenciar_veiculos', false)

  const daPlataforma = await permissoesDaOrganizacao(repo, master.id, null)
  assert.equal(daPlataforma.salvas.length, 1)

  const deOrg1 = await permissoesDaOrganizacao(repo, master.id, 'org-1')
  assert.equal(deOrg1.salvas.length, 0, 'a exceção da plataforma não aparece como "salva" de uma organização')
})

test('papel fora do catálogo configurável, ou chave que não existe, é recusado', async () => {
  const { repo, master } = cenarioHenriqueEJuliano()
  const r1 = await salvarPermissaoDaOrganizacao(repo, master.id, 'org-1', 'master', 'escanear', true)
  assert.match(r1.erro ?? '', /não é configurável/)

  const r2 = await salvarPermissaoDaOrganizacao(repo, master.id, 'org-1', 'supervisor', 'chave-inventada', true)
  assert.match(r2.erro ?? '', /desconhecida/)
})

test('organização inexistente é recusada', async () => {
  const { repo, master } = cenarioHenriqueEJuliano()
  const r = await salvarPermissaoDaOrganizacao(repo, master.id, 'org-fantasma', 'supervisor', 'escanear', true)
  assert.match(r.erro ?? '', /não encontrada/)
})

test('minhasPermissoes devolve as duas camadas deste acesso — vazio pra quem não tem override nenhum', async () => {
  const { repo, admin } = cenarioHenriqueEJuliano()
  const semNada = await minhasPermissoes(repo, admin.id)
  assert.deepEqual(semNada, { permissoesUsuario: {}, permissoesOrganizacao: {} })
})

test('minhasPermissoes reflete a exceção da organização de quem pergunta', async () => {
  const { repo, master, admin } = cenarioHenriqueEJuliano()
  await salvarPermissaoDaOrganizacao(repo, master.id, 'org-1', 'supervisor', 'escanear', true)

  const criado = await criarAcesso(repo, admin.id, {
    funcao: 'supervisor', nome: 'Larissa Prado', cpf: '65498732100', telefone: '27999887766',
    eventoId: 'ev-hj', setorId: 'eq-1', ativo: true,
  })

  const dela = await minhasPermissoes(repo, criado.acesso!.id)
  assert.deepEqual(dela.permissoesOrganizacao, { 'supervisor:escanear': true })
  assert.deepEqual(dela.permissoesUsuario, {})
})
