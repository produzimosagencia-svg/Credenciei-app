// Configurar o evento: informações, horários e dias de trabalho.
//
// ─── SÓ QUEM GERENCIA, SÓ NA PRÓPRIA ORGANIZAÇÃO ───────────────────────────
//
// Master vê e edita qualquer evento; admin (e os papéis legados gerente e
// cliente) só o da própria organização. "Não encontramos este evento" serve
// para os dois casos — não existir e não ser seu — de propósito: diferenciar
// entregaria um jeito de varrer ids e descobrir quais eventos existem.
//
// ─── A CONFERÊNCIA DE HORÁRIOS É FEITA DE NOVO AQUI ─────────────────────────
//
// A tela já confere antes de mandar. O servidor confere de novo porque a tela
// é conveniência e o servidor é a garantia — uma configuração impossível
// gravada aqui só apareceria na madrugada do evento, com gente tentando bater
// a saída ao mesmo tempo. Foi assim que a saída do Kleber Andrade ficou
// marcada para o dia errado, no sistema web.

import {
  conferirHorariosDoEvento, diaBRT, ehMaster, formatCpf, gerarCodigoDeEvento, podeExcluir, podeGerenciarEventos,
} from '@credenciei/dominio'
import type {
  ConfiguracaoDoEvento, ConfiguracaoDoMeio, DadosDeNovoEvento, DiaDeTrabalho as DiaDoContrato, EdicaoDoEvento,
  EventoDetalhado, Portaria, ResultadoDosDias, SetorDetalhado,
} from '@credenciei/contrato'
import type { EstadoDaPortaria, Evento, Perfil, Repositorio, SetorComPessoas } from '../dados/repositorio.js'

async function exigirAcessoAoEvento(
  repo: Repositorio, pessoaId: string, eventoId: string,
): Promise<{ perfil: Perfil; evento: Evento }> {
  const perfil = await repo.perfilPorId(pessoaId)
  if (!perfil || !podeGerenciarEventos(perfil.papel)) {
    throw new Error('Você não tem permissão para configurar eventos.')
  }
  const evento = await repo.eventoPorId(eventoId)
  if (!evento || (!ehMaster(perfil.papel) && evento.organizacaoId !== perfil.organizacaoId)) {
    throw new Error('Não encontramos este evento.')
  }
  return { perfil, evento }
}

/**
 * A mesma regra de `exigirAcessoAoEvento`, partindo do SETOR — para as
 * operações que só recebem o `setorId` (editar, ligar/desligar link), do
 * jeito que `equipeDoSetor` já faz em `rotas/setor.ts`.
 */
async function exigirAcessoAoSetor(
  repo: Repositorio, pessoaId: string, setorId: string,
): Promise<{ perfil: Perfil; evento: Evento }> {
  const perfil = await repo.perfilPorId(pessoaId)
  if (!perfil || !podeGerenciarEventos(perfil.papel)) {
    throw new Error('Você não tem permissão para configurar setores.')
  }
  const setor = await repo.setorPorId(setorId)
  if (!setor) throw new Error('Não encontramos este setor.')
  const evento = await repo.eventoPorId(setor.eventoId)
  if (!evento || (!ehMaster(perfil.papel) && evento.organizacaoId !== perfil.organizacaoId)) {
    throw new Error('Não encontramos este setor.')
  }
  return { perfil, evento }
}

function setorParaDetalhe(s: SetorComPessoas, siteUrl: string): SetorDetalhado {
  return {
    setorId: s.setorId,
    nome: s.nome,
    pessoas: s.pessoas,
    valorPorPessoa: s.valorPorPessoa,
    linkDoFormulario: s.token ? `${siteUrl}/form/${s.token}` : '',
    linkAtivo: s.linkAtivo,
    exigeMeio: s.exigeMeio,
    supervisores: s.supervisores,
  }
}

