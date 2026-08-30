/*
 * O caminho inteiro que a pessoa faz, sem tela.
 *
 * ─── POR QUE ESTE TESTE EXISTE ─────────────────────────────────────────────
 *
 * Os outros testes deste app olham uma peça de cada vez: a máscara do telefone,
 * a guarda da sessão, o formulário. Nenhum deles pega o erro mais comum de
 * todos, que é a LIGAÇÃO entre elas — a tela mandando o telefone com máscara
 * para um servidor que espera só dígitos, ou guardando a sessão errada.
 *
 * Aqui as peças são usadas na mesma ordem em que as telas usam:
 *
 *     entrar.tsx        pedirCodigo → entrar → guarda.abrir
 *     index.tsx         minhasParticipacoes
 *     novo-evento.tsx   consultarConvite → camposFaltando → entrarNoEvento
 *
 * O que fica de fora é o desenho: cor, posição, toque. Isso só se confere
 * abrindo o app. O que este teste garante é que, quando a pessoa tocar nos
 * botões na ordem certa, a coisa acontece.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { camposFaltando } from './campos.js'
import { criarCliente } from './dados/cliente.js'
import { GuardaDaSessao, type Cofre } from './sessao/guarda.js'
import { telefoneParaEnvio, telefoneValido } from './telefone.js'

const CODIGO_DO_EVENTO = 'HJK-2026-K7M2'
/** Como o número sai do campo de texto: já com máscara. */
const COMO_A_PESSOA_DIGITA = '(27) 99925-5959'

function cofreEmMemoria(): Cofre & { dados: Map<string, string> } {
  const dados = new Map<string, string>()
  return {
    dados,
    ler: async c => dados.get(c) ?? null,
    gravar: async (c, v) => { dados.set(c, v) },
    apagar: async c => { dados.delete(c) },
  }
}

/** Sem atraso: o meio segundo da demonstração serve para o olho, não para o teste. */
function clienteDeTeste() {
  return criarCliente({ atrasoMs: 0 })
}

test('do login até estar credenciada no evento', async () => {
  const cliente = clienteDeTeste()
  const cofre = cofreEmMemoria()
  const guarda = new GuardaDaSessao({ cofre, renovar: r => cliente.renovar(r) })

  // ── entrar.tsx ────────────────────────────────────────────────────────────
  assert.ok(telefoneValido(COMO_A_PESSOA_DIGITA), 'o botão precisa acender')

  const pedido = await cliente.pedirCodigo(telefoneParaEnvio(COMO_A_PESSOA_DIGITA))
  assert.equal(pedido.enviado, true, 'o servidor recusaria o número com máscara')

  const entrada = await cliente.entrar(telefoneParaEnvio(COMO_A_PESSOA_DIGITA), '123456')
  assert.ok(entrada.sessao, entrada.erro ?? 'era para entrar')
  await guarda.abrir(entrada.sessao)

  // ── index.tsx ─────────────────────────────────────────────────────────────
  assert.deepEqual(await cliente.minhasParticipacoes(), [], 'conta nova não tem evento')

  // ── novo-evento.tsx ───────────────────────────────────────────────────────
  const consulta = await cliente.consultarConvite(CODIGO_DO_EVENTO)
  assert.ok(consulta.convite, consulta.erro ?? 'o código certo tinha que achar o evento')

  const respostas = { funcao: 'Auxiliar de palco', uniforme: 'M' }
  assert.deepEqual(camposFaltando(consulta.convite.camposExtras, respostas), [])

  const inscricao = await cliente.entrarNoEvento(CODIGO_DO_EVENTO, respostas)
  assert.ok(inscricao.participacao, inscricao.erro ?? 'era para entrar no evento')
  assert.equal(inscricao.participacao.situacao, 'credenciado')

  // ── de volta ao index.tsx ─────────────────────────────────────────────────
  const lista = await cliente.minhasParticipacoes()
  assert.equal(lista.length, 1)
  assert.equal(lista[0]?.funcao, 'Auxiliar de palco')
})

test('a pessoa fecha o app e reabre ainda dentro do evento', async () => {
  /*
   * O caso real: ela se inscreve na véspera e abre o app de novo no portão. Ter
   * que fazer login outra vez, no portão, com fila atrás, seria o suficiente
   * para ela desistir do app e pedir o link.
   */
  const cofre = cofreEmMemoria()
  const primeira = clienteDeTeste()
  const guarda = new GuardaDaSessao({ cofre, renovar: r => primeira.renovar(r) })

  const numero = telefoneParaEnvio(COMO_A_PESSOA_DIGITA)
  await primeira.pedirCodigo(numero)
  const entrada = await primeira.entrar(numero, '123456')
  assert.ok(entrada.sessao, entrada.erro ?? 'era para entrar')
  await guarda.abrir(entrada.sessao)
  await primeira.entrarNoEvento(CODIGO_DO_EVENTO, { funcao: 'Auxiliar', uniforme: 'M' })

  // App fechado. Objetos novos, só o cofre sobrevive — é o que acontece de fato.
  const depois = new GuardaDaSessao({ cofre, renovar: async () => ({}) })
  const guardada = await depois.carregar()
  assert.ok(guardada, 'a sessão tinha que estar no aparelho')

  const segunda = criarCliente({ atrasoMs: 0, sessao: guardada })
  const eu = await segunda.eu()
  assert.equal(eu.papel, 'colaborador')
})

test('código de evento errado é recusado com explicação, não com silêncio', async () => {
  const cliente = clienteDeTeste()
  await cliente.pedirCodigo('27999255959')
  await cliente.entrar('27999255959', '123456')

  const r = await cliente.consultarConvite('ABC-2026-XXXX')
  assert.equal(r.convite, undefined)
  assert.ok(r.erro && r.erro.length > 10, 'a tela precisa de uma frase para mostrar')
})

test('o formulário do evento aponta o que falta, em vez de só travar', async () => {
  const cliente = clienteDeTeste()
  await cliente.pedirCodigo('27999255959')
  await cliente.entrar('27999255959', '123456')

  const { convite } = await cliente.consultarConvite(CODIGO_DO_EVENTO)
  const faltando = camposFaltando(convite!.camposExtras, { funcao: 'Auxiliar' })
  assert.deepEqual(faltando.map(f => f.rotulo), ['Tamanho do uniforme'])

  // E o servidor concorda: a tela não está sendo mais exigente que ele.
  const r = await cliente.entrarNoEvento(CODIGO_DO_EVENTO, { funcao: 'Auxiliar' })
  assert.equal(r.participacao, undefined)
})
