/*
 * A conta do orçamento.
 *
 * É dinheiro que vai num PDF com a marca da agência, para o cliente. Errar
 * aqui não dá erro em lugar nenhum — sai uma proposta com o número errado.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  descontoQuePodeSerGravado, numeroDoOrcamento, statusDeOrcamentoValido,
  subtotalDoOrcamento, totalDoOrcamento,
} from './orcamentos.js'

const BASE = {
  valorDia: 1000,
  valorFuncionario: 2,
  valorTecnico: 300,
  dias: 1,
  desconto: 0,
  itens: [] as { valor: number }[],
}

test('as três diárias somam e multiplicam pelos dias', () => {
  assert.equal(subtotalDoOrcamento(BASE), 1302)
  assert.equal(subtotalDoOrcamento({ ...BASE, dias: 3 }), 3906)
})

test('item adicional NÃO multiplica pelos dias', () => {
  /*
   * A distinção que o site faz e que é fácil perder na cópia: diária é por
   * dia, item avulso entra uma vez. Cobrar um projetor três vezes porque o
   * evento tem três dias é erro que chega ao cliente.
   */
  const comItem = { ...BASE, dias: 3, itens: [{ valor: 500 }] }
  assert.equal(subtotalDoOrcamento(comItem), 3906 + 500)
})

test('o desconto abate do subtotal', () => {
  assert.equal(totalDoOrcamento({ ...BASE, desconto: 100 }), 1202)
})

test('desconto maior que o orçamento não vira total negativo', () => {
  // Sem o piso, um dedo pesado no desconto gravaria valor negativo no banco
  // e mandaria isso num PDF pro cliente.
  assert.equal(totalDoOrcamento({ ...BASE, desconto: 99999 }), 0)
})

test('dias inválido conta como um dia, em vez de zerar o orçamento', () => {
  // Campo vazio na tela chega como 0. Multiplicar por zero apagaria as três
  // diárias e mostraria só os avulsos — silenciosamente.
  assert.equal(subtotalDoOrcamento({ ...BASE, dias: 0 }), 1302)
})

test('status desconhecido vira rascunho', () => {
  assert.equal(statusDeOrcamentoValido('aprovado'), 'aprovado')
  assert.equal(statusDeOrcamentoValido('coisa-que-nao-existe'), 'rascunho')
  assert.equal(statusDeOrcamentoValido(null), 'rascunho')
})

test('o número sai com seis casas', () => {
  assert.equal(numeroDoOrcamento(3), '#000003')
  assert.equal(numeroDoOrcamento(123456), '#123456')
})

test('o desconto gravado nunca passa do subtotal nem fica negativo', () => {
  // O site apara na ESCRITA, não só na exibição: sem isso o banco guardaria
  // "desconto de 99.999" num orçamento de 1.302, e cada tela que recalcula
  // mostraria um número diferente do que foi enviado ao cliente.
  assert.equal(descontoQuePodeSerGravado(100, 1302), 100)
  assert.equal(descontoQuePodeSerGravado(99999, 1302), 1302)
  assert.equal(descontoQuePodeSerGravado(-50, 1302), 0)
})
