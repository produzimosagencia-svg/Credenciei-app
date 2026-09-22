// Base de funcionários / Encontrar colaborador — só o master.
//
// Não existe tabela `pessoas` ainda (ver o topo de `dados/supabase.ts`): a
// base é agregada por CPF em cima de `participacoes`, a mesma pessoa em
// cinco eventos de três clientes é UMA linha. É por isso que só o master
// enxerga — atravessa toda organização da plataforma.
//
// Não carrega valor pago: o que outra organização pagou é preço de
// concorrente. Quem contrata precisa saber SE a pessoa aparece, não quanto
// custou antes.

import { formatarBR, podeGerenciarOrganizacoes } from '@credenciei/dominio'
import type {
  BaseDeFuncionarios, BuscaRegional, EventoParaAtribuir, FichaDaPessoaNaBase, PessoaRegional,
  ResultadoDeAtribuicao, SetorParaAtribuir,
} from '@credenciei/contrato'
import type { PessoaDaBase, Repositorio } from '../dados/repositorio.js'

async function exigirMaster(repo: Repositorio, pessoaId: string) {
  const perfil = await repo.perfilPorId(pessoaId)
  if (!perfil || !podeGerenciarOrganizacoes(perfil.papel)) {
    throw new Error('Você não tem permissão para ver a base de funcionários.')
  }
  return perfil
}

