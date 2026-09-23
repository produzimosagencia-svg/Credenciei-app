/*
 * O endpoint de bater ponto.
 *
 * É o que mais precisa estar certo: um erro aqui vira pessoa sem registro no
 * fechamento, ou batida contada duas vezes na folha de pagamento.
 *
 * SÓ O MEIO passa por aqui — ver o tipo de `PedidoDeBatida`. As outras duas
 * etapas têm portas próprias, cada uma com a sua trava, e são testadas lá:
 * entrada em `registrarEntradaLivre`, no fim deste arquivo; saída em
 * `escanear.teste.ts`.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { batidaDeTeste, cenarioHenriqueEJuliano, type RepositorioEmMemoria } from '../dados/memoria.js'
import {
  contestarBatida, registrarBatida, registrarEntradaLivre, DIVERGENCIA_TOLERADA_MS,
} from './batidas.js'

const bate = (
  registradoEm: string,
  id = `b-${Math.random()}`,
  participacaoId = 'part-joao',
) => ({ id, participacaoId, tipo: 'meio' as const, registradoEm })

/**
 * A entrada do dia, posta direto no repositório.
 *
 * O meio é contado a partir dela, então quase todo teste daqui precisa de uma
 * — e ela não pode mais ser criada por esta rota.
 */
function comEntrada(repo: RepositorioEmMemoria, em: string, participacaoId = 'part-joao') {
  repo.registros.push(batidaDeTeste(participacaoId, 'entrada', em))
}

// ─── Segurança, que vem antes de tudo ───────────────────────────────────────

test('participação de outra pessoa é recusada', async () => {
  const { repo } = cenarioHenriqueEJuliano()
  const r = await registrarBatida(repo, 'pes-outra-pessoa', bate('2026-09-03T13:00:00-03:00'))
  assert.equal(r.situacao, 'recusado')
})

test('a recusa não revela se a participação existe', async () => {
  // Responder diferente para "não existe" e "não é sua" entregaria um jeito de
  // varrer ids até descobrir quais existem.
  const { repo } = cenarioHenriqueEJuliano()
  const naoExiste = await registrarBatida(repo, 'pes-joao', bate('2026-09-03T13:00:00-03:00', 'x', 'part-inexistente'))
  const deOutra = await registrarBatida(repo, 'pes-outra', bate('2026-09-03T13:00:00-03:00'))

  assert.equal(naoExiste.situacao, 'recusado')
  assert.equal(deOutra.situacao, 'recusado')
  assert.equal(
    naoExiste.situacao === 'recusado' ? naoExiste.motivo : '',
    deOutra.situacao === 'recusado' ? deOutra.motivo : '',
    'as duas respostas precisam ser idênticas',
  )
})

test('quem foi descredenciado não bate mais', async () => {
  const { repo, participacao } = cenarioHenriqueEJuliano()
  participacao.descredenciadoEm = '2026-09-06T05:00:00-03:00'

  const r = await registrarBatida(repo, 'pes-joao', bate('2026-09-03T13:00:00-03:00'))
  assert.match(r.situacao === 'recusado' ? r.motivo : '', /vínculo com este evento já foi encerrado/)
})

test('cadastro não ativado não bate', async () => {
  const { repo, participacao } = cenarioHenriqueEJuliano()
  participacao.ativo = false

  const r = await registrarBatida(repo, 'pes-joao', bate('2026-09-03T13:00:00-03:00'))
  assert.match(r.situacao === 'recusado' ? r.motivo : '', /não foi ativado/)
})

// ─── Idempotência ───────────────────────────────────────────────────────────

test('o mesmo id volta como duplicado, sem gravar de novo', async () => {
  const { repo } = cenarioHenriqueEJuliano()
  comEntrada(repo, '2026-09-03T08:00:00-03:00')
  const b = bate('2026-09-03T13:00:00-03:00', 'sempre-o-mesmo')

  const um = await registrarBatida(repo, 'pes-joao', b)
  const dois = await registrarBatida(repo, 'pes-joao', b)

  assert.equal(um.situacao, 'registrado')
  assert.equal(dois.situacao, 'duplicado')
  assert.equal(repo.registros.filter(r => r.tipo === 'meio').length, 1, 'uma linha só no banco')
})

