import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validarCpf } from './format.js'

test('CPF com os dígitos verificadores certos passa', () => {
  // O próprio CPF de exemplo do projeto (CLAUDE.md) — de propósito, para não
  // inventar outro número.
  assert.ok(validarCpf('154.321.447-94'))
  assert.ok(validarCpf('111.444.777-35'))
})

test('um dígito verificador errado é recusado', () => {
  assert.ok(!validarCpf('111.444.777-34'))
})

test('onze dígitos que não formam um CPF de verdade são recusados', () => {
  // Antes da checksum voltar, isto passava — era exatamente o problema:
  // um CPF digitado errado virava um cadastro "fantasma" que ninguém acha.
  assert.ok(!validarCpf('123.456.789-00'))
})

test('sequência repetida (111.111.111-11) é recusada, mesmo com checksum válido', () => {
  assert.ok(!validarCpf('111.111.111-11'))
})

test('menos ou mais de 11 dígitos é recusado', () => {
  assert.ok(!validarCpf('123'))
  assert.ok(!validarCpf('154.321.447-940'))
})

test('funciona com ou sem máscara — só os dígitos importam', () => {
  assert.equal(validarCpf('15432144794'), validarCpf('154.321.447-94'))
})
