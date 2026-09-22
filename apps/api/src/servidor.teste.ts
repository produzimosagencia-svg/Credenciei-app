/*
 * A API por HTTP, de ponta a ponta.
 *
 * As regras já são testadas função a função. O que se testa aqui é a camada
 * que traduz: token exigido onde precisa, código de status certo, e nenhum id
 * de pessoa aceito de fora.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cenarioHenriqueEJuliano } from './dados/memoria.js'
import { SessoesEmMemoria } from './sessoes.js'
import { LimiteEmMemoria } from './limite.js'
import { ArquivosEmMemoria } from './arquivos.js'
import { criarServidor, type Ambiente } from './servidor.js'
import type { CodigoPendente, GuardaDeCodigos } from './rotas/sessao.js'

function montar(sobrepor: Partial<Ambiente> = {}) {
  const { repo, evento } = cenarioHenriqueEJuliano()
  repo.pessoas.push({
    id: 'pes-maria', nome: 'Maria Souza', cpf: '98765432100',
    telefone: '27988887777', fotoPath: null,
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
    sessao: { repo, codigos, enviar: async () => {}, sortear: () => '123456', limite },
    limite,
    campos: async () => [
      { chave: 'funcao', rotulo: 'Sua função', tipo: 'texto', obrigatorio: true },
    ],
    segredoQr: 'segredo-de-teste',
    chavePublicaQrEd25519: null,
    segredoManutencao: 'segredo-de-manutencao-teste',
    enviarPush: async () => {},
    novoToken: () => `qr-${++n}`,
    arquivos: new ArquivosEmMemoria('http://api.local'),
    siteUrl: 'http://site.local',
    ...sobrepor,
  }

  return { app: criarServidor(amb), repo, evento, amb }
}

/** Entra e devolve o cabeçalho pronto. */
async function autenticado(app: ReturnType<typeof criarServidor>, telefone = '27999255959') {
  await app.request('/v1/entrar/codigo', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ telefone }),
  })
  const r = await app.request('/v1/entrar', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ telefone, codigo: '123456' }),
  })
  const { sessao } = await r.json() as { sessao: { token: string } }
  return { Authorization: `Bearer ${sessao.token}` }
}

// ─── Saúde ──────────────────────────────────────────────────────────────────

test('a API responde que está viva', async () => {
  const { app } = montar()
  const r = await app.request('/saude')
  assert.equal(r.status, 200)
})

// ─── Manutenção ─────────────────────────────────────────────────────────────
//
// Fora de /v1, sem sessão — quem chama é um agendador externo (cron-job.org),
// não uma pessoa. A proteção é um segredo compartilhado no cabeçalho.

test('sem o segredo certo, a rota de manutenção recusa', async () => {
  const { app } = montar()
  const semNada = await app.request('/manutencao/apagar-fotos-vencidas', { method: 'POST' })
  assert.equal(semNada.status, 401)

  const errado = await app.request('/manutencao/apagar-fotos-vencidas', {
    method: 'POST',
    headers: { 'X-Segredo-Manutencao': 'chute' },
  })
  assert.equal(errado.status, 401)
})

test('com o segredo certo, apaga a foto de evento fechado há mais de 90 dias', async () => {
  const { app, repo, evento } = montar()
  evento.dataFim = '2026-01-01T00:00:00-03:00' // bem mais de 90 dias no passado
  repo.registros.push({
    id: 'reg-foto-velha', participacaoId: 'part-joao', tipo: 'meio', dataRef: '2025-12-01',
    registradoEm: '2025-12-01T12:00:00-03:00', recebidoEm: '2025-12-01T12:00:00-03:00',
    fotoPath: 'ev-hj/part-joao/meio-2025-12-01.jpg', lat: null, lng: null, manual: false,
  })

  const r = await app.request('/manutencao/apagar-fotos-vencidas', {
    method: 'POST',
    headers: { 'X-Segredo-Manutencao': 'segredo-de-manutencao-teste' },
  })
  assert.equal(r.status, 200)
  assert.deepEqual(await r.json(), { apagadas: 1 })

  const depois = repo.registros.find(x => x.id === 'reg-foto-velha')
  assert.equal(depois?.fotoPath, null, 'a foto some')
  assert.equal(depois?.tipo, 'meio', 'a batida em si continua existindo')
})

