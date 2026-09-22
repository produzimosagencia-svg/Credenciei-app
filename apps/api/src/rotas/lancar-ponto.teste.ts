import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cenarioHenriqueEJuliano } from '../dados/memoria.js'
import { dadosParaLancarPonto, eventosParaLancarPonto, lancarPontoManual } from './lancar-ponto.js'

const AGORA = new Date('2026-09-05T20:00:00-03:00')

/** Um segundo setor no mesmo evento, e um supervisor ligado só a eq-1. */
function comSupervisorESegundoSetor(cenario: ReturnType<typeof cenarioHenriqueEJuliano>) {
  const supervisor = { id: 'auth-supervisor', nome: 'Carlos Silva', papel: 'supervisor' as const, organizacaoId: 'org-1', ativo: true }
  cenario.repo.perfis.push(supervisor)
  cenario.repo.equipes.find(e => e.id === 'eq-1')!.supervisorPessoaId = supervisor.id
  cenario.repo.equipes.push({ id: 'eq-2', nome: 'Portaria', eventoId: cenario.evento.id, exigeMeio: false })
  cenario.repo.participacoes.push({
    id: 'part-maria', pessoaId: 'pes-maria', eventoId: cenario.evento.id, equipeId: 'eq-2', equipeNome: 'Portaria',
    funcao: 'Operadora', supervisorNome: null, ativo: true, descredenciadoEm: null, valorReceber: 100,
    pago: false, pagoEm: null, qrToken: 'token-maria', cidade: null, criadoEm: '2026-08-20T10:00:00-03:00',
  })
  cenario.repo.pessoas.push({ id: 'pes-maria', nome: 'Maria Souza', cpf: '98765432100', telefone: null, fotoPath: null })
  return { ...cenario, supervisor }
}

test('admin e supervisor gerenciam; colaborador e suporte não têm o atalho', async () => {
  const cenario = cenarioHenriqueEJuliano()
  await assert.doesNotReject(() => eventosParaLancarPonto(cenario.repo, cenario.admin.id))

  cenario.repo.perfis.push({ id: 'auth-suporte', nome: 'Bruno', papel: 'suporte', organizacaoId: 'org-1', ativo: true })
  await assert.rejects(() => eventosParaLancarPonto(cenario.repo, 'auth-suporte'), /permissão/i)
})

test('o supervisor só vê o próprio evento; o admin, os da organização', async () => {
  const cenario = comSupervisorESegundoSetor(cenarioHenriqueEJuliano())
  const doSupervisor = await eventosParaLancarPonto(cenario.repo, cenario.supervisor.id)
  assert.deepEqual(doSupervisor.map(e => e.eventoId), ['ev-hj'])

  const doAdmin = await eventosParaLancarPonto(cenario.repo, cenario.admin.id)
  assert.ok(doAdmin.some(e => e.eventoId === 'ev-hj'))
})

test('dadosParaLancarPonto traz as pessoas com as batidas já registradas, e o dia padrão certo', async () => {
  const cenario = cenarioHenriqueEJuliano()
  const dados = await dadosParaLancarPonto(cenario.repo, cenario.admin.id, cenario.evento.id, AGORA)

  assert.equal(dados.eventoNome, cenario.evento.nome)
  assert.ok(dados.pessoas.some(p => p.nome === 'João da Silva'))
  assert.equal(dados.diaPadrao, '2026-09-05')
  assert.ok(dados.dias.some(d => d.tipo === 'principal'))
})

test('o supervisor só vê a própria equipe em dadosParaLancarPonto', async () => {
  const cenario = comSupervisorESegundoSetor(cenarioHenriqueEJuliano())
  const dados = await dadosParaLancarPonto(cenario.repo, cenario.supervisor.id, cenario.evento.id, AGORA)
  assert.ok(dados.pessoas.every(p => p.setorNome === 'Produção'))
  assert.ok(!dados.pessoas.some(p => p.nome === 'Maria Souza'))
})

