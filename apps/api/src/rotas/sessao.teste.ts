/*
 * O login.
 *
 * É a porta da frente de vinte mil contas. Os testes aqui cobrem menos "o
 * caminho feliz funciona" e mais "o que um curioso consegue descobrir".
 */
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { cenarioHenriqueEJuliano } from '../dados/memoria.js'
import { esquecerLimites } from '../limite.js'
import {
  pedirCodigo, entrar, TENTATIVAS_MAXIMAS, VALIDADE_DO_CODIGO_MS,
  type CodigoPendente, type Dependencias, type GuardaDeCodigos,
} from './sessao.js'

/** Guarda de códigos em memória. */
function guardaFalsa(): GuardaDeCodigos & { conteudo: Map<string, CodigoPendente> } {
  const conteudo = new Map<string, CodigoPendente>()
  return {
    conteudo,
    async guardar(c) { conteudo.set(c.telefone, c) },
    async buscar(t) { return conteudo.get(t) ?? null },
    async apagar(t) { conteudo.delete(t) },
  }
}

function montar(agora = () => Date.parse('2026-09-01T10:00:00-03:00')) {
  const { repo, pessoa } = cenarioHenriqueEJuliano()
  const enviados: { telefone: string; codigo: string }[] = []
  const codigos = guardaFalsa()

  const dep: Dependencias = {
    repo,
    codigos,
    enviar: async (telefone, codigo) => { enviados.push({ telefone, codigo }) },
    sortear: () => '123456',
    agora,
  }
  return { dep, repo, pessoa, enviados, codigos }
}

beforeEach(() => esquecerLimites())

// ─── Pedir o código ─────────────────────────────────────────────────────────

test('número cadastrado recebe o código', async () => {
  const { dep, enviados } = montar()
  const r = await pedirCodigo(dep, '27 99925-5959')

  assert.equal(r.enviado, true)
  assert.equal(enviados.length, 1)
  assert.equal(enviados[0]!.telefone, '27999255959', 'a máscara não atrapalha')
})

test('número que não existe também responde "enviado"', async () => {
  /*
   * Dizer "não encontramos esse número" transformaria a tela de login numa
   * consulta: bastaria testar números até descobrir quem está cadastrado.
   */
  const { dep, enviados } = montar()
  const r = await pedirCodigo(dep, '11988887777')

  assert.equal(r.enviado, true, 'a resposta é igual à do número cadastrado')
  assert.equal(enviados.length, 0, 'mas nenhuma mensagem é gasta')
})

test('número incompleto é recusado com instrução', async () => {
  const { dep } = montar()
  for (const ruim of ['999', '', '9992559']) {
    const r = await pedirCodigo(dep, ruim)
    assert.equal(r.enviado, false)
    assert.match(r.erro ?? '', /com DDD/)
  }
})

test('não dá para encher o WhatsApp de alguém com pedidos', async () => {
  const { dep, enviados } = montar()
  for (let i = 0; i < 3; i++) await pedirCodigo(dep, '27999255959')

  const quarto = await pedirCodigo(dep, '27999255959')
  assert.equal(quarto.enviado, false)
  assert.match(quarto.erro ?? '', /Espere alguns minutos/)
  assert.equal(enviados.length, 3, 'o quarto não gastou envio')
})

// ─── Entrar ─────────────────────────────────────────────────────────────────

test('o código certo abre a sessão', async () => {
  const { dep, pessoa } = montar()
  await pedirCodigo(dep, '27999255959')

  const r = await entrar(dep, '27999255959', '123456')
  assert.ok(r.ok && r.pessoaId === pessoa.id)
})

test('o código só serve uma vez', async () => {
  const { dep } = montar()
  await pedirCodigo(dep, '27999255959')

  assert.ok((await entrar(dep, '27999255959', '123456')).ok)
  const segunda = await entrar(dep, '27999255959', '123456')
  assert.ok(!segunda.ok, 'código de uso único não pode servir duas vezes')
})

test('todas as recusas dizem a mesma coisa', async () => {
  /*
   * Mensagens diferentes contariam se aquele número tem código em aberto — e,
   * por tabela, se ele está cadastrado.
   */
  const { dep } = montar()

  const semPedir = await entrar(dep, '27999255959', '123456')
  await pedirCodigo(dep, '27999255959')
  const codigoErrado = await entrar(dep, '27999255959', '999999')
  const naoCadastrado = await entrar(dep, '11988887777', '123456')

  const motivos = [semPedir, codigoErrado, naoCadastrado].map(r => (r.ok ? '' : r.erro))
  assert.equal(new Set(motivos).size, 1, `divergiram: ${JSON.stringify(motivos)}`)
})

test('o código expira', async () => {
  let t = Date.parse('2026-09-01T10:00:00-03:00')
  const { dep } = montar(() => t)
  await pedirCodigo(dep, '27999255959')

  t += VALIDADE_DO_CODIGO_MS + 1_000
  const r = await entrar(dep, '27999255959', '123456')
  assert.ok(!r.ok)
})

test('o código queima depois de algumas tentativas', async () => {
  // Seis dígitos são um milhão de combinações — adivinháveis em minutos se o
  // código sobrevivesse a tentativas ilimitadas.
  const { dep, codigos } = montar()
  await pedirCodigo(dep, '27999255959')

  for (let i = 0; i < TENTATIVAS_MAXIMAS; i++) {
    await entrar(dep, '27999255959', '000000')
  }
  assert.equal(codigos.conteudo.size, 0, 'o código foi destruído')

  const comOCerto = await entrar(dep, '27999255959', '123456')
  assert.ok(!comOCerto.ok, 'nem o código certo abre depois disso')
})

test('errar poucas vezes não queima o código', async () => {
  const { dep } = montar()
  await pedirCodigo(dep, '27999255959')

  await entrar(dep, '27999255959', '000000')
  await entrar(dep, '27999255959', '111111')

  const r = await entrar(dep, '27999255959', '123456')
  assert.ok(r.ok, 'quem digitou errado duas vezes ainda consegue entrar')
})

test('a máscara do telefone não separa as tentativas', async () => {
  // Sem normalizar, "27 99925-5959" e "27999255959" contariam como números
  // diferentes — e o limite de tentativas seria contornável só mudando a
  // pontuação.
  const { dep } = montar()
  await pedirCodigo(dep, '27999255959')

  const r = await entrar(dep, '(27) 99925-5959', '123 456')
  assert.ok(r.ok)
})
