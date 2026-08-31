// As peças que as telas montam — as mesmas do Credenciei que está no ar.
//
// Cada componente aqui é a tradução para React Native de uma classe do
// `globals.css` de produção: `.btn-primario`, `.input`, `.indicador`, `.selo`.
// Os valores foram copiados, não recriados de memória — ver `tema.ts`.
//
// Três regras herdadas de lá, que valem para tudo neste arquivo:
//
//   a separação vem da BORDA     um fio de 1px, não uma sombra. A sombra
//                                existe, mas é quase imperceptível;
//   cor é exceção                a interface é de neutros. Roxo marca a AÇÃO
//                                principal, e é por isso que ela é achada;
//   toque afunda                 `scale(0.98)`, o mesmo `.btn-press` do site.
//
// A única medida em que o app se afasta do site é a ALTURA DO ALVO: lá os
// controles têm 34–38px, medida de mouse. Aqui têm 52, porque quem toca está
// em pé, no portão, com pressa.

import { forwardRef, useRef, type ReactNode } from 'react'
import {
  ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput,
  View, type StyleProp, type TextInputProps, type ViewStyle,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import {
  ALVO_MINIMO, cor, espaco, gradiente, raio, sombra, texto, tipo, uso,
  type TomDeIndicador,
} from './tema'

/** A web dá também o estado de "mouse em cima"; o celular, só o de toque. */
type EstadoDeToque = { pressed: boolean; hovered?: boolean }

// ─── Estrutura ──────────────────────────────────────────────────────────────

/** O corpo de uma tela: rola, respira nas bordas e sobra espaço no fim. */
export function Tela({
  children, estilo,
}: { children: ReactNode; estilo?: StyleProp<ViewStyle> }) {
  return (
    <ScrollView
      style={e.tela}
      contentContainerStyle={[e.telaConteudo, estilo]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  )
}

/**
 * Um bloco de conteúdo.
 *
 * Branco, fio de 1px, canto de 12. A sombra é quase invisível de propósito: no
 * sistema web quem separa as superfícies é a borda, e sombra forte por cima de
 * borda deixa o canto sujo.
 */
export function Cartao({
  children, onPress, semPadding,
}: { children: ReactNode; onPress?: () => void; semPadding?: boolean }) {
  const base = [e.cartao, semPadding && e.cartaoSemPadding]
  if (!onPress) return <View style={base}>{children}</View>

  return (
    <Pressable
      onPress={onPress}
      style={estado => {
        const { pressed, hovered } = estado as EstadoDeToque
        return [...base, hovered && e.cartaoSobre, pressed && e.afunda]
      }}
    >
      {children}
    </Pressable>
  )
}

export function Respiro({ altura = espaco.g }: { altura?: number }) {
  return <View style={{ height: altura }} />
}

export function Separador() {
  return <View style={e.separador} />
}

// ─── Texto ──────────────────────────────────────────────────────────────────

export function TituloDaTela({ children }: { children: ReactNode }) {
  return <Text style={e.tituloTela}>{children}</Text>
}

export function TituloDeCartao({ children }: { children: ReactNode }) {
  return <Text style={e.tituloCartao}>{children}</Text>
}

export function Corpo({ children, forte }: { children: ReactNode; forte?: boolean }) {
  return <Text style={forte ? e.corpoForte : e.corpo}>{children}</Text>
}

export function Legenda({ children }: { children: ReactNode }) {
  return <Text style={e.legenda}>{children}</Text>
}

/** Etiqueta de seção: pequena, maiúscula, espaçada. Igual à do menu do site. */
export function Etiqueta({ children }: { children: ReactNode }) {
  return <Text style={e.etiqueta}>{String(children).toUpperCase()}</Text>
}

/** Recado de rodapé: presente, sem competir com o conteúdo. */
export function Nota({ children }: { children: ReactNode }) {
  return <Text style={e.nota}>{children}</Text>
}

// ─── Indicador (KPI) ────────────────────────────────────────────────────────

/**
 * O cartão de número do painel.
 *
 * Degradê de 135°, brilho no canto, ícone em vidro. A cor vem do SIGNIFICADO
 * do número — o que precisa de atenção é laranja, o que está bem é verde, o que
 * só conta coisa é azul — nunca da posição na fileira.
 *
 * Os tons são escuros porque foram escolhidos pelo contraste: laranja-600 com
 * rótulo branco de 12px dá 3.5:1 e some no sol do evento, que é exatamente
 * onde esta tela é usada. O #c2410c daqui dá 4.6:1.
 */
export function Indicador({
  rotulo, valor, sub, tom = 'neutro', icone,
}: {
  rotulo: string
  valor: string | number
  sub?: string
  tom?: TomDeIndicador
  icone?: ReactNode
}) {
  const [de, ate] = gradiente[tom]

  return (
    <LinearGradient
      colors={[de, ate]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={e.indicador}
    >
      {/* O brilho do canto: tira o ar de retângulo chapado sem virar reflexo. */}
      <View style={e.indicadorBrilho} pointerEvents="none" />

      <View style={e.indicadorLinha}>
        <View style={e.indicadorTexto}>
          <Text style={e.indicadorRotulo} numberOfLines={1}>{rotulo}</Text>
          <Text style={e.indicadorValor}>{valor}</Text>
          {sub ? <Text style={e.indicadorSub}>{sub}</Text> : null}
        </View>
        {icone ? <View style={e.indicadorIcone}>{icone}</View> : null}
      </View>
    </LinearGradient>
  )
}

// ─── Ação ───────────────────────────────────────────────────────────────────

export type BotaoProps = {
  titulo: string
  onPress: () => void
  /**
   * `primario` roxo é a ação da tela — uma por tela, senão nenhuma é achada.
   * `acento` é roxo vazado: apoio que ainda é do sistema, sem brigar com o
   * primário. `fantasma` é o caminho alternativo, discreto.
   */
  tipo?: 'primario' | 'secundario' | 'acento' | 'fantasma' | 'perigo'
  ocupado?: boolean
  desabilitado?: boolean
}

/**
 * O botão.
 *
 * Enquanto `ocupado`, ele TRAVA. Não é enfeite: sem isso, quem não vê reação em
 * dois segundos toca de novo — e num botão de bater ponto, dois toques viram
 * dois envios. A fila trata a duplicata, mas a tela não devia ter criado o
 * problema.
 */
export function Botao({
  titulo, onPress, tipo: variante = 'primario', ocupado, desabilitado,
}: BotaoProps) {
  const travado = !!(ocupado || desabilitado)

  const corDoTexto = {
    primario: cor.sobreEscuro,
    secundario: cor.neutro700,
    acento: cor.acento500,
    fantasma: cor.neutro600,
    perigo: cor.sobreEscuro,
  }[variante]

  return (
    <Pressable
      onPress={onPress}
      disabled={travado}
      accessibilityRole="button"
      accessibilityState={{ disabled: travado, busy: !!ocupado }}
      style={estado => {
        const { pressed, hovered } = estado as EstadoDeToque
        return [
          e.botao,
          e[`botao_${variante}`],
          !travado && hovered && e[`botaoSobre_${variante}`],
          !travado && pressed && e.afunda,
          travado && e.botaoTravado,
        ]
      }}
    >
      {ocupado
        ? <ActivityIndicator color={corDoTexto} size="small" />
        : <Text style={[e.botaoRotulo, { color: corDoTexto }]}>{titulo}</Text>}
    </Pressable>
  )
}

// ─── Entrada de dados ───────────────────────────────────────────────────────

export type CampoProps = TextInputProps & {
  rotulo?: string
  /** Dica curta embaixo. Some quando há erro — dois textos competindo confundem. */
  ajuda?: string
  erro?: string
  /**
   * Para a tela de entrar, que é escura.
   *
   * La o campo e claro sobre o fundo quase-preto e a borda some — a mesma
   * receita do `bg-slate-50 border-transparent` do sistema web. Campo branco
   * com fio cinza sobre fundo escuro fica com a moldura brigando.
   */
  escuro?: boolean
}

export const Campo = forwardRef<TextInput, CampoProps>(function Campo(
  { rotulo, ajuda, erro, escuro, style, ...resto }, ref,
) {
  return (
    <View style={e.campo}>
      {rotulo ? <Text style={[e.campoRotulo, escuro && e.campoRotuloEscuro]}>{rotulo}</Text> : null}
      <TextInput
        ref={ref}
        style={[e.campoEntrada, escuro && e.campoEntradaEscuro, !!erro && e.campoComErro, style]}
        placeholderTextColor={cor.neutro400}
        {...resto}
      />
      {erro
        ? <Text style={e.campoErro}>{erro}</Text>
        : ajuda ? <Text style={e.campoAjuda}>{ajuda}</Text> : null}
    </View>
  )
})

/**
 * O código de seis dígitos, em seis caixas.
 *
 * Um campo largo com "000000" dentro é campo de site. Seis caixas dizem quantos
 * dígitos faltam sem ninguém precisar contar, e a que está esperando fica
 * marcada. O campo de texto real está invisível por cima: é ele que recebe o
 * teclado, a colagem e o preenchimento automático do código.
 */
export function CodigoSegmentado({
  valor, aoMudar, casas = 6, autoFoco,
}: {
  valor: string
  aoMudar: (v: string) => void
  casas?: number
  autoFoco?: boolean
}) {
  const entrada = useRef<TextInput>(null)
  const digitos = valor.split('')

  return (
    <Pressable onPress={() => entrada.current?.focus()} style={e.codigoFora}>
      {Array.from({ length: casas }).map((_, i) => (
        <View
          key={i}
          style={[
            e.codigoCasa,
            i < digitos.length && e.codigoCasaCheia,
            i === digitos.length && e.codigoCasaEsperando,
          ]}
        >
          <Text style={e.codigoDigito}>{digitos[i] ?? ''}</Text>
        </View>
      ))}

      <TextInput
        ref={entrada}
        value={valor}
        onChangeText={t => aoMudar(t.replace(/\D/g, '').slice(0, casas))}
        keyboardType="number-pad"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        autoFocus={autoFoco}
        maxLength={casas}
        caretHidden
        style={e.codigoInvisivel}
        accessibilityLabel={`Código de ${casas} dígitos`}
      />
    </Pressable>
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
            style={estado => {
              const { pressed, hovered } = estado as EstadoDeToque
              return [
                e.escolhaItem,
                marcada && e.escolhaItemMarcado,
                !marcada && hovered && e.escolhaItemSobre,
                pressed && e.afunda,
              ]
            }}
          >
            <Text style={[e.escolhaRotulo, marcada && e.escolhaRotuloMarcado]}>{o}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

// ─── Recados ────────────────────────────────────────────────────────────────

export type TipoDeAviso = 'erro' | 'aviso' | 'sucesso' | 'info'

const PALETA: Record<TipoDeAviso, { fundo: string; borda: string; tinta: string }> = {
  erro: { fundo: cor.erro50, borda: cor.erro200, tinta: cor.erro700 },
  aviso: { fundo: cor.aviso50, borda: cor.aviso200, tinta: cor.aviso700 },
  sucesso: { fundo: cor.sucesso50, borda: cor.sucesso200, tinta: cor.sucesso700 },
  info: { fundo: cor.info50, borda: cor.info200, tinta: cor.info700 },
}

/**
 * Um recado para a pessoa ler.
 *
 * Fundo do tom 50, fio do tom 200, texto do tom 700 — a mesma receita dos selos
 * do sistema web. Nunca o bloco inteiro pintado de vermelho forte: num app onde
 * recusa é rotina, a tela ficaria gritando o dia todo e a pessoa pararia de ler.
 *
 * E o tipo importa mais do que parece: no sistema web, um bloqueio silencioso
 * fez alguém sair acreditando que tinha salvado uma configuração que não
 * salvou. Toda recusa aqui aparece escrita, com o motivo.
 */
export function Aviso({
  tipo: variante = 'info', children,
}: { tipo?: TipoDeAviso; children: ReactNode }) {
  const paleta = PALETA[variante]
  return (
    <View style={[e.aviso, { backgroundColor: paleta.fundo, borderColor: paleta.borda }]}>
      <Text style={[e.avisoTexto, { color: paleta.tinta }]}>{children}</Text>
    </View>
  )
}

/** Pastilha de situação: 11px, peso 600, fundo do tom 50 e texto do tom 700. */
export function Selo({
  texto: rotulo, tipo: variante = 'info',
}: { texto: string; tipo?: TipoDeAviso }) {
  const paleta = PALETA[variante]
  return (
    <View style={[e.selo, { backgroundColor: paleta.fundo }]}>
      <Text style={[e.seloTexto, { color: paleta.tinta }]}>{rotulo}</Text>
    </View>
  )
}

/** O ponto verde de "ao vivo", igual ao dos cartões de evento do painel. */
export function PontoAoVivo({ cor: tom = cor.sucesso600 }: { cor?: string }) {
  return <View style={[e.pontoAoVivo, { backgroundColor: tom }]} />
}

export function Carregando({ texto: recado }: { texto?: string }) {
  return (
    <View style={e.carregando}>
      <ActivityIndicator size="large" color={cor.acento500} />
      {recado ? <Text style={e.carregandoTexto}>{recado}</Text> : null}
    </View>
  )
}

const e = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cor.fundo },
  telaConteudo: { padding: espaco.g, paddingBottom: espaco.gggg },

  cartao: {
    backgroundColor: uso.superficie,
    borderWidth: 1,
    borderColor: uso.borda,
    borderRadius: raio.cartao,
    padding: espaco.g,
    marginBottom: espaco.m,
    ...sombra.xs,
  },
  cartaoSemPadding: { padding: 0, overflow: 'hidden' },
  cartaoSobre: { borderColor: cor.neutro300 },
  afunda: { transform: [{ scale: 0.98 }] },

  separador: { height: 1, backgroundColor: uso.borda, marginVertical: espaco.g },

  tituloTela: { ...texto.tituloTela, color: uso.tinta },
  tituloCartao: { ...texto.tituloCartao, color: uso.tinta },
  corpo: { ...texto.corpo, color: uso.tintaMedia },
  corpoForte: { ...texto.corpoForte, color: uso.tinta },
  legenda: { ...texto.xs, color: uso.tintaFraca },
  etiqueta: { ...texto.etiqueta, color: uso.tintaFraca },
  nota: { ...texto.xs, fontFamily: tipo.regular, color: uso.tintaFraca, lineHeight: 18 },

  indicador: {
    borderRadius: raio.cartao,
    paddingTop: 14,
    paddingHorizontal: espaco.g,
    paddingBottom: espaco.g,
    overflow: 'hidden',
    ...sombra.sm,
  },
  indicadorBrilho: {
    position: 'absolute',
    top: '-55%',
    right: '-25%',
    width: '75%',
    height: '160%',
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.13)',
  },
  indicadorLinha: { flexDirection: 'row', alignItems: 'flex-start', gap: espaco.m },
  indicadorTexto: { flex: 1, minWidth: 0 },
  indicadorRotulo: { ...texto.xs, color: 'rgba(255,255,255,0.85)' },
  indicadorValor: { ...texto.metrica, color: '#ffffff', marginTop: 6 },
  indicadorSub: { ...texto.xs, fontFamily: tipo.regular, color: 'rgba(255,255,255,0.7)', marginTop: 4 },
  indicadorIcone: {
    width: 32,
    height: 32,
    borderRadius: raio.campo,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
  },

  botao: {
    minHeight: ALVO_MINIMO,
    borderRadius: raio.campo,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: espaco.m,
    flexDirection: 'row',
    gap: 6,
  },
  botao_primario: { backgroundColor: cor.acento500, borderColor: cor.acento600 },
  botaoSobre_primario: { backgroundColor: cor.acento600, borderColor: cor.acento700 },
  botao_secundario: { backgroundColor: uso.superficie, borderColor: uso.borda },
  botaoSobre_secundario: { backgroundColor: cor.neutro50, borderColor: cor.neutro300 },
  botao_acento: { backgroundColor: uso.superficie, borderColor: cor.acento200 },
  botaoSobre_acento: { backgroundColor: cor.acento50, borderColor: cor.acento500 },
  botao_fantasma: { backgroundColor: 'transparent', borderColor: 'transparent', minHeight: 44 },
  botaoSobre_fantasma: { backgroundColor: cor.neutro100 },
  botao_perigo: { backgroundColor: cor.erro600, borderColor: cor.erro600 },
  botaoSobre_perigo: { backgroundColor: cor.erro700, borderColor: cor.erro700 },
  /* O site usa opacidade 0.45 no desabilitado — o mesmo aqui. */
  botaoTravado: { opacity: 0.45 },
  botaoRotulo: { ...texto.base, fontFamily: tipo.semi },

  campo: { marginBottom: espaco.g },
  campoRotulo: { ...texto.xs, fontFamily: tipo.semi, color: cor.neutro600, marginBottom: 6 },
  campoEntrada: {
    minHeight: ALVO_MINIMO,
    backgroundColor: uso.superficie,
    borderWidth: 1,
    borderColor: uso.borda,
    borderRadius: raio.campo,
    paddingHorizontal: espaco.m,
    ...texto.base,
    fontFamily: tipo.media,
    color: cor.neutro900,
  },
  campoRotuloEscuro: { color: cor.neutro300 },
  campoEntradaEscuro: {
    backgroundColor: cor.neutro50,
    borderColor: 'transparent',
    borderRadius: raio.folha,
  },
  campoComErro: { borderColor: cor.erro600 },
  campoAjuda: { ...texto.xs, fontFamily: tipo.regular, color: uso.tintaFraca, marginTop: 6 },
  campoErro: { ...texto.xs, fontFamily: tipo.semi, color: cor.erro700, marginTop: 6 },

  codigoFora: { flexDirection: 'row', gap: espaco.s, marginBottom: espaco.g },
  codigoCasa: {
    flex: 1,
    height: 58,
    borderRadius: raio.campo,
    borderWidth: 1,
    borderColor: uso.borda,
    backgroundColor: uso.superficie,
    alignItems: 'center',
    justifyContent: 'center',
  },
  codigoCasaCheia: { borderColor: cor.neutro300 },
  /* O anel roxo do `.input:focus` do site, traduzido para o que dá no celular. */
  codigoCasaEsperando: { borderColor: cor.acento500, backgroundColor: cor.acento50 },
  codigoDigito: { ...texto.metrica, fontSize: 24, color: cor.neutro900 },
  codigoInvisivel: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    opacity: 0,
    ...(({ outlineStyle: 'none' } as unknown) as object),
  },

  escolha: { flexDirection: 'row', flexWrap: 'wrap', gap: espaco.s },
  escolhaItem: {
    minHeight: ALVO_MINIMO - 6,
    minWidth: 60,
    paddingHorizontal: espaco.g,
    borderRadius: raio.campo,
    borderWidth: 1,
    borderColor: uso.borda,
    backgroundColor: uso.superficie,
    alignItems: 'center',
    justifyContent: 'center',
  },
  escolhaItemMarcado: { borderColor: cor.acento600, backgroundColor: cor.acento500 },
  escolhaItemSobre: { borderColor: cor.neutro300, backgroundColor: cor.neutro50 },
  escolhaRotulo: { ...texto.base, fontFamily: tipo.semi, color: cor.neutro700 },
  escolhaRotuloMarcado: { color: cor.sobreEscuro },

  aviso: {
    borderRadius: raio.campo,
    borderWidth: 1,
    padding: espaco.m,
    marginBottom: espaco.m,
  },
  avisoTexto: { ...texto.corpo, fontFamily: tipo.media },

  selo: {
    alignSelf: 'flex-start',
    borderRadius: raio.pilula,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  seloTexto: { ...texto.xxs, fontFamily: tipo.semi },

  pontoAoVivo: { width: 6, height: 6, borderRadius: 3 },

  carregando: { paddingVertical: espaco.gggg, alignItems: 'center', gap: espaco.m },
  carregandoTexto: { ...texto.corpo, color: uso.tintaMedia },
})
