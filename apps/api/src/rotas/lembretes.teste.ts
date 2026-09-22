/*
 * Lembretes automáticos de entrada e saída — cópia, como push, dos dois
 * primeiros lembretes que o site já manda por WhatsApp (`lib/mensagens.ts`).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cenarioHenriqueEJuliano } from '../dados/memoria.js'
import {
  enviarAlertaSupervisorDeEntrada, enviarAvisoDoDia, enviarLembretesDeEntrada, enviarLembretesDeMeio,
  enviarLembretesDeSaida, type EnviarPush,
} from './lembretes.js'

function coletor() {
  const enviados: { tokens: string[]; titulo: string }[] = []
  const enviarPush: EnviarPush = async (tokens, mensagem) => {
    enviados.push({ tokens, titulo: mensagem.titulo })
  }
  return { enviados, enviarPush }
}

// Evento: janela de entrada fecha 2026-09-05T23:55:00-03:00, dia principal 09-05.
const DENTRO_DA_JANELA = new Date('2026-09-05T22:00:00-03:00') // 1h55 antes do prazo
const CEDO_DEMAIS = new Date('2026-09-05T10:00:00-03:00') // muitas horas antes
const DEPOIS_DO_PRAZO = new Date('2026-09-06T00:30:00-03:00') // já passou

test('manda o push pra quem ainda não bateu entrada, dentro da janela de aviso', async () => {
  const { repo, pessoa, participacao } = cenarioHenriqueEJuliano()
  await repo.registrarTokenDePush(pessoa.id, 'tok-joao', 'android')

  const { enviados, enviarPush } = coletor()
  const r = await enviarLembretesDeEntrada(repo, enviarPush, DENTRO_DA_JANELA)

  assert.equal(r.enviados, 1)
  assert.deepEqual(enviados, [{ tokens: ['tok-joao'], titulo: 'Falta bater a entrada' }])
  assert.equal(await repo.jaEnviouLembreteHoje(participacao.id, 'lembrete_entrada', '2026-09-05'), true)
})

test('cedo demais não manda ainda', async () => {
  const { repo, pessoa } = cenarioHenriqueEJuliano()
  await repo.registrarTokenDePush(pessoa.id, 'tok-joao', 'android')

  const { enviados, enviarPush } = coletor()
  const r = await enviarLembretesDeEntrada(repo, enviarPush, CEDO_DEMAIS)

  assert.equal(r.enviados, 0)
  assert.equal(enviados.length, 0)
})

test('depois do prazo não manda mais — já era', async () => {
  const { repo, pessoa } = cenarioHenriqueEJuliano()
  await repo.registrarTokenDePush(pessoa.id, 'tok-joao', 'android')

  const { enviados, enviarPush } = coletor()
  const r = await enviarLembretesDeEntrada(repo, enviarPush, DEPOIS_DO_PRAZO)

  assert.equal(r.enviados, 0)
  assert.equal(enviados.length, 0)
})

test('sem token de push registrado, não tem pra onde mandar — sem erro', async () => {
  const { repo } = cenarioHenriqueEJuliano()

  const { enviados, enviarPush } = coletor()
  const r = await enviarLembretesDeEntrada(repo, enviarPush, DENTRO_DA_JANELA)

  assert.equal(r.enviados, 0)
  assert.equal(enviados.length, 0)
})

test('quem já bateu entrada não recebe lembrete', async () => {
  const { repo, pessoa, participacao } = cenarioHenriqueEJuliano()
  await repo.registrarTokenDePush(pessoa.id, 'tok-joao', 'android')
  repo.registros.push({
    id: 'reg-1', participacaoId: participacao.id, tipo: 'entrada', dataRef: '2026-09-05',
    registradoEm: '2026-09-05T18:00:00-03:00', recebidoEm: '2026-09-05T18:00:01-03:00',
    fotoPath: null, lat: null, lng: null, manual: false,
  })

  const { enviados, enviarPush } = coletor()
  const r = await enviarLembretesDeEntrada(repo, enviarPush, DENTRO_DA_JANELA)

  assert.equal(r.enviados, 0)
  assert.equal(enviados.length, 0)
})

test('não manda o mesmo lembrete duas vezes no mesmo dia', async () => {
  const { repo, pessoa } = cenarioHenriqueEJuliano()
  await repo.registrarTokenDePush(pessoa.id, 'tok-joao', 'android')

  const { enviarPush } = coletor()
  await enviarLembretesDeEntrada(repo, enviarPush, DENTRO_DA_JANELA)

  const segunda = coletor()
  const r = await enviarLembretesDeEntrada(repo, segunda.enviarPush, DENTRO_DA_JANELA)

  assert.equal(r.enviados, 0)
  assert.equal(segunda.enviados.length, 0)
})

test('evento com batida livre não cobra prazo — não manda lembrete', async () => {
  const { repo, evento, pessoa } = cenarioHenriqueEJuliano()
  evento.batida_livre = true
  await repo.registrarTokenDePush(pessoa.id, 'tok-joao', 'android')

  const { enviados, enviarPush } = coletor()
  const r = await enviarLembretesDeEntrada(repo, enviarPush, DENTRO_DA_JANELA)

  assert.equal(r.enviados, 0)
  assert.equal(enviados.length, 0)
})

// ─── Saída — o mesmo motor, atravessando a meia-noite ──────────────────────
//
// Evento: dia principal 09-05, janela de saída fecha 2026-09-06T08:00:00-03:00
// — depois da virada do dia, então o dia principal (`hoje`, pro relógio) já
// é ONTEM. Sem tratar isso, o lembrete de saída nunca dispararia.

const SAIDA_DENTRO_DA_JANELA = new Date('2026-09-06T07:00:00-03:00') // 1h antes do prazo
const SAIDA_CEDO_DEMAIS = new Date('2026-09-06T02:00:00-03:00')
const SAIDA_DEPOIS_DO_PRAZO = new Date('2026-09-06T09:00:00-03:00')

test('manda o push pra quem ainda não bateu saída, mesmo depois da virada do dia', async () => {
  const { repo, pessoa, participacao } = cenarioHenriqueEJuliano()
  await repo.registrarTokenDePush(pessoa.id, 'tok-joao', 'android')

  const { enviados, enviarPush } = coletor()
  const r = await enviarLembretesDeSaida(repo, enviarPush, SAIDA_DENTRO_DA_JANELA)

  assert.equal(r.enviados, 1)
  assert.deepEqual(enviados, [{ tokens: ['tok-joao'], titulo: 'Falta bater a saída' }])
  // O dia de referência é o principal (09-05), não o calendário de agora (09-06).
  assert.equal(await repo.jaEnviouLembreteHoje(participacao.id, 'lembrete_fim', '2026-09-05'), true)
})

test('saída: cedo demais não manda ainda', async () => {
  const { repo, pessoa } = cenarioHenriqueEJuliano()
  await repo.registrarTokenDePush(pessoa.id, 'tok-joao', 'android')

  const { enviados, enviarPush } = coletor()
  const r = await enviarLembretesDeSaida(repo, enviarPush, SAIDA_CEDO_DEMAIS)

  assert.equal(r.enviados, 0)
  assert.equal(enviados.length, 0)
})

test('saída: depois do prazo não manda mais', async () => {
  const { repo, pessoa } = cenarioHenriqueEJuliano()
  await repo.registrarTokenDePush(pessoa.id, 'tok-joao', 'android')

  const { enviados, enviarPush } = coletor()
  const r = await enviarLembretesDeSaida(repo, enviarPush, SAIDA_DEPOIS_DO_PRAZO)

  assert.equal(r.enviados, 0)
  assert.equal(enviados.length, 0)
})

test('quem já bateu saída (registrada no dia principal) não recebe lembrete', async () => {
  const { repo, pessoa, participacao } = cenarioHenriqueEJuliano()
  await repo.registrarTokenDePush(pessoa.id, 'tok-joao', 'android')
  repo.registros.push({
    id: 'reg-saida', participacaoId: participacao.id, tipo: 'fim', dataRef: '2026-09-05',
    registradoEm: '2026-09-06T06:00:00-03:00', recebidoEm: '2026-09-06T06:00:01-03:00',
    fotoPath: null, lat: null, lng: null, manual: false,
  })

  const { enviados, enviarPush } = coletor()
  const r = await enviarLembretesDeSaida(repo, enviarPush, SAIDA_DENTRO_DA_JANELA)

  assert.equal(r.enviados, 0)
  assert.equal(enviados.length, 0)
})

test('entrada e saída são lembretes independentes — um não bloqueia o outro', async () => {
  const { repo, pessoa } = cenarioHenriqueEJuliano()
  await repo.registrarTokenDePush(pessoa.id, 'tok-joao', 'android')

  await enviarLembretesDeEntrada(repo, coletor().enviarPush, DENTRO_DA_JANELA)

  const { enviados, enviarPush } = coletor()
  const r = await enviarLembretesDeSaida(repo, enviarPush, SAIDA_DENTRO_DA_JANELA)

  assert.equal(r.enviados, 1)
  assert.equal(enviados[0]?.titulo, 'Falta bater a saída')
})

// ─── O meio ─────────────────────────────────────────────────────────────
//
// Janela é da PESSOA, não do evento: entrada às 18:00 abre o meio às 22:00
// e fecha às 00:00 (HORAS_ATE_MEIO=4, DURACAO_JANELA_MEIO_H=2).

function comEntrada(registradoEm = '2026-09-05T18:00:00-03:00') {
  const cenario = cenarioHenriqueEJuliano()
  cenario.repo.registros.push({
    id: 'reg-entrada', participacaoId: cenario.participacao.id, tipo: 'entrada', dataRef: '2026-09-05',
    registradoEm, recebidoEm: registradoEm, fotoPath: null, lat: null, lng: null, manual: false,
  })
  return cenario
}

const MEIO_DENTRO_DA_JANELA = new Date('2026-09-05T23:00:00-03:00') // 1h antes do prazo (00:00)
const MEIO_CEDO_DEMAIS = new Date('2026-09-05T19:00:00-03:00') // a janela nem abriu (abre 22:00)
const MEIO_DEPOIS_DO_PRAZO = new Date('2026-09-06T01:00:00-03:00')

test('manda o push pra quem entrou mas ainda não fez o meio, dentro da janela', async () => {
  const { repo, pessoa, participacao } = comEntrada()
  await repo.registrarTokenDePush(pessoa.id, 'tok-joao', 'android')

  const { enviados, enviarPush } = coletor()
  const r = await enviarLembretesDeMeio(repo, enviarPush, MEIO_DENTRO_DA_JANELA)

  assert.equal(r.enviados, 1)
  assert.deepEqual(enviados, [{ tokens: ['tok-joao'], titulo: 'Falta bater o meio' }])
  assert.equal(await repo.jaEnviouLembreteHoje(participacao.id, 'lembrete_meio', '2026-09-05'), true)
})

test('meio: antes da janela abrir não manda', async () => {
  const { repo, pessoa } = comEntrada()
  await repo.registrarTokenDePush(pessoa.id, 'tok-joao', 'android')

  const { enviados, enviarPush } = coletor()
  const r = await enviarLembretesDeMeio(repo, enviarPush, MEIO_CEDO_DEMAIS)

  assert.equal(r.enviados, 0)
  assert.equal(enviados.length, 0)
})

test('meio: depois do prazo não manda mais', async () => {
  const { repo, pessoa } = comEntrada()
  await repo.registrarTokenDePush(pessoa.id, 'tok-joao', 'android')

  const { enviados, enviarPush } = coletor()
  const r = await enviarLembretesDeMeio(repo, enviarPush, MEIO_DEPOIS_DO_PRAZO)

  assert.equal(r.enviados, 0)
  assert.equal(enviados.length, 0)
})

test('quem já fez o meio não recebe lembrete', async () => {
  const { repo, pessoa, participacao } = comEntrada()
  await repo.registrarTokenDePush(pessoa.id, 'tok-joao', 'android')
  repo.registros.push({
    id: 'reg-meio', participacaoId: participacao.id, tipo: 'meio', dataRef: '2026-09-05',
    registradoEm: '2026-09-05T22:30:00-03:00', recebidoEm: '2026-09-05T22:30:00-03:00',
    fotoPath: 'foto.jpg', lat: null, lng: null, manual: false,
  })

  const { enviados, enviarPush } = coletor()
  const r = await enviarLembretesDeMeio(repo, enviarPush, MEIO_DENTRO_DA_JANELA)

  assert.equal(r.enviados, 0)
  assert.equal(enviados.length, 0)
})

test('quem nunca bateu entrada não tem meio pra lembrar', async () => {
  const { repo, pessoa } = cenarioHenriqueEJuliano()
  await repo.registrarTokenDePush(pessoa.id, 'tok-joao', 'android')

  const { enviados, enviarPush } = coletor()
  const r = await enviarLembretesDeMeio(repo, enviarPush, MEIO_DENTRO_DA_JANELA)

  assert.equal(r.enviados, 0)
  assert.equal(enviados.length, 0)
})

test('dia que não exige meio não manda lembrete, mesmo com entrada registrada', async () => {
  const { repo, pessoa, evento } = comEntrada()
  await repo.registrarTokenDePush(pessoa.id, 'tok-joao', 'android')
  const dia = repo.dias.get(evento.id)!.find(d => d.data === '2026-09-05')!
  dia.exigeMeio = false

  const { enviados, enviarPush } = coletor()
  const r = await enviarLembretesDeMeio(repo, enviarPush, MEIO_DENTRO_DA_JANELA)

  assert.equal(r.enviados, 0)
  assert.equal(enviados.length, 0)
})

test('meio funciona mesmo em evento com batida livre — a trava de dia principal não vale aqui', async () => {
  const { repo, pessoa, evento } = comEntrada()
  evento.batida_livre = true
  await repo.registrarTokenDePush(pessoa.id, 'tok-joao', 'android')

  const { enviados, enviarPush } = coletor()
  const r = await enviarLembretesDeMeio(repo, enviarPush, MEIO_DENTRO_DA_JANELA)

  assert.equal(r.enviados, 1)
})

test('não manda o lembrete de meio duas vezes no mesmo turno', async () => {
  const { repo, pessoa } = comEntrada()
  await repo.registrarTokenDePush(pessoa.id, 'tok-joao', 'android')

  await enviarLembretesDeMeio(repo, coletor().enviarPush, MEIO_DENTRO_DA_JANELA)

  const segunda = coletor()
  const r = await enviarLembretesDeMeio(repo, segunda.enviarPush, MEIO_DENTRO_DA_JANELA)

  assert.equal(r.enviados, 0)
  assert.equal(segunda.enviados.length, 0)
})

// ─── Alerta ao supervisor ───────────────────────────────────────────────────

function comSupervisor() {
  const cenario = cenarioHenriqueEJuliano()
  const equipe = cenario.repo.equipes.find(e => e.id === 'eq-1')!
  equipe.supervisorPessoaId = 'auth-supervisor'
  return cenario
}

test('avisa o supervisor com a lista de quem falta, dentro da janela', async () => {
  const { repo } = comSupervisor()
  await repo.registrarTokenDePush('auth-supervisor', 'tok-supervisor', 'android')

  const { enviados, enviarPush } = coletor()
  const r = await enviarAlertaSupervisorDeEntrada(repo, enviarPush, DENTRO_DA_JANELA)

  assert.equal(r.enviados, 1)
  assert.equal(enviados[0]?.tokens[0], 'tok-supervisor')
  assert.match(enviados[0]?.titulo ?? '', /Produção: 1 sem entrada/)
})

test('sem pendência, sem aviso ao supervisor', async () => {
  const { repo, participacao } = comSupervisor()
  await repo.registrarTokenDePush('auth-supervisor', 'tok-supervisor', 'android')
  repo.registros.push({
    id: 'reg-1', participacaoId: participacao.id, tipo: 'entrada', dataRef: '2026-09-05',
    registradoEm: '2026-09-05T18:00:00-03:00', recebidoEm: '2026-09-05T18:00:01-03:00',
    fotoPath: null, lat: null, lng: null, manual: false,
  })

  const { enviados, enviarPush } = coletor()
  const r = await enviarAlertaSupervisorDeEntrada(repo, enviarPush, DENTRO_DA_JANELA)

  assert.equal(r.enviados, 0)
  assert.equal(enviados.length, 0)
})

test('setor sem supervisor definido não quebra, só não manda', async () => {
  const { repo } = cenarioHenriqueEJuliano() // sem supervisorPessoaId na equipe

  const { enviados, enviarPush } = coletor()
  const r = await enviarAlertaSupervisorDeEntrada(repo, enviarPush, DENTRO_DA_JANELA)

  assert.equal(r.enviados, 0)
  assert.equal(enviados.length, 0)
})

test('não avisa o supervisor duas vezes no mesmo dia pela mesma etapa', async () => {
  const { repo } = comSupervisor()
  await repo.registrarTokenDePush('auth-supervisor', 'tok-supervisor', 'android')

  await enviarAlertaSupervisorDeEntrada(repo, coletor().enviarPush, DENTRO_DA_JANELA)

  const segunda = coletor()
  const r = await enviarAlertaSupervisorDeEntrada(repo, segunda.enviarPush, DENTRO_DA_JANELA)

  assert.equal(r.enviados, 0)
  assert.equal(segunda.enviados.length, 0)
})

// ─── Aviso do dia (evento, montagem, desmontagem) ──────────────────────────
//
// Evento: dia principal 09-05 (entrada 07:00-23:55), 09-03/09-04 preparação
// antes (montagem), 09-06 preparação depois (desmontagem).

test('avisa "hoje é o dia do evento" depois das 7h, no dia principal', async () => {
  const { repo, pessoa, participacao } = cenarioHenriqueEJuliano()
  await repo.registrarTokenDePush(pessoa.id, 'tok-joao', 'android')

  const { enviados, enviarPush } = coletor()
  const r = await enviarAvisoDoDia(repo, enviarPush, new Date('2026-09-05T08:00:00-03:00'))

  assert.equal(r.enviados, 1)
  assert.deepEqual(enviados, [{ tokens: ['tok-joao'], titulo: 'Hoje é o dia do evento' }])
  assert.equal(await repo.jaEnviouLembreteHoje(participacao.id, 'aviso_dia_evento', '2026-09-05'), true)
})

test('antes das 7h, o aviso do dia do evento ainda não sai', async () => {
  const { repo, pessoa } = cenarioHenriqueEJuliano()
  await repo.registrarTokenDePush(pessoa.id, 'tok-joao', 'android')

  const { enviados, enviarPush } = coletor()
  const r = await enviarAvisoDoDia(repo, enviarPush, new Date('2026-09-05T06:00:00-03:00'))

  assert.equal(r.enviados, 0)
  assert.equal(enviados.length, 0)
})

test('avisa "hoje é dia de montagem", num dia de preparação antes do principal', async () => {
  const { repo, pessoa } = cenarioHenriqueEJuliano()
  await repo.registrarTokenDePush(pessoa.id, 'tok-joao', 'android')

  const { enviados, enviarPush } = coletor()
  const r = await enviarAvisoDoDia(repo, enviarPush, new Date('2026-09-03T08:00:00-03:00'))

  assert.equal(r.enviados, 1)
  assert.equal(enviados[0]?.titulo, 'Hoje é dia de montagem')
})

test('avisa "hoje é dia de desmontagem", num dia de preparação depois do principal', async () => {
  const { repo, pessoa } = cenarioHenriqueEJuliano()
  await repo.registrarTokenDePush(pessoa.id, 'tok-joao', 'android')

  const { enviados, enviarPush } = coletor()
  const r = await enviarAvisoDoDia(repo, enviarPush, new Date('2026-09-06T08:00:00-03:00'))

  assert.equal(r.enviados, 1)
  assert.equal(enviados[0]?.titulo, 'Hoje é dia de desmontagem')
})

test('dia cancelado não recebe aviso nenhum', async () => {
  const { repo, evento, pessoa } = cenarioHenriqueEJuliano()
  repo.dias.get(evento.id)!.find(d => d.data === '2026-09-05')!.cancelado = true
  await repo.registrarTokenDePush(pessoa.id, 'tok-joao', 'android')

  const { enviados, enviarPush } = coletor()
  const r = await enviarAvisoDoDia(repo, enviarPush, new Date('2026-09-05T08:00:00-03:00'))

  assert.equal(r.enviados, 0)
  assert.equal(enviados.length, 0)
})

test('sem horário de entrada configurado, o dia do evento não tem aviso — mensagem viraria "das a definir"', async () => {
  const { repo, evento, pessoa } = cenarioHenriqueEJuliano()
  evento.janela_entrada_inicio = null
  await repo.registrarTokenDePush(pessoa.id, 'tok-joao', 'android')

  const { enviados, enviarPush } = coletor()
  const r = await enviarAvisoDoDia(repo, enviarPush, new Date('2026-09-05T08:00:00-03:00'))

  assert.equal(r.enviados, 0)
  assert.equal(enviados.length, 0)
})

test('não avisa duas vezes o mesmo dia', async () => {
  const { repo, pessoa } = cenarioHenriqueEJuliano()
  await repo.registrarTokenDePush(pessoa.id, 'tok-joao', 'android')

  await enviarAvisoDoDia(repo, coletor().enviarPush, new Date('2026-09-05T08:00:00-03:00'))

  const segunda = coletor()
  const r = await enviarAvisoDoDia(repo, segunda.enviarPush, new Date('2026-09-05T08:00:00-03:00'))

  assert.equal(r.enviados, 0)
  assert.equal(segunda.enviados.length, 0)
})
