// Suporte de Sistema — gente CONTRATADA pro dia do evento, pra resolver
// problema de operação (CPF errado, ponto que não bateu, supervisor sem
// senha) sem ser dona da conta. Corrige a operação; nunca administra.
//
// Só o master gerencia — o escopo atravessa organizações, quem contrata é
// a plataforma. Cópia de `criarSuporte`/`editarSuporte`/`revogarSuporte`
// em `c:\Dev\credenciei\lib\actions.ts` e da tela `app/admin/suporte/
// page.tsx`. MESMA tabela do site (`suporte_escopo`, `perfis.acesso_
// expira_em`) — nenhuma migração nova, esta é a primeira vez que o app
// lê/escreve nela.

import { ehMaster } from '@credenciei/dominio'
import type {
  DadosDeNovoSuporte, DadosDeSuporte, EdicaoDeSuporte, SuporteAcesso,
} from '@credenciei/contrato'
import type { Repositorio, SuporteAcessoNoRepositorio } from '../dados/repositorio.js'

const SEM_ACESSO = 'Você não tem permissão para gerenciar acessos de suporte.'

async function exigirMaster(repo: Repositorio, pessoaId: string): Promise<void> {
  const perfil = await repo.perfilPorId(pessoaId)
  if (!perfil || !ehMaster(perfil.papel)) throw new Error(SEM_ACESSO)
}

function paraSuporteAcesso(s: SuporteAcessoNoRepositorio, agora: Date): SuporteAcesso {
  return {
    ...s,
    // Passada a data, o acesso para sozinho — mesmo cálculo do site
    // (`new Date(\`${data}T23:59:59-03:00\`) < agora`), o dia inteiro vale.
    expirado: !!s.acessoExpiraEm && new Date(`${s.acessoExpiraEm}T23:59:59-03:00`) < agora,
  }
}

export async function dadosDeSuporte(repo: Repositorio, pessoaId: string, agora: Date = new Date()): Promise<DadosDeSuporte> {
  await exigirMaster(repo, pessoaId)
  const dados = await repo.dadosDeSuporte()
  return {
    suportes: dados.suportes.map(s => paraSuporteAcesso(s, agora)),
    organizacoes: dados.organizacoes,
    eventos: dados.eventos,
  }
}

function validado(dados: { nome: string; telefone: string; escopoOrganizacaoIds: string[]; escopoEventoIds: string[] }, exigirTelefone: boolean): string | null {
  if (!(dados.nome ?? '').trim()) return 'Informe o nome.'
  const telefone = (dados.telefone ?? '').replace(/\D/g, '')
  if (exigirTelefone && (telefone.length < 10 || telefone.length > 13)) {
    return 'Informe um telefone válido para enviar o acesso pelo WhatsApp.'
  }
  if (!dados.escopoOrganizacaoIds.length && !dados.escopoEventoIds.length) {
    return 'Escolha ao menos uma organização ou evento de atendimento.'
  }
  return null
}

export async function criarSuporte(
  repo: Repositorio, pessoaId: string, dados: DadosDeNovoSuporte,
): Promise<{ id?: string; erro?: string }> {
  await exigirMaster(repo, pessoaId)

  const erro = validado(dados, true)
  if (erro) return { erro }

  const cpf = (dados.cpf ?? '').replace(/\D/g, '')
  if (cpf.length !== 11) return { erro: 'Informe o CPF, com 11 dígitos.' }

  return repo.criarSuporte({
    nome: dados.nome.trim(), cpf, telefone: dados.telefone.replace(/\D/g, ''), ativo: dados.ativo,
    acessoExpiraEm: dados.acessoExpiraEm || null,
    escopoOrganizacaoIds: dados.escopoOrganizacaoIds ?? [], escopoEventoIds: dados.escopoEventoIds ?? [],
  })
}

export async function editarSuporte(
  repo: Repositorio, pessoaId: string, id: string, dados: EdicaoDeSuporte,
): Promise<{ erro?: string }> {
  await exigirMaster(repo, pessoaId)

  // Sem exigir telefone válido aqui — mesma assimetria do site: criar
  // exige (é por onde o convite de senha chega), editar não.
  const erro = validado(dados, false)
  if (erro) return { erro }

  return repo.editarSuporte(id, {
    nome: dados.nome.trim(), telefone: (dados.telefone ?? '').replace(/\D/g, ''), ativo: dados.ativo,
    acessoExpiraEm: dados.acessoExpiraEm || null,
    escopoOrganizacaoIds: dados.escopoOrganizacaoIds ?? [], escopoEventoIds: dados.escopoEventoIds ?? [],
  })
}

/** Diferente de excluir: o histórico do que a pessoa fez continua na Auditoria. */
export async function revogarSuporte(repo: Repositorio, pessoaId: string, id: string): Promise<{ erro?: string }> {
  await exigirMaster(repo, pessoaId)
  return repo.revogarSuporte(id)
}
