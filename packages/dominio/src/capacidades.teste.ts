import { test } from 'node:test'
import assert from 'node:assert/strict'
import { capacidadesDoPapel } from './capacidades.js'

test('master não tem aba de funções — nunca é afetado', () => {
  assert.deepEqual(capacidadesDoPapel('master'), [])
})

test('supervisor recebe acompanhar ligado e escanear desligado (o extra que pode ganhar)', () => {
  const caps = capacidadesDoPapel('supervisor')
  const chaves = caps.map(c => c.chave).sort()
  assert.deepEqual(chaves, ['acompanhar', 'escanear'])
  assert.equal(caps.find(c => c.chave === 'acompanhar')?.padraoAtual, true)
  assert.equal(caps.find(c => c.chave === 'escanear')?.padraoAtual, false)
})

test('operador de portão recebe escanear e acompanhar, os dois já ligados', () => {
  const caps = capacidadesDoPapel('operador_portao')
  assert.ok(caps.every(c => c.padraoAtual))
  assert.deepEqual(caps.map(c => c.chave).sort(), ['acompanhar', 'escanear'])
})

test('suporte recebe acompanhar e veículos, os dois já ligados — sem escanear, que não é extra dele', () => {
  const caps = capacidadesDoPapel('suporte')
  assert.ok(caps.every(c => c.padraoAtual))
  assert.deepEqual(caps.map(c => c.chave).sort(), ['acompanhar', 'gerenciar_veiculos'])
})

test('admin tem as três capacidades por padrão — ele só não passa pelo formulário do app, que não o cria', () => {
  const caps = capacidadesDoPapel('admin')
  assert.ok(caps.every(c => c.padraoAtual))
  assert.deepEqual(caps.map(c => c.chave).sort(), ['acompanhar', 'escanear', 'gerenciar_veiculos'])
})
