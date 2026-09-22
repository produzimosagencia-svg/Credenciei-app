/*
 * O mural "Avisos" — a mesma tabela que o site já usa
 * (`avisosPendentesFuncionario`/`avisosPendentesSupervisor` em
 * `lib/avisos.ts`), só a leitura por enquanto (ver o comentário em
 * `avisos.ts`).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cenarioHenriqueEJuliano } from '../dados/memoria.js'
import { avisosPendentes, marcarAvisoVisto } from './avisos.js'

function novoAviso(
  repo: ReturnType<typeof cenarioHenriqueEJuliano>['repo'],
  eventoId: string,
  sobrepor: Partial<{
    id: string; titulo: string; mensagem: string; ativo: boolean
    dataInicio: string; dataFim: string | null
    publico: 'todos' | 'setores' | 'pessoa' | 'supervisores'
    pessoaId: string | null; equipeIds: string[]; recorrente: boolean
  }> = {},
) {
  const aviso = {
    id: sobrepor.id ?? `aviso-${repo.avisos.length + 1}`,
    eventoId,
    titulo: 'Título do aviso',
    mensagem: 'Mensagem do aviso.',
    ativo: true,
    dataInicio: '2026-09-01',
    dataFim: null,
    publico: 'todos' as const,
    pessoaId: null,
    equipeIds: [] as string[],
    recorrente: false,
    ...sobrepor,
  }
  repo.avisos.push(aviso)
  return aviso
}

test('público "todos" aparece pra qualquer um do evento', async () => {
  const { repo, evento, pessoa } = cenarioHenriqueEJuliano()
  novoAviso(repo, evento.id)

  const r = await avisosPendentes(repo, pessoa.id, evento.id)
  assert.equal(r.length, 1)
  assert.equal(r[0]!.titulo, 'Título do aviso')
})

test('público "setores" só aparece pra quem está naquele setor', async () => {
  const { repo, evento, pessoa } = cenarioHenriqueEJuliano()
  novoAviso(repo, evento.id, { publico: 'setores', equipeIds: ['eq-1'] })
  novoAviso(repo, evento.id, { id: 'aviso-outro-setor', publico: 'setores', equipeIds: ['eq-2'] })

  const r = await avisosPendentes(repo, pessoa.id, evento.id)
  assert.equal(r.length, 1)
})

test('público "pessoa" só aparece pra pessoa escolhida', async () => {
  const { repo, evento, pessoa } = cenarioHenriqueEJuliano()
  novoAviso(repo, evento.id, { publico: 'pessoa', pessoaId: pessoa.id })
  novoAviso(repo, evento.id, { id: 'aviso-outra-pessoa', publico: 'pessoa', pessoaId: 'pes-outra' })

  const r = await avisosPendentes(repo, pessoa.id, evento.id)
  assert.equal(r.length, 1)
})

test('público "supervisores" não aparece pro colaborador comum', async () => {
  const { repo, evento, pessoa } = cenarioHenriqueEJuliano()
  novoAviso(repo, evento.id, { publico: 'supervisores' })

  const r = await avisosPendentes(repo, pessoa.id, evento.id)
  assert.equal(r.length, 0)
})

test('público "supervisores" aparece pra quem supervisiona um setor do evento', async () => {
  const { repo, evento } = cenarioHenriqueEJuliano()
  repo.equipes.find(e => e.id === 'eq-1')!.supervisorPessoaId = 'auth-supervisor'
  novoAviso(repo, evento.id, { publico: 'supervisores' })

  const r = await avisosPendentes(repo, 'auth-supervisor', evento.id)
  assert.equal(r.length, 1)
})

test('inativo não aparece', async () => {
  const { repo, evento, pessoa } = cenarioHenriqueEJuliano()
  novoAviso(repo, evento.id, { ativo: false })

  const r = await avisosPendentes(repo, pessoa.id, evento.id)
  assert.equal(r.length, 0)
})

test('fora do período (ainda não começou, ou já terminou) não aparece', async () => {
  const { repo, evento, pessoa } = cenarioHenriqueEJuliano()
  novoAviso(repo, evento.id, { id: 'aviso-futuro', dataInicio: '2099-01-01' })
  novoAviso(repo, evento.id, { id: 'aviso-vencido', dataInicio: '2020-01-01', dataFim: '2020-01-02' })

  const r = await avisosPendentes(repo, pessoa.id, evento.id)
  assert.equal(r.length, 0)
})

test('aviso de outro evento não aparece', async () => {
  const { repo, evento, pessoa } = cenarioHenriqueEJuliano()
  novoAviso(repo, 'ev-outro')

  const r = await avisosPendentes(repo, pessoa.id, evento.id)
  assert.equal(r.length, 0)
})

test('depois de marcar como visto, um aviso NÃO recorrente some da lista', async () => {
  const { repo, evento, pessoa } = cenarioHenriqueEJuliano()
  const aviso = novoAviso(repo, evento.id)

  assert.equal((await avisosPendentes(repo, pessoa.id, evento.id)).length, 1)
  await marcarAvisoVisto(repo, pessoa.id, aviso.id)
  assert.equal((await avisosPendentes(repo, pessoa.id, evento.id)).length, 0)
})

test('um aviso RECORRENTE continua aparecendo mesmo depois de visto', async () => {
  const { repo, evento, pessoa } = cenarioHenriqueEJuliano()
  const aviso = novoAviso(repo, evento.id, { recorrente: true })

  await marcarAvisoVisto(repo, pessoa.id, aviso.id)
  assert.equal((await avisosPendentes(repo, pessoa.id, evento.id)).length, 1)
})

test('marcar como visto não afeta outra pessoa', async () => {
  const { repo, evento, pessoa } = cenarioHenriqueEJuliano()
  const aviso = novoAviso(repo, evento.id)

  await marcarAvisoVisto(repo, 'pes-outra', aviso.id)
  assert.equal((await avisosPendentes(repo, pessoa.id, evento.id)).length, 1)
})
