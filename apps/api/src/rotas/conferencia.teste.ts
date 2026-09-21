/*
 * Conferência de equipe — a tela que o supervisor usa 1 dia antes do evento
 * pra ver a equipe, tirar quem não é dele, e confirmar que a lista está
 * certa.
 *
 * O tema aqui é o mesmo de toda rota de setor: só quem pode acompanhar mexe,
 * supervisor só no PRÓPRIO setor — "não encontrado" e "não é seu" respondem
 * igual.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ArquivosEmMemoria } from '../arquivos.js'
import { cenarioHenriqueEJuliano } from '../dados/memoria.js'
import {
  conferenciaDoSetor, conferenciasDoEvento, confirmarConferencia, planilhaDaConferencia, removerDaConferencia,
} from './conferencia.js'

/** Antes do evento abrir a conferência — o cenário começa em 2026-09-05. */
const ANTES = new Date('2026-09-03T10:00:00-03:00')
/** Depois de a conferência já ter aberto (24h antes do início). */
const DEPOIS = new Date('2026-09-04T20:00:00-03:00')

function comSupervisor(setorId = 'eq-1') {
  const cenario = cenarioHenriqueEJuliano()
  cenario.repo.perfis.push({ id: 'auth-sup', nome: 'Carlos Silva', papel: 'supervisor', organizacaoId: 'org-1', ativo: true })
  const equipe = cenario.repo.equipes.find(e => e.id === setorId)!
  equipe.supervisorPessoaId = 'auth-sup'
  return cenario
}

// ─── Escopo ─────────────────────────────────────────────────────────────────

test('colaborador não abre a conferência', async () => {
  const { repo, pessoa } = cenarioHenriqueEJuliano()
  await assert.rejects(conferenciaDoSetor(repo, pessoa.id, 'eq-1'), /permissão/)
})

test('admin da mesma organização abre a conferência', async () => {
  const { repo, admin } = cenarioHenriqueEJuliano()
  const c = await conferenciaDoSetor(repo, admin.id, 'eq-1')
  assert.equal(c.setorNome, 'Produção')
})

test('admin de outra organização não abre a conferência', async () => {
  const { repo } = cenarioHenriqueEJuliano()
  repo.perfis.push({ id: 'auth-outro', nome: 'Bia', papel: 'admin', organizacaoId: 'org-2', ativo: true })
  await assert.rejects(conferenciaDoSetor(repo, 'auth-outro', 'eq-1'), /Não encontramos/)
})

test('supervisor abre o próprio setor, mas não o de outro supervisor', async () => {
  const { repo, evento } = comSupervisor()
  repo.equipes.push({ id: 'eq-2', nome: 'Bar', eventoId: evento.id })

  const c = await conferenciaDoSetor(repo, 'auth-sup', 'eq-1')
  assert.equal(c.setorNome, 'Produção')

  await assert.rejects(conferenciaDoSetor(repo, 'auth-sup', 'eq-2'), /Não encontramos/)
})

test('setor inexistente responde "não encontramos"', async () => {
  const { repo, admin } = cenarioHenriqueEJuliano()
  await assert.rejects(conferenciaDoSetor(repo, admin.id, 'eq-999'), /Não encontramos/)
})

// ─── Ler o estado ───────────────────────────────────────────────────────────

test('a conferência abre 24h antes do evento, e não fecha depois', async () => {
  const { repo, admin } = cenarioHenriqueEJuliano()
  // O cenário começa 2026-09-05T18:30 — abre 2026-09-04T18:30.
  const antesDaAbertura = await conferenciaDoSetor(repo, admin.id, 'eq-1', new Date('2026-09-04T10:00:00-03:00'))
  assert.equal(antesDaAbertura.aberta, false)

  const depoisDaAbertura = await conferenciaDoSetor(repo, admin.id, 'eq-1', new Date('2026-09-04T19:00:00-03:00'))
  assert.equal(depoisDaAbertura.aberta, true)

  // Bem depois do evento — continua aberta, nunca fecha.
  const bemDepois = await conferenciaDoSetor(repo, admin.id, 'eq-1', new Date('2026-09-20T00:00:00-03:00'))
  assert.equal(bemDepois.aberta, true)
})

test('sem nenhuma ação, a conferência começa pendente', async () => {
  const { repo, admin } = cenarioHenriqueEJuliano()
  const c = await conferenciaDoSetor(repo, admin.id, 'eq-1')
  assert.equal(c.status, 'pendente')
  assert.equal(c.confirmadaEm, null)
  assert.equal(c.equipe.length, 1)
})

// ─── Remover ────────────────────────────────────────────────────────────────

test('remover descredencia a pessoa — ela some da equipe, mas não é apagada', async () => {
  const { repo, admin, participacao } = cenarioHenriqueEJuliano()
  const r = await removerDaConferencia(repo, admin.id, 'eq-1', participacao.id, ANTES)
  assert.equal(r.erro, undefined)

  const c = await conferenciaDoSetor(repo, admin.id, 'eq-1')
  assert.equal(c.equipe.length, 0)

  const p = await repo.participacaoPorId(participacao.id)
  assert.ok(p, 'a participação continua existindo')
  assert.ok(p!.descredenciadoEm, 'só o vínculo fecha')
})

