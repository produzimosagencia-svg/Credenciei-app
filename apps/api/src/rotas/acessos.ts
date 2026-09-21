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

import { ehMaster, formatCpf, NOME_DO_PAPEL, podeExcluir, podeGerenciarUsuarios } from '@credenciei/dominio'
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
    // Supervisor, operador de portão e suporte entram por CPF; admin e
    // master, por e-mail — nunca os dois ao mesmo tempo para o mesmo acesso.
    identificador: a.cpf ? formatCpf(a.cpf) : (a.email ?? ''),
    papel: a.papel,
    ativo: a.ativo,
    setorNome: a.papel === 'supervisor' ? a.setorNome : null,
    telefone: a.telefone,
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
  await repo.registrarAuditoria({
    autorId: pessoaId, autorNome: perfil.nome, acao: 'ALTERACAO_SUPERVISOR',
    campoAlterado: `Status do acesso de ${alvo.nome}`, valorNovo: ativo ? 'Ativo' : 'Inativo',
    organizacaoId: alvo.organizacaoId ?? undefined,
  })
  return {}
}

/**
 * Troca a senha de qualquer acesso — o caminho que falta desde sempre: só a
 * própria pessoa tinha como trocar a senha, e quem esquece fica de fora no
 * dia do evento. Trazido do site em 12/09 (`redefinirSenha`).
 *
 * Simplificação conhecida: o site também deixa o suporte trocar senha de
 * supervisor/operador de portão dentro do escopo dele, com motivo obrigatório
 * — esta rota ainda não tem esse terceiro caminho, só master e admin.
 */
export async function trocarSenhaDoAcesso(
  repo: Repositorio, pessoaId: string, id: string, novaSenha: string,
): Promise<{ erro?: string }> {
  const perfil = await exigirPodeGerenciarUsuarios(repo, pessoaId)

  // Existe o fluxo de conta para a própria senha; um caminho administrativo
  // sobre si mesmo só serviria para confundir os dois.
  if (id === pessoaId) return { erro: 'Para trocar a própria senha, use as configurações da conta.' }
  if (!novaSenha || novaSenha.length < 6) return { erro: 'A senha precisa ter ao menos 6 caracteres.' }

  const alvo = await repo.acessosNoEscopo(ehMaster(perfil.papel) ? undefined : perfil.organizacaoId)
    .then(todos => todos.find(a => a.id === id))
  // "Não encontrado" também para o admin mirando um master — nunca "sem permissão",
  // que revelaria que aquele id existe.
  if (!alvo || (!ehMaster(perfil.papel) && alvo.papel === 'master')) return { erro: 'Não encontramos este acesso.' }

  await repo.definirSenhaDoAcesso(id, novaSenha)
  await repo.registrarAuditoria({
    autorId: pessoaId, autorNome: perfil.nome, acao: 'RESET_SENHA',
    campoAlterado: `Senha de ${alvo.nome}`, organizacaoId: alvo.organizacaoId ?? undefined,
  })
  return {}
}

/**
 * Muda nome, telefone e situação de um supervisor (ou outro acesso) já
 * existente — cópia do site's `editarSupervisor`, sem o CPF (aqui ele nunca
 * muda depois de criado) nem a troca de senha (já existe
 * `trocarSenhaDoAcesso`, caminho próprio).
 */
export async function editarSupervisor(
  repo: Repositorio, pessoaId: string, id: string,
  dados: { nome: string; telefone: string; ativo: boolean; permissoesUsuario?: Record<string, boolean> },
): Promise<{ erro?: string }> {
  const perfil = await exigirPodeGerenciarUsuarios(repo, pessoaId)

  const alvo = await repo.acessosNoEscopo(ehMaster(perfil.papel) ? undefined : perfil.organizacaoId)
    .then(todos => todos.find(a => a.id === id))
  if (!alvo) return { erro: 'Não encontramos este acesso.' }

  const nome = (dados.nome ?? '').trim()
  const telefone = (dados.telefone ?? '').replace(/\D/g, '')
  if (nome.length < 3) return { erro: 'Digite o nome completo da pessoa.' }
  if (telefone.length < 10 || telefone.length > 13) {
    return { erro: 'Informe um telefone válido para enviar o acesso pelo WhatsApp.' }
  }

  await repo.atualizarAcesso(id, { nome, telefone, ativo: dados.ativo === true, permissoesUsuario: dados.permissoesUsuario })
  await repo.registrarAuditoria({
    autorId: pessoaId, autorNome: perfil.nome, acao: 'ALTERACAO_SUPERVISOR',
    campoAlterado: `Dados de ${alvo.nome}`, valorNovo: nome,
    organizacaoId: alvo.organizacaoId ?? undefined,
  })
  return {}
}

/**
 * Apaga o acesso — diferente de "Bloquear", que só fecha a porta sem perder
 * o histórico. Só o master: quem administra usuários da própria organização
 * pode desativar, nunca apagar (mesma régua do site, `podeExcluir`).
 */
