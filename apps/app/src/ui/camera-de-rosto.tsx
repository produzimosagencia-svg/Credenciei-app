// A câmera que tira a foto de validação.
//
// ─── PARA QUE ESTA FOTO SERVE ───────────────────────────────────────────────
//
// Ela é a única prova de que o colaborador estava na frente de quem registrou o
// ponto por ele. Sem ela, registrar por terceiro seria só digitar um nome — e
// uma batida que ninguém consegue contestar é uma porta aberta.
//
// Por isso a câmera abre na FRONTAL por padrão e mostra o rosto grande: quem
// opera aponta para a pessoa, confere, e só então confirma. E por isso ela
// devolve a imagem já reduzida — a foto vai junto com a batida por uma rede de
// evento, e uma foto de quatro megabytes não sobe.

import { useMemo, useRef, useState } from 'react'
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { CameraView, useCameraPermissions, type CameraType } from 'expo-camera'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Botao, Corpo, TituloDeCartao } from './componentes'
import { Icone } from './icone'
import { espaco, raio, texto, tipo } from './tema'
import { useTema, type Tokens } from './tema-contexto'

/**
 * Quanto a foto é comprimida antes de subir.
 *
 * Meio de qualidade numa imagem de rosto continua reconhecível — que é tudo que
 * ela precisa ser — e cabe numa rede de estádio lotado. Qualidade 1 gera
 * arquivo de vários megabytes, que numa fila de trezentas pessoas significa
 * fotos que nunca chegam.
 */
const QUALIDADE = 0.5

export function CameraDeRosto({
  aberta, aoFechar, aoTirar,
}: {
  aberta: boolean
  aoFechar: () => void
  aoTirar: (base64: string) => void
}) {
  const [permissao, pedirPermissao] = useCameraPermissions()
  const [lado, setLado] = useState<CameraType>('front')
  const [tirando, setTirando] = useState(false)
  const camera = useRef<CameraView>(null)
  const insets = useSafeAreaInsets()
  const { cor } = useTema()
  const e = useMemo(() => criarEstilos(cor), [cor])

  async function tirar() {
    if (tirando) return
    setTirando(true)
    try {
      const foto = await camera.current?.takePictureAsync({ base64: true, quality: QUALIDADE })
      if (foto?.base64) aoTirar(`data:image/jpeg;base64,${foto.base64}`)
    } finally {
      setTirando(false)
    }
  }

  return (
    <Modal visible={aberta} animationType="slide" onRequestClose={aoFechar}>
      <View style={e.fora}>
        {!permissao ? (
          // Ainda perguntando ao sistema. Um instante, e não um estado de erro.
          <View style={e.aviso} />
        ) : !permissao.granted ? (
          <View style={[e.aviso, { paddingTop: insets.top + espaco.ggg }]}>
            <Icone nome="Camera" tamanho={32} tom={cor.neutro400} />
            <TituloDeCartao>A câmera está bloqueada</TituloDeCartao>
            <Corpo>
              A foto do rosto é o que comprova que a pessoa estava na sua frente.
              Sem a câmera, não dá para registrar por ela.
            </Corpo>
            <View style={e.acoesDoAviso}>
              <Botao
                titulo={permissao.canAskAgain ? 'Liberar a câmera' : 'Liberar nos ajustes do aparelho'}
                onPress={() => { void pedirPermissao() }}
              />
              <Botao titulo="Voltar" onPress={aoFechar} tipo="secundario" />
            </View>
          </View>
        ) : (
          <>
            <CameraView ref={camera} style={e.camera} facing={lado} />

            <View style={[e.topo, { paddingTop: insets.top + espaco.m }]}>
              <Pressable onPress={aoFechar} style={e.botaoRedondo} accessibilityLabel="Fechar">
                <Icone nome="X" tamanho={20} tom="#ffffff" />
              </Pressable>
              <Text style={e.instrucao}>Enquadre o rosto da pessoa</Text>
              <Pressable
                onPress={() => setLado(l => (l === 'front' ? 'back' : 'front'))}
                style={e.botaoRedondo}
                accessibilityLabel="Virar a câmera"
              >
                <Icone nome="SwitchCamera" tamanho={20} tom="#ffffff" />
              </Pressable>
            </View>

            <View style={[e.rodape, { paddingBottom: insets.bottom + espaco.gg }]}>
              <Pressable
                onPress={tirar}
                disabled={tirando}
                accessibilityRole="button"
                accessibilityLabel="Tirar a foto"
                style={({ pressed }) => [e.disparo, pressed && e.disparoTocado, tirando && e.disparoTravado]}
              >
                <View style={e.disparoMiolo} />
              </Pressable>
            </View>
          </>
        )}
      </View>
    </Modal>
  )
}

function criarEstilos(cor: Tokens['cor']) {
  return StyleSheet.create({
    fora: { flex: 1, backgroundColor: '#000000' },
    camera: { flex: 1 },

    aviso: {
      flex: 1,
      backgroundColor: cor.fundo,
      padding: espaco.gg,
      gap: espaco.m,
      justifyContent: 'center',
    },
    acoesDoAviso: { gap: espaco.s, marginTop: espaco.m },

  topo: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: espaco.g,
    paddingBottom: espaco.m,
    gap: espaco.m,
  },
  botaoRedondo: {
    width: 40,
    height: 40,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  instrucao: { ...texto.corpoForte, fontFamily: tipo.semi, color: '#ffffff', flex: 1, textAlign: 'center' },

  rodape: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  /* Alvo grande: quem dispara está com uma mão só, e a outra segurando a fila. */
  disparo: {
    width: 76,
    height: 76,
    borderRadius: 999,
    borderWidth: 4,
    borderColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  disparoTocado: { transform: [{ scale: 0.94 }] },
  disparoTravado: { opacity: 0.5 },
  disparoMiolo: { width: 58, height: 58, borderRadius: 999, backgroundColor: '#ffffff' },
  })
}
