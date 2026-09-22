/*
 * As sete visões de Atividades — cada uma responde uma pergunta diferente
 * sobre o MESMO dia. O tema aqui: as pendências só cobram depois da hora
 * esperada (nunca antes — "587 não chegaram" de uma equipe que nem estava
 * escalada já aconteceu de verdade no site), e o meio depende das DUAS
 * chaves ligadas (setor e dia).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cenarioHenriqueEJuliano } from '../dados/memoria.js'
import { atividades, eventosParaAcompanhar } from './atividades.js'
import type { Evento } from '../dados/repositorio.js'

const nomes = (linhas: { nome: string }[]) => linhas.map(l => l.nome)

/** Uma segunda organização, com evento e equipe próprios. */
function comSegundaOrganizacao() {
  const c = cenarioHenriqueEJuliano()
  const eventoDaOutra: Evento = { ...c.evento, id: 'ev-outra', organizacaoId: 'org-2', nome: 'Festa da Outra Empresa' }
  c.repo.eventos.push(eventoDaOutra)
  c.repo.dias.set('ev-outra', c.repo.dias.get('ev-hj')!)
  c.repo.equipes.push({ id: 'eq-outra', nome: 'Portaria', eventoId: 'ev-outra', exigeMeio: false })
  return { ...c, eventoDaOutra }
}

/** Um supervisor preso à equipe eq-1, mais uma segunda equipe no MESMO evento. */
function comSupervisorEOutroSetor() {
  const c = cenarioHenriqueEJuliano()
  const supervisor = { id: 'auth-sup', nome: 'Carlos Silva', papel: 'supervisor' as const, organizacaoId: 'org-1', ativo: true }
  c.repo.perfis.push(supervisor)
  c.repo.equipes.find(e => e.id === 'eq-1')!.supervisorPessoaId = supervisor.id

  c.repo.equipes.push({ id: 'eq-2', nome: 'Bar', eventoId: 'ev-hj', exigeMeio: true })
  c.repo.pessoas.push({ id: 'pes-marcia', nome: 'Márcia Melo', cpf: '11122233344', telefone: null, fotoPath: null })
  c.repo.participacoes.push({
    id: 'part-marcia', pessoaId: 'pes-marcia', eventoId: 'ev-hj', equipeId: 'eq-2', equipeNome: 'Bar',
    funcao: 'Garçonete', supervisorNome: null, ativo: true, descredenciadoEm: null,
    valorReceber: null, pago: false, pagoEm: null, qrToken: 'token-da-marcia',
    cidade: null, criadoEm: '2026-08-20T10:00:00-03:00',
  })
  return { ...c, supervisor }
}

test('quem não tem conta de painel não acompanha nada', async () => {
  const { repo, pessoa } = cenarioHenriqueEJuliano()
  await assert.rejects(() => eventosParaAcompanhar(repo, pessoa.id), /permissão/)
  await assert.rejects(() => atividades(repo, pessoa.id, 'ev-hj'), /permissão/)
})

// ─── Eventos para acompanhar ────────────────────────────────────────────────

test('master acompanha todas as organizações, admin só a própria', async () => {
  const { repo, master, admin } = comSegundaOrganizacao()
  const doMaster = await eventosParaAcompanhar(repo, master.id)
  const doAdmin = await eventosParaAcompanhar(repo, admin.id)
  assert.equal(doMaster.length, 2)
  assert.deepEqual(doAdmin, [{ eventoId: 'ev-hj', nome: 'Henrique e Juliano — Kleber Andrade' }])
})

test('admin de outra organização não acompanha este evento', async () => {
  const { repo, admin } = comSegundaOrganizacao()
  await assert.rejects(() => atividades(repo, admin.id, 'ev-outra'), /não tem acesso/)
})

// ─── Feito (entrada, meio, fim) e presentes ────────────────────────────────

