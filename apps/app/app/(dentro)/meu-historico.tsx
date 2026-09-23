// Meu histórico — os eventos que já passaram, e quanto eles somaram.
//
// ─── POR QUE ISTO NÃO EXISTE NO SITE ────────────────────────────────────────
//
// Lá a credencial chega por link e morre com o evento: não há conta, então
// não há "antes". Aqui a conta é PERMANENTE, e depois de alguns eventos a
// pessoa não tinha como ver os próprios — só o atual, um de cada vez. Escopo
// decidido com o Juan em 22/09/2026, sem equivalente para copiar.
//
// ─── O TOTAL É COMBINADO, NÃO RECEBIDO ──────────────────────────────────────
//
// `totalGanho` soma o valor previsto de cada participação — o que foi
// combinado, não o que já caiu na conta. Escrever "já recebi isso" seria
// mentira para quem tem acerto pendente, e é justamente essa pessoa que mais
// olha esta tela. A situação de pagamento de cada evento fica ao lado dele.

import { useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { formatarBR } from '@credenciei/dominio'
import type { EventoDoHistorico } from '@credenciei/contrato'
import { usePedido } from '../../src/dados/pedido'
import { useSessao } from '../../src/sessao/contexto'
import {
  Aviso, Botao, Carregando, Cartao, Corpo, Legenda, Respiro, Selo, Separador,
  Tela, TituloDaTela,
} from '../../src/ui/componentes'
import { Icone } from '../../src/ui/icone'
import { espaco, raio, texto, tipo } from '../../src/ui/tema'
import { useTema, type Tokens } from '../../src/ui/tema-contexto'

const PAGAMENTO: Record<
  EventoDoHistorico['pagamentoSituacao'],
  { rotulo: string; tom: 'aviso' | 'info' | 'sucesso' }
> = {
  pendente: { rotulo: 'A receber', tom: 'aviso' },
  em_processamento: { rotulo: 'Processando', tom: 'info' },
  pago: { rotulo: 'Pago', tom: 'sucesso' },
}

/**
 * Descredenciado aparece, e aparece marcado.
 *
 * Esconder o evento de quem foi desligado apagaria justamente o que ela
 * precisa mostrar depois — os dias que trabalhou antes de sair continuam
 * valendo para o acerto.
 */
const SITUACAO: Record<EventoDoHistorico['situacao'], string | null> = {
  credenciado: null,
  aguardando_aprovacao: 'Aguardando aprovação',
  descredenciado: 'Desligada deste evento',
}

export default function MeuHistorico() {
  const { cliente } = useSessao()
  const { uso } = useTema()
  const e = useEstilos()

  const { pedido, recarregar } = usePedido(() => cliente.meuHistorico(), [cliente])
  const dados = pedido.estado === 'pronto' ? pedido.dados : null

  return (
    <Tela>
      <TituloDaTela>Meu histórico</TituloDaTela>
      <Legenda>Todos os eventos em que você já trabalhou.</Legenda>
      <Respiro />

      {pedido.estado === 'carregando' ? <Carregando /> : null}

      {pedido.estado === 'falhou' ? (
        <>
          <Aviso tipo="erro">{pedido.mensagem}</Aviso>
          <Botao titulo="Tentar de novo" onPress={recarregar} tipo="secundario" />
        </>
      ) : null}

      {dados && dados.eventos.length === 0 ? (
        <Cartao>
          <Corpo>
            Você ainda não trabalhou em nenhum evento. Quando entrar no
            primeiro, ele aparece aqui — e continua aparecendo depois que
            acabar.
          </Corpo>
        </Cartao>
      ) : null}

      {dados && dados.eventos.length > 0 ? (
        <>
          <Cartao>
            <View style={e.totais}>
              <View style={e.total}>
                <Legenda>Eventos</Legenda>
                <Text style={e.totalValor}>{dados.totalEventos}</Text>
              </View>
              <View style={e.total}>
                <Legenda>Total combinado</Legenda>
                <Text style={e.totalValor}>{emReais(dados.totalGanho)}</Text>
              </View>
            </View>
            <Respiro altura={espaco.s} />
            <Legenda>
              A soma é do que foi combinado em cada evento, não do que já foi
              pago. A situação de cada um está na lista abaixo.
            </Legenda>
          </Cartao>

          <Cartao>
            {dados.eventos.map((evento, i) => (
              <View key={evento.participacaoId}>
                {i > 0 ? <Separador /> : null}
                <LinhaDoEvento evento={evento} />
              </View>
            ))}
          </Cartao>

          <View style={e.rodape}>
            <Icone nome="ShieldCheck" tamanho={14} tom={uso.tintaFraca} />
            <Text style={e.rodapeTexto}>
              Este histórico é só seu. Ninguém mais vê por onde você passou.
            </Text>
          </View>
        </>
      ) : null}
    </Tela>
  )
}

function LinhaDoEvento({ evento }: { evento: EventoDoHistorico }) {
  const e = useEstilos()
  const pagamento = PAGAMENTO[evento.pagamentoSituacao]
  const situacao = SITUACAO[evento.situacao]

  return (
    <View style={e.evento}>
      <View style={e.eventoTexto}>
        <Text style={e.eventoNome} numberOfLines={2}>{evento.eventoNome}</Text>
        <Legenda>
          {formatarBR(evento.dataInicio, 'data')}
          {evento.local ? ` · ${evento.local}` : ''}
        </Legenda>
        <Legenda>
          {evento.diasTrabalhados === 1 ? '1 dia trabalhado' : `${evento.diasTrabalhados} dias trabalhados`}
        </Legenda>
        {situacao ? (
          <>
            <Respiro altura={espaco.xs} />
            <Selo texto={situacao} tipo="aviso" />
          </>
        ) : null}
      </View>

      <View style={e.eventoValor}>
        <Text style={e.valor}>
          {evento.valorPrevisto === null ? 'A combinar' : emReais(evento.valorPrevisto)}
        </Text>
        <Respiro altura={espaco.xs} />
        <Selo texto={pagamento.rotulo} tipo={pagamento.tom} />
      </View>
    </View>
  )
}

/**
 * O valor em reais, escrito à mão — mesma razão de `meu-pagamento.tsx`:
 * `toLocaleString('pt-BR')` depende de dados de idioma que o motor JavaScript
 * do celular pode não trazer, e o resultado silencioso seria "R$ 600.00".
 */
function emReais(valor: number): string {
  const centavos = Math.round(valor * 100)
  const inteiros = String(Math.floor(centavos / 100))
  const resto = String(centavos % 100).padStart(2, '0')

  let comPontos = ''
  for (let i = 0; i < inteiros.length; i++) {
    const faltam = inteiros.length - i
    comPontos += inteiros[i]
    if (faltam > 1 && (faltam - 1) % 3 === 0) comPontos += '.'
  }

  return `R$ ${comPontos},${resto}`
}

function criarEstilos(cor: Tokens['cor'], uso: Tokens['uso']) {
  return StyleSheet.create({
    totais: { flexDirection: 'row', gap: espaco.g },
    total: { flex: 1, minWidth: 0 },
    totalValor: { ...texto.metrica, color: uso.tinta, marginTop: 2 },

    evento: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: espaco.m,
      paddingVertical: espaco.s,
    },
    eventoTexto: { flex: 1, minWidth: 0 },
    eventoNome: { ...texto.corpoForte, color: uso.tinta },
    eventoValor: { alignItems: 'flex-end' },
    valor: { ...texto.corpoForte, color: uso.tinta },

    rodape: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: espaco.m,
      paddingLeft: espaco.m,
      paddingRight: espaco.xs,
      borderRadius: raio.campo,
      backgroundColor: cor.neutro100,
    },
    rodapeTexto: { ...texto.xs, fontFamily: tipo.regular, color: uso.tintaMedia, flex: 1 },
  })
}

function useEstilos() {
  const { cor, uso } = useTema()
  return useMemo(() => criarEstilos(cor, uso), [cor, uso])
}
