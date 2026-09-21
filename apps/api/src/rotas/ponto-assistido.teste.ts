/*
 * Registro assistido — quando o crachá não passa e a pessoa está na frente
 * de quem atende. O tema aqui tem duas pontas: a busca (CPF exato, CPF
 * aproximado, nome com mais de um candidato) e a régua de quem escolhe a
 * etapa (o operador, não o sistema — ao contrário do scanner).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cenarioHenriqueEJuliano } from '../dados/memoria.js'
import { abrirFicha, localizarPessoa, registrarPresencaAssistida } from './ponto-assistido.js'
import type { Evento } from '../dados/repositorio.js'

/** Uma segunda organização, com um evento, uma equipe e uma pessoa próprios. */
function comSegundaOrganizacao() {
  const c = cenarioHenriqueEJuliano()
  const eventoDaOutra: Evento = {
    ...c.evento,
    id: 'ev-outra',
    organizacaoId: 'org-2',
    nome: 'Festa da Outra Empresa',
  }
  c.repo.eventos.push(eventoDaOutra)
  c.repo.equipes.push({ id: 'eq-outra', nome: 'Portaria', eventoId: 'ev-outra' })
  c.repo.pessoas.push({ id: 'pes-rui', nome: 'Rui Bastos', cpf: '33333333333', telefone: null, fotoPath: null })
  c.repo.participacoes.push({
    ...c.participacao, id: 'part-rui', pessoaId: 'pes-rui', eventoId: 'ev-outra',
    equipeId: 'eq-outra', equipeNome: 'Portaria', qrToken: 'token-do-rui',
  })
  return { ...c, eventoDaOutra }
}

/** Um supervisor, preso ao setor (equipe) do evento Henrique e Juliano. */
function comSupervisor() {
  const c = cenarioHenriqueEJuliano()
  const supervisor = { id: 'auth-sup', nome: 'Carlos Silva', papel: 'supervisor' as const, organizacaoId: 'org-1', ativo: true }
  c.repo.perfis.push(supervisor)
  c.repo.equipes.find(e => e.id === 'eq-1')!.supervisorPessoaId = supervisor.id
  return { ...c, supervisor }
}

/** Uma segunda pessoa, no MESMO evento e equipe, para os casos de mais de um candidato. */
function comSegundaPessoaNoMesmoSetor() {
  const c = cenarioHenriqueEJuliano()
  c.repo.pessoas.push({ id: 'pes-joana', nome: 'Joana Mendes', cpf: '98765432100', telefone: null, fotoPath: null })
  c.repo.participacoes.push({
    ...c.participacao, id: 'part-joana', pessoaId: 'pes-joana', qrToken: 'token-da-joana',
  })
  return c
}

test('quem não tem conta de painel não pode localizar ninguém', async () => {
  const { repo, pessoa } = cenarioHenriqueEJuliano()
  await assert.rejects(() => localizarPessoa(repo, pessoa.id, 'João'), /permissão/)
})

// ─── Localizar ──────────────────────────────────────────────────────────────

test('termo curto demais é recusado antes de qualquer busca', async () => {
  const { repo, admin } = cenarioHenriqueEJuliano()
  const r = await localizarPessoa(repo, admin.id, 'jo')
  assert.match(r.erro ?? '', /pelo menos três letras/)
})

test('CPF completo e exato abre a ficha direto, sem lista', async () => {
  const { repo, admin, pessoa } = cenarioHenriqueEJuliano()
  const r = await localizarPessoa(repo, admin.id, pessoa.cpf)
  assert.ok(r.ficha)
  assert.equal(r.ficha?.nome, 'João da Silva')
  assert.equal(r.candidatos, undefined)
})

test('nome que bate com mais de uma pessoa devolve candidatos, não escolhe sozinho', async () => {
  const { repo, admin } = comSegundaPessoaNoMesmoSetor()
  const r = await localizarPessoa(repo, admin.id, 'joa') // bate em "João da Silva" e "Joana Mendes"
  assert.ok(r.candidatos)
  assert.equal(r.candidatos?.length, 2)
})