test('quem bateu a entrada aparece na visão "entrada"', async () => {
  const { repo, admin, participacao } = cenarioHenriqueEJuliano()
  repo.registros.push({
    id: 'r-1', participacaoId: participacao.id, tipo: 'entrada', dataRef: '2026-09-05',
    registradoEm: '2026-09-05T19:00:00-03:00', recebidoEm: '2026-09-05T19:00:00-03:00',
    fotoPath: null, lat: null, lng: null, manual: false, origem: 'app',
  })
  const a = await atividades(repo, admin.id, 'ev-hj', { visao: 'entrada', dia: '2026-09-05' })
  assert.deepEqual(nomes(a.linhas), ['João da Silva'])
  assert.equal(a.linhas[0]?.em, '2026-09-05T19:00:00-03:00')
  assert.equal(a.colunaHora, 'Registrou às')
})

test('entrada sem saída é "presentes"; com saída, some da lista', async () => {
  const { repo, admin, participacao } = cenarioHenriqueEJuliano()
  repo.registros.push({
    id: 'r-1', participacaoId: participacao.id, tipo: 'entrada', dataRef: '2026-09-05',
    registradoEm: '2026-09-05T19:00:00-03:00', recebidoEm: '2026-09-05T19:00:00-03:00',
    fotoPath: null, lat: null, lng: null, manual: false, origem: 'app',
  })
  const antes = await atividades(repo, admin.id, 'ev-hj', { visao: 'presentes', dia: '2026-09-05' })
  assert.deepEqual(nomes(antes.linhas), ['João da Silva'])

  repo.registros.push({
    id: 'r-2', participacaoId: participacao.id, tipo: 'fim', dataRef: '2026-09-05',
    registradoEm: '2026-09-05T23:00:00-03:00', recebidoEm: '2026-09-05T23:00:00-03:00',
    fotoPath: null, lat: null, lng: null, manual: false, origem: 'app',
  })
  const depois = await atividades(repo, admin.id, 'ev-hj', { visao: 'presentes', dia: '2026-09-05' })
  assert.deepEqual(depois.linhas, [])
})

test('batida do registro assistido chega com manual:true', async () => {
  const { repo, admin, participacao } = cenarioHenriqueEJuliano()
  repo.registros.push({
    id: 'r-1', participacaoId: participacao.id, tipo: 'entrada', dataRef: '2026-09-05',
    registradoEm: '2026-09-05T19:00:00-03:00', recebidoEm: '2026-09-05T19:00:00-03:00',
    fotoPath: null, lat: null, lng: null, manual: true, origem: 'app',
  })
  const a = await atividades(repo, admin.id, 'ev-hj', { visao: 'entrada', dia: '2026-09-05' })
  assert.equal(a.linhas[0]?.manual, true)
})

// ─── Pendências: só depois da hora esperada ────────────────────────────────

test('ainda não chegaram só cobra depois de a janela de entrada fechar', async () => {
  const { repo, admin } = cenarioHenriqueEJuliano()
  // Janela de entrada do dia principal fecha às 23:55.
  const antes = await atividades(
    repo, admin.id, 'ev-hj', { visao: 'faltam', dia: '2026-09-05' }, new Date('2026-09-05T20:00:00-03:00'),
  )
  assert.deepEqual(antes.linhas, [], 'antes das 23:55, ainda pode chegar')

  const depois = await atividades(
    repo, admin.id, 'ev-hj', { visao: 'faltam', dia: '2026-09-05' }, new Date('2026-09-06T00:01:00-03:00'),
  )
  assert.deepEqual(nomes(depois.linhas), ['João da Silva'])
})

test('quem entrou não aparece em "ainda não chegaram", mesmo depois da hora', async () => {
  const { repo, admin, participacao } = cenarioHenriqueEJuliano()
  repo.registros.push({
    id: 'r-1', participacaoId: participacao.id, tipo: 'entrada', dataRef: '2026-09-05',
    registradoEm: '2026-09-05T19:00:00-03:00', recebidoEm: '2026-09-05T19:00:00-03:00',
    fotoPath: null, lat: null, lng: null, manual: false, origem: 'app',
  })
  const a = await atividades(
    repo, admin.id, 'ev-hj', { visao: 'faltam', dia: '2026-09-05' }, new Date('2026-09-06T00:01:00-03:00'),
  )
  assert.deepEqual(a.linhas, [])
})

