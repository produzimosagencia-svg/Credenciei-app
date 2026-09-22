import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cenarioHenriqueEJuliano } from '../dados/memoria.js'
import { colaboradoresDoEvento, eventosParaEditarColaborador } from './editar-colaborador.js'

function comSegundoSetor(cenario: ReturnType<typeof cenarioHenriqueEJuliano>) {
  cenario.repo.equipes.push({ id: 'eq-2', nome: 'Portaria', eventoId: cenario.evento.id, exigeMeio: false })
  cenario.repo.pessoas.push({ id: 'pes-maria', nome: 'Maria Souza', cpf: '98765432100', telefone: null, fotoPath: null })
  cenario.repo.participacoes.push({
    id: 'part-maria', pessoaId: 'pes-maria', eventoId: cenario.evento.id, equipeId: 'eq-2', equipeNome: 'Portaria',
    funcao: 'Operadora', supervisorNome: null, ativo: true, descredenciadoEm: null, valorReceber: 100,
    pago: false, pagoEm: null, qrToken: 'token-maria', cidade: null, criadoEm: '2026-08-20T10:00:00-03:00',
  })
  return cenario
}

test('supervisor não tem o atalho — já tem a própria equipe na tela do setor', async () => {
  const cenario = cenarioHenriqueEJuliano()
  cenario.repo.perfis.push({ id: 'auth-sup', nome: 'Carlos Silva', papel: 'supervisor', organizacaoId: 'org-1', ativo: true })
  await assert.rejects(() => eventosParaEditarColaborador(cenario.repo, 'auth-sup'), /permissão/i)
  await assert.rejects(() => colaboradoresDoEvento(cenario.repo, 'auth-sup', cenario.evento.id), /permissão/i)
})

test('suporte tem o atalho, do mesmo jeito que quem gerencia o evento', async () => {
  const cenario = cenarioHenriqueEJuliano()
  cenario.repo.perfis.push({ id: 'auth-suporte', nome: 'Bruno', papel: 'suporte', organizacaoId: 'org-1', ativo: true })
  const eventos = await eventosParaEditarColaborador(cenario.repo, 'auth-suporte')
  assert.ok(eventos.some(e => e.eventoId === cenario.evento.id))
})

test('a busca traz gente de setores diferentes, todos do mesmo evento', async () => {
  const cenario = comSegundoSetor(cenarioHenriqueEJuliano())
  const r = await colaboradoresDoEvento(cenario.repo, cenario.admin.id, cenario.evento.id)

  assert.ok(r.colaboradores.length >= 2)
  const setores = new Set(r.colaboradores.map(c => c.setorNome))
  assert.ok(setores.size > 1, 'tem gente de mais de um setor')
  assert.ok(r.colaboradores.some(c => c.nome === 'João da Silva'))
  assert.ok(r.colaboradores.some(c => c.nome === 'Maria Souza'))
})

test('admin de outra organização não vê o evento', async () => {
  const cenario = cenarioHenriqueEJuliano()
  cenario.repo.perfis.push({ id: 'auth-outro-admin', nome: 'Outro', papel: 'admin', organizacaoId: 'org-2', ativo: true })
  await assert.rejects(() => colaboradoresDoEvento(cenario.repo, 'auth-outro-admin', cenario.evento.id), /não encontrado/i)
})