test('CPF exato não encontra ninguém, mas um cadastro a um dígito de distância aparece como aproximado', async () => {
  const { repo, admin } = cenarioHenriqueEJuliano()
  // João está cadastrado com ...901; um dígito trocado no papel na mão do operador.
  const r = await localizarPessoa(repo, admin.id, '12345678911')
  assert.ok(r.candidatos)
  assert.equal(r.candidatos?.length, 1)
  assert.equal(r.candidatos?.[0]?.cpfAproximado, true)
  assert.equal(r.candidatos?.[0]?.nome, 'João da Silva')
})

test('ninguém encontrado responde com erro, não com lista vazia silenciosa', async () => {
  const { repo, admin } = cenarioHenriqueEJuliano()
  const r = await localizarPessoa(repo, admin.id, 'Fulano de Tal')
  assert.match(r.erro ?? '', /Ninguém encontrado/)
})

test('admin de uma organização não localiza pessoa de outra organização', async () => {
  const { repo, admin } = comSegundaOrganizacao()
  const r = await localizarPessoa(repo, admin.id, '33333333333') // CPF do Rui, da outra org
  assert.match(r.erro ?? '', /Ninguém encontrado/)
})

test('master localiza gente de qualquer organização', async () => {
  const { repo, master } = comSegundaOrganizacao()
  const r = await localizarPessoa(repo, master.id, '33333333333')
  assert.equal(r.ficha?.nome, 'Rui Bastos')
})

test('supervisor só localiza a PRÓPRIA equipe, nem outro setor do mesmo evento', async () => {
  const { repo, supervisor } = comSupervisor()
  repo.equipes.push({ id: 'eq-outro-setor', nome: 'Bar', eventoId: 'ev-hj' })
  repo.pessoas.push({ id: 'pes-marcia', nome: 'Márcia Melo', cpf: '11122233344', telefone: null, fotoPath: null })
  repo.participacoes.push({
    id: 'part-marcia', pessoaId: 'pes-marcia', eventoId: 'ev-hj', equipeId: 'eq-outro-setor',
    equipeNome: 'Bar', funcao: 'Garçonete', supervisorNome: null, ativo: true, descredenciadoEm: null,
    valorReceber: null, pago: false, pagoEm: null, qrToken: 'token-da-marcia',
    cidade: null, criadoEm: '2026-08-20T10:00:00-03:00',
  })

  const doProprioSetor = await localizarPessoa(repo, supervisor.id, 'João da Silva')
  assert.equal(doProprioSetor.ficha?.nome, 'João da Silva')

  const deOutroSetor = await localizarPessoa(repo, supervisor.id, 'Márcia Melo')
  assert.match(deOutroSetor.erro ?? '', /Ninguém encontrado/)
})

// ─── Abrir ficha ────────────────────────────────────────────────────────────

test('abrir ficha de participação fora do alcance responde igual a inexistente', async () => {
  const { repo, admin } = comSegundaOrganizacao()
  const r = await abrirFicha(repo, admin.id, 'part-rui')
  assert.match(r.erro ?? '', /Não encontramos esta pessoa/)
})

test('a ficha traz a próxima etapa pendente e o histórico do dia', async () => {
  const { repo, admin, participacao } = cenarioHenriqueEJuliano()
  await registrarPresencaAssistida(
    repo, admin.id, participacao.id,
    { tipo: 'entrada', fotoBase64: 'data:image/jpeg;base64,abc' },
    new Date('2026-09-05T19:00:00-03:00'),
  )
  const r = await abrirFicha(repo, admin.id, participacao.id, new Date('2026-09-05T20:00:00-03:00'))
  assert.equal(r.ficha?.proximaPendente?.tipo, 'meio')
  assert.equal(r.ficha?.ultimaBatida?.rotulo, 'Entrada')
  assert.deepEqual(r.ficha?.etapas.map(e => e.tipo), ['entrada', 'meio', 'fim'])
})

// ─── Registrar presença assistida ──────────────────────────────────────────

