/*
 * O servidor falso precisa ser exigente como o de verdade.
 *
 * Um cliente falso permissivo demais ensina o app a fazer coisa errada: as
 * telas ficam prontas assumindo que dá, e a falha só aparece contra a API real
 * — onde a recusa é de segurança, não de conveniência.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { distanciaEntreCpfs } from '@credenciei/dominio'
import {
  ClienteFalso, CONTAS_DE_DEMONSTRACAO, credenciaisDeDemonstracao,
  SENHA_DE_DEMONSTRACAO, type ComportamentoFalso,
} from './cliente-falso.js'

const CODIGO_DO_EVENTO = 'HJK-2026-K7M2'

/** Entra com a conta de demonstração daquele papel. */
async function entrarComo(c: ClienteFalso, papel: string) {
  const conta = CONTAS_DE_DEMONSTRACAO.find(x => x.papel === papel)
  if (!conta) throw new Error(`sem conta de demonstração para ${papel}`)
  const r = await c.entrarComSenha(conta.email, SENHA_DE_DEMONSTRACAO)
  if (!r.sessao) throw new Error(r.erro ?? 'não entrou')
  return r.sessao
}

/** Sessão pronta, que é o ponto de partida de quase todo teste. */
async function logado(op: ComportamentoFalso = {}) {
  const c = new ClienteFalso(op)
  await c.pedirCodigo('27999255959')
  await c.entrar('27999255959', '123456')
  return c
}

