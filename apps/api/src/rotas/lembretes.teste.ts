/*
 * Lembretes automáticos de entrada e saída — cópia, como push, dos dois
 * primeiros lembretes que o site já manda por WhatsApp (`lib/mensagens.ts`).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cenarioHenriqueEJuliano } from '../dados/memoria.js'
import {
  enviarAlertaSupervisorDeEntrada, enviarLembretesDeEntrada, enviarLembretesDeSaida, type EnviarPush,
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
