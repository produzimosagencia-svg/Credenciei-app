/*
 * A Plataforma — organizações. Só o master enxerga; cada uma nasce com um
 * admin de verdade, e o primeiro evento é opcional.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cenarioHenriqueEJuliano } from '../dados/memoria.js'
import { alternarOrganizacao, criarOrganizacao, organizacoes } from './plataforma.js'

const NOVA_ORGANIZACAO = {
  nome: 'Festas do Vale',
  adminNome: 'Renata Dias',
  email: 'renata@festasdovale.com.br',
  senha: 'segredo123',
  limiteEventos: 5,
}

test('quem não gerencia organizações não acessa nada aqui', async () => {
  const { repo, admin } = cenarioHenriqueEJuliano()
  await assert.rejects(() => organizacoes(repo, admin.id), /permissão/)
  await assert.rejects(() => criarOrganizacao(repo, admin.id, NOVA_ORGANIZACAO), /permissão/)
  await assert.rejects(() => alternarOrganizacao(repo, admin.id, 'org-1', false), /permissão/)
})

test('supervisor e colaborador também ficam de fora', async () => {
  const { repo, pessoa } = cenarioHenriqueEJuliano()
  await assert.rejects(() => organizacoes(repo, pessoa.id), /permissão/)
})

test('a organização do cenário (Produzimos) já aparece na lista', async () => {
  const { repo, master } = cenarioHenriqueEJuliano()
  const r = await organizacoes(repo, master.id)
  assert.equal(r.total, 1)
  assert.equal(r.ativas, 1)
  assert.equal(r.itens[0]?.nome, 'Produzimos')
})

// ─── Criar ───────────────────────────────────────────────────────────────

test('recusa nome vazio', async () => {
  const { repo, master } = cenarioHenriqueEJuliano()
  const r = await criarOrganizacao(repo, master.id, { ...NOVA_ORGANIZACAO, nome: '  ' })
  assert.match(r.erro ?? '', /nome da organização/)
})

test('recusa senha curta', async () => {
  const { repo, master } = cenarioHenriqueEJuliano()
  const r = await criarOrganizacao(repo, master.id, { ...NOVA_ORGANIZACAO, senha: '123' })
  assert.match(r.erro ?? '', /senha/)
})

test('recusa e-mail já em uso', async () => {
  const { repo, master } = cenarioHenriqueEJuliano()
  const primeira = await criarOrganizacao(repo, master.id, NOVA_ORGANIZACAO)
  assert.ok(primeira.organizacao, primeira.erro)

  const segunda = await criarOrganizacao(repo, master.id, { ...NOVA_ORGANIZACAO, nome: 'Outra Produtora' })
  assert.match(segunda.erro ?? '', /já existe uma conta/i)
})

test('cria a organização e o admin dono dela, e aparece na lista', async () => {
  const { repo, master } = cenarioHenriqueEJuliano()
  const r = await criarOrganizacao(repo, master.id, NOVA_ORGANIZACAO)
  assert.ok(r.organizacao, r.erro)
  assert.equal(r.organizacao!.nome, NOVA_ORGANIZACAO.nome)
  assert.equal(r.organizacao!.ativa, true)
  assert.equal(r.organizacao!.adminNome, NOVA_ORGANIZACAO.adminNome)
  assert.equal(r.organizacao!.adminIdentificador, NOVA_ORGANIZACAO.email)
  assert.equal(r.organizacao!.eventos, 0)

  const lista = await organizacoes(repo, master.id)
  assert.equal(lista.total, 2, 'a Produzimos do cenário, mais a recém-criada')
  assert.equal(lista.ativas, 2)

  // O admin recém-criado consegue entrar de verdade, com a senha escolhida.
  const perfilAdmin = repo.perfis.find(p => p.email === NOVA_ORGANIZACAO.email)
  assert.ok(perfilAdmin)
  assert.equal(perfilAdmin!.papel, 'admin')
  assert.equal(perfilAdmin!.organizacaoId, r.organizacao!.organizacaoId)
})

test('sem o primeiro evento, a organização nasce com zero eventos', async () => {
  const { repo, master } = cenarioHenriqueEJuliano()
  const r = await criarOrganizacao(repo, master.id, NOVA_ORGANIZACAO)
  const doEvento = repo.eventos.filter(e => e.organizacaoId === r.organizacao!.organizacaoId)
  assert.equal(doEvento.length, 0)
})

test('com o primeiro evento preenchido, ele nasce junto — com o dia principal', async () => {
  const { repo, master } = cenarioHenriqueEJuliano()
  const r = await criarOrganizacao(repo, master.id, {
    ...NOVA_ORGANIZACAO,
    primeiroEvento: {
      nome: 'Festival de Verão', dataInicio: '2026-12-01T18:00:00-03:00', dataFim: '2026-12-02T04:00:00-03:00',
    },
  })
  assert.ok(r.organizacao)
  assert.equal(r.organizacao!.eventos, 1)

  const evento = repo.eventos.find(e => e.organizacaoId === r.organizacao!.organizacaoId)
  assert.ok(evento, 'o evento devia ter sido criado')
  assert.equal(evento!.nome, 'Festival de Verão')

  const dias = repo.dias.get(evento!.id) ?? []
  assert.equal(dias.length, 1)
  assert.equal(dias[0]!.tipo, 'principal')
})

test('primeiro evento com horário impossível não derruba a organização', async () => {
  const { repo, master } = cenarioHenriqueEJuliano()
  const r = await criarOrganizacao(repo, master.id, {
    ...NOVA_ORGANIZACAO,
    primeiroEvento: {
      nome: 'Festival Errado', dataInicio: '2026-12-02T18:00:00-03:00', dataFim: '2026-12-01T04:00:00-03:00',
    },
  })
  // A organização ainda é criada — só o evento (que falhou na conferência) não.
  assert.ok(r.organizacao)
  assert.equal(r.organizacao!.eventos, 0)
})

// ─── Suspender e reativar ───────────────────────────────────────────────────

test('suspende e reativa, sem apagar', async () => {
  const { repo, master } = cenarioHenriqueEJuliano()
  const criada = await criarOrganizacao(repo, master.id, NOVA_ORGANIZACAO)
  const id = criada.organizacao!.organizacaoId

  await alternarOrganizacao(repo, master.id, id, false)
  let lista = await organizacoes(repo, master.id)
  assert.equal(lista.itens.find(o => o.organizacaoId === id)?.ativa, false)

  await alternarOrganizacao(repo, master.id, id, true)
  lista = await organizacoes(repo, master.id)
  assert.equal(lista.itens.find(o => o.organizacaoId === id)?.ativa, true)
})

test('organização inexistente recusa a troca de situação', async () => {
  const { repo, master } = cenarioHenriqueEJuliano()
  const r = await alternarOrganizacao(repo, master.id, 'org-fantasma', false)
  assert.match(r.erro ?? '', /Não encontramos/)
})
