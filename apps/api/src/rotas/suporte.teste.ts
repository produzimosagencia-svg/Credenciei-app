import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cenarioHenriqueEJuliano } from '../dados/memoria.js'
import { criarSuporte, dadosDeSuporte, editarSuporte, revogarSuporte } from './suporte.js'

const AGORA = new Date('2026-09-22T12:00:00-03:00')

const BASE_NOVO = {
  nome: 'Bruno Tavares', cpf: '55566677788', telefone: '27998887766',
  ativo: true, acessoExpiraEm: null as string | null,
  escopoOrganizacaoIds: ['org-1'], escopoEventoIds: [] as string[],
}

test('só o master gerencia suporte — admin é recusado', async () => {
  const cenario = cenarioHenriqueEJuliano()
  await assert.rejects(() => dadosDeSuporte(cenario.repo, cenario.admin.id), /permissão/i)
  await assert.rejects(() => criarSuporte(cenario.repo, cenario.admin.id, BASE_NOVO), /permissão/i)
})

test('criar exige nome, telefone válido, escopo e CPF de 11 dígitos', async () => {
  const cenario = cenarioHenriqueEJuliano()
  assert.match((await criarSuporte(cenario.repo, cenario.master.id, { ...BASE_NOVO, nome: '' })).erro ?? '', /nome/i)
  assert.match((await criarSuporte(cenario.repo, cenario.master.id, { ...BASE_NOVO, telefone: '123' })).erro ?? '', /telefone/i)
  assert.match(
    (await criarSuporte(cenario.repo, cenario.master.id, { ...BASE_NOVO, escopoOrganizacaoIds: [], escopoEventoIds: [] })).erro ?? '',
    /organização ou evento/i,
  )
  assert.match((await criarSuporte(cenario.repo, cenario.master.id, { ...BASE_NOVO, cpf: '123' })).erro ?? '', /cpf/i)
})

test('criar com CPF já usado por outro acesso é recusado', async () => {
  const cenario = cenarioHenriqueEJuliano()
  const primeiro = await criarSuporte(cenario.repo, cenario.master.id, BASE_NOVO)
  assert.ok(primeiro.id, primeiro.erro)

  const duplicado = await criarSuporte(cenario.repo, cenario.master.id, { ...BASE_NOVO, nome: 'Outra Pessoa' })
  assert.match(duplicado.erro ?? '', /já existe/i)
})

test('suporte criado aparece na lista, com o escopo por organização resolvido', async () => {
  const cenario = cenarioHenriqueEJuliano()
  const r = await criarSuporte(cenario.repo, cenario.master.id, {
    ...BASE_NOVO, acessoExpiraEm: '2026-12-01',
  })
  assert.ok(r.id, r.erro)

  const dados = await dadosDeSuporte(cenario.repo, cenario.master.id, AGORA)
  const novo = dados.suportes.find(s => s.id === r.id)!
  assert.equal(novo.nome, 'Bruno Tavares')
  assert.equal(novo.acessoExpiraEm, '2026-12-01')
  assert.equal(novo.escopoOrganizacoes[0]?.nome, 'Produzimos')
  assert.equal(novo.expirado, false)
  assert.ok(dados.organizacoes.some(o => o.nome === 'Produzimos'))
  assert.ok(dados.eventos.some(e => e.id === cenario.evento.id))
})

test('escopo por evento avulso também resolve, com o nome da organização do evento', async () => {
  const cenario = cenarioHenriqueEJuliano()
  const r = await criarSuporte(cenario.repo, cenario.master.id, {
    ...BASE_NOVO, escopoOrganizacaoIds: [], escopoEventoIds: [cenario.evento.id],
  })
  const dados = await dadosDeSuporte(cenario.repo, cenario.master.id, AGORA)
  const novo = dados.suportes.find(s => s.id === r.id)!
  assert.equal(novo.escopoEventos[0]?.id, cenario.evento.id)
  assert.equal(novo.escopoEventos[0]?.organizacaoNome, 'Produzimos')
})

test('quem tem expiração no passado vem marcado como expirado — quem não tem, não', async () => {
  const cenario = cenarioHenriqueEJuliano()
  const comExpiracao = await criarSuporte(cenario.repo, cenario.master.id, { ...BASE_NOVO, acessoExpiraEm: '2026-09-01' })
  const semExpiracao = await criarSuporte(cenario.repo, cenario.master.id, { ...BASE_NOVO, cpf: '11122233344', acessoExpiraEm: null })

  const dados = await dadosDeSuporte(cenario.repo, cenario.master.id, AGORA)
  assert.equal(dados.suportes.find(s => s.id === comExpiracao.id)!.expirado, true)
  assert.equal(dados.suportes.find(s => s.id === semExpiracao.id)!.expirado, false)
})

test('editar troca nome, status, expiração e escopo — mas não exige telefone válido, como no site', async () => {
  const cenario = cenarioHenriqueEJuliano()
  const criado = await criarSuporte(cenario.repo, cenario.master.id, BASE_NOVO)

  const r = await editarSuporte(cenario.repo, cenario.master.id, criado.id!, {
    nome: 'Nome Corrigido', telefone: '123', ativo: false,
    acessoExpiraEm: '2027-01-01', escopoOrganizacaoIds: [], escopoEventoIds: [cenario.evento.id],
  })
  assert.equal(r.erro, undefined)

  const dados = await dadosDeSuporte(cenario.repo, cenario.master.id, AGORA)
  const editado = dados.suportes.find(s => s.id === criado.id)!
  assert.equal(editado.nome, 'Nome Corrigido')
  assert.equal(editado.ativo, false)
  assert.equal(editado.acessoExpiraEm, '2027-01-01')
  assert.equal(editado.escopoOrganizacoes.length, 0)
  assert.equal(editado.escopoEventos[0]?.id, cenario.evento.id)
})

test('editar sem nenhum escopo é recusado, e id inexistente também', async () => {
  const cenario = cenarioHenriqueEJuliano()
  const criado = await criarSuporte(cenario.repo, cenario.master.id, BASE_NOVO)

  const semEscopo = await editarSuporte(cenario.repo, cenario.master.id, criado.id!, {
    nome: 'Qualquer', telefone: '', ativo: true, acessoExpiraEm: null,
    escopoOrganizacaoIds: [], escopoEventoIds: [],
  })
  assert.match(semEscopo.erro ?? '', /organização ou evento/i)

  const inexistente = await editarSuporte(cenario.repo, cenario.master.id, 'auth-999', {
    nome: 'Qualquer', telefone: '', ativo: true, acessoExpiraEm: null,
    escopoOrganizacaoIds: ['org-1'], escopoEventoIds: [],
  })
  assert.ok(inexistente.erro)
})

test('revogar desativa e expira na hora — diferente de excluir, o histórico continua', async () => {
  const cenario = cenarioHenriqueEJuliano()
  const criado = await criarSuporte(cenario.repo, cenario.master.id, BASE_NOVO)

  const r = await revogarSuporte(cenario.repo, cenario.master.id, criado.id!)
  assert.equal(r.erro, undefined)

  const dados = await dadosDeSuporte(cenario.repo, cenario.master.id, AGORA)
  const revogado = dados.suportes.find(s => s.id === criado.id)!
  assert.equal(revogado.ativo, false)
  assert.equal(revogado.expirado, true)
})

test('revogar id inexistente é recusado', async () => {
  const cenario = cenarioHenriqueEJuliano()
  const r = await revogarSuporte(cenario.repo, cenario.master.id, 'auth-999')
  assert.ok(r.erro)
})
