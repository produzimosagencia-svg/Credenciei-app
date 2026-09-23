// O botão de falar o gasto — o coração do módulo no site, trazido pra cá.
//
// Cópia de `app/gastos/GravadorDeGasto.tsx`, com as decisões de lá:
//
// ─── O FLUXO TEM QUATRO FASES, E CADA UMA MOSTRA UMA COISA SÓ ───────────────
//
//   parado       o botão grande: "toque e fale"
//   gravando     contador correndo e o botão de finalizar
//   processando  a IA ouvindo
//   conferindo   o que ela entendeu, pra pessoa confirmar ou corrigir
//
// ─── TETO DE DOIS MINUTOS ───────────────────────────────────────────────────
//
// Depois disso o resto vira ruído pra IA — e um áudio esquecido gravando no
// bolso viraria um upload enorme de nada.
//
// ─── NADA AQUI É O ÚNICO CAMINHO ────────────────────────────────────────────
//
// Microfone negado, aparelho sem gravação, IA fora do ar: todos caem num
// aviso que aponta pro formulário manual, logo abaixo na tela. O gasto PRECISA
// poder ser lançado — é dinheiro que já saiu do caixa, e perder o registro é
// pior do que digitar.
//
// ─── A IA NÃO SALVA NADA SOZINHA ────────────────────────────────────────────
//
// `transcreverAudioDeGasto` só extrai; quem grava é `criarGasto`, depois que
// a pessoa confirma. Os campos que a IA marcou como incertos
// (`precisaConfirmar`) vêm destacados, e o cartão já abre em modo de edição
// quando falta o essencial (valor ou descrição) — confirmar às cegas um valor
// que a IA chutou é como o número errado entra na prestação de contas.

import { useEffect, useMemo, useRef, useState } from 'react'
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import {
  AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder,
} from 'expo-audio'
import * as FileSystem from 'expo-file-system/legacy'
import { CATEGORIAS_GASTO, CATEGORIA_PADRAO, formatarBR } from '@credenciei/dominio'
import type { GastoExtraido } from '@credenciei/contrato'
import { mensagemDoErro } from '../dados/pedido'
import { useSessao } from '../sessao/contexto'
import { Aviso, Botao, Campo, Cartao, Escolha, Legenda, Respiro, Separador, TituloDeCartao } from './componentes'
import { emReais } from './dinheiro'
import { Icone } from './icone'
import { espaco, raio, texto, tipo } from './tema'
import { useTema, type Tokens } from './tema-contexto'

/** Depois disto o resto vira ruído pra IA. */
const TETO_SEGUNDOS = 120

const ROTULO_CAMPO: Record<string, string> = {
  valor: 'o valor',
  descricao: 'o que foi',
  fornecedor: 'o fornecedor',
  categoria: 'a categoria',
  dataGasto: 'a data',
}

type Fase = 'parado' | 'gravando' | 'processando' | 'conferindo'

