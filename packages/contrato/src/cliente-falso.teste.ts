/*
 * O servidor falso precisa ser exigente como o de verdade.
 *
 * Um cliente falso permissivo demais ensina o app a fazer coisa errada: as
 * telas ficam prontas assumindo que dá, e a falha só aparece contra a API real
 * — onde a recusa é de segurança, não de conveniência.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ClienteFalso } from './cliente-falso.js'

const CODIGO_DO_EVENTO = 'HJK-2026-K7M2'

/** Sessão pronta, que é o ponto de partida de quase todo teste. */
async function logado() {
  const c = new ClienteFalso()
  await c.pedirCodigo('27999255959')
  await c.entrar('27999255959', '123456')
  return c
}

async function comParticipacao() {
  const c = await logado()
  await c.entrarNoEvento(CODIGO_DO_EVENTO, { funcao: 'Auxiliar', uniforme: 'M' })
  return c
}

// ─── Entrar ─────────────────────────────────────────────────────────────────

test('sem pedir o código antes, não entra', async () => {
  const c = new ClienteFalso()
  const r = await c.entrar('27999255959', '123456')
  assert.match(r.erro ?? '', /Peça o código antes/)
})

test('código errado não abre a porta', async () => {
  const c = new ClienteFalso()
  await c.pedirCodigo('27999255959')
  const r = await c.entrar('27999255959', '000000')
  assert.match(r.erro ?? '', /Código incorreto/)
})

test('telefone incompleto é recusado com instrução', async () => {
  const c = new ClienteFalso()
  const r = await c.pedirCodigo('99999')
  assert.equal(r.enviado, false)
  assert.match(r.erro ?? '', /com DDD/)
})

test('sem sessão, nada é respondido', async () => {
  const c = new ClienteFalso()
  await assert.rejects(() => c.minhasParticipacoes(), /Sessão expirada/)
})

// ─── Código do evento ───────────────────────────────────────────────────────

test('código de evento errado não vira vínculo', async () => {
  const c = await logado()
  const r = await c.consultarConvite('ABC-2026-9999')
  assert.match(r.erro ?? '', /Não encontramos um evento/)
})

test('código malformado explica o formato', async () => {
  const c = await logado()
  const r = await c.consultarConvite('abc')
  assert.match(r.erro ?? '', /três letras, o ano e mais quatro/)
})

test('o convite pede só o que a conta ainda não sabe', async () => {
  const c = await logado()
  const { convite } = await c.consultarConvite(CODIGO_DO_EVENTO)
  const chaves = convite!.camposExtras.map(x => x.chave)

  assert.deepEqual(chaves, ['funcao', 'uniforme'])
  // A promessa central da conta permanente: dado que já existe não é repedido.
  for (const jaSabido of ['nome', 'cpf', 'telefone', 'email']) {
    assert.ok(!chaves.includes(jaSabido), `${jaSabido} não devia ser pedido de novo`)
  }
})

test('campo obrigatório em branco não deixa entrar', async () => {
  const c = await logado()
  const r = await c.entrarNoEvento(CODIGO_DO_EVENTO, { funcao: 'Auxiliar' })
  assert.match(r.erro ?? '', /Tamanho do uniforme/)
})

test('entrar no evento cria o vínculo credenciado', async () => {
  const c = await comParticipacao()
  const lista = await c.minhasParticipacoes()

  assert.equal(lista.length, 1)
  assert.equal(lista[0]!.situacao, 'credenciado')
  assert.equal(lista[0]!.funcao, 'Auxiliar')
  assert.equal(lista[0]!.supervisor, 'Carlos Silva')
})

// ─── Isolamento ─────────────────────────────────────────────────────────────

test('participação de outra pessoa é recusada', async () => {
  // A falha que este teste guarda tem nome — IDOR — e é a mais comum em APIs.
  const c = await comParticipacao()
  await assert.rejects(() => c.meusDias('part-de-outra-pessoa'), /não tem acesso/)
  await assert.rejects(() => c.meuFinanceiro('part-de-outra-pessoa'), /não tem acesso/)
  await assert.rejects(() => c.meuQr('part-de-outra-pessoa'), /não tem acesso/)
})

