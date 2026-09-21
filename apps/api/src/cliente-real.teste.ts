/*
 * O cliente do app contra a API de verdade.
 *
 * ─── POR QUE ESTE ARQUIVO EXISTE ───────────────────────────────────────────
 *
 * O projeto inteiro se apoia numa frase: "trocar o servidor falso pelo real é
 * um arquivo só, e nenhuma tela muda". Ela está escrita no contrato, no
 * `cliente.ts` do app e no backlog — e até aqui nunca tinha sido verificada.
 *
 * O último teste deste arquivo roda o MESMO roteiro do colaborador nos dois
 * clientes e exige que os dois se comportem igual. É ele que transforma a frase
 * em fato.
 *
 * Os outros testam a tradução que só existe no cliente HTTP: distinguir "o
 * servidor decidiu não" de "o servidor não respondeu". Errar isso quebra a fila
 * offline de um dos dois jeitos ruins — reenviar para sempre algo recusado, ou
 * descartar uma batida que a pessoa fez.
 *
 * Nada aqui abre porta: o `fetch` do cliente é desviado para o servidor Hono
 * rodando no mesmo processo. É a API de verdade, com middleware, status e
 * corpo reais.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ClienteFalso, ClienteHttp, FalhaDeTransporte,
  type ClienteApi,
} from '@credenciei/contrato'
import { cenarioHenriqueEJuliano } from './dados/memoria.js'
import { SessoesEmMemoria } from './sessoes.js'
import { LimiteEmMemoria } from './limite.js'
import { ArquivosEmMemoria } from './arquivos.js'
import { criarServidor, type Ambiente } from './servidor.js'
import type { CodigoPendente, GuardaDeCodigos } from './rotas/sessao.js'

const BASE = 'http://api.local'
const TELEFONE = '27999255959'
/** Quem ainda não entrou em evento nenhum — o começo do roteiro. */
const TELEFONE_SEM_EVENTO = '27988887777'
const CODIGO_DO_EVENTO = 'HJK-2026-K7M2'

/** A API inteira, no mesmo processo, com o cliente do app falando com ela. */
function montar(op: { aoPerderSessao?: () => void } = {}) {
  const { repo, master, admin } = cenarioHenriqueEJuliano()

  /*
   * Alguém que ainda não está em evento nenhum.
   *
   * O roteiro compartilhado precisa começar do MESMO lugar nos dois clientes, e
   * o falso começa com a conta vazia. Rodá-lo com o João — que o cenário já
   * põe dentro do evento — compararia caminhos diferentes e acusaria
   * divergência onde só havia dado diferente.
   */
  repo.pessoas.push({
    id: 'pes-maria', nome: 'Maria Souza', cpf: '98765432100',
    telefone: TELEFONE_SEM_EVENTO, fotoPath: null,
  })

  const guardados = new Map<string, CodigoPendente>()
  const codigos: GuardaDeCodigos = {
    async guardar(c) { guardados.set(c.telefone, c) },
    async buscar(t) { return guardados.get(t) ?? null },
    async apagar(t) { guardados.delete(t) },
  }

  let n = 0
  const limite = new LimiteEmMemoria()
  const amb: Ambiente = {
    repo,
    sessoes: new SessoesEmMemoria({ novoToken: () => `tk-${++n}` }),
    sessao: {
      repo,
      codigos,
      enviar: async () => {},
      sortear: () => '123456',
      limite,
      // Um Supabase Auth de mentira, com as mesmas duas contas do cenário.
      autenticar: async (email, senha) => {
        if (senha !== 'segredo123') return null
        if (email === 'juan@produzimos.com.br') return { userId: master.id }
        // Também pelo e-mail interno: é para onde um CPF de supervisor
        // resolve — `identificadorParaEmail('123.456.789-00')`.
        if (email === 'marina@produzimos.com.br' || email === '12345678900@supervisor.credenciei') {
          return { userId: admin.id }
        }
        return null
      },
    },
    limite,
    campos: async () => [
      { chave: 'funcao', rotulo: 'Sua função', tipo: 'texto', obrigatorio: true },
    ],
    segredoQr: 'segredo-de-teste',
    chavePublicaQrEd25519: null,
    segredoManutencao: null,
    novoToken: () => `qr-${++n}`,
    arquivos: new ArquivosEmMemoria(BASE),
    siteUrl: 'http://site.local',
  }

  const app = criarServidor(amb)
  let token: string | null = null

  const cliente = new ClienteHttp({
    base: BASE,
    credencial: async () => token,
    buscar: async (entrada, init) => app.request(String(entrada), init as RequestInit),
    ...(op.aoPerderSessao ? { aoPerderSessao: op.aoPerderSessao } : {}),
  })

  return { cliente, repo, app, guardarToken: (t: string | null) => { token = t } }
}

