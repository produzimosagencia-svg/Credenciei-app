// As sete visões de "quem fez, quem não fez" — a mesma pergunta de
// `/admin/atividades` e da tela de Presença dentro do evento, no site.
//
// ─── UMA CONSULTA, SETE FILTROS ─────────────────────────────────────────────
//
// `linhasDoEventoNoDia` traz a equipe inteira do dia (feito ou não, ativo ou
// não), e é este arquivo quem decide o que cada visão mostra — a mesma
// separação de `linhasDaVisao`/`pendenciasDoDia` no site, só que lá são duas
// consultas por causa das duas telas (Atividades e Presença) que a
// compartilham; aqui é uma rota só.
//
// ─── AS DUAS CHAVES DO MEIO ──────────────────────────────────────────────────
//
// "Não fizeram o meio" só cobra quem tem as DUAS chaves ligadas: o SETOR
// pede o meio (`LinhaDoDia.exigeMeio`, nasce desligado) E o DIA pede o meio
// (`DiaDeTrabalho.exigeMeio`, nasce ligado). As duas nascem em polaridades
// diferentes de propósito — ver o comentário em `repositorio.ts`.
//
// ─── PENDÊNCIA SÓ DEPOIS DA HORA ─────────────────────────────────────────────
//
// "Ainda não chegaram" só cobra depois do horário esperado (`horariosEsperados`)
// já ter passado — antes disso é gente que ainda vai chegar, não pendência.
// Contar cedo demais já produziu "587 não chegaram" de uma equipe de 679 que
// nem estava escalada para aquele dia (comentário original em
// `lib/pendencias.ts`, no site).

import {
  diaBRT, ehMaster, horariosEsperados, janelaDoMeio, podeAcompanhar, type DiaDaJornada,
} from '@credenciei/dominio'
import type { AtividadesDoEvento, EventoEscaneavel, LinhaPresenca, VisaoDeAtividade } from '@credenciei/contrato'
import { VISOES_DE_ATIVIDADE } from '@credenciei/contrato'
import type { BatidaResumida, DiaDeTrabalho, Evento, LinhaDoDia, Perfil, Repositorio } from '../dados/repositorio.js'

async function exigirPodeAcompanhar(repo: Repositorio, pessoaId: string): Promise<Perfil> {
  const perfil = await repo.perfilPorId(pessoaId)
  if (!perfil || !podeAcompanhar(perfil.papel)) throw new Error('Você não tem permissão para acompanhar o evento.')
  return perfil
}

/**
 * O acesso de quem pergunta a ESTE evento — e, para o supervisor, a qual
 * equipe o recorte fica preso. `undefined` = o evento inteiro (master, ou
 * quem gerencia a organização dona dele).
 */
async function equipeDoAcesso(repo: Repositorio, perfil: Perfil, evento: Evento): Promise<string | undefined> {
  if (ehMaster(perfil.papel)) return undefined
  if (perfil.papel === 'supervisor') {
    const equipe = await repo.equipeDoSupervisor(perfil.id)
    if (!equipe || equipe.eventoId !== evento.id) throw new Error('Você não tem acesso a este evento.')
    return equipe.id
  }
  if (!perfil.organizacaoId || perfil.organizacaoId !== evento.organizacaoId) {
    throw new Error('Você não tem acesso a este evento.')
  }
  return undefined
}

export async function eventosParaAcompanhar(repo: Repositorio, pessoaId: string): Promise<EventoEscaneavel[]> {
  const perfil = await exigirPodeAcompanhar(repo, pessoaId)

  const todos = ehMaster(perfil.papel)
    ? await repo.eventosComContagens({})
    : perfil.papel === 'supervisor'
      ? await (async () => {
          const equipe = await repo.equipeDoSupervisor(pessoaId)
          return equipe ? repo.eventosComContagens({ eventoId: equipe.eventoId }) : []
        })()
      : await repo.eventosComContagens({ organizacaoId: perfil.organizacaoId })

  return todos.filter(e => e.ativo).map(e => ({ eventoId: e.id, nome: e.nome }))
}

const paraLinha = (l: LinhaDoDia, batida: BatidaResumida | null): LinhaPresenca => ({
  id: l.participacaoId, nome: l.nome, cpf: l.cpf, setor: l.setorNome, em: batida?.em ?? null, manual: batida?.manual ?? false,
})

/** Feito/presentes: hora primeiro, nome só para desempatar ou quando falta hora dos dois lados. */
const ordenarPorHora = (linhas: LinhaPresenca[]) =>
  [...linhas].sort((a, b) => (a.em && b.em ? a.em.localeCompare(b.em) : a.nome.localeCompare(b.nome, 'pt-BR')))

/** Pendência: sempre por nome — não há hora realizada para a etapa que falta. */
const ordenarPorNome = (linhas: LinhaPresenca[]) => [...linhas].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))

