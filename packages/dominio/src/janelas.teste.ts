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
  diaBRT, janelaMeio, faseDoDia, faseAtualDoQR, avaliarEntradaSaida,
  conferirHorariosDoEvento, ehDiaPrincipal, horariosEsperados, periodoDoEvento,
  inferirMomentoDoScanner, type RegistroParaInferencia,
  HORAS_ATE_MEIO, janelaDeOperacaoDoEvento, diaDeReferenciaAssistida,
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

test('o QR de evento que vira a noite não recusa na virada do dia', () => {
  // O evento começa dia 29, termina de madrugada no dia 30. `faseDoDia`
  // sozinho jogaria o dia 30 inteiro pra "desmontagem" — errado, o crachá
  // ainda precisa validar como "evento" enquanto o evento não terminou.
  const inicio = '2026-08-29T20:00:00-03:00'
  const fim = '2026-08-30T06:00:00-03:00'

  assert.equal(
    faseAtualDoQR(new Date('2026-08-29T22:00:00-03:00'), inicio, fim), 'evento',
    'dentro do dia principal',
  )
  assert.equal(
    faseAtualDoQR(new Date('2026-08-30T02:00:00-03:00'), inicio, fim), 'evento',
    'depois da meia-noite, mas antes do fim — é aqui que faseDoDia sozinho erraria',
  )
  assert.equal(
    faseAtualDoQR(new Date('2026-08-30T07:00:00-03:00'), inicio, fim), 'desmontagem',
    'depois do horário real de término',
  )
})

test('faseAtualDoQR sem data de fim cai de volta na regra do dia', () => {
  const inicio = '2026-08-29T20:00:00-03:00'
  assert.equal(faseAtualDoQR(new Date('2026-08-29T22:00:00-03:00'), inicio, null), 'evento')
  assert.equal(faseAtualDoQR(new Date('2026-08-30T02:00:00-03:00'), inicio, null), 'desmontagem')
})

test('faseAtualDoQR antes do evento é sempre montagem', () => {
  assert.equal(
    faseAtualDoQR(new Date('2026-08-25T10:00:00-03:00'), '2026-08-29T20:00:00-03:00', null),
    'montagem',
  )
  assert.equal(faseAtualDoQR(new Date(), null, null), 'montagem', 'sem data de início')
})

// ─── O que a leitura do crachá significa ────────────────────────────────────
// Cada teste aqui é um caso real que já quebrou a portaria uma vez.

/** Fora da carência de todo mundo, pra não precisar repetir em cada caso. */
const FOLGA_MS = 10 * 60_000

test('primeira leitura do dia é entrada', () => {
  const r = inferirMomentoDoScanner([], '2026-09-05', new Date('2026-09-05T18:30:00-03:00'))
  assert.deepEqual(r, { momento: 'entrada' })
})

test('entrada em aberto, fora da carência, vira saída', () => {
  const registros: RegistroParaInferencia[] = [
    { id: 'r1', tipo: 'entrada', em: '2026-09-05T18:30:00-03:00', dataRef: '2026-09-05' },
  ]
  const agora = new Date(new Date('2026-09-05T18:30:00-03:00').getTime() + FOLGA_MS)
  assert.deepEqual(inferirMomentoDoScanner(registros, '2026-09-05', agora), { momento: 'fim' })
})

test('entrada recém-batida: segunda leitura na carência é recusada, não vira saída', () => {
  // O QR fica na tela, o operador aponta a câmera de novo — sem a carência,
  // isso viraria uma saída falsa um segundo depois da entrada.
  const registros: RegistroParaInferencia[] = [
    { id: 'r1', tipo: 'entrada', em: '2026-09-05T18:30:00-03:00', dataRef: '2026-09-05' },
  ]
  const agora = new Date('2026-09-05T18:31:00-03:00') // 1 min depois
  const r = inferirMomentoDoScanner(registros, '2026-09-05', agora)
  assert.ok('erro' in r)
  assert.match(r.erro, /acabou de registrar a ENTRADA/)
})

test('o turno que vira a madrugada: saída pertence à entrada de ontem, não vira nova entrada', () => {
  // Entrou 22:00 do dia 5, ainda não bateu saída. Já é madrugada do dia 6.
  const registros: RegistroParaInferencia[] = [
    { id: 'r1', tipo: 'entrada', em: '2026-09-05T22:00:00-03:00', dataRef: '2026-09-05' },
  ]
  const agora = new Date('2026-09-06T04:00:00-03:00')
  assert.deepEqual(inferirMomentoDoScanner(registros, '2026-09-06', agora), { momento: 'fim' })
})

