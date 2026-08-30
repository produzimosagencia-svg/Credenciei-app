// Tudo que exige estar logado passa por aqui.
//
// A checagem é feita no LAYOUT, e não em cada tela: uma tela nova criada daqui
// a três meses fica protegida por existir dentro desta pasta, sem ninguém
// precisar lembrar de repetir a verificação. Segurança por construção é mais
// confiável que segurança por disciplina.

import { Redirect, Stack } from 'expo-router'
import { useSessao } from '../../src/sessao/contexto'
import { cor } from '../../src/ui/tema'

export default function Dentro() {
  const { sessao } = useSessao()

  if (!sessao) return <Redirect href="/entrar" />

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: cor.marca },
        headerTintColor: cor.sobreEscuro,
        headerTitleStyle: { fontWeight: '700' },
        contentStyle: { backgroundColor: cor.fundo },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Meus eventos' }} />
      <Stack.Screen name="novo-evento" options={{ title: 'Entrar num evento' }} />
    </Stack>
  )
}