export async function configuracaoDoEvento(
  repo: Repositorio, pessoaId: string, eventoId: string,
): Promise<ConfiguracaoDoEvento> {
  const { evento } = await exigirAcessoAoEvento(repo, pessoaId, eventoId)

  const diasDoEvento = await repo.diasDoEvento(eventoId)
  const comRegistro = await repo.datasComRegistro(eventoId)

  const dias: DiaDoContrato[] = diasDoEvento
    .map(d => ({
      data: d.data,
      tipo: d.tipo,
      // O dia principal está sempre "travado" — não é por ele ter batida que
      // não se pode desmarcá-lo, é que ele nunca aparece como opção de
      // desmarcar: é o próprio `dataInicio` do evento.
      temBatidas: d.tipo === 'principal' ? true : comRegistro.has(d.data),
    }))
    .sort((a, b) => a.data.localeCompare(b.data))

  return {
    eventoId: evento.id,
    nome: evento.nome,
    descricao: evento.descricao,
    local: evento.local,
    dataInicio: evento.dataInicio,
    dataFim: evento.dataFim,
    batidaLivre: evento.batida_livre === true,
    checkinAutonomo: evento.checkin_autonomo === true,
    janelaEntradaInicio: evento.janela_entrada_inicio,
    janelaEntradaFim: evento.janela_entrada_fim,
    janelaFimInicio: evento.janela_fim_inicio,
    janelaFimFim: evento.janela_fim_fim,
    diaPrincipal: evento.dataInicio ? diaBRT(evento.dataInicio) : null,
    dias,
  }
}

export async function salvarEvento(
  repo: Repositorio, pessoaId: string, eventoId: string, dados: EdicaoDoEvento,
): Promise<{ erro?: string }> {
  const { evento } = await exigirAcessoAoEvento(repo, pessoaId, eventoId)

  const nome = (dados.nome ?? '').trim()
  if (!nome) return { erro: 'O evento precisa de um nome.' }
  if (!dados.dataInicio) return { erro: 'Defina quando o evento começa.' }

  const problemas = conferirHorariosDoEvento({
    data_inicio: dados.dataInicio,
    data_fim: dados.dataFim,
    janela_entrada_inicio: dados.janelaEntradaInicio,
    janela_entrada_fim: dados.janelaEntradaFim,
    janela_fim_inicio: dados.janelaFimInicio,
    janela_fim_fim: dados.janelaFimFim,
  })
  const bloqueio = problemas.find(p => p.bloqueia)
  if (bloqueio) return { erro: bloqueio.mensagem }

  await repo.atualizarEvento(evento.id, {
    nome,
    descricao: dados.descricao?.trim() || null,
    local: dados.local?.trim() || null,
    dataInicio: dados.dataInicio,
    dataFim: dados.dataFim,
    batida_livre: dados.batidaLivre === true,
    checkin_autonomo: dados.checkinAutonomo === true,
    janela_entrada_inicio: dados.janelaEntradaInicio,
    janela_entrada_fim: dados.janelaEntradaFim,
    janela_fim_inicio: dados.janelaFimInicio,
    janela_fim_fim: dados.janelaFimFim,
  })

  /*
   * Roda em TODA edição, não só quando a data muda de verdade (idempotente
   * — se já é o dia principal, não faz nada). Sem isto, mudar a data de
   * início do evento não movia o dia principal de `jornada_dias`: o dia
   * antigo continuava marcado e o novo nunca ganhava linha nenhuma — quebrando
   * o auto-atendimento e os indicadores do dia, que dependem de saber qual é
   * o dia principal. Achado comparando com `garantirDiaPrincipal` do site
   * (`lib/actions.ts`), 13/09/2026 — lá ela já existia; aqui não.
   */
  await repo.garantirDiaPrincipal(evento.id, diaBRT(dados.dataInicio))

  return {}
}

export async function salvarDiasDeTrabalho(
  repo: Repositorio, pessoaId: string, eventoId: string, dias: string[],
): Promise<{ resultado?: ResultadoDosDias; erro?: string }> {
  const { evento } = await exigirAcessoAoEvento(repo, pessoaId, eventoId)
  if (!evento.dataInicio) return { erro: 'Defina a data do evento antes de marcar os dias de trabalho.' }

  const diaPrincipal = diaBRT(evento.dataInicio)
  const pedidos = new Set((dias ?? []).filter(d => d !== diaPrincipal))
  // Antes de somar os preservados — é o que a pessoa de fato marcou, e é o
  // número que a resposta conta em "dias" (ver embaixo).
  const requisitados = pedidos.size

  /*
   * Dia com batida é PRESERVADO mesmo vindo desmarcado.
   *
   * Apagá-lo tiraria do sistema presenças que já aconteceram — e é delas que
   * sai o pagamento. A resposta diz quantos foram mantidos, para a tela poder
   * explicar em vez de parecer que o botão não funcionou.
   */
  const comRegistro = await repo.datasComRegistro(eventoId)
  const atuais = (await repo.diasDoEvento(eventoId)).filter(d => d.tipo === 'preparacao').map(d => d.data)
  const preservados = atuais.filter(d => !pedidos.has(d) && comRegistro.has(d))
  for (const d of preservados) pedidos.add(d)

  const finais = [...pedidos].sort()
  await repo.salvarDiasDeTrabalho(eventoId, finais)

  /*
   * `dias` é só o que foi PEDIDO — nunca `finais.length`, que inclui os
   * preservados. Contar os dois juntos faria a mesma data aparecer no "N
   * dias salvos" E no "M dias mantidos", como se fossem coisas diferentes.
   * Mesma régua do site (`escolhidos.length`, em `lib/actions.ts`),
   * conferido em 13/09/2026.
   */
  return { resultado: { dias: requisitados, preservados: preservados.length } }
}

