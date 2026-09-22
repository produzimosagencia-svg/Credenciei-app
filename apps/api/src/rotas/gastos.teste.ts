import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EVENTO_INTERNO } from '@credenciei/dominio'
import { cenarioHenriqueEJuliano } from '../dados/memoria.js'
import { ArquivosEmMemoria } from '../arquivos.js'
import {
  criarGasto, editarGasto, eventosParaGastos, excluirGasto, exportarGastosXlsx, listarGastos,
  painelDeGastos, transcreverAudioDeGasto, urlComprovanteGasto,
} from './gastos.js'
import type { Evento, Repositorio } from '../dados/repositorio.js'

/** Um segundo evento, mesma organização, pra provar o escopo do produtor. */
function comSegundoEvento(repo: Repositorio & { eventos: Evento[] }): void {
  repo.eventos.push({
    id: 'ev-2', nome: 'Manos da Vila', descricao: null, organizacaoId: 'org-1', organizacaoNome: 'Produzimos',
    local: 'Lagun', dataInicio: '2026-08-29T20:00:00-03:00', dataFim: null,
    janela_entrada_inicio: null, janela_entrada_fim: null, janela_fim_inicio: null, janela_fim_fim: null,
    batida_livre: false, checkin_autonomo: false, codigoConvite: 'MDV-2026-X1Y2', exigeAprovacao: false, ativo: true,
  })
}

function montarComProdutor() {
  const cenario = cenarioHenriqueEJuliano()
  comSegundoEvento(cenario.repo)
  const produtor = { id: 'auth-produtor', nome: 'Carla Produtora', papel: 'produtor' as const, organizacaoId: 'org-1', ativo: true }
  cenario.repo.perfis.push(produtor)
  // Só ev-hj vinculado — ev-2 fica de fora de propósito, pra testar o escopo.
  cenario.repo.produtorEventos.push({ produtorId: produtor.id, eventoId: cenario.evento.id })
  return { ...cenario, produtor }
}

const DADOS_BASE = {
  eventoId: 'ev-hj', descricao: 'Aluguel de gerador', valor: 500, categoria: 'Equipamentos',
  dataGasto: '2026-09-04', fornecedor: null, formaPagamento: null, pagador: null, pago: true,
  observacao: null, origem: 'manual' as const, transcricao: null, comprovanteBase64: null,
}

// ─── Permissão e escopo ─────────────────────────────────────────────────────

test('admin e supervisor não têm acesso a Gastos — é produto à parte', async () => {
  const { repo, admin } = montarComProdutor()
  await assert.rejects(() => eventosParaGastos(repo, admin.id), /permissão|acesso/i)
})

test('o produtor só enxerga o evento vinculado a ele, mais o Interno', async () => {
  const { repo, produtor } = montarComProdutor()
  const eventos = await eventosParaGastos(repo, produtor.id)
  const ids = eventos.map(e => e.id)

  assert.ok(ids.includes('ev-hj'))
  assert.ok(!ids.includes('ev-2'), 'ev-2 não está vinculado a este produtor')
  assert.equal(ids.at(-1), EVENTO_INTERNO)
})

test('o master (dando suporte) vê todos os eventos', async () => {
  const { repo, master } = montarComProdutor()
  const eventos = await eventosParaGastos(repo, master.id)
  assert.ok(eventos.some(e => e.id === 'ev-hj'))
  assert.ok(eventos.some(e => e.id === 'ev-2'))
})

// ─── Criar ───────────────────────────────────────────────────────────────────

test('criar gasto exige descrição e valor válido, maior que zero', async () => {
  const { repo, produtor } = montarComProdutor()
  assert.match((await criarGasto(repo, produtor.id, { ...DADOS_BASE, descricao: '' })).erro ?? '', /gasto/i)
  assert.match((await criarGasto(repo, produtor.id, { ...DADOS_BASE, valor: 0 })).erro ?? '', /valor/i)
  assert.match((await criarGasto(repo, produtor.id, { ...DADOS_BASE, valor: Number.NaN })).erro ?? '', /valor/i)
})

test('produtor não cria gasto fora do escopo dele', async () => {
  const { repo, produtor } = montarComProdutor()
  const r = await criarGasto(repo, produtor.id, { ...DADOS_BASE, eventoId: 'ev-2' })
  assert.match(r.erro ?? '', /disponível/i)
})

