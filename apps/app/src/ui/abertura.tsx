// A animação de abertura — um vídeo curto que toca uma vez, sozinho, por
// cima da tela de entrar, e some assim que termina.
//
// Aparece toda vez que a pessoa PRECISA entrar de novo: na primeira
// instalação (sem sessão nenhuma) e depois que a sessão expira — nunca para
// quem já está logado, porque `app/entrar.tsx` só monta quando não há
// sessão válida. Não precisa de nenhuma marca "já vi" guardada no aparelho:
// o próprio estado de sessão já decide quando mostrar.

import { useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { useEventListener } from 'expo'
import { useVideoPlayer, VideoView } from 'expo-video'
import { PALETAS } from './tema'

const cor = PALETAS.escuro.cor

export function AberturaDoApp({ aoTerminar }: { aoTerminar: () => void }) {
  const [terminou, setTerminou] = useState(false)

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const player = useVideoPlayer(require('../../assets/abertura.mp4'), p => {
    p.play()
  })

  const terminar = () => {
    if (terminou) return
    setTerminou(true)
    aoTerminar()
  }

  useEventListener(player, 'playToEnd', terminar)

  return (
    // Um toque pula a animação — ninguém deve ficar preso esperando um
    // vídeo para chegar à tela de login.
    <Pressable style={e.fora} onPress={terminar} accessibilityLabel="Pular animação de abertura">
      <VideoView
        player={player}
        style={e.video}
        contentFit="cover"
        nativeControls={false}
        pointerEvents="none"
      />
    </Pressable>
  )
}

const e = StyleSheet.create({
  fora: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: cor.fundoEscuro,
    zIndex: 10,
  },
  video: { flex: 1 },
})
