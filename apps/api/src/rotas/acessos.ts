// Quem consegue ENTRAR no sistema — a tela de Acessos. Não confundir com a
// equipe do evento: quem só trabalha no dia aparece dentro do setor, não aqui.
//
// ─── SÓ MASTER CRIA SUPORTE ──────────────────────────────────────────────────
//
// Supervisor e operador de portão ficam presos à própria organização (do
// admin que cria); suporte atravessa organizações — é gente contratada pela
// PLATAFORMA para apoiar vários clientes, não um acesso que um admin de
// cliente específico deveria poder conceder. Mesma régua de quem cria
// organização.
//
// ─── O QUE ESTE ARQUIVO NÃO FAZ AINDA ───────────────────────────────────────
//
// A conta nasce com senha aleatória e descartada — ninguém a conhece. No
// site, quem acabou de ser criado recebe um link de convite por WhatsApp para
// escolher a própria senha (`criarConviteSenhaSupervisor` +
// `agendarTemplateSupervisor`); esta API ainda não manda nada, então a conta
// fica inacessível até alguém redefinir a senha por fora (Supabase Studio).
// Documentado como pendência, no mesmo espírito da foto do registro
// assistido — ver `docs/backlog.md`.
//
// Também não reatribui um CPF de supervisor já existente a um setor NOVO
// (a "soma de setores" do site, via `supervisor_setores`): aqui um CPF já
// cadastrado é sempre recusado — mais simples, e o mesmo que o servidor de
// mentira já faz.

import { ehMaster, formatCpf, podeGerenciarUsuarios } from '@credenciei/dominio'
import type {
  Acesso, EventoComSetores, FiltroDeAcessos, ListaDeAcessos, NovoAcesso,
} from '@credenciei/contrato'
import type { AcessoCompleto, Perfil, Repositorio } from '../dados/repositorio.js'

async function exigirPodeGerenciarUsuarios(repo: Repositorio, pessoaId: string): Promise<Perfil> {
  const perfil = await repo.perfilPorId(pessoaId)
  if (!perfil || !podeGerenciarUsuarios(perfil.papel)) throw new Error('Você não tem permissão para gerenciar acessos.')
  return perfil
}

