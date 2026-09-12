// A raiz do app: o que existe antes de qualquer tela.
//
// As rotas do Credenciei são arquivos desta pasta (expo-router). Dois grupos:
//
//   entrar.tsx    a porta, para quem ainda não tem sessão
//   (dentro)/     tudo que exige estar logado — o parêntese é só organização,
//                 não aparece no endereço
//
// Quem decide para onde a pessoa vai é `(dentro)/_layout.tsx`. Aqui em cima
// ficam as três coisas que valem para o app inteiro: a fonte, a coluna e a
// sessão.

import { useEffect } from 'react'
import { Platform, StyleSheet, View } from 'react-native'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { useFonts } from 'expo-font'
import * as SplashScreen from 'expo-splash-screen'
import {
  Archivo_400Regular, Archivo_500Medium, Archivo_600SemiBold, Archivo_700Bold, Archivo_800ExtraBold,
} from '@expo-google-fonts/archivo'
import { ProvedorDeSessao } from '../src/sessao/contexto'
import { ProvedorDaFila } from '../src/fila/contexto'
// `cor`/`sombra` aqui são o valor ESTÁTICO (claro) — a moldura cinza atrás do
// app na versão web é chrome de navegador, não tela do app, e não precisa
// mudar com o toggle.
import { cor, LARGURA_MAXIMA, sombra } from '../src/ui/tema'
import { ProvedorDeTema, useTema } from '../src/ui/tema-contexto'

// A tela de abertura fica no ar até a fonte estar carregada. Sem isto, o app
// aparece com a fonte do sistema e troca sozinho meio segundo depois — o
// "pulo" que denuncia aplicativo mal acabado.
void SplashScreen.preventAutoHideAsync()

export default function Raiz() {
  // Archivo, a mesma do sistema web desde o rebranding "Arena". É ela que faz
  // o app parecer o mesmo produto — 800 incluso, o peso dos títulos.
  const [fontesProntas] = useFonts({
    Archivo_400Regular,
    Archivo_500Medium,
    Archivo_600SemiBold,
    Archivo_700Bold,
    Archivo_800ExtraBold,
  })

  useEffect(() => {
    if (fontesProntas) void SplashScreen.hideAsync()
  }, [fontesProntas])

  if (!fontesProntas) return null

  return (
    <SafeAreaProvider>
      <ProvedorDeTema>
        <Coluna>
          <ProvedorDeSessao>
            {/*
              A fila mora acima das telas de propósito: a pessoa registra o meio,
              guarda o celular e vai trabalhar. Se ela morresse junto com a tela
              da credencial, a batida ficaria parada até alguém voltar lá.
            */}
            <ProvedorDaFila>
              <Navegacao />
            </ProvedorDaFila>
          </ProvedorDeSessao>
        </Coluna>
      </ProvedorDeTema>
    </SafeAreaProvider>
  )
}

/** Separado de `Raiz` só para poder chamar `useTema()` — que exige estar dentro do provedor. */
function Navegacao() {
  const { modo, cor, uso, tipo } = useTema()

  return (
    <>
      {/* Barra do sistema: conteúdo claro sobre fundo escuro, e vice-versa. */}
      <StatusBar style={modo === 'escuro' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: uso.superficie },
          headerTintColor: cor.neutro800,
          headerTitleStyle: { fontFamily: tipo.forte, fontSize: 16, color: cor.neutro800 },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: cor.fundo },
        }}
      >
        <Stack.Screen name="entrar" options={{ headerShown: false }} />
        <Stack.Screen name="(dentro)" options={{ headerShown: false }} />
      </Stack>
    </>
  )
}

/**
 * A coluna de largura de celular.
 *
 * No celular isto não faz nada — a tela já é mais estreita que o limite. No
 * navegador é o que impede o app de virar um formulário esticado de mil e
 * quatrocentos pixels: o que estamos construindo é um aplicativo, e a janela do
 * navegador é só uma prévia dele.
 */
function Coluna({ children }: { children: React.ReactNode }) {
  if (Platform.OS !== 'web') return <>{children}</>

  return (
    <View style={e.paginaWeb}>
      <View style={e.colunaWeb}>{children}</View>
    </View>
  )
}

const e = StyleSheet.create({
  paginaWeb: { flex: 1, backgroundColor: cor.neutro300, alignItems: 'center' },
  colunaWeb: {
    flex: 1,
    width: '100%',
    maxWidth: LARGURA_MAXIMA,
    backgroundColor: cor.fundo,
    ...sombra.lg,
  },
})
