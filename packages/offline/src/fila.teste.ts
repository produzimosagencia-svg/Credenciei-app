/*
 * O modo avião, simulado.
 *
 * Cada teste aqui é um jeito de perder a batida de alguém. Uma batida perdida
 * não é um erro de software: é uma pessoa que trabalhou e não vai receber.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { FilaDeBatidas, recuoDaTentativa } from './fila.js'
import type { Armazem, BatidaPendente, ResultadoEnvio } from './tipos.js'

/** Armazenamento em memória, com o mesmo contrato do celular. */
function armazemFalso(): Armazem & { conteudo: string | null } {
  const a = {
    conteudo: null as string | null,
    async ler() { return a.conteudo },
    async gravar(c: string) { a.conteudo = c },
  }
  return a
}

/** Relógio que só anda quando o teste mandar. */
function relogioFalso(inicio = Date.parse('2026-08-29T14:00:00-03:00')) {
  let t = inicio
  return { agora: () => t, avancar: (ms: number) => { t += ms } }
}

/** Um servidor de mentira, programável cenário a cenário. */
function servidorFalso(respostas: ResultadoEnvio[] | ((b: BatidaPendente) => ResultadoEnvio)) {
  const recebidas: BatidaPendente[] = []
  let i = 0
  return {
    recebidas,
    transporte: async (b: BatidaPendente) => {
      recebidas.push({ ...b })
      return typeof respostas === 'function' ? respostas(b) : (respostas[i++] ?? { ok: true })
    },
  }
}

const OK: ResultadoEnvio = { ok: true }
const REDE_CAIU: ResultadoEnvio = { ok: false, definitivo: false }
const RECUSADA: ResultadoEnvio = { ok: false, definitivo: true, motivo: 'Fora da janela de entrada.' }

let seq = 0
const idPrevisivel = () => `id-${++seq}`

// ═══════════════════════════════════════════════════════════════════════════

test('a batida é gravada ANTES de tentar enviar', async () => {
  const armazem = armazemFalso()
  const servidor = servidorFalso([])
  const fila = new FilaDeBatidas({ armazem, transporte: servidor.transporte, novoId: idPrevisivel })

  await fila.registrar({ participacaoId: 'p1', tipo: 'entrada' })

  // Nada foi enviado ainda, mas já está no disco: se o app morrer agora,
  // a batida sobrevive.
  assert.equal(servidor.recebidas.length, 0)
  assert.ok(armazem.conteudo?.includes('p1'))
})

test('sem rede, a batida fica guardada e não some', async () => {
  const armazem = armazemFalso()
  const fila = new FilaDeBatidas({
    armazem, transporte: servidorFalso(() => REDE_CAIU).transporte, novoId: idPrevisivel,
  })

  await fila.registrar({ participacaoId: 'p1', tipo: 'entrada' })
  const r = await fila.sincronizar()

  assert.equal(r.enviadas, 0)
  assert.equal(r.restantes, 1)
  assert.equal(fila.pendentes().length, 1)
})

test('quando a rede volta, tudo sobe na ordem em que foi batido', async () => {
  const armazem = armazemFalso()
  const relogio = relogioFalso()
  let temRede = false
  const servidor = servidorFalso(() => (temRede ? OK : REDE_CAIU))
  const fila = new FilaDeBatidas({
    armazem, transporte: servidor.transporte, agora: relogio.agora, novoId: idPrevisivel,
  })

  await fila.registrar({ participacaoId: 'p1', tipo: 'entrada' })
  relogio.avancar(4 * 3600e3)
  await fila.registrar({ participacaoId: 'p1', tipo: 'meio', foto: 'data:image/jpeg;base64,xx' })
  relogio.avancar(5 * 3600e3)
  await fila.registrar({ participacaoId: 'p1', tipo: 'fim' })

  await fila.sincronizar()
  assert.equal(fila.pendentes().length, 3, 'sem rede, as três esperam')

  temRede = true
  relogio.avancar(60_000) // passa o recuo
  const r = await fila.sincronizar()

  assert.equal(r.enviadas, 3)
  assert.equal(r.restantes, 0)
  assert.deepEqual(
    servidor.recebidas.filter(b => b.estado === 'enviando').map(b => b.tipo),
    ['entrada', 'entrada', 'meio', 'fim'],
    'a entrada tentou duas vezes (a primeira sem rede) e a ordem foi mantida',
  )
})