/**
 * O que a tela de "Batida do meio" mostra: os setores do evento e os dias da
 * operação, cada um com o próprio interruptor.
 *
 * O meio não tem horário para configurar — ele é a entrada real de cada
 * pessoa + 4h. O que se escolhe aqui é OUTRA coisa: quais SETORES pedem a
 * confirmação, e em quais DIAS. As duas listas se combinam com E — ver
 * `LinhaDoDia.exigeMeio`.
 */
export async function configuracaoDoMeio(
  repo: Repositorio, pessoaId: string, eventoId: string,
): Promise<ConfiguracaoDoMeio> {
  await exigirAcessoAoEvento(repo, pessoaId, eventoId)

  const [setores, dias] = await Promise.all([
    repo.equipesDoEvento(eventoId),
    repo.diasDoEvento(eventoId),
  ])

  return {
    setores: setores.map(s => ({ setorId: s.setorId, nome: s.nome, exigeMeio: s.exigeMeio })),
    dias: dias.map(d => ({ data: d.data, tipo: d.tipo, exigeMeio: d.exigeMeio })),
  }
}

/**
 * Liga/desliga a batida do meio: quais SETORES pedem, e em quais DIAS.
 *
 * Grava explicitamente o que foi DESMARCADO, e não só o marcado — sem isso,
 * desligar não desligaria nada, só deixaria de ligar de novo.
 */
export async function salvarConfiguracaoDoMeio(
  repo: Repositorio, pessoaId: string, eventoId: string, setoresLigados: string[], diasLigados: string[],
): Promise<{ setores?: number; dias?: number; erro?: string }> {
  await exigirAcessoAoEvento(repo, pessoaId, eventoId)

  /*
   * Nunca confia no id vindo de fora — mesmo princípio de nunca aceitar id
   * de pessoa vindo de fora (ver o topo do projeto): sem filtrar, um id de
   * SETOR (ou uma DATA) de outro evento, mandado por engano ou de propósito,
   * ligaria ou desligaria o meio de algo que não pertence a este evento.
   * Mesma filtragem do site (`idsDoEvento.filter(...)`, `lib/actions.ts`),
   * conferido em 13/09/2026.
   */
  const idsDoEvento = new Set((await repo.setoresDoEvento(eventoId)).map(s => s.setorId))
  const setoresFiltrados = setoresLigados.filter(id => idsDoEvento.has(id))

  const datasDoEvento = new Set((await repo.diasDoEvento(eventoId)).map(d => d.data))
  const diasFiltrados = diasLigados.filter(d => datasDoEvento.has(d))

  await repo.definirSetoresComMeio(eventoId, setoresFiltrados)
  await repo.definirDiasComMeio(eventoId, diasFiltrados)

  return { setores: setoresFiltrados.length, dias: diasFiltrados.length }
}

