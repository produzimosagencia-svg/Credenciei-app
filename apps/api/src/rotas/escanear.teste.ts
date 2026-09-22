/*
 * Ler o crachá no portão — a ação mais repetida do sistema.
 *
 * O tema aqui é o mesmo do resto da API: isolamento (não ler crachá de outro
 * evento, não ler crachá de outra organização) e a régua de decisão do
 * scanner (quem escolhe a etapa é o sistema, não o operador).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ed25519 } from '@noble/curves/ed25519'
import { gerarCodigoQR, gerarCodigoQREd25519 } from '@credenciei/dominio'
import { cenarioHenriqueEJuliano } from '../dados/memoria.js'
import { conferirPorCpf, eventosParaEscanear, registrarPorQr } from './escanear.js'
import type { Evento } from '../dados/repositorio.js'

const SEGREDO = 'segredo-de-teste'
const TOKEN = 'token-do-joao'

const cracha = (fase: 'montagem' | 'evento' | 'desmontagem') =>
  gerarCodigoQR(SEGREDO, TOKEN, fase).codigo

// Par de chaves FIXO, só para teste — ver ADR 009.
const CHAVE_PRIVADA_TESTE = new Uint8Array(32).fill(3)
const CHAVE_PUBLICA_TESTE = ed25519.getPublicKey(CHAVE_PRIVADA_TESTE)

/** Uma segunda organização, com um evento e uma pessoa próprios. */
function comSegundaOrganizacao() {
  const c = cenarioHenriqueEJuliano()
  const eventoDaOutra: Evento = {
    ...c.evento,
    id: 'ev-outra',
    organizacaoId: 'org-2',
    nome: 'Festa da Outra Empresa',
  }
  c.repo.eventos.push(eventoDaOutra)
  c.repo.equipes.push({ id: 'eq-outra', nome: 'Produção', eventoId: 'ev-outra' })
  c.repo.pessoas.push({ id: 'pes-rui', nome: 'Rui', cpf: '33333333333', telefone: null, fotoPath: null })
  c.repo.participacoes.push({
    ...c.participacao, id: 'part-rui', pessoaId: 'pes-rui', eventoId: 'ev-outra',
    equipeId: 'eq-outra', qrToken: 'token-do-rui',
  })
  return { ...c, eventoDaOutra }
}

test('quem não tem permissão de escanear é recusado', async () => {
  const { repo, supervisor } = (() => {
    const c = cenarioHenriqueEJuliano()
    const supervisor = { id: 'auth-sup', nome: 'Carlos', papel: 'supervisor' as const, organizacaoId: 'org-1', ativo: true }
    c.repo.perfis.push(supervisor)
    return { ...c, supervisor }
  })()
  await assert.rejects(() => eventosParaEscanear(repo, supervisor.id), /permissão/)
  await assert.rejects(
    () => registrarPorQr(repo, SEGREDO, null, supervisor.id, 'ev-hj', cracha('evento'), new Date('2026-09-05T19:00:00-03:00')),
    /permissão/,
  )
})

test('eventosParaEscanear: master vê todas as organizações, admin só a própria', async () => {
  const { repo, master, admin } = comSegundaOrganizacao()
  const doMaster = await eventosParaEscanear(repo, master.id)
  const doAdmin = await eventosParaEscanear(repo, admin.id)

  assert.deepEqual(doMaster.map(e => e.nome).sort(), ['Festa da Outra Empresa', 'Henrique e Juliano — Kleber Andrade'])
  assert.deepEqual(doAdmin.map(e => e.nome), ['Henrique e Juliano — Kleber Andrade'])
})

test('admin de uma organização não escaneia evento de outra', async () => {
  const { repo, admin } = comSegundaOrganizacao()
  await assert.rejects(
    () => registrarPorQr(repo, SEGREDO, null, admin.id, 'ev-outra', cracha('evento'), new Date('2026-09-05T19:00:00-03:00')),
    /não tem acesso a este evento/,
  )
})

test('QR com assinatura inválida é recusado', async () => {
  const { repo, admin } = cenarioHenriqueEJuliano()
  const r = await registrarPorQr(repo, SEGREDO, null, admin.id, 'ev-hj', 'c3.token.M.assinaturaFalsa', new Date('2026-09-05T19:00:00-03:00'))
  assert.equal(r.situacao, 'recusado')
})

