/*
 * A Central de Avisos — histórico de push e preferências por categoria.
 * Contrato já existia, essa é a primeira vez que ganha uma API de verdade
 * (achado 21/09/2026).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cenarioHenriqueEJuliano } from '../dados/memoria.js'
import {
  marcarNotificacaoComoLida, marcarTodasComoLidas, minhasNotificacoes, salvarPreferenciasDeAvisos,
} from './notificacoes.js'

function comHistorico(repo: ReturnType<typeof cenarioHenriqueEJuliano>['repo'], pessoaId: string) {
  repo.notificacoes.push(
    {
      id: 'n1', pessoaId, tipo: 'lembrete_entrada', titulo: 'Falta bater a entrada', corpo: '...',
      destino: '/credencial', criadoEm: '2026-09-05T10:00:00-03:00', lida: false,
    },
    {
      id: 'n2', pessoaId, tipo: 'dia_evento', titulo: 'Hoje é o dia', corpo: '...',
      destino: '/credencial', criadoEm: '2026-09-05T07:00:00-03:00', lida: true,
    },
  )
}

test('colaborador vê as próprias categorias, todas ligadas por padrão', async () => {
  const { repo, pessoa } = cenarioHenriqueEJuliano()
  comHistorico(repo, pessoa.id)

  const central = await minhasNotificacoes(repo, pessoa.id, 'colaborador')
  assert.equal(central.naoLidas, 1)
  assert.equal(central.notificacoes.length, 2)
  // Mais recente primeiro.
  assert.equal(central.notificacoes[0]!.id, 'n1')
  assert.ok(central.preferencias.some(p => p.tipo === 'lembrete_entrada' && p.ativo))
  assert.ok(!central.preferencias.some(p => p.tipo === 'alerta_pendencia'))
})

test('supervisor vê só a categoria dele, não as do colaborador', async () => {
  const { repo, master } = cenarioHenriqueEJuliano()
  const central = await minhasNotificacoes(repo, master.id, 'supervisor')
  assert.deepEqual(central.preferencias.map(p => p.tipo), ['alerta_pendencia'])
})

test('master/admin não têm nenhuma categoria — o site também não manda nada automático pra eles', async () => {
  const { repo, master } = cenarioHenriqueEJuliano()
  const central = await minhasNotificacoes(repo, master.id, 'master')
  assert.equal(central.preferencias.length, 0)
})

test('marcar uma como lida não mexe nas outras', async () => {
  const { repo, pessoa } = cenarioHenriqueEJuliano()
  comHistorico(repo, pessoa.id)

  await marcarNotificacaoComoLida(repo, pessoa.id, 'n1')
  const central = await minhasNotificacoes(repo, pessoa.id, 'colaborador')
  assert.equal(central.naoLidas, 0)
  assert.equal(central.notificacoes.find(n => n.id === 'n1')!.lida, true)
  assert.equal(central.notificacoes.find(n => n.id === 'n2')!.lida, true)
})

test('marcar como lida não afeta a notificação de outra pessoa', async () => {
  const { repo, pessoa, admin } = cenarioHenriqueEJuliano()
  comHistorico(repo, pessoa.id)
  repo.notificacoes.push({
    id: 'n-outra', pessoaId: admin.id, tipo: 'alerta_pendencia', titulo: 'Outro', corpo: '...',
    destino: null, criadoEm: '2026-09-05T09:00:00-03:00', lida: false,
  })

  await marcarNotificacaoComoLida(repo, pessoa.id, 'n-outra')
  const daOutraPessoa = await minhasNotificacoes(repo, admin.id, 'supervisor')
  assert.equal(daOutraPessoa.notificacoes[0]!.lida, false)
})

test('marcar todas como lidas', async () => {
  const { repo, pessoa } = cenarioHenriqueEJuliano()
  comHistorico(repo, pessoa.id)

  await marcarTodasComoLidas(repo, pessoa.id)
  const central = await minhasNotificacoes(repo, pessoa.id, 'colaborador')
  assert.equal(central.naoLidas, 0)
})

test('desligar uma categoria aparece nas preferências, e liga de novo depois', async () => {
  const { repo, pessoa } = cenarioHenriqueEJuliano()

  await salvarPreferenciasDeAvisos(repo, pessoa.id, 'colaborador', [
    'dia_evento', 'montagem', 'desmontagem', 'lembrete_meio', 'lembrete_fim',
    // 'lembrete_entrada' fora — fica desligado.
  ])
  const desligado = await minhasNotificacoes(repo, pessoa.id, 'colaborador')
  assert.equal(desligado.preferencias.find(p => p.tipo === 'lembrete_entrada')!.ativo, false)
  assert.equal(desligado.preferencias.find(p => p.tipo === 'dia_evento')!.ativo, true)

  await salvarPreferenciasDeAvisos(repo, pessoa.id, 'colaborador', [
    'dia_evento', 'montagem', 'desmontagem', 'lembrete_entrada', 'lembrete_meio', 'lembrete_fim',
  ])
  const religado = await minhasNotificacoes(repo, pessoa.id, 'colaborador')
  assert.equal(religado.preferencias.find(p => p.tipo === 'lembrete_entrada')!.ativo, true)
})
