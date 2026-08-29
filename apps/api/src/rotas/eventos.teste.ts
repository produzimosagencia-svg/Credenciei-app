/*
 * Entrar num evento e consultar o que é meu.
 *
 * O tema destes testes é isolamento: com vinte mil contas no mesmo banco, o
 * jeito mais provável de vazar dado é um endpoint aceitar um id sem conferir
 * de quem ele é.
 */
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { cenarioHenriqueEJuliano } from '../dados/memoria.js'
import { esquecerLimites } from '../limite.js'
import { registrarBatida } from './batidas.js'
import {
  consultarConvite, entrarNoEvento, meuFinanceiro, meuQr, meusDias,
  minhasParticipacoes, type CampoExtra,
} from './eventos.js'

const CODIGO = 'HJK-2026-K7M2'
const SEGREDO = 'segredo-de-teste'

const CAMPOS: CampoExtra[] = [
  { chave: 'funcao', rotulo: 'Sua função no evento', tipo: 'texto', obrigatorio: true },
  { chave: 'uniforme', rotulo: 'Tamanho do uniforme', tipo: 'escolha', obrigatorio: true, opcoes: ['P', 'M', 'G'] },
]
const campos = async () => CAMPOS

/** Uma segunda pessoa, para os testes de isolamento terem contra quem testar. */
function comDuasPessoas() {
  const c = cenarioHenriqueEJuliano()
  c.repo.pessoas.push({
    id: 'pes-maria', nome: 'Maria Souza', cpf: '98765432100',
    telefone: '27988887777', fotoPath: null,
  })
  return c
}

beforeEach(() => esquecerLimites())

// ─── O código do evento ─────────────────────────────────────────────────────

test('código errado não revela nada além de não existir', async () => {
  const { repo } = comDuasPessoas()
  const r = await consultarConvite(repo, campos, 'pes-maria', 'ABC-2026-9999')
  assert.match(r.erro ?? '', /Não encontramos um evento/)
})

test('o convite pede só o que a conta ainda não sabe', async () => {
  const { repo } = comDuasPessoas()
  const { convite } = await consultarConvite(repo, campos, 'pes-maria', CODIGO)

  const chaves = convite!.camposExtras.map(x => x.chave)
  for (const jaSabido of ['nome', 'cpf', 'telefone']) {
    assert.ok(!chaves.includes(jaSabido), `${jaSabido} não devia ser pedido de novo`)
  }
})

test('quem já está no evento é levado para ele, não recadastrado', async () => {
  const { repo } = comDuasPessoas()
  // João já tem participação no cenário.
  const r = await consultarConvite(repo, campos, 'pes-joao', CODIGO)
  assert.match(r.erro ?? '', /já está neste evento/)
})

test('força bruta no código é barrada', async () => {
  const { repo } = comDuasPessoas()
  for (let i = 0; i < 20; i++) {
    await consultarConvite(repo, campos, 'pes-maria', `ABC-2026-${String(i).padStart(4, '0')}`)
  }
  const r = await consultarConvite(repo, campos, 'pes-maria', 'ABC-2026-9999')
  assert.match(r.erro ?? '', /Muitas tentativas/)
})

test('o limite é por pessoa, não global', async () => {
  // Se fosse global, um curioso travaria o cadastro do evento inteiro.
  const { repo } = comDuasPessoas()
  for (let i = 0; i < 20; i++) {
    await consultarConvite(repo, campos, 'pes-maria', `ABC-2026-${String(i).padStart(4, '0')}`)
  }
  const outro = await consultarConvite(repo, campos, 'pes-joao', CODIGO)
  assert.ok(!/Muitas tentativas/.test(outro.erro ?? ''))
})

// ─── Entrar ─────────────────────────────────────────────────────────────────

test('campo obrigatório em branco não deixa entrar', async () => {
  const { repo } = comDuasPessoas()
  const r = await entrarNoEvento(repo, campos, 'pes-maria', CODIGO, { funcao: 'Bar' }, () => 'tk')
  assert.match(r.erro ?? '', /Tamanho do uniforme/)
})

