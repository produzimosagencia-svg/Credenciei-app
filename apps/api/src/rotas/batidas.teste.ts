/*
 * O endpoint de bater ponto.
 *
 * É o que mais precisa estar certo: um erro aqui vira pessoa sem registro no
 * fechamento, ou batida contada duas vezes na folha de pagamento.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cenarioHenriqueEJuliano } from '../dados/memoria.js'
import { registrarBatida, DIVERGENCIA_TOLERADA_MS } from './batidas.js'

const bate = (
  tipo: 'entrada' | 'meio' | 'fim',
  registradoEm: string,
  id = `b-${Math.random()}`,
  participacaoId = 'part-joao',
) => ({ id, participacaoId, tipo, registradoEm })

// ─── Segurança, que vem antes de tudo ───────────────────────────────────────

test('participação de outra pessoa é recusada', async () => {
  const { repo } = cenarioHenriqueEJuliano()
  const r = await registrarBatida(repo, 'pes-outra-pessoa', bate('entrada', '2026-09-03T08:00:00-03:00'))
  assert.equal(r.situacao, 'recusado')
})

test('a recusa não revela se a participação existe', async () => {
  // Responder diferente para "não existe" e "não é sua" entregaria um jeito de
  // varrer ids até descobrir quais existem.
  const { repo } = cenarioHenriqueEJuliano()
  const naoExiste = await registrarBatida(repo, 'pes-joao', bate('entrada', '2026-09-03T08:00:00-03:00', 'x', 'part-inexistente'))
  const deOutra = await registrarBatida(repo, 'pes-outra', bate('entrada', '2026-09-03T08:00:00-03:00'))

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

  const r = await registrarBatida(repo, 'pes-joao', bate('entrada', '2026-09-03T08:00:00-03:00'))
  assert.match(r.situacao === 'recusado' ? r.motivo : '', /vínculo com este evento já foi encerrado/)
})

test('cadastro não ativado não bate', async () => {
  const { repo, participacao } = cenarioHenriqueEJuliano()
  participacao.ativo = false

  const r = await registrarBatida(repo, 'pes-joao', bate('entrada', '2026-09-03T08:00:00-03:00'))
  assert.match(r.situacao === 'recusado' ? r.motivo : '', /não foi ativado/)
})

// ─── Idempotência ───────────────────────────────────────────────────────────

test('o mesmo id volta como duplicado, sem gravar de novo', async () => {
  const { repo } = cenarioHenriqueEJuliano()
  const b = bate('entrada', '2026-09-03T08:00:00-03:00', 'sempre-o-mesmo')

  const um = await registrarBatida(repo, 'pes-joao', b)
  const dois = await registrarBatida(repo, 'pes-joao', b)

  assert.equal(um.situacao, 'registrado')
  assert.equal(dois.situacao, 'duplicado')
  assert.equal(repo.registros.length, 1, 'uma linha só no banco')
})

test('reenvio depois de a janela fechar ainda é aceito', async () => {
  /*
   * O caso que a ordem das verificações protege.
   *
   * A pessoa bateu a entrada às 20:00, dentro da janela. A resposta se perdeu.
   * O celular reenvia às 23:58 — depois de a janela fechar às 23:55. Se a
   * idempotência viesse DEPOIS das regras, ela seria recusada: a pessoa bateu
   * no horário e perderia o registro por causa da rede dela.
   */
  const { repo } = cenarioHenriqueEJuliano()
  const b = bate('entrada', '2026-09-05T20:00:00-03:00', 'perdida-no-caminho')

  await registrarBatida(repo, 'pes-joao', b, new Date('2026-09-05T20:00:01-03:00'))
  const reenvio = await registrarBatida(repo, 'pes-joao', b, new Date('2026-09-05T23:58:00-03:00'))

  assert.equal(reenvio.situacao, 'duplicado')
})

// ─── As regras, vindas do domínio ───────────────────────────────────────────

test('montagem aceita entrada e saída a qualquer hora', async () => {
  const { repo } = cenarioHenriqueEJuliano()

  const e = await registrarBatida(repo, 'pes-joao', bate('entrada', '2026-09-03T06:30:00-03:00'))
  assert.equal(e.situacao, 'registrado')

  await registrarBatida(repo, 'pes-joao', bate('meio', '2026-09-03T11:00:00-03:00'))
  const s = await registrarBatida(repo, 'pes-joao', bate('fim', '2026-09-03T22:40:00-03:00'))
  assert.equal(s.situacao, 'registrado')
})

