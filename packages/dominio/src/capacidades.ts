// A aba "Funções ligadas" — o catálogo de capacidades que o site liga e
// desliga por acesso, na criação ou edição.
//
// Copiado de `c:\Dev\credenciei\lib\permissions.ts` (`CAPACIDADES` e
// `capacidadesDoPapel`), com uma diferença deliberada: aqui só entram
// capacidades que JÁ existem como tela no app (Escanear QR, Acompanhar,
// Veículos). Incluir uma entrada que não trava nada em lugar nenhum seria um
// toggle mentiroso — o catálogo cresce junto com as telas, não antes delas.
//
// ─── AS TRÊS CAMADAS, DESDE 13/09/2026 ──────────────────────────────────────
//
// `podeEscanear`/`podeAcompanhar`/`podeGerenciarVeiculos` (em `permissoes.ts`)
// resolvem em três camadas — usuário → organização → padrão do código — a
// mesma régua do site (`capacidade(chave, padrao)`). O override de usuário
// (`Acesso.permissoesUsuario`) é gravado na criação e na edição do acesso; o
// de organização mora na tabela `permissoes_organizacao` e é editado na tela
// de Configurações (`apps/app/app/(dentro)/configuracoes.tsx`, master-only).
//
// `capacidadesDoPapel`, abaixo, continua recebendo só o PAPEL — mesma
// simplificação do site (`NovoUsuarioForm.tsx`/`UsuarioActions.tsx` chamam
// `capacidadesDoPapel(role)`, nunca com o acesso inteiro): o "como é hoje" da
// aba de criar/editar acesso é sempre o padrão do código, nunca considera
// exceção de organização.

import { podeAcompanhar, podeEscanear, podeGerenciarVeiculos, type Papel } from './permissoes.js'

/**
 * Os papéis que a tela de Configurações mostra em coluna — cópia de
 * `PAPEIS_CONFIGURAVEIS` no site. `master` fica de fora (ver `resolver`, em
 * `permissoes.ts`), e os legados `gerente`/`cliente` também: ninguém cria
 * mais nenhum dos dois.
 */
export const PAPEIS_CONFIGURAVEIS: Papel[] = ['admin', 'supervisor', 'operador_portao', 'suporte']

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
