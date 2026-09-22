/*
 * Lembrete automático de bater a entrada — cópia, como push, do primeiro dos
 * lembretes que o site já manda por WhatsApp (`lib/mensagens.ts`).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cenarioHenriqueEJuliano } from '../dados/memoria.js'
import { enviarLembretesDeEntrada, type EnviarPush } from './lembretes.js'

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