test('o dia do evento respeita a janela configurada', async () => {
  const { repo } = cenarioHenriqueEJuliano()

  const cedo = await registrarBatida(repo, 'pes-joao', bate('entrada', '2026-09-05T05:00:00-03:00'))
  assert.equal(cedo.situacao, 'recusado', 'a entrada abre 07:00')

  const certo = await registrarBatida(repo, 'pes-joao', bate('entrada', '2026-09-05T10:00:00-03:00'))
  assert.equal(certo.situacao, 'registrado')
})

test('o meio é entrada + 4h, individual', async () => {
  const { repo } = cenarioHenriqueEJuliano()
  await registrarBatida(repo, 'pes-joao', bate('entrada', '2026-09-03T08:30:00-03:00'))

  const cedo = await registrarBatida(repo, 'pes-joao', bate('meio', '2026-09-03T12:00:00-03:00'))
  assert.equal(cedo.situacao, 'recusado', 'abre 12:30 para quem entrou 08:30')

  const certo = await registrarBatida(repo, 'pes-joao', bate('meio', '2026-09-03T12:35:00-03:00'))
  assert.equal(certo.situacao, 'registrado')
})

test('a recusa do meio não conta a fórmula', async () => {
  // Dizer "abre 4h depois da entrada" ensina a burlar: bastaria bater a
  // entrada, ir embora e voltar no minuto certo.
  const { repo } = cenarioHenriqueEJuliano()
  await registrarBatida(repo, 'pes-joao', bate('entrada', '2026-09-03T08:00:00-03:00'))

  const r = await registrarBatida(repo, 'pes-joao', bate('meio', '2026-09-03T09:00:00-03:00'))
  const motivo = r.situacao === 'recusado' ? r.motivo : ''
  // Procura a CONTA, não a palavra "hora" — a mensagem diz "quando chegar a
  // hora" de propósito, e isso não entrega nada.
  assert.ok(!/4|quatro\s+horas|4h/i.test(motivo), `vazou a regra: "${motivo}"`)
})

test('a saída exige o meio', async () => {
  const { repo } = cenarioHenriqueEJuliano()
  await registrarBatida(repo, 'pes-joao', bate('entrada', '2026-09-03T08:00:00-03:00'))

  const semMeio = await registrarBatida(repo, 'pes-joao', bate('fim', '2026-09-03T18:00:00-03:00'))
  assert.match(semMeio.situacao === 'recusado' ? semMeio.motivo : '', /Registre o meio antes de sair/)
})

test('dia que não é de trabalho recusa', async () => {
  const { repo } = cenarioHenriqueEJuliano()
  const r = await registrarBatida(repo, 'pes-joao', bate('entrada', '2026-08-20T08:00:00-03:00'))
  assert.match(r.situacao === 'recusado' ? r.motivo : '', /não está marcado como dia de trabalho/)
})

// ─── Offline e os dois relógios ─────────────────────────────────────────────

test('o dia sai do relógio do aparelho, não do servidor', async () => {
  /*
   * Bateu 23:50 sem sinal, sincronizou 00:10. Se o dia saísse do relógio do
   * servidor, a batida cairia no dia 4 — e o dia 4 tem jornada, mas a entrada
   * dela pertence ao dia 3. O turno da pessoa ficaria partido em dois.
   */
  const { repo } = cenarioHenriqueEJuliano()
  await registrarBatida(
    repo, 'pes-joao',
    bate('entrada', '2026-09-03T23:50:00-03:00'),
    new Date('2026-09-04T00:10:00-03:00'),
  )
  assert.equal(repo.registros[0]!.dataRef, '2026-09-03')
})

test('os dois horários são gravados', async () => {
  const { repo } = cenarioHenriqueEJuliano()
  await registrarBatida(
    repo, 'pes-joao',
    bate('entrada', '2026-09-03T08:00:00-03:00'),
    new Date('2026-09-03T11:00:00-03:00'), // subiu três horas depois
  )

  const r = repo.registros[0]!
  assert.equal(r.registradoEm, '2026-09-03T08:00:00-03:00', 'o que vale na folha')
  assert.ok(r.recebidoEm > r.registradoEm, 'e o que o servidor viu')
})

