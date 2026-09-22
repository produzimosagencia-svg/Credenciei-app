import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  categoriaValida, CATEGORIAS_GASTO, dadosDosGraficosDeGastos, kpisDeGastos,
  type GastoParaCalculo,
} from './gastos.js'

test('categoriaValida aceita só o que está na lista, ignorando maiúscula/minúscula', () => {
  assert.equal(categoriaValida('estrutura'), 'Estrutura')
  assert.equal(categoriaValida('ESTRUTURA'), 'Estrutura')
  assert.equal(categoriaValida('Estrutura'), 'Estrutura')
  assert.equal(categoriaValida('Algo que não existe'), null)
  assert.equal(categoriaValida(null), null)
  assert.equal(categoriaValida(undefined), null)
})

test('CATEGORIAS_GASTO tem "Outros" como opção', () => {
  assert.ok(CATEGORIAS_GASTO.includes('Outros'))
})

const g = (valor: number, dataGasto: string, categoria = 'Outros', fornecedor: string | null = null): GastoParaCalculo =>
  ({ valor, dataGasto, categoria, fornecedor })

test('kpisDeGastos soma total, conta quantidade, acha o maior e calcula a média', () => {
  const gastos = [g(100, '2026-09-01'), g(300, '2026-09-05'), g(50, '2026-09-10')]
  const k = kpisDeGastos(gastos, '2026-09-15')
  assert.equal(k.total, 450)
  assert.equal(k.quantidade, 3)
  assert.equal(k.maior, 300)
  assert.equal(k.medio, 150)
})

test('kpisDeGastos: lista vazia não quebra (média zero, não NaN)', () => {
  const k = kpisDeGastos([], '2026-09-15')
  assert.deepEqual(k, { total: 0, quantidade: 0, maior: 0, medio: 0, hoje: 0, ultimos7: 0, mes: 0 })
})

test('kpisDeGastos: "hoje" só soma o que é exatamente hoje', () => {
  const gastos = [g(100, '2026-09-15'), g(200, '2026-09-14'), g(50, '2026-09-15')]
  const k = kpisDeGastos(gastos, '2026-09-15')
  assert.equal(k.hoje, 150)
})

test('kpisDeGastos: "ultimos7" inclui os últimos 7 dias, hoje incluído', () => {
  const gastos = [
    g(100, '2026-09-15'), // hoje
    g(200, '2026-09-09'), // 6 dias atrás — dentro
    g(300, '2026-09-08'), // 7 dias atrás — fora
  ]
  const k = kpisDeGastos(gastos, '2026-09-15')
  assert.equal(k.ultimos7, 300)
})

test('kpisDeGastos: "mes" só soma o mês corrente', () => {
  const gastos = [g(100, '2026-09-01'), g(200, '2026-08-31')]
  const k = kpisDeGastos(gastos, '2026-09-15')
  assert.equal(k.mes, 100)
})

test('dadosDosGraficosDeGastos: agrupa por categoria, ordenado do maior pro menor', () => {
  const gastos = [
    g(100, '2026-09-01', 'Estrutura'), g(50, '2026-09-02', 'Estrutura'),
    g(200, '2026-09-03', 'Transporte'),
  ]
  const d = dadosDosGraficosDeGastos(gastos)
  assert.deepEqual(d.porCategoria, [
    { categoria: 'Transporte', total: 200 },
    { categoria: 'Estrutura', total: 150 },
  ])
})

test('dadosDosGraficosDeGastos: fornecedor null vira "—", limitado a 8', () => {
  const gastos = [g(10, '2026-09-01', 'Outros', null), g(20, '2026-09-01', 'Outros', 'Posto X')]
  const d = dadosDosGraficosDeGastos(gastos)
  assert.ok(d.porFornecedor.some(f => f.fornecedor === '—' && f.total === 10))
  assert.ok(d.porFornecedor.some(f => f.fornecedor === 'Posto X' && f.total === 20))
})

test('dadosDosGraficosDeGastos: acumulado soma dia a dia, em ordem cronológica', () => {
  const gastos = [g(100, '2026-09-03'), g(50, '2026-09-01'), g(25, '2026-09-02')]
  const d = dadosDosGraficosDeGastos(gastos)
  assert.deepEqual(d.porDia, [
    { dia: '2026-09-01', total: 50 }, { dia: '2026-09-02', total: 25 }, { dia: '2026-09-03', total: 100 },
  ])
  assert.deepEqual(d.acumulado, [
    { dia: '2026-09-01', total: 50 }, { dia: '2026-09-02', total: 75 }, { dia: '2026-09-03', total: 175 },
  ])
})