export async function criarEvento(
  repo: Repositorio, pessoaId: string, dados: DadosDeNovoEvento,
): Promise<{ eventoId?: string; erro?: string }> {
  const perfil = await repo.perfilPorId(pessoaId)
  if (!perfil || !podeGerenciarEventos(perfil.papel)) {
    return { erro: 'Você não tem permissão para criar eventos.' }
  }

  const nome = (dados.nome ?? '').trim()
  if (!nome) return { erro: 'O evento precisa de um nome.' }
  if (!dados.dataInicio || !dados.dataFim) return { erro: 'Data de início e data de fim são obrigatórias.' }

  /*
   * O admin não escolhe — o SERVIDOR decide pela própria organização dele,
   * nunca pelo que a tela mandar. É a mesma regra que faz o admin não
   * enxergar depois o evento de outra organização no Painel: quem cria só
   * pode criar onde já enxerga.
   *
   * LIMITE CONHECIDO: para o master, ainda não confere se a organização
   * existe nem se está suspensa (a Plataforma — `organizacoes()` — ainda
   * fala com o servidor falso, ver `docs/backlog.md`). Um id inventado aqui
   * cria um evento órfão, do mesmo jeito que aconteceria hoje.
   */
  const organizacaoId = ehMaster(perfil.papel) ? (dados.organizacaoId ?? '').trim() || null : perfil.organizacaoId
  if (ehMaster(perfil.papel) && !organizacaoId) return { erro: 'Escolha a organização dona deste evento.' }

  const problemas = conferirHorariosDoEvento({
    data_inicio: dados.dataInicio,
    data_fim: dados.dataFim,
    janela_entrada_inicio: dados.janelaEntradaInicio,
    janela_entrada_fim: dados.janelaEntradaFim,
    janela_fim_inicio: dados.janelaFimInicio,
    janela_fim_fim: dados.janelaFimFim,
  })
  const bloqueio = problemas.find(p => p.bloqueia)
  if (bloqueio) return { erro: bloqueio.mensagem }

  const ano = new Date(dados.dataInicio).getUTCFullYear() || new Date().getUTCFullYear()

  // O sorteio do código pode colidir com um já existente — raro, mas a
  // tentativa seguinte resolve. Não confere de novo depois de criar: o
  // índice único da coluna (site) é quem garante isto de verdade.
  let codigo: string | null = null
  for (let tentativa = 0; tentativa < 5 && !codigo; tentativa++) {
    const candidato = gerarCodigoDeEvento(nome, ano)
    if (!(await repo.eventoPorCodigo(candidato))) codigo = candidato
  }
  if (!codigo) return { erro: 'Não conseguimos gerar um código para este evento. Tente de novo.' }

  const evento = await repo.criarEvento({
    nome,
    descricao: dados.descricao?.trim() || null,
    local: dados.local?.trim() || null,
    dataInicio: dados.dataInicio,
    dataFim: dados.dataFim,
    organizacaoId,
    janela_entrada_inicio: dados.janelaEntradaInicio ?? null,
    janela_entrada_fim: dados.janelaEntradaFim ?? null,
    janela_fim_inicio: dados.janelaFimInicio ?? null,
    janela_fim_fim: dados.janelaFimFim ?? null,
    codigoConvite: codigo,
  })

  return { eventoId: evento.id }
}

function paraPortaria(estado: EstadoDaPortaria, siteUrl: string): Portaria {
  return {
    aberta: estado.aberta,
    endereco: estado.token ? `${siteUrl}/portaria/${estado.token}` : null,
    cadastrados: estado.cadastrados,
  }
}

/**
 * A tela do evento por dentro: números do dia, portaria e a lista de
 * setores — tudo que `evento/[id]/index.tsx` mostra numa chamada só.
 *
 * `diaPedido` é o dia que a pessoa escolheu no seletor "Dia" — mesmo
 * parâmetro do site (`?dia=`). Copiado de `app/admin/eventos/[id]/page.tsx`,
 * 13/09/2026.
 */
