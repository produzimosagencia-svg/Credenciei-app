/*
 * O formulário do evento é o último passo antes de a pessoa estar credenciada.
 *
 * Um campo obrigatório que passa em branco vira um crachá sem função no portão;
 * um bloqueio que não explica vira alguém achando que se inscreveu e não se
 * inscreveu. Os dois já aconteceram neste projeto.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { CampoDoFormulario } from '@credenciei/contrato'
import { camposFaltando, fraseDoQueFalta, mascararData } from './campos.js'

const FUNCAO: CampoDoFormulario = {
  chave: 'funcao', rotulo: 'Sua função no evento', tipo: 'texto', obrigatorio: true,
}
const UNIFORME: CampoDoFormulario = {
  chave: 'uniforme', rotulo: 'Tamanho do uniforme', tipo: 'escolha',
  obrigatorio: true, opcoes: ['P', 'M', 'G'],
}
const OBSERVACAO: CampoDoFormulario = {
  chave: 'observacao', rotulo: 'Alguma observação', tipo: 'texto', obrigatorio: false,
}

test('a data se monta enquanto a pessoa digita', () => {
  assert.equal(mascararData(''), '')
  assert.equal(mascararData('0'), '0')
  assert.equal(mascararData('05'), '05')
  assert.equal(mascararData('0509'), '05/09')
  assert.equal(mascararData('05092026'), '05/09/2026')
  assert.equal(mascararData('050920261234'), '05/09/2026')
})

test('a data aceita quem já digitou com barra', () => {
  assert.equal(mascararData('05/09/2026'), '05/09/2026')
})

test('campo obrigatório em branco é apontado', () => {
  const faltando = camposFaltando([FUNCAO, UNIFORME], { funcao: 'Auxiliar' })
  assert.deepEqual(faltando.map(f => f.chave), ['uniforme'])
})

test('espaço em branco não conta como resposta', () => {
  // Senão vira uma função vazia no crachá de alguém.
  const faltando = camposFaltando([FUNCAO], { funcao: '   ' })
  assert.deepEqual(faltando.map(f => f.chave), ['funcao'])
})

test('campo opcional em branco não trava ninguém', () => {
  assert.deepEqual(camposFaltando([FUNCAO, OBSERVACAO], { funcao: 'Auxiliar' }), [])
})

test('a frase diz exatamente o que falta', () => {
  /*
   * A tela não pode só travar o botão: quem clica e não vê reação sai
   * acreditando que deu certo. Ver `docs/contexto.md`.
   */
  assert.equal(fraseDoQueFalta([]), '')
  assert.equal(fraseDoQueFalta([FUNCAO]), 'Falta preencher: Sua função no evento.')
  assert.equal(
    fraseDoQueFalta([FUNCAO, UNIFORME]),
    'Falta preencher: Sua função no evento e Tamanho do uniforme.',
  )
  assert.equal(
    fraseDoQueFalta([FUNCAO, UNIFORME, OBSERVACAO]),
    'Falta preencher: Sua função no evento, Tamanho do uniforme e Alguma observação.',
  )
})