/** Login completo pelo cliente HTTP, devolvendo a sessão. */
async function entrar(m: ReturnType<typeof montar>) {
  await m.cliente.pedirCodigo(TELEFONE)
  const r = await m.cliente.entrar(TELEFONE, '123456')
  assert.ok(r.sessao, r.erro ?? 'era para entrar')
  m.guardarToken(r.sessao.token)
  return r.sessao
}

// ─── O caminho feliz, por HTTP de verdade ───────────────────────────────────

test('o login vai e volta pela API', async () => {
  const m = montar()
  const pedido = await m.cliente.pedirCodigo(TELEFONE)
  assert.equal(pedido.enviado, true)

  const sessao = await entrar(m)
  assert.ok(sessao.token)
  assert.ok(sessao.renovacao)
  assert.equal(sessao.papel, 'colaborador')
})

test('o token viaja no cabeçalho, e sem ele nada passa', async () => {
  const m = montar()
  // Antes de entrar não há token: o cliente nem sai, para não gastar uma
  // tentativa da fila num 401 garantido.
  await assert.rejects(() => m.cliente.eu(), FalhaDeTransporte)

  await entrar(m)
  const eu = await m.cliente.eu()
  assert.equal(eu.nome, 'João da Silva')
})

test('as participações, os dias e o QR vêm da API', async () => {
  const m = montar()
  await entrar(m)

  const participacoes = await m.cliente.minhasParticipacoes()
  assert.ok(participacoes.length > 0)

  const p = participacoes[0]!
  assert.ok(Array.isArray(await m.cliente.meusDias(p.participacaoId)))
  const qr = await m.cliente.meuQr(p.participacaoId)
  assert.ok(qr.codigo)
  assert.equal(typeof qr.liberado, 'boolean')
})

test('o financeiro é o da própria pessoa', async () => {
  const m = montar()
  await entrar(m)
  const p = (await m.cliente.minhasParticipacoes())[0]!
  const f = await m.cliente.meuFinanceiro(p.participacaoId)
  assert.equal(typeof f.diasTrabalhados, 'number')
})

test('excluir minha conta vai e volta pela API — anonimiza e derruba a sessão', async () => {
  const m = montar()
  await entrar(m)

  const r = await m.cliente.excluirMinhaConta()
  assert.deepEqual(r, {})

  await assert.rejects(m.cliente.minhasParticipacoes(), /Sessão expirada/)
})

test('conta de painel não usa excluirMinhaConta — API real recusa', async () => {
  const m = montar()
  const login = await m.cliente.entrarComSenha('marina@produzimos.com.br', 'segredo123')
  assert.ok(login.sessao, login.erro)
  m.guardarToken(login.sessao.token)

  const r = await m.cliente.excluirMinhaConta()
  assert.match(r.erro ?? '', /só para conta de colaborador/)
})

// ─── A tradução que sustenta a fila offline ─────────────────────────────────

test('batida aceita volta como registrada', async () => {
  const m = montar()
  await entrar(m)
  const p = (await m.cliente.minhasParticipacoes())[0]!

  const r = await m.cliente.registrarBatida({
    id: 'b-1',
    participacaoId: p.participacaoId,
    tipo: 'entrada',
    registradoEm: '2026-09-03T08:00:00-03:00',
  })
  assert.equal(r.situacao, 'registrado')
})

test('batida recusada volta como RESPOSTA, e não como exceção', async () => {
  /*
   * O 422 da API precisa virar `{ situacao: 'recusado' }`. Se virasse exceção,
   * a fila trataria como falha de rede e reenviaria para sempre uma batida que
   * nunca vai passar.
   */
  const m = montar()
  await entrar(m)
  const p = (await m.cliente.minhasParticipacoes())[0]!

  const r = await m.cliente.registrarBatida({
    id: 'b-2',
    participacaoId: p.participacaoId,
    tipo: 'entrada',
    // Cinco da manhã do dia do evento: a janela de entrada abre às 07:00.
    registradoEm: '2026-09-05T05:00:00-03:00',
  })

  assert.equal(r.situacao, 'recusado')
  if (r.situacao !== 'recusado') return
  assert.ok(r.motivo, 'a recusa precisa vir com o motivo para a pessoa ler')
})

test('rede caída vira falha de transporte', async () => {
  // O oposto do teste acima: aqui a fila TEM que guardar e tentar de novo.
  const cliente = new ClienteHttp({
    base: BASE,
    credencial: async () => 'tk-1',
    buscar: async () => { throw new TypeError('Failed to fetch') },
  })

  await assert.rejects(() => cliente.eu(), FalhaDeTransporte)
})