function semAcento(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

function paraAcesso(a: AcessoCompleto, pessoaId: string): Acesso {
  return {
    id: a.id,
    nome: a.nome,
    // Todo papel que esta API cria (supervisor, operador de portão, suporte)
    // entra por CPF — ver `identificadorParaEmail`. Admin/master, criados
    // fora desta rota, ainda não têm e-mail modelado em `AcessoCompleto`:
    // aparecem sem identificador até a Plataforma trazer isso.
    identificador: a.cpf ? formatCpf(a.cpf) : '',
    papel: a.papel,
    ativo: a.ativo,
    setorNome: a.papel === 'supervisor' ? a.setorNome : null,
    eventos: a.eventos,
    criadoEm: a.criadoEm,
    expiraEm: a.expiraEm,
    permissoesUsuario: a.permissoesUsuario,
    souEu: a.id === pessoaId,
  }
}

export async function acessos(repo: Repositorio, pessoaId: string, filtro: FiltroDeAcessos = {}): Promise<ListaDeAcessos> {
  const perfil = await exigirPodeGerenciarUsuarios(repo, pessoaId)
  const todos = await repo.acessosNoEscopo(ehMaster(perfil.papel) ? undefined : perfil.organizacaoId)
  const ativos = todos.filter(a => a.ativo).length

  const busca = semAcento((filtro.busca ?? '').trim())
  const buscaDigitos = busca.replace(/\D/g, '')
  const situacao = filtro.situacao ?? 'todos'

  const itens = todos
    .filter(a => (situacao === 'ativos' ? a.ativo : situacao === 'inativos' ? !a.ativo : true))
    .filter(a => !busca || semAcento(a.nome).includes(busca) || (buscaDigitos && a.cpf.includes(buscaDigitos)))
    .map(a => paraAcesso(a, pessoaId))

  return { itens, total: todos.length, ativos, inativos: todos.length - ativos }
}

export async function mudarSituacaoDoAcesso(
  repo: Repositorio, pessoaId: string, id: string, ativo: boolean,
): Promise<{ erro?: string }> {
  const perfil = await exigirPodeGerenciarUsuarios(repo, pessoaId)

  /*
   * Ninguém se tranca para fora.
   *
   * Desativar a própria conta deixaria a pessoa sem como voltar — e só o
   * master cria admin, então isso vira uma ligação para a plataforma no
   * meio do evento.
   */
  if (id === pessoaId) return { erro: 'Você não pode desativar o próprio acesso.' }

  const alvo = await repo.acessosNoEscopo(ehMaster(perfil.papel) ? undefined : perfil.organizacaoId)
    .then(todos => todos.find(a => a.id === id))
  if (!alvo) return { erro: 'Não encontramos este acesso.' }

  await repo.definirSituacaoDoAcesso(id, ativo)
  return {}
}

export async function eventosComSetores(repo: Repositorio, pessoaId: string): Promise<EventoComSetores[]> {
  const perfil = await exigirPodeGerenciarUsuarios(repo, pessoaId)
  const eventos = await repo.eventosComContagens(ehMaster(perfil.papel) ? {} : { organizacaoId: perfil.organizacaoId })

  const ativos = eventos.filter(e => e.ativo)
  return Promise.all(ativos.map(async e => ({
    eventoId: e.id,
    nome: e.nome,
    setores: await repo.equipesDoEvento(e.id),
  })))
}

export async function criarAcesso(
  repo: Repositorio, pessoaId: string, dados: NovoAcesso,
): Promise<{ acesso?: Acesso; erro?: string }> {
  const perfil = await exigirPodeGerenciarUsuarios(repo, pessoaId)

  const nome = (dados.nome ?? '').trim()
  const cpf = (dados.cpf ?? '').replace(/\D/g, '')
  const telefone = (dados.telefone ?? '').replace(/\D/g, '')
  const funcao = dados.funcao ?? 'supervisor'

  if (nome.length < 3) return { erro: 'Digite o nome completo da pessoa.' }
  if (cpf.length !== 11) return { erro: 'O CPF precisa ter 11 dígitos.' }
  if (telefone.length < 10 || telefone.length > 13) {
    return { erro: 'Informe um telefone válido para enviar o acesso pelo WhatsApp.' }
  }
  if (funcao === 'suporte' && !ehMaster(perfil.papel)) {
    return { erro: 'Só o master cria acesso de suporte.' }
  }
  if (!dados.eventoId) return { erro: 'Escolha o evento.' }

  const evento = await repo.eventoPorId(dados.eventoId)
  if (!evento) return { erro: 'Evento não encontrado.' }
  if (!ehMaster(perfil.papel) && evento.organizacaoId !== perfil.organizacaoId) {
    return { erro: 'Sem permissão sobre este evento.' }
  }

  /*
   * Só o supervisor pede setor — operador de portão e suporte são do evento
   * inteiro, sem setor: prender os dois num setor faria o credenciamento
   * parar quando o supervisor daquele setor não está.
   */
  if (funcao === 'supervisor' && !dados.setorId) {
    return { erro: 'Escolha o setor do supervisor.' }
  }
  const setores = funcao === 'supervisor' ? await repo.equipesDoEvento(evento.id) : []
  if (funcao === 'supervisor' && !setores.some(s => s.setorId === dados.setorId)) {
    return { erro: 'Setor não encontrado.' }
  }

  // O CPF é a chave de identidade: dois acessos com o mesmo CPF fariam duas
  // pessoas diferentes entrarem na mesma conta.
  if (await repo.acessoPorCpf(cpf)) {
    return { erro: 'Já existe um acesso com este CPF.' }
  }

  const acesso = await repo.criarAcesso({
    nome,
    cpf,
    telefone,
    papel: funcao,
    organizacaoId: evento.organizacaoId,
    ativo: dados.ativo,
    ...(funcao === 'supervisor' ? { setorId: dados.setorId } : {}),
    expiraEm: funcao === 'suporte' ? (dados.expiraEm ?? null) : null,
    permissoesUsuario: dados.permissoesUsuario ?? {},
  })

  return { acesso: paraAcesso(acesso, pessoaId) }
}
