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
import { gerarCodigoQR, lerCodigoQR, faseConfere } from './credencial-qr.js'
import { faseDoDia } from './janelas.js'

const SEGREDO = 'segredo-de-teste-nao-usar-em-producao'
const TOKEN = '7d4c1c8274eddfb78893882dbb0d3774'

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
