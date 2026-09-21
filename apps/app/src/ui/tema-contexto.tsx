// Quem decide claro ou escuro, e avisa o app inteiro quando muda.
//
// ─── POR QUE UM CONTEXTO, E NÃO SÓ EXPORTAR A PALETA ATUAL ──────────────────
//
// `StyleSheet.create` roda uma vez só, na primeira vez que o módulo da tela é
// carregado — não de novo a cada render. Se `cor`/`uso` fossem só um valor
// importado, trocar o tema não mudaria uma tela já montada: ela ficaria presa
// na cor de quando abriu. Precisa de algo que dispare RE-RENDER — e é
// exatamente isso que um contexto faz.
//
// Cada tela chama `useTema()` e monta o próprio `StyleSheet` dentro do
// componente (`useMemo(() => criarEstilos(t), [t])`), para recalcular quando
// `t` muda. Ver qualquer tela já convertida para o padrão.
//
// ─── O PADRÃO É CLARO, IGUAL SEMPRE FOI ─────────────────────────────────────
//
// Decisão do Juan, 11/09/2026: diferente do site (onde o escuro "Arena" é o
// padrão e o claro é a opção), aqui o app continua abrindo CLARO — é o visual
// que já estava pronto e testado. O escuro entra como opção, guardada depois
// que a pessoa escolhe pela primeira vez.

import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  ALVO_MINIMO, corDaEtapa, corDoIndicador, espaco, eventoAoVivo, LARGURA_MAXIMA,
  PALETAS, raio, texto, tipo, type Modo,
} from './tema'

const CHAVE = 'credenciei-tema'

export type Tokens = ReturnType<typeof paletaCompleta>

function paletaCompleta(modo: Modo) {
  const p = PALETAS[modo]
  return {
    modo,
    cor: p.cor,
    uso: p.uso,
    sombra: p.sombra,
    corDoIndicador, corDaEtapa, eventoAoVivo, tipo, texto, espaco, raio,
    ALVO_MINIMO, LARGURA_MAXIMA,
  }
}

type ContextoTema = Tokens & { alternar: () => void; definir: (modo: Modo) => void }

const Contexto = createContext<ContextoTema | null>(null)

export function ProvedorDeTema({ children }: { children: React.ReactNode }) {
  // Nasce claro — só troca pra escuro se a pessoa já tinha escolhido antes
  // (chega do disco um instante depois, ver o efeito abaixo).
  const [modo, setModo] = useState<Modo>('claro')

  useEffect(() => {
    let vivo = true
    AsyncStorage.getItem(CHAVE)
      .then(guardado => {
        if (vivo && (guardado === 'claro' || guardado === 'escuro')) setModo(guardado)
      })
      .catch(() => { /* sem preferência guardada, fica no padrão do sistema */ })
    return () => { vivo = false }
  }, [])

  const definir = (novo: Modo) => {
    setModo(novo)
    AsyncStorage.setItem(CHAVE, novo).catch(() => { /* modo privado etc. */ })
  }
  const alternar = () => definir(modo === 'claro' ? 'escuro' : 'claro')

  const valor = useMemo<ContextoTema>(() => ({ ...paletaCompleta(modo), alternar, definir }), [modo])

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}

/** As cores, tipografia e espaçamento do tema ATUAL — muda quando a pessoa alterna. */
export function useTema(): ContextoTema {
  const ctx = useContext(Contexto)
  if (!ctx) throw new Error('useTema() precisa estar dentro de <ProvedorDeTema>.')
  return ctx
}

/**
 * Trava um modo para tudo que está dentro — o alternador global não passa.
 *
 * A tela de entrar é sempre escura, igual no site: quem chega ali ainda não
 * tem conta, então não faz sentido nenhuma preferência de tema valer. Sem
 * isto, os componentes compartilhados (`Botao`, `Campo`…) seguiriam o tema do
 * APARELHO ou da última escolha, e a tela ficaria clara por cima de um fundo
 * escrito à mão para ser escuro.
 */
export function TemaFixo({ modo, children }: { modo: Modo; children: React.ReactNode }) {
  const valor = useMemo<ContextoTema>(() => ({
    ...paletaCompleta(modo),
    // Nada para alternar: um modo travado não tem o que trocar.
    alternar: () => {},
    definir: () => {},
  }), [modo])

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}
