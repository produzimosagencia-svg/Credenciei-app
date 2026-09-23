// Gastos — a tela de captura, o coração do módulo do Produtor.
//
// ─── NÃO PODE PARECER UM SISTEMA FINANCEIRO ─────────────────────────────────
//
// Pedido do Juan, e é o que define o desenho: escolhe o evento, lança, pronto.
// O Produtor não conhece o resto do painel — no site ele tem um shell próprio
// justamente por isso (`app/gastos/layout.tsx`), e aqui o menu dele também só
// tem Gastos. Uma lista de vinte itens de operação seria o oposto do pedido.
//
// ─── A ORDEM DA TELA É A DO SITE ────────────────────────────────────────────
//
// Seletor de evento, lançamento, três números, últimos lançamentos, atalhos
// pra lista e pro painel. Copiada de `app/gastos/page.tsx`: "resumo, não
// dashboard" — o painel completo é um toque adiante, e quem está em pé no
// evento lançando uma nota não quer gráfico.

import { useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import {
  CATEGORIAS_GASTO, CATEGORIA_PADRAO, EVENTO_INTERNO, FORMAS_PAGAMENTO,
  diaBRT, formatarBR, kpisDeGastos,
} from '@credenciei/dominio'
import type { EventoParaGasto, Gasto } from '@credenciei/contrato'
import { mensagemDoErro, usePedido } from '../dados/pedido'
import { useSessao } from '../sessao/contexto'
import {
  Aviso, Botao, Campo, Carregando, Cartao, Corpo, Escolha, Indicador, Legenda,
  Respiro, Selo, Separador, Tela, TituloDaTela, TituloDeCartao,
} from '../ui/componentes'
import { Icone } from '../ui/icone'
import { emReais } from '../ui/dinheiro'
import { espaco, raio, texto, tipo } from '../ui/tema'
import { useTema, type Tokens } from '../ui/tema-contexto'

/** O rótulo do "gasto sem evento" — mesma ideia do `EVENTO_INTERNO` do site. */
const ROTULO_INTERNO = 'Interno (sem evento)'

export function Gastos() {
  const { cliente } = useSessao()
  const router = useRouter()
  const e = useEstilos()

  const [eventoId, setEventoId] = useState<string | null>(null)
  const [versao, setVersao] = useState(0)

  const { pedido, recarregar } = usePedido(async () => {
    const eventos = await cliente.eventosParaGastos()
    const escolhido = eventoId
      ?? eventos.find(ev => ev.ativo)?.id
      ?? eventos[0]?.id
      ?? EVENTO_INTERNO
    const gastos = await cliente.listarGastos({ eventoId: escolhido })
    return { eventos, escolhido, gastos }
  }, [cliente, eventoId, versao])

  const dados = pedido.estado === 'pronto' ? pedido.dados : null
  const kpis = dados ? kpisDeGastos(dados.gastos, diaBRT(new Date())) : null
  const ultimos = dados ? dados.gastos.slice(0, 5) : []

  return (
    <Tela>
      <TituloDaTela>Gastos</TituloDaTela>
      <Legenda>Lance o que saiu do caixa, e veja para onde o dinheiro foi.</Legenda>
      <Respiro />

      {pedido.estado === 'carregando' ? <Carregando /> : null}

      {pedido.estado === 'falhou' ? (
        <>
          <Aviso tipo="erro">{pedido.mensagem}</Aviso>
          <Botao titulo="Tentar de novo" onPress={recarregar} tipo="secundario" />
        </>
      ) : null}

      {dados && kpis ? (
        <>
          <SeletorDeEvento
            eventos={dados.eventos}
            escolhido={dados.escolhido}
            aoEscolher={setEventoId}
          />

          <Respiro altura={espaco.s} />

          <FormularioDeGasto
            eventoId={dados.escolhido}
            aoSalvar={() => setVersao(v => v + 1)}
          />

          {/* Três números — resumo, não dashboard. O painel é o atalho abaixo. */}
          <View style={e.numeros}>
            <View style={e.numero}>
              <Indicador rotulo="Total" valor={emReais(kpis.total)} icone="Wallet" />
            </View>
            <View style={e.numero}>
              <Indicador rotulo="Hoje" valor={emReais(kpis.hoje)} icone="Clock" />
            </View>
            <View style={e.numero}>
              <Indicador rotulo="Lançamentos" valor={kpis.quantidade} icone="ClipboardList" />
            </View>
          </View>

          <Cartao>
            <TituloDeCartao>Últimos gastos</TituloDeCartao>
            <Separador />
            {ultimos.length === 0 ? (
              <Corpo>
                Nenhum gasto ainda neste evento. Lance o primeiro no formulário
                acima.
              </Corpo>
            ) : (
              ultimos.map((g, i) => (
                <View key={g.id}>
                  {i > 0 ? <View style={e.fio} /> : null}
                  <LinhaDeGasto gasto={g} />
                </View>
              ))
            )}
          </Cartao>

          <View style={e.atalhos}>
            <View style={e.atalho}>
              <Botao
                titulo="Lista e filtros"
                tipo="secundario"
                onPress={() => router.push('/gastos-lista' as never)}
              />
            </View>
            <View style={e.atalho}>
              <Botao
                titulo="Dashboard"
                tipo="secundario"
                onPress={() => router.push('/gastos-painel' as never)}
              />
            </View>
          </View>
        </>
      ) : null}
    </Tela>
  )
}

/**
 * O evento do lançamento.
 *
 * "Interno" é um evento de mentira na lista, não um interruptor à parte: é
 * assim que o site trata (`EVENTO_INTERNO`), e o gasto de escritório precisa
 * caber no mesmo fluxo do gasto de evento — senão vira um caminho paralelo que
 * ninguém lembra que existe.
 */
function SeletorDeEvento({
  eventos, escolhido, aoEscolher,
}: {
  eventos: EventoParaGasto[]
  escolhido: string
  aoEscolher: (id: string) => void
}) {
  const { cor, uso } = useTema()
  const e = useEstilos()
  const lista = [...eventos, { id: EVENTO_INTERNO, nome: ROTULO_INTERNO, ativo: true }]

  return (
    <View>
      <Legenda>Evento</Legenda>
      <Respiro altura={espaco.xs} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {lista.map(ev => {
          const atual = ev.id === escolhido
          return (
            <Pressable
              key={ev.id}
              onPress={() => aoEscolher(ev.id)}
              accessibilityRole="button"
              accessibilityState={{ selected: atual }}
              style={[
                e.chip,
                {
                  backgroundColor: atual ? cor.acento50 : uso.superficie,
                  borderColor: atual ? cor.acento500 : uso.borda,
                },
              ]}
            >
              <Text
                style={[e.chipTexto, { color: atual ? cor.acento700 : uso.tintaMedia }]}
                numberOfLines={1}
              >
                {ev.nome}
              </Text>
            </Pressable>
          )
        })}
      </ScrollView>
    </View>
  )
}

/**
 * O lançamento manual.
 *
 * Só quatro campos são obrigatórios — descrição, valor, categoria e data. O
 * resto (fornecedor, forma de pagamento, quem adiantou, observação) fica atrás
 * de "Mais detalhes": quem está em pé no evento com a nota na mão precisa
 * lançar em segundos, e um formulário de dez campos faz a pessoa deixar pra
 * depois — que é como o gasto some.
 */
function FormularioDeGasto({ eventoId, aoSalvar }: { eventoId: string; aoSalvar: () => void }) {
  const { cliente } = useSessao()
  const e = useEstilos()

  const [descricao, setDescricao] = useState('')
  const [valor, setValor] = useState('')
  const [categoria, setCategoria] = useState<string>(CATEGORIA_PADRAO)
  const [dataGasto, setDataGasto] = useState(diaBRT(new Date()))
  const [fornecedor, setFornecedor] = useState('')
  const [formaPagamento, setFormaPagamento] = useState<string | null>(null)
  const [pagador, setPagador] = useState('')
  const [pago, setPago] = useState(true)
  const [observacao, setObservacao] = useState('')
  const [detalhes, setDetalhes] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const centavos = emCentavos(valor)

  async function salvar() {
    setErro(null)
    if (!descricao.trim()) return setErro('Escreva o que foi o gasto.')
    if (centavos === null || centavos <= 0) return setErro('Escreva o valor, maior que zero.')

    setSalvando(true)
    try {
      const r = await cliente.criarGasto({
        eventoId,
        descricao: descricao.trim(),
        valor: centavos / 100,
        categoria,
        dataGasto,
        fornecedor: fornecedor.trim() || null,
        formaPagamento,
        pagador: pagador.trim() || null,
        pago,
        observacao: observacao.trim() || null,
        origem: 'manual',
        transcricao: null,
        comprovanteBase64: null,
      })
      if (r.erro) return setErro(r.erro)

      setDescricao('')
      setValor('')
      setFornecedor('')
      setPagador('')
      setObservacao('')
      setDetalhes(false)
      aoSalvar()
    } catch (err) {
      setErro(mensagemDoErro(err))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Cartao>
      <TituloDeCartao>Lançar gasto</TituloDeCartao>
      <Respiro altura={espaco.s} />

      <Campo
        rotulo="O que foi"
        placeholder="Almoço da equipe de montagem"
        value={descricao}
        onChangeText={setDescricao}
      />

      <Campo
        rotulo="Valor"
        placeholder="0,00"
        keyboardType="decimal-pad"
        value={valor}
        onChangeText={setValor}
        ajuda={centavos !== null && centavos > 0 ? emReais(centavos / 100) : undefined}
      />

      <Legenda>Categoria</Legenda>
      <Respiro altura={espaco.xs} />
      <Escolha
        opcoes={[...CATEGORIAS_GASTO]}
        valor={categoria}
        aoEscolher={setCategoria}
      />

      <Respiro altura={espaco.s} />
      <Campo
        rotulo="Data"
        placeholder="AAAA-MM-DD"
        value={dataGasto}
        onChangeText={setDataGasto}
        ajuda={formatarBR(`${dataGasto}T12:00:00-03:00`, 'data')}
      />

      <Pressable onPress={() => setDetalhes(d => !d)} accessibilityRole="button" style={e.maisDetalhes}>
        <Icone nome={detalhes ? 'ChevronUp' : 'ChevronDown'} tamanho={14} />
        <Text style={e.maisDetalhesTexto}>
          {detalhes ? 'Menos detalhes' : 'Mais detalhes'}
        </Text>
      </Pressable>

      {detalhes ? (
        <>
          <Campo
            rotulo="Fornecedor"
            placeholder="Quem recebeu"
            value={fornecedor}
            onChangeText={setFornecedor}
          />

          <Legenda>Forma de pagamento</Legenda>
          <Respiro altura={espaco.xs} />
          <Escolha
            opcoes={[...FORMAS_PAGAMENTO]}
            valor={formaPagamento}
            aoEscolher={setFormaPagamento}
          />

          <Respiro altura={espaco.s} />
          <Campo
            rotulo="Quem adiantou"
            placeholder="Deixe vazio se saiu do caixa"
            ajuda="Quem pagou do próprio bolso e precisa ser reembolsado."
            value={pagador}
            onChangeText={setPagador}
          />

          <Campo
            rotulo="Observação"
            placeholder="Algo que o fechamento precise saber"
            multiline
            value={observacao}
            onChangeText={setObservacao}
          />

          {/*
            Pago x a pagar não é o mesmo que confirmado x rascunho — um é
            dinheiro, o outro é o estado do lançamento. Ficam separados no
            banco pelo mesmo motivo.
          */}
          <Legenda>Situação</Legenda>
          <Respiro altura={espaco.xs} />
          <Escolha
            opcoes={['Já pago', 'A pagar']}
            valor={pago ? 'Já pago' : 'A pagar'}
            aoEscolher={v => setPago(v === 'Já pago')}
          />
        </>
      ) : null}

      {erro ? (
        <>
          <Respiro altura={espaco.s} />
          <Aviso tipo="erro">{erro}</Aviso>
        </>
      ) : null}

      <Respiro altura={espaco.s} />
      <Botao titulo="Lançar" ocupado={salvando} onPress={() => { void salvar() }} />
    </Cartao>
  )
}

export function LinhaDeGasto({ gasto }: { gasto: Gasto }) {
  const e = useEstilos()
  return (
    <View style={e.gasto}>
      <View style={e.gastoTexto}>
        <Text style={e.gastoDescricao} numberOfLines={1}>{gasto.descricao}</Text>
        <Legenda>
          {formatarBR(`${gasto.dataGasto}T12:00:00-03:00`, 'data')}
          {gasto.fornecedor ? ` · ${gasto.fornecedor}` : ''}
          {` · ${gasto.categoria}`}
        </Legenda>
      </View>
      <View style={e.gastoValor}>
        <Text style={e.valor}>{emReais(gasto.valor)}</Text>
        {!gasto.pago ? (
          <>
            <Respiro altura={espaco.xs} />
            <Selo texto="A pagar" tipo="aviso" />
          </>
        ) : null}
      </View>
    </View>
  )
}

/**
 * "12,50" ou "12.50" viram 1250 centavos; texto inválido vira `null`.
 *
 * Em centavos e não em float porque o valor é dinheiro e vai somar com outros
 * — `0.1 + 0.2` em ponto flutuante não dá `0.3`, e o erro apareceria no total
 * do evento.
 */
export function emCentavos(bruto: string): number | null {
  const limpo = bruto.trim().replace(/\s/g, '').replace(',', '.')
  if (!limpo) return null
  if (!/^\d+(\.\d{1,2})?$/.test(limpo)) return null
  return Math.round(Number(limpo) * 100)
}

function criarEstilos(cor: Tokens['cor'], uso: Tokens['uso']) {
  return StyleSheet.create({
    numeros: { flexDirection: 'row', gap: espaco.s },
    numero: { flex: 1, minWidth: 0 },

    chip: {
      borderWidth: 1,
      borderRadius: raio.pilula,
      paddingHorizontal: espaco.m,
      paddingVertical: espaco.s,
      marginRight: espaco.s,
      maxWidth: 220,
    },
    chipTexto: { ...texto.xs, fontFamily: tipo.forte },

    maisDetalhes: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: espaco.s,
    },
    maisDetalhesTexto: { ...texto.xs, fontFamily: tipo.forte, color: cor.acento600 },

    gasto: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: espaco.m,
      paddingVertical: espaco.s,
    },
    gastoTexto: { flex: 1, minWidth: 0 },
    gastoDescricao: { ...texto.corpoForte, color: uso.tinta },
    gastoValor: { alignItems: 'flex-end' },
    valor: { ...texto.corpoForte, color: uso.tinta },

    atalhos: { flexDirection: 'row', gap: espaco.s },
    atalho: { flex: 1 },

    fio: { height: 1, backgroundColor: uso.borda },
  })
}

function useEstilos() {
  const { cor, uso } = useTema()
  return useMemo(() => criarEstilos(cor, uso), [cor, uso])
}