function linhasDaVisao(
  todos: LinhaDoDia[],
  visao: VisaoDeAtividade,
  evento: Evento,
  dia: string,
  diaDeTrabalho: DiaDeTrabalho | null,
  agora: Date,
): { linhas: LinhaPresenca[]; colunaHora: string } {
  if (visao === 'presentes') {
    const linhas = todos.flatMap(l => (l.entrada && !l.fim ? [paraLinha(l, l.entrada)] : []))
    return { linhas: ordenarPorHora(linhas), colunaHora: 'Entrou às' }
  }

  if (visao === 'entrada' || visao === 'meio' || visao === 'fim') {
    const linhas = todos.flatMap(l => (l[visao] ? [paraLinha(l, l[visao])] : []))
    return { linhas: ordenarPorHora(linhas), colunaHora: 'Registrou às' }
  }

  // Sem pendência de entrada não há "entrou às" para mostrar — só nas outras duas.
  const colunaHora = visao === 'faltam' ? '' : 'Entrou às'

  // Dia não marcado, ou cancelado: ninguém era esperado, ninguém faltou.
  if (!diaDeTrabalho || diaDeTrabalho.cancelado) return { linhas: [], colunaHora }

  const esperados = horariosEsperados(evento, dia, diaDeTrabalho as DiaDaJornada)
  const agoraMs = agora.getTime()

  /*
   * "Previsto para trabalhar" é quem está ATIVO e ainda credenciado. Quem se
   * cadastrou mas não foi ativado, ou já foi descredenciado, não é cobrado de
   * nada — regularizar ponto de quem não vai (mais) trabalhar não é o caso de
   * uso, e listaria gente que o supervisor não deveria caçar.
   */
  const elegiveis = todos.filter(l => l.ativo && !l.descredenciadoEm)

  if (visao === 'faltam') {
    const linhas = elegiveis
      .filter(l => !l.entrada && agoraMs > new Date(esperados.entradaLimite).getTime())
      .map(l => paraLinha(l, null))
    return { linhas: ordenarPorNome(linhas), colunaHora }
  }

  // As duas seguintes só existem para quem entrou — cobrar de quem nunca
  // chegou seria contar a mesma ausência de novo, escondendo a que importa.
  const entraram = elegiveis.filter(l => l.entrada)

  if (visao === 'sem_meio') {
    /*
     * Meio: horário INDIVIDUAL, sempre entrada + 4h — nunca um horário fixo
     * do evento (o produtor não configura mais isso em lugar nenhum). Só
     * entra quem tem as DUAS chaves ligadas: o setor e o dia.
     */
    if (!diaDeTrabalho.exigeMeio) return { linhas: [], colunaHora }
    const linhas = entraram
      .filter(l => l.exigeMeio && !l.meio)
      .filter(l => {
        const j = janelaDoMeio(evento, diaDeTrabalho as DiaDaJornada, l.entrada!.em)
        return j && agoraMs > new Date(j.fim).getTime()
      })
      .map(l => paraLinha(l, l.entrada))
    return { linhas: ordenarPorNome(linhas), colunaHora }
  }

  // sem_saida: entrou e não descredenciou.
  const linhas = entraram
    .filter(l => !l.fim && agoraMs > new Date(esperados.fimLimite).getTime())
    .map(l => paraLinha(l, l.entrada))
  return { linhas: ordenarPorNome(linhas), colunaHora }
}

export async function atividades(
  repo: Repositorio,
  pessoaId: string,
  eventoId: string,
  opcoes: { visao?: VisaoDeAtividade; dia?: string } = {},
  agora: Date = new Date(),
): Promise<AtividadesDoEvento> {
  const perfil = await exigirPodeAcompanhar(repo, pessoaId)
  const evento = await repo.eventoPorId(eventoId)
  if (!evento) throw new Error('Evento não encontrado.')
  const equipeId = await equipeDoAcesso(repo, perfil, evento)

  const visao: VisaoDeAtividade = opcoes.visao && opcoes.visao in VISOES_DE_ATIVIDADE ? opcoes.visao : 'entrada'

  const diasDoEvento = await repo.diasDoEvento(eventoId)
  const dias = diasDoEvento.map(d => d.data).sort()
  const hoje = diaBRT(agora)

  /*
   * Mesma régua de fallback do site: o dia pedido se existir, senão hoje se
   * for dia de operação, senão o último dia já passado, senão o primeiro.
   */
  const diaEscolhido =
    (opcoes.dia && dias.includes(opcoes.dia) ? opcoes.dia : null)
    ?? (dias.includes(hoje) ? hoje : null)
    ?? [...dias].reverse().find(d => d <= hoje)
    ?? dias[0]
    ?? hoje

  const diaDeTrabalho = diasDoEvento.find(d => d.data === diaEscolhido) ?? null
  const todos = await repo.linhasDoEventoNoDia(eventoId, diaEscolhido, equipeId)

  const linhasDe = (v: VisaoDeAtividade) => linhasDaVisao(todos, v, evento, diaEscolhido, diaDeTrabalho, agora)
  const { linhas, colunaHora } = linhasDe(visao)

  const numeros = {
    presentes: linhasDe('presentes').linhas.length,
    entradas: linhasDe('entrada').linhas.length,
    saidas: linhasDe('fim').linhas.length,
    pendencias: linhasDe('faltam').linhas.length + linhasDe('sem_meio').linhas.length + linhasDe('sem_saida').linhas.length,
  }

  return { eventoId, eventoNome: evento.nome, dias, diaEscolhido, hoje, numeros, linhas, colunaHora }
}
