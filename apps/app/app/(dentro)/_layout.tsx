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

import { useEffect } from 'react'
import { Redirect, Tabs } from 'expo-router'
import { Platform } from 'react-native'
import { useSessao } from '../../src/sessao/contexto'
import { useAlvoDePermissao } from '../../src/navegacao/alvo-de-permissao'
import { useFila } from '../../src/fila/contexto'
import { abasDe } from '../../src/navegacao/menu'
import { registrarTokenDePush } from '../../src/notificacoes'
import { ProvedorDeParticipacaoSelecionada } from '../../src/participacao-selecionada'
import { Icone } from '../../src/ui/icone'
import { BotaoDeVoltar } from '../../src/ui/voltar'
import { texto, tipo } from '../../src/ui/tema'
import { useTema } from '../../src/ui/tema-contexto'

/**
 * Toda tela desta pasta.
 *
 * As que não são aba do papel atual recebem `href: null` — continuam
 * navegáveis a partir do "Mais", só não ocupam lugar na barra. O `titulo` é o
 * do cabeçalho quando ela é aberta assim: sem ele, quem chega por "Mais" vê uma
 * barra vazia e não sabe onde está.
 */
const TELAS = [
  { nome: 'index', rota: '/', titulo: 'Início' },
  { nome: 'escanear', rota: '/escanear', titulo: 'Escanear QR' },
  { nome: 'ponto', rota: '/ponto', titulo: 'Registrar ponto' },
  { nome: 'atividades', rota: '/atividades', titulo: 'Atividades do evento' },
  { nome: 'acessos', rota: '/acessos', titulo: 'Acessos' },
  { nome: 'credencial', rota: '/credencial', titulo: 'Minha credencial' },
  { nome: 'meus-dias', rota: '/meus-dias', titulo: 'Meus dias' },
  { nome: 'meu-pagamento', rota: '/meu-pagamento', titulo: 'Meu pagamento' },
  { nome: 'meu-historico', rota: '/meu-historico', titulo: 'Meu histórico' },
  { nome: 'avisos', rota: '/avisos', titulo: 'Avisos' },
] as const

export default function Dentro() {
  const { sessao, cliente } = useSessao()
  const alvo = useAlvoDePermissao()
  const fila = useFila()
  const { cor, uso } = useTema()

  // Uma vez por login, não a cada renovação de token — repetir não custa
  // nada (o servidor faz upsert pelo token do aparelho), mas não precisa.
  const logado = !!sessao
  useEffect(() => {
    if (logado) void registrarTokenDePush(cliente)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logado])

  if (!sessao) return <Redirect href="/entrar" />

  const abas = abasDe(alvo ?? sessao.papel)
  const porRota = new Map(abas.map(a => [a.rota, a]))

  /*
   * Quantas batidas ainda não subiram — de QUALQUER participação, não só a
   * que está aberta agora. Sem isto, quem registra o meio e sai da tela da
   * credencial só descobre que ainda não subiu se voltar lá — a aba é o
   * único lugar sempre visível, então é onde o aviso precisa morar.
   */
  const naFila = fila.itens.filter(i => i.estado !== 'enviada').length

  return (
    <ProvedorDeParticipacaoSelecionada>
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
                title: aba?.rotulo ?? tela.titulo,
                headerShown: tela.nome !== 'index',
                /*
                 * Seta de voltar só em quem NÃO é aba.
                 *
                 * Uma aba não tem de onde ter vindo — a barra de baixo é o
                 * caminho. Já uma tela aberta a partir de uma lista precisa
                 * devolver a pessoa para a lista, e a navegação por abas não põe
                 * essa seta sozinha.
                 */
                ...(aba ? {} : { headerLeft: () => <BotaoDeVoltar /> }),
                // Só na credencial: é onde a pessoa registra o meio, e a
                // única aba sempre visível — mesmo quando ela navegou pra
                // outro lugar, o número lembra que ainda falta subir.
                ...(tela.nome === 'credencial' && naFila > 0
                  ? { tabBarBadge: naFila, tabBarBadgeStyle: { backgroundColor: cor.acento500 } }
                  : {}),
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

        {/*
          Não são abas: abrem a partir de uma lista, e voltam para ela — por isso
          todas levam a seta.
        */}
        {[
          { nome: 'novo-evento', titulo: 'Entrar num evento' },
          { nome: 'criar-evento', titulo: 'Novo evento' },
          { nome: 'novo-acesso', titulo: 'Criar acesso' },
          { nome: 'evento/[id]/index', titulo: 'Configurar evento' },
          { nome: 'evento/[id]/editar', titulo: 'Editar evento' },
          { nome: 'setor/[id]', titulo: 'Equipe do setor' },
          { nome: 'organizacoes', titulo: 'Organizações' },
          { nome: 'nova-organizacao', titulo: 'Nova organização' },
          { nome: 'base-funcionarios', titulo: 'Base de funcionários' },
          { nome: 'encontrar', titulo: 'Encontre colaborador' },
          { nome: 'whatsapp', titulo: 'WhatsApp' },
          { nome: 'pessoa/[cpf]', titulo: 'Ficha da pessoa' },
          { nome: 'veiculos', titulo: 'Veículos' },
          { nome: 'bloquear-cpf', titulo: 'Bloquear CPF' },
          { nome: 'relatorios', titulo: 'Relatórios' },
          { nome: 'lancar-ponto', titulo: 'Lançar ponto' },
          { nome: 'editar-colaborador', titulo: 'Editar colaborador' },
          { nome: 'conferencia/[id]', titulo: 'Conferência de equipe' },
          { nome: 'suporte', titulo: 'Suporte de Sistema' },
          { nome: 'configuracoes', titulo: 'Configurações' },
          { nome: 'auditoria', titulo: 'Trilha de auditoria' },
        ].map(tela => (
          <Tabs.Screen
            key={tela.nome}
            name={tela.nome}
            options={{ href: null, title: tela.titulo, headerLeft: () => <BotaoDeVoltar /> }}
          />
        ))}
      </Tabs>
    </ProvedorDeParticipacaoSelecionada>
  )
}
