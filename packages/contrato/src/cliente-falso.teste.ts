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


// ─── Atividades do evento ───────────────────────────────────────────────────

test('o log vem do mais recente para o mais antigo', async () => {
  // Quem abre esta tela no meio do evento quer o que acabou de acontecer. Uma
  // lista em ordem cronológica exigiria rolar até o fim para ver o agora.
  const c = await noPortao()
  const a = await c.atividades('ev-1')

  const horarios = a.linhas.map(l => Date.parse(l.em))
  const ordenado = [...horarios].sort((x, y) => y - x)
  assert.deepEqual(horarios, ordenado)
})

test('o log distingue QR, foto e registro assistido', async () => {
  /*
   * É a primeira coisa que se olha quando um registro é contestado: uma
   * leitura no portão e uma batida que outra pessoa fez pelo colaborador têm
   * pesos diferentes na hora de decidir quem tem razão.
   */
  const c = await noPortao()
  const a = await c.atividades('ev-1')

  const formas = new Set(a.linhas.map(l => l.como))
  assert.ok(formas.has('qr'))
  assert.ok(formas.has('foto'))
  assert.ok(formas.has('assistido'))

  const assistida = a.linhas.find(l => l.como === 'assistido')!
  assert.ok(assistida.registradoPor, 'batida assistida precisa dizer quem registrou')
})

test('o que acabou de ser escaneado aparece no log', async () => {
  // Sem isso, quem bate uma entrada e vai conferir não a encontra — e conclui
  // que ela não gravou.
  const c = await noPortao()
  const antes = await c.atividades('ev-1')

  const cracha = crachaQueServe()
  await c.registrarPorQr('ev-1', cracha.codigo, 'entrada')

  const depois = await c.atividades('ev-1')
  assert.equal(depois.linhas.length, antes.linhas.length + 1)
  assert.ok(depois.linhas.some(l => l.nome === cracha.nome && l.etapa === 'entrada'))
})

test('o contador de cada etapa bate com o log', async () => {
  // As abas mostram esses números. Se viessem de contas diferentes, a aba diria
  // 4 e a lista mostraria 3.
  const c = await noPortao()
  const a = await c.atividades('ev-1')

  for (const etapa of ['entrada', 'meio', 'fim'] as const) {
    assert.equal(
      a.porEtapa[etapa],
      a.linhas.filter(l => l.etapa === etapa).length,
      etapa,
    )
  }
})

test('quem não chegou aparece com nome e telefone', async () => {
  /*
   * O telefone está na lista de propósito: é dali que sai a ligação. Ter que
   * abrir outra tela para achar o número, no meio do evento, é o que faz
   * ninguém ligar.
   */
  const c = await noPortao()
  const a = await c.atividades('ev-1')

  assert.ok(a.naoChegaram.length > 0)
  for (const p of a.naoChegaram) {
    assert.ok(p.nome)
    assert.ok(p.telefone, 'sem telefone a lista não serve para nada')
  }
})

test('quem bate entrada sai de "não chegaram" e entra em "ainda no evento"', async () => {
  const c = await noPortao()
  // Alguém que ainda NÃO tem batida nenhuma no log — os outros já entraram, e o
  // teste passaria sem provar nada.
  const cracha = credenciaisDeDemonstracao()
    .find(x => x.serveHoje && x.nome === 'Wesley dos Santos Silva')!

  const antes = await c.atividades('ev-1')
  assert.ok(antes.naoChegaram.some(p => p.nome === cracha.nome))

  await c.registrarPorQr('ev-1', cracha.codigo, 'entrada')

  const depois = await c.atividades('ev-1')
  assert.equal(depois.naoChegaram.some(p => p.nome === cracha.nome), false)
  assert.ok(depois.aindaNoEvento.some(p => p.nome === cracha.nome))
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
    nome: 'Outra Pessoa', cpf: '99988877766', telefone: '27999887766',
    eventoId: 'ev-1', setorId: 's-2', ativo: true,
  }
  assert.ok((await c.criarAcesso(dados)).acesso)
  assert.ok((await c.criarAcesso({ ...dados, nome: 'Mais Outra' })).erro)
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
   * Quem bateu entrada duas vezes continua sendo uma pessoa que entrou. A
   * pergunta da tela é "quantos dos 109 já passaram por cada etapa", e ela só
   * faz sentido contando gente.
   */
  const c = await noPortao()
  const cracha = crachaQueServe()
  await c.registrarPorQr('ev-1', cracha.codigo, 'entrada')
  await c.registrarPorQr('ev-1', cracha.codigo, 'entrada')

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

test('setor novo nasce vazio e com link próprio', async () => {
  const c = await noPortao()
  const r = await c.criarSetor('ev-1', { nome: 'Segurança', estimado: 30, valorPorPessoa: 200 })

  assert.ok(r.setor, r.erro)
  assert.equal(r.setor.pessoas, 0)
  assert.ok(r.setor.linkDoFormulario)
  assert.deepEqual(r.setor.supervisores, [])
})

test('setor com nome repetido é recusado', async () => {
  /*
   * No cartaz da portaria só o NOME aparece. Dois setores "Bar" fariam a
   * pessoa escolher no escuro, e metade da equipe cairia no setor errado.
   */
  const c = await noPortao()
  const r = await c.criarSetor('ev-1', { nome: 'produção' })
  assert.ok(r.erro)
  assert.match(r.erro, /já existe/i)
})

test('setor sem nome é recusado', async () => {
  const c = await noPortao()
  assert.ok((await c.criarSetor('ev-1', { nome: ' ' })).erro)
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
async function comoMaster() {
  const c = new ClienteFalso()
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
