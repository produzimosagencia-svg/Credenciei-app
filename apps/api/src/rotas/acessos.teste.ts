/*
 * Quem consegue ENTRAR no sistema. O tema aqui: isolamento por organização
 * (o mesmo do resto da API), e a régua de criação — supervisor pede setor,
 * operador de portão e suporte não, e só o master cria suporte.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cenarioHenriqueEJuliano } from '../dados/memoria.js'
import { acessos, criarAcesso, eventosComSetores, mudarSituacaoDoAcesso } from './acessos.js'
import type { Evento } from '../dados/repositorio.js'

const NOVO_SUPERVISOR = {
  funcao: 'supervisor' as const,
  nome: 'Larissa Prado', cpf: '65498732100', telefone: '27999887766',
  eventoId: 'ev-hj', setorId: 'eq-1', ativo: true,
}

/** Uma segunda organização, com um evento e uma equipe próprios. */
function comSegundaOrganizacao() {
  const c = cenarioHenriqueEJuliano()
  const eventoDaOutra: Evento = { ...c.evento, id: 'ev-outra', organizacaoId: 'org-2', nome: 'Festa da Outra Empresa' }
  c.repo.eventos.push(eventoDaOutra)
  c.repo.equipes.push({ id: 'eq-outra', nome: 'Portaria', eventoId: 'ev-outra' })
  return { ...c, eventoDaOutra }
}

test('quem não pode gerenciar usuários não acessa nada aqui', async () => {
  const { repo, pessoa } = cenarioHenriqueEJuliano()
  await assert.rejects(() => acessos(repo, pessoa.id), /permissão/)
  await assert.rejects(() => criarAcesso(repo, pessoa.id, NOVO_SUPERVISOR), /permissão/)
  await assert.rejects(() => mudarSituacaoDoAcesso(repo, pessoa.id, 'x', false), /permissão/)
  await assert.rejects(() => eventosComSetores(repo, pessoa.id), /permissão/)
})

// ─── Listar ─────────────────────────────────────────────────────────────────

test('admin vê só os acessos da própria organização, master vê os das duas', async () => {
  const { repo, admin, master } = comSegundaOrganizacao()
  await criarAcesso(repo, master.id, { ...NOVO_SUPERVISOR, eventoId: 'ev-outra', setorId: 'eq-outra' })

  // A organização do admin já tem duas contas no cenário (Marina Alves e a
  // suspensa) — a supervisora da OUTRA organização não pode aparecer aqui.
  const doAdmin = await acessos(repo, admin.id)
  assert.ok(!doAdmin.itens.some(a => a.nome === 'Larissa Prado'))

  const doMaster = await acessos(repo, master.id)
  assert.ok(doMaster.itens.some(a => a.nome === 'Larissa Prado'), 'master enxerga a outra organização também')
})

test('master nunca aparece na lista de acessos', async () => {
  const { repo, master } = cenarioHenriqueEJuliano()
  const lista = await acessos(repo, master.id)
  assert.ok(!lista.itens.some(a => a.papel === 'master'))
})

test('busca por nome ou CPF, e filtro por situação', async () => {
  const { repo, admin } = cenarioHenriqueEJuliano()
  await criarAcesso(repo, admin.id, NOVO_SUPERVISOR)
  await criarAcesso(repo, admin.id, { ...NOVO_SUPERVISOR, nome: 'Bruno Alves', cpf: '11144477735', ativo: false })

  const porNome = await acessos(repo, admin.id, { busca: 'Larissa' })
  assert.deepEqual(porNome.itens.map(a => a.nome), ['Larissa Prado'])

  const porCpf = await acessos(repo, admin.id, { busca: '654.987.321-00' })
  assert.deepEqual(porCpf.itens.map(a => a.nome), ['Larissa Prado'])

  const inativos = await acessos(repo, admin.id, { situacao: 'inativos' })
  // A conta suspensa do cenário já é inativa — Bruno se junta a ela.
  assert.deepEqual(inativos.itens.map(a => a.nome).sort(), ['Bruno Alves', 'Conta Bloqueada'])
})

// ─── Criar ──────────────────────────────────────────────────────────────────

test('nome curto, CPF incompleto e telefone inválido são recusados', async () => {
  const { repo, admin } = cenarioHenriqueEJuliano()
  assert.ok((await criarAcesso(repo, admin.id, { ...NOVO_SUPERVISOR, nome: 'La' })).erro)
  assert.ok((await criarAcesso(repo, admin.id, { ...NOVO_SUPERVISOR, cpf: '123' })).erro)
  assert.ok((await criarAcesso(repo, admin.id, { ...NOVO_SUPERVISOR, telefone: '123' })).erro)
})

test('supervisor sem setor escolhido é recusado', async () => {
  const { repo, admin } = cenarioHenriqueEJuliano()
  const r = await criarAcesso(repo, admin.id, { ...NOVO_SUPERVISOR, setorId: undefined })
  assert.match(r.erro ?? '', /Escolha o setor/)
})

