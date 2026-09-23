// Autoatendimento sobre a própria conta — excluir e baixar meus dados.

import { diaBRT } from '@credenciei/dominio'
import type { ArquivoDePlanilha } from '@credenciei/contrato'
import type { Repositorio } from '../dados/repositorio.js'
import type { Sessoes } from '../sessoes.js'
import type { Arquivos } from '../arquivos.js'

/**
 * "Excluir minha conta" — decidido com o Juan em 21/09/2026 (LGPD, direito
 * ao esquecimento). Anonimiza nome, telefone e foto; NÃO apaga batidas,
 * valor a receber nem chave PIX — histórico de ponto e pagamento sobrevive
 * por obrigação trabalhista (CLT), e sem a chave PIX um valor ainda
 * pendente ficaria impossível de pagar. Ver `Repositorio.excluirMinhaConta`
 * para o detalhe de o que é e não é tocado.
 *
 * Derruba toda sessão da pessoa, em qualquer aparelho, depois de
 * anonimizar — não faria sentido continuar logado com o cadastro já
 * apagado.
 */
export async function excluirMinhaConta(
  repo: Repositorio, sessoes: Sessoes, pessoaId: string,
): Promise<{ erro?: string }> {
  await repo.excluirMinhaConta(pessoaId)
  await sessoes.encerrarTodasDaPessoa(pessoaId)
  return {}
}

/**
 * "Baixar meus dados" — LGPD, direito de acesso/portabilidade. Decidido
 * com o Juan em 22/09/2026: um arquivo com tudo que o sistema sabe sobre
 * a pessoa, em formato estruturado (JSON) — o que a lei pede pra
 * portabilidade é "formato de uso comum e leitura de máquina", não um
 * relatório bonito.
 *
 * LIMITE CONHECIDO: não inclui a foto de perfil em si (só o caminho dela)
 * nem contestações já RESOLVIDAS (o tipo `Contestacao` não carrega esse
 * status hoje) — as duas ficam pra uma rodada futura, se algum dia
 * pedirem de verdade. O que está aqui é o núcleo: identidade, todo
 * evento em que trabalhou, toda batida, toda contestação em aberto,
 * todo aviso recebido, e as preferências de notificação.
 */
export async function meusDados(
  repo: Repositorio, arquivos: Arquivos, pessoaId: string, agora: Date = new Date(),
): Promise<ArquivoDePlanilha> {
  const pessoa = await repo.pessoaPorId(pessoaId)
  if (!pessoa) throw new Error('Pessoa não encontrada.')

  const participacoes = await repo.participacoesDaPessoa(pessoaId)
  const ids = participacoes.map(p => p.id)
  const [registros, contestacoes, notificacoes, tiposDesligados, aparelhos] = await Promise.all([
    repo.registrosDeParticipacoes(ids),
    repo.contestacoesAbertasDeParticipacoes(ids),
    repo.notificacoesDaPessoa(pessoaId),
    repo.tiposDesligados(pessoaId),
    repo.tokensDePush(pessoaId),
  ])

  const agrupar = <T extends { participacaoId: string }>(itens: T[]): Map<string, T[]> => {
    const mapa = new Map<string, T[]>()
    for (const item of itens) {
      const lista = mapa.get(item.participacaoId) ?? []
      lista.push(item)
      mapa.set(item.participacaoId, lista)
    }
    return mapa
  }
  const registrosPorParticipacao = agrupar(registros)
  const contestacoesPorParticipacao = agrupar(contestacoes)

  const eventosPorId = new Map<string, { nome: string; local: string | null; dataInicio: string | null }>()
  for (const p of participacoes) {
    if (eventosPorId.has(p.eventoId)) continue
    const evento = await repo.eventoPorId(p.eventoId)
    if (evento) eventosPorId.set(p.eventoId, { nome: evento.nome, local: evento.local, dataInicio: evento.dataInicio })
  }

  const dados = {
    geradoEm: agora.toISOString(),
    pessoa: { nome: pessoa.nome, cpf: pessoa.cpf, telefone: pessoa.telefone },
    participacoes: participacoes.map(p => ({
      evento: eventosPorId.get(p.eventoId)?.nome ?? null,
      local: eventosPorId.get(p.eventoId)?.local ?? null,
      dataInicio: eventosPorId.get(p.eventoId)?.dataInicio ?? null,
      funcao: p.funcao,
      situacao: p.descredenciadoEm ? 'descredenciado' : p.ativo ? 'credenciado' : 'aguardando_aprovacao',
      cidade: p.cidade,
      valorReceber: p.valorReceber,
      pago: p.pago,
      pagoEm: p.pagoEm,
      chavePix: p.chavePix ?? null,
      registros: (registrosPorParticipacao.get(p.id) ?? []).map(r => ({
        tipo: r.tipo, dataRef: r.dataRef, registradoEm: r.registradoEm, manual: r.manual,
      })),
      contestacoesEmAberto: (contestacoesPorParticipacao.get(p.id) ?? []).map(c => ({
        tipo: c.tipo, dataRef: c.dataRef, motivo: c.motivo, criadoEm: c.criadoEm,
      })),
    })),
    avisosRecebidos: notificacoes.map(n => ({
      tipo: n.tipo, titulo: n.titulo, corpo: n.corpo, criadoEm: n.criadoEm, lida: n.lida,
    })),
    preferenciasDeAvisoDesligadas: tiposDesligados,
    aparelhosComNotificacaoRegistrada: aparelhos.map(a => ({ plataforma: a.plataforma })),
  }

  const bytes = Buffer.from(JSON.stringify(dados, null, 2), 'utf-8')
  const nome = `meus-dados-${diaBRT(agora)}.json`
  // Caminho com um id aleatório, não o pessoaId (que embute o CPF) — o
  // link já é protegido por token opaco e validade curta, mas o CAMINHO
  // em si não devia carregar o CPF de ninguém.
  const url = await arquivos.guardar(`dados-pessoais/${crypto.randomUUID()}/${nome}`, 'application/json', bytes)
  return { nome, url }
}
