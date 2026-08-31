// O cartão do evento que está acontecendo agora.
//
// É a peça mais visível do painel, e a cópia da `.evento-vivo` do sistema web.
// Escura e grande de propósito: é a única coisa da tela que exige ação NESTE
// momento, e precisa disputar atenção com quatro indicadores coloridos logo
// acima.
//
// A métrica do cartão é "presentes agora" porque, durante o evento, é a
// pergunta que se repete no rádio a cada dez minutos.

import { Pressable, View, StyleSheet, Text } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { formatarBR } from '@credenciei/dominio'
import type { EventoDoPainel } from '@credenciei/contrato'
import { Icone } from './icone'
import { espaco, eventoAoVivo as v, raio, texto, tipo } from './tema'

export function CartaoDeEventoAoVivo({
  evento, aoTocar,
}: { evento: EventoDoPainel; aoTocar?: () => void }) {
  const pct = evento.equipe > 0 ? Math.round((evento.presentes / evento.equipe) * 100) : 0

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

        <View style={e.meta}>
          <Metadado icone="CalendarDays" texto={formatarBR(evento.dataInicio, 'data')} />
          {evento.local ? <Metadado icone="MapPin" texto={evento.local} /> : null}
          <Metadado
            icone="Users"
            texto={`${evento.setores} ${evento.setores === 1 ? 'setor' : 'setores'}`}
          />
        </View>

        {evento.equipe === 0 ? (
          <Text style={e.semEquipe}>Equipe ainda não cadastrada neste evento</Text>
        ) : (
          <View style={e.presenca}>
            <View style={e.presencaLinha}>
              <View>
                <Text style={e.presencaRotulo}>Presentes agora</Text>
                <Text style={e.presencaValor}>
                  {evento.presentes}
                  <Text style={e.presencaTotal}>/{evento.equipe}</Text>
                </Text>
              </View>
              <View style={e.pastilha}>
                <Text style={e.pastilhaTexto}>{pct}%</Text>
              </View>
            </View>

            <View style={e.trilho}>
              {pct > 0 ? (
                <LinearGradient
                  colors={[...v.barra] as [string, string]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={[e.barra, { width: `${pct}%` }]}
                />
              ) : null}
            </View>
          </View>
        )}
      </View>
    </LinearGradient>
  )

  if (!aoTocar) return cartao

  return (
    <Pressable
      onPress={aoTocar}
      accessibilityRole="button"
      accessibilityLabel={`Configurar ${evento.nome}`}
      style={({ pressed }) => (pressed ? { transform: [{ scale: 0.99 }], opacity: 0.95 } : null)}
    >
      {cartao}
    </Pressable>
  )
}

function Metadado({ icone, texto: valor }: { icone: string; texto: string }) {
  return (
    <View style={e.metaItem}>
      <Icone nome={icone} tamanho={12} tom={v.texto} espessura={2} />
      <Text style={e.metaTexto} numberOfLines={1}>{valor}</Text>
    </View>
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

  meta: { flexDirection: 'row', flexWrap: 'wrap', gap: espaco.m, marginTop: 6 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: '100%' },
  metaTexto: { ...texto.xs, fontFamily: tipo.regular, color: v.texto, flexShrink: 1 },

  semEquipe: { ...texto.xs, fontFamily: tipo.regular, color: 'rgba(255,255,255,0.5)', marginTop: 20 },

  presenca: { marginTop: 20 },
  presencaLinha: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: espaco.m,
    marginBottom: espaco.s,
  },
  presencaRotulo: { ...texto.xs, fontFamily: tipo.regular, color: v.texto },
  presencaValor: {
    fontSize: 24,
    lineHeight: 28,
    letterSpacing: -0.5,
    fontFamily: tipo.semi,
    color: '#ffffff',
    marginTop: 2,
  },
  presencaTotal: { fontSize: 16, fontFamily: tipo.regular, color: v.textoFraco },

  pastilha: {
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 1,
    backgroundColor: '#f0fdf4',
    marginBottom: 4,
  },
  pastilhaTexto: { fontSize: 11, lineHeight: 16, fontFamily: tipo.semi, color: '#15803d' },

  trilho: { height: 8, borderRadius: 999, backgroundColor: v.trilho, overflow: 'hidden' },
  barra: { height: '100%', borderRadius: 999 },
})