export async function eventoDetalhado(
  repo: Repositorio, pessoaId: string, eventoId: string, siteUrl: string, diaPedido?: string,
): Promise<EventoDetalhado> {
  const { evento } = await exigirAcessoAoEvento(repo, pessoaId, eventoId)

  const [dias, setoresRepo, estadoDaPortaria] = await Promise.all([
    repo.diasDoEvento(eventoId),
    repo.setoresDoEvento(eventoId),
    repo.portariaDoEvento(eventoId),
  ])

  const totalPessoas = setoresRepo.reduce((a, s) => a + s.pessoas, 0)

  const setores: SetorDetalhado[] = setoresRepo.map(s => setorParaDetalhe(s, siteUrl))

  /*
   * OS NÚMEROS SÃO DE UM DIA, não do evento inteiro — mesma correção que o
   * site fez: somar tudo fazia uma entrada esquecida na montagem deixar a
   * pessoa "presente" para sempre, numa operação de vários dias.
   *
   * Hoje, quando hoje é dia de operação; senão o último que já passou (o
   * mais provável de se querer conferir) ou, antes de o evento começar, o
   * primeiro.
   */
  const diasDaOperacao = dias.map(d => d.data)
  const hoje = diaBRT()
  const diaEscolhido =
    (diaPedido && diasDaOperacao.includes(diaPedido) ? diaPedido : null)
    ?? (diasDaOperacao.includes(hoje) ? hoje : null)
    ?? [...diasDaOperacao].reverse().find(d => d <= hoje)
    ?? diasDaOperacao[0]
    ?? hoje

  const registrosDoDia = await repo.registrosDoEventoNoDia(eventoId, diaEscolhido)
  const quemFez = (tipo: 'entrada' | 'meio' | 'fim') =>
    new Set(registrosDoDia.filter(r => r.tipo === tipo).map(r => r.participacaoId))
  const entraram = quemFez('entrada')
  const sairam = quemFez('fim')
  const totEntrada = entraram.size
  const totMeio = quemFez('meio').size
  const totFim = sairam.size
  const presentesAgora = [...entraram].filter(id => !sairam.has(id)).length
  const pct = (v: number) => (totalPessoas > 0 ? Math.round((v / totalPessoas) * 100) : 0)

  return {
    eventoId: evento.id,
    nome: evento.nome,
    ativo: evento.ativo,
    local: evento.local,
    dataInicio: evento.dataInicio ?? '',
    dataFim: evento.dataFim,
    diasDePreparacao: dias.filter(d => d.tipo === 'preparacao').length,
    diasDaOperacao,
    diaEscolhido,
    indicadores: [
      { chave: 'funcionarios_do_evento', rotulo: 'Funcionários do evento', valor: totalPessoas, tom: 'acento' },
      { chave: 'presentes_no_momento', rotulo: 'Presentes no momento', valor: presentesAgora, tom: 'sucesso' },
      {
        chave: 'entradas_hoje', rotulo: 'Entradas hoje', valor: `${totEntrada}/${totalPessoas}`,
        sub: `${pct(totEntrada)}% da equipe`, tom: 'acento',
      },
      {
        chave: 'batida_do_meio_hoje', rotulo: 'Batida do meio hoje', valor: `${totMeio}/${totalPessoas}`,
        sub: `${pct(totMeio)}% da equipe`, tom: 'info',
      },
      {
        chave: 'saidas_hoje', rotulo: 'Saídas hoje', valor: `${totFim}/${totalPessoas}`,
        sub: `${pct(totFim)}% da equipe`, tom: 'aviso',
      },
    ],
    portaria: paraPortaria(estadoDaPortaria ?? { aberta: false, token: null, cadastrados: 0 }, siteUrl),
    cadastroSuspenso: evento.cadastroSuspenso === true,
    setores,
    totalPessoas,
  }
}

/**
 * Suspende/reabre o cadastro por link do evento INTEIRO — cópia do site's
 * `alternarCadastroPorLink`. Os links dos setores e o cartaz da portaria
 * continuam os mesmos; só passam a recusar cadastro novo enquanto suspenso.
 */
export async function alternarCadastroPorLink(
  repo: Repositorio, pessoaId: string, eventoId: string, suspenso: boolean,
): Promise<{ erro?: string }> {
  const { evento } = await exigirAcessoAoEvento(repo, pessoaId, eventoId)
  await repo.alternarCadastroPorLink(evento.id, suspenso)
  return {}
}

/**
 * Reabre o cadastro de UM setor por 48 horas, sem religar o link geral do
 * evento nem o do setor (`alternarLinkDoSetor`) — a exceção que o master
 * usa quando alguém precisa entrar depois de a lista ter fechado. Cópia do
 * site's `criarLinkCadastroIndividual`. Só o master: um admin da própria
 * organização não pode conceder uma exceção à decisão que ELE MESMO tomou
 * ao suspender o cadastro.
 *
 * O link aponta para o FORMULÁRIO DO SITE (`/form/:token?individual=...`) —
 * quem preenche não é este app, é a pessoa sendo credenciada, no navegador
 * dela. `gerarToken` é injetado (mesmo padrão de `novoToken`, em
 * `principal.ts`) para o teste poder travar o valor.
 */
