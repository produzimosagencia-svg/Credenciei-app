import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  cpfParaEmail, identificadorParaEmail, normalizarUsuario, pareceCpf, validarUsuario,
} from './identificador.js'

test('e-mail passa direto, só em minúsculas', () => {
  assert.equal(identificadorParaEmail('Marina@Produzimos.com.br'), 'marina@produzimos.com.br')
})

test('CPF vira o e-mail interno do supervisor', () => {
  assert.equal(identificadorParaEmail('123.456.789-00'), '12345678900@supervisor.credenciei')
  assert.equal(identificadorParaEmail('12345678900'), cpfParaEmail('12345678900'))
})

test('o que não é e-mail nem CPF vira o usuário antigo', () => {
  assert.equal(identificadorParaEmail('Carlos Silva'), 'carlos.silva@supervisor.credenciei')
})

test('pareceCpf só aceita 11 dígitos', () => {
  assert.equal(pareceCpf('123.456.789-00'), true)
  assert.equal(pareceCpf('carlos.silva'), false)
  assert.equal(pareceCpf('123456789'), false)
})

test('normalizarUsuario tira acento e vira minúsculo, espaço vira ponto', () => {
  assert.equal(normalizarUsuario('João Bar'), 'joao.bar')
  assert.equal(normalizarUsuario('  Débora  Antunes  '), 'debora.antunes')
})

test('validarUsuario recusa curto, longo e com caractere fora da lista', () => {
  assert.match(validarUsuario('') ?? '', /informe/i)
  assert.match(validarUsuario('ab') ?? '', /3 caracteres/)
  assert.match(validarUsuario('a'.repeat(33)) ?? '', /32 caracteres/)
  assert.equal(validarUsuario('joao.bar-2'), null)
})
