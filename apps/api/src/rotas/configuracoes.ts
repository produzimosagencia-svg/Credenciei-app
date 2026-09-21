// Quem pode o quê — a camada de ORGANIZAÇÃO ("Configurações", master-only) e
// a leitura das duas camadas de override que afetam UM acesso, pro app poder
// montar o menu sem esperar o servidor recusar o clique.
//
// Cópia da régua do site (`app/admin/configuracoes`, `obterPermissoes` e
// `salvarPermissao` em `lib/actions.ts`), reduzida ao catálogo que já é tela
// no app — ver `packages/dominio/src/capacidades.ts`.

import { CAPACIDADES, ehMaster, NOME_DO_PAPEL, PAPEIS_CONFIGURAVEIS, type Papel } from '@credenciei/dominio'
import type { ExcecaoDePermissao, Repositorio } from '../dados/repositorio.js'

/** Cópia das duas camadas de override que valem para ESTE acesso — sem elas o menu do app só saberia o padrão do código. */
export async function minhasPermissoes(
  repo: Repositorio, pessoaId: string,
): Promise<{ permissoesUsuario: Record<string, boolean>; permissoesOrganizacao: Record<string, boolean> }> {
  const perfil = await repo.perfilPorId(pessoaId)
  if (!perfil) return { permissoesUsuario: {}, permissoesOrganizacao: {} }
  return {
    permissoesUsuario: perfil.permissoesUsuario ?? {},
    permissoesOrganizacao: perfil.permissoesOrganizacao ?? {},
  }
}

async function exigirMaster(repo: Repositorio, pessoaId: string) {
  const perfil = await repo.perfilPorId(pessoaId)
  // Mesmo gate do site: só master abre Configurações — uma tela de
  // permissões capaz de tirar do master a permissão de abri-la se tranca
  // sozinha.
  if (!perfil || !ehMaster(perfil.papel)) throw new Error('Só o master configura permissões.')
  return perfil
}

export async function permissoesDaOrganizacao(
  repo: Repositorio, pessoaId: string, organizacaoId: string | null,
): Promise<{ organizacoes: { organizacaoId: string; nome: string }[]; salvas: ExcecaoDePermissao[] }> {
  await exigirMaster(repo, pessoaId)
  const [todas, salvas] = await Promise.all([
    repo.organizacoesComContagens(),
    repo.excecoesDePermissao(organizacaoId),
  ])
  return {
    organizacoes: todas.map(o => ({ organizacaoId: o.id, nome: o.nome })),
    salvas,
  }
}

/**
 * Liga, desliga ou apaga (`permitido: null` volta ao padrão do código) uma
 * capacidade de um papel — numa organização, ou na plataforma inteira
 * (`organizacaoId` nulo).
 */
export async function salvarPermissaoDaOrganizacao(
  repo: Repositorio, pessoaId: string,
  organizacaoId: string | null, papel: string, chave: string, permitido: boolean | null,
): Promise<{ erro?: string }> {
  const perfil = await exigirMaster(repo, pessoaId)

  /*
   * Duas travas de sanidade, cópia do site: papel e chave têm que existir
   * no catálogo. Sem isso, um valor colado na chamada criaria uma linha que
   * nenhuma tela mostra e ninguém consegue mais desfazer pela interface.
   */
  if (!PAPEIS_CONFIGURAVEIS.includes(papel as Papel)) return { erro: 'Este tipo de acesso não é configurável.' }
  if (!CAPACIDADES.some(c => c.chave === chave)) return { erro: 'Permissão desconhecida.' }

  if (organizacaoId) {
    const organizacao = await repo.organizacaoPorId(organizacaoId)
    if (!organizacao) return { erro: 'Organização não encontrada.' }
  }

  await repo.salvarExcecaoDePermissao(organizacaoId, papel as Papel, chave, permitido, perfil.id)

  const capacidade = CAPACIDADES.find(c => c.chave === chave)
  await repo.registrarAuditoria({
    autorId: pessoaId, autorNome: perfil.nome, acao: 'ALTERACAO_PERMISSAO',
    campoAlterado: `${NOME_DO_PAPEL[papel as Papel]} · ${capacidade?.nome ?? chave}`,
    valorNovo: permitido === null ? 'Voltou ao padrão do sistema' : permitido ? 'Liberado' : 'Bloqueado',
    organizacaoId: organizacaoId ?? undefined,
  })
  return {}
}