test('entrar cria o vínculo credenciado', async () => {
  const { repo } = comDuasPessoas()
  const r = await entrarNoEvento(
    repo, campos, 'pes-maria', CODIGO, { funcao: 'Bar', uniforme: 'M' }, () => 'tk-maria',
  )
  assert.equal(r.participacao!.situacao, 'credenciado')
  assert.equal(r.participacao!.funcao, 'Bar')
})

test('evento que exige aprovação deixa a pessoa aguardando', async () => {
  const { repo, evento } = comDuasPessoas()
  evento.exigeAprovacao = true

  const r = await entrarNoEvento(
    repo, campos, 'pes-maria', CODIGO, { funcao: 'Bar', uniforme: 'M' }, () => 'tk',
  )
  assert.equal(r.participacao!.situacao, 'aguardando_aprovacao')

  // E aguardando não bate ponto — reusa `ativo`, que toda a API já respeita.
  const b = await registrarBatida(repo, 'pes-maria', {
    id: 'b1', participacaoId: r.participacao!.participacaoId,
    tipo: 'entrada', registradoEm: '2026-09-03T08:00:00-03:00',
  })
  assert.equal(b.situacao, 'recusado')
})

// ─── Isolamento ─────────────────────────────────────────────────────────────

test('não dá para ver a participação de outra pessoa', async () => {
  const { repo } = comDuasPessoas()
  for (const chamada of [
    () => meusDias(repo, 'pes-maria', 'part-joao'),
    () => meuFinanceiro(repo, 'pes-maria', 'part-joao'),
    () => meuQr(repo, SEGREDO, 'pes-maria', 'part-joao'),
  ]) {
    await assert.rejects(chamada, /não encontrada/)
  }
})

test('id inexistente e id de outra pessoa dão a mesma resposta', async () => {
  const { repo } = comDuasPessoas()
  const a = await meusDias(repo, 'pes-maria', 'part-joao').catch(e => (e as Error).message)
  const b = await meusDias(repo, 'pes-maria', 'part-nao-existe').catch(e => (e as Error).message)
  assert.equal(a, b, 'diferenciar entregaria um jeito de varrer ids')
})

test('minhas participações trazem só as minhas', async () => {
  const { repo } = comDuasPessoas()
  await entrarNoEvento(repo, campos, 'pes-maria', CODIGO, { funcao: 'Bar', uniforme: 'M' }, () => 'tk')

  const daMaria = await minhasParticipacoes(repo, 'pes-maria')
  const doJoao = await minhasParticipacoes(repo, 'pes-joao')

  assert.equal(daMaria.length, 1)
  assert.equal(doJoao.length, 1)
  assert.notEqual(daMaria[0]!.participacaoId, doJoao[0]!.participacaoId)
})

// ─── Histórico ──────────────────────────────────────────────────────────────

test('o histórico mostra os dias sem batida também', async () => {
  const { repo } = comDuasPessoas()
  await registrarBatida(repo, 'pes-joao', {
    id: 'b1', participacaoId: 'part-joao', tipo: 'entrada',
    registradoEm: '2026-09-03T08:00:00-03:00',
  })

  const dias = await meusDias(repo, 'pes-joao', 'part-joao')
  assert.equal(dias.length, 4)
  assert.equal(dias.find(d => d.data === '2026-09-04')!.compareceu, false, 'a ausência precisa aparecer')

  assert.equal(dias.find(d => d.data === '2026-09-03')!.etapa, 'montagem')
  assert.equal(dias.find(d => d.data === '2026-09-05')!.etapa, 'evento')
  assert.equal(dias.find(d => d.data === '2026-09-06')!.etapa, 'desmontagem')
})

