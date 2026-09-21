import { test } from 'node:test'
import assert from 'node:assert/strict'
import { escolherParticipacao } from './participacao-selecionada.js'

type P = { participacaoId: string; emAndamento?: boolean }

const NAVIO: P = { participacaoId: 'navio', emAndamento: false }
const LAGOA: P = { participacaoId: 'lagoa', emAndamento: true }

test('sem seleção, escolhe a que está em andamento', () => {
  assert.equal(escolherParticipacao([NAVIO, LAGOA], null)?.participacaoId, 'lagoa')
})

test('sem seleção e nenhuma em andamento, escolhe a primeira', () => {
  const semAndamento = { ...LAGOA, emAndamento: false }
  assert.equal(escolherParticipacao([NAVIO, semAndamento], null)?.participacaoId, 'navio')
})

test('com seleção, escolhe a selecionada — mesmo que não seja a "em andamento"', () => {
  assert.equal(escolherParticipacao([NAVIO, LAGOA], 'navio')?.participacaoId, 'navio')
})

test('seleção que não existe mais (saiu do evento) cai de volta na regra padrão', () => {
  assert.equal(escolherParticipacao([NAVIO, LAGOA], 'evento-que-nao-existe-mais')?.participacaoId, 'lagoa')
})

test('lista vazia devolve undefined, com ou sem seleção', () => {
  assert.equal(escolherParticipacao([], null), undefined)
  assert.equal(escolherParticipacao([], 'navio'), undefined)
})
