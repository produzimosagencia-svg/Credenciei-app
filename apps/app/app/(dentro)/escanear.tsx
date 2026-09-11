// Escanear QR — a tela do portão.
//
// É a cópia da `/scan` do sistema web, e o raciocínio dela veio junto:
//
//   escura            é uma tela de câmera, usada de noite no portão;
//   evento primeiro   confirmar o evento antes de começar. Escanear no evento
//                     errado grava presença em quem não está lá;
//   sem escolher nada o servidor decide sozinho se é entrada ou saída, pelo
//                     que já foi registrado. Até 11/09/2026 havia um botão
//                     Entrada/Saída aqui: o site tirou o dele em 03/09,
//                     porque esquecer de trocar na hora de liberar a equipe
//                     fazia a noite inteira sair gravada na etapa errada.
//                     Ver `inferirMomentoDoScanner`, em
//                     `packages/dominio/src/janelas.ts`;
//   leitura contínua  não precisa apertar nada entre uma pessoa e outra — a
//                     fila anda sozinha.
//
// ─── O RESULTADO QUE NÃO SOME SOZINHO ───────────────────────────────────────
//
// Todo aviso de leitura desaparece em dois segundos e meio: a fila anda, e o
// próximo já está com o celular na mão. Menos um — o crachá de outra etapa.
// Ali há uma DECISÃO a tomar com a pessoa parada na frente, e apagar a tela no
// meio dela devolveria o operador ao escuro, sem saber o que fazer com quem
// está ali.

import { useCallback, useEffect, useRef, useState } from 'react'
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { CameraView, useCameraPermissions } from 'expo-camera'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  credenciaisDeDemonstracao, type CredencialDeDemonstracao,
  type EventoEscaneavel, type ResultadoDaLeitura,
} from '@credenciei/contrato'
import { DEMONSTRACAO } from '../../src/dados/cliente'
import { mensagemDoErro } from '../../src/dados/pedido'
import { useSessao } from '../../src/sessao/contexto'
import { ConferenciaPorCpf } from '../../src/ui/conferencia-cpf'
import { Botao, Corpo } from '../../src/ui/componentes'
import { Icone } from '../../src/ui/icone'
import { cor, espaco, raio, texto, tipo } from '../../src/ui/tema'

/**
 * Quanto tempo o resultado fica na tela antes de voltar a ler.
 *
 * Dois segundos e meio: o suficiente para o operador ler o nome e conferir que
 * é a pessoa da frente, e curto o bastante para a fila não parar.
 */
const TEMPO_DO_AVISO = 2500

export default function Escanear() {
  const insets = useSafeAreaInsets()
  const { cliente } = useSessao()

  const [eventos, setEventos] = useState<EventoEscaneavel[]>([])
  const [eventoId, setEventoId] = useState('')
  const [resultado, setResultado] = useState<ResultadoDaLeitura | null>(null)
  const [conferindo, setConferindo] = useState(false)
  const [erroDeCarga, setErroDeCarga] = useState<string | null>(null)

  /*
   * A trava de leitura vive numa referência, e não no estado.
   *
   * A câmera dispara `onBarcodeScanned` dezenas de vezes por segundo enquanto o
   * código está no enquadramento. Com estado, cada disparo veria o valor do
   * render anterior e mandaria a mesma leitura várias vezes ao servidor.
   */
  const lendo = useRef(false)
  const eventoRef = useRef(eventoId)
  eventoRef.current = eventoId

  useEffect(() => {
    let vivo = true
    cliente.eventosParaEscanear()
      .then(lista => {
        if (!vivo) return
        setEventos(lista)
        setEventoId(atual => atual || lista[0]?.eventoId || '')
      })
      .catch(e => { if (vivo) setErroDeCarga(mensagemDoErro(e)) })
    return () => { vivo = false }
  }, [cliente])

  const retomar = useCallback(() => {
    setConferindo(false)
    setResultado(null)
    lendo.current = false
  }, [])

  const processar = useCallback(async (codigo: string) => {
    if (lendo.current || !eventoRef.current) return
    lendo.current = true

    let r: ResultadoDaLeitura
    try {
      r = await cliente.registrarPorQr(eventoRef.current, codigo)
    } catch (e) {
      r = { situacao: 'recusado', mensagem: mensagemDoErro(e) }
    }
    setResultado(r)

    // Etapa errada fica: há uma decisão a tomar com a pessoa na frente.
    if (r.situacao === 'etapa_errada') return

    setTimeout(() => {
      setResultado(null)
      lendo.current = false
    }, TEMPO_DO_AVISO)
  }, [cliente])

  return (
    <View style={[e.fora, { paddingTop: insets.top + espaco.m }]}>
      <ScrollView contentContainerStyle={e.conteudo} keyboardShouldPersistTaps="handled">
        <SeletorDeEvento
          eventos={eventos}
          escolhido={eventoId}
          aoEscolher={setEventoId}
          erro={erroDeCarga}
        />

        <Text style={e.avisoDoMeio}>
          A etapa do <Text style={e.avisoDoMeioForte}>meio</Text> é registrada
          pelo próprio colaborador, com foto, na credencial dele.
        </Text>

        <Visor aoLer={processar} podeLer={!!eventoId && !resultado} />

        {DEMONSTRACAO ? (
          <CrachasDeDemonstracao aoEscolher={processar} desabilitado={!eventoId} />
        ) : null}
      </ScrollView>

      {resultado ? (
        <AvisoDaLeitura
          resultado={resultado}
          aoConferirCpf={() => setConferindo(true)}
          aoVoltarALer={retomar}
        />
      ) : null}

      {conferindo && resultado?.situacao === 'etapa_errada' ? (
        <ConferenciaPorCpf
          eventoId={eventoId}
          aviso={resultado.mensagem}
          aoFechar={retomar}
        />
      ) : null}
    </View>
  )
}