test('a ordem é preservada mesmo quando uma falha no meio', async () => {
  // O servidor calcula o meio a partir da entrada e recusa a saída sem o meio.
  // Enviar fora de ordem faria ele recusar batidas legítimas.
  const armazem = armazemFalso()
  const relogio = relogioFalso()
  let entregas = 0
  const servidor = servidorFalso(() => (++entregas === 2 ? REDE_CAIU : OK))
  const fila = new FilaDeBatidas({
    armazem, transporte: servidor.transporte, agora: relogio.agora, novoId: idPrevisivel,
  })

  await fila.registrar({ participacaoId: 'p1', tipo: 'entrada' })
  await fila.registrar({ participacaoId: 'p1', tipo: 'meio' })
  await fila.registrar({ participacaoId: 'p1', tipo: 'fim' })

  await fila.sincronizar()
  // Entrada passou; o meio caiu. A saída NÃO pode ter sido tentada.
  assert.deepEqual(servidor.recebidas.map(b => b.tipo), ['entrada', 'meio'])
})

test('o servidor dizendo NÃO tira da fila e explica', async () => {
  const armazem = armazemFalso()
  const fila = new FilaDeBatidas({
    armazem, transporte: servidorFalso(() => RECUSADA).transporte, novoId: idPrevisivel,
  })

  await fila.registrar({ participacaoId: 'p1', tipo: 'entrada' })
  const r = await fila.sincronizar()

  assert.equal(r.recusadas, 1)
  assert.equal(fila.pendentes().length, 0, 'não fica tentando para sempre')
  assert.equal(fila.recusadas()[0]?.motivo, 'Fora da janela de entrada.')
})

test('duplicata é sucesso, não erro', async () => {
  // O envio chegou e só a resposta se perdeu. Mostrar "você já registrou" como
  // erro faria a pessoa achar que falhou e tentar de novo.
  const armazem = armazemFalso()
  const fila = new FilaDeBatidas({
    armazem,
    transporte: servidorFalso(() => ({ ok: true, duplicada: true })).transporte,
    novoId: idPrevisivel,
  })

  await fila.registrar({ participacaoId: 'p1', tipo: 'entrada' })
  const r = await fila.sincronizar()

  assert.equal(r.enviadas, 1)
  assert.equal(r.recusadas, 0)
  assert.equal(fila.pendentes().length, 0)
})

test('cada batida nasce com identificador próprio — é o que impede duplicar', async () => {
  const armazem = armazemFalso()
  const fila = new FilaDeBatidas({ armazem, transporte: servidorFalso([]).transporte })

  const a = await fila.registrar({ participacaoId: 'p1', tipo: 'entrada' })
  const b = await fila.registrar({ participacaoId: 'p1', tipo: 'meio' })

  assert.ok(a.id && b.id)
  assert.notEqual(a.id, b.id)
})

test('reenviar manda o MESMO identificador', async () => {
  const armazem = armazemFalso()
  const relogio = relogioFalso()
  let n = 0
  const servidor = servidorFalso(() => (++n === 1 ? REDE_CAIU : OK))
  const fila = new FilaDeBatidas({
    armazem, transporte: servidor.transporte, agora: relogio.agora, novoId: idPrevisivel,
  })

  await fila.registrar({ participacaoId: 'p1', tipo: 'entrada' })
  await fila.sincronizar()
  relogio.avancar(60_000)
  await fila.sincronizar()

  assert.equal(servidor.recebidas.length, 2)
  assert.equal(servidor.recebidas[0]!.id, servidor.recebidas[1]!.id,
    'sem isso, o servidor gravaria duas batidas')
})

test('o recuo cresce e tem teto', async () => {
  assert.equal(recuoDaTentativa(1), 2_000)
  assert.equal(recuoDaTentativa(2), 4_000)
  assert.equal(recuoDaTentativa(3), 8_000)
  assert.equal(recuoDaTentativa(20), 300_000, 'teto de 5 minutos')
})