export async function criarLinkCadastroIndividual(
  repo: Repositorio, pessoaId: string, eventoId: string, setorId: string, siteUrl: string, gerarToken: () => string,
): Promise<{ link?: string; expiraEm?: string; setorNome?: string; eventoNome?: string; erro?: string }> {
  const perfil = await repo.perfilPorId(pessoaId)
  if (!perfil || !ehMaster(perfil.papel)) {
    throw new Error('Só o acesso master pode reabrir um cadastro individual.')
  }

  const evento = await repo.eventoPorId(eventoId)
  if (!evento) throw new Error('Não encontramos este evento.')

  const [setor] = (await repo.setoresDoEvento(eventoId)).filter(s => s.setorId === setorId)
  if (!setor || !setor.token) return { erro: 'Setor não encontrado neste evento.' }

  const token = gerarToken()
  const expiraEm = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
  await repo.salvarAutorizacaoIndividual(setor.setorId, evento.id, token, expiraEm)

  await repo.registrarAuditoria({
    autorId: pessoaId, autorNome: perfil.nome, acao: 'REABERTURA_CADASTRO_INDIVIDUAL',
    campoAlterado: `Cadastro individual — ${setor.nome}`, valorNovo: 'Reaberto por 48h',
    eventoId: evento.id, organizacaoId: evento.organizacaoId ?? undefined,
  })

  return {
    link: `${siteUrl}/form/${setor.token}?individual=${encodeURIComponent(token)}`,
    expiraEm,
    setorNome: setor.nome,
    eventoNome: evento.nome,
  }
}

/**
 * Liga/desliga o cartaz da portaria.
 *
 * Abrir pela primeira vez sorteia o token; fechar NÃO o apaga — o mesmo
 * cartaz já impresso volta a funcionar se a portaria for reaberta depois.
 * Ver `docs/decisoes/` / o comentário de `criarSetor` sobre o site.
 */
export async function alternarPortaria(
  repo: Repositorio, pessoaId: string, eventoId: string, aberta: boolean, siteUrl: string, novoToken: () => string,
): Promise<{ portaria?: Portaria; erro?: string }> {
  const { evento } = await exigirAcessoAoEvento(repo, pessoaId, eventoId)

  const atual = await repo.portariaDoEvento(evento.id)
  const token = atual?.token ?? (aberta ? novoToken() : null)
  await repo.definirPortaria(evento.id, { aberta, token })

  const novo = await repo.portariaDoEvento(evento.id)
  return { portaria: paraPortaria(novo ?? { aberta, token, cadastrados: 0 }, siteUrl) }
}

/** Troca o token da portaria — invalida todo cartaz já impresso. */
export async function trocarTokenDaPortaria(
  repo: Repositorio, pessoaId: string, eventoId: string, siteUrl: string, novoToken: () => string,
): Promise<{ portaria?: Portaria; erro?: string }> {
  const { evento } = await exigirAcessoAoEvento(repo, pessoaId, eventoId)

  const atual = await repo.portariaDoEvento(evento.id)
  const token = novoToken()
  await repo.definirPortaria(evento.id, { aberta: atual?.aberta ?? false, token })

  const novo = await repo.portariaDoEvento(evento.id)
  return { portaria: paraPortaria(novo ?? { aberta: false, token, cadastrados: 0 }, siteUrl) }
}

/**
 * Cria um setor (fornecedor) do evento, com o supervisor no mesmo formulário.
 *
 * Trazido do site em 04/09: antes disso um setor podia nascer sem ninguém
 * respondendo por ele, com o link de cadastro aberto e sem supervisão — a
 * mudança fechou isso, exigindo o supervisor no mesmo passo.
 */
