import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cenarioHenriqueEJuliano } from '../dados/memoria.js'
import {
  criarOrcamento, duplicarOrcamento, editarOrcamento, excluirOrcamento, listarOrcamentos,
  orcamentoPorId,
} from './orcamentos.js'
import type { DadosDoOrcamento } from '@credenciei/contrato'

const BASE: DadosDoOrcamento = {
  nomeEvento: 'Fantástico Mundo do Lukão',
  responsavel: 'Lucas Andrade',
  telefone: '27999990000',
  dataEvento: '2026-11-14',
  valorDia: 1000,
  valorFuncionario: 2,
  valorTecnico: 300,
  dias: 1,
  desconto: 0,
  observacoes: null,
  status: 'rascunho',
  itens: [],
}

// ─── Permissão ──────────────────────────────────────────────────────────────

test('só master entra em Orçamentos — nem admin vê', async () => {
  // São os valores comerciais da própria agência: diária, margem, desconto.
  // Um admin de organização cliente não pode ver quanto a Produzimos cobra
  // dos outros.
  const { repo, admin } = cenarioHenriqueEJuliano()
  await assert.rejects(() => listarOrcamentos(repo, admin.id), /acesso/i)
  await assert.rejects(() => criarOrcamento(repo, admin.id, BASE), /acesso/i)
})

test('o colaborador também não entra', async () => {
  const { repo, pessoa } = cenarioHenriqueEJuliano()
  await assert.rejects(() => listarOrcamentos(repo, pessoa.id), /acesso/i)
})

// ─── Criar, ler, listar ─────────────────────────────────────────────────────

test('cria, lista e abre — o total vem recalculado', async () => {
  const { repo, master } = cenarioHenriqueEJuliano()
  const { id, erro } = await criarOrcamento(repo, master.id, {
    ...BASE, dias: 3, itens: [{ descricao: 'Projetor', valor: 500 }],
  })
  assert.equal(erro, undefined)

  const lista = await listarOrcamentos(repo, master.id)
  assert.equal(lista.length, 1)
  assert.equal(lista[0]?.numero, 1)
  assert.equal(lista[0]?.nomeEvento, 'Fantástico Mundo do Lukão')

  const detalhe = await orcamentoPorId(repo, master.id, id!)
  // 1302 × 3 dias = 3906, mais o projetor uma vez só.
  assert.equal(detalhe?.total, 4406)
  assert.equal(detalhe?.itens.length, 1)
})

test('orçamento que não existe volta null, não erro', async () => {
  const { repo, master } = cenarioHenriqueEJuliano()
  assert.equal(await orcamentoPorId(repo, master.id, 'nao-existe'), null)
})

// ─── Validação ──────────────────────────────────────────────────────────────

test('os quatro campos do cabeçalho são obrigatórios', async () => {
  // Sem eles a proposta sai com buraco no lugar do nome do cliente.
  const { repo, master } = cenarioHenriqueEJuliano()
  for (const campo of ['nomeEvento', 'responsavel', 'telefone', 'dataEvento'] as const) {
    const r = await criarOrcamento(repo, master.id, { ...BASE, [campo]: '  ' })
    assert.match(r.erro ?? '', /Informe/, `${campo} deveria ser obrigatório`)
  }
})

test('valor negativo é recusado', async () => {
  const { repo, master } = cenarioHenriqueEJuliano()
  const r = await criarOrcamento(repo, master.id, { ...BASE, valorTecnico: -1 })
  assert.match(r.erro ?? '', /negativ/i)
})

test('linha de item em branco não vira item na proposta', async () => {
  const { repo, master } = cenarioHenriqueEJuliano()
  const { id } = await criarOrcamento(repo, master.id, {
    ...BASE,
    itens: [
      { descricao: 'Projetor', valor: 500 },
      { descricao: '', valor: 300 },          // adicionou e não descreveu
      { descricao: 'Som', valor: 0 },         // descreveu e não pôs valor
    ],
  })
  const detalhe = await orcamentoPorId(repo, master.id, id!)
  assert.deepEqual(detalhe?.itens.map(i => i.descricao), ['Projetor'])
})