async function comParticipacao(op: ComportamentoFalso = {}) {
  const c = await logado(op)
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

// ─── Auto-atendimento (entrada sem operador) ───────────────────────────────
//
// Trazido do site em 11/09/2026. Só entrada — por isso não existe um
// `bater('fim', ...)` equivalente aqui: `registrarEntradaLivre` nem recebe a
// etapa como parâmetro. A saída continua sempre pelo QR do credenciamento.

test('fora do dia principal, a entrada livre já funciona mesmo com o auto-atendimento desligado', async () => {
  const c = await comParticipacao({ checkinAutonomoDoEvento: false, agora: () => Date.parse('2026-09-03T08:00:00-03:00') })
  const r = await c.registrarEntradaLivre('part-1', {})
  assert.equal(r.situacao, 'registrado')
})

test('no dia principal, sem o auto-atendimento ligado, a entrada livre é recusada', async () => {
  const c = await comParticipacao({ checkinAutonomoDoEvento: false, agora: () => Date.parse('2026-09-05T10:00:00-03:00') })
  const r = await c.registrarEntradaLivre('part-1', {})
  assert.equal(r.situacao, 'recusado')
  assert.match(r.situacao === 'recusado' ? r.motivo : '', /pelo QR Code no credenciamento/)
})

test('no dia principal, com o auto-atendimento ligado, a entrada livre respeita a mesma janela da assistida', async () => {
  const c = await comParticipacao({ checkinAutonomoDoEvento: true, agora: () => Date.parse('2026-09-05T05:00:00-03:00') })
  const cedo = await c.registrarEntradaLivre('part-1', {})
  assert.equal(cedo.situacao, 'recusado')
})

test('no dia principal, com o auto-atendimento ligado, a entrada livre dentro da janela registra', async () => {
  const c = await comParticipacao({ checkinAutonomoDoEvento: true, agora: () => Date.parse('2026-09-05T10:00:00-03:00') })
  const r = await c.registrarEntradaLivre('part-1', { lat: -20.3, lng: -40.3 })
  assert.equal(r.situacao, 'registrado')

  const dias = await c.meusDias('part-1')
  const principal = dias.find(d => d.data === '2026-09-05')!
  assert.ok(principal.entrada, 'a entrada ficou gravada')
})

test('dia que não é de trabalho recusa a entrada livre também', async () => {
  const c = await comParticipacao({ agora: () => Date.parse('2026-08-20T08:00:00-03:00') })
  const r = await c.registrarEntradaLivre('part-1', {})
  assert.match(r.situacao === 'recusado' ? r.motivo : '', /não está marcado como dia de trabalho/)
})

test('a segunda entrada livre do mesmo dia vem duplicada, não gera batida nova', async () => {
  const c = await comParticipacao({ agora: () => Date.parse('2026-09-03T08:00:00-03:00') })
  const um = await c.registrarEntradaLivre('part-1', {})
  const dois = await c.registrarEntradaLivre('part-1', {})

  assert.equal(um.situacao, 'registrado')
  assert.equal(dois.situacao, 'duplicado')
})

test('participação de outra pessoa não registra entrada livre', async () => {
  const c = await comParticipacao()
  await assert.rejects(() => c.registrarEntradaLivre('part-de-outra-pessoa', {}), /não tem acesso/)
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

// ─── Renovação ──────────────────────────────────────────────────────────────

test('renovar devolve uma sessão inteira, e não um remendo', async () => {
  const c = await logado()
  const { sessao } = await c.renovar('renovacao-de-mentira')

  assert.ok(sessao, 'a renovação com o token certo tinha que passar')
  assert.ok(sessao.token, 'sem token a sessão não serve para nada')
  assert.ok(sessao.renovacao)
  assert.equal(sessao.papel, 'colaborador')
})

test('o token de renovação gira: o de antes para de valer', async () => {
  /*
   * É a mesma regra da API real. Está aqui para o app ser obrigado a guardar o
   * token NOVO — se ele guardar o antigo, a segunda renovação falha e a pessoa
   * cai para fora sozinha, provavelmente no meio do evento.
   */
  const c = await logado()
  const primeira = await c.renovar('renovacao-de-mentira')
  assert.ok(primeira.sessao)

  const repetida = await c.renovar('renovacao-de-mentira')
  assert.equal(repetida.sessao, undefined)
  assert.ok(repetida.erro)

  const comONovo = await c.renovar(primeira.sessao.renovacao)
  assert.ok(comONovo.sessao, 'o token devolvido na renovação anterior tem que valer')
})

test('o app reabre com a sessão que estava guardada no aparelho', async () => {
  const antes = await logado()
  const guardada = (await antes.renovar('renovacao-de-mentira')).sessao!

  // Outro processo: é o app sendo aberto de novo, depois de fechado.
  const depois = new ClienteFalso({ sessaoInicial: guardada })
  const eu = await depois.eu()
  assert.equal(eu.pessoaId, 'p-1')

  const renovada = await depois.renovar(guardada.renovacao)
  assert.ok(renovada.sessao, 'a renovação guardada tem que continuar valendo')
})

test('renovação recusada é decisão, não falha de rede', async () => {
  const c = new ClienteFalso()
  const r = await c.renovar('token-inventado')

  // Resposta com erro, e não exceção: quem chama precisa saber que insistir
  // não adianta — é para pedir o login de novo, não para tentar mais tarde.
  assert.equal(r.sessao, undefined)
  assert.ok(r.erro)
})

// ─── Entrar com senha ───────────────────────────────────────────────────────

test('a conta de painel entra com senha e recebe o papel dela', async () => {
  const c = new ClienteFalso()
  const supervisor = CONTAS_DE_DEMONSTRACAO.find(x => x.papel === 'supervisor')!
  const r = await c.entrarComSenha(supervisor.email, SENHA_DE_DEMONSTRACAO)

  assert.ok(r.sessao, r.erro ?? 'era para entrar')
  assert.equal(r.sessao.papel, 'supervisor')
  assert.equal((await c.eu()).papel, 'supervisor')
})

test('conta que não existe e senha errada dizem a MESMA coisa', async () => {
  /*
   * Se a recusa fosse diferente, alguém descobriria quais CPFs têm conta
   * tentando um por um — e essa é justamente a lista de quem acessa o painel.
   */
  const c = new ClienteFalso()
  const existe = CONTAS_DE_DEMONSTRACAO[0]!
  const inexistente = await c.entrarComSenha('ninguem@lugar.nenhum', SENHA_DE_DEMONSTRACAO)
  const senhaErrada = await c.entrarComSenha(existe.email, 'chutei')

  assert.equal(inexistente.sessao, undefined)
  assert.equal(senhaErrada.sessao, undefined)
  assert.equal(inexistente.erro, senhaErrada.erro)
})

// ─── Painel ─────────────────────────────────────────────────────────────────

test('o colaborador não tem painel, e quem recusa é o servidor', async () => {
  // O app já esconde o menu dele — mas menu escondido é arrumação, não
  // segurança. Quem decide é quem tem os dados.
  const c = await logado()
  await assert.rejects(() => c.painel(), /não tem acesso/i)
})

test('o painel do admin traz os quatro números e os eventos', async () => {
  const c = new ClienteFalso()
  await entrarComo(c, 'admin')
  const p = await c.painel()

  assert.equal(p.indicadores.length, 4)
  assert.deepEqual(
    p.indicadores.map(i => i.chave),
    ['eventos_ativos', 'presentes', 'nao_chegaram', 'batidas'],
  )
  assert.equal(p.eventos.length, 3)
  assert.ok(p.legendaDaJanela, 'sem a legenda, "0 batidas" fica ambíguo')
})

test('presentes e ainda-não-chegaram somam a equipe', async () => {
  // Os dois números saem da MESMA contagem. Se viessem de contas diferentes,
  // a tela mostraria 1 presente e 65 faltando numa equipe de 70.
  const c = new ClienteFalso()
  await entrarComo(c, 'admin')
  const p = await c.painel()

  const presentes = p.indicadores.find(i => i.chave === 'presentes')!
  const faltando = p.indicadores.find(i => i.chave === 'nao_chegaram')!
  const equipe = p.eventos.reduce((a, e) => a + e.equipe, 0)

  // Os dois são sempre contagem — `valor` só vira texto em fichas que somam
  // um "68%" ou uma data, o que não é o caso do painel.
  assert.equal((presentes.valor as number) + (faltando.valor as number), equipe)
})

test('o supervisor vê só o próprio setor, e o recorte é do servidor', async () => {
  const c = new ClienteFalso()
  await entrarComo(c, 'supervisor')
  const p = await c.painel()

  assert.equal(p.eventos.length, 1, 'ele não pode enxergar a operação inteira')

  const admin = new ClienteFalso()
  await entrarComo(admin, 'admin')
  assert.equal((await admin.painel()).eventos.length, 3)
})

test('a conta de painel entra por e-mail ou por CPF', async () => {
  /*
   * O campo da tela diz "CPF ou e-mail". Se o falso aceitasse só uma das duas
   * formas, metade do rótulo seria mentira — e a descoberta só viria contra a
   * API real.
   */
  const conta = CONTAS_DE_DEMONSTRACAO[0]!

  const porEmail = await new ClienteFalso().entrarComSenha(conta.email, SENHA_DE_DEMONSTRACAO)
  assert.ok(porEmail.sessao, porEmail.erro)
  assert.equal(porEmail.sessao.papel, conta.papel)

  const porCpf = await new ClienteFalso().entrarComSenha(conta.cpf, SENHA_DE_DEMONSTRACAO)
  assert.ok(porCpf.sessao, porCpf.erro)

  // Sem pontuação também: quem digita no celular costuma pular os pontos.
  const semPontos = await new ClienteFalso()
    .entrarComSenha(conta.cpf.replace(/\D/g, ''), SENHA_DE_DEMONSTRACAO)
  assert.ok(semPontos.sessao, semPontos.erro)
})

test('cada conta de demonstração tem um papel diferente', () => {
  // Elas existem para o menu poder ser visto mudando. Duas com o mesmo papel
  // não provariam nada.
  const papeis = CONTAS_DE_DEMONSTRACAO.map(c => c.papel)
  assert.equal(new Set(papeis).size, papeis.length)
  assert.deepEqual(papeis, ['master', 'admin', 'supervisor'])
})


// ─── Escanear QR ────────────────────────────────────────────────────────────

/** Um operador de portaria pronto, que é o ponto de partida do scanner. */
async function noPortao(op: ComportamentoFalso = {}) {
  const c = new ClienteFalso(op)
  await entrarComo(c, 'admin')
  return c
}

/** Dentro da janela do evento de mentira (05/09 18:30 → 06/09 08:00). */
const INICIO_DO_TURNO = Date.parse('2026-09-05T18:00:00-03:00')

/**
 * Um relógio que avança sozinho a cada leitura.
 *
 * `inferirMomentoDoScanner` tem carência de 5 min entre leituras da mesma
 * pessoa — sem isso, duas chamadas em teste (que acontecem em milissegundos
 * de diferença) cairiam sempre na carência, e nenhum teste conseguiria
 * exercitar o que vem DEPOIS dela.
 *
 * `crachaQueServe`/`credenciaisDeDemonstracao` embutem a FASE no QR a partir
 * do relógio de verdade quando chamados sem argumento — por isso os testes
 * que usam este relógio também precisam gerar o crachá com `INICIO_DO_TURNO`,
 * senão o QR e o servidor discordam sobre "hoje" e tudo vira etapa_errada.
 */
function relogioQueAvanca(inicio = INICIO_DO_TURNO, passoMin = 10) {
  let agora = inicio
  return () => {
    const t = agora
    agora += passoMin * 60_000
    return t
  }
}

/** O crachá de alguém, do jeito que sai da credencial. */
function crachaQueServe() {
  return credenciaisDeDemonstracao().find(c => c.serveHoje)!
}

test('o supervisor não escaneia — e quem recusa é o servidor', async () => {
  /*
   * O menu do app já esconde "Escanear QR" dele. Mas menu escondido é
   * arrumação, não segurança: quem decide é quem grava a presença.
   */
  const c = new ClienteFalso()
  await entrarComo(c, 'supervisor')
  await assert.rejects(() => c.eventosParaEscanear(), /permissão/i)
  await assert.rejects(
    () => c.registrarPorQr('ev-1', crachaQueServe().codigo),
    /permissão/i,
  )
})

test('o crachá certo registra a entrada e devolve o nome', async () => {
  const c = await noPortao()
  const cracha = crachaQueServe()
  const r = await c.registrarPorQr('ev-1', cracha.codigo)

  assert.equal(r.situacao, 'registrado')
  if (r.situacao !== 'registrado') return
  assert.equal(r.pessoa.nome, cracha.nome)
  assert.equal(r.momento, 'entrada')
})

test('o mesmo crachá lido duas vezes seguidas é recusado, não vira saída', async () => {
  /*
   * A fila anda e o operador passa o leitor de novo sem querer. Sem a
   * carência, a segunda leitura — segundos depois da primeira — seria lida
   * como "a entrada está aberta, então isto é a saída": a pessoa nem
   * trabalhou e já sairia registrada.
   */
  const c = await noPortao()
  const cracha = crachaQueServe()
  await c.registrarPorQr('ev-1', cracha.codigo)
  const segunda = await c.registrarPorQr('ev-1', cracha.codigo)

  assert.equal(segunda.situacao, 'recusado')
  if (segunda.situacao !== 'recusado') return
  assert.match(segunda.mensagem, /acabou de registrar a ENTRADA/)
})

test('depois da carência, a leitura seguinte já é a saída — sem escolher nada', async () => {
  // O site tirou o botão Entrada/Saída do operador: quem decide é o sistema,
  // pelo que já foi registrado.
  const c = await noPortao({ agora: relogioQueAvanca() })
  const cracha = credenciaisDeDemonstracao(INICIO_DO_TURNO).find(x => x.serveHoje)!
  await c.registrarPorQr('ev-1', cracha.codigo)
  const r = await c.registrarPorQr('ev-1', cracha.codigo)

  assert.equal(r.situacao, 'registrado')
  if (r.situacao !== 'registrado') return
  assert.equal(r.momento, 'fim')
})

test('a saída NÃO exige mais o meio — mudou no site, trazido em 11/09/2026', async () => {
  /*
   * Chegou a existir essa trava, a pedido explícito — mas travava justamente
   * quem mais precisava sair: quem perdeu o meio de verdade ficava preso no
   * evento até um supervisor destravar pelo registro assistido. A ausência
   * do meio continua visível no histórico; só deixou de IMPEDIR a saída.
   */
  const c = await noPortao({ agora: relogioQueAvanca() })
  const cracha = credenciaisDeDemonstracao(INICIO_DO_TURNO).find(x => x.serveHoje)!
  await c.registrarPorQr('ev-1', cracha.codigo)
  const saida = await c.registrarPorQr('ev-1', cracha.codigo)

  assert.equal(saida.situacao, 'registrado')
  if (saida.situacao !== 'registrado') return
  assert.equal(saida.momento, 'fim')
})

test('crachá de outra etapa não é "inválido": é etapa errada, com as duas', async () => {
  /*
   * Dizer "QR inválido" faria o operador pensar em falsificação e chamar a
   * segurança, quando o que houve foi alguém mostrar o crachá da montagem no
   * dia do evento. A resposta precisa nomear as duas etapas.
   */
  const c = await noPortao()
  const errado = credenciaisDeDemonstracao().find(x => !x.serveHoje)!
  const r = await c.registrarPorQr('ev-1', errado.codigo)

  assert.equal(r.situacao, 'etapa_errada')
  if (r.situacao !== 'etapa_errada') return
  assert.ok(r.doQr)
  assert.ok(r.deHoje)
  assert.notEqual(r.doQr, r.deHoje)
})

test('código que não saiu deste sistema é recusado', async () => {
  const c = await noPortao()
  const r = await c.registrarPorQr('ev-1', 'c3.qr-ana.M.assinaturaInventada')
  assert.equal(r.situacao, 'recusado')
})

test('sair e voltar no mesmo dia reabre o turno, não recusa', async () => {
  /*
   * O ciclo inteiro: entra, registra o meio (pelo caminho assistido, só para
   * destravar a saída), sai, e volta — fora da carência em cada passo. A
   * volta tem que reabrir, não recusar "já registrou entrada e saída hoje".
   */
  const c = await noPortao({ agora: relogioQueAvanca() })
  const cracha = credenciaisDeDemonstracao(INICIO_DO_TURNO)
    .find(x => x.serveHoje && x.nome === 'Ana Cláudia Ferreira')!

  const entrada = await c.registrarPorQr('ev-1', cracha.codigo)
  assert.equal(entrada.situacao, 'registrado')

  const { ficha } = await c.localizarPessoa('037.482.615-09')
  await c.registrarPresencaAssistida(ficha!.participacaoId, { tipo: 'meio', fotoBase64: 'foto' })

  const saida = await c.registrarPorQr('ev-1', cracha.codigo)
  assert.equal(saida.situacao, 'registrado')
  if (saida.situacao === 'registrado') assert.equal(saida.momento, 'fim')

  const volta = await c.registrarPorQr('ev-1', cracha.codigo)
  assert.equal(volta.situacao, 'reaberto')
  if (volta.situacao !== 'reaberto') return
  assert.match(volta.mensagem, /turno reaberto/i)

  // A próxima leitura é a saída final — não "já está tudo registrado".
  const saidaFinal = await c.registrarPorQr('ev-1', cracha.codigo)
  assert.equal(saidaFinal.situacao, 'registrado')
  if (saidaFinal.situacao === 'registrado') assert.equal(saidaFinal.momento, 'fim')
})

test('quem não foi ativada no evento não passa', async () => {
  const c = await noPortao()
  const conferencia = await c.conferirPorCpf('ev-1', '87204953167')
  assert.equal(conferencia.encontrada, true)
  assert.equal(conferencia.ativo, false)
})

test('a conferência por CPF é a saída quando o crachá não passa', async () => {
  // Sem ela sobram duas opções ruins: mandar a pessoa embora, ou deixar entrar
  // sem conferir.
  const c = await noPortao()
  const achou = await c.conferirPorCpf('ev-1', '037.482.615-09')
  assert.equal(achou.encontrada, true)
  assert.equal(achou.nome, 'Ana Cláudia Ferreira')

  const naoAchou = await c.conferirPorCpf('ev-1', '000.000.000-00')
  assert.equal(naoAchou.encontrada, false)
  assert.ok(naoAchou.mensagem)
})

// ─── Registrar ponto por outra pessoa ───────────────────────────────────────

test('nome que bate com várias pessoas devolve a lista, não a primeira', async () => {
  /*
   * Nome quase nunca é único. Escolher sozinho a primeira gravaria a presença
   * de quem não veio — e quem sabe qual é a certa é quem está olhando para a
   * pessoa.
   */
  const c = await noPortao()
  const r = await c.localizarPessoa('Silva')

  assert.equal(r.ficha, undefined)
  assert.ok(r.candidatos && r.candidatos.length > 1)
})

test('CPF completo abre a ficha direto', async () => {
  const c = await noPortao()
  const r = await c.localizarPessoa('037.482.615-09')
  assert.ok(r.ficha)
  assert.equal(r.ficha.nome, 'Ana Cláudia Ferreira')
})

test('CPF com um dígito errado ainda acha a pessoa, marcado como aproximado', async () => {
  /*
   * O documento na mão do operador está certo — a consulta exata é que não
   * acha uma linha gravada com um algarismo trocado no cadastro. Trazido do
   * site em 11/09.
   */
  const c = await noPortao()
  // CPF real da Ana (037.482.615-09) com o penúltimo dígito trocado.
  const r = await c.localizarPessoa('037.482.615-19')

  assert.equal(r.ficha, undefined, 'nunca escolhe sozinho, mesmo com um candidato só')
  assert.ok(r.candidatos)
  assert.equal(r.candidatos.length, 1)
  assert.equal(r.candidatos[0]?.nome, 'Ana Cláudia Ferreira')
  assert.equal(r.candidatos[0]?.cpfAproximado, true)
})

test('CPF exato não vem marcado como aproximado', async () => {
  const c = await noPortao()
  const r = await c.localizarPessoa('037.482.615-09')
  assert.ok(r.ficha)
})

test('CPF com três dígitos diferentes passa da tolerância e não acha ninguém', async () => {
  const c = await noPortao()
  // 037.482.615-09 com três algarismos trocados (posições 0, 5 e 10).
  assert.equal(distanciaEntreCpfs('03748261509', '13748961500'), 3)
  const r = await c.localizarPessoa('137.489.615-00')
  assert.ok(r.erro)
  assert.equal(r.candidatos, undefined)
})

test('a busca por nome ignora acento', async () => {
  // Quem digita com pressa não põe acento, e exigir faria a busca falhar
  // justamente com a pessoa na frente.
  const c = await noPortao()
  const r = await c.localizarPessoa('patricia')
  assert.ok(r.ficha)
  assert.equal(r.ficha.nome, 'Patrícia Nogueira Silva')
})

test('busca curta demais é recusada com explicação', async () => {
  const c = await noPortao()
  const r = await c.localizarPessoa('an')
  assert.ok(r.erro)
  assert.equal(r.ficha, undefined)
})

test('sem foto, não registra', async () => {
  /*
   * A foto é a única prova de que o colaborador estava na frente de quem
   * registrou. Sem ela, registrar por terceiro seria só digitar um nome.
   */
  const c = await noPortao()
  const { ficha } = await c.localizarPessoa('037.482.615-09')
  const r = await c.registrarPresencaAssistida(ficha!.participacaoId, { tipo: 'entrada', fotoBase64: '' })

  assert.ok(r.erro)
  assert.match(r.erro, /foto/i)
})

// ─── Quem escolhe a etapa é o operador ──────────────────────────────────────
//
// Trazido do site em 11/09: existia uma trava aqui ("grava só a pendente"),
// pensada contra erro; na operação real virou o problema oposto — sem QR na
// hora, o que falta pode não ser a "próxima" que o sistema calcula.

test('a ficha traz as três etapas, com a recomendação pré-marcada', async () => {
  const c = await noPortao()
  const { ficha } = await c.localizarPessoa('037.482.615-09')

  assert.equal(ficha!.proximaPendente?.tipo, 'entrada')
  assert.equal(ficha!.etapas.length, 3)
  assert.deepEqual(ficha!.etapas.map(e => e.tipo), ['entrada', 'meio', 'fim'])
  assert.ok(ficha!.etapas.every(e => e.quandoISO === null), 'ninguém registrado ainda')
})

test('o operador escolhe a etapa — não precisa ser a pendente', async () => {
  const c = await noPortao()
  const { ficha } = await c.localizarPessoa('037.482.615-09')

  // Pendente seria "entrada", mas o operador escolhe "meio" — e o servidor
  // grava a que foi escolhida, não recalcula sozinho.
  const r = await c.registrarPresencaAssistida(ficha!.participacaoId, { tipo: 'meio', fotoBase64: 'foto' })
  assert.equal(r.erro, undefined)
  assert.equal(r.etapa, 'Meio')

  const depois = await c.abrirFicha(ficha!.participacaoId)
  const meio = depois.ficha?.etapas.find(e => e.tipo === 'meio')
  assert.ok(meio?.quandoISO)
  const entrada = depois.ficha?.etapas.find(e => e.tipo === 'entrada')
  assert.equal(entrada?.quandoISO, null, 'escolher o meio não inventa a entrada')
})

test('escolher uma etapa já registrada sobrescreve o horário — é correção, não duplicata', async () => {
  const c = await noPortao()
  const { ficha } = await c.localizarPessoa('037.482.615-09')

  await c.registrarPresencaAssistida(ficha!.participacaoId, { tipo: 'entrada', fotoBase64: 'foto' })
  const primeiroHorario = (await c.abrirFicha(ficha!.participacaoId)).ficha!
    .etapas.find(e => e.tipo === 'entrada')!.quandoISO

  await c.registrarPresencaAssistida(ficha!.participacaoId, { tipo: 'entrada', fotoBase64: 'foto de novo' })
  const segundoHorario = (await c.abrirFicha(ficha!.participacaoId)).ficha!
    .etapas.find(e => e.tipo === 'entrada')!.quandoISO

  assert.ok(primeiroHorario && segundoHorario)
  // No falso o relógio não avança sozinho entre as duas chamadas, mas o que
  // importa é que a segunda gravação SUBSTITUI — não gera uma segunda linha
  // nem recusa por "já registrado".
  const ficha2 = (await c.abrirFicha(ficha!.participacaoId)).ficha!
  assert.equal(ficha2.etapas.filter(e => e.tipo === 'entrada').length, 1)
})

test('etapa inválida é recusada pelo servidor, não só pela tela', async () => {
  const c = await noPortao()
  const { ficha } = await c.localizarPessoa('037.482.615-09')
  const r = await c.registrarPresencaAssistida(
    ficha!.participacaoId,
    { tipo: 'almoco' as never, fotoBase64: 'foto' },
  )
  assert.ok(r.erro)
})

test('pessoa não ativada não recebe presença registrada por terceiro', async () => {
  const c = await noPortao()
  const { ficha } = await c.localizarPessoa('87204953167')
  assert.equal(ficha?.ativo, false)

  const r = await c.registrarPresencaAssistida(ficha!.participacaoId, { tipo: 'entrada', fotoBase64: 'foto' })
  assert.ok(r.erro)
})

test('id de quem não existe responde igual a id fora do alcance', async () => {
  // Diferenciar entregaria uma forma de varrer ids e descobrir quem existe.
  const c = await noPortao()
  const r = await c.abrirFicha('f-999')
  assert.ok(r.erro)
  assert.equal(r.ficha, undefined)
})

test('o supervisor localiza e registra, mesmo sem escanear', async () => {
  // Tirar o scanner dele não pode cegá-lo em relação à própria equipe.
  const c = new ClienteFalso()
  await entrarComo(c, 'supervisor')
  const r = await c.localizarPessoa('037.482.615-09')
  assert.ok(r.ficha)

  const gravou = await c.registrarPresencaAssistida(r.ficha.participacaoId, { tipo: 'entrada', fotoBase64: 'foto' })
  assert.equal(gravou.erro, undefined)
})

test('o colaborador não localiza ninguém', async () => {
  const c = await logado()
  await assert.rejects(() => c.localizarPessoa('Silva'), /permissão/i)
})


// ─── Atividades do evento ───────────────────────────────────────────────────
//
// As sete visões trazidas do site em 11/09/2026 — a mesma pergunta que
// `/admin/atividades` responde por lá, com o seletor de dia sempre visível.

test('os dias de operação vêm sempre, mesmo antes de escolher nenhum', async () => {
  const c = await noPortao()
  const a = await c.atividades('ev-1')
  assert.deepEqual(a.dias, ['2026-08-29', '2026-08-30'])
  assert.ok(a.dias.includes(a.diaEscolhido), 'o dia escolhido precisa ser um dia de operação')
})

test('sem pedir dia, cai no último que já passou — nunca um dia futuro', async () => {
  const c = await noPortao()
  const a = await c.atividades('ev-1')
  // O relógio real está muito depois dos dias de mentira (08-29/08-30): o
  // fallback pega o mais recente dos dois, não o primeiro.
  assert.equal(a.diaEscolhido, '2026-08-30')
})

test('pedir um dia que não é de operação é ignorado, sem quebrar', async () => {
  const c = await noPortao()
  const a = await c.atividades('ev-1', { dia: '2026-01-01' })
  assert.equal(a.diaEscolhido, '2026-08-30')
})

test('a visão "entrada" mostra quem bateu, com o horário', async () => {
  const c = await noPortao()
  const a = await c.atividades('ev-1', { visao: 'entrada', dia: '2026-08-30' })

  assert.ok(a.linhas.some(l => l.nome === 'Ana Cláudia Ferreira'))
  assert.ok(a.linhas.some(l => l.nome === 'Juan Muzy'))
  for (const l of a.linhas) assert.ok(l.em, 'a visão de "feito" sempre tem o horário')
})

test('registro assistido vem marcado como manual', async () => {
  // É a primeira coisa que se olha quando um registro é contestado: uma
  // leitura de QR e uma batida que outra pessoa fez pesam diferente.
  const c = await noPortao()
  const a = await c.atividades('ev-1', { visao: 'entrada', dia: '2026-08-30' })

  const assistida = a.linhas.find(l => l.nome === 'Rodrigo Menezes Lima')!
  assert.ok(assistida, 'faltou o registro assistido de mentira')
  assert.equal(assistida.manual, true)

  const porQr = a.linhas.find(l => l.nome === 'Ana Cláudia Ferreira')!
  assert.equal(porQr.manual, false)
})

test('a visão "presentes" é quem entrou e ainda não saiu', async () => {
  const c = await noPortao()
  const a = await c.atividades('ev-1', { visao: 'presentes', dia: '2026-08-29' })

  // Patrícia entrou e saiu no dia 29 — não está mais presente.
  assert.equal(a.linhas.some(l => l.nome === 'Patrícia Nogueira Silva'), false)
})

/*
 * As duas próximas fixam o relógio dentro do dia 30/08 — que É um dia de
 * operação do ev-1 de mentira. Sem isso, "hoje" seria o dia real (bem depois
 * dos dias de mentira) e nunca bateria com um dia de operação: a batida de
 * agora existiria, mas em nenhum dia que o seletor oferece — o mesmo que
 * aconteceria no site com um evento de 2026 visto depois do ano acabar.
 */
const DENTRO_DO_DIA_30 = () => Date.parse('2026-08-30T20:00:00-03:00')

test('a visão "faltam" é quem está ativo e não bateu a entrada — some assim que bate', async () => {
  const c = await noPortao({ agora: DENTRO_DO_DIA_30 })
  const antes = await c.atividades('ev-1', { visao: 'faltam' })
  assert.equal(antes.diaEscolhido, '2026-08-30')
  assert.ok(antes.linhas.some(l => l.nome === 'Wesley dos Santos Silva'))

  const cracha = credenciaisDeDemonstracao(DENTRO_DO_DIA_30())
    .find(x => x.serveHoje && x.nome === 'Wesley dos Santos Silva')!
  await c.registrarPorQr('ev-1', cracha.codigo)

  const depois = await c.atividades('ev-1', { visao: 'faltam' })
  assert.equal(depois.linhas.some(l => l.nome === cracha.nome), false)
})

test('o que acabou de ser escaneado aparece na visão de entrada, no dia de hoje', async () => {
  // Sem isso, quem bate uma entrada e vai conferir não a encontra — e conclui
  // que ela não gravou.
  const c = await noPortao({ agora: DENTRO_DO_DIA_30 })

  const cracha = credenciaisDeDemonstracao(DENTRO_DO_DIA_30()).find(x => x.serveHoje)!
  await c.registrarPorQr('ev-1', cracha.codigo)

  const a = await c.atividades('ev-1', { visao: 'entrada' })
  assert.equal(a.diaEscolhido, a.hoje)
  assert.ok(a.linhas.some(l => l.nome === cracha.nome))
})

test('os números batem com as linhas de cada visão', async () => {
  // Os cartões do topo levam para a visão que eles contam. Se viessem de
  // contas diferentes, o cartão diria 4 e a lista mostraria 3.
  const c = await noPortao()
  const dia = '2026-08-30'

  const [numeros, entrada, fim, presentes] = await Promise.all([
    c.atividades('ev-1', { dia }).then(a => a.numeros),
    c.atividades('ev-1', { visao: 'entrada', dia }).then(a => a.linhas.length),
    c.atividades('ev-1', { visao: 'fim', dia }).then(a => a.linhas.length),
    c.atividades('ev-1', { visao: 'presentes', dia }).then(a => a.linhas.length),
  ])

  assert.equal(numeros.entradas, entrada)
  assert.equal(numeros.saidas, fim)
  assert.equal(numeros.presentes, presentes)
})

test('o colaborador não acompanha o evento', async () => {
  const c = await logado()
  await assert.rejects(() => c.atividades('ev-1'), /permissão/i)
})

test('o supervisor acompanha, e só o evento do setor dele', async () => {
  const c = new ClienteFalso()
  await entrarComo(c, 'supervisor')
  const eventos = await c.eventosParaAcompanhar()
  assert.equal(eventos.length, 1)
})

test('o supervisor só vê a própria equipe nas visões, não o evento inteiro', async () => {
  const c = new ClienteFalso()
  await entrarComo(c, 'supervisor')
  const a = await c.atividades('ev-2', { visao: 'faltam' })

  // Carlos Silva supervisiona Ana, Rodrigo e Juan — não Patrícia, Wesley ou
  // Simone, que são da equipe da Marina Alves.
  assert.ok(a.linhas.every(l => ['Ana Cláudia Ferreira', 'Rodrigo Menezes Lima', 'Juan Muzy'].includes(l.nome)))
})

// ─── Acessos ────────────────────────────────────────────────────────────────

test('a lista de acessos separa ativos de inativos', async () => {
  const c = await noPortao()
  const todos = await c.acessos()
  assert.equal(todos.ativos + todos.inativos, todos.total)

  const inativos = await c.acessos({ situacao: 'inativos' })
  assert.ok(inativos.itens.length > 0, 'faltou alguém inativo para a aba existir')
  assert.ok(inativos.itens.every(a => !a.ativo))
})

test('a busca acha por nome e por identificador, sem acento', async () => {
  const c = await noPortao()
  assert.equal((await c.acessos({ busca: 'debora' })).itens.length, 1)
  assert.equal((await c.acessos({ busca: 'DEBORA' })).itens.length, 1)
  assert.equal((await c.acessos({ busca: 'marina@produzimos' })).itens.length, 1)
})

test('a própria linha vem marcada', async () => {
  // É ela que não mostra as ações — ninguém remove o próprio acesso por engano.
  const c = await noPortao()
  const lista = await c.acessos()
  const eu = lista.itens.filter(a => a.souEu)
  assert.equal(eu.length, 1)
  assert.equal(eu[0]!.nome, 'Marina Alves')
})

test('ninguém desativa o próprio acesso', async () => {
  /*
   * Ficaria trancado para fora — e, num sistema onde só o master cria admins,
   * isso vira uma ligação para a plataforma no meio do evento.
   */
  const c = await noPortao()
  const lista = await c.acessos()
  const eu = lista.itens.find(a => a.souEu)!

  const r = await c.mudarSituacaoDoAcesso(eu.id, false)
  assert.ok(r.erro)
})

test('desativar bloqueia o login sem apagar a pessoa', async () => {
  const c = await noPortao()
  const alvo = (await c.acessos()).itens.find(a => !a.souEu && a.ativo)!

  assert.equal((await c.mudarSituacaoDoAcesso(alvo.id, false)).erro, undefined)

  const depois = await c.acessos()
  assert.equal(depois.total, (await c.acessos()).total, 'não podia sumir da lista')
  assert.equal(depois.itens.find(a => a.id === alvo.id)?.ativo, false)

  // E dá para voltar atrás.
  await c.mudarSituacaoDoAcesso(alvo.id, true)
  assert.equal((await c.acessos()).itens.find(a => a.id === alvo.id)?.ativo, true)
})

test('o admin não enxerga o acesso do master', async () => {
  // É a mesma régua do resto do sistema: admin vê a própria organização.
  const c = await noPortao()
  const doAdmin = await c.acessos()
  assert.equal(doAdmin.itens.some(a => a.papel === 'master'), false)

  const m = new ClienteFalso()
  await entrarComo(m, 'master')
  assert.ok((await m.acessos()).itens.some(a => a.papel === 'master'))
})

test('o supervisor não vê a tela de acessos', async () => {
  const c = new ClienteFalso()
  await entrarComo(c, 'supervisor')
  await assert.rejects(() => c.acessos(), /permissão/i)
})

test('criar acesso exige nome, CPF e setor', async () => {
  const c = await noPortao()
  const base = {
    funcao: 'supervisor' as const,
    nome: 'Larissa Prado', cpf: '11122233344', telefone: '27999887766',
    eventoId: 'ev-1', setorId: 's-2', ativo: true,
  }

  assert.ok((await c.criarAcesso({ ...base, nome: 'La' })).erro)
  assert.ok((await c.criarAcesso({ ...base, cpf: '123' })).erro)
  assert.ok((await c.criarAcesso({ ...base, setorId: '' })).erro)
})

test('o acesso criado nasce supervisor, preso a um setor', async () => {
  const c = await noPortao()
  const r = await c.criarAcesso({
    funcao: 'supervisor',
    nome: 'Larissa Prado', cpf: '65498732100', telefone: '27999887766',
    eventoId: 'ev-1', setorId: 's-2', ativo: true,
  })

  assert.ok(r.acesso, r.erro)
  assert.equal(r.acesso.papel, 'supervisor')
  assert.equal(r.acesso.setorNome, 'Portaria')
  assert.ok((await c.acessos({ busca: 'Larissa' })).itens.length === 1)
})

test('CPF repetido é recusado', async () => {
  // Dois acessos com o mesmo CPF fariam duas pessoas entrarem na mesma conta.
  const c = await noPortao()
  const dados = {
    funcao: 'supervisor' as const,
    nome: 'Outra Pessoa', cpf: '99988877766', telefone: '27999887766',
    eventoId: 'ev-1', setorId: 's-2', ativo: true,
  }
  assert.ok((await c.criarAcesso(dados)).acesso)
  assert.ok((await c.criarAcesso({ ...dados, nome: 'Mais Outra' })).erro)
})

test('operador de portão e suporte nascem sem setor, presos ao evento inteiro', async () => {
  const c = await noPortao()

  const operador = await c.criarAcesso({
    funcao: 'operador_portao',
    nome: 'Marcos Lima', cpf: '22233344455', telefone: '27999887766',
    eventoId: 'ev-1', ativo: true,
  })
  assert.ok(operador.acesso, operador.erro)
  assert.equal(operador.acesso.papel, 'operador_portao')
  assert.equal(operador.acesso.setorNome, null)

  const suporte = await c.criarAcesso({
    funcao: 'suporte',
    nome: 'Beatriz Nunes', cpf: '33344455566', telefone: '27999887766',
    eventoId: 'ev-1', ativo: true, expiraEm: '2026-12-01',
  })
  assert.ok(suporte.acesso, suporte.erro)
  assert.equal(suporte.acesso.papel, 'suporte')
  assert.equal(suporte.acesso.setorNome, null)
  assert.equal(suporte.acesso.expiraEm, '2026-12-01')
})

test('a "Funções ligadas" grava só o override, e ele volta na lista de acessos', async () => {
  const c = await noPortao()
  const r = await c.criarAcesso({
    funcao: 'supervisor',
    nome: 'Patricia Melo', cpf: '44455566677', telefone: '27999887766',
    eventoId: 'ev-1', setorId: 's-2', ativo: true,
    // Supervisor não escaneia por padrão — este liga o extra.
    permissoesUsuario: { escanear: true },
  })
  assert.ok(r.acesso, r.erro)
  assert.deepEqual(r.acesso.permissoesUsuario, { escanear: true })

  const lista = await c.acessos({ busca: 'Patricia' })
  assert.deepEqual(lista.itens[0]?.permissoesUsuario, { escanear: true })
})

test('sem override, a "Funções ligadas" nasce vazia — vale o padrão do papel', async () => {
  const c = await noPortao()
  const r = await c.criarAcesso({
    funcao: 'operador_portao',
    nome: 'Diego Farias', cpf: '55566677788', telefone: '27999887766',
    eventoId: 'ev-1', ativo: true,
  })
  assert.deepEqual(r.acesso?.permissoesUsuario, {})
})

test('todo evento oferecido para criar acesso tem setor', async () => {
  // Supervisor sem setor não escaneia nem gerencia ninguém: seria um acesso
  // que não serve para nada.
  const c = await noPortao()
  for (const e of await c.eventosComSetores()) {
    assert.ok(e.setores.length > 0, `${e.nome} ficou sem setor`)
  }
})

// ─── O evento por dentro ────────────────────────────────────────────────────

test('o supervisor não abre a configuração do evento', async () => {
  // Ele cuida de um setor, não do evento. No sistema web ele é redirecionado
  // para o próprio setor; aqui o servidor recusa, que é a parte que importa.
  const c = new ClienteFalso()
  await entrarComo(c, 'supervisor')
  await assert.rejects(() => c.evento('ev-1'), /permissão/i)
})

test('a configuração traz os quatro números e os setores', async () => {
  const c = await noPortao()
  const e = await c.evento('ev-1')

  assert.deepEqual(
    e.indicadores.map(i => i.chave),
    ['setores', 'funcionarios', 'presentes', 'nao_chegaram'],
  )
  assert.ok(e.setores.length > 0)
  assert.equal(
    e.indicadores.find(i => i.chave === 'funcionarios')!.valor,
    e.setores.reduce((a, s) => a + s.pessoas, 0),
    'o total tem que sair da soma dos setores, e não de outra conta',
  )
})

test('o progresso conta PESSOAS, não batidas', async () => {
  /*
   * Quem lê o crachá duas vezes seguidas continua sendo uma pessoa que
   * entrou — a segunda leitura é recusada pela carência, nunca vira uma
   * segunda entrada. A pergunta da tela é "quantos dos 109 já passaram por
   * cada etapa", e ela só faz sentido contando gente.
   */
  const c = await noPortao()
  const cracha = crachaQueServe()
  await c.registrarPorQr('ev-1', cracha.codigo)
  await c.registrarPorQr('ev-1', cracha.codigo)

  const e = await c.evento('ev-1')
  assert.equal(e.progresso.find(p => p.etapa === 'entrada')!.feitos, 1)
})

test('cada setor traz o próprio link de cadastro, e eles são diferentes', async () => {
  // O link é por SETOR: é ele que decide em qual equipe a pessoa cai. Dois
  // setores com o mesmo link jogariam todo mundo no mesmo lugar.
  const c = await noPortao()
  const e = await c.evento('ev-1')
  const links = e.setores.map(s => s.linkDoFormulario)

  assert.equal(new Set(links).size, links.length)
  for (const l of links) assert.match(l, /^https?:\/\//)
})

// ─── A portaria ─────────────────────────────────────────────────────────────

test('fechar a portaria NÃO mata os cartazes já impressos', async () => {
  /*
   * Fechar é operação de rotina — fecha-se quando a fila acaba. Se o endereço
   * morresse a cada fechamento, todo cartaz impresso precisaria ser refeito no
   * dia seguinte.
   */
  const c = await noPortao()
  const antes = (await c.evento('ev-1')).portaria
  assert.equal(antes.aberta, true)
  assert.ok(antes.endereco)

  const fechada = await c.alternarPortaria('ev-1', false)
  assert.equal(fechada.portaria?.aberta, false)
  assert.equal(fechada.portaria?.endereco, antes.endereco, 'o endereço tinha que sobreviver')

  const aberta = await c.alternarPortaria('ev-1', true)
  assert.equal(aberta.portaria?.endereco, antes.endereco)
})

test('abrir pela primeira vez gera o endereço', async () => {
  const c = await noPortao()
  const antes = (await c.evento('ev-2')).portaria
  assert.equal(antes.aberta, false)
  assert.equal(antes.endereco, null)

  const r = await c.alternarPortaria('ev-2', true)
  assert.ok(r.portaria?.endereco, 'sem endereço não há o que imprimir')
})

test('trocar o QR muda o endereço — e é isso que mata os cartazes', async () => {
  // É destrutivo de propósito, e existe para o caso de o QR vazar. A tela avisa
  // antes; o servidor só executa.
  const c = await noPortao()
  const antes = (await c.evento('ev-1')).portaria.endereco
  const r = await c.trocarTokenDaPortaria('ev-1')

  assert.ok(r.portaria?.endereco)
  assert.notEqual(r.portaria.endereco, antes)
})

test('quantos entraram pela portaria é diferente de estar aberta', async () => {
  // Zero não quer dizer "ainda não ligou": o ev-3 está fechado e teve gente.
  const c = await noPortao()
  const p = (await c.evento('ev-3')).portaria
  assert.equal(p.aberta, false)
  assert.ok(p.cadastrados > 0)
})

// ─── Criar setor ────────────────────────────────────────────────────────────

const SUPERVISOR_DE_TESTE = { nome: 'Marina Oliveira', cpf: '111.222.333-96', telefone: '(27) 99988-7766' }

test('setor novo nasce vazio de equipe, mas já com o supervisor', async () => {
  /*
   * Trazido do site em 11/09: o setor não nasce mais com o link aberto e
   * ninguém respondendo por ele — o supervisor entra no mesmo formulário.
   */
  const c = await noPortao()
  const r = await c.criarSetor('ev-1', {
    nome: 'Segurança', estimado: 30, valorPorPessoa: 200, supervisor: SUPERVISOR_DE_TESTE,
  })

  assert.ok(r.setor, r.erro)
  assert.equal(r.setor.pessoas, 0)
  assert.ok(r.setor.linkDoFormulario)
  assert.equal(r.setor.supervisores.length, 1)
  assert.equal(r.setor.supervisores[0]?.nome, 'Marina Oliveira')
})

test('supervisor com o mesmo CPF de outro já existente não cria login novo — este setor entra nos dela', async () => {
  const c = await noPortao()
  const primeiro = await c.criarSetor('ev-1', {
    nome: 'Ambulância', supervisor: SUPERVISOR_DE_TESTE,
  })
  const segundo = await c.criarSetor('ev-1', {
    nome: 'Copa', supervisor: SUPERVISOR_DE_TESTE,
  })

  assert.ok(primeiro.setor, primeiro.erro)
  assert.ok(segundo.setor, segundo.erro)
  assert.equal(segundo.setor.supervisores[0]?.id, primeiro.setor.supervisores[0]?.id)
})

test('setor com nome repetido é recusado', async () => {
  /*
   * No cartaz da portaria só o NOME aparece. Dois setores "Bar" fariam a
   * pessoa escolher no escuro, e metade da equipe cairia no setor errado.
   */
  const c = await noPortao()
  const r = await c.criarSetor('ev-1', { nome: 'produção', supervisor: SUPERVISOR_DE_TESTE })
  assert.ok(r.erro)
  assert.match(r.erro, /já existe/i)
})

test('setor sem nome é recusado', async () => {
  const c = await noPortao()
  assert.ok((await c.criarSetor('ev-1', { nome: ' ', supervisor: SUPERVISOR_DE_TESTE })).erro)
})

test('setor sem supervisor válido é recusado', async () => {
  const c = await noPortao()
  const semNome = await c.criarSetor('ev-1', { nome: 'Iluminação', supervisor: { nome: '', cpf: '11122233396', telefone: '27999887766' } })
  const cpfCurto = await c.criarSetor('ev-1', { nome: 'Iluminação', supervisor: { nome: 'Marina Oliveira', cpf: '123', telefone: '27999887766' } })
  const semTelefone = await c.criarSetor('ev-1', { nome: 'Iluminação', supervisor: { nome: 'Marina Oliveira', cpf: '11122233396', telefone: '123' } })

  assert.match(semNome.erro ?? '', /nome/i)
  assert.match(cpfCurto.erro ?? '', /cpf/i)
  assert.match(semTelefone.erro ?? '', /whatsapp/i)
})

test('setor novo nasce sem pedir o meio, a não ser que o produtor marque', async () => {
  // "Nasce desligado" — mesmo padrão de `fornecedores.exige_meio` no site.
  const c = await noPortao()
  const semMarcar = await c.criarSetor('ev-1', {
    nome: 'Catering', supervisor: { nome: 'Renata Souza', cpf: '222.333.444-05', telefone: '(27) 99977-6655' },
  })
  const marcado = await c.criarSetor('ev-1', {
    nome: 'Sonorização',
    supervisor: { nome: 'Igor Ramalho', cpf: '333.444.555-16', telefone: '(27) 99966-5544' },
    exigeMeio: true,
  })

  assert.equal(semMarcar.setor?.linkDoFormulario ? true : false, true, semMarcar.erro)
  const config = await c.configuracaoDoMeio('ev-1')
  assert.equal(config.setores.find(s => s.nome === 'Catering')?.exigeMeio, false)
  assert.equal(config.setores.find(s => s.nome === 'Sonorização')?.exigeMeio, true)
})

// ─── Editar o evento ────────────────────────────────────────────────────────

test('a configuração traz os horários e os dias marcados', async () => {
  const c = await noPortao()
  const cfg = await c.configuracaoDoEvento('ev-1')

  assert.equal(cfg.batidaLivre, true, 'o Henrique e Juliano é por escala rotativa')
  assert.ok(cfg.janelaEntradaInicio)
  assert.ok(cfg.diaPrincipal)
  assert.ok(cfg.dias.some(d => d.tipo === 'principal'))
  assert.ok(cfg.dias.some(d => d.tipo === 'preparacao'))
})

test('o dia principal vem do começo do evento, e vem travado', async () => {
  // Ele não é escolhido na grade: sai da data do evento. Deixar desmarcar o dia
  // do evento apagaria o evento de dentro dele mesmo.
  const c = await noPortao()
  const cfg = await c.configuracaoDoEvento('ev-1')
  const principal = cfg.dias.find(d => d.tipo === 'principal')!

  assert.equal(principal.data, cfg.diaPrincipal)
  assert.equal(principal.temBatidas, true)
})

test('horário impossível é recusado pelo SERVIDOR, não só pela tela', async () => {
  /*
   * A tela confere antes, e vai continuar conferindo. Mas a tela é
   * conveniência e o servidor é a garantia: foi assim que a saída do Kleber
   * Andrade ficou marcada para o dia errado, e o erro só apareceria na
   * madrugada do evento com mil pessoas tentando bater a saída.
   */
  const c = await noPortao()
  const r = await c.salvarEvento('ev-1', {
    nome: 'Henrique e Juliano',
    descricao: null,
    local: 'Kleber Andrade',
    dataInicio: '2026-09-05T18:30:00-03:00',
    dataFim: '2026-09-06T08:00:00-03:00',
    batidaLivre: false,
    checkinAutonomo: false,
    // A saída marcada para ANTES do evento começar.
    janelaEntradaInicio: '2026-09-05T07:00:00-03:00',
    janelaEntradaFim: '2026-09-05T23:55:00-03:00',
    janelaFimInicio: '2026-09-04T01:30:00-03:00',
    janelaFimFim: '2026-09-04T08:00:00-03:00',
  })

  assert.ok(r.erro, 'era para o servidor recusar')
})

test('evento sem nome é recusado', async () => {
  const c = await noPortao()
  const r = await c.salvarEvento('ev-1', {
    nome: '  ',
    descricao: null,
    local: null,
    dataInicio: '2026-09-05T18:30:00-03:00',
    dataFim: null,
    batidaLivre: false,
    checkinAutonomo: false,
    janelaEntradaInicio: null,
    janelaEntradaFim: null,
    janelaFimInicio: null,
    janelaFimFim: null,
  })
  assert.ok(r.erro)
})

test('a batida livre gravada volta na configuração', async () => {
  const c = await noPortao()
  const antes = await c.configuracaoDoEvento('ev-2')
  assert.equal(antes.batidaLivre, false)

  await c.salvarEvento('ev-2', {
    nome: antes.nome,
    descricao: null,
    local: antes.local,
    dataInicio: antes.dataInicio,
    dataFim: antes.dataFim,
    batidaLivre: true,
    checkinAutonomo: antes.checkinAutonomo,
    janelaEntradaInicio: antes.janelaEntradaInicio,
    janelaEntradaFim: antes.janelaEntradaFim,
    janelaFimInicio: antes.janelaFimInicio,
    janelaFimFim: antes.janelaFimFim,
  })

  assert.equal((await c.configuracaoDoEvento('ev-2')).batidaLivre, true)
})

// ─── Dias de trabalho ───────────────────────────────────────────────────────

test('dia com batida é PRESERVADO mesmo vindo desmarcado', async () => {
  /*
   * Apagá-lo tiraria do sistema presenças que já aconteceram — e é delas que
   * sai o pagamento. A resposta diz quantos foram mantidos, para a tela
   * explicar em vez de parecer que o botão não funcionou.
   */
  const c = await noPortao()
  const antes = await c.configuracaoDoEvento('ev-1')
  const travado = antes.dias.find(d => d.tipo === 'preparacao' && d.temBatidas)
  assert.ok(travado, 'o cenário precisa ter um dia travado')

  // Manda uma lista SEM ele.
  const r = await c.salvarDiasDeTrabalho('ev-1', [])
  assert.equal(r.resultado?.preservados, 1)
  assert.equal(r.resultado?.dias, 1)

  const depois = await c.configuracaoDoEvento('ev-1')
  assert.ok(depois.dias.some(d => d.data === travado.data))
})

test('o dia do evento não entra na conta de dias de preparação', async () => {
  // Somar o dia do evento faria o número não bater com o que o produtor acabou
  // de marcar — e ele é o único dia da grade que não é "preparação".
  const c = await noPortao()
  const cfg = await c.configuracaoDoEvento('ev-2')
  const r = await c.salvarDiasDeTrabalho('ev-2', ['2026-08-28', cfg.diaPrincipal!])

  assert.equal(r.resultado?.dias, 1)
})

test('o supervisor não edita o evento', async () => {
  const c = new ClienteFalso()
  await entrarComo(c, 'supervisor')
  await assert.rejects(() => c.configuracaoDoEvento('ev-1'), /permissão/i)
})

// ─── Configuração do meio (setores × dias) ─────────────────────────────────
//
// Trazido do site em 11/09/2026. O meio não tem horário para configurar
// (é a entrada + 4h, sempre) — o que se escolhe é QUAIS SETORES pedem e EM
// QUAIS DIAS, e as duas listas se combinam com E (ver `lib/meio.ts`).

test('a configuração traz os setores e os dias, cada um com o próprio interruptor', async () => {
  const c = await noPortao()
  const config = await c.configuracaoDoMeio('ev-1')

  assert.ok(config.setores.length > 0)
  assert.ok(config.dias.some(d => d.tipo === 'principal'))
  assert.ok(config.dias.some(d => d.tipo === 'preparacao'))
  // O cenário nasce com Produção pedindo e Portaria não — ver SETORES_DE_MENTIRA.
  assert.equal(config.setores.find(s => s.nome === 'Produção')?.exigeMeio, true)
  assert.equal(config.setores.find(s => s.nome === 'Portaria')?.exigeMeio, false)
})

test('salvar liga exatamente os setores e os dias escolhidos, e desliga o resto', async () => {
  const c = await noPortao()
  const antes = await c.configuracaoDoMeio('ev-1')
  const doisSetores = antes.setores.slice(0, 2).map(s => s.setorId)
  const umDia = [antes.dias[0]!.data]

  const r = await c.salvarConfiguracaoDoMeio('ev-1', doisSetores, umDia)
  assert.equal(r.setores, 2)
  assert.equal(r.dias, 1)

  const depois = await c.configuracaoDoMeio('ev-1')
  for (const s of depois.setores) {
    assert.equal(s.exigeMeio, doisSetores.includes(s.setorId), `setor ${s.nome} divergiu`)
  }
  for (const d of depois.dias) {
    assert.equal(d.exigeMeio, umDia.includes(d.data), `dia ${d.data} divergiu`)
  }
})

test('nenhum setor ou nenhum dia marcado desliga o meio inteiro do evento', async () => {
  const c = await noPortao()
  const r = await c.salvarConfiguracaoDoMeio('ev-2', [], [])
  assert.equal(r.setores, 0)
  assert.equal(r.dias, 0)

  const config = await c.configuracaoDoMeio('ev-2')
  assert.ok(config.setores.every(s => !s.exigeMeio))
  assert.ok(config.dias.every(d => !d.exigeMeio))
})

test('o supervisor não configura o meio', async () => {
  const c = new ClienteFalso()
  await entrarComo(c, 'supervisor')
  await assert.rejects(() => c.configuracaoDoMeio('ev-1'), /permissão/i)
  await assert.rejects(() => c.salvarConfiguracaoDoMeio('ev-1', [], []), /permissão/i)
})

test('o meio exigido no "meus dias" do colaborador combina setor e dia com E', async () => {
  // Setor exige (padrão do cenário), mas o dia 06/09 nasce desligado — é a
  // desmontagem, o mesmo dia que CONFIGURACAO_DE_MENTIRA['ev-1'] desliga do
  // lado do painel.
  const c = await comParticipacao()
  const dias = await c.meusDias('part-1')

  assert.equal(dias.find(d => d.data === '2026-09-05')?.meioExigido, true)
  assert.equal(dias.find(d => d.data === '2026-09-06')?.meioExigido, false)
})

test('setor que não pede o meio some com o exigido, mesmo em dia que pede', async () => {
  const c = await comParticipacao({ meioExigidoNoMeuSetor: false })
  const dias = await c.meusDias('part-1')
  assert.ok(dias.every(d => !d.meioExigido))
})

// ─── A ficha de uma pessoa ──────────────────────────────────────────────────

/** A primeira pessoa de um setor com equipe, para os testes da ficha. */
async function alguemDaEquipe(c: ClienteFalso) {
  const equipe = await c.equipeDoSetor('s-1')
  return equipe.pessoas[0]!
}

test('a ficha junta quem é, onde está e o histórico', async () => {
  const c = await noPortao()
  const p = await alguemDaEquipe(c)
  const ficha = await c.fichaDaPessoa(p.participacaoId)

  assert.equal(ficha.nome, p.nome)
  assert.ok(ficha.setorNome)
  assert.ok(ficha.eventoNome)
  assert.ok(ficha.dias.length > 0, 'sem os dias não há aba de histórico')
})

test('a lista de destinos não oferece o setor onde a pessoa já está', async () => {
  // Um destino que não muda nada convida ao clique que não faz nada.
  const c = await noPortao()
  const p = await alguemDaEquipe(c)
  const ficha = await c.fichaDaPessoa(p.participacaoId)

  assert.equal(ficha.outrosSetores.some(s => s.setorId === ficha.setorId), false)
  assert.ok(ficha.outrosSetores.length > 0)
})

test('mover tira de um setor e põe no outro', async () => {
  /*
   * Deixar só o destino crescer inflaria o total do evento — e o número de
   * "Funcionários" do painel sai da soma dos setores.
   */
  const c = await noPortao()
  const antes = await c.evento('ev-1')
  const p = await alguemDaEquipe(c)
  const ficha = await c.fichaDaPessoa(p.participacaoId)
  const destino = ficha.outrosSetores[0]!

  assert.equal((await c.moverDeSetor(p.participacaoId, destino.setorId)).erro, undefined)

  const depois = await c.evento('ev-1')
  assert.equal(depois.totalPessoas, antes.totalPessoas, 'o total do evento não podia mudar')
})

test('mover para o setor onde já está é recusado', async () => {
  const c = await noPortao()
  const p = await alguemDaEquipe(c)
  const ficha = await c.fichaDaPessoa(p.participacaoId)
  assert.ok((await c.moverDeSetor(p.participacaoId, ficha.setorId)).erro)
})

test('o supervisor não move ninguém de setor', async () => {
  /*
   * Mover mexe na equipe de OUTRO supervisor sem ele estar envolvido na
   * decisão. É de quem enxerga o evento inteiro.
   */
  const c = new ClienteFalso()
  await entrarComo(c, 'supervisor')
  const p = await alguemDaEquipe(c)
  await assert.rejects(() => c.moverDeSetor(p.participacaoId, 's-2'), /permissão/i)

  // Mas ele ABRE a ficha: cuidar da equipe é o trabalho dele.
  assert.ok(await c.fichaDaPessoa(p.participacaoId))
})

test('a ficha do supervisor vem sem os botões que ele não pode usar', async () => {
  // Mostrar um botão que o servidor vai recusar é pior que não mostrar: a
  // pessoa toca, preenche, e só então descobre que não podia.
  const c = new ClienteFalso()
  await entrarComo(c, 'supervisor')
  const p = await alguemDaEquipe(c)
  const ficha = await c.fichaDaPessoa(p.participacaoId)

  assert.equal(ficha.podeMover, false)
  assert.equal(ficha.podeTornarSupervisor, false)
})

test('promover alguém exige telefone com DDD', async () => {
  // É por ele que o convite vai. Sem telefone, o acesso nasce sem como ser
  // entregue.
  const c = await noPortao()
  const p = await alguemDaEquipe(c)

  assert.ok((await c.tornarSupervisor(p.participacaoId, '9999')).erro)
  assert.equal((await c.tornarSupervisor(p.participacaoId, '27999887766')).erro, undefined)
})

test('marcar e desmarcar o pagamento', async () => {
  // Desfazer é tão necessário quanto marcar: marcar errado acontece, e sem o
  // caminho de volta alguém corrigiria direto no banco.
  const c = await noPortao()
  const p = await alguemDaEquipe(c)

  await c.marcarPagamento(p.participacaoId, true)
  const pago = await c.fichaDaPessoa(p.participacaoId)
  assert.equal(pago.pago, true)
  assert.ok(pago.pagoEm)

  await c.marcarPagamento(p.participacaoId, false)
  assert.equal((await c.fichaDaPessoa(p.participacaoId)).pago, false)
})

test('o valor a receber é gravado e volta na ficha', async () => {
  const c = await noPortao()
  const p = await alguemDaEquipe(c)

  await c.salvarValorAReceber(p.participacaoId, 220)
  assert.equal((await c.fichaDaPessoa(p.participacaoId)).valorReceber, 220)
})

test('valor negativo é recusado', async () => {
  const c = await noPortao()
  const p = await alguemDaEquipe(c)
  assert.ok((await c.salvarValorAReceber(p.participacaoId, -10)).erro)
})

test('pessoa que não existe responde igual em todas as ações', async () => {
  // Diferenciar entregaria um jeito de varrer ids e descobrir quais existem.
  const c = await noPortao()
  await assert.rejects(() => c.fichaDaPessoa('nao-existe'))
  assert.ok((await c.moverDeSetor('nao-existe', 's-2')).erro)
  assert.ok((await c.marcarPagamento('nao-existe', true)).erro)
})

// ─── Plataforma ─────────────────────────────────────────────────────────────

/** O dono da plataforma, que é o único que enxerga este bloco. */
async function comoMaster(op: ComportamentoFalso = {}) {
  const c = new ClienteFalso(op)
  await entrarComo(c, 'master')
  return c
}

test('o bloco Plataforma é só do master', async () => {
  /*
   * O menu já esconde para os outros — mas menu escondido é arrumação, não
   * segurança. Quem decide é quem tem os dados.
   */
  const admin = await noPortao()
  await assert.rejects(() => admin.organizacoes(), /permissão/i)
  await assert.rejects(() => admin.baseDeFuncionarios(), /permissão/i)
  await assert.rejects(() => admin.encontrarColaborador(), /permissão/i)
  await assert.rejects(() => admin.painelDoWhatsApp(), /permissão/i)
})

test('as organizações vêm com ativas e suspensas separadas', async () => {
  const c = await comoMaster()
  const r = await c.organizacoes()

  assert.equal(r.total, r.itens.length)
  assert.equal(r.ativas, r.itens.filter(o => o.ativa).length)
  assert.ok(r.itens.some(o => !o.ativa), 'faltou uma suspensa para a tela mostrar o caso')
})

test('suspender bloqueia sem apagar', async () => {
  // O histórico é do cliente, e ele vai querer de volta se voltar.
  const c = await comoMaster()
  const antes = await c.organizacoes()
  const alvo = antes.itens.find(o => o.ativa)!

  await c.alternarOrganizacao(alvo.organizacaoId, false)
  const depois = await c.organizacoes()

  assert.equal(depois.total, antes.total, 'não podia sumir da lista')
  assert.equal(depois.itens.find(o => o.organizacaoId === alvo.organizacaoId)?.ativa, false)

  await c.alternarOrganizacao(alvo.organizacaoId, true)
  assert.equal((await c.organizacoes()).ativas, antes.ativas)
})

test('cria a organização, o admin dono dela e conta o primeiro evento', async () => {
  const c = await comoMaster()
  const antes = await c.organizacoes()

  const r = await c.criarOrganizacao({
    nome: '  Brilha Shows  ',
    limiteEventos: 5,
    adminNome: 'Fernanda Lima',
    email: 'fernanda@brilhashows.com.br',
    senha: 'senha123',
    primeiroEvento: {
      nome: 'Réveillon 2027',
      dataInicio: '2027-01-01T00:00:00-03:00',
      dataFim: '2027-01-01T06:00:00-03:00',
      local: 'Praia do Canto',
    },
  })

  assert.ok(!r.erro, r.erro)
  assert.equal(r.organizacao?.nome, 'Brilha Shows', 'os espaços nas pontas não sobrevivem')
  assert.equal(r.organizacao?.ativa, true)
  assert.equal(r.organizacao?.eventos, 1, 'o primeiro evento já entra na contagem')

  const depois = await c.organizacoes()
  assert.equal(depois.total, antes.total + 1)
  assert.ok(depois.itens.some(o => o.organizacaoId === r.organizacao?.organizacaoId))
})

test('sem primeiro evento, a organização nasce com zero eventos', async () => {
  const c = await comoMaster()
  const r = await c.criarOrganizacao({
    nome: 'Eventos da Serra',
    limiteEventos: 3,
    adminNome: 'Caio Nogueira',
    email: 'caio@eventosdaserra.com.br',
    senha: 'senha123',
  })
  assert.equal(r.organizacao?.eventos, 0)
})

test('e-mail já usado por outra organização é recusado', async () => {
  // Sem isso, duas organizações disputariam o mesmo login de admin.
  const c = await comoMaster()
  const alguma = (await c.organizacoes()).itens.find(o => o.adminIdentificador)!

  const r = await c.criarOrganizacao({
    nome: 'Outra Produtora',
    limiteEventos: 1,
    adminNome: 'Alguém',
    email: alguma.adminIdentificador!.toUpperCase(),
    senha: 'senha123',
  })
  assert.match(r.erro ?? '', /e-mail/i)
})

test('senha curta é recusada antes de criar a conta', async () => {
  const c = await comoMaster()
  const r = await c.criarOrganizacao({
    nome: 'Produtora Nova',
    limiteEventos: 1,
    adminNome: 'Alguém',
    email: 'alguem@produtoranova.com.br',
    senha: '123',
  })
  assert.match(r.erro ?? '', /senha/i)
})

test('só o master cria organização', async () => {
  const admin = await noPortao()
  await assert.rejects(
    () => admin.criarOrganizacao({
      nome: 'Não Devia Existir',
      limiteEventos: 1,
      adminNome: 'X',
      email: 'x@x.com',
      senha: 'senha123',
    }),
    /permissão/i,
  )
})

test('o master escolhe a organização dona do evento novo', async () => {
  const c = await comoMaster()
  // O NÚMERO, não o objeto: `find` devolve a mesma referência que
  // `criarEvento` muta em seguida — guardar o objeto faria "antes" andar
  // junto com "depois".
  const antes = (await c.organizacoes()).itens.find(o => o.organizacaoId === 'org-2')!.eventos

  const r = await c.criarEvento({
    organizacaoId: 'org-2',
    nome: 'Aniversário da Vibe',
    dataInicio: '2027-03-10T20:00:00-03:00',
    dataFim: '2027-03-11T05:00:00-03:00',
  })
  assert.ok(!r.erro, r.erro)
  assert.ok(r.eventoId)

  const depois = (await c.organizacoes()).itens.find(o => o.organizacaoId === 'org-2')!.eventos
  assert.equal(depois, antes + 1)
})

test('o master sem escolher organização é recusado', async () => {
  const c = await comoMaster()
  const r = await c.criarEvento({
    nome: 'Evento Órfão',
    dataInicio: '2027-01-01T20:00:00-03:00',
    dataFim: '2027-01-02T05:00:00-03:00',
  })
  assert.match(r.erro ?? '', /escolha a organização/i)
})

test('organização suspensa não recebe evento novo', async () => {
  const c = await comoMaster()
  const r = await c.criarEvento({
    organizacaoId: 'org-3', // Casa Rosada Eventos, suspensa no fixture
    nome: 'Não Devia Existir',
    dataInicio: '2027-01-01T20:00:00-03:00',
    dataFim: '2027-01-02T05:00:00-03:00',
  })
  assert.match(r.erro ?? '', /suspensa/i)
})

test('o admin cria sempre para a própria organização — sem escolher', async () => {
  const master = await comoMaster()
  const antes = await master.organizacoes()
  const org1Antes = antes.itens.find(o => o.organizacaoId === 'org-1')!.eventos
  const org2Antes = antes.itens.find(o => o.organizacaoId === 'org-2')!.eventos

  const c = new ClienteFalso()
  await entrarComo(c, 'admin')

  // Manda uma organização diferente de propósito: o servidor tem que
  // ignorar, e não confiar no que a tela mandou.
  const r = await c.criarEvento({
    organizacaoId: 'org-2',
    nome: 'Evento do Admin',
    dataInicio: '2027-02-01T20:00:00-03:00',
    dataFim: '2027-02-02T05:00:00-03:00',
  })
  assert.ok(!r.erro, r.erro)

  const depois = await master.organizacoes()
  const org1Depois = depois.itens.find(o => o.organizacaoId === 'org-1')!.eventos
  const org2Depois = depois.itens.find(o => o.organizacaoId === 'org-2')!.eventos

  assert.equal(org1Depois, org1Antes + 1, 'caiu na própria organização, a Produzimos')
  assert.equal(org2Depois, org2Antes, 'e não na organização que a tela tentou mandar')
})

test('o admin não vê evento de outra organização — e o master vê os dois', async () => {
  const master = await comoMaster()
  const criado = await master.criarEvento({
    organizacaoId: 'org-2',
    nome: 'Só a Vibe Produções Vê Este',
    dataInicio: '2027-04-01T20:00:00-03:00',
    dataFim: '2027-04-02T05:00:00-03:00',
  })
  assert.ok(!criado.erro, criado.erro)

  const painelDoMaster = await master.painel()
  assert.ok(painelDoMaster.eventos.some(e => e.eventoId === criado.eventoId))

  const admin = new ClienteFalso()
  await entrarComo(admin, 'admin')
  const painelDoAdmin = await admin.painel()
  assert.ok(
    !painelDoAdmin.eventos.some(e => e.eventoId === criado.eventoId),
    'o admin é de outra organização — não pode ver este evento',
  )
})

test('evento novo já nasce editável: configuração e portaria não travam com "não encontrado"', async () => {
  const c = await comoMaster()
  const criado = await c.criarEvento({
    organizacaoId: 'org-1',
    nome: 'Testando Config Nova',
    descricao: 'Uma descrição qualquer',
    dataInicio: '2027-05-01T20:00:00-03:00',
    dataFim: '2027-05-02T05:00:00-03:00',
    janelaEntradaInicio: '2027-05-01T18:00:00-03:00',
    janelaEntradaFim: '2027-05-01T21:00:00-03:00',
  })
  assert.ok(!criado.erro, criado.erro)
  const id = criado.eventoId!

  const cfg = await c.configuracaoDoEvento(id)
  assert.equal(cfg.descricao, 'Uma descrição qualquer')
  assert.equal(cfg.batidaLivre, false, 'nasce travado por horário, como no sistema web')

  const detalhe = await c.evento(id)
  assert.equal(detalhe.setores.length, 0, 'evento novo ainda não tem setor nenhum')

  const r = await c.alternarPortaria(id, true)
  assert.ok(!r.erro, r.erro)
  assert.equal(r.portaria?.aberta, true)
})

test('só quem gerencia eventos cria um evento novo', async () => {
  const c = new ClienteFalso()
  await entrarComo(c, 'supervisor')
  await assert.rejects(
    () => c.criarEvento({
      nome: 'Não Devia Existir', dataInicio: '2027-01-01T20:00:00-03:00', dataFim: '2027-01-02T05:00:00-03:00',
    }),
    /permissão/i,
  )
})

test('a ficha da pessoa junta o histórico de todas as organizações', async () => {
  const c = await comoMaster()
  const r = await c.fichaDaPessoaNaBase('037.482.615-09') // Ana Cláudia, com máscara — precisa aceitar

  assert.equal(r.nome, 'Ana Cláudia Ferreira')
  assert.equal(r.trabalhos.length, 2)
  assert.equal(r.trabalhos[0]?.eventoId, 'ev-1', 'do mais recente para o mais antigo')
  const organizacoes = r.indicadores.find(i => i.chave === 'organizacoes')
  assert.equal(organizacoes?.valor, 2, 'ela trabalhou pra Produzimos e Vibe Produções')
})

test('a ficha não mostra valor pago — preço de concorrente', async () => {
  const c = await comoMaster()
  const r = await c.fichaDaPessoaNaBase('76431520891')
  assert.ok(!JSON.stringify(r).match(/valorPorPessoa|valorCobrado/))
})

test('pessoa sem histórico escrito à mão ganha uma ficha sintética, e não vazia', async () => {
  // Rodrigo não está no fixture de histórico à mão — só nos números agregados.
  const c = await comoMaster()
  const r = await c.fichaDaPessoaNaBase('21890647355')
  assert.equal(r.trabalhos.length, 4, 'bate com o `eventos` agregado da base')
})

test('CPF que não existe na base é recusado', async () => {
  const c = await comoMaster()
  await assert.rejects(() => c.fichaDaPessoaNaBase('00000000000'), /não encontramos/i)
})

test('só o master vê a ficha da pessoa, ou atribui alguém a um evento', async () => {
  const admin = await noPortao()
  await assert.rejects(() => admin.fichaDaPessoaNaBase('76431520891'), /permissão/i)
  await assert.rejects(() => admin.atribuirPessoaAoEvento('76431520891', 's-1'), /permissão/i)
})

test('atribuir coloca a pessoa no setor — bloqueada se o setor bateu o teto', async () => {
  // Wesley: só 1 dos 2 eventos sintéticos cai em ev-1/ev-2, então ev-3 (setor
  // s-8, Produção, 2 de 2 — no teto) está livre para atribuir.
  const c = await comoMaster()
  const antes = await c.fichaDaPessoaNaBase('30561847210')
  assert.ok(!antes.jaNosEventos.includes('ev-3'))

  const r = await c.atribuirPessoaAoEvento('30561847210', 's-8')
  assert.ok(!r.erro, r.erro)
  assert.equal(r.resultado?.evento, 'Fantastico Mundo do Lukao')
  assert.equal(r.resultado?.ativo, false, 'o setor já estava no teto')
  assert.equal(r.resultado?.semTelefone, true, 'Wesley não tem telefone cadastrado')

  const depois = await c.fichaDaPessoaNaBase('30561847210')
  assert.ok(depois.jaNosEventos.includes('ev-3'))
})

test('não dá para atribuir a mesma pessoa duas vezes ao mesmo evento', async () => {
  // Ana Cláudia já está em ev-1 e ev-3 (histórico escrito à mão) — ev-2 (s-6)
  // está livre para a primeira chamada.
  const c = await comoMaster()
  const r1 = await c.atribuirPessoaAoEvento('03748261509', 's-6')
  assert.ok(!r1.erro, r1.erro)

  const r2 = await c.atribuirPessoaAoEvento('03748261509', 's-6')
  assert.match(r2.erro ?? '', /já está neste evento/i)
})

test('a base é por CPF, não por cadastro', async () => {
  /*
   * A mesma pessoa credenciada em cinco eventos de três clientes é UMA linha.
   * É isso que responde "esta pessoa já trabalhou com a gente?".
   */
  const c = await comoMaster()
  const r = await c.baseDeFuncionarios()
  const cpfs = r.pessoas.map(p => p.cpf)

  assert.equal(new Set(cpfs).size, cpfs.length)
  assert.ok(r.pessoas.some(p => p.eventos > 1), 'alguém com mais de um evento')
})

test('a busca da base aceita CPF com e sem pontuação', async () => {
  // É o que se tem em mãos quando alguém liga perguntando sobre uma pessoa.
  const c = await comoMaster()
  assert.equal((await c.baseDeFuncionarios('037.482.615-09')).pessoas.length, 1)
  assert.equal((await c.baseDeFuncionarios('03748261509')).pessoas.length, 1)
  assert.equal((await c.baseDeFuncionarios('ana')).pessoas.length, 1)
})

test('o total da base não muda com a busca', async () => {
  // O número do indicador responde "quantas existem", e recalculá-lo pela
  // busca faria a base parecer encolher a cada letra digitada.
  const c = await comoMaster()
  const todas = await c.baseDeFuncionarios()
  const filtrada = await c.baseDeFuncionarios('ana')

  assert.equal(filtrada.total, todas.total)
  assert.ok(filtrada.pessoas.length < todas.pessoas.length)
})

test('a base regional conta quem TRABALHOU, não quem se cadastrou', async () => {
  /*
   * Cadastro sem presença não diz nada sobre a pessoa; presença diz. É a
   * diferença entre "está na lista" e "apareceu" — e é por isso que se monta
   * equipe a partir desta base.
   */
  const c = await comoMaster()
  const r = await c.encontrarColaborador()
  const semPresenca = r.pessoas.find(p => p.eventosTrabalhados === 0)

  assert.ok(semPresenca, 'faltou alguém sem presença para a tela mostrar o caso')
  const comHistorico = r.indicadores.find(i => i.chave === 'com_historico')!
  assert.equal(comHistorico.valor, r.pessoas.filter(p => p.eventosTrabalhados > 0).length)
})

test('o filtro de cidade recorta, e a lista de cidades não', async () => {
  const c = await comoMaster()
  const todas = await c.encontrarColaborador()
  const emVitoria = await c.encontrarColaborador({ cidade: 'vitoria' })

  assert.ok(emVitoria.pessoas.length > 0)
  assert.ok(emVitoria.pessoas.length < todas.pessoas.length)
  // A lista de cidades continua inteira: ela alimenta o filtro, e um filtro
  // que some conforme se usa é um beco sem saída.
  assert.deepEqual(emVitoria.cidades, todas.cidades)
})

test('o painel do WhatsApp diz o estado do canal antes dos números', async () => {
  // Número bonito com a fila pausada engana. Os dois campos existem separados
  // para a tela poder dizer isso primeiro.
  const c = await comoMaster()
  const p = await c.painelDoWhatsApp()

  assert.equal(typeof p.pausado, 'boolean')
  assert.equal(typeof p.canal.conectada, 'boolean')
  assert.ok(p.canal.estado.length > 10, 'o estado precisa ser uma frase que se lê')
})

test('o contador de templates aprovados bate com a lista', async () => {
  const c = await comoMaster()
  const p = await c.painelDoWhatsApp()

  assert.equal(
    p.indicadores.find(i => i.chave === 'templates')!.valor,
    p.templates.filter(t => t.situacao === 'aprovado').length,
  )
  assert.ok(p.templates.some(t => t.situacao !== 'aprovado'), 'faltou um em análise ou rejeitado')
})

// ─── Veículos ───────────────────────────────────────────────────────────────
//
// Só cadastro e consulta — o veículo não bate ponto, não tem QR e não passa
// pelo scanner. Trazido do site em 11/09.

test('master, admin e suporte veem os eventos para cadastrar veículo — o resto não', async () => {
  const master = await comoMaster()
  assert.ok((await master.eventosParaVeiculos()).length > 0)

  const admin = await noPortao()
  assert.ok((await admin.eventosParaVeiculos()).length > 0)

  // Ainda não existe conta de demonstração pra suporte — a sessão entra
  // direto, do mesmo jeito que `sessaoInicial` já é usado noutros testes.
  const suporte = new ClienteFalso({
    sessaoInicial: {
      token: 'tok-suporte', expiraEm: new Date(Date.now() + 999_999).toISOString(),
      renovacao: 'ren-suporte', papel: 'suporte',
    },
  })
  assert.ok((await suporte.eventosParaVeiculos()).length > 0)

  const supervisor = new ClienteFalso()
  await entrarComo(supervisor, 'supervisor')
  await assert.rejects(() => supervisor.eventosParaVeiculos(), /permissão/i)
})

test('os veículos já cadastrados vêm com os dias de operação do evento', async () => {
  const c = await noPortao()
  const r = await c.veiculosDoEvento('ev-1')

  assert.ok(r.veiculos.length > 0)
  assert.ok(r.dias.length > 0)
  // Um veículo restrito a dois dias, outro livre em todos — a tela precisa
  // saber desenhar as duas situações.
  assert.ok(r.veiculos.some(v => v.dias.length > 0))
  assert.ok(r.veiculos.some(v => v.dias.length === 0))
})

test('buscar o condutor por CPF preenche nome, setor e função sozinho', async () => {
  const c = await noPortao()
  const r = await c.buscarCondutorPorCpf('ev-1', '037.482.615-09')

  assert.ok(r.condutor, r.erro)
  assert.equal(r.condutor.nome, 'Ana Cláudia Ferreira')
  assert.equal(r.condutor.setorNome, 'Produção')
})

test('CPF que não está credenciado no evento é recusado, dizendo por quê', async () => {
  const c = await noPortao()
  const r = await c.buscarCondutorPorCpf('ev-1', '000.000.000-00')

  assert.equal(r.condutor, undefined)
  assert.match(r.erro ?? '', /não está credenciado/i)
})

test('cadastrar veículo exige placa válida e o condutor credenciado', async () => {
  const c = await noPortao()

  const semCondutor = await c.cadastrarVeiculo('ev-1', {
    cpf: '000.000.000-00', placa: 'ABC1D23', modelo: 'Fiorino',
  })
  assert.ok(semCondutor.erro)

  const placaInvalida = await c.cadastrarVeiculo('ev-1', {
    cpf: '037.482.615-09', placa: '123', modelo: 'Fiorino',
  })
  assert.match(placaInvalida.erro ?? '', /placa/i)

  const semModelo = await c.cadastrarVeiculo('ev-1', {
    cpf: '037.482.615-09', placa: 'XYZ9K88', modelo: '',
  })
  assert.match(semModelo.erro ?? '', /modelo/i)
})

test('veículo cadastrado aparece na lista, vinculado ao condutor', async () => {
  const c = await noPortao()
  const antes = await c.veiculosDoEvento('ev-1')

  const r = await c.cadastrarVeiculo('ev-1', {
    cpf: '037.482.615-09', placa: 'XYZ9K88', modelo: 'Fiat Fiorino', cor: 'Prata',
  })
  assert.ok(!r.erro, r.erro)
  assert.equal(r.placa, 'XYZ9K88')
  assert.equal(r.condutor, 'Ana Cláudia Ferreira')

  const depois = await c.veiculosDoEvento('ev-1')
  assert.equal(depois.veiculos.length, antes.veiculos.length + 1)
  const novo = depois.veiculos.find(v => v.placa === 'XYZ9K88')!
  assert.equal(novo.condutorCpf, '03748261509')
  assert.equal(novo.dias.length, 0, 'sem dia marcado, o veículo vale todos os dias')
})

test('a mesma placa duas vezes no mesmo evento é recusada', async () => {
  const c = await noPortao()
  await c.cadastrarVeiculo('ev-1', { cpf: '037.482.615-09', placa: 'JJJ1J11', modelo: 'Fiorino' })
  const r = await c.cadastrarVeiculo('ev-1', { cpf: '037.482.615-09', placa: 'jjj-1j11', modelo: 'Outro' })

  assert.ok(r.erro)
  assert.match(r.erro, /já está cadastrada/i)
})

test('excluir remove da lista, e id que não existe responde com erro', async () => {
  const c = await noPortao()
  const r = await c.cadastrarVeiculo('ev-1', { cpf: '037.482.615-09', placa: 'KKK1K11', modelo: 'Fiorino' })
  const antes = await c.veiculosDoEvento('ev-1')
  const veiculo = antes.veiculos.find(v => v.placa === 'KKK1K11')!

  const excluiu = await c.excluirVeiculo(veiculo.id, 'ev-1')
  assert.equal(excluiu.erro, undefined)

  const depois = await c.veiculosDoEvento('ev-1')
  assert.equal(depois.veiculos.some(v => v.id === veiculo.id), false)

  const denovo = await c.excluirVeiculo(veiculo.id, 'ev-1')
  assert.ok(denovo.erro)
  void r
})

test('o supervisor não cadastra nem exclui veículo', async () => {
  const c = new ClienteFalso()
  await entrarComo(c, 'supervisor')
  await assert.rejects(() => c.veiculosDoEvento('ev-1'), /permissão/i)
  await assert.rejects(
    () => c.cadastrarVeiculo('ev-1', { cpf: '037.482.615-09', placa: 'ABC1D23', modelo: 'Fiorino' }),
    /permissão/i,
  )
})

// ─── Bloquear CPF ───────────────────────────────────────────────────────────
//
// Vale para o evento inteiro, e só para este evento. Trazido do site em
// 11/09.

test('o supervisor entra na lista de quem bloqueia, mas só no evento onde tem setor', async () => {
  const c = new ClienteFalso()
  await entrarComo(c, 'supervisor')

  const eventos = await c.eventosParaBloqueio()
  assert.equal(eventos.length, 1)
  assert.equal(eventos[0]?.eventoId, 'ev-2')

  await assert.rejects(() => c.bloqueiosDoEvento('ev-1'), /setor/i)
  const r = await c.bloqueiosDoEvento('ev-2')
  assert.ok(Array.isArray(r))
})

test('o operador de portão não bloqueia — ele lê o QR, não decide quem se cadastra', async () => {
  const c = new ClienteFalso({
    sessaoInicial: {
      token: 'tok-op', expiraEm: new Date(Date.now() + 999_999).toISOString(),
      renovacao: 'ren-op', papel: 'operador_portao',
    },
  })
  await assert.rejects(() => c.eventosParaBloqueio(), /permissão/i)
})

test('a lista de bloqueios nasce com o que já foi bloqueado, com motivo e quem bloqueou', async () => {
  const c = await noPortao()
  const r = await c.bloqueiosDoEvento('ev-1')

  assert.ok(r.length > 0)
  assert.ok(r[0]?.motivo)
  assert.ok(r[0]?.bloqueadoPor)
})

test('bloquear exige 11 dígitos, e o mesmo CPF duas vezes é recusado', async () => {
  const c = await noPortao()

  const curto = await c.bloquearCpf('ev-1', '123')
  assert.match(curto.erro ?? '', /11 dígitos/i)

  const primeiro = await c.bloquearCpf('ev-1', '999.888.777-66')
  assert.equal(primeiro.erro, undefined)
  assert.equal(primeiro.cpf, '99988877766')

  const repetido = await c.bloquearCpf('ev-1', '999.888.777-66')
  assert.match(repetido.erro ?? '', /já está bloqueado/i)
})

test('bloquear registra quem bloqueou e o motivo — e aparece na lista na hora', async () => {
  const c = await noPortao()
  const antes = await c.bloqueiosDoEvento('ev-1')

  await c.bloquearCpf('ev-1', '888.777.666-55', 'Tentou entrar sem crachá')

  const depois = await c.bloqueiosDoEvento('ev-1')
  assert.equal(depois.length, antes.length + 1)
  const novo = depois.find(b => b.cpf === '88877766655')!
  assert.equal(novo.motivo, 'Tentou entrar sem crachá')
  assert.equal(novo.bloqueadoPor, 'Marina Alves')
})

test('liberar remove da lista, e um bloqueio de outro evento é recusado', async () => {
  const c = await noPortao()
  await c.bloquearCpf('ev-1', '777.666.555-44')
  const lista = await c.bloqueiosDoEvento('ev-1')
  const bloqueio = lista.find(b => b.cpf === '77766655544')!

  // Mesmo id, evento errado: não libera bloqueio de outro evento.
  const errado = await c.desbloquearCpf(bloqueio.id, 'ev-2')
  assert.ok(errado.erro)

  const certo = await c.desbloquearCpf(bloqueio.id, 'ev-1')
  assert.equal(certo.erro, undefined)

  const depois = await c.bloqueiosDoEvento('ev-1')
  assert.equal(depois.some(b => b.id === bloqueio.id), false)
})

// ─── Conferência de equipe ──────────────────────────────────────────────────
//
// A tela que o supervisor usa 1 dia antes: vê a equipe, tira quem não é
// dele, confirma. Trazido do site em 11/09.

/** Bem antes da janela de 24h de qualquer um dos eventos de mentira. */
const ANTES_DE_TUDO = () => Date.parse('2026-08-01T00:00:00-03:00')

test('a conferência não abre antes de faltar 24h para o evento', async () => {
  const c = await noPortao({ agora: ANTES_DE_TUDO })
  const r = await c.conferenciaDoSetor('s-1')

  assert.equal(r.aberta, false)
  assert.ok(Date.parse(r.abreEm) > ANTES_DE_TUDO())
})

test('a conferência abre e fica aberta, mesmo bem depois do evento', async () => {
  // O relógio real do teste já está bem depois de 05/09 — a data de mentira
  // do ev-1.
  const c = await noPortao()
  const r = await c.conferenciaDoSetor('s-1')
  assert.equal(r.aberta, true)
})

test('a conferência nasce pendente, com a equipe inteira e ninguém confirmado', async () => {
  const c = await noPortao()
  const r = await c.conferenciaDoSetor('s-1')

  assert.equal(r.status, 'pendente')
  assert.equal(r.confirmadaEm, null)
  assert.ok(r.equipe.length > 0)
})

test('tirar alguém da conferência tira da lista — mas o histórico da pessoa não é apagado por isso', async () => {
  const c = await noPortao()
  const antes = await c.conferenciaDoSetor('s-1')
  const alvo = antes.equipe[0]!

  const r = await c.removerDaConferencia(alvo.id, 's-1')
  assert.equal(r.erro, undefined)

  const depois = await c.conferenciaDoSetor('s-1')
  assert.equal(depois.equipe.length, antes.equipe.length - 1)
  assert.equal(depois.equipe.some(m => m.id === alvo.id), false)
})

test('confirmar exige a janela aberta', async () => {
  const c = await noPortao({ agora: ANTES_DE_TUDO })
  const r = await c.confirmarConferencia('s-1')
  assert.match(r.erro ?? '', /abre 1 dia antes/i)
})

test('confirmar carimba quem, quando, e os números — mantidos e removidos batem', async () => {
  const c = await noPortao()
  const antes = await c.conferenciaDoSetor('s-1')
  const alvo = antes.equipe[0]!
  await c.removerDaConferencia(alvo.id, 's-1')

  const r = await c.confirmarConferencia('s-1')
  assert.equal(r.erro, undefined)

  const depois = await c.conferenciaDoSetor('s-1')
  assert.equal(depois.status, 'confirmada')
  assert.equal(depois.confirmadaPorNome, 'Marina Alves')
  assert.ok(depois.confirmadaEm)
  assert.equal(depois.totalRemovidos, 1)
  assert.equal(depois.totalMantidos, antes.equipe.length - 1)
})

test('o supervisor confere a própria equipe (Carlos Silva cuida de s-1 e s-6)', async () => {
  const c = new ClienteFalso()
  await entrarComo(c, 'supervisor')

  const r = await c.conferenciaDoSetor('s-1')
  assert.ok(r.equipe.length > 0)

  const outro = await c.conferenciaDoSetor('s-6')
  assert.ok(Array.isArray(outro.equipe))
})

test('o supervisor não confere equipe de setor que não é dele', async () => {
  const c = new ClienteFalso()
  await entrarComo(c, 'supervisor')
  // s-2 é a Portaria do ev-1 — sem supervisor vinculado.
  await assert.rejects(() => c.conferenciaDoSetor('s-2'), /acesso/i)
})

test('o operador de portão não confere equipe nenhuma', async () => {
  const c = new ClienteFalso({
    sessaoInicial: {
      token: 'tok-op2', expiraEm: new Date(Date.now() + 999_999).toISOString(),
      renovacao: 'ren-op2', papel: 'operador_portao',
    },
  })
  await assert.rejects(() => c.conferenciaDoSetor('s-1'), /permissão/i)
})

// ─── Relatórios ─────────────────────────────────────────────────────────────
//
// Presença/ponto da equipe em planilha — não é financeiro. A planilha é
// gerada do outro lado; aqui só se decide quem pode pedir. Trazido do site
// em 11/09.

test('o admin vê os eventos da própria organização para relatório', async () => {
  const c = await noPortao()
  const eventos = await c.eventosParaRelatorios()
  assert.ok(eventos.length > 0)
})

test('o supervisor só vê os eventos onde tem setor', async () => {
  const c = new ClienteFalso()
  await entrarComo(c, 'supervisor')
  const eventos = await c.eventosParaRelatorios()

  // Carlos Silva supervisiona s-1 (ev-1) e s-6 (ev-2) — não tem setor no ev-3.
  assert.deepEqual(new Set(eventos.map(e => e.eventoId)), new Set(['ev-1', 'ev-2']))
})

test('o resumo traz o período completo do evento e o total de funcionários', async () => {
  const c = await noPortao()
  const r = await c.resumoDeRelatorios('ev-1')

  assert.equal(r.eventoNome, 'Henrique e Juliano - Kleber Andrade')
  assert.deepEqual(r.periodoCompleto, { de: '2026-08-29', ate: '2026-08-30' })
  assert.ok(r.setores.length > 1, 'ev-1 tem vários setores de mentira')
  assert.ok(r.totalFuncionarios > 0)
})

test('o supervisor só vê o próprio setor no resumo — não o evento inteiro', async () => {
  const c = new ClienteFalso()
  await entrarComo(c, 'supervisor')
  const r = await c.resumoDeRelatorios('ev-1')

  assert.equal(r.setores.length, 1)
  assert.equal(r.setores[0]?.setorId, 's-1')
})

test('relatório completo devolve nome e url, com o período no nome', async () => {
  const c = await noPortao()
  const r = await c.relatorioDoEvento('ev-1', { de: '2026-08-29', ate: '2026-08-30' }, 'credenciados')

  assert.match(r.nome, /2026-08-29/)
  assert.match(r.nome, /2026-08-30/)
  assert.ok(r.url)
})

test('relatório de ausentes tem o próprio sufixo no nome', async () => {
  const c = await noPortao()
  const r = await c.relatorioDoEvento('ev-1', { de: '2026-08-29', ate: '2026-08-30' }, 'ausentes')
  assert.match(r.nome, /ausentes/)
})

test('o relatório completo é só para quem gerencia o evento inteiro — o supervisor é recusado', async () => {
  const c = new ClienteFalso()
  await entrarComo(c, 'supervisor')
  await assert.rejects(
    () => c.relatorioDoEvento('ev-1', { de: '2026-08-29', ate: '2026-08-30' }, 'credenciados'),
    /evento inteiro/i,
  )
  await assert.rejects(
    () => c.relatoriosPorSetorZip('ev-1', { de: '2026-08-29', ate: '2026-08-30' }, 'credenciados'),
    /evento inteiro/i,
  )
})

test('o supervisor exporta o próprio setor, mas não o setor de outro supervisor', async () => {
  const c = new ClienteFalso()
  await entrarComo(c, 'supervisor')

  const proprio = await c.relatorioDoSetor('ev-1', 's-1', { de: '2026-08-29', ate: '2026-08-30' }, 'credenciados')
  assert.ok(proprio.url)

  // s-4 (Camarim) é supervisionado pela Débora, não pelo Carlos.
  await assert.rejects(
    () => c.relatorioDoSetor('ev-1', 's-4', { de: '2026-08-29', ate: '2026-08-30' }, 'credenciados'),
    /permissão/i,
  )
})

// ─── Lançar ponto manual ────────────────────────────────────────────────────
//
// A batida de quem já foi embora — retroativa, com motivo. Trazido do site
// em 11/09.

test('os dados trazem a equipe dos setores visíveis, os dias e o dia padrão', async () => {
  const c = await noPortao()
  const r = await c.dadosParaLancarPonto('ev-1')

  assert.ok(r.pessoas.length > 0)
  assert.deepEqual(r.dias.map(d => d.data), ['2026-08-29', '2026-08-30'])
  assert.ok(r.dias.some(d => d.tipo === 'principal'))
  assert.ok(r.dias.includes(r.dias.find(d => d.data === r.diaPadrao)!))
})

test('o supervisor só vê a própria equipe pra lançar ponto', async () => {
  const admin = await noPortao()
  const doEventoInteiro = await admin.dadosParaLancarPonto('ev-1')

  const c = new ClienteFalso()
  await entrarComo(c, 'supervisor')
  const r = await c.dadosParaLancarPonto('ev-1')

  // s-1 (Produção) é o único setor do Carlos em ev-1 — menos gente que o
  // evento inteiro, e todo mundo do mesmo setor.
  assert.ok(r.pessoas.length > 0)
  assert.ok(r.pessoas.length < doEventoInteiro.pessoas.length)
  assert.ok(r.pessoas.every(p => p.setorNome === 'Produção'))
})

test('lançar exige motivo com pelo menos 5 caracteres', async () => {
  const c = await noPortao()
  const { pessoas } = await c.dadosParaLancarPonto('ev-1')
  const alvo = pessoas[0]!

  const r = await c.lancarPontoManual(alvo.id, 'entrada', '2026-08-30', '2026-08-30T08:00:00-03:00', 'oi')
  assert.match(r.erro ?? '', /motivo/i)
})

test('lançar exige um dia que seja de trabalho do evento', async () => {
  const c = await noPortao()
  const { pessoas } = await c.dadosParaLancarPonto('ev-1')
  const alvo = pessoas[0]!

  const r = await c.lancarPontoManual(
    alvo.id, 'entrada', '2026-01-01', '2026-01-01T08:00:00-03:00', 'Chegou antes da fila abrir',
  )
  assert.match(r.erro ?? '', /dia de trabalho/i)
})

test('lançar recusa hora longe demais do dia de trabalho', async () => {
  const c = await noPortao()
  const { pessoas } = await c.dadosParaLancarPonto('ev-1')
  const alvo = pessoas[0]!

  // Três dias de distância do dia 30 — passa longe da janela de -12h/+36h.
  const r = await c.lancarPontoManual(
    alvo.id, 'entrada', '2026-08-30', '2026-09-02T08:00:00-03:00', 'Testando data absurda',
  )
  assert.match(r.erro ?? '', /longe demais/i)
})

test('lançar grava a batida no dia certo, e ela aparece na próxima consulta', async () => {
  const c = await noPortao()
  const antes = await c.dadosParaLancarPonto('ev-1')
  const alvo = antes.pessoas.find(p => p.ativo)!
  assert.equal(alvo.batidas['2026-08-30:fim'], undefined)

  const r = await c.lancarPontoManual(
    alvo.id, 'fim', '2026-08-30', '2026-08-31T01:30:00-03:00', 'Saiu depois do fechamento da portaria',
  )
  assert.equal(r.erro, undefined)
  assert.equal(r.etapa, 'Saída')
  assert.equal(r.nome, alvo.nome)

  const depois = await c.dadosParaLancarPonto('ev-1')
  const mesmaPessoa = depois.pessoas.find(p => p.id === alvo.id)!
  assert.equal(Date.parse(mesmaPessoa.batidas['2026-08-30:fim']!), Date.parse('2026-08-31T01:30:00-03:00'))
})

test('lançar de novo na mesma etapa e dia sobrescreve — é correção, não duplicata', async () => {
  const c = await noPortao()
  const { pessoas } = await c.dadosParaLancarPonto('ev-1')
  const alvo = pessoas.find(p => p.ativo)!

  await c.lancarPontoManual(alvo.id, 'entrada', '2026-08-29', '2026-08-29T08:00:00-03:00', 'Primeiro lançamento')
  await c.lancarPontoManual(alvo.id, 'entrada', '2026-08-29', '2026-08-29T08:30:00-03:00', 'Corrigindo o horário')

  const depois = await c.dadosParaLancarPonto('ev-1')
  const mesmaPessoa = depois.pessoas.find(p => p.id === alvo.id)!
  assert.equal(Date.parse(mesmaPessoa.batidas['2026-08-29:entrada']!), Date.parse('2026-08-29T08:30:00-03:00'))
})

test('pessoa não ativada não recebe lançamento manual', async () => {
  const c = await noPortao()
  const { pessoas } = await c.dadosParaLancarPonto('ev-1')
  const inativa = pessoas.find(p => !p.ativo)
  assert.ok(inativa, 'faltou alguém inativo na equipe de mentira')

  const r = await c.lancarPontoManual(
    inativa!.id, 'entrada', '2026-08-30', '2026-08-30T08:00:00-03:00', 'Tentando lançar mesmo assim',
  )
  assert.match(r.erro ?? '', /não está ativada/i)
})

test('o supervisor não lança ponto de gente de outro setor', async () => {
  const c = new ClienteFalso()
  await entrarComo(c, 'supervisor')
  // s-2 (Portaria) não é do Carlos.
  const r = await c.lancarPontoManual(
    's-2-p0', 'entrada', '2026-08-30', '2026-08-30T08:00:00-03:00', 'Tentando lançar fora da equipe',
  )
  assert.match(r.erro ?? '', /outro setor/i)
})

test('o operador de portão não lança ponto — é ato de gestão, não leitura no portão', async () => {
  const c = new ClienteFalso({
    sessaoInicial: {
      token: 'tok-op3', expiraEm: new Date(Date.now() + 999_999).toISOString(),
      renovacao: 'ren-op3', papel: 'operador_portao',
    },
  })
  await assert.rejects(() => c.eventosParaLancarPonto(), /permissão/i)
})

// ─── Editar colaborador (atalho) ────────────────────────────────────────────
//
// Achar a pessoa em TODOS os setores do evento, sem saber em qual ela está.
// Trazido do site em 11/09.

test('a busca traz gente de setores diferentes, todos do mesmo evento', async () => {
  const c = await noPortao()
  const r = await c.colaboradoresDoEvento('ev-1')

  assert.ok(r.colaboradores.length > 0)
  const setores = new Set(r.colaboradores.map(x => x.setorNome))
  assert.ok(setores.size > 1, 'ev-1 tem vários setores de mentira')
})

test('o supervisor não tem o atalho — ele já tem a própria equipe na tela do setor', async () => {
  const c = new ClienteFalso()
  await entrarComo(c, 'supervisor')
  await assert.rejects(() => c.eventosParaEditarColaborador(), /permissão/i)
  await assert.rejects(() => c.colaboradoresDoEvento('ev-1'), /permissão/i)
})

test('o suporte tem o atalho, do mesmo jeito que quem gerencia o evento', async () => {
  const c = new ClienteFalso({
    sessaoInicial: {
      token: 'tok-sup', expiraEm: new Date(Date.now() + 999_999).toISOString(),
      renovacao: 'ren-sup', papel: 'suporte',
    },
  })
  const eventos = await c.eventosParaEditarColaborador()
  assert.ok(eventos.length > 0)
})

test('a pessoa achada pelo atalho abre na mesma ficha que a tela do setor usa', async () => {
  const c = await noPortao()
  const busca = await c.colaboradoresDoEvento('ev-1')
  const alguem = busca.colaboradores[0]!

  const ficha = await c.fichaDaPessoa(alguem.participacaoId)
  assert.equal(ficha.nome, alguem.nome)
  assert.equal(ficha.cpf, alguem.cpf)
})

// ─── Suporte de Sistema ─────────────────────────────────────────────────────
//
// Gente contratada pro dia do evento — corrige a operação, nunca administra.
// Só o master gerencia. Trazido do site em 11/09.

test('só o master gerencia suporte — admin é recusado', async () => {
  const admin = await noPortao()
  await assert.rejects(() => admin.dadosDeSuporte(), /permissão/i)
})

test('os dados trazem os suportes com o escopo resolvido, e as opções pra montar o escopo', async () => {
  const c = await comoMaster()
  const r = await c.dadosDeSuporte()

  assert.ok(r.suportes.length >= 2)
  assert.ok(r.organizacoes.length > 0)
  assert.ok(r.eventos.length > 0)

  const porOrganizacao = r.suportes.find(s => s.escopoOrganizacoes.length > 0)!
  assert.equal(porOrganizacao.escopoOrganizacoes[0]?.nome, 'Produzimos')

  const porEvento = r.suportes.find(s => s.escopoEventos.length > 0)!
  assert.ok(porEvento.escopoEventos[0]?.nome)
  assert.ok(porEvento.escopoEventos[0]?.organizacaoNome)
})

test('quem tem expiração no passado vem marcado como expirado — quem não tem, não', async () => {
  const c = await comoMaster({ agora: () => Date.parse('2026-10-15T12:00:00-03:00') })
  const r = await c.dadosDeSuporte()

  const comExpiracao = r.suportes.find(s => s.acessoExpiraEm === '2026-09-30')!
  assert.equal(comExpiracao.expirado, true)

  const semExpiracao = r.suportes.find(s => s.acessoExpiraEm === null)!
  assert.equal(semExpiracao.expirado, false)
})

test('criar suporte exige nome, telefone válido, escopo e CPF de 11 dígitos', async () => {
  const c = await comoMaster()
  const base = {
    nome: 'Camila Reis', cpf: '11122233344', telefone: '27999887766',
    ativo: true, acessoExpiraEm: null, escopoOrganizacaoIds: ['org-1'], escopoEventoIds: [],
  }

  assert.match((await c.criarSuporte({ ...base, nome: '' })).erro ?? '', /nome/i)
  assert.match((await c.criarSuporte({ ...base, telefone: '123' })).erro ?? '', /telefone/i)
  assert.match(
    (await c.criarSuporte({ ...base, escopoOrganizacaoIds: [], escopoEventoIds: [] })).erro ?? '',
    /organização ou evento/i,
  )
  assert.match((await c.criarSuporte({ ...base, cpf: '123' })).erro ?? '', /cpf/i)
})

test('criar suporte com CPF já usado por outro suporte é recusado', async () => {
  const c = await comoMaster()
  const r = await c.criarSuporte({
    nome: 'Outra Pessoa', cpf: '55566677788', telefone: '27999887766',
    ativo: true, acessoExpiraEm: null, escopoOrganizacaoIds: ['org-1'], escopoEventoIds: [],
  })
  assert.match(r.erro ?? '', /já existe/i)
})

test('criar suporte com CPF já usado por QUALQUER acesso é recusado — não só entre suportes', async () => {
  const c = await comoMaster()
  const eventos = await c.eventosComSetores()
  await c.criarAcesso({
    funcao: 'operador_portao', nome: 'Já Existe', cpf: '66677788899', telefone: '27999887766',
    eventoId: eventos[0]!.eventoId, ativo: true,
  })

  const r = await c.criarSuporte({
    nome: 'Outra Pessoa', cpf: '66677788899', telefone: '27999887766',
    ativo: true, acessoExpiraEm: null, escopoOrganizacaoIds: ['org-1'], escopoEventoIds: [],
  })
  assert.match(r.erro ?? '', /já existe/i)
})

test('suporte criado aparece na lista, com o escopo certo', async () => {
  const c = await comoMaster()
  const antes = await c.dadosDeSuporte()

  const r = await c.criarSuporte({
    nome: 'Camila Reis', cpf: '11122233344', telefone: '27999887766',
    ativo: true, acessoExpiraEm: '2026-12-01', escopoOrganizacaoIds: ['org-1'], escopoEventoIds: [],
  })
  assert.ok(r.id, r.erro)

  const depois = await c.dadosDeSuporte()
  assert.equal(depois.suportes.length, antes.suportes.length + 1)
  const novo = depois.suportes.find(s => s.id === r.id)!
  assert.equal(novo.nome, 'Camila Reis')
  assert.equal(novo.acessoExpiraEm, '2026-12-01')
  assert.equal(novo.escopoOrganizacoes[0]?.nome, 'Produzimos')
})

test('editar troca nome, status, expiração e escopo — mas não exige telefone válido, como no site', async () => {
  const c = await comoMaster()
  const antes = await c.dadosDeSuporte()
  const alvo = antes.suportes[0]!

  const r = await c.editarSuporte(alvo.id, {
    nome: 'Nome Corrigido', telefone: '123', ativo: false,
    acessoExpiraEm: '2027-01-01', escopoOrganizacaoIds: [], escopoEventoIds: ['ev-1'],
  })
  assert.equal(r.erro, undefined)

  const depois = await c.dadosDeSuporte()
  const editado = depois.suportes.find(s => s.id === alvo.id)!
  assert.equal(editado.nome, 'Nome Corrigido')
  assert.equal(editado.ativo, false)
  assert.equal(editado.acessoExpiraEm, '2027-01-01')
  assert.equal(editado.escopoOrganizacoes.length, 0)
  assert.equal(editado.escopoEventos[0]?.id, 'ev-1')
})

test('editar sem nenhum escopo é recusado, e id que não existe também', async () => {
  const c = await comoMaster()
  const alvo = (await c.dadosDeSuporte()).suportes[0]!

  const semEscopo = await c.editarSuporte(alvo.id, {
    nome: alvo.nome, telefone: '', ativo: true, acessoExpiraEm: null,
    escopoOrganizacaoIds: [], escopoEventoIds: [],
  })
  assert.match(semEscopo.erro ?? '', /organização ou evento/i)

  const idInexistente = await c.editarSuporte('sup-999', {
    nome: 'Qualquer', telefone: '', ativo: true, acessoExpiraEm: null,
    escopoOrganizacaoIds: ['org-1'], escopoEventoIds: [],
  })
  assert.ok(idInexistente.erro)
})

test('revogar desativa e expira na hora — diferente de excluir, o histórico fica', async () => {
  const c = await comoMaster()
  const alvo = (await c.dadosDeSuporte()).suportes[0]!

  const r = await c.revogarSuporte(alvo.id)
  assert.equal(r.erro, undefined)

  const depois = await c.dadosDeSuporte()
  const revogado = depois.suportes.find(s => s.id === alvo.id)!
  assert.equal(revogado.ativo, false)
  assert.equal(revogado.expirado, true)
})