test('erro do servidor (5xx) é transporte, não recusa', async () => {
  // O servidor caiu, e servidor que caiu volta. Tratar como recusa jogaria
  // fora a batida de todo mundo que bateu durante a queda.
  const cliente = new ClienteHttp({
    base: BASE,
    credencial: async () => 'tk-1',
    buscar: async () => new Response('{}', { status: 500 }),
  })

  await assert.rejects(() => cliente.eu(), FalhaDeTransporte)
})

test('429 e 408 também são transporte', async () => {
  for (const status of [408, 429]) {
    const cliente = new ClienteHttp({
      base: BASE,
      credencial: async () => 'tk-1',
      buscar: async () => new Response('{}', { status }),
    })
    await assert.rejects(() => cliente.eu(), FalhaDeTransporte, `status ${status}`)
  }
})

test('401 avisa que a sessão caiu, e ainda assim é transporte', async () => {
  /*
   * Avisa porque o app precisa mandar a pessoa entrar de novo. Mas é transporte
   * do ponto de vista da FILA: depois de renovar, a mesma batida vale. Tratar
   * como recusa descartaria a batida de quem ficou uma hora sem abrir o app.
   */
  let avisou = false
  const m = montar({ aoPerderSessao: () => { avisou = true } })
  m.guardarToken('token-inventado')

  await assert.rejects(() => m.cliente.eu(), FalhaDeTransporte)
  assert.equal(avisou, true)
})

test('renovação recusada é DECISÃO, e volta como erro', async () => {
  /*
   * A exceção do 401. Aqui ele significa que a sessão morreu de vez — se
   * virasse falha de transporte, a guarda ficaria tentando renovar para sempre
   * uma sessão que não existe mais.
   */
  const m = montar()
  const r = await m.cliente.renovar('renovacao-inventada')
  assert.equal(r.sessao, undefined)
  assert.ok(r.erro)
})

// ─── Entrar com senha (conta de painel) ─────────────────────────────────────

test('entrarComSenha vai e volta pela API, com o papel de verdade', async () => {
  const m = montar()
  const r = await m.cliente.entrarComSenha('marina@produzimos.com.br', 'segredo123')

  assert.ok(r.sessao, r.erro)
  assert.equal(r.sessao.papel, 'admin')
  assert.ok(r.sessao.token)
  assert.ok(r.sessao.renovacao)
})

test('depois de entrar com senha, /v1/eu responde o papel de painel', async () => {
  const m = montar()
  const r = await m.cliente.entrarComSenha('juan@produzimos.com.br', 'segredo123')
  assert.ok(r.sessao, r.erro)
  m.guardarToken(r.sessao.token)

  const eu = await m.cliente.eu()
  assert.equal(eu.papel, 'master')
  assert.equal(eu.nome, 'Juan Muzy')
})

test('o painel vem da API de verdade, com o recorte do admin', async () => {
  const m = montar()
  const r = await m.cliente.entrarComSenha('marina@produzimos.com.br', 'segredo123')
  assert.ok(r.sessao, r.erro)
  m.guardarToken(r.sessao.token)

  const p = await m.cliente.painel()
  assert.equal(p.eventos.length, 1)
  assert.equal(p.eventos[0]?.nome, 'Henrique e Juliano — Kleber Andrade')
  assert.ok(p.indicadores.some(i => i.chave === 'eventos_ativos'))
})

test('escanear vai e volta pela API — eventos, e um crachá com assinatura errada', async () => {
  /*
   * Sem data fixa de propósito: o cenário de teste tem um evento datado de
   * 2026-09-05/06, e o relógio de verdade já passou disso — testar um
   * REGISTRO com sucesso aqui exigiria um relógio injetável na rota HTTP,
   * que ainda não existe. Esse caminho é coberto a fundo, com relógio
   * controlado, em `rotas/escanear.teste.ts`; aqui só se prova a ligação
   * HTTP (autenticação, rota, formato do corpo).
   */
  const m = montar()
  const r = await m.cliente.entrarComSenha('marina@produzimos.com.br', 'segredo123')
  assert.ok(r.sessao, r.erro)
  m.guardarToken(r.sessao.token)

  const eventos = await m.cliente.eventosParaEscanear()
  assert.deepEqual(eventos, [{ eventoId: 'ev-hj', nome: 'Henrique e Juliano — Kleber Andrade' }])

  const leitura = await m.cliente.registrarPorQr('ev-hj', 'c3.token-do-joao.M.assinaturaFalsa')
  assert.equal(leitura.situacao, 'recusado')
})