export async function excluirAcesso(
  repo: Repositorio, pessoaId: string, id: string,
): Promise<{ erro?: string }> {
  // Quem não gerencia usuários nem abre esta tela — isso é permissão de
  // verdade, e lança (vira 404, mesmo padrão do resto da API). Quem
  // gerencia mas não é master PODE estar aqui, só não pode apagar — por
  // isso é resposta, não exceção.
  const perfil = await exigirPodeGerenciarUsuarios(repo, pessoaId)
  if (!podeExcluir(perfil.papel)) {
    return { erro: 'Só o master exclui acessos. Você pode desativar, que bloqueia o login sem perder o histórico.' }
  }
  if (id === pessoaId) return { erro: 'Você não pode excluir o próprio acesso.' }

  const alvo = (await repo.acessosNoEscopo()).find(a => a.id === id)
  if (!alvo) return { erro: 'Não encontramos este acesso.' }

  await repo.excluirAcesso(id)
  return {}
}

export async function eventosComSetores(repo: Repositorio, pessoaId: string): Promise<EventoComSetores[]> {
  const perfil = await exigirPodeGerenciarUsuarios(repo, pessoaId)
  const eventos = await repo.eventosComContagens(ehMaster(perfil.papel) ? {} : { organizacaoId: perfil.organizacaoId })

  const ativos = eventos.filter(e => e.ativo)
  return Promise.all(ativos.map(async e => ({
    eventoId: e.id,
    nome: e.nome,
    // Só `setorId`/`nome`: o contrato desta tela não conhece `exigeMeio` —
    // vazar o campo extra seria mudar a resposta sem ninguém ter pedido.
    setores: (await repo.equipesDoEvento(e.id)).map(s => ({ setorId: s.setorId, nome: s.nome })),
  })))
}

/**
 * Os operadores de portão da mesma organização deste evento — cópia do
 * site's consulta em `page.tsx`: são da ORGANIZAÇÃO, não deste evento
 * sozinho (não há como prender um perfil sem setor a um evento). Widget na
 * tela do evento, ao lado do cartaz da portaria — `OperadorPortariaCard.tsx`.
 */
export async function operadoresDoEvento(
  repo: Repositorio, pessoaId: string, eventoId: string,
): Promise<Acesso[]> {
  const perfil = await exigirPodeGerenciarUsuarios(repo, pessoaId)

  const evento = await repo.eventoPorId(eventoId)
  if (!evento || (!ehMaster(perfil.papel) && evento.organizacaoId !== perfil.organizacaoId)) {
    throw new Error('Não encontramos este evento.')
  }

  const todos = await repo.acessosNoEscopo(evento.organizacaoId ?? undefined)
  return todos.filter(a => a.papel === 'operador_portao').map(a => paraAcesso(a, pessoaId))
}

export async function criarAcesso(
  repo: Repositorio, pessoaId: string, dados: NovoAcesso,
): Promise<{ acesso?: Acesso; erro?: string }> {
  const perfil = await exigirPodeGerenciarUsuarios(repo, pessoaId)
  const funcao = dados.funcao ?? 'supervisor'

  /*
   * Admin é preso à ORGANIZAÇÃO, não a um evento — entra por e-mail e senha,
   * nunca por CPF. Master escolhe a organização; quem já gerencia usuários
   * mas não é master só pode adicionar outro admin na PRÓPRIA organização
   * (mesma régua de `adicionarAdmin` no site).
   */
  if (funcao === 'admin') {
    const nome = (dados.nome ?? '').trim()
    const email = (dados.email ?? '').trim().toLowerCase()
    const senha = (dados.senha ?? '').trim()

    if (nome.length < 3) return { erro: 'Digite o nome completo da pessoa.' }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { erro: 'Informe um e-mail válido — é por ele que o admin entra.' }
    if (senha.length < 6) return { erro: 'A senha precisa ter ao menos 6 caracteres.' }

    const organizacaoId = ehMaster(perfil.papel) ? (dados.organizacaoId ?? '').trim() : perfil.organizacaoId
    if (!organizacaoId) return { erro: 'Escolha a organização deste admin.' }

    const organizacao = await repo.organizacaoPorId(organizacaoId)
    if (!organizacao) return { erro: 'Organização não encontrada.' }

    try {
      const acesso = await repo.criarAdmin({ nome, email, senha, organizacaoId, ativo: dados.ativo })
      await repo.registrarAuditoria({
        autorId: pessoaId, autorNome: perfil.nome, acao: 'ALTERACAO_SUPERVISOR',
        campoAlterado: `Admin da organização ${organizacao.nome}`,
        valorNovo: `${nome} — ${email} (acesso novo)`, organizacaoId,
      })
      return { acesso: paraAcesso(acesso, pessoaId) }
    } catch (e) {
      return { erro: e instanceof Error ? e.message : 'Não foi possível criar o admin.' }
    }
  }

  const nome = (dados.nome ?? '').trim()
  const cpf = (dados.cpf ?? '').replace(/\D/g, '')
  const telefone = (dados.telefone ?? '').replace(/\D/g, '')

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

  const setorDoAcesso = funcao === 'supervisor' ? setores.find(s => s.setorId === dados.setorId)?.nome : undefined
  await repo.registrarAuditoria({
    autorId: pessoaId, autorNome: perfil.nome, acao: 'ALTERACAO_SUPERVISOR',
    campoAlterado: setorDoAcesso ? `Supervisor do setor ${setorDoAcesso}` : `Acesso de ${NOME_DO_PAPEL[funcao]}`,
    valorNovo: `${nome} — CPF ${formatCpf(cpf)} (acesso novo)`,
    eventoId: evento.id, organizacaoId: evento.organizacaoId ?? undefined,
  })

  return { acesso: paraAcesso(acesso, pessoaId) }
}