test('o BUG que a ordem corrige: turno fechado de ontem não bloqueia o dia de hoje', () => {
  /*
   * A primeira versão da regra (produção, 03/09/2026) perguntava só "o
   * último turno já tem saída?" — turno de ontem à tarde (fechado) fazia
   * hoje de manhã ser recusado com "já registrou entrada e saída hoje",
   * mesmo sem nenhum registro de hoje.
   */
  const registros: RegistroParaInferencia[] = [
    { id: 'r1', tipo: 'entrada', em: '2026-09-04T17:00:00-03:00', dataRef: '2026-09-04' },
    { id: 'r2', tipo: 'fim', em: '2026-09-04T20:00:00-03:00', dataRef: '2026-09-04' },
  ]
  const agora = new Date('2026-09-05T08:00:00-03:00') // manhã seguinte, TETO_TURNO_H (18h) já passou
  assert.deepEqual(inferirMomentoDoScanner(registros, '2026-09-05', agora), { momento: 'entrada' })
})

test('sai no almoço e volta à tarde: reabre o turno, não recusa', () => {
  const registros: RegistroParaInferencia[] = [
    { id: 'r1', tipo: 'entrada', em: '2026-09-05T08:00:00-03:00', dataRef: '2026-09-05' },
    { id: 'r2', tipo: 'fim', em: '2026-09-05T12:00:00-03:00', dataRef: '2026-09-05' },
  ]
  const agora = new Date(new Date('2026-09-05T12:00:00-03:00').getTime() + FOLGA_MS)
  const r = inferirMomentoDoScanner(registros, '2026-09-05', agora)
  assert.ok('reabrir' in r)
  assert.equal(r.reabrir.registroId, 'r2', 'aponta pra saída certa a apagar')
  assert.equal(r.reabrir.em, '2026-09-05T12:00:00-03:00')
})

test('saída recém-batida: segunda leitura na carência é recusada, não reabre à toa', () => {
  const registros: RegistroParaInferencia[] = [
    { id: 'r1', tipo: 'entrada', em: '2026-09-05T08:00:00-03:00', dataRef: '2026-09-05' },
    { id: 'r2', tipo: 'fim', em: '2026-09-05T20:00:00-03:00', dataRef: '2026-09-05' },
  ]
  const agora = new Date('2026-09-05T20:02:00-03:00') // 2 min depois
  const r = inferirMomentoDoScanner(registros, '2026-09-05', agora)
  assert.ok('erro' in r)
  assert.match(r.erro, /acabou de registrar a SAÍDA/)
})

test('dobra o turno: sai de manhã e volta de noite no mesmo dia — a entrada da noite é a que conta', () => {
  // Caso real (03/09/2026): sai 08:46 da manhã, volta 18:21 da noite. Se a
  // regra perguntasse só "existe saída neste dia?", acharia a saída da
  // MANHÃ e mandaria "entrada" de novo pra quem está de volta à noite —
  // jogando fora o controle do turno da noite.
  const registros: RegistroParaInferencia[] = [
    { id: 'r1', tipo: 'entrada', em: '2026-09-05T00:30:00-03:00', dataRef: '2026-09-05' },
    { id: 'r2', tipo: 'fim', em: '2026-09-05T08:46:00-03:00', dataRef: '2026-09-05' },
    { id: 'r3', tipo: 'entrada', em: '2026-09-05T18:21:00-03:00', dataRef: '2026-09-05' },
  ]
  const agora = new Date(new Date('2026-09-05T18:21:00-03:00').getTime() + FOLGA_MS)
  assert.deepEqual(inferirMomentoDoScanner(registros, '2026-09-05', agora), { momento: 'fim' })
})

// ─── O dia do registro assistido ────────────────────────────────────────────

test('entrada assistida é sempre hoje, mesmo com um turno velho em aberto', () => {
  const registros: RegistroParaInferencia[] = [
    { id: 'r1', tipo: 'entrada', em: '2026-09-04T17:00:00-03:00', dataRef: '2026-09-04' },
  ]
  const agora = new Date('2026-09-05T08:00:00-03:00')
  assert.equal(diaDeReferenciaAssistida(registros, 'entrada', '2026-09-05', agora), '2026-09-05')
})

