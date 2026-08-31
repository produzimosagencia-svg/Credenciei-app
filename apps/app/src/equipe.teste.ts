/*
 * Os filtros da equipe.
 *
 * Cada um responde a uma pergunta que o supervisor faz no meio do evento —
 * "quem está aqui?", "quem falta?", "quem devia ter batido e não bateu?". Errar
 * a resposta manda ele procurar a pessoa errada, com o evento acontecendo.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { PessoaDoSetor } from '@credenciei/contrato'
import {
  combinaComBusca, contarPorFiltro, estaPresente, filtrarEquipe, temPendencia,
} from './equipe.js'

function pessoa(p: Partial<PessoaDoSetor> = {}): PessoaDoSetor {
  return {
    participacaoId: 'p-1',
    nome: 'Ana Cláudia Ferreira',
    cpf: '03748261509',
    telefone: '27999255959',
    empresa: 'Time Kiki',
    funcao: null,
    fotoUrl: null,
    ativo: true,
    valorReceber: 150,
    pago: false,
    entrada: null,
    meio: null,
    fim: null,
    statusEntrada: 'aberto',
    statusMeio: 'aberto',
    statusFim: 'aberto',
    ...p,
  }
}

const ENTROU = pessoa({ participacaoId: 'p-entrou', entrada: '2026-09-05T14:00:00-03:00' })
const SAIU = pessoa({
  participacaoId: 'p-saiu',
  entrada: '2026-09-05T14:00:00-03:00',
  fim: '2026-09-05T23:00:00-03:00',
})
const NAO_VEIO = pessoa({ participacaoId: 'p-faltou' })

// ─── Presente ───────────────────────────────────────────────────────────────

test('presente é quem entrou e ainda não saiu', () => {
  /*
   * Contar só "tem entrada" incluiria quem já foi embora — e essa é justamente
   * a pergunta que se repete no rádio durante o evento: quantos estão AQUI.
   */
  assert.equal(estaPresente(ENTROU), true)
  assert.equal(estaPresente(SAIU), false)
  assert.equal(estaPresente(NAO_VEIO), false)
})

test('ausente é quem não tem entrada — quem saiu não é ausente', () => {
  const ausentes = filtrarEquipe([ENTROU, SAIU, NAO_VEIO], { filtro: 'ausentes' })
  assert.deepEqual(ausentes.map(p => p.participacaoId), ['p-faltou'])
})

// ─── Pendência ──────────────────────────────────────────────────────────────

test('só `fechado` vira pendência', () => {
  /*
   * `aberto` ainda dá tempo e `indefinido` nem abriu. Tratar os três como falta
   * encheria a lista de gente que não deve nada — e uma lista de pendências que
   * mente para de ser lida.
   */
  assert.equal(temPendencia(pessoa({ statusMeio: 'fechado' })), true)
  assert.equal(temPendencia(pessoa({ statusMeio: 'aberto' })), false)
  assert.equal(temPendencia(pessoa({ statusMeio: 'indefinido' })), false)
  assert.equal(temPendencia(pessoa({ statusEntrada: 'feito', statusFim: 'fechado' })), true)
})

// ─── Busca ──────────────────────────────────────────────────────────────────

test('a busca por CPF funciona com e sem pontuação', () => {
  /*
   * No sistema web a comparação é literal, então quem digita "037.482.615-09"
   * não acha ninguém — o banco guarda só os dígitos. Aqui os dois lados são
   * reduzidos.
   */
  const p = pessoa()
  assert.equal(combinaComBusca(p, '03748261509'), true)
  assert.equal(combinaComBusca(p, '037.482.615-09'), true)
  assert.equal(combinaComBusca(p, '037'), true)
  assert.equal(combinaComBusca(p, '999'), false)
})

test('a busca por nome ignora acento e maiúscula', () => {
  const p = pessoa()
  assert.equal(combinaComBusca(p, 'claudia'), true)
  assert.equal(combinaComBusca(p, 'CLÁUDIA'), true)
  assert.equal(combinaComBusca(p, 'ferreira'), true)
})

test('a busca também acha por empresa e função', () => {
  const p = pessoa({ empresa: 'Time Kiki', funcao: 'Eletricista' })
  assert.equal(combinaComBusca(p, 'kiki'), true)
  assert.equal(combinaComBusca(p, 'eletric'), true)
})

test('busca vazia não filtra ninguém', () => {
  assert.equal(filtrarEquipe([ENTROU, SAIU, NAO_VEIO], { busca: '   ' }).length, 3)
})

test('empresa e função ausentes não quebram a busca', () => {
  // Cadastro vindo do formulário público costuma vir sem os dois.
  const p = pessoa({ empresa: null, funcao: null })
  assert.equal(combinaComBusca(p, 'kiki'), false)
  assert.equal(combinaComBusca(p, 'ana'), true)
})

// ─── Filtro e busca juntos ──────────────────────────────────────────────────

test('o filtro e a busca se somam, e não se substituem', () => {
  const lista = [
    pessoa({ participacaoId: 'a', nome: 'Bruno Silva', entrada: '2026-09-05T14:00:00-03:00' }),
    pessoa({ participacaoId: 'b', nome: 'Carla Silva' }),
    pessoa({ participacaoId: 'c', nome: 'Bruno Costa' }),
  ]
  const r = filtrarEquipe(lista, { filtro: 'presentes', busca: 'silva' })
  assert.deepEqual(r.map(p => p.participacaoId), ['a'])
})

// ─── Contadores ─────────────────────────────────────────────────────────────

test('os contadores olham a lista inteira, não o que a busca deixou passar', () => {
  /*
   * O número na aba responde "quantos existem". Recalculá-lo a cada letra
   * digitada faria as abas dançarem enquanto a pessoa procura alguém.
   */
  const lista = [ENTROU, SAIU, NAO_VEIO, pessoa({ participacaoId: 'p-off', ativo: false })]
  const c = contarPorFiltro(lista)

  assert.equal(c.todos, 4)
  assert.equal(c.presentes, 1)
  assert.equal(c.ausentes, 2, 'quem não veio e quem não foi ativada')
  assert.equal(c.nao_ativados, 1)
  assert.equal(c.pendencias, 0)
})

test('equipe vazia devolve tudo zerado', () => {
  const c = contarPorFiltro([])
  assert.equal(c.todos, 0)
  assert.equal(c.presentes, 0)
  assert.deepEqual(filtrarEquipe([], { filtro: 'pendencias' }), [])
})
