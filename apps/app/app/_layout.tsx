// A raiz do app: o que existe antes de qualquer tela.
//
// As rotas do Credenciei são arquivos desta pasta (expo-router). Dois grupos:
//
//   entrar.tsx    a porta, para quem ainda não tem sessão
//   (dentro)/     tudo que exige estar logado — o parêntese é só organização,
//                 não aparece no endereço
//
// Quem decide para onde a pessoa vai é `(dentro)/_layout.tsx`. Aqui em cima
// ficam só as coisas que valem para o app inteiro.

import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { ProvedorDeSessao } from '../src/sessao/contexto'
import { cor } from '../src/ui/tema'

export default function Raiz() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <ProvedorDeSessao>
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: cor.marca },
            headerTintColor: cor.sobreEscuro,
            headerTitleStyle: { fontWeight: '700' },
            contentStyle: { backgroundColor: cor.fundo },
          }}
        >
          <Stack.Screen name="entrar" options={{ headerShown: false }} />
          <Stack.Screen name="(dentro)" options={{ headerShown: false }} />
        </Stack>
      </ProvedorDeSessao>
    </SafeAreaProvider>
  )
}
