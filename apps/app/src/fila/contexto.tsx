// A fila de batidas, viva dentro do app.
//
// ─── POR QUE ELA VIVE AQUI EM CIMA, E NÃO NA TELA ───────────────────────────
//
// Porque a batida não pode depender de a tela estar aberta. A pessoa registra o
// meio, guarda o celular no bolso e vai trabalhar; a rede volta vinte minutos
// depois, com o app em outra tela ou em segundo plano. Se a fila morresse junto
// com a tela da credencial, a batida ficaria parada até alguém voltar lá.
//
// Daí as três coisas que este provedor faz:
//
//   carrega    o que ficou do uso anterior, na abertura do app;
//   tenta      quando a tela volta ao primeiro plano, e de tempos em tempos;
//   avisa      quem estiver olhando, para a tela mostrar o que está pendente.

import {
  createContext, useContext, useEffect, useMemo, useRef, useState,
  type ReactNode,
} from 'react'
import { AppState } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { FilaDeBatidas, type Armazem, type BatidaPendente, type TipoBatida } from '@credenciei/offline'
import { useSessao } from '../sessao/contexto'
import { transporteDe } from './transporte'

/**
 * De quanto em quanto tempo a fila tenta sozinha.
 *
 * Meio minuto. A fila já tem recuo progressivo por batida — este relógio só
 * garante que ALGUÉM chame `sincronizar`, mesmo com o app parado numa tela que
 * não faz nada. Sem ele, uma batida com recuo de cinco minutos esperaria a
 * pessoa tocar em alguma coisa para subir.
 */
const INTERVALO_MS = 30_000

const CHAVE = 'credenciei.fila-de-batidas'

/** A fila guarda no mesmo armazenamento do resto do app. */
const armazemDoAparelho: Armazem = {
  async ler() {
    try {
      return await AsyncStorage.getItem(CHAVE)
    } catch {
      // Leitura falha vira "fila vazia", nunca app quebrado. A fila já sabe
      // lidar com conteúdo corrompido — ver `packages/offline`.
      return null
    }
  },
  async gravar(conteudo) {
    await AsyncStorage.setItem(CHAVE, conteudo)
  },
}

type ValorDaFila = {
  /** Tudo que a fila conhece: pendente, enviando, enviada e recusada. */
  itens: BatidaPendente[]
  /** Registra uma batida e já tenta enviar. Devolve o id gerado no aparelho. */
  bater(dados: {
    participacaoId: string
    tipo: TipoBatida
    foto?: string
    lat?: number
    lng?: number
  }): Promise<BatidaPendente>
  /** Tira uma recusada da lista, depois de a pessoa ler o motivo. */
  descartar(id: string): Promise<void>
  sincronizar(): Promise<void>
}

const Contexto = createContext<ValorDaFila | null>(null)

export function useFila(): ValorDaFila {
  const v = useContext(Contexto)
  if (!v) throw new Error('useFila só funciona dentro do ProvedorDaFila.')
  return v
}

export function ProvedorDaFila({ children }: { children: ReactNode }) {
  const { cliente } = useSessao()
  const [itens, setItens] = useState<BatidaPendente[]>([])

  /*
   * O cliente muda quando a pessoa sai e entra de novo. A fila NÃO é recriada
   * junto: ela guarda batidas que ainda não subiram, e jogá-las fora numa troca
   * de sessão apagaria trabalho de alguém. Por isso o transporte lê o cliente
   * atual por referência.
   */
  const clienteRef = useRef(cliente)
  clienteRef.current = cliente

  const fila = useMemo(
    () => new FilaDeBatidas({
      armazem: armazemDoAparelho,
      transporte: batida => transporteDe(clienteRef.current)(batida),
    }),
    [],
  )

  useEffect(() => {
    let vivo = true
    const parar = fila.observar(lista => { if (vivo) setItens(lista) })

    void (async () => {
      await fila.carregar()
      await fila.sincronizar()
    })()

    // Quando o app volta do bolso: é o momento em que a rede costuma ter
    // voltado, e é o mais barato de aproveitar.
    const assinatura = AppState.addEventListener('change', estado => {
      if (estado === 'active') void fila.sincronizar()
    })

    const relogio = setInterval(() => { void fila.sincronizar() }, INTERVALO_MS)

    return () => {
      vivo = false
      parar()
      assinatura.remove()
      clearInterval(relogio)
    }
  }, [fila])

  const valor = useMemo<ValorDaFila>(() => ({
    itens,
    async bater(dados) {
      const batida = await fila.registrar(dados)
      // Tenta na hora: com rede, a confirmação chega antes de a pessoa guardar
      // o celular — e ver "registrado" é o que a faz confiar no app.
      void fila.sincronizar()
      return batida
    },
    async descartar(id) { await fila.descartar(id) },
    async sincronizar() { await fila.sincronizar() },
  }), [fila, itens])

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}
