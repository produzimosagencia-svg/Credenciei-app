/*
 * Registro de token de push — só guarda o endereço de entrega. Sem regra de
 * permissão além de estar logado (é sempre sobre o PRÓPRIO aparelho de quem
 * pergunta), e nunca falha de um jeito que trave quem só queria continuar
 * usando o app.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cenarioHenriqueEJuliano } from '../dados/memoria.js'
import { registrarTokenDePush } from './push.js'

test('registra o token, associado a quem pediu', async () => {
  const { repo, admin } = cenarioHenriqueEJuliano()
  const r = await registrarTokenDePush(repo, admin.id, 'ExponentPushToken[abc123]', 'android')
  assert.deepEqual(r, {})
  assert.deepEqual(repo.tokensDeAparelhos.get('ExponentPushToken[abc123]'), { pessoaId: admin.id, plataforma: 'android' })
})

test('token vazio é recusado', async () => {
  const { repo, admin } = cenarioHenriqueEJuliano()
  const r = await registrarTokenDePush(repo, admin.id, '   ', 'ios')
  assert.match(r.erro ?? '', /vazio/)
})

test('plataforma fora do catálogo é recusada', async () => {
  const { repo, admin } = cenarioHenriqueEJuliano()
  const r = await registrarTokenDePush(repo, admin.id, 'tok', 'windows-phone')
  assert.match(r.erro ?? '', /Plataforma inválida/)
})

test('registrar de novo o mesmo token troca o dono — é o aparelho, não a pessoa', async () => {
  const { repo, admin, pessoa } = cenarioHenriqueEJuliano()
  await registrarTokenDePush(repo, admin.id, 'tok-compartilhado', 'ios')
  await registrarTokenDePush(repo, pessoa.id, 'tok-compartilhado', 'ios')
  assert.equal(repo.tokensDeAparelhos.get('tok-compartilhado')?.pessoaId, pessoa.id)
})

test('qualquer papel logado registra o próprio aparelho, até o colaborador', async () => {
  const { repo, pessoa } = cenarioHenriqueEJuliano()
  const r = await registrarTokenDePush(repo, pessoa.id, 'tok-colaborador', 'android')
  assert.deepEqual(r, {})
})