test('setor de outro evento não é aceito', async () => {
  const { repo, admin } = comSegundaOrganizacao()
  const r = await criarAcesso(repo, admin.id, { ...NOVO_SUPERVISOR, setorId: 'eq-outra' })
  assert.match(r.erro ?? '', /Setor não encontrado/)
})

test('operador de portão nasce sem setor, preso ao evento inteiro', async () => {
  const { repo, admin } = cenarioHenriqueEJuliano()
  const r = await criarAcesso(repo, admin.id, {
    funcao: 'operador_portao', nome: 'Marcos Lima', cpf: '22233344455', telefone: '27999887766',
    eventoId: 'ev-hj', ativo: true,
  })
  assert.ok(r.acesso, r.erro)
  assert.equal(r.acesso?.papel, 'operador_portao')
  assert.equal(r.acesso?.setorNome, null)
})

test('só o master cria acesso de suporte', async () => {
  const { repo, admin, master } = cenarioHenriqueEJuliano()
  const dados = {
    funcao: 'suporte' as const, nome: 'Beatriz Nunes', cpf: '33344455566', telefone: '27999887766',
    eventoId: 'ev-hj', ativo: true, expiraEm: '2026-12-01',
  }
  const doAdmin = await criarAcesso(repo, admin.id, dados)
  assert.match(doAdmin.erro ?? '', /Só o master/)

  const doMaster = await criarAcesso(repo, master.id, dados)
  assert.ok(doMaster.acesso, doMaster.erro)
  assert.equal(doMaster.acesso?.expiraEm, '2026-12-01')
})

test('CPF repetido é recusado', async () => {
  const { repo, admin } = cenarioHenriqueEJuliano()
  assert.ok((await criarAcesso(repo, admin.id, NOVO_SUPERVISOR)).acesso)
  const r = await criarAcesso(repo, admin.id, { ...NOVO_SUPERVISOR, nome: 'Outra Pessoa' })
  assert.match(r.erro ?? '', /Já existe um acesso/)
})

test('admin não cria acesso em evento de outra organização', async () => {
  const { repo, admin } = comSegundaOrganizacao()
  const r = await criarAcesso(repo, admin.id, { ...NOVO_SUPERVISOR, eventoId: 'ev-outra', setorId: 'eq-outra' })
  assert.match(r.erro ?? '', /Sem permissão sobre este evento/)
})

test('a nova conta aparece na listagem, sem ser "eu" para quem criou', async () => {
  const { repo, admin } = cenarioHenriqueEJuliano()
  const r = await criarAcesso(repo, admin.id, NOVO_SUPERVISOR)
  assert.ok(r.acesso)
  assert.equal(r.acesso?.souEu, false)

  const lista = await acessos(repo, admin.id)
  const linha = lista.itens.find(a => a.id === r.acesso!.id)
  assert.equal(linha?.identificador, '654.987.321-00')
  assert.equal(linha?.setorNome, 'Produção')
})

// ─── Ativar / desativar ─────────────────────────────────────────────────────

test('ninguém desativa o próprio acesso', async () => {
  const { repo, admin } = cenarioHenriqueEJuliano()
  const r = await mudarSituacaoDoAcesso(repo, admin.id, admin.id, false)
  assert.match(r.erro ?? '', /não pode desativar o próprio acesso/)
})

test('admin não muda a situação de acesso de outra organização', async () => {
  const { repo, admin, master } = comSegundaOrganizacao()
  const criado = await criarAcesso(repo, master.id, { ...NOVO_SUPERVISOR, eventoId: 'ev-outra', setorId: 'eq-outra' })
  assert.ok(criado.acesso)

  const r = await mudarSituacaoDoAcesso(repo, admin.id, criado.acesso!.id, false)
  assert.match(r.erro ?? '', /Não encontramos este acesso/)
})

test('desativar e reativar funcionam, e refletem na listagem', async () => {
  const { repo, admin } = cenarioHenriqueEJuliano()
  const criado = await criarAcesso(repo, admin.id, NOVO_SUPERVISOR)
  assert.ok(criado.acesso)

  await mudarSituacaoDoAcesso(repo, admin.id, criado.acesso!.id, false)
  const inativos = await acessos(repo, admin.id, { situacao: 'inativos' })
  assert.ok(inativos.itens.some(a => a.id === criado.acesso!.id))

  await mudarSituacaoDoAcesso(repo, admin.id, criado.acesso!.id, true)
  const ativos = await acessos(repo, admin.id, { situacao: 'ativos' })
  assert.ok(ativos.itens.some(a => a.id === criado.acesso!.id))
})

// ─── Eventos com setores ────────────────────────────────────────────────────

test('eventosComSetores só traz eventos ativos, com os setores de cada um', async () => {
  const { repo, admin, evento } = cenarioHenriqueEJuliano()
  const encerrado: Evento = { ...evento, id: 'ev-encerrado', nome: 'Evento Encerrado', ativo: false }
  repo.eventos.push(encerrado)

  const r = await eventosComSetores(repo, admin.id)
  assert.deepEqual(r.map(e => e.eventoId), ['ev-hj'])
  assert.deepEqual(r[0]?.setores, [{ setorId: 'eq-1', nome: 'Produção' }])
})