test('registro assistido vai e volta pela API — localizar por CPF, abrir ficha, recusar sem foto', async () => {
  const m = montar()
  const r = await m.cliente.entrarComSenha('marina@produzimos.com.br', 'segredo123')
  assert.ok(r.sessao, r.erro)
  m.guardarToken(r.sessao.token)

  const achado = await m.cliente.localizarPessoa('12345678901')
  assert.equal(achado.ficha?.nome, 'João da Silva')

  const aberta = await m.cliente.abrirFicha(achado.ficha!.participacaoId)
  assert.equal(aberta.ficha?.nome, 'João da Silva')

  const semFoto = await m.cliente.registrarPresencaAssistida(achado.ficha!.participacaoId, {
    tipo: 'entrada', fotoBase64: '',
  })
  assert.match(semFoto.erro ?? '', /foto do rosto é obrigatória/)
})

test('atividades vai e volta pela API — eventos, e a visão de entrada de um dia', async () => {
  const m = montar()
  const r = await m.cliente.entrarComSenha('marina@produzimos.com.br', 'segredo123')
  assert.ok(r.sessao, r.erro)
  m.guardarToken(r.sessao.token)

  const eventos = await m.cliente.eventosParaAcompanhar()
  assert.deepEqual(eventos, [{ eventoId: 'ev-hj', nome: 'Henrique e Juliano — Kleber Andrade' }])

  const a = await m.cliente.atividades('ev-hj', { visao: 'entrada', dia: '2026-09-05' })
  assert.equal(a.eventoNome, 'Henrique e Juliano — Kleber Andrade')
  assert.equal(a.diaEscolhido, '2026-09-05')
  assert.deepEqual(a.linhas, [])
})

test('acessos vai e volta pela API — eventos com setores, criar e listar', async () => {
  const m = montar()
  const r = await m.cliente.entrarComSenha('marina@produzimos.com.br', 'segredo123')
  assert.ok(r.sessao, r.erro)
  m.guardarToken(r.sessao.token)

  const eventos = await m.cliente.eventosComSetores()
  assert.deepEqual(eventos, [{ eventoId: 'ev-hj', nome: 'Henrique e Juliano — Kleber Andrade', setores: [{ setorId: 'eq-1', nome: 'Produção' }] }])

  const criado = await m.cliente.criarAcesso({
    funcao: 'supervisor', nome: 'Larissa Prado', cpf: '65498732100', telefone: '27999887766',
    eventoId: 'ev-hj', setorId: 'eq-1', ativo: true,
  })
  assert.ok(criado.acesso, criado.erro)
  assert.equal(criado.acesso?.setorNome, 'Produção')

  const lista = await m.cliente.acessos({ busca: 'Larissa' })
  assert.equal(lista.itens.length, 1)

  const trocada = await m.cliente.trocarSenhaDoAcesso(criado.acesso!.id, 'senhaNova123')
  assert.equal(trocada.erro, undefined)

  // Admin não exclui — só desativa. Master, sim.
  const negado = await m.cliente.excluirAcesso(criado.acesso!.id)
  assert.match(negado.erro ?? '', /Só o master exclui/)

  const master = await m.cliente.entrarComSenha('juan@produzimos.com.br', 'segredo123')
  assert.ok(master.sessao, master.erro)
  m.guardarToken(master.sessao.token)
  const excluido = await m.cliente.excluirAcesso(criado.acesso!.id)
  assert.equal(excluido.erro, undefined)

  // Master já está logado — cria um admin, escolhendo a organização.
  const novoAdmin = await m.cliente.criarAcesso({
    funcao: 'admin', nome: 'Zuleika Wandick', email: 'zuleika.rt@produzimos.com.br',
    senha: 'segredo123', ativo: true, organizacaoId: 'org-1',
  })
  assert.ok(novoAdmin.acesso, novoAdmin.erro)
  assert.equal(novoAdmin.acesso?.papel, 'admin')
  assert.equal(novoAdmin.acesso?.identificador, 'zuleika.rt@produzimos.com.br')
})

test('veículos e bloqueio de CPF vão e voltam pela API', async () => {
  const m = montar()
  const login = await m.cliente.entrarComSenha('marina@produzimos.com.br', 'segredo123')
  assert.ok(login.sessao, login.erro)
  m.guardarToken(login.sessao.token)

  const eventosV = await m.cliente.eventosParaVeiculos()
  assert.deepEqual(eventosV, [{ eventoId: 'ev-hj', nome: 'Henrique e Juliano — Kleber Andrade' }])

  const condutor = await m.cliente.buscarCondutorPorCpf('ev-hj', '12345678901')
  assert.ok(condutor.condutor, condutor.erro)

  const criado = await m.cliente.cadastrarVeiculo('ev-hj', {
    cpf: '12345678901', placa: 'ABC1D23', modelo: 'HB20',
  })
  assert.ok(criado.placa, criado.erro)

  const veiculos = await m.cliente.veiculosDoEvento('ev-hj')
  assert.equal(veiculos.veiculos.length, 1)

  const bloqueado = await m.cliente.bloquearCpf('ev-hj', '11122233344', 'Teste')
  assert.ok(bloqueado.cpf, bloqueado.erro)

  const bloqueios = await m.cliente.bloqueiosDoEvento('ev-hj')
  assert.equal(bloqueios.length, 1)

  const liberado = await m.cliente.desbloquearCpf(bloqueios[0]!.id, 'ev-hj')
  assert.equal(liberado.erro, undefined)
})

