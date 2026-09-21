// A animação de abertura — um vídeo curto que toca uma vez, sozinho, por
// cima da tela de entrar, e some assim que termina.
//
// Aparece toda vez que a pessoa PRECISA entrar de novo: na primeira
// instalação (sem sessão nenhuma) e depois que a sessão expira — nunca para
// quem já está logado, porque `app/entrar.tsx` só monta quando não há
// sessão válida. Não precisa de nenhuma marca "já vi" guardada no aparelho:
// o próprio estado de sessão já decide quando mostrar.

import { useEffect, useState } from 'react'
import { View, StyleSheet } from 'react-native'
import { useEventListener } from 'expo'
import { useVideoPlayer, VideoView } from 'expo-video'

/*
 * Bem mais longa que o vídeo (que tem uns 12s) — só existe para o caso raro
 * de o autoplay falhar por algum motivo: sem isto, a pessoa ficaria presa
 * para sempre num quadro parado do vídeo, sem conseguir chegar à tela de
 * entrar. Não é mais possível pular tocando na tela — decisão do Juan: um
 * toque durante a animação não pode levar direto ao login.
 */
const TEMPO_MAXIMO_MS = 20_000

export function AberturaDoApp({ aoTerminar }: { aoTerminar: () => void }) {
  const [terminou, setTerminou] = useState(false)

  const terminar = () => {
    if (terminou) return
    setTerminou(true)
    aoTerminar()
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const player = useVideoPlayer(require('../../assets/abertura.mp4'), p => {
    /*
     * Sem mudo, o navegador BLOQUEIA o autoplay — a política de todo browser
     * moderno. Sem isto, `play()` falhava em silêncio (nenhum erro, nenhum
     * evento) e o vídeo ficava parado no primeiro quadro, que aqui é branco:
     * foi exatamente esse o "branco" que apareceu na tela.
     */
    p.muted = true
  })

  useEventListener(player, 'playToEnd', terminar)

  useEffect(() => {
    /*
     * `play()` só depois de montado: chamado ainda dentro do `useVideoPlayer`
     * (antes do <VideoView> existir no DOM), o navegador ignora o pedido em
     * silêncio — o vídeo carrega, mas nunca sai do quadro zero.
     */
    player.play()
    const t = setTimeout(terminar, TEMPO_MAXIMO_MS)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <View style={e.fora}>
      <VideoView
        player={player}
        style={e.video}
        // O vídeo é 16:9 (paisagem); "cover" enchia a tela ESTICANDO e
        // cortando as bordas — o texto saía cortado dos dois lados. "contain"
        // mostra o quadro inteiro, do tamanho real, centralizado.
        contentFit="contain"
        nativeControls={false}
        pointerEvents="none"
        // No Android, o padrão ("surfaceView") desenha o vídeo numa camada de
        // hardware separada da árvore do React Native — com letterbox
        // ("contain"), essa camada pode ficar um pixel fora de sincronia a
        // cada quadro, e a sobra pisca em preto porque NENHUMA cor de fundo
        // do RN alcança essa camada. "textureView" desenha dentro da árvore
        // normal, mais lento mas sem esse artefato — é a recomendação da
        // própria documentação do expo-video para este cenário.
        surfaceType="textureView"
      />
    </View>
  )
}

const e = StyleSheet.create({
  fora: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    // O fundo do PRÓPRIO vídeo é branco do começo ao fim (conferido quadro a
    // quadro) — o fundo daqui precisa ser o MESMO branco, senão "contain"
    // sobra como barra escura em volta de um vídeo branco, que é pior do que
    // o corte que "cover" fazia.
    backgroundColor: '#ffffff',
    zIndex: 10,
  },
  video: {
    flex: 1,
    // O `VideoView` é opaco e fica por CIMA do `fora`: pintar branco só no
    // `fora` não bastava, porque a sobra do "contain" (a proporção do vídeo
    // não bate exata com a da tela) é pintada pelo próprio VideoView, com o
    // preto padrão dele — sobrava uma linha preta embaixo do vídeo.
    backgroundColor: '#ffffff',
  },
})
