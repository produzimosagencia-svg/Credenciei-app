/*
 * O teste que justifica o pacote existir.
 *
 * O QR do sistema web é assinado com `node:crypto`. Este pacote assina com
 * `@noble/hashes`, porque `node:crypto` não existe no celular. As duas
 * implementações PRECISAM produzir o mesmo byte — senão uma credencial emitida
 * pelo site seria recusada pelo app, e a pessoa descobriria isso parada no
 * portão, com a fila andando atrás dela.
 *
 * Por isso a comparação aqui é contra a implementação real do Node, não contra
 * um valor que eu tenha escrito à mão: um valor fixo só provaria que o código
 * concorda comigo, não que concorda com o sistema em produção.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { ed25519 } from '@noble/curves/ed25519'
import { gerarCodigoQR, gerarCodigoQREd25519, lerCodigoQR, faseConfere } from './credencial-qr.js'
import { faseDoDia } from './janelas.js'

const SEGREDO = 'segredo-de-teste-nao-usar-em-producao'
const TOKEN = '7d4c1c8274eddfb78893882dbb0d3774'

// Par de chaves FIXO, só para teste — nunca usar em produção. Fixo (e não
// `ed25519.utils.randomPrivateKey()`) para o teste ser determinístico.
const CHAVE_PRIVADA = new Uint8Array(32).fill(7)
const CHAVE_PUBLICA = ed25519.getPublicKey(CHAVE_PRIVADA)
const OUTRA_CHAVE_PUBLICA = ed25519.getPublicKey(new Uint8Array(32).fill(9))

/** A assinatura exatamente como o sistema web a produz hoje. */
function assinarComoOSistemaWeb(prefixo: string, ...partes: string[]): string {
  return createHmac('sha256', SEGREDO)
    .update([prefixo, ...partes].join('.'))
    .digest('base64url')
    .slice(0, 16)
}

test('a assinatura nova é idêntica à do sistema web', () => {
  for (const [fase, sigla] of [['montagem', 'm'], ['evento', 'p'], ['desmontagem', 'd']] as const) {
    const { codigo } = gerarCodigoQR(SEGREDO, TOKEN, fase)
    const nossa = codigo.split('.')[3]
    const dele = assinarComoOSistemaWeb('c3', TOKEN, sigla)
    assert.equal(nossa, dele, `divergiu na etapa ${fase}`)
  }
})

test('a base64url bate com a do Node em entradas variadas', () => {
  // Comprimentos diferentes exercitam os três restos da divisão por 3, que é
  // onde um encoder escrito à mão costuma errar.
  for (const t of ['a', 'ab', 'abc', 'abcd', TOKEN, '', 'çãé']) {
    const nossa = gerarCodigoQR(SEGREDO, t || 'x', 'montagem').codigo.split('.')[3]
    const dele = assinarComoOSistemaWeb('c3', t || 'x', 'm')
    assert.equal(nossa, dele, `divergiu em "${t}"`)
  }
})

test('código antigo (c2) do sistema web continua sendo aceito', () => {
  const dia = '2026-08-29'
  const sig = assinarComoOSistemaWeb('c2', TOKEN, dia)
  const antigo = `c2.${TOKEN}.${dia}.${sig}`

  const hoje = lerCodigoQR(SEGREDO, antigo, dia)
  assert.ok(hoje.ok && hoje.token === TOKEN && hoje.fase === null)

  const outroDia = lerCodigoQR(SEGREDO, antigo, '2026-08-30')
  assert.ok(!outroDia.ok && /não vale hoje/.test(outroDia.erro))
})

test('o mesmo QR vale em todos os dias da mesma etapa', () => {
  const principal = '2026-08-29'
  const a = gerarCodigoQR(SEGREDO, TOKEN, faseDoDia('2026-08-26', principal)).codigo
  const b = gerarCodigoQR(SEGREDO, TOKEN, faseDoDia('2026-08-28', principal)).codigo
  assert.equal(a, b)
})

test('QR de montagem é recusado no dia do evento', () => {
  const principal = '2026-08-29'
  const montagem = gerarCodigoQR(SEGREDO, TOKEN, 'montagem').codigo

  const lido = lerCodigoQR(SEGREDO, montagem, principal)
  assert.ok(lido.ok, 'a assinatura é válida — o que muda é a etapa')

  const v = faseConfere(lido.ok ? lido.fase : null, faseDoDia(principal, principal))
  assert.ok(!v.ok)
  assert.match(v.erro, /montagem.*dia do evento/)
})

test('trocar a etapa dentro do código quebra a assinatura', () => {
  const bom = gerarCodigoQR(SEGREDO, TOKEN, 'montagem').codigo
  const forjado = bom.replace('.m.', '.p.')
  const lido = lerCodigoQR(SEGREDO, forjado, '2026-08-29')
  assert.ok(!lido.ok && /não foi emitido/.test(lido.erro))
})

