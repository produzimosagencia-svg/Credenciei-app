// A lista de orçamentos.
//
// Só master (ver `podeGerenciarOrcamentos`) — são os valores comerciais da
// própria agência, não de um evento. A régua de verdade está na API; aqui a
// tela só evita mostrar um caminho que levaria a um "não".
//
// ─── O TOTAL DA LISTA É A COLUNA GRAVADA ────────────────────────────────────
//
// Diferente da tela de UM orçamento, que recalcula. Buscar os itens de todos
// só pra refazer a conta de cada linha seria uma consulta por orçamento, e o
// número da lista existe pra dar ordem de grandeza — quem vai mandar a
// proposta abre o orçamento, e lá o número é o recalculado.

import { useRouter } from 'expo-router'
import { useMemo, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { ROTULO_STATUS_ORCAMENTO, STATUS_ORCAMENTO, type StatusOrcamento } from '@credenciei/dominio'
import { usePedido } from '../../src/dados/pedido'
import { useSessao } from '../../src/sessao/contexto'
import { LinhaDeOrcamento } from '../../src/telas/orcamentos'
import {
  Aviso, Botao, Carregando, Cartao, Corpo, Escolha, Indicador, Legenda, Respiro, Separador,
  Tela, TituloDaTela,
} from '../../src/ui/componentes'
import { emReais } from '../../src/ui/dinheiro'
import { espaco } from '../../src/ui/tema'
import { useTema, type Tokens } from '../../src/ui/tema-contexto'

const TODOS = 'Todos'

export default function Orcamentos() {
  const router = useRouter()
  const { cliente } = useSessao()
  const e = useEstilos()
  const [filtro, setFiltro] = useState<string>(TODOS)

  const { pedido, recarregar } = usePedido(() => cliente.listarOrcamentos(), [cliente])

  const todos = pedido.estado === 'pronto' ? pedido.dados : []
  const status = STATUS_ORCAMENTO.find(s => ROTULO_STATUS_ORCAMENTO[s] === filtro)
  const lista = status ? todos.filter(o => o.status === status) : todos

  /*
   * "Fechado" é o que já virou dinheiro: aprovado. Sem essa separação o número
   * do topo somaria rascunho com recusado e diria que a agência vendeu um
   * valor que ela não vendeu.
   */
  const fechado = todos
    .filter(o => o.status === ('aprovado' satisfies StatusOrcamento))
    .reduce((s, o) => s + o.valorTotal, 0)

  return (
    <Tela>
      <TituloDaTela>Orçamentos</TituloDaTela>
      <Respiro />

      <Botao titulo="Novo orçamento" onPress={() => router.push('/novo-orcamento')} />
      <Respiro altura={espaco.s} />

      {pedido.estado === 'carregando' ? <Carregando /> : null}

      {pedido.estado === 'falhou' ? (
        <>
          <Aviso tipo="erro">{pedido.mensagem}</Aviso>
          <Botao titulo="Tentar de novo" onPress={recarregar} tipo="secundario" />
        </>
      ) : null}

      {pedido.estado === 'pronto' ? (
        <>
          <View style={e.numeros}>
            <View style={e.numero}>
              <Indicador rotulo="Aprovados" valor={emReais(fechado)} icone="Wallet" />
            </View>
            <View style={e.numero}>
              <Indicador rotulo="Propostas" valor={todos.length} icone="FileText" />
            </View>
          </View>

          <Cartao>
            <Legenda>Status</Legenda>
            <Respiro altura={espaco.xs} />
            <Escolha
              opcoes={[TODOS, ...STATUS_ORCAMENTO.map(s => ROTULO_STATUS_ORCAMENTO[s])]}
              valor={filtro}
              aoEscolher={setFiltro}
            />
          </Cartao>

          <Cartao semPadding>
            {lista.length === 0 ? (
              <View style={e.vazio}>
                <Corpo>
                  {todos.length === 0
                    ? 'Nenhum orçamento ainda. O primeiro sai pelo botão acima.'
                    : 'Nenhum orçamento com esse status.'}
                </Corpo>
              </View>
            ) : (
              lista.map((o, i) => (
                <View key={o.id}>
                  {i > 0 ? <Separador /> : null}
                  <LinhaDeOrcamento
                    orcamento={o}
                    aoTocar={() => router.push(`/orcamento/${o.id}` as never)}
                  />
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
    vazio: { padding: espaco.g },
  })
}

function useEstilos() {
  const { cor, uso } = useTema()
  return useMemo(() => criarEstilos(cor, uso), [cor, uso])
}