test('evento fechado há menos de 90 dias mantém a foto', async () => {
  const { app, repo, evento } = montar()
  const ontem = new Date(Date.now() - 86_400_000).toISOString()
  evento.dataFim = ontem
  repo.registros.push({
    id: 'reg-foto-recente', participacaoId: 'part-joao', tipo: 'meio', dataRef: '2026-09-05',
    registradoEm: '2026-09-05T12:00:00-03:00', recebidoEm: '2026-09-05T12:00:00-03:00',
    fotoPath: 'ev-hj/part-joao/meio-2026-09-05.jpg', lat: null, lng: null, manual: false,
  })

  const r = await app.request('/manutencao/apagar-fotos-vencidas', {
    method: 'POST',
    headers: { 'X-Segredo-Manutencao': 'segredo-de-manutencao-teste' },
  })
  assert.deepEqual(await r.json(), { apagadas: 0 })
  assert.equal(repo.registros.find(x => x.id === 'reg-foto-recente')?.fotoPath, 'ev-hj/part-joao/meio-2026-09-05.jpg')
})

test('sem dataFim configurado, usa dataInicio como o fechamento', async () => {
  const { app, repo, evento } = montar()
  evento.dataFim = null
  evento.dataInicio = '2026-01-01T18:30:00-03:00' // bem mais de 90 dias no passado
  repo.registros.push({
    id: 'reg-sem-datafim', participacaoId: 'part-joao', tipo: 'meio', dataRef: '2026-01-01',
    registradoEm: '2026-01-01T20:00:00-03:00', recebidoEm: '2026-01-01T20:00:00-03:00',
    fotoPath: 'ev-hj/part-joao/meio-2026-01-01.jpg', lat: null, lng: null, manual: false,
  })

  const r = await app.request('/manutencao/apagar-fotos-vencidas', {
    method: 'POST',
    headers: { 'X-Segredo-Manutencao': 'segredo-de-manutencao-teste' },
  })
  assert.deepEqual(await r.json(), { apagadas: 1 })
})

test('sem segredo configurado, a rota nem existe', async () => {
  const { app } = montar({ segredoManutencao: null })
  const r = await app.request('/manutencao/apagar-fotos-vencidas', {
    method: 'POST',
    headers: { 'X-Segredo-Manutencao': 'qualquer-coisa' },
  })
  assert.equal(r.status, 404)
})

test('lembrete de entrada também exige o segredo — mesma proteção, mesma régua', async () => {
  const { app } = montar()
  const semNada = await app.request('/manutencao/lembrete-entrada', { method: 'POST' })
  assert.equal(semNada.status, 401)

  const errado = await app.request('/manutencao/lembrete-entrada', {
    method: 'POST',
    headers: { 'X-Segredo-Manutencao': 'chute' },
  })
  assert.equal(errado.status, 401)
})

test('com o segredo certo, a rota de lembrete de entrada responde — a regra de quando mandar já é testada em `rotas/lembretes.teste.ts`', async () => {
  const { app } = montar()
  const r = await app.request('/manutencao/lembrete-entrada', {
    method: 'POST',
    headers: { 'X-Segredo-Manutencao': 'segredo-de-manutencao-teste' },
  })
  assert.equal(r.status, 200)
  assert.equal(typeof (await r.json()).enviados, 'number')
})

test('lembrete de saída também exige o segredo, e responde com ele certo', async () => {
  const { app } = montar()
  const semNada = await app.request('/manutencao/lembrete-saida', { method: 'POST' })
  assert.equal(semNada.status, 401)

  const r = await app.request('/manutencao/lembrete-saida', {
    method: 'POST',
    headers: { 'X-Segredo-Manutencao': 'segredo-de-manutencao-teste' },
  })
  assert.equal(r.status, 200)
  assert.equal(typeof (await r.json()).enviados, 'number')
})

test('alerta ao supervisor (entrada e saída) também exige o segredo, e responde com ele certo', async () => {
  const { app } = montar()
  for (const rota of ['/manutencao/alerta-supervisor-entrada', '/manutencao/alerta-supervisor-saida']) {
    const semNada = await app.request(rota, { method: 'POST' })
    assert.equal(semNada.status, 401, rota)

    const r = await app.request(rota, {
      method: 'POST',
      headers: { 'X-Segredo-Manutencao': 'segredo-de-manutencao-teste' },
    })
    assert.equal(r.status, 200, rota)
    assert.equal(typeof (await r.json()).enviados, 'number', rota)
  }
})

// ─── Autenticação ───────────────────────────────────────────────────────────

test('sem token, nada abaixo de /v1 responde', async () => {
  const { app } = montar()
  for (const rota of ['/v1/eu', '/v1/participacoes', '/v1/equipe']) {
    const r = await app.request(rota)
    assert.equal(r.status, 401, `${rota} devia exigir token`)
  }
})