test('não fizeram o meio: só depois da janela individual (entrada + 6h) fechar', async () => {
  const { repo, admin, participacao } = cenarioHenriqueEJuliano()
  repo.registros.push({
    id: 'r-1', participacaoId: participacao.id, tipo: 'entrada', dataRef: '2026-09-05',
    registradoEm: '2026-09-05T19:00:00-03:00', recebidoEm: '2026-09-05T19:00:00-03:00',
    fotoPath: null, lat: null, lng: null, manual: false, origem: 'app',
  })
  // Entrada 19h + 4h (abre) + 2h (duração) = janela fecha às 01h do dia 6.
  const antes = await atividades(
    repo, admin.id, 'ev-hj', { visao: 'sem_meio', dia: '2026-09-05' }, new Date('2026-09-06T00:30:00-03:00'),
  )
  assert.deepEqual(antes.linhas, [])

  const depois = await atividades(
    repo, admin.id, 'ev-hj', { visao: 'sem_meio', dia: '2026-09-05' }, new Date('2026-09-06T01:30:00-03:00'),
  )
  assert.deepEqual(nomes(depois.linhas), ['João da Silva'])
  assert.equal(depois.linhas[0]?.em, '2026-09-05T19:00:00-03:00', 'a hora mostrada é a da entrada, que ancora a pendência')
})

test('setor que não exige o meio nunca cobra "não fizeram o meio"', async () => {
  const { repo, admin, participacao } = cenarioHenriqueEJuliano()
  repo.equipes.find(e => e.id === 'eq-1')!.exigeMeio = false
  repo.registros.push({
    id: 'r-1', participacaoId: participacao.id, tipo: 'entrada', dataRef: '2026-09-05',
    registradoEm: '2026-09-05T19:00:00-03:00', recebidoEm: '2026-09-05T19:00:00-03:00',
    fotoPath: null, lat: null, lng: null, manual: false, origem: 'app',
  })
  const a = await atividades(
    repo, admin.id, 'ev-hj', { visao: 'sem_meio', dia: '2026-09-05' }, new Date('2026-09-07T00:00:00-03:00'),
  )
  assert.deepEqual(a.linhas, [])
})

test('dia que não pede o meio nunca cobra "não fizeram o meio", mesmo com o setor ligado', async () => {
  const { repo, admin, participacao } = cenarioHenriqueEJuliano()
  repo.dias.get('ev-hj')!.find(d => d.data === '2026-09-05')!.exigeMeio = false
  repo.registros.push({
    id: 'r-1', participacaoId: participacao.id, tipo: 'entrada', dataRef: '2026-09-05',
    registradoEm: '2026-09-05T19:00:00-03:00', recebidoEm: '2026-09-05T19:00:00-03:00',
    fotoPath: null, lat: null, lng: null, manual: false, origem: 'app',
  })
  const a = await atividades(
    repo, admin.id, 'ev-hj', { visao: 'sem_meio', dia: '2026-09-05' }, new Date('2026-09-07T00:00:00-03:00'),
  )
  assert.deepEqual(a.linhas, [])
})

test('não fez o descredenciamento: entrou e não saiu, depois do fim do dia', async () => {
  const { repo, admin, participacao } = cenarioHenriqueEJuliano()
  repo.registros.push({
    id: 'r-1', participacaoId: participacao.id, tipo: 'entrada', dataRef: '2026-09-05',
    registradoEm: '2026-09-05T19:00:00-03:00', recebidoEm: '2026-09-05T19:00:00-03:00',
    fotoPath: null, lat: null, lng: null, manual: false, origem: 'app',
  })
  // Janela de saída do dia principal fecha às 08:00 do dia 6.
  const antes = await atividades(
    repo, admin.id, 'ev-hj', { visao: 'sem_saida', dia: '2026-09-05' }, new Date('2026-09-06T05:00:00-03:00'),
  )
  assert.deepEqual(antes.linhas, [])

  const depois = await atividades(
    repo, admin.id, 'ev-hj', { visao: 'sem_saida', dia: '2026-09-05' }, new Date('2026-09-06T09:00:00-03:00'),
  )
  assert.deepEqual(nomes(depois.linhas), ['João da Silva'])
})

