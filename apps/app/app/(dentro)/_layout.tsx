// Tudo que exige estar logado passa por aqui.
//
// ─── DUAS RESPONSABILIDADES ─────────────────────────────────────────────────
//
// 1. A GUARDA. A checagem de sessão é feita no LAYOUT, e não em cada tela: uma
//    tela nova criada daqui a três meses fica protegida por existir dentro
//    desta pasta, sem ninguém precisar lembrar de repetir a verificação.
//    Segurança por construção é mais confiável que segurança por disciplina.
//
// 2. O MENU. No computador ele é uma coluna à esquerda; no celular, uma barra
//    embaixo. Mas a LISTA é a mesma, e vem de `src/navegacao/menu.ts`, que usa
//    as mesmas funções de permissão que a API usa para recusar a rota. Menu e
//    servidor contando histórias diferentes é o pior dos dois mundos: a pessoa
//    toca no botão e leva um "não".
//
// Cabem três abas. O resto do menu não some — mora inteiro atrás de "Mais".

import { Redirect, Tabs } from 'expo-router'
import { Platform } from 'react-native'
import { useSessao } from '../../src/sessao/contexto'
import { abasDe } from '../../src/navegacao/menu'
import { Icone } from '../../src/ui/icone'
import { cor, texto, tipo, uso } from '../../src/ui/tema'

/** Toda tela desta pasta. As que não são aba do papel atual recebem `href: null`. */
const TELAS = [
  { nome: 'index', rota: '/' },
  { nome: 'escanear', rota: '/escanear' },
  { nome: 'ponto', rota: '/ponto' },
  { nome: 'atividades', rota: '/atividades' },
  { nome: 'credencial', rota: '/credencial' },
  { nome: 'meus-dias', rota: '/meus-dias' },
] as const

export default function Dentro() {
  const { sessao } = useSessao()

  if (!sessao) return <Redirect href="/entrar" />

  const abas = abasDe(sessao.papel)
  const porRota = new Map(abas.map(a => [a.rota, a]))

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: uso.superficie },
        headerTintColor: cor.neutro800,
        headerTitleStyle: { fontFamily: tipo.semi, fontSize: 16, color: cor.neutro800 },
        headerShadowVisible: false,
        sceneStyle: { backgroundColor: cor.fundo },
        tabBarActiveTintColor: cor.acento500,
        tabBarInactiveTintColor: cor.neutro400,
        tabBarStyle: {
          backgroundColor: uso.superficie,
          borderTopWidth: 1,
          borderTopColor: uso.borda,
          // No celular a barra encosta na borda de baixo; no navegador ela fica
          // com uma altura de dedo mesmo sem a área segura do aparelho.
          height: Platform.OS === 'web' ? 62 : undefined,
        },
        tabBarLabelStyle: { ...texto.xxs, fontFamily: tipo.media },
      }}
    >
      {TELAS.map(tela => {
        const aba = porRota.get(tela.rota)
        return (
          <Tabs.Screen
            key={tela.nome}
            name={tela.nome}
            options={{
              // `href: null` mantém a tela navegável por push, mas fora da
              // barra: é assim que "Atividades" existe para o supervisor sem
              // ocupar aba de quem não a tem entre as três primeiras.
              href: aba ? (tela.rota as never) : null,
              title: aba?.rotulo ?? '',
              headerShown: tela.nome !== 'index',
              tabBarIcon: ({ color, focused }) => (
                <Icone
                  nome={aba?.icone ?? 'Clock'}
                  tamanho={22}
                  tom={color}
                  espessura={focused ? 2.4 : 2}
                />
              ),
            }}
          />
        )
      })}

      <Tabs.Screen
        name="mais"
        options={{
          title: 'Mais',
          headerShown: false,
          tabBarIcon: ({ color, focused }) => (
            <Icone nome="MoreHorizontal" tamanho={22} tom={color} espessura={focused ? 2.4 : 2} />
          ),
        }}
      />

      {/* Não é aba: abre a partir da lista de eventos, e volta para ela. */}
      <Tabs.Screen name="novo-evento" options={{ href: null, title: 'Entrar num evento' }} />
    </Tabs>
  )
}