test('token inventado não passa', async () => {
  const { app } = montar()
  const r = await app.request('/v1/eu', { headers: { Authorization: 'Bearer nao-existe' } })
  assert.equal(r.status, 401)
})

test('o login funciona de ponta a ponta', async () => {
  const { app } = montar()
  const cab = await autenticado(app)
  const r = await app.request('/v1/eu', { headers: cab })

  assert.equal(r.status, 200)
  const eu = await r.json() as { nome: string; cpfFinal: string }
  assert.equal(eu.nome, 'João da Silva')
  assert.equal(eu.cpfFinal, '**01', 'o CPF inteiro não trafega')
})

test('código errado devolve 401', async () => {
  const { app } = montar()
  await app.request('/v1/entrar/codigo', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ telefone: '27999255959' }),
  })
  const r = await app.request('/v1/entrar', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ telefone: '27999255959', codigo: '000000' }),
  })
  assert.equal(r.status, 401)
})

// ─── Isolamento ─────────────────────────────────────────────────────────────

test('a participação de outra pessoa devolve 404, não 403', async () => {
  /*
   * 403 diria "existe, mas não é sua" — e isso é uma resposta. Varrendo ids,
   * dá para mapear quais existem. 404 para os dois casos não conta nada.
   */
  const { app } = montar()
  const cab = await autenticado(app, '27988887777') // Maria

  const deOutra = await app.request('/v1/participacoes/part-joao/dias', { headers: cab })
  const inexistente = await app.request('/v1/participacoes/nao-existe/dias', { headers: cab })

  assert.equal(deOutra.status, 404)
  assert.equal(inexistente.status, 404)
  assert.deepEqual(await deOutra.json(), await inexistente.json(), 'as respostas precisam ser idênticas')
})

test('cada um vê só as próprias participações', async () => {
  const { app } = montar()
  const cabJoao = await autenticado(app, '27999255959')
  const cabMaria = await autenticado(app, '27988887777')

  const doJoao = await (await app.request('/v1/participacoes', { headers: cabJoao })).json() as unknown[]
  const daMaria = await (await app.request('/v1/participacoes', { headers: cabMaria })).json() as unknown[]

  assert.equal(doJoao.length, 1)
  assert.equal(daMaria.length, 0, 'Maria ainda não entrou em evento nenhum')
})

// ─── Bater ponto ────────────────────────────────────────────────────────────

test('a batida aceita devolve 200', async () => {
  const { app } = montar()
  const cab = await autenticado(app)

  const r = await app.request('/v1/batidas', {
    method: 'POST', headers: { ...cab, 'content-type': 'application/json' },
    body: JSON.stringify({
      id: 'b1', participacaoId: 'part-joao', tipo: 'entrada',
      registradoEm: '2026-09-03T08:00:00-03:00',
    }),
  })
  assert.equal(r.status, 200)
  assert.equal((await r.json() as { situacao: string }).situacao, 'registrado')
})

test('a batida recusada devolve 422, não 500', async () => {
  /*
   * A distinção sustenta a fila offline: 4xx é DECISÃO, e ela descarta e
   * explica; 5xx é transporte, e ela guarda e tenta de novo. Devolver 500 numa
   * recusa faria o aparelho insistir para sempre em algo que nunca vai passar.
   */
  const { app } = montar()
  const cab = await autenticado(app)

  const r = await app.request('/v1/batidas', {
    method: 'POST', headers: { ...cab, 'content-type': 'application/json' },
    body: JSON.stringify({
      id: 'b1', participacaoId: 'part-joao', tipo: 'entrada',
      registradoEm: '2026-08-20T08:00:00-03:00', // dia fora da escala
    }),
  })
  assert.equal(r.status, 422)
})

test('pedido incompleto devolve 400', async () => {
  const { app } = montar()
  const cab = await autenticado(app)

  const r = await app.request('/v1/batidas', {
    method: 'POST', headers: { ...cab, 'content-type': 'application/json' },
    body: JSON.stringify({ participacaoId: 'part-joao', tipo: 'entrada' }),
  })
  assert.equal(r.status, 400)
})

test('etapa inventada é recusada', async () => {
  const { app } = montar()
  const cab = await autenticado(app)

  const r = await app.request('/v1/batidas', {
    method: 'POST', headers: { ...cab, 'content-type': 'application/json' },
    body: JSON.stringify({
      id: 'b1', participacaoId: 'part-joao', tipo: 'almoco',
      registradoEm: '2026-09-03T08:00:00-03:00',
    }),
  })
  assert.equal(r.status, 400)
})