test('crachá de outro evento não passa — mesmo com assinatura válida', async () => {
  const { repo, admin } = comSegundaOrganizacao()
  // O crachá do Rui é do evento OUTRO; lido no evento Henrique e Juliano.
  const codigoDoRui = gerarCodigoQR(SEGREDO, 'token-do-rui', 'evento').codigo
  const r = await registrarPorQr(repo, SEGREDO, null, admin.id, 'ev-hj', codigoDoRui, new Date('2026-09-05T19:00:00-03:00'))
  assert.equal(r.situacao, 'recusado')
  if (r.situacao !== 'recusado') return
  assert.match(r.mensagem, /não é deste evento/)
})

test('crachá da etapa errada é recusado nomeando as duas etapas', async () => {
  const { repo, admin } = cenarioHenriqueEJuliano()
  // O crachá é da montagem; hoje (dentro do período do evento) é "evento".
  const r = await registrarPorQr(repo, SEGREDO, null, admin.id, 'ev-hj', cracha('montagem'), new Date('2026-09-05T19:00:00-03:00'))
  assert.equal(r.situacao, 'etapa_errada')
})

test('dia que não está marcado como dia de trabalho recusa a batida', async () => {
  const { repo, admin } = cenarioHenriqueEJuliano()
  // Bem antes da montagem (03/09) — a fase ainda é "montagem", mas o dia não
  // está marcado na jornada do evento.
  const r = await registrarPorQr(repo, SEGREDO, null, admin.id, 'ev-hj', cracha('montagem'), new Date('2026-08-20T10:00:00-03:00'))
  assert.equal(r.situacao, 'recusado')
  if (r.situacao !== 'recusado') return
  assert.match(r.mensagem, /não está marcado como dia de trabalho/)
})

test('o dia do evento respeita a janela configurada', async () => {
  const { repo, admin } = cenarioHenriqueEJuliano()
  // A janela de entrada do dia principal abre às 07:00 do dia 05.
  const cedo = await registrarPorQr(repo, SEGREDO, null, admin.id, 'ev-hj', cracha('evento'), new Date('2026-09-05T05:00:00-03:00'))
  assert.equal(cedo.situacao, 'recusado')
})

test('o crachá certo registra a entrada, e a saída não exige mais o meio', async () => {
  const { repo, admin } = cenarioHenriqueEJuliano()

  const entrada = await registrarPorQr(repo, SEGREDO, null, admin.id, 'ev-hj', cracha('evento'), new Date('2026-09-05T19:00:00-03:00'))
  assert.equal(entrada.situacao, 'registrado')
  if (entrada.situacao !== 'registrado') return
  assert.equal(entrada.momento, 'entrada')
  assert.equal(entrada.pessoa.nome, 'João da Silva')

  // Dentro da janela de saída do dia principal (01:30–08:00 do dia 6), sem
  // ter registrado o meio.
  const saida = await registrarPorQr(repo, SEGREDO, null, admin.id, 'ev-hj', cracha('evento'), new Date('2026-09-06T02:00:00-03:00'))
  assert.equal(saida.situacao, 'registrado')
  if (saida.situacao !== 'registrado') return
  assert.equal(saida.momento, 'fim')
})

test('o registro gravado pelo scanner tem origem "app" — os dois relógios ficam rastreáveis', async () => {
  const { repo, admin } = cenarioHenriqueEJuliano()
  await registrarPorQr(repo, SEGREDO, null, admin.id, 'ev-hj', cracha('evento'), new Date('2026-09-05T19:00:00-03:00'))

  const gravado = repo.registros.find(r => r.participacaoId === 'part-joao')!
  assert.equal(gravado.origem, 'app')
  assert.equal(gravado.recebidoEm, gravado.registradoEm)
})

test('leitura em sequência, dentro da carência, é recusada — não vira saída por engano', async () => {
  const { repo, admin } = cenarioHenriqueEJuliano()
  await registrarPorQr(repo, SEGREDO, null, admin.id, 'ev-hj', cracha('evento'), new Date('2026-09-05T19:00:00-03:00'))
  const r = await registrarPorQr(repo, SEGREDO, null, admin.id, 'ev-hj', cracha('evento'), new Date('2026-09-05T19:01:00-03:00'))
  assert.equal(r.situacao, 'recusado')
  if (r.situacao !== 'recusado') return
  assert.match(r.mensagem, /acabou de registrar/)
})

