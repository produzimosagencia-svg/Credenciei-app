import { test } from 'node:test'
import assert from 'node:assert/strict'
import { distanciaEntreCpfs, TOLERANCIA_DE_CPF } from './busca.js'

test('CPF idêntico tem distância zero', () => {
  assert.equal(distanciaEntreCpfs('15432144794', '15432144794'), 0)
})

test('um dígito trocado no meio conta um', () => {
  assert.equal(distanciaEntreCpfs('15432144794', '15432184794'), 1)
})

test('dois dígitos trocados contam dois', () => {
  assert.equal(distanciaEntreCpfs('15432144794', '15432184714'), 2)
})

test('CPF incompleto nunca entra como aproximado', () => {
  assert.equal(distanciaEntreCpfs('154321447', '15432144794'), Number.POSITIVE_INFINITY)
  assert.equal(distanciaEntreCpfs('', '15432144794'), Number.POSITIVE_INFINITY)
})

test('dígito deslocado não é a mesma coisa que dígito trocado', () => {
  // Distância de Hamming, não de edição: inserir/remover um dígito desloca o
  // resto, e cada posição deslocada conta como diferente — de propósito, para
  // não confundir "trocou um número" com "digitou um a mais".
  assert.equal(distanciaEntreCpfs('15432144794', '11543214479'), 9)
})

test('a tolerância padrão é dois algarismos', () => {
  assert.equal(TOLERANCIA_DE_CPF, 2)
})
