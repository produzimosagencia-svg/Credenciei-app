/*
 * As regras que decidem se alguém pode bater ponto.
 *
 * Cada teste aqui existe por causa de um caso real de operação, não por
 * cobertura. Onde o comentário cita um evento, é porque a regra nasceu de algo
 * que deu errado naquele evento — e quebrar isso silenciosamente é o jeito mais
 * fácil de repetir o erro.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  diaBRT, janelaMeio, faseDoDia, avaliarEntradaSaida,
  conferirHorariosDoEvento, ehDiaPrincipal, periodoDoEvento,
  HORAS_ATE_MEIO,
} from './janelas.js'

// ─── O fuso ─────────────────────────────────────────────────────────────────
// O servidor roda em UTC. Às 22:00 de Brasília já é o dia seguinte lá, e uma
// batida cairia no dia errado — o que joga a pessoa para fora da escala.

test('a virada do dia é em Brasília, não em UTC', () => {
  assert.equal(diaBRT('2026-08-30T01:00:00+00:00'), '2026-08-29', '22:00 BRT ainda é dia 29')
  assert.equal(diaBRT('2026-08-30T02:59:00+00:00'), '2026-08-29')
  assert.equal(diaBRT('2026-08-30T03:00:00+00:00'), '2026-08-30')
})

// ─── O meio ─────────────────────────────────────────────────────────────────
// Entrada + 4h, individual. A equipe não entra junta: um horário fixo cobraria
// a selfie de quem chegou às 15:00 no mesmo instante em que cobra de quem
// chegou às 11:00.

test('meio é sempre a entrada real + 4h', () => {
  const casos: [string, string][] = [
    ['07:30', '11:30'], ['08:00', '12:00'], ['08:15', '12:15'],
    ['10:00', '14:00'], ['11:30', '15:30'], ['12:00', '16:00'],
  ]
  for (const [entrada, esperado] of casos) {
    const j = janelaMeio(`2026-08-26T${entrada}:00-03:00`)
    const hhmm = new Date(new Date(j.inicio).getTime() - 3 * 3600e3).toISOString().slice(11, 16)
    assert.equal(hhmm, esperado, `entrada ${entrada}`)
  }
  assert.equal(HORAS_ATE_MEIO, 4)
})

test('o meio atravessa a meia-noite sem escorregar', () => {
  // Turno da madrugada: entra 22:00, o meio cai às 02:00 do dia seguinte.
  const j = janelaMeio('2026-08-29T22:00:00-03:00')
  assert.equal(diaBRT(j.inicio), '2026-08-30')
})

// ─── As etapas ──────────────────────────────────────────────────────────────

test('a etapa é decidida pela data, sem ação do produtor', () => {
  const principal = '2026-08-29'
  assert.equal(faseDoDia('2026-08-26', principal), 'montagem')
  assert.equal(faseDoDia(principal, principal), 'evento')
  assert.equal(faseDoDia('2026-08-30', principal), 'desmontagem')
})

test('dia principal é a data de início do evento', () => {
  const evento = { data_inicio: '2026-08-30T01:00:00+00:00' } // 22:00 BRT do dia 29
  assert.ok(ehDiaPrincipal(evento, '2026-08-29'))
  assert.ok(!ehDiaPrincipal(evento, '2026-08-30'))
})

test('evento sem data de fim vale por um dia só', () => {
  const p = periodoDoEvento({ data_inicio: '2026-08-29T18:00:00-03:00' })
  assert.deepEqual(p, { primeiro: '2026-08-29', ultimo: '2026-08-29' })
})

// ─── Quem pode bater ────────────────────────────────────────────────────────

test('dia não marcado recusa a batida', () => {
  // É o que sustenta "estava escalado para 5 dias e veio em 4" no fechamento.
  const v = avaliarEntradaSaida({}, null, 'entrada', '2026-08-20', new Date())
  assert.ok(!v.ok && /não está marcado como dia de trabalho/.test(v.erro))
})

test('dia cancelado recusa, com motivo próprio', () => {
  const v = avaliarEntradaSaida({}, { tipo: 'preparacao', cancelado: true }, 'entrada', '2026-08-26', new Date())
  assert.ok(!v.ok && /cancelado/.test(v.erro))
})

test('montagem tem entrada e saída livres o dia inteiro', () => {
  const dia = { tipo: 'preparacao' as const, cancelado: false }
  for (const h of ['06:00', '12:00', '19:00', '23:30']) {
    const agora = new Date(`2026-08-26T${h}:00-03:00`)
    assert.ok(avaliarEntradaSaida({}, dia, 'entrada', '2026-08-26', agora).ok, `entrada ${h}`)
    assert.ok(avaliarEntradaSaida({}, dia, 'fim', '2026-08-26', agora).ok, `saída ${h}`)
  }
})

test('dia principal respeita a janela configurada', () => {
  const evento = {
    janela_entrada_inicio: '2026-08-29T07:00:00-03:00',
    janela_entrada_fim: '2026-08-29T20:00:00-03:00',
  }
  const dia = { tipo: 'principal' as const, cancelado: false }
  const dentro = avaliarEntradaSaida(evento, dia, 'entrada', '2026-08-29', new Date('2026-08-29T10:00:00-03:00'))
  assert.ok(dentro.ok)

  const cedo = avaliarEntradaSaida(evento, dia, 'entrada', '2026-08-29', new Date('2026-08-29T06:00:00-03:00'))
  assert.ok(!cedo.ok && /abre às 07:00/.test(cedo.erro), 'a recusa precisa dizer o horário')

  const tarde = avaliarEntradaSaida(evento, dia, 'entrada', '2026-08-29', new Date('2026-08-29T21:00:00-03:00'))
  assert.ok(!tarde.ok && /encerrou às 20:00/.test(tarde.erro))
})

test('sem horário configurado, o dia principal não trava', () => {
  const dia = { tipo: 'principal' as const, cancelado: false }
  assert.ok(avaliarEntradaSaida({}, dia, 'entrada', '2026-08-29', new Date()).ok)
})

// ─── A conferência de horários ──────────────────────────────────────────────
// Nasceu do erro real do Kleber Andrade: a saída ficou marcada para a
// madrugada do dia 5 quando o show só começava às 18:30 daquele dia.

test('pega a saída marcada antes de o evento começar', () => {
  const p = conferirHorariosDoEvento({
    data_inicio: '2026-09-05T18:30:00-03:00',
    data_fim: '2026-09-06T08:00:00-03:00',
    janela_fim_inicio: '2026-09-05T01:30:00-03:00',
    janela_fim_fim: '2026-09-05T08:00:00-03:00',
  }).filter(x => x.bloqueia)
  assert.equal(p.length, 1)
  assert.match(p[0]!.mensagem, /saída termina antes de o evento começar/)
  assert.match(p[0]!.mensagem, /DIA SEGUINTE/, 'a mensagem precisa dizer a causa, não só o sintoma')
})

test('a configuração corrigida passa limpa', () => {
  const r = conferirHorariosDoEvento({
    data_inicio: '2026-09-05T18:30:00-03:00',
    data_fim: '2026-09-06T08:00:00-03:00',
    janela_entrada_inicio: '2026-09-05T07:00:00-03:00',
    janela_entrada_fim: '2026-09-05T23:55:00-03:00',
    janela_fim_inicio: '2026-09-06T01:30:00-03:00',
    janela_fim_fim: '2026-09-06T08:00:00-03:00',
  })
  assert.equal(r.filter(x => x.bloqueia).length, 0)
})

test('evento terminando antes de começar é bloqueado', () => {
  const p = conferirHorariosDoEvento({
    data_inicio: '2026-09-05T18:00:00-03:00',
    data_fim: '2026-09-05T10:00:00-03:00',
  }).filter(x => x.bloqueia)
  assert.match(p[0]!.mensagem, /terminando antes de começar/)
})

test('a conferência não atrapalha quem está certo', () => {
  // Evento noturno normal: nem bloqueio, nem alerta.
  const r = conferirHorariosDoEvento({
    data_inicio: '2026-10-10T20:00:00-03:00',
    data_fim: '2026-10-11T02:00:00-03:00',
    janela_entrada_inicio: '2026-10-10T16:00:00-03:00',
    janela_entrada_fim: '2026-10-10T21:00:00-03:00',
    janela_fim_inicio: '2026-10-11T00:00:00-03:00',
    janela_fim_fim: '2026-10-11T04:00:00-03:00',
  })
  assert.equal(r.length, 0)
})

test('evento sem horários não gera falso alarme', () => {
  assert.equal(conferirHorariosDoEvento({}).length, 0)
  assert.equal(conferirHorariosDoEvento({ data_inicio: '2026-09-05T18:30:00-03:00' }).length, 0)
})
