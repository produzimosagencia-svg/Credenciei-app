// As peças que as telas montam.
//
// Existem para que uma decisão de desenho seja tomada uma vez. Quando o botão
// principal mudar de cor, ele muda aqui — e não em nove telas, das quais duas
// seriam esquecidas.

import { type ReactNode } from 'react'
import {
  ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput,
  type TextInputProps, View,
} from 'react-native'
import { cor, espaco, fonte, raio, ALVO_MINIMO } from './tema'

// ─── Estrutura ──────────────────────────────────────────────────────────────

/** O corpo de uma tela: rola, respira nas bordas e sobra espaço no fim. */
export function Tela({ children }: { children: ReactNode }) {
  return (
    <ScrollView
      style={e.tela}
      contentContainerStyle={e.telaConteudo}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  )
}

export function Cartao({ children, onPress }: { children: ReactNode; onPress?: () => void }) {
  if (!onPress) return <View style={e.cartao}>{children}</View>
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [e.cartao, pressed && e.cartaoTocado]}
    >
      {children}
    </Pressable>
  )
}

// ─── Texto ──────────────────────────────────────────────────────────────────

export function Titulo({ children }: { children: ReactNode }) {
  return <Text style={e.titulo}>{children}</Text>
}

export function Subtitulo({ children }: { children: ReactNode }) {
  return <Text style={e.subtitulo}>{children}</Text>
}

export function Corpo({ children, forte }: { children: ReactNode; forte?: boolean }) {
  return <Text style={[e.corpo, forte && e.corpoForte]}>{children}</Text>
}

export function Legenda({ children }: { children: ReactNode }) {
  return <Text style={e.legenda}>{children}</Text>
}

// ─── Ação ───────────────────────────────────────────────────────────────────

export type BotaoProps = {
  titulo: string
  onPress: () => void
  tipo?: 'principal' | 'secundario' | 'texto'
  /** Enquanto true, o botão mostra giro e não aceita toque. */
  ocupado?: boolean
  desabilitado?: boolean
}

/**
 * O botão.
 *
 * Enquanto `ocupado`, ele TRAVA. Não é enfeite: sem isso, a pessoa que não vê
 * reação em dois segundos toca de novo — e num botão de bater ponto, dois
 * toques viram dois envios. A fila trata a duplicata, mas a tela não deveria
 * ter criado o problema.
 */
export function Botao({ titulo, onPress, tipo = 'principal', ocupado, desabilitado }: BotaoProps) {
  const travado = ocupado || desabilitado
  const estilos = {
    principal: [e.botao, e.botaoPrincipal, travado && e.botaoTravado],
    secundario: [e.botao, e.botaoSecundario, travado && e.botaoSecundarioTravado],
    texto: [e.botaoTexto],
  }[tipo]
  const corDoTexto =
    tipo === 'principal'
      ? cor.sobreEscuro
      : travado
        ? cor.desabilitado
        : cor.marca

  return (
    <Pressable
      onPress={onPress}
      disabled={travado}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!travado, busy: !!ocupado }}
      style={({ pressed }) => [...estilos, pressed && !travado && e.botaoTocado]}
    >
      {ocupado
        ? <ActivityIndicator color={corDoTexto} />
        : <Text style={[e.botaoRotulo, { color: corDoTexto }]}>{titulo}</Text>}
    </Pressable>
  )
}

// ─── Entrada de dados ───────────────────────────────────────────────────────

export type CampoProps = TextInputProps & {
  rotulo: string
  /** Dica curta embaixo. Some quando há erro — dois textos competindo confundem. */
  ajuda?: string
  erro?: string
}

export function Campo({ rotulo, ajuda, erro, style, ...resto }: CampoProps) {
  return (
    <View style={e.campo}>
      <Text style={e.campoRotulo}>{rotulo}</Text>
      <TextInput
        style={[e.campoEntrada, !!erro && e.campoEntradaComErro, style]}
        placeholderTextColor={cor.tintaFraca}
        {...resto}
      />
      {erro
        ? <Text style={e.campoErro}>{erro}</Text>
        : ajuda ? <Text style={e.campoAjuda}>{ajuda}</Text> : null}
    </View>
  )
}

