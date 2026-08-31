// Tudo que exige estar logado passa por aqui.
//
// A checagem é feita no LAYOUT, e não em cada tela: uma tela nova criada daqui
// a três meses fica protegida por existir dentro desta pasta, sem ninguém
// precisar lembrar de repetir a verificação. Segurança por construção é mais
// confiável que segurança por disciplina.

import { Redirect, Stack } from 'expo-router'
import { useSessao } from '../../src/sessao/contexto'
import { cor, tipo, uso } from '../../src/ui/tema'

export default function Dentro() {
  const { sessao } = useSessao()

  if (!sessao) return <Redirect href="/entrar" />

  return (
    <Stack
      screenOptions={{
        // Cabeçalho branco com fio embaixo, como a barra superior do painel.
        headerStyle: { backgroundColor: uso.superficie },
        headerTintColor: cor.neutro800,
        headerTitleStyle: { fontFamily: tipo.semi, fontSize: 16, color: cor.neutro800 },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: cor.fundo },
      }}
    >
      {/* O título já está dentro da tela, como no painel — repetir no cabeçalho
          diria a mesma coisa duas vezes na mesma dobra. */}
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="novo-evento" options={{ title: 'Entrar num evento' }} />
    </Stack>
  )
}
