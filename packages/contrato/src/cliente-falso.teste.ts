/*
 * O servidor falso precisa ser exigente como o de verdade.
 *
 * Um cliente falso permissivo demais ensina o app a fazer coisa errada: as
 * telas ficam prontas assumindo que dá, e a falha só aparece contra a API real
 * — onde a recusa é de segurança, não de conveniência.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ClienteFalso, CONTAS_DE_DEMONSTRACAO, credenciaisDeDemonstracao,
  SENHA_DE_DEMONSTRACAO,
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

  assert.equal(presentes.valor + faltando.valor, equipe)
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
async function noPortao() {
  const c = new ClienteFalso()
  await entrarComo(c, 'admin')
  return c
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
    () => c.registrarPorQr('ev-1', crachaQueServe().codigo, 'entrada'),
    /permissão/i,
  )
})

test('o crachá certo registra a entrada e devolve o nome', async () => {
  const c = await noPortao()
  const cracha = crachaQueServe()
  const r = await c.registrarPorQr('ev-1', cracha.codigo, 'entrada')

  assert.equal(r.situacao, 'registrado')
  if (r.situacao !== 'registrado') return
  assert.equal(r.pessoa.nome, cracha.nome)
  assert.equal(r.momento, 'entrada')
})

test('o mesmo crachá lido duas vezes não gera duas entradas', async () => {
  // A fila anda e o operador passa o leitor de novo sem querer. Duplicar aqui
  // viraria duas entradas no relatório de quem entrou uma vez.
  const c = await noPortao()
  const cracha = crachaQueServe()
  await c.registrarPorQr('ev-1', cracha.codigo, 'entrada')
  const segunda = await c.registrarPorQr('ev-1', cracha.codigo, 'entrada')

  assert.equal(segunda.situacao, 'duplicado')
})

test('crachá de outra etapa não é "inválido": é etapa errada, com as duas', async () => {
  /*
   * Dizer "QR inválido" faria o operador pensar em falsificação e chamar a
   * segurança, quando o que houve foi alguém mostrar o crachá da montagem no
   * dia do evento. A resposta precisa nomear as duas etapas.
   */
  const c = await noPortao()
  const errado = credenciaisDeDemonstracao().find(x => !x.serveHoje)!
  const r = await c.registrarPorQr('ev-1', errado.codigo, 'entrada')

  assert.equal(r.situacao, 'etapa_errada')
  if (r.situacao !== 'etapa_errada') return
  assert.ok(r.doQr)
  assert.ok(r.deHoje)
  assert.notEqual(r.doQr, r.deHoje)
})

test('código que não saiu deste sistema é recusado', async () => {
  const c = await noPortao()
  const r = await c.registrarPorQr('ev-1', 'c3.qr-ana.M.assinaturaInventada', 'entrada')
  assert.equal(r.situacao, 'recusado')
})

test('a saída exige o meio', async () => {
  // O meio é o que prova que a pessoa ficou no evento. Liberar a saída sem ele
  // apagaria essa prova — e o meio é registrado pela própria pessoa, com foto.
  const c = await noPortao()
  const cracha = crachaQueServe()
  await c.registrarPorQr('ev-1', cracha.codigo, 'entrada')
  const saida = await c.registrarPorQr('ev-1', cracha.codigo, 'fim')

  assert.equal(saida.situacao, 'recusado')
  if (saida.situacao !== 'recusado') return
  assert.match(saida.mensagem, /meio/i)
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
  const r = await c.registrarPresencaAssistida(ficha!.participacaoId, { fotoBase64: '' })

  assert.ok(r.erro)
  assert.match(r.erro, /foto/i)
})

test('quem registra não escolhe a etapa: o servidor grava a pendente', async () => {
  const c = await noPortao()
  const { ficha } = await c.localizarPessoa('037.482.615-09')
  assert.equal(ficha!.proximaPendente?.tipo, 'entrada')

  const primeira = await c.registrarPresencaAssistida(ficha!.participacaoId, { fotoBase64: 'foto' })
  assert.equal(primeira.etapa, 'Entrada')

  // A seguinte é o meio, sem ninguém escolher.
  const depois = await c.abrirFicha(ficha!.participacaoId)
  assert.equal(depois.ficha?.proximaPendente?.tipo, 'meio')
})

test('pessoa não ativada não recebe presença registrada por terceiro', async () => {
  const c = await noPortao()
  const { ficha } = await c.localizarPessoa('87204953167')
  assert.equal(ficha?.ativo, false)

  const r = await c.registrarPresencaAssistida(ficha!.participacaoId, { fotoBase64: 'foto' })
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

  const gravou = await c.registrarPresencaAssistida(r.ficha.participacaoId, { fotoBase64: 'foto' })
  assert.equal(gravou.erro, undefined)
})

test('o colaborador não localiza ninguém', async () => {
  const c = await logado()
  await assert.rejects(() => c.localizarPessoa('Silva'), /permissão/i)
})