export function GravadorDeGasto({
  eventoId, eventoNome, aoSalvar,
}: {
  eventoId: string
  eventoNome: string
  aoSalvar: () => void
}) {
  const { cliente } = useSessao()
  const { cor } = useTema()
  const e = useEstilos()

  const gravador = useAudioRecorder(RecordingPresets.HIGH_QUALITY)
  const [fase, setFase] = useState<Fase>('parado')
  const [segundos, setSegundos] = useState(0)
  const [erro, setErro] = useState<string | null>(null)
  const [extraido, setExtraido] = useState<GastoExtraido | null>(null)
  const relogio = useRef<ReturnType<typeof setInterval> | null>(null)

  const pararRelogio = () => {
    if (relogio.current) { clearInterval(relogio.current); relogio.current = null }
  }
  useEffect(() => pararRelogio, [])

  async function comecar() {
    setErro(null)
    try {
      const permissao = await AudioModule.requestRecordingPermissionsAsync()
      if (!permissao.granted) {
        setErro('Sem permissão do microfone. Libere nas configurações do aparelho, ou lance o gasto no formulário abaixo.')
        return
      }
      // Sem isto o iOS grava mudo quando o aparelho está no silencioso.
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true })

      await gravador.prepareToRecordAsync()
      gravador.record()
      setSegundos(0)
      setFase('gravando')
      relogio.current = setInterval(() => {
        setSegundos(s => {
          if (s + 1 >= TETO_SEGUNDOS) void finalizar()
          return s + 1
        })
      }, 1000)
    } catch (err) {
      setErro(`${mensagemDoErro(err)} Você pode lançar o gasto no formulário abaixo.`)
      setFase('parado')
    }
  }

  async function finalizar() {
    pararRelogio()
    setFase('processando')
    try {
      await gravador.stop()
      const uri = gravador.uri
      if (!uri) throw new Error('A gravação não produziu áudio.')

      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      })
      const r = await cliente.transcreverAudioDeGasto(base64, mimeDoArquivo(uri), eventoId)
      if ('erro' in r) {
        setErro(r.erro)
        setFase('parado')
        return
      }
      setExtraido(r)
      setFase('conferindo')
    } catch (err) {
      setErro(`${mensagemDoErro(err)} Você pode lançar o gasto no formulário abaixo.`)
      setFase('parado')
    }
  }

  async function cancelar() {
    pararRelogio()
    try {
      await gravador.stop()
    } catch {
      // Cancelar não pode falhar na cara de ninguém — o áudio vai ser jogado
      // fora de qualquer jeito.
    }
    setFase('parado')
  }

  return (
    <View>
      {fase === 'parado' ? (
        <Pressable
          onPress={() => { void comecar() }}
          accessibilityRole="button"
          accessibilityLabel="Registrar gasto falando"
          style={({ pressed }) => [e.botaoGrande, { backgroundColor: cor.acento500 }, pressed && e.tocado]}
        >
          <Icone nome="Mic" tamanho={34} tom={cor.sobreEscuro} />
          <Text style={e.botaoGrandeTitulo}>Falar o gasto</Text>
          <Text style={e.botaoGrandeAjuda}>Toque e diga quanto gastou, com o quê e com quem</Text>
        </Pressable>
      ) : null}

      {fase === 'gravando' ? (
        <View style={[e.botaoGrande, { backgroundColor: cor.erro600 }]}>
          <Icone nome="Mic" tamanho={28} tom={cor.sobreEscuro} />
          <Text style={e.contador}>{comoRelogio(segundos)}</Text>
          <Text style={e.botaoGrandeAjuda}>Gravando… fale naturalmente</Text>
          <Respiro altura={espaco.s} />
          <View style={e.acoesDaGravacao}>
            <View style={e.acao}>
              <Botao titulo="Finalizar" tipo="secundario" onPress={() => { void finalizar() }} />
            </View>
            <View style={e.acao}>
              <Botao titulo="Cancelar" tipo="fantasma" onPress={() => { void cancelar() }} />
            </View>
          </View>
        </View>
      ) : null}

      {fase === 'processando' ? (
        <View style={[e.botaoGrande, { backgroundColor: cor.neutro800 }]}>
          <Text style={e.botaoGrandeTitulo}>Ouvindo o que você falou…</Text>
          <Text style={e.botaoGrandeAjuda}>Transcrevendo e identificando o gasto</Text>
        </View>
      ) : null}

      {fase === 'conferindo' && extraido ? (
        <Conferencia
          extraido={extraido}
          eventoId={eventoId}
          eventoNome={eventoNome}
          aoFechar={() => { setExtraido(null); setFase('parado') }}
          aoSalvar={() => { setExtraido(null); setFase('parado'); aoSalvar() }}
        />
      ) : null}

      {erro ? (
        <>
          <Respiro altura={espaco.s} />
          <Aviso tipo="erro">{erro}</Aviso>
        </>
      ) : null}
    </View>
  )
}