test('sair e voltar no mesmo dia reabre o turno, e apaga a saída anterior', async () => {
  // Num dia de PREPARAÇÃO de propósito: entrada e saída são livres o dia
  // inteiro, então o teste fica sobre a mesma data — sem entrar na conta de
  // qual dia a saída "pertence" quando o turno atravessa a meia-noite.
  const { repo, admin } = cenarioHenriqueEJuliano()
  await registrarPorQr(repo, SEGREDO, null, admin.id, 'ev-hj', cracha('montagem'), new Date('2026-09-03T08:00:00-03:00'))
  await registrarPorQr(repo, SEGREDO, null, admin.id, 'ev-hj', cracha('montagem'), new Date('2026-09-03T18:00:00-03:00')) // saída

  const antesDeReabrir = (await repo.registrosDaParticipacao('part-joao')).length
  const r = await registrarPorQr(repo, SEGREDO, null, admin.id, 'ev-hj', cracha('montagem'), new Date('2026-09-03T18:10:00-03:00'))

  assert.equal(r.situacao, 'reaberto')
  const depois = await repo.registrosDaParticipacao('part-joao')
  assert.equal(depois.length, antesDeReabrir - 1, 'a saída foi apagada, não mantida ao lado')
  assert.ok(depois.some(x => x.tipo === 'entrada'), 'a entrada original continua lá')
})

test('participação inativa é recusada, mesmo com o crachá certo', async () => {
  const { repo, admin, participacao } = cenarioHenriqueEJuliano()
  participacao.ativo = false
  const r = await registrarPorQr(repo, SEGREDO, null, admin.id, 'ev-hj', cracha('evento'), new Date('2026-09-05T19:00:00-03:00'))
  assert.equal(r.situacao, 'recusado')
  if (r.situacao !== 'recusado') return
  assert.match(r.mensagem, /ativada/)
})

test('participação já descredenciada não passa mais', async () => {
  const { repo, admin, participacao } = cenarioHenriqueEJuliano()
  participacao.descredenciadoEm = '2026-09-04T10:00:00-03:00'
  const r = await registrarPorQr(repo, SEGREDO, null, admin.id, 'ev-hj', cracha('evento'), new Date('2026-09-05T19:00:00-03:00'))
  assert.equal(r.situacao, 'recusado')
  if (r.situacao !== 'recusado') return
  assert.match(r.mensagem, /descredenciada/)
})

// ─── Conferir pelo CPF ──────────────────────────────────────────────────────

test('a conferência por CPF acha a pessoa e as etapas já feitas hoje', async () => {
  const { repo, admin, pessoa } = cenarioHenriqueEJuliano()
  await registrarPorQr(repo, SEGREDO, null, admin.id, 'ev-hj', cracha('evento'), new Date('2026-09-05T19:00:00-03:00'))

  const r = await conferirPorCpf(repo, admin.id, 'ev-hj', pessoa.cpf, new Date('2026-09-05T20:00:00-03:00'))
  assert.equal(r.encontrada, true)
  assert.equal(r.nome, 'João da Silva')
  assert.deepEqual(r.etapasFeitas, ['entrada'])
})

test('CPF que não está na equipe deste evento não é encontrado', async () => {
  const { repo, admin } = comSegundaOrganizacao()
  const r = await conferirPorCpf(repo, admin.id, 'ev-hj', '33333333333') // o Rui é do outro evento
  assert.equal(r.encontrada, false)
})

// ─── QR c4 (Ed25519) — ADR 009 ──────────────────────────────────────────────
//
// Ainda não é gerado em produção (fase 3 do ADR); aqui só confere que a rota
// já sabe ACEITAR quando a chave pública está configurada, e que sem ela um
// código c4 cai no mesmo "fora do padrão" de qualquer formato desconhecido —
// exatamente o estado esperado antes da fase 2 ser ligada de verdade.

test('com a chave pública Ed25519 configurada, um crachá c4 é aceito', async () => {
  const { repo, admin } = cenarioHenriqueEJuliano()
  const agora = new Date('2026-09-05T19:00:00-03:00')
  const codigo = gerarCodigoQREd25519(CHAVE_PRIVADA_TESTE, TOKEN, 'evento', agora).codigo

  const r = await registrarPorQr(repo, SEGREDO, CHAVE_PUBLICA_TESTE, admin.id, 'ev-hj', codigo, agora)
  assert.equal(r.situacao, 'registrado')
})

test('sem a chave pública configurada, o mesmo crachá c4 é recusado como fora do padrão', async () => {
  const { repo, admin } = cenarioHenriqueEJuliano()
  const agora = new Date('2026-09-05T19:00:00-03:00')
  const codigo = gerarCodigoQREd25519(CHAVE_PRIVADA_TESTE, TOKEN, 'evento', agora).codigo

  const r = await registrarPorQr(repo, SEGREDO, null, admin.id, 'ev-hj', codigo, agora)
  assert.equal(r.situacao, 'recusado')
  if (r.situacao !== 'recusado') return
  assert.match(r.mensagem, /fora do padrão/)
})