test('meio/saída assistidos herdam o dia da entrada AINDA ABERTA', () => {
  // Entrou 22h do dia 5, sem saída ainda — o supervisor lança a saída de
  // madrugada pelo assistido: pertence ao dia 5, não ao dia 6 do relógio.
  const registros: RegistroParaInferencia[] = [
    { id: 'r1', tipo: 'entrada', em: '2026-09-05T22:00:00-03:00', dataRef: '2026-09-05' },
  ]
  const agora = new Date('2026-09-06T04:00:00-03:00')
  assert.equal(diaDeReferenciaAssistida(registros, 'fim', '2026-09-06', agora), '2026-09-05')
  assert.equal(diaDeReferenciaAssistida(registros, 'meio', '2026-09-06', agora), '2026-09-05')
})

test('o BUG que esta regra corrige: turno de ontem já fechado não puxa a entrada de hoje para trás', () => {
  const registros: RegistroParaInferencia[] = [
    { id: 'r1', tipo: 'entrada', em: '2026-09-04T17:00:00-03:00', dataRef: '2026-09-04' },
    { id: 'r2', tipo: 'fim', em: '2026-09-04T20:00:00-03:00', dataRef: '2026-09-04' },
  ]
  const agora = new Date('2026-09-05T08:00:00-03:00')
  assert.equal(diaDeReferenciaAssistida(registros, 'entrada', '2026-09-05', agora), '2026-09-05')
})