export async function criarSetor(
  repo: Repositorio, pessoaId: string, eventoId: string,
  dados: {
    nome: string
    valorPorPessoa: number | null
    exigeMeio: boolean
    supervisor: { nome: string; cpf: string; telefone: string }
  },
  siteUrl: string,
): Promise<{ setor?: SetorDetalhado; erro?: string }> {
  const { perfil, evento } = await exigirAcessoAoEvento(repo, pessoaId, eventoId)

  const nome = (dados.nome ?? '').trim()
  if (nome.length < 2) return { erro: 'Dê um nome ao setor.' }

  const supNome = (dados.supervisor?.nome ?? '').trim()
  const supCpf = (dados.supervisor?.cpf ?? '').replace(/\D/g, '')
  const supTelefone = (dados.supervisor?.telefone ?? '').replace(/\D/g, '')
  if (supNome.length < 3) return { erro: 'Digite o nome completo do supervisor.' }
  if (supCpf.length !== 11) return { erro: 'O CPF do supervisor precisa ter 11 dígitos.' }
  if (supTelefone.length < 10) return { erro: 'Digite o WhatsApp do supervisor, com DDD.' }

  /*
   * A validação vem ANTES de criar o setor de propósito: falhar depois
   * obrigaria desfazer a criação por algo tão trivial quanto um campo em
   * branco. O que resta depois disto só falha por uma REGRA (CPF já é de
   * outro papel, ou de outra organização), e aí sim o setor já criado
   * precisa ser desfeito — ver abaixo.
   */
  const setor = await repo.criarSetor({
    eventoId: evento.id,
    nome,
    valorPorPessoa: dados.valorPorPessoa,
    exigeMeio: dados.exigeMeio === true,
  })

  try {
    const existente = await repo.acessoPorCpf(supCpf)
    if (existente) {
      if (existente.papel !== 'supervisor') {
        throw new Error('Este CPF já pertence a outro tipo de acesso no sistema.')
      }
      if (!ehMaster(perfil.papel) && existente.organizacaoId !== evento.organizacaoId) {
        throw new Error('Este CPF já está cadastrado em outra organização.')
      }
      // "Este setor entra nos dela" — sem criar login novo. Ver o comentário
      // de `reatribuirSupervisorAoSetor` no repositório.
      await repo.reatribuirSupervisorAoSetor(existente.id, setor.setorId)
    } else {
      await repo.criarAcesso({
        nome: supNome,
        cpf: supCpf,
        telefone: supTelefone,
        papel: 'supervisor',
        organizacaoId: evento.organizacaoId,
        ativo: true,
        setorId: setor.setorId,
        permissoesUsuario: {},
      })
    }
  } catch (e) {
    // "Melhor não existir do que existir sem responsável" — mesma frase do
    // site: um setor sem supervisor ficaria com o link de cadastro aberto e
    // ninguém para revisar quem entra.
    await repo.excluirSetor(setor.setorId)
    return { erro: e instanceof Error ? e.message : 'Não foi possível criar o setor.' }
  }

  const [criado] = (await repo.setoresDoEvento(evento.id)).filter(s => s.setorId === setor.setorId)
  return {
    setor: criado
      ? setorParaDetalhe(criado, siteUrl)
      : {
          setorId: setor.setorId,
          nome: setor.nome,
          pessoas: 0,
          valorPorPessoa: dados.valorPorPessoa,
          linkDoFormulario: setor.token ? `${siteUrl}/form/${setor.token}` : '',
          linkAtivo: true,
          exigeMeio: dados.exigeMeio === true,
          supervisores: [],
        },
  }
}

/**
 * Muda nome, valor por pessoa e se este setor pede o meio — cópia do site's
 * `editarFornecedor`. Ligar/desligar o meio aqui reaproveita a mesma coluna
 * que `salvarConfiguracaoDoMeio` também escreve; o efeito nos agendamentos de
 * WhatsApp que o site tem (`sincronizarAgendamentos`) não existe neste app
 * ainda — não há fila de lembretes por aqui (ver `docs/backlog.md`).
 */
export async function editarSetor(
  repo: Repositorio, pessoaId: string, setorId: string,
  dados: { nome: string; valorPorPessoa: number | null; exigeMeio: boolean },
  siteUrl: string,
): Promise<{ setor?: SetorDetalhado; erro?: string }> {
  const { evento } = await exigirAcessoAoSetor(repo, pessoaId, setorId)

  const nome = (dados.nome ?? '').trim()
  if (nome.length < 2) return { erro: 'Dê um nome ao setor.' }

  await repo.atualizarSetor(setorId, { nome, valorPorPessoa: dados.valorPorPessoa, exigeMeio: dados.exigeMeio === true })

  const [atualizado] = (await repo.setoresDoEvento(evento.id)).filter(s => s.setorId === setorId)
  if (!atualizado) return { erro: 'Não encontramos este setor.' }
  return { setor: setorParaDetalhe(atualizado, siteUrl) }
}

/**
 * Liga/desliga o link de cadastro DESTE setor — cópia do site's
 * `alternarLinkDoSetor`. O interruptor da portaria (`alternarPortaria`) fecha
 * tudo de uma vez; este fecha só o setor, no card dele.
 */