test('relógio no futuro é marcado, não barrado', async () => {
  /*
   * Barrar puniria quem está com o fuso errado no celular — coisa comum — e
   * deixaria a pessoa sem registro. A defesa é tornar visível.
   */
  const { repo } = cenarioHenriqueEJuliano()
  const r = await registrarBatida(
    repo, 'pes-joao',
    bate('entrada', '2026-09-03T20:00:00-03:00'),
    new Date('2026-09-03T08:00:00-03:00'),
  )

  assert.equal(r.situacao, 'registrado', 'a batida existe')
  assert.equal(r.relogioSuspeito, true, 'e fica marcada para conferência')
})

test('atraso normal de sincronização não é marcado como suspeito', async () => {
  const { repo } = cenarioHenriqueEJuliano()
  const r = await registrarBatida(
    repo, 'pes-joao',
    bate('entrada', '2026-09-03T08:00:00-03:00'),
    new Date('2026-09-03T13:00:00-03:00'), // cinco horas sem sinal
  )
  assert.equal(r.relogioSuspeito, undefined)
  assert.ok(5 * 3600e3 < DIVERGENCIA_TOLERADA_MS)
})

// ─── Um dia inteiro ─────────────────────────────────────────────────────────

test('o ciclo completo de um dia de montagem', async () => {
  const { repo } = cenarioHenriqueEJuliano()

  assert.equal((await registrarBatida(repo, 'pes-joao', bate('entrada', '2026-09-03T12:00:00-03:00'))).situacao, 'registrado')
  assert.equal((await registrarBatida(repo, 'pes-joao', bate('meio', '2026-09-03T16:05:00-03:00'))).situacao, 'registrado')
  assert.equal((await registrarBatida(repo, 'pes-joao', bate('fim', '2026-09-03T18:37:00-03:00'))).situacao, 'registrado')

  const doDia = await repo.registrosDoDia('part-joao', '2026-09-03')
  assert.deepEqual(doDia.map(r => r.tipo), ['entrada', 'meio', 'fim'])
})

// ─── Batida livre no dia do evento ──────────────────────────────────────────
//
// A regra veio do sistema web em 30/08/2026, pedida para o Henrique e Juliano.
// Estes testes existem porque ela precisa valer também AQUI: se a API recusasse
// o que o site aceita, a pessoa levaria "fora do horário" no celular e passaria
// pela portaria do computador — no mesmo evento, no mesmo minuto.

/*
 * Cinco da manhã do DIA DO EVENTO: a janela de entrada abre às 07:00.
 *
 * Tem que ser no dia principal — nos dias de montagem a entrada já é livre, e
 * o teste passaria sem provar nada sobre a janela.
 */
const ANTES_DA_JANELA = '2026-09-05T05:00:00-03:00'

test('sem batida livre, entrada fora da janela é recusada', async () => {
  const { repo } = cenarioHenriqueEJuliano()
  const r = await registrarBatida(repo, 'pes-joao', bate('entrada', ANTES_DA_JANELA))
  assert.equal(r.situacao, 'recusado')
})

test('com batida livre, a mesma entrada passa', async () => {
  // É o show com escala rotativa: a equipe entra a noite inteira, em turnos.
  const { repo, evento } = cenarioHenriqueEJuliano()
  evento.batida_livre = true

  const r = await registrarBatida(repo, 'pes-joao', bate('entrada', ANTES_DA_JANELA))
  assert.equal(r.situacao, 'registrado')
})

test('batida livre não libera dia cancelado', async () => {
  // Ela solta o horário, não o calendário. Um dia cancelado que aceitasse
  // presença entraria no cálculo do pagamento.
  const { repo, evento } = cenarioHenriqueEJuliano()
  evento.batida_livre = true
  const dia = (repo.dias.get(evento.id) ?? []).find(d => d.data === '2026-09-05')
  assert.ok(dia, 'o cenário precisa ter o dia do evento')
  dia.cancelado = true

  const r = await registrarBatida(repo, 'pes-joao', bate('entrada', ANTES_DA_JANELA))
  assert.equal(r.situacao, 'recusado')
})
