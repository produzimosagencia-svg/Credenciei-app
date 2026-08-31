/*
 * O histórico é o que a pessoa confere contra o próprio pagamento.
 *
 * Errar aqui não quebra tela nenhuma: só mostra um número diferente do que ela
 * recebeu, e a discussão acontece no dia do acerto, sem ninguém conseguir
 * provar nada.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { DiaDaParticipacao } from '@credenciei/contrato'
import {
  celulaSilenciosa, resumoDoHistorico, statusDoDia,
} from './historico.js'

function dia(p: Partial<DiaDaParticipacao> = {}): DiaDaParticipacao {
  return {
    data: '2026-09-05',
    etapa: 'evento',
    entrada: null,
    meioEsperado: null,
    meio: null,
    meioAtrasoMin: null,
    saida: null,
    compareceu: false,
    horas: null,
    ...p,
  }
}

const COMPLETO = dia({
  entrada: '2026-09-05T14:00:00-03:00',
  meio: '2026-09-05T18:00:00-03:00',
  saida: '2026-09-05T23:00:00-03:00',
  compareceu: true,
  horas: 9,
})

test('quem não bateu entrada não esteve lá', () => {
  assert.equal(statusDoDia(dia()), 'ausente')
})

test('as três batidas fazem o dia completo', () => {
  assert.equal(statusDoDia(COMPLETO), 'presente')
})

test('faltando o meio ou a saída, o dia fica incompleto', () => {
  // É esse "resto" que muda pagamento, e é por isso que ele tem nome próprio
  // em vez de ser contado como presente.
  assert.equal(statusDoDia({ ...COMPLETO, meio: null }), 'incompleto')
  assert.equal(statusDoDia({ ...COMPLETO, saida: null }), 'incompleto')
})

test('dia inteiro ausente cala as três células', () => {
  /*
   * A lição que veio do sistema web em 31/08/2026: repetir "não realizada" em
   * vermelho nas três colunas diz três vezes o que o selo "Ausente" já disse
   * uma. Onze linhas assim viram uma parede vermelha sem informação nova.
   */
  assert.equal(celulaSilenciosa(dia()), true)
})

test('etapa pulada dentro de um dia trabalhado continua gritando', () => {
  // Aqui o aviso diz algo que o selo do dia não disse: a pessoa esteve no
  // posto e faltou uma etapa. É anomalia, e muda pagamento.
  assert.equal(celulaSilenciosa({ ...COMPLETO, meio: null }), false)
})

test('o resumo separa trabalhado, faltado e incompleto', () => {
  const resumo = resumoDoHistorico([
    COMPLETO,
    { ...COMPLETO, data: '2026-09-04', meio: null, horas: 8 },
    dia({ data: '2026-09-03' }),
  ])

  assert.equal(resumo.diasTrabalhados, 2)
  assert.equal(resumo.diasFaltados, 1)
  assert.equal(resumo.diasIncompletos, 1)
})

test('incompleto conta como trabalhado, e não como faltado', () => {
  // A pessoa esteve lá. Contar como falta tiraria o dia do pagamento dela por
  // causa de uma batida que ela esqueceu.
  const resumo = resumoDoHistorico([{ ...COMPLETO, saida: null }])
  assert.equal(resumo.diasTrabalhados, 1)
  assert.equal(resumo.diasFaltados, 0)
})

test('as batidas de cada etapa são contadas à parte', () => {
  /*
   * "Dias trabalhados" já dizia quantos dias tiveram ENTRADA — e escondia
   * quantos ficaram sem o meio. São perguntas diferentes, e a segunda é a que
   * aparece na conferência do pagamento.
   */
  const resumo = resumoDoHistorico([
    COMPLETO,
    { ...COMPLETO, data: '2026-09-04', meio: null },
    { ...COMPLETO, data: '2026-09-03', saida: null },
  ])

  assert.deepEqual(resumo.batidas, { entrada: 3, meio: 2, fim: 2 })
})

test('as horas somam, e param numa casa decimal', () => {
  // Hora de evento não tem precisão de segundo. "8.42h" na tela do pagamento
  // sugere uma exatidão que o dado não tem.
  const resumo = resumoDoHistorico([
    { ...COMPLETO, horas: 8.42 },
    { ...COMPLETO, data: '2026-09-04', horas: 7.13 },
  ])
  assert.equal(resumo.horasTotais, 15.6)
})

test('dia sem horas não estraga a soma', () => {
  // Quem entrou e não saiu tem `horas: null`. Somar `null` daria NaN, e a tela
  // mostraria "NaNh" no lugar do total.
  const resumo = resumoDoHistorico([COMPLETO, dia({ data: '2026-09-04' })])
  assert.equal(resumo.horasTotais, 9)
})

test('histórico vazio devolve tudo zerado, e não quebra', () => {
  const resumo = resumoDoHistorico([])
  assert.equal(resumo.diasTrabalhados, 0)
  assert.equal(resumo.horasTotais, 0)
  assert.deepEqual(resumo.batidas, { entrada: 0, meio: 0, fim: 0 })
})