test('desconto maior que o orçamento é aparado na GRAVAÇÃO, não só na tela', async () => {
  // Sem aparar aqui, o banco guardaria "desconto de 99.999" num orçamento de
  // 1.302 e cada tela que recalculasse mostraria um número diferente do que
  // foi enviado ao cliente.
  const { repo, master } = cenarioHenriqueEJuliano()
  const { id } = await criarOrcamento(repo, master.id, { ...BASE, desconto: 99999 })
  const detalhe = await orcamentoPorId(repo, master.id, id!)
  assert.equal(detalhe?.desconto, 1302)
  assert.equal(detalhe?.total, 0)
})

test('status desconhecido cai em rascunho, não quebra', async () => {
  const { repo, master } = cenarioHenriqueEJuliano()
  const { id } = await criarOrcamento(repo, master.id, {
    ...BASE, status: 'inventado' as DadosDoOrcamento['status'],
  })
  const detalhe = await orcamentoPorId(repo, master.id, id!)
  assert.equal(detalhe?.status, 'rascunho')
})

// ─── Editar e excluir ───────────────────────────────────────────────────────

test('editar troca os itens inteiros, sem deixar resto do anterior', async () => {
  const { repo, master } = cenarioHenriqueEJuliano()
  const { id } = await criarOrcamento(repo, master.id, {
    ...BASE, itens: [{ descricao: 'Projetor', valor: 500 }, { descricao: 'Som', valor: 200 }],
  })

  const r = await editarOrcamento(repo, master.id, id!, {
    ...BASE, status: 'enviado', itens: [{ descricao: 'Tenda', valor: 900 }],
  })
  assert.equal(r.erro, undefined)

  const detalhe = await orcamentoPorId(repo, master.id, id!)
  assert.deepEqual(detalhe?.itens.map(i => i.descricao), ['Tenda'])
  assert.equal(detalhe?.status, 'enviado')
  assert.equal(detalhe?.total, 1302 + 900)
})

test('editar o que não existe avisa em vez de criar do nada', async () => {
  const { repo, master } = cenarioHenriqueEJuliano()
  const r = await editarOrcamento(repo, master.id, 'nao-existe', BASE)
  assert.match(r.erro ?? '', /não existe/i)
})

test('excluir tira da lista', async () => {
  const { repo, master } = cenarioHenriqueEJuliano()
  const { id } = await criarOrcamento(repo, master.id, BASE)
  assert.equal((await excluirOrcamento(repo, master.id, id!)).erro, undefined)
  assert.equal((await listarOrcamentos(repo, master.id)).length, 0)
})

// ─── Duplicar ───────────────────────────────────────────────────────────────

test('duplicar copia os itens, ganha número novo e volta a rascunho', async () => {
  // O caminho normal da agência: a proposta do ano passado vira a deste ano.
  // Nasce rascunho de propósito, mesmo que a original já esteja aprovada.
  const { repo, master } = cenarioHenriqueEJuliano()
  const { id } = await criarOrcamento(repo, master.id, {
    ...BASE, status: 'aprovado', itens: [{ descricao: 'Projetor', valor: 500 }],
  })

  const copia = await duplicarOrcamento(repo, master.id, id!)
  assert.equal(copia.erro, undefined)
  assert.notEqual(copia.id, id)

  const nova = await orcamentoPorId(repo, master.id, copia.id!)
  assert.equal(nova?.status, 'rascunho')
  assert.equal(nova?.numero, 2)
  assert.deepEqual(nova?.itens.map(i => i.descricao), ['Projetor'])
  assert.equal(nova?.total, 1302 + 500)
})

test('duplicar o que não existe avisa', async () => {
  const { repo, master } = cenarioHenriqueEJuliano()
  const r = await duplicarOrcamento(repo, master.id, 'nao-existe')
  assert.match(r.erro ?? '', /não existe/i)
})
