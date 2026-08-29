/*
 * O código de evento.
 *
 * Dois riscos aqui, e os testes existem por causa deles: um código fraco deixa
 * qualquer um entrar na lista de pagamento, e um código chato de digitar faz a
 * pessoa desistir no meio da montagem e procurar o supervisor.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  gerarCodigoDeEvento, lerCodigoDeEvento, siglaDoNome, mascararCodigo, COMBINACOES,
} from './codigo-evento.js'

test('o código tem a forma que a equipe reconhece', () => {
  const c = gerarCodigoDeEvento('Festival XYZ', 2026)
  assert.match(c, /^[A-Z]{3}-2026-[0-9A-Z]{4}$/)
})

test('a sigla identifica o evento', () => {
  assert.equal(siglaDoNome('Henrique e Juliano'), 'HJX', 'o "e" de ligação não entra')
  assert.equal(siglaDoNome('Manos da Vila'), 'MVX')
  assert.equal(siglaDoNome('Fantástico Mundo do Lukão'), 'FML', 'acento não atrapalha')
  assert.equal(siglaDoNome('Rock'), 'ROC', 'uma palavra só usa três letras dela')
  assert.equal(siglaDoNome('  '), 'XXX', 'nome vazio ainda dá código válido')
  // "Show 90°" perde o "90°" e vira uma palavra só, então usa três letras dela.
  assert.equal(siglaDoNome('Show 90°'), 'SHO', 'número e símbolo não viram sigla')
  assert.equal(siglaDoNome('90 Graus'), 'GRA', 'sobrando uma palavra, vale ela')
})

test('há mais de um milhão de combinações', () => {
  // O formato pedido (quatro dígitos) daria dez mil — adivinhável em minutos
  // por um script. Este teste cai se alguém encurtar o alfabeto um dia.
  assert.ok(COMBINACOES > 900_000, `só ${COMBINACOES} combinações`)
})

test('o gerador não produz caracteres confusos', () => {
  // I, L, O e U nunca saem: os três primeiros se confundem ao ler, e o U evita
  // que o sorteio forme palavra indesejada num código lido em voz alta.
  for (let i = 0; i < 400; i++) {
    const sorteado = gerarCodigoDeEvento('Teste', 2026).split('-')[2]!
    assert.ok(!/[ILOU]/.test(sorteado), `saiu "${sorteado}"`)
  }
})

test('o sorteio usa o alfabeto inteiro, sem viés', () => {
  const vistos = new Set<string>()
  for (let i = 0; i < 3000; i++) {
    for (const c of gerarCodigoDeEvento('Teste', 2026).split('-')[2]!) vistos.add(c)
  }
  // 31 caracteres sorteáveis (32 menos o U). Exigir todos evita passar num
  // gerador que só produza o começo do alfabeto.
  assert.ok(vistos.size >= 30, `só ${vistos.size} caracteres diferentes apareceram`)
})

test('o sorteio pode ser fixado para teste', () => {
  const sempreZero = () => 0
  assert.equal(gerarCodigoDeEvento('Festival XYZ', 2026, sempreZero), 'FXX-2026-0000')
})

// ─── A leitura, que é onde a pessoa erra ────────────────────────────────────

test('perdoa o jeito de digitar', () => {
  const alvo = 'ABC-2026-K7M2'
  for (const entrada of [
    'ABC-2026-K7M2',
    'abc-2026-k7m2',
    'ABC 2026 K7M2',
    'ABC2026K7M2',
    '  abc-2026-K7M2  ',
    'ABC_2026_K7M2',
  ]) {
    const r = lerCodigoDeEvento(entrada)
    assert.ok(r.ok, `recusou "${entrada}"`)
    assert.equal(r.codigo, alvo, `"${entrada}" virou outra coisa`)
  }
})

test('converte as confusões de leitura em vez de recusar', () => {
  // Quem enxergou um "O" numa foto vai digitar "O". Recusar seria punir a
  // pessoa por um problema que o alfabeto criou.
  assert.deepEqual(lerCodigoDeEvento('ABC-2026-O7M2'), { ok: true, codigo: 'ABC-2026-07M2' })
  assert.deepEqual(lerCodigoDeEvento('ABC-2026-I7M2'), { ok: true, codigo: 'ABC-2026-17M2' })
  assert.deepEqual(lerCodigoDeEvento('ABC-2026-L7M2'), { ok: true, codigo: 'ABC-2026-17M2' })
})

test('a recusa diz o que está errado, não só que está errado', () => {
  const curto = lerCodigoDeEvento('ABC-2026-K7')
  assert.ok(!curto.ok && /três letras, o ano e mais quatro/.test(curto.erro))

  const vazio = lerCodigoDeEvento('')
  assert.ok(!vazio.ok && /Digite o código/.test(vazio.erro))

  const errado = lerCodigoDeEvento('ABC-2026-K7M#')
  assert.ok(!errado.ok, 'símbolo não passa')
})

test('ida e volta: tudo que é gerado é lido de volta igual', () => {
  for (let i = 0; i < 500; i++) {
    const c = gerarCodigoDeEvento('Festival XYZ', 2026)
    const r = lerCodigoDeEvento(c)
    assert.ok(r.ok, `não leu de volta "${c}"`)
    assert.equal(r.codigo, c)
  }
})

test('a máscara acompanha quem está digitando', () => {
  assert.equal(mascararCodigo(''), '')
  assert.equal(mascararCodigo('AB'), 'AB')
  assert.equal(mascararCodigo('ABC'), 'ABC')
  assert.equal(mascararCodigo('ABC2'), 'ABC-2')
  assert.equal(mascararCodigo('ABC2026'), 'ABC-2026')
  assert.equal(mascararCodigo('ABC2026K'), 'ABC-2026-K')
  assert.equal(mascararCodigo('abc2026k7m2'), 'ABC-2026-K7M2')
  assert.equal(mascararCodigo('ABC2026K7M2XXXX'), 'ABC-2026-K7M2', 'não deixa passar do tamanho')
})
