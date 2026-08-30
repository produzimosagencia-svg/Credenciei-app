// A sessão e o cliente, disponíveis para qualquer tela.
//
// A regra de quando renovar, quando desistir e quando NÃO desistir está em
// `guarda.ts`, sem React e com teste. Aqui é só a ponte: ler uma vez na
// abertura, avisar as telas quando a sessão cai e entregar o cliente pronto.

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type ReactNode,
} from 'react'
import { View, StyleSheet } from 'react-native'
import type { ClienteApi, Sessao } from '@credenciei/contrato'
import { cofreDoAparelho } from '../dados/cofre'
import { criarCliente } from '../dados/cliente'
import { Carregando } from '../ui/componentes'
import { cor } from '../ui/tema'
import { GuardaDaSessao } from './guarda'

type ValorDaSessao = {
  /** Quem está logado. `null` manda para a tela de entrar. */
  sessao: Sessao | null
  /** Com quem falar. Hoje o servidor falso; amanhã a API. */
  cliente: ClienteApi
  /**
   * A sessão existe, mas venceu e não deu para renovar por falta de rede.
   *
   * A pessoa CONTINUA dentro do app — só não consegue buscar coisa nova. É
   * diferente de estar deslogada, e a tela precisa dizer isso, senão parece
   * que o app quebrou.
   */
  semRede: boolean
  entrar(sessao: Sessao): Promise<void>
  sair(): Promise<void>
}

const Contexto = createContext<ValorDaSessao | null>(null)

export function useSessao(): ValorDaSessao {
  const v = useContext(Contexto)
  if (!v) throw new Error('useSessao só funciona dentro do ProvedorDeSessao.')
  return v
}

export function ProvedorDeSessao({ children }: { children: ReactNode }) {
  const [sessao, setSessao] = useState<Sessao | null>(null)
  const [cliente, setCliente] = useState<ClienteApi | null>(null)
  const [semRede, setSemRede] = useState(false)

  /*
   * O cliente e a guarda dependem um do outro: a guarda renova chamando o
   * cliente, e o cliente só pode ser criado depois de saber qual sessão estava
   * guardada. A referência quebra o nó — a guarda só chama `renovar` depois de
   * `carregar()`, que é justamente quando o cliente já existe.
   */
  const clienteRef = useRef<ClienteApi | null>(null)
  const guarda = useMemo(
    () => new GuardaDaSessao({
      cofre: cofreDoAparelho,
      renovar: async (r) => clienteRef.current
        ? clienteRef.current.renovar(r)
        : { erro: 'Aplicativo ainda abrindo.' },
    }),
    [],
  )

  useEffect(() => {
    let vivo = true
    const desassinar = guarda.assinar(s => { if (vivo) setSessao(s) })

    void (async () => {
      const guardada = await guarda.carregar()
      const novo = criarCliente({ sessao: guardada ?? undefined })
      clienteRef.current = novo

      if (guardada) {
        // Uma renovação na abertura, se estiver na hora. É aqui que uma sessão
        // revogada some — e que uma abertura sem sinal é reconhecida como
        // "sem rede", em vez de virar logout.
        const c = await guarda.credencial()
        if (vivo && !c.ok) setSemRede(c.motivo === 'sem-rede')
      }

      if (vivo) setCliente(novo)
    })()

    return () => { vivo = false; desassinar() }
  }, [guarda])

  const entrar = useCallback(async (nova: Sessao) => {
    await guarda.abrir(nova)
    setSemRede(false)
  }, [guarda])

  const sair = useCallback(async () => {
    await guarda.sair()
    // Cliente novo: o antigo carrega a sessão da pessoa anterior na memória, e
    // reaproveitá-lo deixaria o próximo login vendo dados que não são dele.
    const limpo = criarCliente()
    clienteRef.current = limpo
    setCliente(limpo)
    setSemRede(false)
  }, [guarda])

  const valor = useMemo<ValorDaSessao | null>(
    () => cliente ? { sessao, cliente, semRede, entrar, sair } : null,
    [cliente, sessao, semRede, entrar, sair],
  )

  // Enquanto o cofre não respondeu, não dá para saber se a pessoa está logada.
  // Mostrar a tela de entrar aqui faria ela piscar em toda abertura de app.
  if (!valor) {
    return (
      <View style={e.abertura}>
        <Carregando />
      </View>
    )
  }

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}

const e = StyleSheet.create({
  abertura: { flex: 1, backgroundColor: cor.fundo, justifyContent: 'center' },
})