test('sem nenhum turno aberto, meio/saída assistidos caem em hoje', () => {
  const agora = new Date('2026-09-05T08:00:00-03:00')
  assert.equal(diaDeReferenciaAssistida([], 'fim', '2026-09-05', agora), '2026-09-05')
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

// ─── A janela de operação, para o Painel ───────────────────────────────────

test('a janela de operação usa o menor início e o maior fim entre as janelas configuradas', () => {
  const evento = {
    nome: 'Henrique e Juliano',
    janela_entrada_inicio: '2026-09-05T07:00:00-03:00',
    janela_entrada_fim: '2026-09-05T23:55:00-03:00',
    janela_fim_inicio: '2026-09-06T01:30:00-03:00',
    janela_fim_fim: '2026-09-06T08:00:00-03:00',
  }
  const j = janelaDeOperacaoDoEvento(evento)
  assert.equal(j?.de, new Date('2026-09-05T07:00:00-03:00').toISOString())
  assert.equal(j?.ate, new Date('2026-09-06T08:00:00-03:00').toISOString())
  assert.equal(j?.nome, 'Henrique e Juliano')
})

test('sem nenhuma janela configurada, cai para as datas do evento', () => {
  const j = janelaDeOperacaoDoEvento({
    nome: 'Evento sem horário',
    data_inicio: '2026-08-29T18:00:00-03:00',
    data_fim: '2026-08-30T02:00:00-03:00',
  })
  assert.equal(j?.de, new Date('2026-08-29T18:00:00-03:00').toISOString())
  assert.equal(j?.ate, new Date('2026-08-30T02:00:00-03:00').toISOString())
})

test('sem evento, ou sem nada para calcular a janela, devolve null', () => {
  assert.equal(janelaDeOperacaoDoEvento(null), null)
  assert.equal(janelaDeOperacaoDoEvento({}), null)
  // Fim antes (ou igual a) do início é dado ruim — não vira janela invertida.
  assert.equal(janelaDeOperacaoDoEvento({
    data_inicio: '2026-08-30T18:00:00-03:00', data_fim: '2026-08-29T18:00:00-03:00',
  }), null)
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


// ─── Batida livre no dia do evento ──────────────────────────────────────────
//
// Veio do sistema web em 30/08/2026, pedida para o Henrique e Juliano: show
// grande, escala rotativa, gente entrando a noite inteira em turnos. Uma janela
// fixa recusaria quem chega às três da manhã — e ser recusado no portão, com o
// show acontecendo, é o pior momento possível para descobrir que o horário
// estava apertado.
//
// A regra tem que existir AQUI, e não só no site: o app e a API usam esta mesma
// função. Se ela ficasse só lá, o portão do celular recusaria exatamente quem o
// computador aceita — e ninguém entenderia por quê.

const EVENTO_COM_JANELA = {
  data_inicio: '2026-09-05T18:30:00-03:00',
  data_fim: '2026-09-06T08:00:00-03:00',
  janela_entrada_inicio: '2026-09-05T07:00:00-03:00',
  janela_entrada_fim: '2026-09-05T23:55:00-03:00',
  janela_fim_inicio: '2026-09-06T01:30:00-03:00',
  janela_fim_fim: '2026-09-06T08:00:00-03:00',
}

const DIA_PRINCIPAL = { tipo: 'principal' as const, cancelado: false }
/** Três da manhã: fora da janela de entrada, que fecha 23:55. */
const TRES_DA_MANHA = new Date('2026-09-06T03:00:00-03:00')

test('sem batida livre, quem chega às três da manhã é recusado', () => {
  // É o comportamento de sempre, e ele precisa continuar existindo: a maioria
  // dos eventos entra junto, e a janela é o que segura quem tenta bater de casa.
  const v = avaliarEntradaSaida(
    EVENTO_COM_JANELA, DIA_PRINCIPAL, 'entrada', '2026-09-05', TRES_DA_MANHA,
  )
  assert.equal(v.ok, false)
})

test('com batida livre, o dia do evento aceita a qualquer hora', () => {
  const v = avaliarEntradaSaida(
    { ...EVENTO_COM_JANELA, batida_livre: true },
    DIA_PRINCIPAL, 'entrada', '2026-09-05', TRES_DA_MANHA,
  )
  assert.equal(v.ok, true)
})

test('batida livre vale também para a saída', () => {
  const fimDaTarde = new Date('2026-09-05T17:00:00-03:00')
  const travado = avaliarEntradaSaida(
    EVENTO_COM_JANELA, DIA_PRINCIPAL, 'fim', '2026-09-05', fimDaTarde,
  )
  assert.equal(travado.ok, false)

  const livre = avaliarEntradaSaida(
    { ...EVENTO_COM_JANELA, batida_livre: true },
    DIA_PRINCIPAL, 'fim', '2026-09-05', fimDaTarde,
  )
  assert.equal(livre.ok, true)
})

test('batida livre solta o HORÁRIO, não o calendário', () => {
  /*
   * Dia não marcado e dia cancelado continuam recusados. Se a batida livre
   * passasse por cima disso, um evento com escala rotativa aceitaria presença
   * em dia que ninguém contratou — e o dia entra no cálculo do pagamento.
   */
  const livre = { ...EVENTO_COM_JANELA, batida_livre: true }

  const semDia = avaliarEntradaSaida(livre, null, 'entrada', '2026-09-05', TRES_DA_MANHA)
  assert.equal(semDia.ok, false)

  const cancelado = avaliarEntradaSaida(
    livre, { tipo: 'principal', cancelado: true }, 'entrada', '2026-09-05', TRES_DA_MANHA,
  )
  assert.equal(cancelado.ok, false)
})

test('só `true` liga a batida livre', () => {
  // A coluna do banco pode vir nula em evento antigo. Nulo e ausente são
  // "desligado" — do contrário, todo evento anterior ao ALTER TABLE ficaria
  // sem trava de horário sem ninguém ter pedido.
  for (const valor of [undefined, null, false] as const) {
    const v = avaliarEntradaSaida(
      { ...EVENTO_COM_JANELA, batida_livre: valor },
      DIA_PRINCIPAL, 'entrada', '2026-09-05', TRES_DA_MANHA,
    )
    assert.equal(v.ok, false, `batida_livre=${String(valor)} não podia liberar`)
  }
})

test('os horários continuam valendo como referência', () => {
  /*
   * Com a batida livre ligada, a pessoa bate quando chega — mas continua sendo
   * ESPERADA no horário combinado. É assim que ela ainda aparece na lista de
   * atrasados, e é por isso que os horários não foram apagados do evento.
   */
  const comum = horariosEsperados(EVENTO_COM_JANELA, '2026-09-05', DIA_PRINCIPAL)
  const livre = horariosEsperados(
    { ...EVENTO_COM_JANELA, batida_livre: true },
    '2026-09-05',
    DIA_PRINCIPAL,
  )
  assert.deepEqual(livre, comum)
  assert.ok(comum.entrada, 'o horário esperado tinha que existir para o teste valer')
})
