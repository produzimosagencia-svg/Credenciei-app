// O Painel — a tela inicial de quem tem conta.
//
// É a mesma do sistema web, na mesma ordem: os quatro números do topo, os
// eventos que estão acontecendo agora, a janela do fluxo e a atividade recente.
// O que muda é a forma, não o conteúdo: no computador os indicadores ficam em
// fileira de quatro, aqui em dois por dois; lá os cartões de evento ficam lado
// a lado, aqui empilhados.
//
// ─── O RECORTE NÃO É DAQUI ──────────────────────────────────────────────────
//
// Esta tela não filtra nada. O master vê todas as organizações, o admin só a
// dele, o supervisor só o próprio setor — e quem decide isso é o servidor, pelo
// token. Se a tela filtrasse, bastaria adulterar o pedido para ver a operação
// de outro cliente.

import { View, StyleSheet, Text } from 'react-native'
import type { AtividadeRecente, IndicadorDoPainel } from '@credenciei/contrato'
import { formatarBR } from '@credenciei/dominio'
import { usePedido } from '../dados/pedido'
import { useSessao } from '../sessao/contexto'
import { haQuantoTempo, porExtenso } from '../data'
import {
  Aviso, Botao, Carregando, Cartao, Corpo, Etiqueta, Legenda, Respiro, Selo,
  Tela, TituloDaTela, TituloDeCartao,
} from '../ui/componentes'
import { Indicador } from '../ui/componentes'
import { CartaoDeEventoAoVivo } from '../ui/evento-ao-vivo'
import { Icone } from '../ui/icone'
import { cor, espaco, raio, texto, tipo, uso } from '../ui/tema'

/** O ícone de cada número, igual ao do painel web. */
const ICONE_DO_INDICADOR: Record<string, string> = {
  eventos_ativos: 'Radio',
  presentes: 'UserCheck',
  nao_chegaram: 'Clock',
  batidas: 'Activity',
}

export function Painel() {
  const { cliente, semRede } = useSessao()
  const { pedido, recarregar } = usePedido(() => cliente.painel(), [cliente])

  return (
    <Tela>
      <TituloDaTela>Painel</TituloDaTela>
      <Legenda>
        {pedido.estado === 'pronto' ? porExtenso(pedido.dados.data) : ' '}
      </Legenda>
      <Respiro />

      {semRede ? (
        <Aviso tipo="aviso">
          Você está sem internet. Os números são os da última vez que o app
          conseguiu falar com o servidor.
        </Aviso>
      ) : null}

      {pedido.estado === 'carregando' ? <Carregando texto="Montando o painel…" /> : null}

      {pedido.estado === 'falhou' ? (
        <>
          <Aviso tipo="erro">{pedido.mensagem}</Aviso>
          <Botao titulo="Tentar de novo" onPress={recarregar} tipo="secundario" />
        </>
      ) : null}

      {pedido.estado === 'pronto' ? (
        <>
          <GradeDeIndicadores indicadores={pedido.dados.indicadores} />

          <Respiro altura={espaco.s} />
          <View style={e.cabecalhoDaLista}>
            <Etiqueta>Acontecendo agora</Etiqueta>
            <Selo texto={String(pedido.dados.eventos.length)} tipo="sucesso" />
          </View>
          <Respiro altura={espaco.m} />

          {pedido.dados.eventos.length === 0 ? (
            <Cartao>
              <Corpo>Nenhum evento acontecendo agora.</Corpo>
            </Cartao>
          ) : (
            pedido.dados.eventos.map(ev => (
              <CartaoDeEventoAoVivo key={ev.eventoId} evento={ev} />
            ))
          )}

          <Respiro altura={espaco.s} />
          <FluxoDeCredenciamento
            legenda={pedido.dados.legendaDaJanela}
            batidas={pedido.dados.indicadores.find(i => i.chave === 'batidas')?.valor ?? 0}
          />

          <AtividadeDoEvento itens={pedido.dados.atividade} />
        </>
      ) : null}
    </Tela>
  )
}

/**
 * Os quatro números, dois por dois.
 *
 * No computador eles ficam em fileira; num celular de 360px, quatro cartões
 * lado a lado teriam 80px cada e o rótulo quebraria em três linhas. Dois por
 * dois mantém o número grande, que é o conteúdo do cartão.
 */
function GradeDeIndicadores({ indicadores }: { indicadores: IndicadorDoPainel[] }) {
  return (
    <View style={e.grade}>
      {indicadores.map(i => (
        <View key={i.chave} style={e.gradeItem}>
          <Indicador
            rotulo={i.rotulo}
            valor={i.valor}
            sub={i.sub}
            tom={i.tom}
            icone={
              <Icone
                nome={ICONE_DO_INDICADOR[i.chave] ?? 'Activity'}
                tamanho={16}
                tom="#ffffff"
              />
            }
          />
        </View>
      ))}
    </View>
  )
}