test('reenvio ainda é aceito depois de a regra deixar de valer', async () => {
  /*
   * O caso que a ordem das verificações protege.
   *
   * A pessoa bateu o meio às 13:00, com a entrada das 08:00 gravada. A
   * resposta se perdeu. Antes de o celular reenviar, um supervisor corrigiu a
   * entrada pelo ponto assistido — que APAGA a linha antes de reinserir. Se a
   * idempotência viesse DEPOIS das regras, o reenvio bateria em "registre
   * primeiro a sua entrada", e a pessoa perderia o meio por causa de algo que
   * nem dependia dela.
   */
  const { repo } = cenarioHenriqueEJuliano()
  comEntrada(repo, '2026-09-03T08:00:00-03:00')
  const b = bate('2026-09-03T13:00:00-03:00', 'perdida-no-caminho')

  await registrarBatida(repo, 'pes-joao', b, new Date('2026-09-03T13:00:01-03:00'))
  repo.registros = repo.registros.filter(r => r.tipo !== 'entrada')

  const reenvio = await registrarBatida(repo, 'pes-joao', b, new Date('2026-09-03T15:30:00-03:00'))
  assert.equal(reenvio.situacao, 'duplicado')
})

// ─── As regras do meio, vindas do domínio ───────────────────────────────────

test('sem entrada gravada, o meio é recusado', async () => {
  // O meio é contado a partir da entrada — sem ela não há de onde contar.
  const { repo } = cenarioHenriqueEJuliano()
  const r = await registrarBatida(repo, 'pes-joao', bate('2026-09-03T13:00:00-03:00'))
  assert.match(r.situacao === 'recusado' ? r.motivo : '', /Registre primeiro a sua entrada/)
})

test('o meio é entrada + 4h, individual', async () => {
  const { repo } = cenarioHenriqueEJuliano()
  comEntrada(repo, '2026-09-03T08:30:00-03:00')

  const cedo = await registrarBatida(repo, 'pes-joao', bate('2026-09-03T12:00:00-03:00'))
  assert.equal(cedo.situacao, 'recusado', 'abre 12:30 para quem entrou 08:30')

  const certo = await registrarBatida(repo, 'pes-joao', bate('2026-09-03T12:35:00-03:00'))
  assert.equal(certo.situacao, 'registrado')
})

test('o meio ABRE num horário, mas não FECHA', async () => {
  /*
   * Igual ao site. O ponto do meio é o horário ficar gravado, para conferir a
   * jornada com a pessoa depois; fechar a janela faria quem passou da hora
   * perder o registro de vez, sem ganho nenhum. O atraso não some do
   * relatório — as pendências comparam o feito com o esperado.
   */
  const { repo } = cenarioHenriqueEJuliano()
  comEntrada(repo, '2026-09-03T08:00:00-03:00')

  const tarde = await registrarBatida(repo, 'pes-joao', bate('2026-09-03T22:00:00-03:00'))
  assert.equal(tarde.situacao, 'registrado')
})

test('o meio da madrugada pertence ao dia da ENTRADA, não ao do relógio', async () => {
  /*
   * O turno que atravessa a meia-noite é o caso central deste sistema: show
   * que começa 22:00 e termina de madrugada. O meio abre entrada + 4h, então
   * quem entrou às 22:00 do dia 5 bate o meio às 02:00 do dia 6 — e ele
   * pertence ao dia 5, que é o turno que ainda está aberto.
   *
   * Se o dia saísse do relógio, o servidor procuraria a entrada no dia 6, não
   * acharia, e recusaria com "registre primeiro a sua entrada" — para a
   * pessoa que acabou de entrar. É a mesma regra que o site aplica em
   * `resolverRegistro` (`entradaDoTurno` manda no `dataRef`).
   */
  const { repo } = cenarioHenriqueEJuliano()
  comEntrada(repo, '2026-09-05T22:00:00-03:00')

  const r = await registrarBatida(repo, 'pes-joao', bate('2026-09-06T02:10:00-03:00'))

  assert.equal(r.situacao, 'registrado')
  assert.equal(repo.registros.find(x => x.tipo === 'meio')?.dataRef, '2026-09-05')
})

test('a recusa do meio não conta a fórmula', async () => {
  // Dizer "abre 4h depois da entrada" ensina a burlar: bastaria bater a
  // entrada, ir embora e voltar no minuto certo.
  const { repo } = cenarioHenriqueEJuliano()
  comEntrada(repo, '2026-09-03T08:00:00-03:00')

  const r = await registrarBatida(repo, 'pes-joao', bate('2026-09-03T09:00:00-03:00'))
  const motivo = r.situacao === 'recusado' ? r.motivo : ''
  // Procura a CONTA, não a palavra "hora" — a mensagem diz "quando chegar a
  // hora" de propósito, e isso não entrega nada.
  assert.ok(!/4|quatro\s+horas|4h/i.test(motivo), `vazou a regra: "${motivo}"`)
})

// ─── Offline e os dois relógios ─────────────────────────────────────────────

