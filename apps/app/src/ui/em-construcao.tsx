// A tela que ainda não existe.
//
// ─── POR QUE ELA EXISTE, EM VEZ DE O ITEM SUMIR DO MENU ─────────────────────
//
// Porque o menu inteiro conta o que o sistema faz. Escondendo o que ainda não
// foi construído, quem usa o app não tem como saber que aquilo vai existir — e
// quem já usa o painel no computador procura o item, não acha, e conclui que o
// app "não tem isso".
//
// Com a tela declarada, o app é navegável de ponta a ponta desde o primeiro
// dia: dá para percorrer todos os caminhos, ver onde cada um leva, e discutir o
// que falta olhando para a coisa em vez de para uma lista.
//
// Cada uma diz O QUE vai fazer, não "em breve". A frase é o combinado.

import { View, StyleSheet } from 'react-native'
import { Cartao, Corpo, Legenda, Respiro, Tela, TituloDaTela, TituloDeCartao } from './componentes'
import { Icone } from './icone'
import { cor, espaco, raio } from './tema'

export function EmConstrucao({
  titulo, icone, oQueVaiFazer, deOndeVem,
}: {
  titulo: string
  icone: string
  /** Em uma frase: o que a pessoa vai conseguir fazer aqui. */
  oQueVaiFazer: string
  /** A tela equivalente no sistema web, para quem quiser conferir. */
  deOndeVem?: string
}) {
  return (
    <Tela>
      <TituloDaTela>{titulo}</TituloDaTela>
      <Respiro />

      <Cartao>
        <View style={e.linha}>
          <View style={e.bloco}>
            <Icone nome={icone} tamanho={18} tom={cor.acento500} />
          </View>
          <View style={e.texto}>
            <TituloDeCartao>Ainda não construída</TituloDeCartao>
            <Respiro altura={espaco.s} />
            <Corpo>{oQueVaiFazer}</Corpo>
            {deOndeVem ? (
              <>
                <Respiro altura={espaco.s} />
                <Legenda>No sistema do computador, é a tela {deOndeVem}.</Legenda>
              </>
            ) : null}
          </View>
        </View>
      </Cartao>
    </Tela>
  )
}

const e = StyleSheet.create({
  linha: { flexDirection: 'row', gap: espaco.m },
  bloco: {
    width: 36,
    height: 36,
    borderRadius: raio.campo,
    backgroundColor: cor.acento50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  texto: { flex: 1, minWidth: 0 },
})