/** Uma escolha entre poucas opções. Botão, e não lista suspensa: um toque. */
export function Escolha({
  opcoes, valor, aoEscolher,
}: { opcoes: string[]; valor: string | null; aoEscolher: (v: string) => void }) {
  return (
    <View style={e.escolha}>
      {opcoes.map(o => {
        const marcada = o === valor
        return (
          <Pressable
            key={o}
            onPress={() => aoEscolher(o)}
            accessibilityRole="radio"
            accessibilityState={{ selected: marcada }}
            style={[e.escolhaItem, marcada && e.escolhaItemMarcado]}
          >
            <Text style={[e.escolhaRotulo, marcada && e.escolhaRotuloMarcado]}>{o}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

// ─── Recados ────────────────────────────────────────────────────────────────

export type TipoDeAviso = 'erro' | 'atencao' | 'ok' | 'informacao'

/**
 * Um recado para a pessoa ler.
 *
 * O tipo importa mais do que parece: no sistema web, um bloqueio silencioso fez
 * o Juan sair acreditando que tinha salvado uma configuração que não salvou.
 * Toda recusa aqui aparece escrita, com o motivo, e nunca só como um botão que
 * não reage.
 */
export function Aviso({ tipo = 'informacao', children }: { tipo?: TipoDeAviso; children: ReactNode }) {
  const paleta = {
    erro: { fundo: cor.erroFundo, tinta: cor.erro },
    atencao: { fundo: cor.atencaoFundo, tinta: cor.atencao },
    ok: { fundo: cor.okFundo, tinta: cor.ok },
    informacao: { fundo: cor.informacaoFundo, tinta: cor.informacao },
  }[tipo]

  return (
    <View style={[e.aviso, { backgroundColor: paleta.fundo }]}>
      <Text style={[e.avisoTexto, { color: paleta.tinta }]}>{children}</Text>
    </View>
  )
}

/** Uma etiqueta curta de situação. */
export function Selo({ texto, tipo = 'informacao' }: { texto: string; tipo?: TipoDeAviso }) {
  const paleta = {
    erro: { fundo: cor.erroFundo, tinta: cor.erro },
    atencao: { fundo: cor.atencaoFundo, tinta: cor.atencao },
    ok: { fundo: cor.okFundo, tinta: cor.ok },
    informacao: { fundo: cor.informacaoFundo, tinta: cor.informacao },
  }[tipo]

  return (
    <View style={[e.selo, { backgroundColor: paleta.fundo }]}>
      <Text style={[e.seloTexto, { color: paleta.tinta }]}>{texto}</Text>
    </View>
  )
}

export function Carregando({ texto }: { texto?: string }) {
  return (
    <View style={e.carregando}>
      <ActivityIndicator size="large" color={cor.marca} />
      {texto ? <Text style={e.carregandoTexto}>{texto}</Text> : null}
    </View>
  )
}

/** Espaço entre blocos, sem cada tela inventar sua própria margem. */
export function Respiro({ altura = espaco.g }: { altura?: number }) {
  return <View style={{ height: altura }} />
}

const e = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cor.fundo },
  telaConteudo: { padding: espaco.g, paddingBottom: espaco.ggg * 2 },

  cartao: {
    backgroundColor: cor.superficie,
    borderRadius: raio.g,
    borderWidth: 1,
    borderColor: cor.borda,
    padding: espaco.g,
    marginBottom: espaco.m,
  },
  cartaoTocado: { backgroundColor: '#FAFBFC' },

  titulo: { fontSize: fonte.titulo, fontWeight: '700', color: cor.tinta },
  subtitulo: { fontSize: fonte.corpo, color: cor.tintaMedia, marginTop: espaco.xs },
  corpo: { fontSize: fonte.corpo, color: cor.tinta, lineHeight: 21 },
  corpoForte: { fontWeight: '600' },
  legenda: { fontSize: fonte.legenda, color: cor.tintaFraca },

  botao: {
    minHeight: ALVO_MINIMO,
    borderRadius: raio.m,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: espaco.g,
  },
  botaoPrincipal: { backgroundColor: cor.marca },
  botaoTravado: { backgroundColor: cor.desabilitado },
  botaoSecundario: { backgroundColor: cor.superficie, borderWidth: 1.5, borderColor: cor.marca },
  botaoSecundarioTravado: { borderColor: cor.desabilitado },
  botaoTexto: { minHeight: ALVO_MINIMO - 10, alignItems: 'center', justifyContent: 'center' },
  botaoTocado: { opacity: 0.85 },
  botaoRotulo: { fontSize: fonte.destaque, fontWeight: '600' },

  campo: { marginBottom: espaco.g },
  campoRotulo: { fontSize: fonte.legenda, fontWeight: '600', color: cor.tintaMedia, marginBottom: espaco.xs },
  campoEntrada: {
    minHeight: ALVO_MINIMO,
    backgroundColor: cor.superficie,
    borderWidth: 1.5,
    borderColor: cor.borda,
    borderRadius: raio.m,
    paddingHorizontal: espaco.m,
    fontSize: fonte.destaque,
    color: cor.tinta,
  },
  campoEntradaComErro: { borderColor: cor.erro },
  campoAjuda: { fontSize: fonte.legenda, color: cor.tintaFraca, marginTop: espaco.xs },
  campoErro: { fontSize: fonte.legenda, color: cor.erro, marginTop: espaco.xs, fontWeight: '600' },

  escolha: { flexDirection: 'row', flexWrap: 'wrap', gap: espaco.s },
  escolhaItem: {
    minHeight: ALVO_MINIMO - 8,
    minWidth: ALVO_MINIMO,
    paddingHorizontal: espaco.g,
    borderRadius: raio.m,
    borderWidth: 1.5,
    borderColor: cor.borda,
    backgroundColor: cor.superficie,
    alignItems: 'center',
    justifyContent: 'center',
  },
  escolhaItemMarcado: { borderColor: cor.marca, backgroundColor: cor.marca },
  escolhaRotulo: { fontSize: fonte.destaque, fontWeight: '600', color: cor.tinta },
  escolhaRotuloMarcado: { color: cor.sobreEscuro },

  aviso: { borderRadius: raio.m, padding: espaco.m, marginBottom: espaco.m },
  avisoTexto: { fontSize: fonte.corpo, lineHeight: 21, fontWeight: '500' },

  selo: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: espaco.m, paddingVertical: espaco.xs },
  seloTexto: { fontSize: fonte.legenda, fontWeight: '700' },

  carregando: { paddingVertical: espaco.ggg, alignItems: 'center', gap: espaco.m },
  carregandoTexto: { fontSize: fonte.corpo, color: cor.tintaMedia },
})