/**
 * O que a IA entendeu, para a pessoa confirmar.
 *
 * Abre já em EDIÇÃO quando falta o essencial ou quando a IA marcou algum
 * campo como incerto: mostrar um resumo bonitinho de um valor chutado é o
 * caminho mais curto pro número errado entrar na prestação de contas.
 */
function Conferencia({
  extraido, eventoId, eventoNome, aoFechar, aoSalvar,
}: {
  extraido: GastoExtraido
  eventoId: string
  eventoNome: string
  aoFechar: () => void
  aoSalvar: () => void
}) {
  const { cliente } = useSessao()
  const { cor } = useTema()
  const e = useEstilos()

  const [valor, setValor] = useState(extraido.valor != null ? String(extraido.valor).replace('.', ',') : '')
  const [descricao, setDescricao] = useState(extraido.descricao ?? '')
  const [fornecedor, setFornecedor] = useState(extraido.fornecedor ?? '')
  const [categoria, setCategoria] = useState(extraido.categoria ?? CATEGORIA_PADRAO)
  const [dataGasto, setDataGasto] = useState(extraido.dataGasto ?? '')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const incerto = (campo: string) => extraido.precisaConfirmar.includes(campo)

  async function confirmar() {
    setErro(null)
    const centavos = emCentavosDoTexto(valor)
    if (centavos === null || centavos <= 0) return setErro('Escreva o valor do gasto.')
    if (!descricao.trim()) return setErro('Escreva o que foi o gasto.')

    setSalvando(true)
    try {
      const r = await cliente.criarGasto({
        eventoId,
        descricao: descricao.trim(),
        valor: centavos / 100,
        categoria,
        dataGasto: dataGasto || hojeISO(),
        fornecedor: fornecedor.trim() || null,
        formaPagamento: null,
        pagador: null,
        pago: true,
        observacao: null,
        origem: 'audio',
        // O que a IA ouviu fica gravado junto: é a prova de onde saiu o
        // número, e o que se lê quando alguém contesta o lançamento.
        transcricao: extraido.transcricao,
        comprovanteBase64: null,
      })
      if (r.erro) return setErro(r.erro)
      aoSalvar()
    } catch (err) {
      setErro(mensagemDoErro(err))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Cartao>
      <View style={e.topoDaConferencia}>
        <Icone nome="Sparkles" tamanho={16} tom={cor.acento500} />
        <View style={e.topoTexto}>
          <TituloDeCartao>Gasto identificado</TituloDeCartao>
        </View>
        <Pressable onPress={aoFechar} accessibilityRole="button" accessibilityLabel="Descartar">
          <Icone nome="X" tamanho={16} />
        </Pressable>
      </View>

      <Respiro altura={espaco.xs} />
      <Text style={e.transcricao}>“{extraido.transcricao}”</Text>
      <Separador />

      {extraido.precisaConfirmar.length > 0 ? (
        <>
          <Aviso tipo="aviso">
            Confira {extraido.precisaConfirmar.map(c => ROTULO_CAMPO[c] ?? c).join(', ')} —
            não tenho certeza do que ouvi.
          </Aviso>
          <Respiro altura={espaco.s} />
        </>
      ) : null}

      <Campo
        rotulo={incerto('valor') ? 'Valor · confirme' : 'Valor'}
        placeholder="0,00"
        keyboardType="decimal-pad"
        value={valor}
        onChangeText={setValor}
        ajuda={(() => {
          const c = emCentavosDoTexto(valor)
          return c !== null && c > 0 ? emReais(c / 100) : undefined
        })()}
      />

      <Campo
        rotulo={incerto('descricao') ? 'O que foi · confirme' : 'O que foi'}
        placeholder="Almoço da equipe"
        value={descricao}
        onChangeText={setDescricao}
      />

      <Campo
        rotulo={incerto('fornecedor') ? 'Fornecedor · confirme' : 'Fornecedor'}
        placeholder="Quem recebeu"
        value={fornecedor}
        onChangeText={setFornecedor}
      />

      <Legenda>{incerto('categoria') ? 'Categoria · confirme' : 'Categoria'}</Legenda>
      <Respiro altura={espaco.xs} />
      <Escolha opcoes={[...CATEGORIAS_GASTO]} valor={categoria} aoEscolher={setCategoria} />

      <Respiro altura={espaco.s} />
      <Campo
        rotulo={incerto('dataGasto') ? 'Data · confirme' : 'Data'}
        placeholder="AAAA-MM-DD"
        value={dataGasto}
        onChangeText={setDataGasto}
        ajuda={dataGasto ? formatarBR(`${dataGasto}T12:00:00-03:00`, 'data') : 'Vazio é hoje.'}
      />

      <Legenda>Evento: {eventoNome}</Legenda>

      {erro ? (
        <>
          <Respiro altura={espaco.s} />
          <Aviso tipo="erro">{erro}</Aviso>
        </>
      ) : null}

      <Respiro altura={espaco.s} />
      <Botao titulo="Confirmar gasto" ocupado={salvando} onPress={() => { void confirmar() }} />
      <Respiro altura={espaco.xs} />
      <Botao titulo="Descartar" tipo="fantasma" onPress={aoFechar} />
    </Cartao>
  )
}

function comoRelogio(s: number): string {
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * O mime pela extensão do arquivo que o gravador produziu.
 *
 * Cada plataforma grava num formato: `.m4a` no iOS, `.m4a`/`.3gp` no Android,
 * `.webm` no navegador. A IA precisa saber o que está recebendo, e mandar o
 * mime errado faz a transcrição voltar vazia sem dizer por quê.
 */
function mimeDoArquivo(uri: string): string {
  const ext = uri.split('?')[0]?.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'webm') return 'audio/webm'
  if (ext === 'wav') return 'audio/wav'
  if (ext === '3gp') return 'audio/3gpp'
  if (ext === 'caf') return 'audio/x-caf'
  return Platform.OS === 'web' ? 'audio/webm' : 'audio/m4a'
}

/** "12,50" ou "12.50" viram 1250 centavos; texto inválido vira `null`. */
function emCentavosDoTexto(bruto: string): number | null {
  const limpo = bruto.trim().replace(/\s/g, '').replace(',', '.')
  if (!limpo) return null
  if (!/^\d+(\.\d{1,2})?$/.test(limpo)) return null
  return Math.round(Number(limpo) * 100)
}

function criarEstilos(cor: Tokens['cor'], uso: Tokens['uso']) {
  return StyleSheet.create({
    botaoGrande: {
      borderRadius: raio.cartao,
      paddingVertical: espaco.g,
      paddingHorizontal: espaco.m,
      alignItems: 'center',
      gap: espaco.xs,
    },
    tocado: { opacity: 0.9 },
    botaoGrandeTitulo: { ...texto.corpoForte, color: cor.sobreEscuro },
    botaoGrandeAjuda: { ...texto.xs, fontFamily: tipo.regular, color: cor.sobreEscuro, opacity: 0.8, textAlign: 'center' },
    contador: { ...texto.metrica, color: cor.sobreEscuro },

    acoesDaGravacao: { flexDirection: 'row', gap: espaco.s, alignSelf: 'stretch' },
    acao: { flex: 1 },

    topoDaConferencia: { flexDirection: 'row', alignItems: 'center', gap: espaco.s },
    topoTexto: { flex: 1, minWidth: 0 },
    transcricao: { ...texto.xs, fontFamily: tipo.regular, color: uso.tintaFraca, fontStyle: 'italic' },
  })
}

function useEstilos() {
  const { cor, uso } = useTema()
  return useMemo(() => criarEstilos(cor, uso), [cor, uso])
}
