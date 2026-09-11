// A aba "Funções ligadas" — o catálogo de capacidades que o site liga e
// desliga por acesso, na criação ou edição.
//
// Copiado de `c:\Dev\credenciei\lib\permissions.ts` (`CAPACIDADES` e
// `capacidadesDoPapel`), com uma diferença deliberada: aqui só entram
// capacidades que JÁ existem como tela no app (Escanear QR, Acompanhar,
// Veículos). Incluir uma entrada que não trava nada em lugar nenhum seria um
// toggle mentiroso — o catálogo cresce junto com as telas, não antes delas.
//
// ─── O QUE ESTE ARQUIVO NÃO FAZ (AINDA) ─────────────────────────────────────
//
// Grava o override (`Acesso.permissoesUsuario`), mas nenhuma tela do app lê
// esse override na hora de montar o menu ou travar uma rota — os `podeX` de
// `permissoes.ts` continuam recebendo só o papel. No site, cada `podeX` é
// embrulhado por `capacidade(chave, padrao)` e resolve em três camadas
// (usuário → organização → padrão do código); aqui só a terceira roda. Ligar
// as outras duas — e a tela de Configurações que edita a segunda — fica para
// outra sessão.

import { podeAcompanhar, podeEscanear, podeGerenciarVeiculos, type Papel } from './permissoes.js'

export type Capacidade = {
  chave: string
  nome: string
  descricao: string
  padrao: (papel?: string) => boolean
}

export const CAPACIDADES: Capacidade[] = [
  {
    chave: 'escanear',
    nome: 'Escanear QR',
    descricao: 'Lê a credencial no portão e registra entrada e saída',
    padrao: podeEscanear,
  },
  {
    chave: 'acompanhar',
    nome: 'Acompanhar a operação',
    descricao: 'Atividades, pendências, histórico e registro de ponto assistido',
    padrao: podeAcompanhar,
  },
  {
    chave: 'gerenciar_veiculos',
    nome: 'Cadastrar veículos',
    descricao: 'Autoriza a entrada de caminhão, van ou carro no evento',
    padrao: podeGerenciarVeiculos,
  },
]

/**
 * Capacidades que um papel NÃO tem por padrão mas pode GANHAR na criação —
 * conservador de propósito, cresce sob demanda. Hoje só o supervisor: o
 * scanner saiu dele por padrão (ver `podeEscanear`), mas há operação em que
 * ele credencia a própria equipe — liberável caso a caso.
 */
const PODEM_GANHAR: Partial<Record<Papel, string[]>> = {
  supervisor: ['escanear'],
}

export type CapacidadeDoPapel = Capacidade & { padraoAtual: boolean }

/**
 * As capacidades que a aba "Funções" oferece pra um papel, cada uma com o
 * valor que ela tem HOJE (`padraoAtual`) — pro toggle já nascer certo.
 *
 * master fica de fora (nunca é afetado — mesma régua do site). Só entram
 * capacidades que o papel tem por padrão (desligáveis) ou que estão em
 * `PODEM_GANHAR` (ligáveis).
 */
export function capacidadesDoPapel(papel: string): CapacidadeDoPapel[] {
  if (papel === 'master') return []
  const extras = PODEM_GANHAR[papel as Papel] ?? []
  return CAPACIDADES
    .filter(c => c.padrao(papel) || extras.includes(c.chave))
    .map(c => ({ ...c, padraoAtual: c.padrao(papel) }))
}
