// Buscar dados do servidor sem cada tela reinventar os três estados.
//
// Toda tela que busca algo tem os mesmos três desfechos: esperando, deu certo,
// não deu. O terceiro é o que costuma ser esquecido — e uma tela que esquece o
// erro fica girando para sempre num evento sem sinal, sem dizer nada e sem
// oferecer "tentar de novo".

import { useCallback, useEffect, useState, type DependencyList } from 'react'

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

export function usePedido<T>(
  buscar: () => Promise<T>,
  deps: DependencyList = [],
): { pedido: Pedido<T>; recarregar: () => void } {
  const [pedido, setPedido] = useState<Pedido<T>>({ estado: 'carregando' })
  const [tentativa, setTentativa] = useState(0)

  const recarregar = useCallback(() => setTentativa(t => t + 1), [])

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

  return { pedido, recarregar }
}