// ─── Bater ponto ────────────────────────────────────────────────────────────

const bater = (tipo: 'entrada' | 'meio' | 'fim', em: string, id = `b-${Math.random()}`) => ({
  id, participacaoId: 'part-1', tipo, registradoEm: em,
})

test('o ciclo do dia funciona na ordem certa', async () => {
  const c = await comParticipacao()

  const e = await c.registrarBatida(bater('entrada', '2026-09-03T08:00:00-03:00'))
  assert.equal(e.situacao, 'registrado')

  const m = await c.registrarBatida(bater('meio', '2026-09-03T12:05:00-03:00'))
  assert.equal(m.situacao, 'registrado')

  const s = await c.registrarBatida(bater('fim', '2026-09-03T18:40:00-03:00'))
  assert.equal(s.situacao, 'registrado')
})

test('o meio antes das quatro horas é recusado', async () => {
  const c = await comParticipacao()
  await c.registrarBatida(bater('entrada', '2026-09-03T08:00:00-03:00'))

  const r = await c.registrarBatida(bater('meio', '2026-09-03T10:00:00-03:00'))
  assert.equal(r.situacao, 'recusado')
  assert.match(r.situacao === 'recusado' ? r.motivo : '', /ainda não abriu/)
})

test('o meio sem entrada é recusado', async () => {
  const c = await comParticipacao()
  const r = await c.registrarBatida(bater('meio', '2026-09-03T12:00:00-03:00'))
  assert.match(r.situacao === 'recusado' ? r.motivo : '', /Registre primeiro a sua entrada/)
})

test('a saída sem o meio é recusada', async () => {
  // Pedido explicitamente: o horário do meio precisa estar gravado para dar
  // para justificar a jornada com a pessoa depois.
  const c = await comParticipacao()
  await c.registrarBatida(bater('entrada', '2026-09-03T08:00:00-03:00'))

  const r = await c.registrarBatida(bater('fim', '2026-09-03T18:00:00-03:00'))
  assert.match(r.situacao === 'recusado' ? r.motivo : '', /Registre o meio antes de sair/)
})

test('dia que não é de trabalho recusa a batida', async () => {
  const c = await comParticipacao()
  const r = await c.registrarBatida(bater('entrada', '2026-08-20T08:00:00-03:00'))
  assert.match(r.situacao === 'recusado' ? r.motivo : '', /não está marcado como dia de trabalho/)
})

test('o dia do evento respeita a janela configurada', async () => {
  const c = await comParticipacao()
  // Entrada abre 07:00 no dia 05. Às 05:00 ainda não vale.
  const cedo = await c.registrarBatida(bater('entrada', '2026-09-05T05:00:00-03:00'))
  assert.equal(cedo.situacao, 'recusado')

  const certo = await c.registrarBatida(bater('entrada', '2026-09-05T10:00:00-03:00'))
  assert.equal(certo.situacao, 'registrado')
})

test('o mesmo id volta como duplicado, sem gravar de novo', async () => {
  const c = await comParticipacao()
  const b = bater('entrada', '2026-09-03T08:00:00-03:00', 'sempre-o-mesmo')

  const um = await c.registrarBatida(b)
  const dois = await c.registrarBatida(b)

  assert.equal(um.situacao, 'registrado')
  assert.equal(dois.situacao, 'duplicado')

  const dias = await c.meusDias('part-1')
  const dia3 = dias.find(d => d.data === '2026-09-03')!
  assert.ok(dia3.entrada, 'a entrada existe')
})

test('falha de rede é exceção, não resposta de erro', async () => {
  // A fila offline depende disso: exceção ela guarda e tenta de novo; resposta
  // de erro ela descarta. Trocar os dois perde batida ou insiste para sempre.
  const c = new ClienteFalso({ falhaDeRede: 1 })
  await assert.rejects(() => c.pedirCodigo('27999255959'), /Sem conexão/)
})