test('não dá para remover alguém de OUTRO setor', async () => {
  const { repo, admin, evento, participacao } = cenarioHenriqueEJuliano()
  repo.equipes.push({ id: 'eq-2', nome: 'Bar', eventoId: evento.id })

  const r = await removerDaConferencia(repo, admin.id, 'eq-2', participacao.id, ANTES)
  assert.match(r.erro ?? '', /não encontramos/i)

  const p = await repo.participacaoPorId(participacao.id)
  assert.equal(p!.descredenciadoEm, null, 'nada deveria ter mudado')
})

// ─── Confirmar ──────────────────────────────────────────────────────────────

test('não dá para confirmar antes de a conferência abrir', async () => {
  const { repo, admin } = cenarioHenriqueEJuliano()
  const r = await confirmarConferencia(repo, admin.id, 'eq-1', ANTES)
  assert.match(r.erro ?? '', /abre 1 dia antes/)
})

test('confirmar carimba quem, quando, e os números', async () => {
  const { repo, admin } = cenarioHenriqueEJuliano()
  const r = await confirmarConferencia(repo, admin.id, 'eq-1', DEPOIS)
  assert.equal(r.erro, undefined)

  const c = await conferenciaDoSetor(repo, admin.id, 'eq-1', DEPOIS)
  assert.equal(c.status, 'confirmada')
  assert.equal(c.confirmadaPorNome, admin.nome)
  assert.equal(c.confirmadaEm, DEPOIS.toISOString())
  assert.equal(c.totalMantidos, 1)
  assert.equal(c.totalRemovidos, 0)
})

test('confirmar depois de remover conta certo quem ficou e quem saiu', async () => {
  const { repo, admin, participacao } = cenarioHenriqueEJuliano()
  await removerDaConferencia(repo, admin.id, 'eq-1', participacao.id, DEPOIS)

  const r = await confirmarConferencia(repo, admin.id, 'eq-1', DEPOIS)
  assert.equal(r.erro, undefined)

  const c = await conferenciaDoSetor(repo, admin.id, 'eq-1', DEPOIS)
  assert.equal(c.totalMantidos, 0)
  assert.equal(c.totalRemovidos, 1)
})

// ─── A visão geral ──────────────────────────────────────────────────────────

test('a visão geral só traz setor com supervisor', async () => {
  const { repo, evento, admin } = cenarioHenriqueEJuliano()
  // "eq-1" (Produção) não tem supervisor neste cenário — "eq-2" também não.
  repo.equipes.push({ id: 'eq-2', nome: 'Bar', eventoId: evento.id })

  const linhas = await conferenciasDoEvento(repo, admin.id, evento.id)
  assert.deepEqual(linhas, [])
})

test('a visão geral mostra pendente até alguém confirmar', async () => {
  const { repo, evento, admin } = comSupervisor()
  // A listagem lê o supervisor por `perfis[].setorId` (mesma régua de
  // `setoresDoEvento`) — `supervisorPessoaId` sozinho não move essa agulha.
  const sup = repo.perfis.find(p => p.id === 'auth-sup')!
  ;(sup as { setorId?: string }).setorId = 'eq-1'

  const antes = await conferenciasDoEvento(repo, admin.id, evento.id)
  assert.equal(antes.length, 1)
  assert.equal(antes[0]!.setorNome, 'Produção')
  assert.equal(antes[0]!.supervisorNome, 'Carlos Silva')
  assert.equal(antes[0]!.status, 'pendente')

  await confirmarConferencia(repo, admin.id, 'eq-1', DEPOIS)
  const depois = await conferenciasDoEvento(repo, admin.id, evento.id)
  assert.equal(depois[0]!.status, 'confirmada')
})

test('admin de outra organização não vê a visão geral deste evento', async () => {
  const { repo, evento } = cenarioHenriqueEJuliano()
  repo.perfis.push({ id: 'auth-outro', nome: 'Bia', papel: 'admin', organizacaoId: 'org-2', ativo: true })
  await assert.rejects(conferenciasDoEvento(repo, 'auth-outro', evento.id), /Não encontramos/)
})

// ─── A planilha ─────────────────────────────────────────────────────────────

test('a planilha da conferência traz um CSV com a equipe ativa', async () => {
  const { repo, admin } = cenarioHenriqueEJuliano()
  const arquivos = new ArquivosEmMemoria('http://api.local')
  const arquivo = await planilhaDaConferencia(repo, admin.id, 'eq-1', arquivos)

  assert.ok(arquivo.nome.endsWith('.csv'))
  const guardado = arquivos.buscar(arquivo.url.split('/').pop()!)
  assert.ok(guardado)

  const texto = guardado!.bytes.toString('utf-8')
  assert.ok(texto.includes('Nome;CPF;Telefone;Função'))
  assert.ok(texto.includes('João da Silva'))
})

test('quem foi removido não aparece na planilha', async () => {
  const { repo, admin, participacao } = cenarioHenriqueEJuliano()
  await removerDaConferencia(repo, admin.id, 'eq-1', participacao.id, ANTES)

  const arquivos = new ArquivosEmMemoria('http://api.local')
  const arquivo = await planilhaDaConferencia(repo, admin.id, 'eq-1', arquivos)
  const guardado = arquivos.buscar(arquivo.url.split('/').pop()!)
  const texto = guardado!.bytes.toString('utf-8')

  assert.ok(!texto.includes('João da Silva'))
})