test('gasto criado aparece na listagem, com categoria inválida virando "Outros"', async () => {
  const { repo, produtor } = montarComProdutor()
  const r = await criarGasto(repo, produtor.id, { ...DADOS_BASE, categoria: 'Não Existe' })
  assert.ok(r.id, r.erro)

  const gastos = await listarGastos(repo, produtor.id, { eventoId: 'ev-hj' })
  const novo = gastos.find(g => g.id === r.id)!
  assert.equal(novo.categoria, 'Outros')
  assert.equal(novo.eventoNome, 'Henrique e Juliano — Kleber Andrade')
  assert.equal(novo.criadoPorNome, 'Carla Produtora')
})

test('gasto "Interno" nasce sem evento, e o master vê o Interno de qualquer organização', async () => {
  const { repo, produtor, master } = montarComProdutor()
  const r = await criarGasto(repo, produtor.id, { ...DADOS_BASE, eventoId: EVENTO_INTERNO })
  assert.ok(r.id, r.erro)

  const doProdutor = await listarGastos(repo, produtor.id, { eventoId: EVENTO_INTERNO })
  assert.ok(doProdutor.some(g => g.id === r.id))

  const doMaster = await listarGastos(repo, master.id, { eventoId: EVENTO_INTERNO })
  assert.ok(doMaster.some(g => g.id === r.id))
})

// ─── Listar / filtrar ───────────────────────────────────────────────────────

test('sem eventoId, lista tudo que o perfil enxerga — mas nunca o de fora do escopo', async () => {
  const { repo, produtor } = montarComProdutor()
  await criarGasto(repo, produtor.id, { ...DADOS_BASE, eventoId: 'ev-hj' })
  await criarGasto(repo, produtor.id, { ...DADOS_BASE, eventoId: EVENTO_INTERNO })

  const gastos = await listarGastos(repo, produtor.id)
  assert.ok(gastos.every(g => g.eventoId !== 'ev-2'))
  assert.ok(gastos.some(g => g.eventoId === 'ev-hj'))
  assert.ok(gastos.some(g => g.eventoId === EVENTO_INTERNO))
})

test('listarGastos filtra por categoria e por pago', async () => {
  const { repo, produtor } = montarComProdutor()
  await criarGasto(repo, produtor.id, { ...DADOS_BASE, categoria: 'Transporte', pago: false })
  await criarGasto(repo, produtor.id, { ...DADOS_BASE, categoria: 'Alimentação', pago: true })

  const transporte = await listarGastos(repo, produtor.id, { eventoId: 'ev-hj', categoria: 'Transporte' })
  assert.ok(transporte.every(g => g.categoria === 'Transporte'))

  const aPagar = await listarGastos(repo, produtor.id, { eventoId: 'ev-hj', pago: 'false' })
  assert.ok(aPagar.every(g => g.pago === false))
})

test('produtor não lista gasto de evento fora do escopo dele', async () => {
  const { repo, produtor } = montarComProdutor()
  await assert.rejects(() => listarGastos(repo, produtor.id, { eventoId: 'ev-2' }), /disponível/i)
})

// ─── Editar / excluir ───────────────────────────────────────────────────────

test('editar gasto troca os campos; id inexistente é recusado', async () => {
  const { repo, produtor } = montarComProdutor()
  const criado = await criarGasto(repo, produtor.id, DADOS_BASE)

  const r = await editarGasto(repo, produtor.id, criado.id!, { ...DADOS_BASE, descricao: 'Corrigido', valor: 777 })
  assert.equal(r.erro, undefined)

  const gastos = await listarGastos(repo, produtor.id, { eventoId: 'ev-hj' })
  const editado = gastos.find(g => g.id === criado.id)!
  assert.equal(editado.descricao, 'Corrigido')
  assert.equal(editado.valor, 777)

  const inexistente = await editarGasto(repo, produtor.id, 'gasto-999', DADOS_BASE)
  assert.ok(inexistente.erro)
})

test('excluir gasto some da listagem; excluir de novo é recusado', async () => {
  const { repo, produtor } = montarComProdutor()
  const criado = await criarGasto(repo, produtor.id, DADOS_BASE)

  const r = await excluirGasto(repo, produtor.id, criado.id!)
  assert.equal(r.erro, undefined)
  assert.ok(!(await listarGastos(repo, produtor.id, { eventoId: 'ev-hj' })).some(g => g.id === criado.id))

  const de_novo = await excluirGasto(repo, produtor.id, criado.id!)
  assert.ok(de_novo.erro)
})

// ─── Comprovante ────────────────────────────────────────────────────────────

