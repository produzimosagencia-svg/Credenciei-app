// O cartão do evento que está acontecendo agora.
//
// É a peça mais visível do painel, e a cópia da `.evento-vivo` do sistema web
// — reconferida byte a byte contra `app/admin/page.tsx` (`EventoAoVivo`) em
// 13/09/2026. Escura e grande de propósito: é a única coisa da tela que
// exige ação NESTE momento, e precisa disputar atenção com quatro
// indicadores coloridos logo acima.
//
// Data / Local / Equipe é a mesma ficha em duas colunas do site — não um
// "presentes agora" com barra de progresso, que este cartão nunca teve lá.
// Esse número existe (`evento.presentes`), mas não é este cartão que o
// mostra: quem quer saber quem já chegou abre o evento.

import { Pressable, View, StyleSheet, Text } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { extensoBR } from '@credenciei/dominio'
import type { EventoDoPainel } from '@credenciei/contrato'
import { Icone } from './icone'
import { espaco, eventoAoVivo as v, gradienteMarca, raio, texto, tipo } from './tema'

export function CartaoDeEventoAoVivo({
  evento, aoTocar,
}: { evento: EventoDoPainel; aoTocar?: () => void }) {
  const cartao = (
    <LinearGradient
      colors={[...v.degrade] as [string, string, string]}
      locations={[...v.posicoes] as [number, number, number]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={e.fora}
    >
      <View style={e.brilho} />

      <View style={e.conteudo}>
        {evento.aoVivo ? (
          <View style={e.selo}>
            <View style={e.ponto} />
            <Text style={e.seloTexto}>AO VIVO</Text>
          </View>
        ) : null}

        <Text style={e.nome} numberOfLines={2}>{evento.nome}</Text>

        <View style={e.ficha}>
          <View style={e.fichaLinha}>
            <Text style={e.fichaRotulo}>Data</Text>
            <Text style={e.fichaValor}>
              {extensoBR(evento.dataInicio, { day: '2-digit', month: 'short', year: 'numeric' })}
            </Text>
          </View>

          {evento.local ? (
            <View style={e.fichaLinha}>
              <Text style={e.fichaRotulo}>Local</Text>
              <Text style={e.fichaValor} numberOfLines={1}>{evento.local}</Text>
            </View>
          ) : null}

          <View style={e.fichaLinha}>
            <Text style={e.fichaRotulo}>Equipe</Text>
            <Text style={e.fichaValor}>
              {evento.setores} {evento.setores === 1 ? 'setor' : 'setores'} · {evento.equipe} {evento.equipe === 1 ? 'funcionário' : 'funcionários'}
            </Text>
          </View>
        </View>

        <LinearGradient
          colors={[...gradienteMarca.cores] as [string, string, string]}
          locations={[...gradienteMarca.posicoes] as [number, number, number]}
          start={gradienteMarca.inicio}
          end={gradienteMarca.fim}
          style={[e.botaoAbrir, gradienteMarca.sombra]}
        >
          <Text style={e.botaoAbrirTexto}>Abrir evento</Text>
          <Icone nome="ArrowRight" tamanho={14} tom="#ffffff" espessura={2} />
        </LinearGradient>
      </View>
    </LinearGradient>
  )

  if (!aoTocar) return cartao

  return (
    <Pressable
      onPress={aoTocar}
      accessibilityRole="button"
      accessibilityLabel={`Abrir ${evento.nome}`}
      style={({ pressed }) => (pressed ? { transform: [{ scale: 0.99 }], opacity: 0.95 } : null)}
    >
      {cartao}
    </Pressable>
  )
}

const e = StyleSheet.create({
  fora: {
    borderRadius: raio.cartao,
    borderWidth: 1,
    borderColor: v.borda,
    paddingTop: 18,
    paddingHorizontal: 20,
    paddingBottom: 20,
    marginBottom: espaco.m,
    overflow: 'hidden',
    ...v.sombra,
  },
  brilho: {
    // No estilo, e não como propriedade: `props.pointerEvents` está
    // descontinuado no React Native atual.
    pointerEvents: 'none',
    position: 'absolute',
    top: '-60%',
    right: '-20%',
    width: '60%',
    height: '170%',
    borderRadius: 999,
    backgroundColor: v.brilho,
  },
  conteudo: { position: 'relative' },

  selo: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: espaco.s },
  ponto: { width: 7, height: 7, borderRadius: 999, backgroundColor: v.ponto },
  seloTexto: { fontSize: 11, lineHeight: 16, letterSpacing: 0.66, fontFamily: tipo.semi, color: v.vivo },

  nome: { fontSize: 18, lineHeight: 24, letterSpacing: -0.38, fontFamily: tipo.semi, color: '#ffffff' },

  /*
   * A ficha Data/Local/Equipe — duas colunas no site (`grid-cols-[auto_1fr]`).
   * RN não tem grid; cada linha é uma `row` própria com o rótulo numa largura
   * fixa, larga o bastante para "Equipe" (a mais comprida das três) não
   * quebrar.
   */
  ficha: { marginTop: espaco.g, gap: 4 },
  fichaLinha: { flexDirection: 'row', gap: espaco.m },
  fichaRotulo: { ...texto.xs, fontFamily: tipo.regular, color: v.texto, width: 46 },
  fichaValor: { ...texto.xs, fontFamily: tipo.regular, color: '#ffffff', flex: 1, minWidth: 0 },

  botaoAbrir: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 40,
    borderRadius: raio.campo,
    paddingHorizontal: espaco.m,
    marginTop: espaco.g,
  },
  botaoAbrirTexto: { ...texto.xs, fontFamily: tipo.forte, color: '#ffffff' },
})