test('participação inativa ou já descredenciada não entra em pendência nenhuma', async () => {
  const { repo, admin, participacao } = cenarioHenriqueEJuliano()
  participacao.ativo = false
  const comInativo = await atividades(
    repo, admin.id, 'ev-hj', { visao: 'faltam', dia: '2026-09-05' }, new Date('2026-09-06T00:01:00-03:00'),
  )
  assert.deepEqual(comInativo.linhas, [])

  participacao.ativo = true
  participacao.descredenciadoEm = '2026-09-05T10:00:00-03:00'
  const comDescredenciado = await atividades(
    repo, admin.id, 'ev-hj', { visao: 'faltam', dia: '2026-09-05' }, new Date('2026-09-06T00:01:00-03:00'),
  )
  assert.deepEqual(comDescredenciado.linhas, [])
})

// ─── O dia escolhido ────────────────────────────────────────────────────────

test('dia pedido que não existe cai no dia mais recente já passado', async () => {
  const { repo, admin } = cenarioHenriqueEJuliano()
  const a = await atividades(
    repo, admin.id, 'ev-hj', { dia: '2099-01-01' }, new Date('2026-09-06T10:00:00-03:00'),
  )
  assert.equal(a.diaEscolhido, '2026-09-06', 'o último dia do evento, que já passou')
})

test('sem dia pedido, cai em hoje quando hoje é dia de operação', async () => {
  const { repo, admin } = cenarioHenriqueEJuliano()
  const a = await atividades(repo, admin.id, 'ev-hj', {}, new Date('2026-09-04T10:00:00-03:00'))
  assert.equal(a.diaEscolhido, '2026-09-04')
  assert.equal(a.hoje, '2026-09-04')
})

// ─── Isolamento ─────────────────────────────────────────────────────────────

test('supervisor só vê a própria equipe, nem outro setor do mesmo evento', async () => {
  const { repo, supervisor } = comSupervisorEOutroSetor()
  repo.registros.push(
    {
      id: 'r-joao', participacaoId: 'part-joao', tipo: 'entrada', dataRef: '2026-09-05',
      registradoEm: '2026-09-05T19:00:00-03:00', recebidoEm: '2026-09-05T19:00:00-03:00',
      fotoPath: null, lat: null, lng: null, manual: false, origem: 'app',
    },
    {
      id: 'r-marcia', participacaoId: 'part-marcia', tipo: 'entrada', dataRef: '2026-09-05',
      registradoEm: '2026-09-05T19:00:00-03:00', recebidoEm: '2026-09-05T19:00:00-03:00',
      fotoPath: null, lat: null, lng: null, manual: false, origem: 'app',
    },
  )
  const a = await atividades(repo, supervisor.id, 'ev-hj', { visao: 'entrada', dia: '2026-09-05' })
  assert.deepEqual(nomes(a.linhas), ['João da Silva'])
})

test('supervisor de outro evento não acompanha este', async () => {
  const { repo } = cenarioHenriqueEJuliano()
  const supervisorDeFora = { id: 'auth-sup-fora', nome: 'Outro', papel: 'supervisor' as const, organizacaoId: 'org-2', ativo: true }
  repo.perfis.push(supervisorDeFora)
  await assert.rejects(() => atividades(repo, supervisorDeFora.id, 'ev-hj'), /não tem acesso/)
})

// ─── Números ────────────────────────────────────────────────────────────────

test('os números somam as três pendências juntas', async () => {
  const { repo, admin } = cenarioHenriqueEJuliano()
  const a = await atividades(
    repo, admin.id, 'ev-hj', { dia: '2026-09-05' }, new Date('2026-09-06T09:00:00-03:00'),
  )
  // João não entrou, e a janela de entrada já fechou: só "faltam" conta.
  assert.equal(a.numeros.pendencias, 1)
  assert.equal(a.numeros.presentes, 0)
  assert.equal(a.numeros.entradas, 0)
})