test('dia com batida fora da escala aparece mesmo assim', async () => {
  /*
   * Acontece quando o produtor desmarca um dia depois de alguém ter trabalhado
   * nele. Esconder seria pior: o trabalho daquele dia foi feito.
   */
  const { repo } = comDuasPessoas()
  repo.registros.push({
    id: 'fora', participacaoId: 'part-joao', tipo: 'entrada',
    dataRef: '2026-09-01', registradoEm: '2026-09-01T08:00:00-03:00',
    recebidoEm: '2026-09-01T08:00:00-03:00', fotoPath: null, lat: null, lng: null,
  })

  const dias = await meusDias(repo, 'pes-joao', 'part-joao')
  assert.ok(dias.some(d => d.data === '2026-09-01' && d.compareceu))
})

test('o meio atrasado é medido, não escondido', async () => {
  const { repo } = comDuasPessoas()
  await registrarBatida(repo, 'pes-joao', {
    id: 'e', participacaoId: 'part-joao', tipo: 'entrada', registradoEm: '2026-09-03T08:00:00-03:00',
  })
  // Janela: abre 12:00, prazo até 14:00. Registrou 14:40.
  await registrarBatida(repo, 'pes-joao', {
    id: 'm', participacaoId: 'part-joao', tipo: 'meio', registradoEm: '2026-09-03T14:40:00-03:00',
  })

  const dia = (await meusDias(repo, 'pes-joao', 'part-joao')).find(d => d.data === '2026-09-03')!
  assert.equal(dia.meioAtrasoMin, 40)
})

// ─── Financeiro ─────────────────────────────────────────────────────────────

test('o financeiro conta só os dias trabalhados', async () => {
  const { repo } = comDuasPessoas()
  await registrarBatida(repo, 'pes-joao', {
    id: 'e', participacaoId: 'part-joao', tipo: 'entrada', registradoEm: '2026-09-03T08:00:00-03:00',
  })

  const f = await meuFinanceiro(repo, 'pes-joao', 'part-joao')
  assert.equal(f.diasTrabalhados, 1)
  assert.equal(f.valorPrevisto, 150)
  assert.equal(f.situacao, 'em_processamento')
})

test('sem valor definido, a tela não diz zero', async () => {
  // Zero é uma afirmação: "você não vai receber nada". A verdade é "ainda não
  // definido", e a tela precisa poder dizer isso.
  const { repo, participacao } = comDuasPessoas()
  participacao.valorReceber = null

  const f = await meuFinanceiro(repo, 'pes-joao', 'part-joao')
  assert.equal(f.valorPrevisto, null)
})

// ─── QR ─────────────────────────────────────────────────────────────────────

test('o QR troca de etapa junto com o dia', async () => {
  const { repo } = comDuasPessoas()
  const naMontagem = await meuQr(repo, SEGREDO, 'pes-joao', 'part-joao', new Date('2026-09-03T10:00:00-03:00'))
  const noEvento = await meuQr(repo, SEGREDO, 'pes-joao', 'part-joao', new Date('2026-09-05T10:00:00-03:00'))
  const naDesmontagem = await meuQr(repo, SEGREDO, 'pes-joao', 'part-joao', new Date('2026-09-06T10:00:00-03:00'))

  assert.equal(naMontagem.etapa, 'montagem')
  assert.equal(noEvento.etapa, 'evento')
  assert.equal(naDesmontagem.etapa, 'desmontagem')

  assert.equal(new Set([naMontagem.codigo, noEvento.codigo, naDesmontagem.codigo]).size, 3,
    'as três etapas têm crachás diferentes')
})

test('o mesmo QR vale em todos os dias da montagem', async () => {
  const { repo } = comDuasPessoas()
  const a = await meuQr(repo, SEGREDO, 'pes-joao', 'part-joao', new Date('2026-09-03T10:00:00-03:00'))
  const b = await meuQr(repo, SEGREDO, 'pes-joao', 'part-joao', new Date('2026-09-04T10:00:00-03:00'))
  assert.equal(a.codigo, b.codigo, 'não muda a cada dia — muda a cada etapa')
})