test('etapa inválida é recusada mesmo vinda do operador', async () => {
  const { repo, admin, participacao } = cenarioHenriqueEJuliano()
  const r = await registrarPresencaAssistida(
    repo, admin.id, participacao.id,
    { tipo: 'saida' as unknown as 'entrada', fotoBase64: 'data:image/jpeg;base64,abc' },
  )
  assert.match(r.erro ?? '', /Etapa inválida/)
})

test('sem foto, não registra', async () => {
  const { repo, admin, participacao } = cenarioHenriqueEJuliano()
  const r = await registrarPresencaAssistida(repo, admin.id, participacao.id, { tipo: 'entrada', fotoBase64: '' })
  assert.match(r.erro ?? '', /foto do rosto é obrigatória/)
})

test('participação inativa é recusada', async () => {
  const { repo, admin, participacao } = cenarioHenriqueEJuliano()
  participacao.ativo = false
  const r = await registrarPresencaAssistida(
    repo, admin.id, participacao.id, { tipo: 'entrada', fotoBase64: 'data:image/jpeg;base64,abc' },
  )
  assert.match(r.erro ?? '', /ainda não foi ativada/)
})

test('o operador escolhe a etapa — não valida janela nem ordem, ao contrário do scanner', async () => {
  const { repo, admin, participacao } = cenarioHenriqueEJuliano()
  // Direto para o "meio", sem entrada registrada, e às 3h da madrugada — o
  // scanner recusaria os dois; o assistido existe justamente para isto.
  const r = await registrarPresencaAssistida(
    repo, admin.id, participacao.id,
    { tipo: 'meio', fotoBase64: 'data:image/jpeg;base64,abc' },
    new Date('2026-09-05T03:00:00-03:00'),
  )
  assert.equal(r.etapa, 'Meio do evento')
  assert.equal(r.nome, 'João da Silva')
})

test('escolher uma etapa já registrada sobrescreve o horário — é correção, não duplicata', async () => {
  const { repo, admin, participacao } = cenarioHenriqueEJuliano()
  await registrarPresencaAssistida(
    repo, admin.id, participacao.id,
    { tipo: 'entrada', fotoBase64: 'data:image/jpeg;base64,abc' },
    new Date('2026-09-05T08:00:00-03:00'),
  )
  await registrarPresencaAssistida(
    repo, admin.id, participacao.id,
    { tipo: 'entrada', fotoBase64: 'data:image/jpeg;base64,abc' },
    new Date('2026-09-05T08:30:00-03:00'),
  )
  const registros = await repo.registrosDaParticipacao(participacao.id)
  const entradas = registros.filter(r => r.tipo === 'entrada')
  assert.equal(entradas.length, 1, 'a segunda escolha substitui a primeira, não soma')
  assert.equal(entradas[0]?.registradoEm, new Date('2026-09-05T08:30:00-03:00').toISOString())
})

test('a saída lançada de madrugada pertence ao dia da entrada ainda aberta, não ao dia do relógio', async () => {
  const { repo, admin, participacao } = cenarioHenriqueEJuliano()
  await registrarPresencaAssistida(
    repo, admin.id, participacao.id,
    { tipo: 'entrada', fotoBase64: 'data:image/jpeg;base64,abc' },
    new Date('2026-09-05T22:00:00-03:00'),
  )
  await registrarPresencaAssistida(
    repo, admin.id, participacao.id,
    { tipo: 'fim', fotoBase64: 'data:image/jpeg;base64,abc' },
    new Date('2026-09-06T04:00:00-03:00'),
  )
  const registros = await repo.registrosDaParticipacao(participacao.id)
  const saida = registros.find(r => r.tipo === 'fim')
  assert.equal(saida?.dataRef, '2026-09-05')
})

test('participação fora do alcance não registra — mesma resposta de inexistente', async () => {
  const { repo, admin } = comSegundaOrganizacao()
  const r = await registrarPresencaAssistida(
    repo, admin.id, 'part-rui', { tipo: 'entrada', fotoBase64: 'data:image/jpeg;base64,abc' },
  )
  assert.match(r.erro ?? '', /Não encontramos esta pessoa/)
})
