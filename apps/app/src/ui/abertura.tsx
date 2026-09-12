// A animação de abertura — um vídeo curto que toca uma vez, sozinho, por
// cima da tela de entrar, e some assim que termina.
//
// Aparece toda vez que a pessoa PRECISA entrar de novo: na primeira
// instalação (sem sessão nenhuma) e depois que a sessão expira — nunca para
// quem já está logado, porque `app/entrar.tsx` só monta quando não há
// sessão válida. Não precisa de nenhuma marca "já vi" guardada no aparelho:
// o próprio estado de sessão já decide quando mostrar.

import { useEffect, useState } from 'react'
import { Pressable, StyleSheet } from 'react-native'
import { useEventListener } from 'expo'
import { useVideoPlayer, VideoView } from 'expo-video'
import { PALETAS } from './tema'

const cor = PALETAS.escuro.cor

/*
 * Bem mais longa que o vídeo (que tem uns 12s) — só existe para o caso raro
 * de o autoplay falhar por algum motivo e ninguém tocar a tela: sem isto, a
 * pessoa ficaria presa num quadro parado do vídeo sem saber que dá pra tocar
 * para pular.
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
