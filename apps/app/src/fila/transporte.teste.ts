/*
 * A tradução entre o servidor e a fila.
 *
 * Cada teste aqui corresponde a um jeito de perder a batida de alguém. Não é
 * exagero: uma batida perdida não é um erro de software, é uma pessoa que
 * trabalhou e não vai receber.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { ClienteApi, RespostaDeBatida } from '@credenciei/contrato'
import type { BatidaPendente } from '@credenciei/offline'
import { transporteDe } from './transporte.js'

/** Um cliente que só sabe responder uma coisa — é tudo que o teste precisa. */
function clienteQue(
  responde: RespostaDeBatida | (() => never),
): ClienteApi & { recebeu: unknown[] } {
  const recebeu: unknown[] = []
  const cliente = {
    recebeu,
    async registrarBatida(envio: unknown) {
      recebeu.push(envio)
      if (typeof responde === 'function') return responde()
      return responde
    },
  }
  return cliente as unknown as ClienteApi & { recebeu: unknown[] }
}

function batida(p: Partial<BatidaPendente> = {}): BatidaPendente {
  return {
    id: 'b-1',
    participacaoId: 'part-1',
    tipo: 'meio',
    registradoEm: '2026-09-05T18:04:00-03:00',
    estado: 'pendente',
    tentativas: 0,
    ...p,
  }
}

test('registrado vira sucesso', async () => {
  const t = transporteDe(clienteQue({ situacao: 'registrado', em: '2026-09-05T18:04:00-03:00' }))
  assert.deepEqual(await t(batida()), { ok: true })
})

test('duplicada é SUCESSO, e não erro', async () => {
  /*
   * Significa que o envio anterior chegou e só a resposta se perdeu — o caso
   * normal numa rede de evento. Tratar como erro faria a pessoa ver "você já
   * registrou" e achar que falhou, quando a batida dela está gravada.
   */
  const t = transporteDe(clienteQue({ situacao: 'duplicado', em: '2026-09-05T18:04:00-03:00' }))
  assert.deepEqual(await t(batida()), { ok: true, duplicada: true })
})

test('recusa é definitiva, e leva o motivo junto', async () => {
  // Reenviar não muda: a fila descarta e mostra o motivo. Sem o texto, a pessoa
  // veria a batida sumir sem nenhuma explicação.
  const t = transporteDe(clienteQue({
    situacao: 'recusado',
    motivo: 'O registro do meio ainda não abriu.',
  }))
  const r = await t(batida())

  assert.equal(r.ok, false)
  if (r.ok) return
  assert.equal(r.definitivo, true)
  assert.match(r.motivo, /meio/)
})

test('exceção é transporte, e NÃO é definitiva', async () => {
  /*
   * O teste mais importante do arquivo. Se a falha de rede virasse recusa, a
   * fila descartaria uma batida que a pessoa fez de verdade — e ela só
   * descobriria no fechamento do pagamento.
   */
  const t = transporteDe(clienteQue(() => { throw new Error('Sem conexão') }))
  const r = await t(batida())

  assert.equal(r.ok, false)
  if (r.ok) return
  assert.equal(r.definitivo, false, 'rede volta; a batida tem que esperar')
})

test('a foto, a posição e o horário do aparelho vão junto', async () => {
  const cliente = clienteQue({ situacao: 'registrado', em: 'x' })
  const t = transporteDe(cliente)
  await t(batida({ foto: 'data:image/jpeg;base64,abc', lat: -20.3, lng: -40.3 }))

  assert.deepEqual(cliente.recebeu[0], {
    id: 'b-1',
    participacaoId: 'part-1',
    tipo: 'meio',
    registradoEm: '2026-09-05T18:04:00-03:00',
    fotoBase64: 'data:image/jpeg;base64,abc',
    lat: -20.3,
    lng: -40.3,
  })
})

test('sem foto nem posição, os campos nem são enviados', async () => {
  /*
   * `undefined` explícito e campo ausente não são a mesma coisa do outro lado:
   * um servidor que faz `'lat' in pedido` passaria a achar que a posição veio,
   * e gravaria nulo onde não havia nada.
   */
  const cliente = clienteQue({ situacao: 'registrado', em: 'x' })
  await transporteDe(cliente)(batida())

  const enviado = cliente.recebeu[0] as Record<string, unknown>
  assert.equal('fotoBase64' in enviado, false)
  assert.equal('lat' in enviado, false)
  assert.equal('lng' in enviado, false)
})

test('entrada e saída na fila são RECUSA, não falha de rede', async () => {
  /*
   * A fila é transporte genérico, mas só o meio tem porta do outro lado.
   * Se uma entrada ou saída caísse aqui, tratá-la como falha de rede faria o
   * aparelho reenviar para sempre algo que nunca vai passar — o erro que a
   * distinção no topo de `transporte.ts` existe para evitar.
   */
  const cliente = clienteQue({ situacao: 'registrado', em: 'x' })

  const r = await transporteDe(cliente)(batida({ tipo: 'fim' }))

  assert.equal(r.ok, false)
  assert.equal(r.ok === false && r.definitivo, true, 'a fila descarta e explica')
  assert.equal(cliente.recebeu.length, 0, 'nem chegou a bater no servidor')
})

test('o id do aparelho é o que vai — é ele que impede a duplicata', async () => {
  // O servidor guarda esse id e recusa o segundo envio do mesmo. É o que torna
  // reenviar seguro, e reenviar sem medo é o que faz a fila funcionar.
  const cliente = clienteQue({ situacao: 'registrado', em: 'x' })
  await transporteDe(cliente)(batida({ id: 'id-do-aparelho' }))
  assert.equal((cliente.recebeu[0] as { id: string }).id, 'id-do-aparelho')
})