test('a batida de outra pessoa não passa nem com token válido', async () => {
  const { app } = montar()
  const cab = await autenticado(app, '27988887777') // Maria

  const r = await app.request('/v1/batidas', {
    method: 'POST', headers: { ...cab, 'content-type': 'application/json' },
    body: JSON.stringify({
      id: 'b1', participacaoId: 'part-joao', tipo: 'entrada',
      registradoEm: '2026-09-03T08:00:00-03:00',
    }),
  })
  assert.equal(r.status, 422)
})

// ─── Entrar num evento ──────────────────────────────────────────────────────

test('o fluxo do código de evento funciona por HTTP', async () => {
  const { app } = montar()
  const cab = await autenticado(app, '27988887777')

  const convite = await app.request('/v1/convites/HJK-2026-K7M2', { headers: cab })
  assert.equal(convite.status, 200)

  const criada = await app.request('/v1/participacoes', {
    method: 'POST', headers: { ...cab, 'content-type': 'application/json' },
    body: JSON.stringify({ codigo: 'HJK-2026-K7M2', respostas: { funcao: 'Bar' } }),
  })
  assert.equal(criada.status, 201)
  assert.equal((await criada.json() as { situacao: string }).situacao, 'credenciado')
})

test('código de evento errado devolve 400 com explicação', async () => {
  const { app } = montar()
  const cab = await autenticado(app, '27988887777')

  const r = await app.request('/v1/convites/ABC-2026-9999', { headers: cab })
  assert.equal(r.status, 400)
  assert.match((await r.json() as { erro: string }).erro, /Não encontramos/)
})

// ─── Sessão ─────────────────────────────────────────────────────────────────

test('renovar troca o token de renovação', async () => {
  // Sem trocar, um token vazado valeria sessenta dias inteiros.
  const { app } = montar()
  await app.request('/v1/entrar/codigo', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ telefone: '27999255959' }),
  })
  const entrada = await app.request('/v1/entrar', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ telefone: '27999255959', codigo: '123456' }),
  })
  const { sessao } = await entrada.json() as { sessao: { renovacao: string } }

  const primeira = await app.request('/v1/renovar', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ renovacao: sessao.renovacao }),
  })
  assert.equal(primeira.status, 200)

  const repetida = await app.request('/v1/renovar', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ renovacao: sessao.renovacao }),
  })
  assert.equal(repetida.status, 401, 'o token antigo morre ao ser usado')
})

// ─── Excluir minha conta ────────────────────────────────────────────────────
//
// Autoatendimento do colaborador — LGPD, direito ao esquecimento. Decidido
// com o Juan em 21/09/2026: anonimiza nome/telefone/foto, mas NUNCA toca
// batida, valor a receber ou chave PIX (obrigação trabalhista + a pessoa
// pode ainda ter um pagamento pendente).

test('colaborador exclui a própria conta: fica anônimo, mas o histórico continua', async () => {
  const { app, repo } = montar()
  const cab = await autenticado(app)

  const r = await app.request('/v1/minha-conta/excluir', { method: 'POST', headers: cab })
  assert.equal(r.status, 200)
  assert.deepEqual(await r.json(), {})

  const pessoa = await repo.pessoaPorId('pes-joao')
  assert.equal(pessoa?.nome, 'Pessoa excluída')
  assert.equal(pessoa?.telefone, null)
  assert.equal(pessoa?.fotoPath, null)

  const participacao = await repo.participacaoPorId('part-joao')
  assert.equal(participacao?.valorReceber, 150, 'valor a receber continua intacto')
  assert.equal(participacao?.ativo, true, 'o vínculo com o evento continua ativo')
})

test('depois de excluir a conta, a sessão morre — em qualquer aparelho', async () => {
  const { app } = montar()
  const cab = await autenticado(app)

  await app.request('/v1/minha-conta/excluir', { method: 'POST', headers: cab })

  const depois = await app.request('/v1/eu', { headers: cab })
  assert.equal(depois.status, 401)
})

test('conta de painel (admin/supervisor) não usa esta rota', async () => {
  const { app, amb } = montar()
  const sessao = await amb.sessoes.abrir('auth-admin', 'admin')

  const r = await app.request('/v1/minha-conta/excluir', {
    method: 'POST',
    headers: { Authorization: `Bearer ${sessao.token}` },
  })
  assert.equal(r.status, 400)
})