// ─── Evento ─────────────────────────────────────────────────────────────────

/**
 * Qual evento está sendo escaneado.
 *
 * A lista vem pronta do servidor: master vê todos os ativos, admin os da
 * própria organização, supervisor só o do próprio setor. Filtrar na tela
 * permitiria escanear no evento errado trocando um id.
 */
function SeletorDeEvento({
  eventos, escolhido, aoEscolher, erro,
}: {
  eventos: EventoEscaneavel[]
  escolhido: string
  aoEscolher: (id: string) => void
  erro: string | null
}) {
  if (erro) {
    return (
      <View style={e.bloco}>
        <Text style={e.rotulo}>Evento</Text>
        <Text style={e.erroDeCarga}>{erro}</Text>
      </View>
    )
  }

  if (eventos.length === 0) {
    return (
      <View style={e.bloco}>
        <Text style={e.rotulo}>Evento</Text>
        <Text style={e.vazio}>Nenhum evento ativo disponível</Text>
      </View>
    )
  }

  return (
    <View style={e.bloco}>
      <Text style={e.rotulo}>Evento</Text>
      {eventos.map(ev => {
        const ativo = ev.eventoId === escolhido
        return (
          <Pressable
            key={ev.eventoId}
            onPress={() => aoEscolher(ev.eventoId)}
            accessibilityRole="radio"
            accessibilityState={{ selected: ativo }}
            style={[e.opcaoDeEvento, ativo && e.opcaoDeEventoAtiva]}
          >
            <View style={[e.marcador, ativo && e.marcadorAtivo]}>
              {ativo ? <Icone nome="Check" tamanho={12} tom="#ffffff" espessura={3} /> : null}
            </View>
            <Text style={[e.nomeDoEvento, ativo && e.nomeDoEventoAtivo]} numberOfLines={1}>
              {ev.nome}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

// ─── A câmera ───────────────────────────────────────────────────────────────

/**
 * O visor.
 *
 * Três estados, e nenhum deles pode ser um retângulo preto sem explicação:
 * pedindo permissão, permissão negada e lendo. Uma tela de câmera que não abre
 * e não diz nada faz o operador achar que o app quebrou bem na hora da fila.
 */
function Visor({
  aoLer, podeLer,
}: {
  aoLer: (codigo: string) => void
  podeLer: boolean
}) {
  const [permissao, pedirPermissao] = useCameraPermissions()

  if (!permissao) {
    return <View style={e.visor}><Text style={e.visorTexto}>Abrindo a câmera…</Text></View>
  }

  if (!permissao.granted) {
    return (
      <View style={e.visor}>
        <Icone nome="Camera" tamanho={28} tom={cor.neutro500} />
        <Text style={e.visorTexto}>
          {permissao.canAskAgain
            ? 'Precisamos da câmera para ler o QR da credencial.'
            : 'A câmera está bloqueada nos ajustes do aparelho. Libere para ler o QR.'}
        </Text>
        {permissao.canAskAgain ? (
          <View style={e.visorAcao}>
            <Botao titulo="Liberar a câmera" onPress={() => { void pedirPermissao() }} />
          </View>
        ) : null}
      </View>
    )
  }

  return (
    <View style={e.visor}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        // Enquanto há um resultado na tela, a leitura para: senão a câmera
        // dispara dezenas de vezes por segundo sobre o mesmo código.
        onBarcodeScanned={podeLer ? ({ data }) => aoLer(data) : undefined}
      />
      <View style={e.mira} pointerEvents="none">
        <View style={[e.miraQuadro, { borderColor: cor.acento500 }]} />
      </View>
      <View style={e.dica} pointerEvents="none">
        <Icone nome="ScanLine" tamanho={14} tom="rgba(255,255,255,0.7)" />
        <Text style={e.dicaTexto}>Aponte para o QR Code da credencial</Text>
      </View>
    </View>
  )
}

// ─── O aviso da leitura ─────────────────────────────────────────────────────

function AvisoDaLeitura({
  resultado, aoConferirCpf, aoVoltarALer,
}: {
  resultado: ResultadoDaLeitura
  aoConferirCpf: () => void
  aoVoltarALer: () => void
}) {
  const registrado = resultado.situacao === 'registrado'
  const duplicado = resultado.situacao === 'duplicado'
  // Saiu e voltou no mesmo dia: nem entrada normal, nem erro — o operador
  // precisa ler "turno reaberto" e entender por que o crachá que parecia
  // fechado voltou a valer.
  const reaberto = resultado.situacao === 'reaberto'
  const entrou = (registrado || duplicado) && resultado.momento === 'entrada'

  /*
   * A cor cobre a tela inteira de propósito.
   *
   * Quem opera está olhando para a fila, não para o celular. Um aviso pequeno
   * no canto passaria batido; a tela inteira mudando de cor é vista pelo canto
   * do olho, e verde-ou-vermelho já responde antes de qualquer leitura.
   */
  const fundo = reaberto
    ? cor.info600
    : !registrado && !duplicado
      ? cor.erro600
      : entrou ? cor.sucesso600 : cor.acento500

  const simbolo = reaberto ? '↺' : registrado || duplicado ? (entrou ? '✓' : '↩') : '✕'

  return (
    <View style={[e.avisoFora, { backgroundColor: fundo }]}>
      <Text style={e.avisoSimbolo}>{simbolo}</Text>
      <Text style={e.avisoMensagem}>{resultado.mensagem}</Text>

      {registrado || duplicado || reaberto ? (
        <>
          <Text style={e.avisoNome}>{resultado.pessoa.nome}</Text>
          {resultado.pessoa.funcao ? (
            <Text style={e.avisoFuncao}>{resultado.pessoa.funcao}</Text>
          ) : null}
        </>
      ) : null}

      {resultado.situacao === 'etapa_errada' ? (
        <View style={e.avisoAcoes}>
          {/*
            Os dois caminhos ficam à vista. "Pedir o CPF" é o que resolve de
            verdade — diz se a pessoa está na lista. "Voltar a ler" cobre o caso
            inocente e mais comum: ela só precisa recarregar a credencial.
          */}
          <Pressable onPress={aoConferirCpf} style={e.avisoBotaoForte}>
            <Text style={e.avisoBotaoForteTexto}>Pedir o CPF e conferir</Text>
          </Pressable>
          <Pressable onPress={aoVoltarALer} style={e.avisoBotaoFraco}>
            <Text style={e.avisoBotaoFracoTexto}>Voltar a ler QR Code</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  )
}

// ─── Demonstração ───────────────────────────────────────────────────────────

/**
 * Os crachás da equipe, para experimentar sem um segundo aparelho.
 *
 * Um deles é de propósito da etapa errada: é o caso com uma decisão a tomar, e
 * é o que mais precisa ser visto antes de acontecer no portão de verdade.
 */
function CrachasDeDemonstracao({
  aoEscolher, desabilitado,
}: { aoEscolher: (codigo: string) => void; desabilitado: boolean }) {
  const [crachas] = useState<CredencialDeDemonstracao[]>(() => credenciaisDeDemonstracao())

  return (
    <View style={e.bloco}>
      <Text style={e.rotulo}>DEMONSTRAÇÃO — TOQUE PARA SIMULAR UMA LEITURA</Text>
      {crachas.map(c => (
        <Pressable
          key={c.codigo}
          onPress={() => aoEscolher(c.codigo)}
          disabled={desabilitado}
          style={({ pressed }) => [e.cracha, pressed && e.crachaTocado, desabilitado && e.crachaTravado]}
        >
          <View style={e.crachaTexto}>
            <Text style={e.crachaNome}>{c.nome}</Text>
            <Text style={e.crachaDetalhe}>{c.setor} · {c.funcao}</Text>
          </View>
          {!c.serveHoje ? (
            <View style={e.crachaSelo}>
              <Text style={e.crachaSeloTexto}>outra etapa</Text>
            </View>
          ) : null}
        </Pressable>
      ))}
      {Platform.OS === 'web' ? (
        <Corpo>
          No navegador a câmera depende de permissão do Chrome. No celular, com
          o Expo Go, ela abre direto.
        </Corpo>
      ) : null}
    </View>
  )
}

const ESCURO = '#0d1117'

const e = StyleSheet.create({
  fora: { flex: 1, backgroundColor: ESCURO },
  conteudo: { padding: espaco.g, gap: espaco.g, paddingBottom: espaco.gggg },

  bloco: { gap: espaco.s },
  rotulo: { ...texto.etiqueta, color: cor.neutro400 },
  vazio: { ...texto.corpo, color: cor.neutro500 },
  erroDeCarga: { ...texto.corpo, color: '#fca5a5' },

  opcaoDeEvento: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaco.m,
    minHeight: 48,
    paddingHorizontal: espaco.m,
    borderRadius: raio.campo,
    borderWidth: 1,
    borderColor: '#30363d',
    backgroundColor: '#161b22',
  },
  opcaoDeEventoAtiva: { borderColor: cor.acento500 },
  marcador: {
    width: 20,
    height: 20,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: '#484f58',
    alignItems: 'center',
    justifyContent: 'center',
  },
  marcadorAtivo: { backgroundColor: cor.acento500, borderColor: cor.acento500 },
  nomeDoEvento: { ...texto.corpo, color: cor.neutro400, flex: 1 },
  nomeDoEventoAtivo: { color: '#ffffff', fontFamily: tipo.semi },

  avisoDoMeio: { ...texto.xs, fontFamily: tipo.regular, color: cor.neutro500, textAlign: 'center' },
  avisoDoMeioForte: { fontFamily: tipo.semi, color: cor.neutro400 },

  visor: {
    height: 320,
    borderRadius: raio.cartao,
    overflow: 'hidden',
    backgroundColor: '#161b22',
    alignItems: 'center',
    justifyContent: 'center',
    gap: espaco.m,
    padding: espaco.gg,
  },
  visorTexto: { ...texto.corpo, color: cor.neutro400, textAlign: 'center' },
  visorAcao: { alignSelf: 'stretch' },
  mira: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  miraQuadro: { width: 220, height: 220, borderWidth: 2, borderRadius: 20, opacity: 0.7 },
  dica: {
    position: 'absolute',
    bottom: espaco.m,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  dicaTexto: { ...texto.xs, fontFamily: tipo.regular, color: 'rgba(255,255,255,0.7)' },

  avisoFora: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    padding: espaco.ggg,
  },
  avisoSimbolo: { fontSize: 84, lineHeight: 96, color: '#ffffff' },
  avisoMensagem: {
    fontFamily: tipo.forte,
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: -0.6,
    color: '#ffffff',
    textAlign: 'center',
  },
  avisoNome: { ...texto.xl, color: '#ffffff', marginTop: espaco.g, textAlign: 'center' },
  avisoFuncao: { ...texto.base, color: 'rgba(255,255,255,0.75)', marginTop: 2 },

  avisoAcoes: { marginTop: espaco.ggg, alignSelf: 'stretch', gap: espaco.m, maxWidth: 320 },
  avisoBotaoForte: {
    minHeight: 56,
    borderRadius: raio.folha,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avisoBotaoForteTexto: { ...texto.xl, color: cor.erro700 },
  avisoBotaoFraco: {
    minHeight: 48,
    borderRadius: raio.folha,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avisoBotaoFracoTexto: { ...texto.base, fontFamily: tipo.semi, color: '#ffffff' },

  cracha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaco.m,
    minHeight: 52,
    paddingHorizontal: espaco.m,
    borderRadius: raio.campo,
    borderWidth: 1,
    borderColor: '#30363d',
    backgroundColor: '#161b22',
  },
  crachaTocado: { borderColor: cor.acento500 },
  crachaTravado: { opacity: 0.4 },
  crachaTexto: { flex: 1, minWidth: 0 },
  crachaNome: { ...texto.corpoForte, color: '#ffffff' },
  crachaDetalhe: { ...texto.xs, fontFamily: tipo.regular, color: cor.neutro500 },
  crachaSelo: {
    borderRadius: raio.selo,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: 'rgba(217,119,6,0.18)',
  },
  crachaSeloTexto: { ...texto.xxs, fontFamily: tipo.semi, color: '#fbbf24' },
})