test('comprovante: null sem anexo, uma URL quando tem', async () => {
  const { repo, produtor } = montarComProdutor()
  const semAnexo = await criarGasto(repo, produtor.id, DADOS_BASE)
  const comAnexo = await criarGasto(repo, produtor.id, { ...DADOS_BASE, comprovanteBase64: 'data:image/jpeg;base64,abc' })

  assert.equal((await urlComprovanteGasto(repo, produtor.id, semAnexo.id!)).url, null)
  assert.ok((await urlComprovanteGasto(repo, produtor.id, comAnexo.id!)).url)
})

// ─── Transcrever áudio ──────────────────────────────────────────────────────

const INTERPRETAR_DE_MENTIRA = async () => ({
  transcricao: 'gastei 200 reais com combustível', valor: 200, descricao: 'Combustível',
  fornecedor: null, categoria: 'Transporte', dataGasto: '2026-09-04', precisaConfirmar: ['fornecedor'],
})

test('transcrever fora do escopo do produtor é recusado, sem chamar a IA', async () => {
  const { repo, produtor } = montarComProdutor()
  let chamou = false
  const r = await transcreverAudioDeGasto(
    repo, produtor.id, async (...a) => { chamou = true; return INTERPRETAR_DE_MENTIRA() },
    'data:audio/mp4;base64,abc', 'audio/mp4', 'ev-2',
  )
  assert.ok('erro' in r && /disponível/i.test(r.erro))
  assert.equal(chamou, false)
})

test('transcrever sem áudio é recusado', async () => {
  const { repo, produtor } = montarComProdutor()
  const r = await transcreverAudioDeGasto(repo, produtor.id, INTERPRETAR_DE_MENTIRA, '', 'audio/mp4', 'ev-hj')
  assert.ok('erro' in r && /áudio/i.test(r.erro))
})

test('transcrever devolve os campos que a IA extraiu', async () => {
  const { repo, produtor } = montarComProdutor()
  const r = await transcreverAudioDeGasto(
    repo, produtor.id, INTERPRETAR_DE_MENTIRA, 'data:audio/mp4;base64,YWJj', 'audio/mp4', 'ev-hj',
  )
  assert.ok(!('erro' in r))
  if (!('erro' in r)) assert.equal(r.valor, 200)
})

test('erro da IA vira `{erro}`, não uma exceção que derruba a rota', async () => {
  const { repo, produtor } = montarComProdutor()
  const r = await transcreverAudioDeGasto(
    repo, produtor.id, async () => { throw new Error('A leitura de áudio ainda não foi configurada.') },
    'data:audio/mp4;base64,YWJj', 'audio/mp4', 'ev-hj',
  )
  assert.ok('erro' in r && /não foi configurada/i.test(r.erro))
})

// ─── Painel ──────────────────────────────────────────────────────────────────

test('painel soma os KPIs do recorte filtrado', async () => {
  const { repo, produtor } = montarComProdutor()
  await criarGasto(repo, produtor.id, { ...DADOS_BASE, valor: 100 })
  await criarGasto(repo, produtor.id, { ...DADOS_BASE, valor: 250 })

  const painel = await painelDeGastos(repo, produtor.id, { eventoId: 'ev-hj' })
  assert.equal(painel.kpis.quantidade, 2)
  assert.equal(painel.kpis.total, 350)
  assert.ok(painel.graficos.porCategoria.length > 0)
})

// ─── Exportar ────────────────────────────────────────────────────────────────

test('exportar exige o evento, e devolve nome + url quando dá certo', async () => {
  const { repo, produtor } = montarComProdutor()
  await criarGasto(repo, produtor.id, DADOS_BASE)
  const arquivos = new ArquivosEmMemoria('http://api.local')

  const semEvento = await exportarGastosXlsx(repo, produtor.id, {}, arquivos)
  assert.ok('erro' in semEvento)

  const r = await exportarGastosXlsx(repo, produtor.id, { eventoId: 'ev-hj' }, arquivos)
  assert.ok('nome' in r && r.nome.endsWith('.xlsx'))
  assert.ok('url' in r && r.url.startsWith('http://api.local/arquivos/'))
})

test('exportar evento fora do escopo é recusado', async () => {
  const { repo, produtor } = montarComProdutor()
  const arquivos = new ArquivosEmMemoria('http://api.local')
  const r = await exportarGastosXlsx(repo, produtor.id, { eventoId: 'ev-2' }, arquivos)
  assert.ok('erro' in r && /disponível/i.test(r.erro))
})