test('respeita o recuo antes de tentar de novo', async () => {
  const armazem = armazemFalso()
  const relogio = relogioFalso()
  const servidor = servidorFalso(() => REDE_CAIU)
  const fila = new FilaDeBatidas({
    armazem, transporte: servidor.transporte, agora: relogio.agora, novoId: idPrevisivel,
  })

  await fila.registrar({ participacaoId: 'p1', tipo: 'entrada' })
  await fila.sincronizar()
  assert.equal(servidor.recebidas.length, 1)

  await fila.sincronizar() // cedo demais
  assert.equal(servidor.recebidas.length, 1, 'não insistiu antes da hora')

  relogio.avancar(2_500)
  await fila.sincronizar()
  assert.equal(servidor.recebidas.length, 2)
})

test('a fila sobrevive ao aplicativo fechar', async () => {
  const armazem = armazemFalso()
  const relogio = relogioFalso()

  const primeira = new FilaDeBatidas({
    armazem, transporte: servidorFalso(() => REDE_CAIU).transporte,
    agora: relogio.agora, novoId: idPrevisivel,
  })
  await primeira.registrar({ participacaoId: 'p1', tipo: 'entrada' })
  await primeira.registrar({ participacaoId: 'p1', tipo: 'meio', foto: 'xyz' })

  // O aplicativo morre. Outra instância abre com o mesmo armazenamento.
  const servidor = servidorFalso(() => OK)
  const segunda = new FilaDeBatidas({
    armazem, transporte: servidor.transporte, agora: relogio.agora, novoId: idPrevisivel,
  })
  await segunda.carregar()

  assert.equal(segunda.pendentes().length, 2)
  const r = await segunda.sincronizar()
  assert.equal(r.enviadas, 2)
  assert.equal(servidor.recebidas[1]?.foto, 'xyz', 'a foto sobreviveu')
})

test('batida travada em "enviando" volta para a fila', async () => {
  // O app morreu no meio de um envio. Sem isto ela ficaria parada para sempre:
  // contando como pendente na tela e nunca sendo tentada de novo.
  const armazem = armazemFalso()
  armazem.conteudo = JSON.stringify([{
    id: 'x1', participacaoId: 'p1', tipo: 'entrada',
    registradoEm: '2026-08-29T14:00:00.000Z', estado: 'enviando', tentativas: 1,
  }])

  const servidor = servidorFalso(() => OK)
  const fila = new FilaDeBatidas({ armazem, transporte: servidor.transporte })
  const r = await fila.sincronizar()

  assert.equal(r.enviadas, 1)
})

test('armazenamento corrompido não derruba o aplicativo', async () => {
  const armazem = armazemFalso()
  armazem.conteudo = '{isto não é json'

  const fila = new FilaDeBatidas({ armazem, transporte: servidorFalso(() => OK).transporte })
  await fila.carregar()

  assert.equal(fila.todas().length, 0)
  // E ainda aceita batida nova: perder o passado é melhor que perder o presente.
  await fila.registrar({ participacaoId: 'p1', tipo: 'entrada' })
  assert.equal((await fila.sincronizar()).enviadas, 1)
})

test('lixo no armazenamento é descartado item a item', async () => {
  const armazem = armazemFalso()
  armazem.conteudo = JSON.stringify([
    { id: 'bom', participacaoId: 'p1', tipo: 'entrada', registradoEm: '2026-08-29T14:00:00.000Z', estado: 'pendente', tentativas: 0 },
    { lixo: true },
    null,
  ])

  const fila = new FilaDeBatidas({ armazem, transporte: servidorFalso(() => OK).transporte })
  await fila.carregar()

  assert.equal(fila.todas().length, 1, 'o item bom foi preservado')
})

test('o horário que vale é o do aparelho, não o da chegada', async () => {
  const armazem = armazemFalso()
  const relogio = relogioFalso(Date.parse('2026-08-29T14:00:00-03:00'))
  const servidor = servidorFalso(() => OK)
  const fila = new FilaDeBatidas({
    armazem, transporte: servidor.transporte, agora: relogio.agora, novoId: idPrevisivel,
  })

  await fila.registrar({ participacaoId: 'p1', tipo: 'entrada' })
  relogio.avancar(3 * 3600e3) // três horas sem sinal
  await fila.sincronizar()

  assert.equal(
    servidor.recebidas[0]!.registradoEm,
    new Date(Date.parse('2026-08-29T14:00:00-03:00')).toISOString(),
    'chegou às 17:00, mas a batida foi às 14:00',
  )
})

