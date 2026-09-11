import { test } from 'node:test'
import assert from 'node:assert/strict'
import { abreEm, ANTECEDENCIA_MS, conferenciaAberta, diasAteEvento } from './conferencia.js'

const INICIO = '2026-09-05T18:30:00-03:00'

test('abre exatamente 24h antes do início', () => {
  assert.equal(abreEm(INICIO).getTime(), new Date(INICIO).getTime() - ANTECEDENCIA_MS)
})

test('fechada até faltar 24h, aberta a partir daí', () => {
  const antes = new Date(new Date(INICIO).getTime() - ANTECEDENCIA_MS - 1000)
  const noInstante = abreEm(INICIO)
  const depois = new Date(new Date(INICIO).getTime() - ANTECEDENCIA_MS + 1000)

  assert.equal(conferenciaAberta(INICIO, antes), false)
  assert.equal(conferenciaAberta(INICIO, noInstante), true)
  assert.equal(conferenciaAberta(INICIO, depois), true)
})

test('depois que abre, nunca fecha — mesmo bem depois do evento', () => {
  const bemDepois = new Date(new Date(INICIO).getTime() + 30 * 86_400_000)
  assert.equal(conferenciaAberta(INICIO, bemDepois), true)
})

test('dias até o evento conta certo, inclusive negativo depois que passou', () => {
  const doisDiasAntes = new Date(new Date(INICIO).getTime() - 2 * 86_400_000)
  assert.equal(Math.round(diasAteEvento(INICIO, doisDiasAntes)), 2)

  const umDiaDepois = new Date(new Date(INICIO).getTime() + 86_400_000)
  assert.equal(Math.round(diasAteEvento(INICIO, umDiaDepois)), -1)
})