test('o dia sai do relógio do aparelho, não do servidor', async () => {
  /*
   * Bateu 23:50 sem sinal, sincronizou 00:10. Se o dia saísse do relógio do
   * servidor, a batida cairia no dia 4 — e o dia 4 tem jornada, mas a entrada
   * dela pertence ao dia 3. O turno da pessoa ficaria partido em dois.
   */
  const { repo } = cenarioHenriqueEJuliano()
  comEntrada(repo, '2026-09-03T19:00:00-03:00')
  await registrarBatida(
    repo, 'pes-joao',
    bate('2026-09-03T23:50:00-03:00'),
    new Date('2026-09-04T00:10:00-03:00'),
  )
  assert.equal(repo.registros.find(r => r.tipo === 'meio')!.dataRef, '2026-09-03')
})

test('os dois horários são gravados', async () => {
  const { repo } = cenarioHenriqueEJuliano()
  comEntrada(repo, '2026-09-03T08:00:00-03:00')
  await registrarBatida(
    repo, 'pes-joao',
    bate('2026-09-03T12:30:00-03:00'),
    new Date('2026-09-03T15:30:00-03:00'), // subiu três horas depois
  )

  const r = repo.registros.find(x => x.tipo === 'meio')!
  assert.equal(r.registradoEm, '2026-09-03T12:30:00-03:00', 'o que vale na folha')
  assert.ok(r.recebidoEm > r.registradoEm, 'e o que o servidor viu')
})

test('relógio no futuro é marcado, não barrado', async () => {
  /*
   * Barrar puniria quem está com o fuso errado no celular — coisa comum — e
   * deixaria a pessoa sem registro. A defesa é tornar visível.
   */
  const { repo } = cenarioHenriqueEJuliano()
  comEntrada(repo, '2026-09-03T03:00:00-03:00')
  const r = await registrarBatida(
    repo, 'pes-joao',
    bate('2026-09-03T20:00:00-03:00'),
    new Date('2026-09-03T08:00:00-03:00'),
  )

  assert.equal(r.situacao, 'registrado', 'a batida existe')
  assert.equal(r.relogioSuspeito, true, 'e fica marcada para conferência')
})

test('atraso normal de sincronização não é marcado como suspeito', async () => {
  const { repo } = cenarioHenriqueEJuliano()
  comEntrada(repo, '2026-09-03T08:00:00-03:00')
  const r = await registrarBatida(
    repo, 'pes-joao',
    bate('2026-09-03T12:30:00-03:00'),
    new Date('2026-09-03T17:30:00-03:00'), // cinco horas sem sinal
  )
  assert.equal(r.relogioSuspeito, undefined)
  assert.ok(5 * 3600e3 < DIVERGENCIA_TOLERADA_MS)
})

// ─── Batida livre no dia do evento ──────────────────────────────────────────
//
// A regra veio do sistema web em 30/08/2026, pedida para o Henrique e Juliano.
// Estes testes existem porque ela precisa valer também AQUI: se a API recusasse
// o que o site aceita, a pessoa levaria "fora do horário" no celular e passaria
// pela portaria do computador — no mesmo evento, no mesmo minuto.
//
// Eles entram pela entrada livre porque é lá que a janela é avaliada: a rota
// do meio não decide mais nada sobre entrada.

/*
 * Cinco da manhã do DIA DO EVENTO: a janela de entrada abre às 07:00.
 *
 * Tem que ser no dia principal — nos dias de montagem a entrada já é livre, e
 * o teste passaria sem provar nada sobre a janela.
 */
const ANTES_DA_JANELA = '2026-09-05T05:00:00-03:00'

test('sem batida livre, entrada fora da janela é recusada', async () => {
  const { repo, evento } = cenarioHenriqueEJuliano()
  evento.checkin_autonomo = true // para a recusa ser a da JANELA, não a do dia principal

  const r = await registrarEntradaLivre(repo, 'pes-joao', 'part-joao', {}, new Date(ANTES_DA_JANELA))
  assert.equal(r.situacao, 'recusado')
})

test('com batida livre, a mesma entrada passa', async () => {
  // É o show com escala rotativa: a equipe entra a noite inteira, em turnos.
  const { repo, evento } = cenarioHenriqueEJuliano()
  evento.checkin_autonomo = true
  evento.batida_livre = true

  const r = await registrarEntradaLivre(repo, 'pes-joao', 'part-joao', {}, new Date(ANTES_DA_JANELA))
  assert.equal(r.situacao, 'registrado')
})

test('batida livre não libera dia cancelado', async () => {
  // Ela solta o horário, não o calendário. Um dia cancelado que aceitasse
  // presença entraria no cálculo do pagamento.
  const { repo, evento } = cenarioHenriqueEJuliano()
  evento.checkin_autonomo = true
  evento.batida_livre = true
  const dia = (repo.dias.get(evento.id) ?? []).find(d => d.data === '2026-09-05')
  assert.ok(dia, 'o cenário precisa ter o dia do evento')
  dia.cancelado = true

  const r = await registrarEntradaLivre(repo, 'pes-joao', 'part-joao', {}, new Date(ANTES_DA_JANELA))
  assert.equal(r.situacao, 'recusado')
})

