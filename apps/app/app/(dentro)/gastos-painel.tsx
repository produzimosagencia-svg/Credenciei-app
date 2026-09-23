// O dashboard de gastos — para onde o dinheiro foi.
//
// ─── BARRAS DESENHADAS À MÃO, SEM BIBLIOTECA DE GRÁFICO ─────────────────────
//
// Uma biblioteca de gráfico em React Native traria dependência nativa e peso
// de pacote para desenhar o que aqui é uma barra proporcional: uma `View` com
// largura em porcentagem. As quatro séries que o backend devolve
// (`porCategoria`, `porFornecedor`, `porDia`, `acumulado`) são todas ranking
// ou série simples — nenhuma precisa de eixo, zoom ou tooltip.
//
// ─── O QUE APARECE, E POR QUÊ NESSA ORDEM ───────────────────────────────────
//
// Primeiro os números do período, depois "por categoria" (a pergunta que o
// produtor faz primeiro: em que estou gastando), depois "por fornecedor"
// (quem levou mais) e por último o dia a dia. A série acumulada fica de fora:
// com as barras por dia logo acima ela conta a mesma história duas vezes.

import { useMemo, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { EVENTO_INTERNO, formatarBR } from '@credenciei/dominio'
import type { FiltroGastos } from '@credenciei/contrato'
import { usePedido } from '../../src/dados/pedido'
import { useSessao } from '../../src/sessao/contexto'
import {
  Aviso, Botao, Carregando, Cartao, Corpo, Escolha, Indicador, Legenda,
  Respiro, Separador, Tela, TituloDaTela, TituloDeCartao,
} from '../../src/ui/componentes'
import { emReais } from '../../src/ui/dinheiro'
import { espaco, raio, texto, tipo } from '../../src/ui/tema'
import { useTema, type Tokens } from '../../src/ui/tema-contexto'

const TODAS = 'Todas'

export default function GastosPainel() {
  const { cliente } = useSessao()
  const e = useEstilos()
  const [eventoId, setEventoId] = useState<string | null>(null)

  const filtro: FiltroGastos = useMemo(
    () => (eventoId ? { eventoId } : {}),
    [eventoId],
  )

  const { pedido, recarregar } = usePedido(async () => {
    const [eventos, painel] = await Promise.all([
      cliente.eventosParaGastos(),
      cliente.painelDeGastos(filtro),
    ])
    return { eventos, painel }
  }, [cliente, filtro])

  const dados = pedido.estado === 'pronto' ? pedido.dados : null

  const nomesDosEventos = dados
    ? [TODAS, ...dados.eventos.map(ev => ev.nome), 'Interno']
    : [TODAS]

  function escolherEvento(nome: string) {
    if (nome === TODAS) return setEventoId(null)
    if (nome === 'Interno') return setEventoId(EVENTO_INTERNO)
    setEventoId(dados?.eventos.find(ev => ev.nome === nome)?.id ?? null)
  }

  const nomeAtual = !eventoId
    ? TODAS
    : eventoId === EVENTO_INTERNO
      ? 'Interno'
      : dados?.eventos.find(ev => ev.id === eventoId)?.nome ?? TODAS

  return (
    <Tela>
      <TituloDaTela>Dashboard</TituloDaTela>
      <Respiro />

      <Cartao>
        <Legenda>Evento</Legenda>
        <Respiro altura={espaco.xs} />
        <Escolha opcoes={nomesDosEventos} valor={nomeAtual} aoEscolher={escolherEvento} />
      </Cartao>

      {pedido.estado === 'carregando' ? <Carregando /> : null}

      {pedido.estado === 'falhou' ? (
        <>
          <Aviso tipo="erro">{pedido.mensagem}</Aviso>
          <Botao titulo="Tentar de novo" onPress={recarregar} tipo="secundario" />
        </>
      ) : null}

      {dados ? (
        <>
          <View style={e.numeros}>
            <View style={e.numero}>
              <Indicador rotulo="Total" valor={emReais(dados.painel.kpis.total)} icone="Wallet" />
            </View>
            <View style={e.numero}>
              <Indicador rotulo="Lançamentos" valor={dados.painel.kpis.quantidade} icone="ClipboardList" />
            </View>
          </View>

          <View style={e.numeros}>
            <View style={e.numero}>
              <Indicador rotulo="Maior gasto" valor={emReais(dados.painel.kpis.maior)} />
            </View>
            <View style={e.numero}>
              <Indicador rotulo="Média" valor={emReais(dados.painel.kpis.medio)} />
            </View>
          </View>

          <View style={e.numeros}>
            <View style={e.numero}>
              <Indicador rotulo="Últimos 7 dias" valor={emReais(dados.painel.kpis.ultimos7)} />
            </View>
            <View style={e.numero}>
              <Indicador rotulo="No mês" valor={emReais(dados.painel.kpis.mes)} />
            </View>
          </View>

          <Barras
            titulo="Por categoria"
            vazio="Nenhum gasto no período."
            linhas={dados.painel.graficos.porCategoria.map(c => ({
              rotulo: c.categoria, valor: c.total,
            }))}
          />

          <Barras
            titulo="Por fornecedor"
            vazio="Nenhum gasto com fornecedor identificado."
            linhas={dados.painel.graficos.porFornecedor.map(f => ({
              rotulo: f.fornecedor, valor: f.total,
            }))}
          />

          <Barras
            titulo="Por dia"
            vazio="Nenhum gasto no período."
            linhas={dados.painel.graficos.porDia.map(d => ({
              rotulo: formatarBR(`${d.dia}T12:00:00-03:00`, 'data'), valor: d.total,
            }))}
          />
        </>
      ) : null}
    </Tela>
  )
}

/**
 * Um ranking em barras.
 *
 * A barra é proporcional ao MAIOR da lista, não ao total: comparar cada fatia
 * com o total faria tudo virar um fiapo quando uma categoria domina — e é
 * justamente aí que se quer enxergar a diferença entre a segunda e a terceira.
 */
function Barras({
  titulo, linhas, vazio,
}: {
  titulo: string
  linhas: { rotulo: string; valor: number }[]
  vazio: string
}) {
  const { cor } = useTema()
  const e = useEstilos()
  const maior = linhas.reduce((m, l) => Math.max(m, l.valor), 0)

  return (
    <Cartao>
      <TituloDeCartao>{titulo}</TituloDeCartao>
      <Separador />
      {linhas.length === 0 ? (
        <Corpo>{vazio}</Corpo>
      ) : (
        linhas.map(linha => (
          <View key={linha.rotulo} style={e.linha}>
            <View style={e.linhaTopo}>
              <Text style={e.linhaRotulo} numberOfLines={1}>{linha.rotulo}</Text>
              <Text style={e.linhaValor}>{emReais(linha.valor)}</Text>
            </View>
            <View style={e.trilho}>
              <View
                style={[
                  e.barra,
                  {
                    backgroundColor: cor.acento500,
                    width: `${maior > 0 ? Math.max(2, (linha.valor / maior) * 100) : 0}%`,
                  },
                ]}
              />
            </View>
          </View>
        ))
      )}
    </Cartao>
  )
}

function criarEstilos(_cor: Tokens['cor'], uso: Tokens['uso']) {
  return StyleSheet.create({
    numeros: { flexDirection: 'row', gap: espaco.s },
    numero: { flex: 1, minWidth: 0 },

    linha: { paddingVertical: espaco.xs },
    linhaTopo: { flexDirection: 'row', alignItems: 'center', gap: espaco.s },
    linhaRotulo: { ...texto.xs, fontFamily: tipo.media, color: uso.tintaMedia, flex: 1, minWidth: 0 },
    linhaValor: { ...texto.xs, fontFamily: tipo.forte, color: uso.tinta },
    trilho: {
      height: 6,
      borderRadius: raio.pilula,
      backgroundColor: uso.superficieFraca,
      marginTop: 4,
      overflow: 'hidden',
    },
    barra: { height: 6, borderRadius: raio.pilula },
  })
}

function useEstilos() {
  const { cor, uso } = useTema()
  return useMemo(() => criarEstilos(cor, uso), [cor, uso])
}