test('segredo errado não abre a porta', () => {
  const { codigo } = gerarCodigoQR(SEGREDO, TOKEN, 'evento')
  const lido = lerCodigoQR('outro-segredo', codigo, '2026-08-29')
  assert.ok(!lido.ok)
})

// ─── c4: Ed25519 + código giratório ─────────────────────────────────────────
//
// Ainda não é o que a API gera por padrão (ver ADR 009) — mas `lerCodigoQR`
// já precisa saber conferir, porque aceitar vem antes de gerar na transição.

test('gera e lê um código c4 válido', () => {
  const agora = new Date('2026-09-05T12:00:00-03:00')
  const { codigo, fase } = gerarCodigoQREd25519(CHAVE_PRIVADA, TOKEN, 'evento', agora)
  assert.equal(fase, 'evento')
  assert.match(codigo, /^c4\./)

  const lido = lerCodigoQR(SEGREDO, codigo, '2026-09-05', CHAVE_PUBLICA, agora)
  assert.ok(lido.ok, lido.ok ? '' : lido.erro)
  assert.equal(lido.ok && lido.token, TOKEN)
  assert.equal(lido.ok && lido.fase, 'evento')
})

test('a janela anterior ainda vale — a folga do código giratório', () => {
  const quandoGerou = new Date('2026-09-05T12:00:00-03:00')
  const { codigo } = gerarCodigoQREd25519(CHAVE_PRIVADA, TOKEN, 'evento', quandoGerou)

  // Dentro da mesma janela de 2 minutos: vale.
  const poucoDepois = new Date(quandoGerou.getTime() + 30_000)
  assert.ok(lerCodigoQR(SEGREDO, codigo, '2026-09-05', CHAVE_PUBLICA, poucoDepois).ok)

  // Uma janela inteira depois (2-4 min): ainda vale, é a folga.
  const umaJanelaDepois = new Date(quandoGerou.getTime() + 2 * 60_000 + 30_000)
  assert.ok(lerCodigoQR(SEGREDO, codigo, '2026-09-05', CHAVE_PUBLICA, umaJanelaDepois).ok)
})

test('duas janelas depois, o código expirou', () => {
  const quandoGerou = new Date('2026-09-05T12:00:00-03:00')
  const { codigo } = gerarCodigoQREd25519(CHAVE_PRIVADA, TOKEN, 'evento', quandoGerou)

  const duasJanelasDepois = new Date(quandoGerou.getTime() + 4 * 60_000 + 30_000)
  const lido = lerCodigoQR(SEGREDO, codigo, '2026-09-05', CHAVE_PUBLICA, duasJanelasDepois)
  assert.ok(!lido.ok)
  assert.match(lido.ok ? '' : lido.erro, /expirou/)
})

test('chave pública errada não confere a assinatura Ed25519', () => {
  const agora = new Date('2026-09-05T12:00:00-03:00')
  const { codigo } = gerarCodigoQREd25519(CHAVE_PRIVADA, TOKEN, 'evento', agora)
  const lido = lerCodigoQR(SEGREDO, codigo, '2026-09-05', OUTRA_CHAVE_PUBLICA, agora)
  assert.ok(!lido.ok)
  assert.match(lido.ok ? '' : lido.erro, /não foi emitido/)
})

test('sem chave pública configurada, um código c4 é recusado como fora do padrão', () => {
  const agora = new Date('2026-09-05T12:00:00-03:00')
  const { codigo } = gerarCodigoQREd25519(CHAVE_PRIVADA, TOKEN, 'evento', agora)
  const lido = lerCodigoQR(SEGREDO, codigo, '2026-09-05', null, agora)
  assert.ok(!lido.ok)
  assert.match(lido.ok ? '' : lido.erro, /fora do padrão/)
})

test('trocar a etapa dentro do código c4 quebra a assinatura', () => {
  const agora = new Date('2026-09-05T12:00:00-03:00')
  const { codigo } = gerarCodigoQREd25519(CHAVE_PRIVADA, TOKEN, 'montagem', agora)
  const forjado = codigo.replace('.m.', '.p.')
  const lido = lerCodigoQR(SEGREDO, forjado, '2026-09-05', CHAVE_PUBLICA, agora)
  assert.ok(!lido.ok)
  assert.match(lido.ok ? '' : lido.erro, /não foi emitido/)
})

test('c2 e c3 continuam funcionando quando a chave Ed25519 também é passada', () => {
  const agora = new Date('2026-09-05T12:00:00-03:00')
  const c3 = gerarCodigoQR(SEGREDO, TOKEN, 'evento').codigo
  const lido = lerCodigoQR(SEGREDO, c3, '2026-09-05', CHAVE_PUBLICA, agora)
  assert.ok(lido.ok)
})