/**
 * A janela do fluxo.
 *
 * No computador aqui mora um gráfico de curvas por hora. No celular ele
 * caberia, mas mal — e a informação que resolve a dúvida do dia é outra: DE QUE
 * JANELA estamos falando. Sem a frase, "0 batidas" é ambíguo: ninguém bateu, ou
 * a janela ainda não abriu?
 *
 * O gráfico entra quando houver o que desenhar; a legenda vem primeiro porque é
 * ela que dá sentido ao número.
 */
function FluxoDeCredenciamento({ legenda, batidas }: { legenda: string | null; batidas: number }) {
  return (
    <Cartao>
      <View style={e.linhaDoTitulo}>
        <View style={e.blocoDoIcone}>
          <Icone nome="Activity" tamanho={16} tom={cor.acento500} />
        </View>
        <View style={e.textoDoTitulo}>
          <TituloDeCartao>Fluxo de credenciamento</TituloDeCartao>
          <Legenda>{legenda ?? 'As janelas de horário deste evento ainda não foram definidas'}</Legenda>
        </View>
      </View>

      <View style={e.molduraDoGrafico}>
        <Text style={e.vazioDoGrafico}>
          {batidas === 0
            ? 'Nenhum registro nesta janela do evento'
            : `${batidas} ${batidas === 1 ? 'registro' : 'registros'} nesta janela`}
        </Text>
      </View>
    </Cartao>
  )
}

/** As últimas batidas. É o pulso da operação. */
function AtividadeDoEvento({ itens }: { itens: AtividadeRecente[] }) {
  const nomeDaEtapa = { entrada: 'Entrada', meio: 'Meio', fim: 'Saída' } as const
  const tomDaEtapa = { entrada: cor.info600, meio: cor.aviso600, fim: cor.sucesso600 } as const

  return (
    <Cartao>
      <View style={e.linhaDoTitulo}>
        <View style={e.blocoDoIcone}>
          <Icone nome="Activity" tamanho={16} tom={cor.acento500} />
        </View>
        <TituloDeCartao>Atividade recente</TituloDeCartao>
      </View>

      {itens.length === 0 ? (
        <>
          <Respiro altura={espaco.m} />
          <Corpo>Nada registrado ainda hoje.</Corpo>
        </>
      ) : (
        itens.map(a => (
          <View key={a.id} style={e.atividade}>
            <View style={[e.pontoDaEtapa, { backgroundColor: tomDaEtapa[a.tipo] }]} />
            <View style={e.atividadeTexto}>
              <Corpo forte>{a.nome}</Corpo>
              {a.setor ? <Legenda>{a.setor}</Legenda> : null}
              <Legenda>
                {nomeDaEtapa[a.tipo]} · {formatarBR(a.em, 'hora')} · {haQuantoTempo(a.em)}
              </Legenda>
            </View>
          </View>
        ))
      )}
    </Cartao>
  )
}

const e = StyleSheet.create({
  grade: { flexDirection: 'row', flexWrap: 'wrap', gap: espaco.m },
  /*
   * `calc(50% - metade do vão)` não existe aqui, então o item mede 48% e o vão
   * de 12px cabe na sobra. Com 50% exato, o segundo cartão desce de linha.
   */
  gradeItem: { width: '48%', flexGrow: 1 },

  cabecalhoDaLista: { flexDirection: 'row', alignItems: 'center', gap: espaco.s },

  linhaDoTitulo: { flexDirection: 'row', alignItems: 'center', gap: espaco.m },
  blocoDoIcone: {
    width: 32,
    height: 32,
    borderRadius: raio.campo,
    backgroundColor: cor.acento50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textoDoTitulo: { flex: 1, minWidth: 0 },

  molduraDoGrafico: {
    marginTop: espaco.g,
    minHeight: 96,
    borderRadius: raio.campo,
    borderWidth: 1,
    borderColor: uso.borda,
    backgroundColor: cor.neutro25,
    alignItems: 'center',
    justifyContent: 'center',
    padding: espaco.g,
  },
  vazioDoGrafico: { ...texto.corpo, fontFamily: tipo.regular, color: uso.tintaFraca, textAlign: 'center' },

  atividade: { flexDirection: 'row', gap: espaco.m, marginTop: espaco.g },
  pontoDaEtapa: { width: 8, height: 8, borderRadius: 999, marginTop: 6 },
  atividadeTexto: { flex: 1, minWidth: 0 },
})