// ─── Entrada livre — o auto-atendimento ─────────────────────────────────────

test('fora do dia principal, a entrada livre já funciona sempre', async () => {
  const { repo } = cenarioHenriqueEJuliano()
  const r = await registrarEntradaLivre(
    repo, 'pes-joao', 'part-joao', {}, new Date('2026-09-03T08:00:00-03:00'),
  )
  assert.equal(r.situacao, 'registrado')
})

test('no dia principal, sem o interruptor ligado, a entrada livre é recusada', async () => {
  const { repo } = cenarioHenriqueEJuliano()
  const r = await registrarEntradaLivre(
    repo, 'pes-joao', 'part-joao', {}, new Date('2026-09-05T10:00:00-03:00'),
  )
  assert.match(r.situacao === 'recusado' ? r.motivo : '', /QR Code no credenciamento/)
})

test('no dia principal, com o interruptor ligado, respeita a janela configurada', async () => {
  const { repo, evento } = cenarioHenriqueEJuliano()
  evento.checkin_autonomo = true

  const cedo = await registrarEntradaLivre(repo, 'pes-joao', 'part-joao', {}, new Date(ANTES_DA_JANELA))
  assert.equal(cedo.situacao, 'recusado', 'a janela de entrada só abre às 07:00')

  const certo = await registrarEntradaLivre(
    repo, 'pes-joao', 'part-joao', {}, new Date('2026-09-05T10:00:00-03:00'),
  )
  assert.equal(certo.situacao, 'registrado')
})

test('participação de outra pessoa não registra entrada livre', async () => {
  const { repo } = cenarioHenriqueEJuliano()
  const r = await registrarEntradaLivre(
    repo, 'pes-outra-pessoa', 'part-joao', {}, new Date('2026-09-03T08:00:00-03:00'),
  )
  assert.equal(r.situacao, 'recusado')
})

test('chamar duas vezes no mesmo dia não grava duas entradas', async () => {
  const { repo } = cenarioHenriqueEJuliano()
  const agora = new Date('2026-09-03T08:00:00-03:00')
  const um = await registrarEntradaLivre(repo, 'pes-joao', 'part-joao', {}, agora)
  const dois = await registrarEntradaLivre(repo, 'pes-joao', 'part-joao', {}, agora)

  assert.equal(um.situacao, 'registrado')
  assert.equal(dois.situacao, 'duplicado')
  assert.equal(repo.registros.filter(r => r.tipo === 'entrada').length, 1)
})

test('dia que não é de trabalho recusa a entrada livre', async () => {
  const { repo } = cenarioHenriqueEJuliano()
  const r = await registrarEntradaLivre(
    repo, 'pes-joao', 'part-joao', {}, new Date('2026-08-20T08:00:00-03:00'),
  )
  assert.equal(r.situacao, 'recusado')
})

// ─── Contestar batida ───────────────────────────────────────────────────────
//
// O colaborador contesta a própria batida errada/faltante — recurso só do
// app, escopo decidido com o Juan em 18/09/2026 ([[contestar-batida-em-andamento]]).

test('contesta a própria batida, com motivo', async () => {
  const { repo } = cenarioHenriqueEJuliano()
  const r = await contestarBatida(repo, 'pes-joao', 'part-joao', 'meio', '2026-09-03', 'bati o meio e não gravou')
  assert.deepEqual(r, {})

  const abertas = await repo.contestacoesAbertas('part-joao')
  assert.equal(abertas.length, 1)
  assert.equal(abertas[0]!.tipo, 'meio')
  assert.equal(abertas[0]!.motivo, 'bati o meio e não gravou')
})

test('motivo em branco é recusado, sem gravar nada', async () => {
  const { repo } = cenarioHenriqueEJuliano()
  const r = await contestarBatida(repo, 'pes-joao', 'part-joao', 'entrada', '2026-09-03', '   ')
  assert.match(r.erro ?? '', /Escreva o que está errado/)
  assert.equal((await repo.contestacoesAbertas('part-joao')).length, 0)
})

test('não contesta a batida de outra pessoa — mesma resposta de "não encontrada"', async () => {
  const { repo } = cenarioHenriqueEJuliano()
  const r = await contestarBatida(repo, 'pes-outra-pessoa', 'part-joao', 'entrada', '2026-09-03', 'não bati isso')
  assert.match(r.erro ?? '', /Participação não encontrada/)
  assert.equal((await repo.contestacoesAbertas('part-joao')).length, 0)
})
