/*
 * Bloquear CPF — vale para o evento inteiro, só para este evento. O
 * supervisor só mexe no evento onde tem setor; quem bloqueia pode liberar.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cenarioHenriqueEJuliano } from '../dados/memoria.js'
import {
  bloquearCpf, bloqueiosDoEvento, desbloquearCpf, eventosParaBloqueio,
} from './bloquear-cpf.js'

test('colaborador não bloqueia CPF', async () => {
  const { repo, evento, pessoa } = cenarioHenriqueEJuliano()
  await assert.rejects(bloqueiosDoEvento(repo, pessoa.id, evento.id), /permissão/)
})

test('admin de outra organização não bloqueia neste evento', async () => {
  const { repo, evento } = cenarioHenriqueEJuliano()
  const outroRepo = repo
  outroRepo.perfis.push({ id: 'auth-outro', nome: 'Bia', papel: 'admin', organizacaoId: 'org-2', ativo: true })
  await assert.rejects(bloquearCpf(repo, 'auth-outro', evento.id, '11122233344'), /Não encontramos/)
})

test('supervisor só bloqueia no evento onde tem setor', async () => {
  const { repo, evento } = cenarioHenriqueEJuliano()
  repo.perfis.push({ id: 'auth-sup', nome: 'Carlos', papel: 'supervisor', organizacaoId: 'org-1', ativo: true })
  // Sem `equipeDoSupervisor` (nenhuma equipe aponta pra ele) — nenhum evento é dele.
  await assert.rejects(bloquearCpf(repo, 'auth-sup', evento.id, '11122233344'), /setor neste evento/)
})

test('recusa CPF incompleto', async () => {
  const { repo, evento, admin } = cenarioHenriqueEJuliano()
  const r = await bloquearCpf(repo, admin.id, evento.id, '123')
  assert.match(r.erro ?? '', /11 dígitos/)
})

test('bloqueia, aparece na lista, e recusa duplicar', async () => {
  const { repo, evento, admin } = cenarioHenriqueEJuliano()
  const r = await bloquearCpf(repo, admin.id, evento.id, '111.222.333-44', 'Não escalado')
  assert.equal(r.erro, undefined)
  assert.equal(r.cpf, '11122233344')

  const lista = await bloqueiosDoEvento(repo, admin.id, evento.id)
  assert.equal(lista.length, 1)
  assert.equal(lista[0]!.motivo, 'Não escalado')
  assert.equal(lista[0]!.bloqueadoPor, admin.nome)

  const denovo = await bloquearCpf(repo, admin.id, evento.id, '11122233344')
  assert.match(denovo.erro ?? '', /já está bloqueado/)
})

test('desbloqueia', async () => {
  const { repo, evento, admin } = cenarioHenriqueEJuliano()
  await bloquearCpf(repo, admin.id, evento.id, '11122233344')
  const [bloqueio] = await bloqueiosDoEvento(repo, admin.id, evento.id)

  const r = await desbloquearCpf(repo, admin.id, bloqueio!.id, evento.id)
  assert.equal(r.erro, undefined)
  assert.equal((await bloqueiosDoEvento(repo, admin.id, evento.id)).length, 0)
})

test('bloqueio inexistente recusa a liberação', async () => {
  const { repo, evento, admin } = cenarioHenriqueEJuliano()
  const r = await desbloquearCpf(repo, admin.id, 'bloq-fantasma', evento.id)
  assert.match(r.erro ?? '', /Não encontramos/)
})

test('master vê os eventos ativos de todas as organizações', async () => {
  const { repo, master } = cenarioHenriqueEJuliano()
  const eventos = await eventosParaBloqueio(repo, master.id)
  assert.equal(eventos.length, 1)
})
