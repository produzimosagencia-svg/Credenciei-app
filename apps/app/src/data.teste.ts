/*
 * Data é o tipo de coisa que erra em silêncio.
 *
 * Um fuso ignorado não quebra a tela: ele só mostra o dia errado, e alguém
 * descobre no evento. Por isso os testes aqui usam horários de virada — 23:30 e
 * 00:30 — que são exatamente onde a conta escorrega.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  dataCurta, deISO, diaDoInstante, haQuantoTempo, mascararDataBR, mascararHora,
  paraISO, porExtenso,
} from './data.js'

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


// ─── O que a pessoa digita ──────────────────────────────────────────────────

test('a data e a hora se montam enquanto são digitadas', () => {
  assert.equal(mascararDataBR('05092026'), '05/09/2026')
  assert.equal(mascararDataBR('0509'), '05/09')
  assert.equal(mascararHora('1830'), '18:30')
  assert.equal(mascararHora('18'), '18')
})

test('data e hora viram o instante certo em Brasília', () => {
  assert.equal(paraISO('05/09/2026', '18:30'), '2026-09-05T18:30:00-03:00')
})

test('o mês vai e volta sem escorregar', () => {
  /*
   * `partes()` devolve o mês de ZERO a onze, como o JavaScript. Escrever esse
   * número direto na tela transformaria setembro em agosto — e o evento
   * apareceria um mês antes, sem nada denunciar.
   */
  const iso = paraISO('05/09/2026', '18:30')!
  assert.deepEqual(deISO(iso), { data: '05/09/2026', hora: '18:30' })
  assert.equal(diaDoInstante(iso), '2026-09-05')
})

test('janeiro e dezembro também voltam certos', () => {
  // As bordas do array: com o erro de base zero, dezembro viraria novembro e
  // janeiro estouraria a lista.
  assert.deepEqual(deISO(paraISO('01/01/2026', '00:00')), { data: '01/01/2026', hora: '00:00' })
  assert.deepEqual(deISO(paraISO('31/12/2026', '23:59')), { data: '31/12/2026', hora: '23:59' })
})

test('data que não existe devolve nulo, e não uma data inventada', () => {
  /*
   * 31/02 vira 03/03 sozinho no JavaScript. Aceitar isso gravaria um horário
   * de evento em outro dia, sem ninguém perceber.
   */
  assert.equal(paraISO('31/02/2026', '10:00'), null)
  assert.equal(paraISO('05/13/2026', '10:00'), null)
  assert.equal(paraISO('05/09/2026', '25:00'), null)
  assert.equal(paraISO('05/09/2026', '10:75'), null)
})

test('campo incompleto devolve nulo', () => {
  assert.equal(paraISO('05/09', '18:30'), null)
  assert.equal(paraISO('05/09/2026', '18'), null)
  assert.equal(paraISO('', ''), null)
})

test('sem valor, os campos ficam vazios', () => {
  assert.deepEqual(deISO(null), { data: '', hora: '' })
})