test('base de funcionários e encontrar colaborador vão e voltam pela API', async () => {
  const m = montar()
  const login = await m.cliente.entrarComSenha('juan@produzimos.com.br', 'segredo123')
  assert.ok(login.sessao, login.erro)
  m.guardarToken(login.sessao.token)

  const base = await m.cliente.baseDeFuncionarios()
  assert.equal(base.total, 1)

  const regional = await m.cliente.encontrarColaborador({ cidade: 'Vitória' })
  assert.equal(regional.pessoas.length, 1)

  const ficha = await m.cliente.fichaDaPessoaNaBase('12345678901')
  assert.equal(ficha.trabalhos.length, 1)
})

test('relatório vai e volta pela API, e o arquivo baixa de verdade', async () => {
  const m = montar()
  const login = await m.cliente.entrarComSenha('marina@produzimos.com.br', 'segredo123')
  assert.ok(login.sessao, login.erro)
  m.guardarToken(login.sessao.token)

  const resumo = await m.cliente.resumoDeRelatorios('ev-hj')
  assert.equal(resumo.eventoNome, 'Henrique e Juliano — Kleber Andrade')

  const arquivo = await m.cliente.relatorioDoEvento(
    'ev-hj', { de: '2026-09-03', ate: '2026-09-06' }, 'credenciados',
  )
  assert.match(arquivo.url, /^http:\/\/api\.local\/arquivos\//)

  // O endereço devolvido é de verdade — bate na mesma API, sem token, e o
  // corpo é a planilha (não JSON).
  const resposta = await m.app.request(arquivo.url)
  assert.equal(resposta.status, 200)
  assert.equal(
    resposta.headers.get('content-type'),
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  )
  const bytes = new Uint8Array(await resposta.arrayBuffer())
  assert.ok(bytes.length > 0)
})

test('senha errada por HTTP devolve erro, não exceção', async () => {
  const m = montar()
  const r = await m.cliente.entrarComSenha('marina@produzimos.com.br', 'errada')
  assert.equal(r.sessao, undefined)
  assert.ok(r.erro)
})

test('CPF de supervisor entra pelo mesmo caminho HTTP', async () => {
  // O identificador vira e-mail interno ANTES de chegar no Auth — a API
  // nunca vê "CPF", só o e-mail que `identificadorParaEmail` já resolveu.
  const m = montar()
  const r = await m.cliente.entrarComSenha('123.456.789-00', 'segredo123')
  assert.ok(r.sessao, r.erro)
  assert.equal(r.sessao.papel, 'admin')
})

test('renovar gira o token, como a guarda espera', async () => {
  const m = montar()
  const sessao = await entrar(m)
  const nova = await m.cliente.renovar(sessao.renovacao)

  assert.ok(nova.sessao, nova.erro)
  assert.notEqual(nova.sessao.renovacao, sessao.renovacao)
})

test('evento por dentro, portaria, criar setor e equipe do setor vão e voltam pela API', async () => {
  const m = montar()
  const login = await m.cliente.entrarComSenha('marina@produzimos.com.br', 'segredo123')
  assert.ok(login.sessao, login.erro)
  m.guardarToken(login.sessao.token)

  const evento = await m.cliente.evento('ev-hj')
  assert.equal(evento.setores.length, 1)
  assert.equal(evento.portaria.aberta, false)
  assert.equal(evento.portaria.endereco, null)

  const aberta = await m.cliente.alternarPortaria('ev-hj', true)
  assert.ok(aberta.portaria?.aberta)
  assert.ok(aberta.portaria?.endereco)
  const primeiroToken = aberta.portaria!.endereco

  const trocada = await m.cliente.trocarTokenDaPortaria('ev-hj')
  assert.ok(trocada.portaria?.aberta, 'trocar o QR não fecha a portaria')
  assert.notEqual(trocada.portaria?.endereco, primeiroToken)

  const criado = await m.cliente.criarSetor('ev-hj', {
    nome: 'Segurança',
    valorPorPessoa: 200,
    supervisor: { nome: 'Marina Oliveira', cpf: '111.222.333-96', telefone: '(27) 99988-7766' },
  })
  assert.ok(criado.setor, criado.erro)
  assert.equal(criado.setor?.pessoas, 0)
  assert.equal(criado.setor?.supervisores.length, 1)

  const equipe = await m.cliente.equipeDoSetor('eq-1')
  assert.equal(equipe.setorNome, 'Produção')
  assert.equal(equipe.pessoas.length, 1)
  assert.equal(equipe.pessoas[0]?.nome, 'João da Silva')

  const ficha = await m.cliente.fichaDaPessoa(equipe.pessoas[0]!.participacaoId)
  assert.equal(ficha.nome, 'João da Silva')
  assert.equal(ficha.setorNome, 'Produção')
  assert.equal(ficha.eventoNome, 'Henrique e Juliano — Kleber Andrade')
  assert.equal(ficha.outrosSetores.some(s => s.setorId === criado.setor?.setorId), true)
  assert.equal(ficha.podeMover, true)
  assert.equal(ficha.podeExcluirDaEquipe, true)
})

test('as mutações da ficha (mover, pagamento, valor, tirar/trazer, excluir) vão e voltam pela API', async () => {
  const m = montar()
  const login = await m.cliente.entrarComSenha('marina@produzimos.com.br', 'segredo123')
  assert.ok(login.sessao, login.erro)
  m.guardarToken(login.sessao.token)

  const criado = await m.cliente.criarSetor('ev-hj', {
    nome: 'Bar', valorPorPessoa: 100,
    supervisor: { nome: 'Marina Oliveira', cpf: '111.222.333-96', telefone: '(27) 99988-7766' },
  })
  assert.ok(criado.setor, criado.erro)
  const setorDestino = criado.setor!.setorId

  const equipe = await m.cliente.equipeDoSetor('eq-1')
  const participacaoId = equipe.pessoas[0]!.participacaoId

  const mover = await m.cliente.moverDeSetor(participacaoId, setorDestino)
  assert.equal(mover.erro, undefined, mover.erro)
  assert.equal((await m.cliente.fichaDaPessoa(participacaoId)).setorId, setorDestino)

  const pagamento = await m.cliente.marcarPagamento(participacaoId, true)
  assert.equal(pagamento.erro, undefined, pagamento.erro)
  assert.equal((await m.cliente.fichaDaPessoa(participacaoId)).pago, true)

  const valor = await m.cliente.salvarValorAReceber(participacaoId, 250)
  assert.equal(valor.erro, undefined, valor.erro)
  assert.equal((await m.cliente.fichaDaPessoa(participacaoId)).valorReceber, 250)

  const tirou = await m.cliente.tirarDaEquipe(participacaoId)
  assert.equal(tirou.erro, undefined, tirou.erro)
  assert.ok((await m.cliente.fichaDaPessoa(participacaoId)).descredenciadoEm)

  const trouxeDeVolta = await m.cliente.trazerDeVolta(participacaoId)
  assert.equal(trouxeDeVolta.erro, undefined, trouxeDeVolta.erro)
  assert.equal((await m.cliente.fichaDaPessoa(participacaoId)).descredenciadoEm, null)

  const telefone = await m.cliente.corrigirTelefone(participacaoId, '(27) 98888-7766')
  assert.equal(telefone.erro, undefined, telefone.erro)
  assert.equal((await m.cliente.fichaDaPessoa(participacaoId)).telefone, '27988887766')

  const trilha = await m.cliente.auditoria()
  assert.ok(trilha.some(l => l.acao === 'ALTERACAO_SETOR'))
  assert.ok(trilha.some(l => l.acao === 'DESCREDENCIAMENTO'))
  assert.ok(trilha.some(l => l.acao === 'ALTERACAO_TELEFONE'))

  const excluiu = await m.cliente.excluirDaEquipe(participacaoId, 'teste de ponta a ponta')
  assert.equal(excluiu.erro, undefined, excluiu.erro)
  await assert.rejects(m.cliente.fichaDaPessoa(participacaoId), /Não encontramos/)
})

test('contestar e resolver uma batida vão e voltam pela API', async () => {
  const m = montar()
  await entrar(m)
  const participacaoId = (await m.cliente.minhasParticipacoes())[0]!.participacaoId

  const contestou = await m.cliente.contestarBatida(participacaoId, 'meio', '2026-09-05', 'a foto não subiu')
  assert.equal(contestou.erro, undefined, contestou.erro)

  const semMotivo = await m.cliente.contestarBatida(participacaoId, 'entrada', '2026-09-05', '   ')
  assert.match(semMotivo.erro ?? '', /Escreva o que está errado/)

  const login = await m.cliente.entrarComSenha('marina@produzimos.com.br', 'segredo123')
  assert.ok(login.sessao, login.erro)
  m.guardarToken(login.sessao.token)

  const ficha = await m.cliente.fichaDaPessoa(participacaoId)
  assert.equal(ficha.contestacoesAbertas.length, 1)
  assert.equal(ficha.contestacoesAbertas[0]!.motivo, 'a foto não subiu')

  const resolveu = await m.cliente.resolverContestacao(ficha.contestacoesAbertas[0]!.id)
  assert.equal(resolveu.erro, undefined, resolveu.erro)
  assert.equal((await m.cliente.fichaDaPessoa(participacaoId)).contestacoesAbertas.length, 0)

  const naoEncontrada = await m.cliente.resolverContestacao('cont-inexistente')
  assert.match(naoEncontrada.erro ?? '', /Não encontramos/)
})

test('modelo, exportar e importar planilha de equipe vão e voltam pela API', async () => {
  const m = montar()
  const login = await m.cliente.entrarComSenha('marina@produzimos.com.br', 'segredo123')
  assert.ok(login.sessao, login.erro)
  m.guardarToken(login.sessao.token)

  const modelo = await m.cliente.baixarModelo()
  assert.ok(modelo.nome.endsWith('.xlsx'))
  assert.match(modelo.url, /^http:\/\/api\.local\/arquivos\//)

  const exportado = await m.cliente.exportarEquipe('eq-1')
  assert.ok(exportado.nome.endsWith('.xlsx'))

  const linhas: Record<string, string | number> = {
    Nome: 'Fernanda Reis', CPF: '529.982.247-25', Telefone: '27988776655',
    Cargo: 'Auxiliar', Cidade: 'Vila Velha', 'Valor a receber': 120,
  }
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Planilha')
  ws.columns = Object.keys(linhas).map(k => ({ header: k, key: k }))
  ws.addRow(linhas)
  const base64 = Buffer.from(await wb.xlsx.writeBuffer()).toString('base64')

  const importado = await m.cliente.importarPlanilha('eq-1', { nome: 'equipe.xlsx', base64 })
  assert.equal(importado.erro, undefined, importado.erro)
  assert.equal(importado.resultado?.criados, 1)
  assert.equal(importado.resultado?.ignorados, 0)
})

test('registrar token de push vai e volta pela API — qualquer papel logado', async () => {
  const m = montar()
  await entrar(m) // colaborador — o roteiro padrão já entra num evento

  const r = await m.cliente.registrarTokenDePush('ExponentPushToken[teste-e2e]', 'android')
  assert.equal(r.erro, undefined, r.erro)
})

test('organizações vai e volta pela API — criar, listar e suspender', async () => {
  const m = montar()

  // Só o master gerencia a Plataforma — entra pelo caminho de senha, não o de WhatsApp.
  const login = await m.cliente.entrarComSenha('juan@produzimos.com.br', 'segredo123')
  assert.ok(login.sessao, login.erro)
  m.guardarToken(login.sessao!.token)

  const criada = await m.cliente.criarOrganizacao({
    nome: 'Festas do Vale',
    adminNome: 'Renata Dias',
    email: 'renata@festasdovale.com.br',
    senha: 'segredo123',
    limiteEventos: 5,
  })
  assert.ok(criada.organizacao, criada.erro)

  const lista = await m.cliente.organizacoes()
  assert.ok(lista.itens.some(o => o.organizacaoId === criada.organizacao!.organizacaoId))

  const r = await m.cliente.alternarOrganizacao(criada.organizacao!.organizacaoId, false)
  assert.equal(r.erro, undefined)
})

// ─── A frase em que o projeto inteiro se apoia ──────────────────────────────

/**
 * O roteiro do colaborador, do jeito que as telas fazem.
 *
 * Começa numa conta VAZIA nos dois clientes e vai até o fim: entrar, achar o
 * evento pelo código, se inscrever, e ver os próprios dias, QR e acerto.
 *
 * Afirma sobre FORMA e COMPORTAMENTO, não sobre conteúdo: o falso e a API têm
 * dados diferentes de propósito. O que precisa ser igual é o que as telas usam
 * — os campos existirem, os tipos baterem, e as recusas acontecerem nos mesmos
 * lugares.
 */
async function roteiroDoColaborador(quem: string, cliente: ClienteApi, telefone: string) {
  const onde = (passo: string) => `[${quem}] ${passo}`
  const pedido = await cliente.pedirCodigo(telefone)
  assert.equal(pedido.enviado, true, onde('pedirCodigo'))

  const entrada = await cliente.entrar(telefone, '123456')
  assert.ok(entrada.sessao, onde(`entrar: ${entrada.erro ?? ''}`))
  assert.equal(typeof entrada.sessao.token, 'string')
  assert.equal(typeof entrada.sessao.renovacao, 'string')
  assert.equal(typeof entrada.sessao.expiraEm, 'string')

  const eu = await cliente.eu()
  assert.ok(eu.nome.length > 0, 'eu().nome')

  assert.deepEqual(await cliente.minhasParticipacoes(), [], onde('conta nova não tem evento'))

  const convite = await cliente.consultarConvite(CODIGO_DO_EVENTO)
  assert.ok(convite.convite, onde(`consultarConvite: ${convite.erro ?? ''}`))
  assert.ok(convite.convite.eventoNome, 'convite.eventoNome')
  assert.ok(Array.isArray(convite.convite.camposExtras), 'convite.camposExtras')

  const inscricao = await cliente.entrarNoEvento(CODIGO_DO_EVENTO, {
    funcao: 'Auxiliar de palco',
    uniforme: 'M',
  })
  assert.ok(inscricao.participacao, onde(`entrarNoEvento: ${inscricao.erro ?? ''}`))

  const participacoes = await cliente.minhasParticipacoes()
  assert.equal(participacoes.length, 1, onde('depois de entrar, uma participação'))

  const p = participacoes[0]!
  assert.ok(Array.isArray(await cliente.meusDias(p.participacaoId)), 'meusDias')

  const qr = await cliente.meuQr(p.participacaoId)
  assert.ok(qr.codigo, 'meuQr.codigo')
  assert.ok(qr.etapa, 'meuQr.etapa')
  assert.equal(typeof qr.liberado, 'boolean', onde('meuQr.liberado'))

  const financeiro = await cliente.meuFinanceiro(p.participacaoId)
  assert.equal(typeof financeiro.diasTrabalhados, 'number', 'meuFinanceiro')

  // A guarda: consultar de novo o evento em que já está tem que recusar, e
  // recusar dizendo POR QUÊ — senão a tela pede o formulário outra vez.
  const denovo = await cliente.consultarConvite(CODIGO_DO_EVENTO)
  assert.equal(denovo.convite, undefined, onde('já está dentro: não devia vir convite'))
  assert.match(denovo.erro ?? '', /já está neste evento/i)

  /*
   * Entrada livre: hoje não é dia de trabalho deste evento (ele é em
   * setembro de 2026) — os dois têm que recusar, e com o mesmo formato de
   * resposta. Não afirma sobre o caminho de SUCESSO porque isso exigiria
   * controlar o relógio dos dois lados; o que importa aqui é a FORMA da
   * recusa ser igual, que é o que a fila offline lê.
   */
  const livre = await cliente.registrarEntradaLivre(p.participacaoId, {})
  assert.equal(livre.situacao, 'recusado', onde('registrarEntradaLivre'))

  const contestacao = await cliente.contestarBatida(p.participacaoId, 'entrada', '2026-09-05', 'teste de paridade')
  assert.deepEqual(contestacao, {}, onde('contestarBatida'))
}

test('o mesmo roteiro passa no servidor falso e na API de verdade', async () => {
  /*
   * É ESTE o teste que a arquitetura toda estava devendo.
   *
   * Se ele quebrar, "trocar o falso pelo real é um arquivo só" deixou de ser
   * verdade — e alguma tela vai quebrar na troca, provavelmente no dia do
   * evento.
   *
   * Ele já cobrou o preço uma vez: na primeira execução, o falso deixava
   * consultar o convite de um evento em que a pessoa já estava, e a API não.
   */
  await roteiroDoColaborador('falso', new ClienteFalso(), TELEFONE)

  const m = montar()
  const original = m.cliente.entrar.bind(m.cliente)
  // O roteiro não conhece token: aqui a sessão é guardada assim que sai.
  m.cliente.entrar = async (t: string, c: string) => {
    const r = await original(t, c)
    if (r.sessao) m.guardarToken(r.sessao.token)
    return r
  }

  await roteiroDoColaborador('API', m.cliente, TELEFONE_SEM_EVENTO)
})

test('a recusa de participação de outra pessoa é igual nos dois', async () => {
  // "Não existe" e "não é seu" respondem igual — no falso e na API. Diferenciar
  // entregaria um jeito de varrer ids e descobrir quais existem.
  const falso = new ClienteFalso()
  await falso.pedirCodigo(TELEFONE)
  await falso.entrar(TELEFONE, '123456')
  await assert.rejects(() => falso.meusDias('part-de-outra-pessoa'))

  const m = montar()
  await entrar(m)
  await assert.rejects(() => m.cliente.meusDias('part-de-outra-pessoa'))
})
