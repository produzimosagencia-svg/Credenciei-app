// O Painel — a tela inicial de quem tem conta.
//
// ─── O RECORTE É DAQUI, NUNCA DA TELA ───────────────────────────────────────
//
// O master vê todas as organizações. Quem gerencia evento (admin, gerente,
// cliente), operador de portão e suporte veem só a própria organização — a
// mesma regra de isolamento que separa setores, um nível acima. O supervisor
// vê só o PRÓPRIO evento, o que `equipeDoSupervisor` resolve. Só o
// colaborador não tem painel — ele não é `Perfil`, e a busca por ele aqui
// nem encontra nada.
//
// Copiado de `app/admin/page.tsx`, sem a paginação de eventos encerrados e
// sem o gráfico por hora — o app não tem tela para nenhum dos dois (ver o
// tipo `Painel`, no contrato). O que sobra é a mesma conta.

import { ehMaster, formatarBR, janelaDeOperacaoDoEvento } from '@credenciei/dominio'
import type { AtividadeRecente, EventoDoPainel, IndicadorDoPainel, Painel } from '@credenciei/contrato'
import type { EventoComContagens, Repositorio } from '../dados/repositorio.js'

export async function painel(
  repo: Repositorio,
  pessoaId: string,
  agora: Date = new Date(),
): Promise<Painel> {
  const perfil = await repo.perfilPorId(pessoaId)
  if (!perfil) throw new Error('Você não tem acesso ao painel.')

  /*
   * O supervisor cuida de UM evento — o que `equipeDoSupervisor` devolve.
   * Sem equipe vinculada, a lista vem vazia (a tela "sem setor" é outra
   * história, ainda não portada — ver `docs/backlog.md`).
   */
  const todos: EventoComContagens[] = ehMaster(perfil.papel)
    ? await repo.eventosComContagens({})
    : perfil.papel === 'supervisor'
      ? await (async () => {
          const equipe = await repo.equipeDoSupervisor(pessoaId)
          return equipe ? repo.eventosComContagens({ eventoId: equipe.eventoId }) : []
        })()
      : await repo.eventosComContagens({ organizacaoId: perfil.organizacaoId })

  const ordenados = [...todos].sort((a, b) => (b.dataInicio ?? '').localeCompare(a.dataInicio ?? ''))
  const ativos = ordenados.filter(e => e.ativo)
  const total = ordenados.length

  /*
   * A JANELA é a do evento de referência: o ativo mais recente, ou — sem
   * nenhum ativo — o último que existiu. Assim o painel continua contando a
   * última operação em vez de esvaziar quando o evento é encerrado.
   */
  const eventoDeReferencia = ativos[0] ?? ordenados[0] ?? null
  const eventoCompleto = eventoDeReferencia ? await repo.eventoPorId(eventoDeReferencia.id) : null
  const janela = janelaDeOperacaoDoEvento(eventoCompleto)

  const registrosDaJanela = janela && eventoDeReferencia
    ? await repo.registrosEntrePeriodo(eventoDeReferencia.id, janela.de, janela.ate)
    : []

  /*
   * Números do topo. Olham só para os eventos ATIVOS: somar o que já
   * encerrou misturaria o que acabou com o que está acontecendo agora.
   */
  const equipeEsperada = ativos.reduce((a, e) => a + e.equipe, 0)
  const presentes = ativos.reduce((a, e) => a + e.presentes, 0)
  const batidas = registrosDaJanela.length

  const indicadores: IndicadorDoPainel[] = [
    {
      chave: 'eventos_ativos',
      rotulo: 'Eventos ativos',
      valor: ativos.length,
      sub: `de ${total} no total`,
      tom: 'acento',
    },
    {
      chave: 'presentes',
      rotulo: 'Presentes agora',
      valor: presentes,
      sub: equipeEsperada ? `de ${equipeEsperada} na equipe` : 'equipe não cadastrada',
      tom: 'sucesso',
    },
    {
      chave: 'nao_chegaram',
      rotulo: 'Ainda não chegaram',
      valor: Math.max(0, equipeEsperada - presentes),
      tom: 'aviso',
    },
    {
      chave: 'batidas',
      rotulo: 'Batidas na janela',
      valor: batidas,
      sub: janela ? 'entrada, meio e saída' : 'sem janela definida',
      tom: 'info',
    },
  ]

  const eventos: EventoDoPainel[] = ativos.map(e => ({
    eventoId: e.id,
    nome: e.nome,
    dataInicio: e.dataInicio ?? '',
    local: e.local,
    setores: e.setores,
    equipe: e.equipe,
    presentes: e.presentes,
    // Já é o recorte de "acontecendo agora" — todo item aqui é ativo por
    // construção (ver o filtro acima).
    aoVivo: true,
  }))

  const bruta = await repo.atividadeRecente(ordenados.map(e => e.id), 10)
  const atividade: AtividadeRecente[] = bruta.map(a => ({
    id: a.id,
    nome: a.nomePessoa,
    setor: a.setorNome,
    tipo: a.tipo,
    em: a.em,
  }))

  return {
    data: agora.toISOString(),
    indicadores,
    eventos,
    atividade,
    legendaDaJanela: janela
      ? `${janela.nome || 'Evento'} · das ${formatarBR(janela.de, 'hora')} de `
        + `${formatarBR(janela.de, 'data')} às ${formatarBR(janela.ate, 'hora')} de ${formatarBR(janela.ate, 'data')}`
      : null,
  }
}
