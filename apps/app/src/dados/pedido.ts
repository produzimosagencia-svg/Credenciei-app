// Buscar dados do servidor sem cada tela reinventar os três estados.
//
// Toda tela que busca algo tem os mesmos três desfechos: esperando, deu certo,
// não deu. O terceiro é o que costuma ser esquecido — e uma tela que esquece o
// erro fica girando para sempre num evento sem sinal, sem dizer nada e sem
// oferecer "tentar de novo".

import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react'

export type Pedido<T> =
  | { estado: 'carregando' }
  | { estado: 'pronto'; dados: T }
  | { estado: 'falhou'; mensagem: string }

/**
 * A mensagem que a pessoa lê quando algo falha.
 *
 * As falhas de transporte do cliente chegam como exceção com texto pronto
 * ("Sem conexão"). O resto vira uma frase genérica — mas nunca um código de
 * erro: quem está no portão não tem o que fazer com "TypeError undefined".
 */
export function mensagemDoErro(erro: unknown): string {
  if (erro instanceof Error && erro.message) return erro.message
  return 'Não conseguimos falar com o servidor. Tente de novo.'
}

/**
 * O valor, só depois que a pessoa PARA de digitar por `atrasoMs`.
 *
 * Sem isto, uma busca em `usePedido` dispara uma chamada ao servidor a cada
 * tecla — numa base de milhares de pessoas, cada letra custava uma consulta
 * inteira, e a tela virava um "carregando" piscando sem parar (achado
 * 12/09/2026, relatado como "trava toda vez que entro em Encontre um
 * colaborador"). 350ms é curto o bastante pra não parecer devagar, e comprido
 * o bastante pra cobrir a digitação normal de um nome.
 */
export function useValorComAtraso<T>(valor: T, atrasoMs = 350): T {
  const [atrasado, setAtrasado] = useState(valor)

  useEffect(() => {
    const id = setTimeout(() => setAtrasado(valor), atrasoMs)
    return () => clearTimeout(id)
  }, [valor, atrasoMs])

  return atrasado
}

export function usePedido<T>(
  buscar: () => Promise<T>,
  deps: DependencyList = [],
): { pedido: Pedido<T>; recarregar: () => void; atualizarSemPiscar: () => void } {
  const [pedido, setPedido] = useState<Pedido<T>>({ estado: 'carregando' })
  const [tentativa, setTentativa] = useState(0)
  const buscarAtual = useRef(buscar)
  buscarAtual.current = buscar

  const recarregar = useCallback(() => setTentativa(t => t + 1), [])

  /**
   * Atualiza sem passar por "carregando" — para chamadas em segundo plano
   * (o app voltou ao primeiro plano, um intervalo) que não podem fazer a
   * tela inteira sumir e piscar de novo por um instante. Erro aqui é
   * silencioso: os dados antigos na tela continuam válidos, e a próxima
   * tentativa resolve sozinha. Identidade estável (sem depender de `deps`)
   * de propósito, para dar pra usar dentro de um listener/intervalo que se
   * inscreve uma vez só.
   */
  const atualizarSemPiscar = useCallback(() => {
    buscarAtual.current().then(dados => setPedido({ estado: 'pronto', dados })).catch(() => {})
  }, [])

  useEffect(() => {
    let vivo = true
    setPedido({ estado: 'carregando' })

    buscar()
      .then(dados => { if (vivo) setPedido({ estado: 'pronto', dados }) })
      .catch(erro => { if (vivo) setPedido({ estado: 'falhou', mensagem: mensagemDoErro(erro) }) })

    // A resposta que chega depois de a tela sair não pode mexer no estado dela.
    return () => { vivo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tentativa])

  return { pedido, recarregar, atualizarSemPiscar }
}
