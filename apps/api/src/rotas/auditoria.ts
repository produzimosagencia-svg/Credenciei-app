// A trilha de auditoria — quem alterou o quê, cópia (reduzida) do site's
// `admin/auditoria` (`obterAuditoria`, em `lib/actions.ts`).
//
// ─── O QUE FICA DE FORA, DE PROPÓSITO ───────────────────────────────────────
//
// O site tem filtro em cascata (evento → setor → ação → autor) e exportação
// em .xlsx. Aqui é "visualização simples" — o próprio nome da task no
// backlog: período e evento, e as linhas já vêm com "de → para" prontos
// porque `alteracoes_cadastro` guarda tudo em texto solto, sem precisar de
// mais nenhum join.
//
// ─── O ESCOPO É O MESMO DO SITE ─────────────────────────────────────────────
//
// master vê tudo; quem gerencia usuários (admin/gerente/cliente) só vê a
// própria organização; suporte só vê o que ELE MESMO fez — ele atravessa
// organizações, e mostrar a auditoria de organizações que não são dele
// vazaria dado de cliente pra cliente.

import { ehMaster, ehSuporte, podeGerenciarUsuarios } from '@credenciei/dominio'
import type { LinhaDeAuditoria, Repositorio } from '../dados/repositorio.js'

export async function auditoria(
  repo: Repositorio, pessoaId: string, filtro: { eventoId?: string; dias?: number } = {},
): Promise<LinhaDeAuditoria[]> {
  const perfil = await repo.perfilPorId(pessoaId)
  if (!perfil || !(podeGerenciarUsuarios(perfil.papel) || ehSuporte(perfil.papel))) {
    throw new Error('Você não tem permissão para ver a trilha de auditoria.')
  }

  const desde = filtro.dias ? new Date(Date.now() - filtro.dias * 24 * 60 * 60_000).toISOString() : undefined

  return repo.auditoria({
    organizacaoId: ehMaster(perfil.papel) ? undefined : (perfil.organizacaoId ?? undefined),
    autorId: ehSuporte(perfil.papel) ? perfil.id : undefined,
    eventoId: filtro.eventoId,
    desde,
    limite: 200,
  })
}