test('a confirmação fica visível antes de sumir', async () => {
  const armazem = armazemFalso()
  const relogio = relogioFalso()
  const fila = new FilaDeBatidas({
    armazem, transporte: servidorFalso(() => OK).transporte,
    agora: relogio.agora, novoId: idPrevisivel,
  })

  await fila.registrar({ participacaoId: 'p1', tipo: 'entrada' })
  relogio.avancar(3 * 3600e3) // sem sinal por três horas
  await fila.sincronizar()

  assert.equal(fila.todas().length, 1, 'a pessoa precisa ver que deu certo')
  relogio.avancar(61_000)
  await fila.sincronizar()
  assert.equal(fila.todas().length, 0)
})

test('duas sincronizações ao mesmo tempo não duplicam', async () => {
  const armazem = armazemFalso()
  const servidor = servidorFalso(async () => OK)
  const fila = new FilaDeBatidas({ armazem, transporte: servidor.transporte, novoId: idPrevisivel })

  await fila.registrar({ participacaoId: 'p1', tipo: 'entrada' })
  await Promise.all([fila.sincronizar(), fila.sincronizar()])

  assert.equal(servidor.recebidas.length, 1)
})

test('a tela é avisada quando a fila muda', async () => {
  const armazem = armazemFalso()
  const fila = new FilaDeBatidas({ armazem, transporte: servidorFalso(() => OK).transporte })

  let avisos = 0
  const parar = fila.observar(() => avisos++)
  await fila.registrar({ participacaoId: 'p1', tipo: 'entrada' })

  assert.ok(avisos > 0)
  parar()
  const antes = avisos
  await fila.registrar({ participacaoId: 'p1', tipo: 'meio' })
  assert.equal(avisos, antes, 'parou de avisar depois de cancelado')
})

test('recusada some só quando a pessoa dispensa', async () => {
  const armazem = armazemFalso()
  const fila = new FilaDeBatidas({
    armazem, transporte: servidorFalso(() => RECUSADA).transporte, novoId: idPrevisivel,
  })

  const b = await fila.registrar({ participacaoId: 'p1', tipo: 'entrada' })
  await fila.sincronizar()
  assert.equal(fila.recusadas().length, 1)

  assert.equal(await fila.descartar(b.id), true)
  assert.equal(fila.recusadas().length, 0)
})

test('não dá para descartar uma batida que ainda pode ir', async () => {
  const armazem = armazemFalso()
  const fila = new FilaDeBatidas({
    armazem, transporte: servidorFalso(() => REDE_CAIU).transporte, novoId: idPrevisivel,
  })

  const b = await fila.registrar({ participacaoId: 'p1', tipo: 'entrada' })
  await fila.sincronizar()

  assert.equal(await fila.descartar(b.id), false, 'seria jogar fora trabalho feito')
  assert.equal(fila.pendentes().length, 1)
})

test('desiste depois de muitas tentativas, com recado', async () => {
  const armazem = armazemFalso()
  const relogio = relogioFalso()
  const fila = new FilaDeBatidas({
    armazem, transporte: servidorFalso(() => REDE_CAIU).transporte,
    agora: relogio.agora, novoId: idPrevisivel,
  })

  await fila.registrar({ participacaoId: 'p1', tipo: 'entrada' })
  for (let i = 0; i < 32; i++) {
    await fila.sincronizar()
    relogio.avancar(6 * 60_000) // passa qualquer recuo
  }

  assert.equal(fila.pendentes().length, 0)
  assert.match(fila.recusadas()[0]?.motivo ?? '', /procure o credenciamento/i)
})

test('exceção no transporte é tratada como falha de rede', async () => {
  const armazem = armazemFalso()
  const fila = new FilaDeBatidas({
    armazem,
    transporte: async () => { throw new Error('socket hang up') },
    novoId: idPrevisivel,
  })

  await fila.registrar({ participacaoId: 'p1', tipo: 'entrada' })
  const r = await fila.sincronizar()

  assert.equal(r.recusadas, 0, 'nunca descartar por causa de uma exceção')
  assert.equal(fila.pendentes().length, 1)
})