export async function alternarLinkDoSetor(
  repo: Repositorio, pessoaId: string, setorId: string, ativo: boolean,
): Promise<{ erro?: string }> {
  await exigirAcessoAoSetor(repo, pessoaId, setorId)
  await repo.alternarLinkDoSetor(setorId, ativo)
  return {}
}

/**
 * Apaga o setor — cópia do site's `deletarFornecedor`. Só o master exclui: os
 * demais encerram o evento, que resolve sem destruir dado nenhum. Recusa
 * quando há supervisor vinculado — teriam que ser realocados ou removidos
 * primeiro, senão o login deles fica apontando para um setor que sumiu.
 */
export async function excluirSetor(
  repo: Repositorio, pessoaId: string, setorId: string,
): Promise<{ erro?: string }> {
  const { perfil, evento } = await exigirAcessoAoSetor(repo, pessoaId, setorId)
  if (!podeExcluir(perfil.papel)) {
    return { erro: 'Apenas o master pode excluir. Você pode desativar, que é reversível.' }
  }

  const [atual] = (await repo.setoresDoEvento(evento.id)).filter(s => s.setorId === setorId)
  if (atual && atual.supervisores.length > 0) {
    return { erro: 'Este setor tem supervisores vinculados. Exclua ou realoque os supervisores antes de excluir o setor.' }
  }

  await repo.excluirSetor(setorId)
  return {}
}

/**
 * Adiciona um supervisor a um setor QUE JÁ EXISTE — a mesma regra de CPF de
 * `criarSetor` (reaproveita login se a pessoa já supervisiona algo; recusa
 * CPF de outro papel ou de outra organização), só que sem criar setor
 * nenhum. Cópia do site's `criarSupervisor` chamado a partir do card do
 * setor (`SupervisorModal`, modo "criar").
 */
export async function adicionarSupervisor(
  repo: Repositorio, pessoaId: string, setorId: string,
  dados: { nome: string; cpf: string; telefone: string },
): Promise<{ erro?: string }> {
  const { perfil, evento } = await exigirAcessoAoSetor(repo, pessoaId, setorId)

  const nome = (dados.nome ?? '').trim()
  const cpf = (dados.cpf ?? '').replace(/\D/g, '')
  const telefone = (dados.telefone ?? '').replace(/\D/g, '')
  if (nome.length < 3) return { erro: 'Digite o nome completo do supervisor.' }
  if (cpf.length !== 11) return { erro: 'O CPF do supervisor precisa ter 11 dígitos.' }
  if (telefone.length < 10) return { erro: 'Digite o WhatsApp do supervisor, com DDD.' }

  const setor = await repo.setorPorId(setorId)
  const nomeDoSetor = setor?.nome ?? ''

  const existente = await repo.acessoPorCpf(cpf)
  if (existente) {
    if (existente.papel !== 'supervisor') return { erro: 'Este CPF já pertence a outro tipo de acesso no sistema.' }
    if (!ehMaster(perfil.papel) && existente.organizacaoId !== evento.organizacaoId) {
      return { erro: 'Este CPF já está cadastrado em outra organização.' }
    }
    // "Este setor entra nos dela" — sem criar login novo, mesmo comentário de `criarSetor`.
    await repo.reatribuirSupervisorAoSetor(existente.id, setorId)
    await repo.registrarAuditoria({
      autorId: pessoaId, autorNome: perfil.nome, acao: 'ALTERACAO_SUPERVISOR',
      campoAlterado: `Supervisor do setor ${nomeDoSetor}`,
      valorNovo: `${nome} — CPF ${formatCpf(cpf)} (já era supervisor, ganhou mais este setor)`,
      eventoId: evento.id, organizacaoId: evento.organizacaoId ?? undefined,
    })
    return {}
  }

  await repo.criarAcesso({
    nome, cpf, telefone, papel: 'supervisor', organizacaoId: evento.organizacaoId,
    ativo: true, setorId, permissoesUsuario: {},
  })
  await repo.registrarAuditoria({
    autorId: pessoaId, autorNome: perfil.nome, acao: 'ALTERACAO_SUPERVISOR',
    campoAlterado: `Supervisor do setor ${nomeDoSetor}`,
    valorNovo: `${nome} — CPF ${formatCpf(cpf)} (acesso novo)`,
    eventoId: evento.id, organizacaoId: evento.organizacaoId ?? undefined,
  })
  return {}
}
