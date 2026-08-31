// O botão de voltar do cabeçalho.
//
// ─── POR QUE ELE PRECISOU SER ESCRITO À MÃO ─────────────────────────────────
//
// A navegação por abas não empilha telas como uma pilha comum: quando uma tela
// que não é aba é aberta a partir de outra — a configuração de um evento, a
// equipe de um setor —, o cabeçalho aparece com o título mas SEM a seta. No
// computador ainda resta o botão do navegador; no celular, não resta nada, e a
// pessoa fica presa na tela.
//
// Isso é o tipo de defeito que não aparece em teste nenhum e trava a pessoa na
// primeira vez que ela usa. Toda tela que não é aba passa a receber este botão.

import { Pressable, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { Icone } from './icone'
import { cor, espaco, raio } from './tema'

export function BotaoDeVoltar() {
  const router = useRouter()

  return (
    <Pressable
      onPress={() => {
        /*
         * Voltar quando dá; para o começo quando não dá.
         *
         * Uma tela aberta por link direto — ou depois de recarregar a página no
         * navegador — não tem para onde voltar, e um botão que não faz nada é
         * pior que um botão ausente: a pessoa toca três vezes antes de desistir.
         */
        if (router.canGoBack()) router.back()
        else router.replace('/')
      }}
      accessibilityRole="button"
      accessibilityLabel="Voltar"
      hitSlop={8}
      style={({ pressed }) => [e.botao, pressed && e.tocado]}
    >
      <Icone nome="ChevronLeft" tamanho={22} tom={cor.neutro800} />
    </Pressable>
  )
}

const e = StyleSheet.create({
  botao: {
    width: 36,
    height: 36,
    marginLeft: espaco.s,
    borderRadius: raio.campo,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tocado: { backgroundColor: cor.neutro100 },
})