test('lançar exige etapa válida, motivo com 5+ caracteres e data/hora informadas', async () => {
  const cenario = cenarioHenriqueEJuliano()
  const base = { participacaoId: 'part-joao', dataRef: '2026-09-05', quandoISO: '2026-09-05T20:00:00-03:00', motivo: 'Esqueceu de bater' }

  assert.match(
    (await lancarPontoManual(cenario.repo, cenario.admin.id, base.participacaoId, 'invalida' as never, base.dataRef, base.quandoISO, base.motivo)).erro ?? '',
    /etapa/i,
  )
  assert.match(
    (await lancarPontoManual(cenario.repo, cenario.admin.id, base.participacaoId, 'entrada', base.dataRef, base.quandoISO, 'oi')).erro ?? '',
    /motivo/i,
  )
  assert.match(
    (await lancarPontoManual(cenario.repo, cenario.admin.id, base.participacaoId, 'entrada', base.dataRef, 'data-invalida', base.motivo)).erro ?? '',
    /data e a hora/i,
  )
})

test('lançar recusa dia que não é de trabalho, e hora longe demais do dia', async () => {
  const cenario = cenarioHenriqueEJuliano()

  const diaErrado = await lancarPontoManual(
    cenario.repo, cenario.admin.id, 'part-joao', 'entrada', '2026-12-25',
    '2026-12-25T08:00:00-03:00', 'Correção necessária',
  )
  assert.match(diaErrado.erro ?? '', /dia de trabalho/i)

  const horaLonge = await lancarPontoManual(
    cenario.repo, cenario.admin.id, 'part-joao', 'entrada', '2026-09-05',
    '2026-09-10T08:00:00-03:00', 'Correção necessária',
  )
  assert.match(horaLonge.erro ?? '', /longe demais/i)
})

test('pessoa não ativada é recusada', async () => {
  const cenario = cenarioHenriqueEJuliano()
  cenario.participacao.ativo = false
  const r = await lancarPontoManual(
    cenario.repo, cenario.admin.id, 'part-joao', 'entrada', '2026-09-05',
    '2026-09-05T08:00:00-03:00', 'Correção necessária',
  )
  assert.match(r.erro ?? '', /não está ativada/i)
})

test('o supervisor não lança ponto de gente de outro setor', async () => {
  const cenario = comSupervisorESegundoSetor(cenarioHenriqueEJuliano())
  const r = await lancarPontoManual(
    cenario.repo, cenario.supervisor.id, 'part-maria', 'entrada', '2026-09-05',
    '2026-09-05T08:00:00-03:00', 'Tentando lançar fora da equipe',
  )
  assert.match(r.erro ?? '', /outro setor/i)
})

test('lançar grava a batida no dia certo, sobrescrevendo uma já existente, e registra a auditoria', async () => {
  const cenario = cenarioHenriqueEJuliano()

  const r1 = await lancarPontoManual(
    cenario.repo, cenario.admin.id, 'part-joao', 'entrada', '2026-09-05',
    '2026-09-05T08:00:00-03:00', 'Esqueceu de bater o QR',
  )
  assert.equal(r1.erro, undefined)
  assert.equal(r1.nome, 'João da Silva')
  assert.equal(r1.etapa, 'Entrada')

  const r2 = await lancarPontoManual(
    cenario.repo, cenario.admin.id, 'part-joao', 'entrada', '2026-09-05',
    '2026-09-05T09:15:00-03:00', 'Hora errada da primeira vez',
  )
  assert.equal(r2.erro, undefined)

  const registros = await cenario.repo.registrosDaParticipacao('part-joao')
  const entradas = registros.filter(r => r.tipo === 'entrada' && r.dataRef === '2026-09-05')
  assert.equal(entradas.length, 1, 'a segunda correção sobrescreve, não duplica')
  assert.ok(entradas[0]!.registradoEm.startsWith('2026-09-05T12:15'), 'hora ISO em UTC (09:15 BRT)')
  assert.equal(entradas[0]!.manual, true)

  const auditoria = await cenario.repo.auditoria({})
  assert.ok(auditoria.some(a => a.acao === 'CORRECAO_PONTO' && a.motivo === 'Hora errada da primeira vez'))
})
