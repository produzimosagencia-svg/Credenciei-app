/*
 * O painel do supervisor.
 *
 * O que estes testes protegem é o número: se "faltam 3" estiver errado, o
 * supervisor procura gente que já foi embora — ou não procura quem sumiu.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cenarioHenriqueEJuliano } from '../dados/memoria.js'
import { registrarBatida } from './batidas.js'
import { calcularPendencia, painelDaEquipe } from './equipe.js'

/** Uma equipe com três pessoas e um supervisor. */
function comEquipe() {
  const c = cenarioHenriqueEJuliano()

  c.repo.pessoas.push(
    { id: 'pes-carlos', nome: 'Carlos Silva', cpf: '11122233344', telefone: '27977776666', fotoPath: null },
    { id: 'pes-maria', nome: 'Maria Souza', cpf: '98765432100', telefone: '27988887777', fotoPath: null },
    { id: 'pes-ana', nome: 'Ana Lima', cpf: '55566677788', telefone: '27966665555', fotoPath: null },
  )
  c.repo.equipes[0]!.supervisorPessoaId = 'pes-carlos'

  for (const [id, pessoaId, funcao] of [
    ['part-maria', 'pes-maria', 'Bar'],
    ['part-ana', 'pes-ana', 'Camarim'],
  ] as const) {
    c.repo.participacoes.push({
      id, pessoaId, eventoId: c.evento.id, equipeId: 'eq-1', equipeNome: 'Produção',
      funcao, supervisorNome: 'Carlos Silva', ativo: true, descredenciadoEm: null,
      valorReceber: 150, pago: false, pagoEm: null, qrToken: `tk-${id}`,
    })
  }
  return c
}

const NA_MONTAGEM = new Date('2026-09-03T14:00:00-03:00')

const bate = (participacaoId: string, tipo: 'entrada' | 'meio' | 'fim', em: string) => ({
  id: `${participacaoId}-${tipo}`, participacaoId, tipo, registradoEm: em,
})

// ─── Escopo ─────────────────────────────────────────────────────────────────

test('quem não é supervisor não tem painel', async () => {
  const { repo } = comEquipe()
  await assert.rejects(() => painelDaEquipe(repo, 'pes-maria'), /não é supervisor/)
})

test('o painel traz a equipe do supervisor', async () => {
  const { repo } = comEquipe()
  const p = await painelDaEquipe(repo, 'pes-carlos', NA_MONTAGEM)

  assert.equal(p.equipeNome, 'Produção')
  assert.equal(p.total, 3)
  assert.equal(p.etapa, 'montagem')
})

// ─── O número ───────────────────────────────────────────────────────────────

test('presentes conta quem bateu entrada hoje', async () => {
  const { repo } = comEquipe()
  const antes = await painelDaEquipe(repo, 'pes-carlos', NA_MONTAGEM)
  assert.equal(antes.presentes, 0)

  await registrarBatida(repo, 'pes-joao', bate('part-joao', 'entrada', '2026-09-03T08:00:00-03:00'))
  const depois = await painelDaEquipe(repo, 'pes-carlos', NA_MONTAGEM)
  assert.equal(depois.presentes, 1)
})

test('batida de ontem não conta como presença de hoje', async () => {
  const { repo } = comEquipe()
  await registrarBatida(repo, 'pes-joao', bate('part-joao', 'entrada', '2026-09-03T08:00:00-03:00'))

  const noDiaSeguinte = await painelDaEquipe(repo, 'pes-carlos', new Date('2026-09-04T10:00:00-03:00'))
  assert.equal(noDiaSeguinte.presentes, 0, 'cada dia tem o seu ciclo')
})

test('quem foi descredenciado sai da lista', async () => {
  /*
   * Deixá-la ali como "faltando" faria o supervisor procurar alguém que já foi
   * embora, e inflaria o número de ausentes justo no fechamento.
   */
  const { repo } = comEquipe()
  repo.participacoes.find(p => p.id === 'part-ana')!.descredenciadoEm = '2026-09-02T20:00:00-03:00'

  const p = await painelDaEquipe(repo, 'pes-carlos', NA_MONTAGEM)
  assert.equal(p.total, 2)
  assert.ok(!p.pessoas.some(x => x.nome === 'Ana Lima'))
})

// ─── A pendência ────────────────────────────────────────────────────────────

test('sem entrada, a pendência é a entrada', () => {
  assert.equal(calcularPendencia(null, null, null, NA_MONTAGEM), 'entrada')
})

test('o meio só vira pendência depois de a janela abrir', () => {
  /*
   * Antes disso a pessoa não tem o que fazer — o botão dela nem apareceu.
   * Marcar como pendente encheria a lista de falso alarme logo após a entrada.
   */
  const entrada = '2026-09-03T08:00:00-03:00'

  const logoDepois = new Date('2026-09-03T09:00:00-03:00')
  assert.equal(calcularPendencia(entrada, null, null, logoDepois), null)

  const depoisDeAbrir = new Date('2026-09-03T12:30:00-03:00')
  assert.equal(calcularPendencia(entrada, null, null, depoisDeAbrir), 'meio')
})

test('com o meio feito, a pendência passa a ser a saída', () => {
  const r = calcularPendencia(
    '2026-09-03T08:00:00-03:00', '2026-09-03T12:10:00-03:00', null,
    new Date('2026-09-03T18:00:00-03:00'),
  )
  assert.equal(r, 'saida')
})

test('ciclo completo não tem pendência', () => {
  const r = calcularPendencia(
    '2026-09-03T08:00:00-03:00', '2026-09-03T12:10:00-03:00', '2026-09-03T18:00:00-03:00',
    new Date('2026-09-03T19:00:00-03:00'),
  )
  assert.equal(r, null)
})

// ─── A ordem ────────────────────────────────────────────────────────────────

test('quem tem pendência aparece primeiro', async () => {
  /*
   * A tela de quem está andando pelo evento precisa começar pelo que exige
   * ação — rolar a lista atrás dos problemas, com o celular numa mão, é o que
   * faz o supervisor desistir de usar.
   */
  const { repo } = comEquipe()

  // João completou o ciclo; Maria entrou e deve o meio; Ana não apareceu.
  await registrarBatida(repo, 'pes-joao', bate('part-joao', 'entrada', '2026-09-03T08:00:00-03:00'))
  await registrarBatida(repo, 'pes-joao', bate('part-joao', 'meio', '2026-09-03T12:10:00-03:00'))
  await registrarBatida(repo, 'pes-joao', bate('part-joao', 'fim', '2026-09-03T13:00:00-03:00'))
  await registrarBatida(repo, 'pes-maria', bate('part-maria', 'entrada', '2026-09-03T08:00:00-03:00'))

  const p = await painelDaEquipe(repo, 'pes-carlos', NA_MONTAGEM)

  assert.deepEqual(
    p.pessoas.map(x => x.pendencia),
    ['entrada', 'meio', null],
    'ausente, depois quem deve o meio, e o resolvido por último',
  )
  assert.equal(p.pessoas[0]!.nome, 'Ana Lima')
})