function semAcento(t: string): string {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/** Nome (sem acento) ou CPF (só os dígitos digitados) — a mesma busca das outras telas. */
function combina(p: { nome: string; cpf: string }, busca: string): boolean {
  const alvo = busca.trim()
  if (!alvo) return true
  const digitos = alvo.replace(/\D/g, '')
  if (digitos.length >= 3) return p.cpf.includes(digitos)
  return semAcento(p.nome).includes(semAcento(alvo))
}

/**
 * Sem busca, "combina" aceita todo mundo — e com uma base de 2000+ pessoas
 * isso mandava a lista INTEIRA pro app de uma vez: 2000 cartões sem
 * paginação nenhuma na tela, travando o app inteiro ao abrir (achado
 * 12/09/2026, relatado como "trava toda vez que entro em Encontre um
 * colaborador"). 300 é o MESMO teto que o site já usa em "Encontre
 * colaborador" — por design, não por limitação do Supabase (ver o
 * comentário de `buscarTudo` em `lib/supabase-server.ts` do site).
 * `total`/indicadores continuam contando a base inteira; só a lista vem
 * cortada. Digitar a busca de verdade estreita e mostra as certas, mesmo
 * que sejam mais de 300 (a busca por CPF/nome já filtra antes de cortar).
 */
const LIMITE_DE_RESULTADOS = 300

/**
 * Filtra a busca regional (`encontrarColaborador`) por quem realmente
 * autorizou (`autorizouBaseRegional`) — LGPD, mesmo espírito do toggle
 * "recrutar" do site (`app/admin/encontrar/page.tsx`).
 *
 * DESLIGADO de propósito: nenhuma tela do app ainda coleta o
 * consentimento de verdade (ver `entrarNoEvento`), então ligar isto agora
 * esvaziaria a busca pra quase todo mundo — decisão do Juan, 22/09/2026.
 * Ligar (`true`) quando a tela de auto-cadastro passar a perguntar.
 */
const SO_QUEM_AUTORIZOU_APARECE_NA_BUSCA = false

/** Separado em função pura só pra o teste poder provar o filtro em si, sem depender do interruptor ligado. */
export function pessoasQueAparecemNaBusca(todas: PessoaDaBase[], ligado = SO_QUEM_AUTORIZOU_APARECE_NA_BUSCA): PessoaDaBase[] {
  return ligado ? todas.filter(p => p.autorizouBaseRegional) : todas
}

export async function baseDeFuncionarios(
  repo: Repositorio, pessoaId: string, busca = '',
): Promise<BaseDeFuncionarios> {
  await exigirMaster(repo, pessoaId)

  const todas = await repo.todasAsPessoasDaBase()
  const filtradas = todas.filter(p => combina(p, busca))
  const cadastros = todas.reduce((a, p) => a + p.eventos, 0)
  const organizacoes = (await repo.organizacoesComContagens()).length

  return {
    indicadores: [
      { chave: 'pessoas', rotulo: 'Pessoas na base', valor: todas.length, tom: 'acento' },
      { chave: 'cadastros', rotulo: 'Cadastros feitos', valor: cadastros, tom: 'info' },
      { chave: 'organizacoes', rotulo: 'Organizações', valor: organizacoes, tom: 'neutro' },
      {
        chave: 'recorrentes',
        rotulo: 'Já em 2+ eventos',
        valor: todas.filter(p => p.eventos >= 2).length,
        tom: 'sucesso',
      },
    ],
    pessoas: filtradas.slice(0, LIMITE_DE_RESULTADOS).map(p => ({
      cpf: p.cpf, nome: p.nome, telefone: p.telefone, funcao: p.funcao,
      eventos: p.eventos, organizacoes: p.organizacoes, ultimoCadastro: p.ultimoCadastro,
    })),
    encontrados: filtradas.length,
    total: todas.length,
  }
}

export async function encontrarColaborador(
  repo: Repositorio, pessoaId: string, filtro: { busca?: string; cidade?: string } = {},
): Promise<BuscaRegional> {
  await exigirMaster(repo, pessoaId)

  const todas = await repo.todasAsPessoasDaBase()
  const base = pessoasQueAparecemNaBusca(todas)
  const cidadeAlvo = semAcento((filtro.cidade ?? '').trim())
  const achadas = base.filter(p =>
    combina(p, filtro.busca ?? '') && (!cidadeAlvo || semAcento(p.cidade ?? '').includes(cidadeAlvo)))

  // Indicadores contam ACHADAS (a busca inteira) — só a lista abaixo corta em
  // 50, senão "Pessoas encontradas" mentiria toda vez que a busca passasse
  // do limite de tela.
  const indicadores = [
    { chave: 'encontradas' as const, rotulo: 'Pessoas encontradas', valor: achadas.length, tom: 'acento' as const },
    {
      chave: 'com_historico' as const,
      rotulo: 'Com histórico de presença',
      valor: achadas.filter(p => p.eventosTrabalhados > 0).length,
      tom: 'sucesso' as const,
    },
    {
      chave: 'cidades' as const, rotulo: 'Cidades',
      valor: new Set(todas.map(p => p.cidade).filter(Boolean)).size, tom: 'info' as const,
    },
    {
      chave: 'com_telefone' as const,
      rotulo: 'Com telefone',
      valor: achadas.filter(p => p.telefone).length,
      // Sem telefone não dá para chamar — e chamar é o que esta tela existe para fazer.
      tom: 'aviso' as const,
    },
  ]

  const pessoas: PessoaRegional[] = achadas.slice(0, LIMITE_DE_RESULTADOS).map(p => ({
    cpf: p.cpf,
    nome: p.nome,
    telefone: p.telefone,
    funcao: p.funcao,
    cidade: p.cidade,
    eventosTrabalhados: p.eventosTrabalhados,
    organizacoes: p.organizacoes,
    ultimo: p.ultimoCadastro,
  }))

  return {
    indicadores,
    pessoas,
    cidades: [...new Set(todas.map(p => p.cidade).filter((c): c is string => !!c))].sort(),
  }
}

/**
 * A ficha completa: todo evento em que a pessoa já trabalhou, em qualquer
 * organização. Responde "posso chamar essa pessoa?" — por isso não carrega
 * valor pago.
 *
 * `autorizouBaseRegional`/`autorizouEm` já vêm de verdade
 * (`funcionarios.consentimento_base`, ver `entrarNoEvento`) — mas como
 * nenhuma tela do app ainda pergunta isso a ninguém, hoje aparece `false`
 * pra praticamente todo mundo. Não é bug: é o valor real, só que a
 * coleta ainda não começou.
 *
 * LIMITE CONHECIDO: `chavePix` ainda não é colhido em lugar nenhum do
 * cadastro — volta `null` fixo. Mesma simplificação que o servidor falso
 * já assume (`cliente-falso.ts`).
 */
export async function fichaDaPessoaNaBase(
  repo: Repositorio, pessoaId: string, cpfDigitado: string,
): Promise<FichaDaPessoaNaBase> {
  await exigirMaster(repo, pessoaId)

  const cpf = (cpfDigitado ?? '').replace(/\D/g, '')
  const pessoa = (await repo.todasAsPessoasDaBase()).find(p => p.cpf === cpf)
  if (!pessoa) throw new Error('Não encontramos ninguém com este CPF na base.')

  const trabalhos = await repo.trabalhosDaPessoa(cpf)
  const compareceram = trabalhos.filter(t => t.compareceu).length
  const organizacoesDaPessoa = new Set(trabalhos.map(t => t.organizacaoId).filter(Boolean))
  const taxa = trabalhos.length ? Math.round((compareceram / trabalhos.length) * 100) : 0
  const ultimoTrabalho = trabalhos[0]?.dataInicio ?? null

  // Todo evento ATIVO da plataforma, e os setores de cada um — o formulário
  // de atribuir é em dois passos (evento, depois setor).
  const eventosAtivos = (await repo.eventosComContagens({})).filter(e => e.ativo)
  const eventosParaAtribuir: EventoParaAtribuir[] = eventosAtivos.map(e => ({
    id: e.id, nome: e.nome, ativo: e.ativo, data: e.dataInicio ?? '',
  }))
  const setoresParaAtribuir: SetorParaAtribuir[] = (
    await Promise.all(eventosAtivos.map(async e => (await repo.equipesDoEvento(e.id))
      .map(s => ({ id: s.setorId, nome: s.nome, eventoId: e.id }))))
  ).flat()

  return {
    cpf,
    nome: pessoa.nome,
    telefone: pessoa.telefone,
    cidade: pessoa.cidade,
    chavePix: null,
    cargoMaisComum: pessoa.funcao ?? '',
    autorizouBaseRegional: pessoa.autorizouBaseRegional,
    autorizouEm: pessoa.autorizouEm,
    indicadores: [
      { chave: 'eventos', rotulo: 'Eventos trabalhados', valor: trabalhos.length, tom: 'acento' },
      { chave: 'organizacoes', rotulo: 'Organizações', valor: organizacoesDaPessoa.size, tom: 'info' },
      {
        chave: 'taxa', rotulo: 'Taxa de presença', valor: `${taxa}%`,
        sub: trabalhos.length ? `compareceu em ${compareceram}` : undefined, tom: 'sucesso',
      },
      {
        chave: 'ultimo', rotulo: 'Último trabalho',
        valor: ultimoTrabalho ? formatarBR(ultimoTrabalho, 'data') : '—', tom: 'aviso',
      },
    ],
    trabalhos: trabalhos.map(t => ({
      funcionarioId: t.participacaoId,
      eventoId: t.eventoId,
      evento: t.eventoNome,
      organizacaoId: t.organizacaoId,
      organizacao: t.organizacaoNome ?? '',
      setor: t.setorNome,
      setorId: t.setorId,
      cargo: t.cargo ?? '',
      data: t.dataInicio,
      dataFim: t.dataFim,
      ativo: !t.descredenciadoEm,
      // LIMITE CONHECIDO: não sabemos ainda QUAIS etapas ela bateu, só SE
      // bateu entrada — ver `Repositorio.TrabalhoNaBase`.
      etapas: t.compareceu ? ['entrada'] : [],
      compareceu: t.compareceu,
      podeAbrirEvento: true,
    })),
    eventosParaAtribuir,
    setoresParaAtribuir,
    jaNosEventos: [...new Set(trabalhos.map(t => t.eventoId))],
  }
}

/**
 * Coloca a pessoa na equipe de um setor — o passo que fecha "achei" em
 * "chamei".
 *
 * Sem teto de vaga por setor: a produção removeu esse limite do sistema web
 * (ver `docs/decisoes/`), então a pessoa sempre entra ATIVA — não existe
 * mais "entra bloqueada por bater o teto".
 */
export async function atribuirPessoaAoEvento(
  repo: Repositorio, pessoaId: string, cpfDigitado: string, setorId: string,
): Promise<{ resultado?: ResultadoDeAtribuicao; erro?: string }> {
  await exigirMaster(repo, pessoaId)

  const cpf = (cpfDigitado ?? '').replace(/\D/g, '')
  const pessoaNaBase = (await repo.todasAsPessoasDaBase()).find(p => p.cpf === cpf)
  if (!pessoaNaBase) return { erro: 'Não encontramos ninguém com este CPF na base.' }

  const setor = await repo.setorPorId(setorId)
  if (!setor) return { erro: 'Não encontramos este setor.' }

  const evento = await repo.eventoPorId(setor.eventoId)
  if (!evento) return { erro: 'Não encontramos o evento deste setor.' }

  const pessoa = await repo.pessoaPorCpf(cpf)
  if (!pessoa) return { erro: 'Não encontramos ninguém com este CPF na base.' }

  // Uma pessoa só entra uma vez por evento — a mesma regra do formulário de
  // convite, só que do outro lado: quem atribui, não quem se cadastra.
  const participacoes = await repo.participacoesDaPessoa(pessoa.id)
  if (participacoes.some(p => p.eventoId === evento.id && !p.descredenciadoEm)) {
    return { erro: `${pessoa.nome} já está neste evento. Uma pessoa só entra uma vez por evento.` }
  }

  await repo.criarParticipacao({
    pessoaId: pessoa.id,
    eventoId: evento.id,
    equipeId: setor.setorId,
    equipeNome: setor.nome,
    funcao: pessoaNaBase.funcao,
    supervisorNome: null,
    ativo: true,
    descredenciadoEm: null,
    valorReceber: null,
    pago: false,
    pagoEm: null,
    qrToken: `atrib-${cpf}-${setor.setorId}-${Date.now().toString(36)}`,
    cidade: pessoaNaBase.cidade,
    criadoEm: new Date().toISOString(),
  })

  return {
    resultado: {
      evento: evento.nome,
      setor: setor.nome,
      ativo: true,
      semTelefone: !pessoa.telefone,
    },
  }
}
