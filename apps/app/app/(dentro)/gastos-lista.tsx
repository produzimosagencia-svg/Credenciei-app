// A lista completa de gastos, com filtros e exportação.
//
// ─── O FILTRO É O PRODUTO AQUI ──────────────────────────────────────────────
//
// A tela de captura mostra os cinco últimos; esta existe para responder
// perguntas — "quanto foi de alimentação?", "o que ainda está a pagar?",
// "quanto esse fornecedor levou?". Por isso os filtros ficam abertos no topo,
// e não atrás de um botão: escondê-los faria a tela parecer só uma lista longa.
//
// ─── O TOTAL É DO QUE ESTÁ FILTRADO ─────────────────────────────────────────
//
// Somar tudo enquanto a tela mostra um recorte é o jeito mais fácil de alguém
// ler o número errado e repassar pro cliente. O total acompanha o filtro, e a
// linha diz quantos lançamentos entraram nele.

import { useMemo, useState } from 'react'
import { Share, StyleSheet, View } from 'react-native'
import {
  CATEGORIAS_GASTO, EVENTO_INTERNO,
} from '@credenciei/dominio'
import type { FiltroGastos } from '@credenciei/contrato'
import { mensagemDoErro, usePedido } from '../../src/dados/pedido'
import { useSessao } from '../../src/sessao/contexto'
import { LinhaDeGasto } from '../../src/telas/gastos'
import {
  Aviso, Botao, Carregando, Cartao, Corpo, Escolha, Indicador, Legenda,
  Respiro, Separador, Tela, TituloDaTela, TituloDeCartao,
} from '../../src/ui/componentes'
import { emReais } from '../../src/ui/dinheiro'
import { espaco } from '../../src/ui/tema'
import { useTema, type Tokens } from '../../src/ui/tema-contexto'

const TODAS = 'Todas'
const SITUACOES = ['Tudo', 'Já pago', 'A pagar'] as const

export default function GastosLista() {
  const { cliente } = useSessao()
  const e = useEstilos()

  const [eventoId, setEventoId] = useState<string | null>(null)
  const [categoria, setCategoria] = useState<string>(TODAS)
  const [situacao, setSituacao] = useState<(typeof SITUACOES)[number]>('Tudo')
  const [exportando, setExportando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const filtro: FiltroGastos = useMemo(() => ({
    ...(eventoId ? { eventoId } : {}),
    ...(categoria !== TODAS ? { categoria } : {}),
    ...(situacao === 'Já pago' ? { pago: 'true' as const } : {}),
    ...(situacao === 'A pagar' ? { pago: 'false' as const } : {}),
  }), [eventoId, categoria, situacao])

  const { pedido, recarregar } = usePedido(async () => {
    const [eventos, gastos] = await Promise.all([
      cliente.eventosParaGastos(),
      cliente.listarGastos(filtro),
    ])
    return { eventos, gastos }
  }, [cliente, filtro])

  const dados = pedido.estado === 'pronto' ? pedido.dados : null
  const total = dados ? dados.gastos.reduce((s, g) => s + g.valor, 0) : 0

  async function exportar() {
    setErro(null)
    setExportando(true)
    try {
      const r = await cliente.exportarGastosXlsx(filtro)
      if ('erro' in r) return setErro(r.erro)
      /*
       * Compartilhar, e não baixar — mesma escolha da planilha da equipe: no
       * celular "baixar" some numa pasta que ninguém acha, e a planilha de
       * gastos vai direto pro contador ou pro cliente.
       */
      await Share.share({ message: `Gastos — ${r.nome}\n${r.url}`, url: r.url })
    } catch (err) {
      setErro(mensagemDoErro(err))
    } finally {
      setExportando(false)
    }
  }

  const nomesDosEventos = dados
    ? [TODAS, ...dados.eventos.map(ev => ev.nome), 'Interno']
    : [TODAS]

  function escolherEvento(nome: string) {
    if (nome === TODAS) return setEventoId(null)
    if (nome === 'Interno') return setEventoId(EVENTO_INTERNO)
    setEventoId(dados?.eventos.find(ev => ev.nome === nome)?.id ?? null)
  }

  const nomeDoEventoAtual = !eventoId
    ? TODAS
    : eventoId === EVENTO_INTERNO
      ? 'Interno'
      : dados?.eventos.find(ev => ev.id === eventoId)?.nome ?? TODAS

  return (
    <Tela>
      <TituloDaTela>Lista e filtros</TituloDaTela>
      <Respiro />

      <Cartao>
        <TituloDeCartao>Filtrar</TituloDeCartao>
        <Respiro altura={espaco.s} />

        <Legenda>Evento</Legenda>
        <Respiro altura={espaco.xs} />
        <Escolha opcoes={nomesDosEventos} valor={nomeDoEventoAtual} aoEscolher={escolherEvento} />

        <Respiro altura={espaco.s} />
        <Legenda>Categoria</Legenda>
        <Respiro altura={espaco.xs} />
        <Escolha
          opcoes={[TODAS, ...CATEGORIAS_GASTO]}
          valor={categoria}
          aoEscolher={setCategoria}
        />

        <Respiro altura={espaco.s} />
        <Legenda>Situação</Legenda>
        <Respiro altura={espaco.xs} />
        <Escolha
          opcoes={[...SITUACOES]}
          valor={situacao}
          aoEscolher={v => setSituacao(v as (typeof SITUACOES)[number])}
        />
      </Cartao>

      {pedido.estado === 'carregando' ? <Carregando /> : null}

      {pedido.estado === 'falhou' ? (
        <>
          <Aviso tipo="erro">{pedido.mensagem}</Aviso>
          <Botao titulo="Tentar de novo" onPress={recarregar} tipo="secundario" />
        </>
      ) : null}

      {erro ? (
        <>
          <Aviso tipo="erro">{erro}</Aviso>
          <Respiro altura={espaco.s} />
        </>
      ) : null}

      {dados ? (
        <>
          <View style={e.numeros}>
            <View style={e.numero}>
              <Indicador rotulo="Total filtrado" valor={emReais(total)} icone="Wallet" />
            </View>
            <View style={e.numero}>
              <Indicador rotulo="Lançamentos" valor={dados.gastos.length} icone="ClipboardList" />
            </View>
          </View>

          <Botao
            titulo="Exportar planilha"
            tipo="secundario"
            ocupado={exportando}
            onPress={() => { void exportar() }}
          />
          <Respiro altura={espaco.s} />

          <Cartao>
            {dados.gastos.length === 0 ? (
              <Corpo>
                Nenhum gasto com esses filtros. Afrouxe um deles para ver mais.
              </Corpo>
            ) : (
              dados.gastos.map((g, i) => (
                <View key={g.id}>
                  {i > 0 ? <Separador /> : null}
                  <LinhaDeGasto gasto={g} />
                </View>
              ))
            )}
          </Cartao>
        </>
      ) : null}
    </Tela>
  )
}

function criarEstilos(_cor: Tokens['cor'], _uso: Tokens['uso']) {
  return StyleSheet.create({
    numeros: { flexDirection: 'row', gap: espaco.s },
    numero: { flex: 1, minWidth: 0 },
  })
}

function useEstilos() {
  const { cor, uso } = useTema()
  return useMemo(() => criarEstilos(cor, uso), [cor, uso])
}