// ─── Histórico ──────────────────────────────────────────────────────────────

test('o histórico mostra todos os dias, inclusive os sem batida', async () => {
  const c = await comParticipacao()
  await c.registrarBatida(bater('entrada', '2026-09-03T08:00:00-03:00'))

  const dias = await c.meusDias('part-1')
  assert.equal(dias.length, 4, 'quatro dias de trabalho configurados')

  const trabalhado = dias.find(d => d.data === '2026-09-03')!
  assert.ok(trabalhado.compareceu)
  assert.equal(trabalhado.etapa, 'montagem')

  const faltou = dias.find(d => d.data === '2026-09-04')!
  assert.equal(faltou.compareceu, false, 'a ausência precisa aparecer')

  assert.equal(dias.find(d => d.data === '2026-09-05')!.etapa, 'evento')
  assert.equal(dias.find(d => d.data === '2026-09-06')!.etapa, 'desmontagem')
})

test('o meio esperado é calculado a partir da entrada real', async () => {
  const c = await comParticipacao()
  await c.registrarBatida(bater('entrada', '2026-09-03T08:30:00-03:00'))

  const dia = (await c.meusDias('part-1')).find(d => d.data === '2026-09-03')!
  const hhmm = new Date(Date.parse(dia.meioEsperado!) - 3 * 3600e3).toISOString().slice(11, 16)
  assert.equal(hhmm, '12:30')
})

test('o meio atrasado é medido, não escondido', async () => {
  const c = await comParticipacao()
  await c.registrarBatida(bater('entrada', '2026-09-03T08:00:00-03:00'))
  // Janela do meio: abre 12:00, prazo até 14:00. Registrou 14:40.
  await c.registrarBatida(bater('meio', '2026-09-03T14:40:00-03:00'))

  const dia = (await c.meusDias('part-1')).find(d => d.data === '2026-09-03')!
  assert.equal(dia.meioAtrasoMin, 40)
})

test('o financeiro é só sobre os dias que a pessoa trabalhou', async () => {
  const c = await comParticipacao()
  await c.registrarBatida(bater('entrada', '2026-09-03T08:00:00-03:00'))

  const f = await c.meuFinanceiro('part-1')
  assert.equal(f.diasTrabalhados, 1)
  assert.equal(f.situacao, 'pendente')
})

// ─── QR ─────────────────────────────────────────────────────────────────────

test('o QR muda de etapa junto com o dia', async () => {
  const naMontagem = await comParticipacao()
  // Força o relógio para dentro de cada etapa.
  const noEvento = new ClienteFalso({ agora: () => Date.parse('2026-09-05T12:00:00-03:00') })
  await noEvento.pedirCodigo('27999255959')
  await noEvento.entrar('27999255959', '123456')
  await noEvento.entrarNoEvento(CODIGO_DO_EVENTO, { funcao: 'Auxiliar', uniforme: 'M' })

  const a = await naMontagem.meuQr('part-1')
  const b = await noEvento.meuQr('part-1')

  assert.equal(b.etapa, 'evento')
  assert.notEqual(a.codigo, b.codigo, 'o crachá da montagem não serve no dia do evento')
})

// ─── Supervisor ─────────────────────────────────────────────────────────────

test('o painel da equipe aponta a pendência atual', async () => {
  const c = new ClienteFalso({ agora: () => Date.parse('2026-09-03T09:00:00-03:00') })
  await c.pedirCodigo('27999255959')
  await c.entrar('27999255959', '123456')
  await c.entrarNoEvento(CODIGO_DO_EVENTO, { funcao: 'Auxiliar', uniforme: 'M' })

  const antes = await c.painelDaEquipe('ev-1')
  assert.equal(antes.presentes, 0)
  assert.equal(antes.pessoas[0]!.pendencia, 'entrada')

  await c.registrarBatida(bater('entrada', '2026-09-03T08:00:00-03:00'))
  const depois = await c.painelDaEquipe('ev-1')
  assert.equal(depois.presentes, 1)
  assert.equal(depois.pessoas[0]!.pendencia, 'meio')
})
