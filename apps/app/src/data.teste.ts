/*
 * Data é o tipo de coisa que erra em silêncio.
 *
 * Um fuso ignorado não quebra a tela: ele só mostra o dia errado, e alguém
 * descobre no evento. Por isso os testes aqui usam horários de virada — 23:30 e
 * 00:30 — que são exatamente onde a conta escorrega.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dataCurta, haQuantoTempo, porExtenso } from './data.js'

test('a data por extenso sai em português', () => {
  assert.equal(porExtenso('2026-08-30T12:00:00-03:00'), 'domingo, 30 de agosto')
  assert.equal(porExtenso('2026-09-05T18:30:00-03:00'), 'sábado, 5 de setembro')
  assert.equal(porExtenso('2026-03-01T09:00:00-03:00'), 'domingo, 1 de março')
})

test('o dia é o de Brasília, não o do UTC', () => {
  /*
   * 30/08 às 23:30 em Brasília já é 31/08 em UTC. Sem o desconto de três horas,
   * o painel mostraria "segunda-feira, 31 de agosto" para quem está olhando na
   * noite de domingo.
   */
  assert.equal(porExtenso('2026-08-30T23:30:00-03:00'), 'domingo, 30 de agosto')
  assert.equal(porExtenso('2026-08-31T00:30:00-03:00'), 'segunda-feira, 31 de agosto')
})

test('o mesmo instante escrito em UTC dá o mesmo dia', () => {
  // 2026-08-31T02:30:00Z é 30/08 às 23:30 em Brasília.
  assert.equal(porExtenso('2026-08-31T02:30:00Z'), 'domingo, 30 de agosto')
})

test('a data curta é a dos cartões de evento', () => {
  assert.equal(dataCurta('2026-09-05T18:30:00-03:00'), '05 de set. de 2026')
  assert.equal(dataCurta('2026-08-29T20:00:00-03:00'), '29 de ago. de 2026')
})

test('o tempo relativo responde antes do horário exato', () => {
  const agora = Date.parse('2026-08-30T18:00:00-03:00')
  assert.equal(haQuantoTempo('2026-08-30T18:00:00-03:00', agora), 'agora')
  assert.equal(haQuantoTempo('2026-08-30T17:57:00-03:00', agora), 'há 3 min')
  assert.equal(haQuantoTempo('2026-08-30T16:00:00-03:00', agora), 'há 2 h')
  assert.equal(haQuantoTempo('2026-08-29T18:00:00-03:00', agora), 'ontem')
  assert.equal(haQuantoTempo('2026-08-27T18:00:00-03:00', agora), 'há 3 dias')
})

test('relógio adiantado do aparelho não vira "há -5 min"', () => {
  // O relógio do celular pode estar à frente do servidor. Um número negativo
  // na tela é o tipo de coisa que faz a pessoa desconfiar do sistema inteiro.
  const agora = Date.parse('2026-08-30T18:00:00-03:00')
  assert.equal(haQuantoTempo('2026-08-30T18:05:00-03:00', agora), 'agora')
})
