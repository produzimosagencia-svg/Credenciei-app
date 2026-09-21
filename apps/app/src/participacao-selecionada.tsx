// Qual das MINHAS participações estou olhando agora.
//
// Só existe porque um colaborador pode estar em dois eventos ao mesmo
// tempo (o navio de manhã, a lagoa à noite) — sem isto, a credencial, "Meus
// dias" e "Meu pagamento" sempre escolhiam sozinhos (o evento em andamento,
// ou o primeiro) e não havia jeito de ver o OUTRO evento.
//
// Tocar num cartão em "Meus eventos" grava a escolha aqui e some quando o
// app reabre — é seleção de sessão, não preferência permanente. Sem nada
// escolhido, as três telas continuam escolhendo sozinhas, do jeito de
// sempre.

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'

type Valor = {
  participacaoId: string | null
  selecionar: (participacaoId: string | null) => void
}

const Contexto = createContext<Valor | null>(null)

export function ProvedorDeParticipacaoSelecionada({ children }: { children: ReactNode }) {
  const [participacaoId, selecionar] = useState<string | null>(null)
  const valor = useMemo(() => ({ participacaoId, selecionar }), [participacaoId])
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}

export function useParticipacaoSelecionada(): Valor {
  const v = useContext(Contexto)
  if (!v) throw new Error('useParticipacaoSelecionada usado fora do ProvedorDeParticipacaoSelecionada')
  return v
}

/**
 * A participação a mostrar: a escolhida explicitamente, se ainda existir
 * na lista; senão a mesma regra de sempre (em andamento, ou a primeira).
 */
export function escolherParticipacao<T extends { participacaoId: string; emAndamento?: boolean }>(
  participacoes: T[],
  selecionadaId: string | null,
): T | undefined {
  const escolhida = selecionadaId ? participacoes.find(p => p.participacaoId === selecionadaId) : undefined
  return escolhida ?? participacoes.find(p => p.emAndamento) ?? participacoes[0]
}
