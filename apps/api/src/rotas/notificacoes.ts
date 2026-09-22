// A Central de Avisos — histórico do que já foi mandado por push, e a
// preferência de quais tipos a pessoa quer receber.
//
// Contrato inteiro já existia (`packages/contrato/src/cliente.ts`,
// `CentralDeAvisos`/`Notificacao`/`PreferenciaDeAviso`), com dado de
// demonstração pronto no `cliente-falso.ts` — só nunca tinha ganhado uma API
// de verdade (achado 21/09/2026, ligando a esta agora). Os rótulos e as
// descrições de cada categoria vieram de lá, pra não reescrever um texto que
// já estava bom.
//
// Master, admin, gerente e cliente não têm nenhuma categoria hoje — o
// sistema web também não manda nada automático pra eles, só o painel de
// acompanhar.

import type { CentralDeAvisos, TipoDeAviso } from '@credenciei/contrato'
import type { Papel } from '@credenciei/dominio'
import type { Repositorio } from '../dados/repositorio.js'

const ROTULO_DO_AVISO: Record<TipoDeAviso, { rotulo: string; descricao: string }> = {
  dia_evento: { rotulo: 'Dia do evento', descricao: 'Aviso na manhã do dia, com os horários de entrada e saída' },
  montagem: { rotulo: 'Dias de montagem', descricao: 'Aviso às 7h de cada dia de preparação antes do evento' },
  desmontagem: { rotulo: 'Dias de desmontagem', descricao: 'Aviso às 7h de cada dia depois do evento' },
  lembrete_entrada: { rotulo: 'Hora da entrada', descricao: 'Quando a janela de entrada abrir' },
  lembrete_meio: { rotulo: 'Hora da selfie', descricao: '4 horas depois da sua entrada' },
  lembrete_fim: { rotulo: 'Hora da saída', descricao: 'Quando a janela de saída abrir' },
  reforco: { rotulo: 'Reforço de prazo', descricao: 'Perto do fim do prazo, só se você ainda não registrou' },
  pagamento_marcado: { rotulo: 'Pagamento marcado', descricao: 'Quando seu pagamento for confirmado pelo organizador' },
  realocacao: { rotulo: 'Nova escala', descricao: 'Quando você for movido para outro setor' },
  alerta_pendencia: {
    rotulo: 'Pendência da equipe', descricao: 'Quando alguém do seu setor passar do prazo de uma etapa',
  },
}

/**
 * Só os tipos que já têm envio de verdade (`rotas/lembretes.ts`) entram na
 * lista de preferências — `reforco`, `pagamento_marcado` e `realocacao`
 * ainda não são mandados por ninguém, então oferecer o interruptor seria
 * prometer um controle que não existe.
 */
const TIPOS_DO_COLABORADOR: TipoDeAviso[] = [
  'dia_evento', 'montagem', 'desmontagem', 'lembrete_entrada', 'lembrete_meio', 'lembrete_fim',
]
const TIPOS_DO_SUPERVISOR: TipoDeAviso[] = ['alerta_pendencia']

function tiposDoPapel(papel: Papel): TipoDeAviso[] {
  if (papel === 'supervisor') return TIPOS_DO_SUPERVISOR
  if (papel === 'colaborador') return TIPOS_DO_COLABORADOR
  return []
}

export async function minhasNotificacoes(repo: Repositorio, pessoaId: string, papel: Papel): Promise<CentralDeAvisos> {
  const [historico, desligados] = await Promise.all([
    repo.notificacoesDaPessoa(pessoaId),
    repo.tiposDesligados(pessoaId),
  ])
  const desligadosSet = new Set(desligados)
  const tipos = tiposDoPapel(papel)

  return {
    naoLidas: historico.filter(n => !n.lida).length,
    notificacoes: historico.map(n => ({
      id: n.id,
      tipo: n.tipo as TipoDeAviso,
      titulo: n.titulo,
      corpo: n.corpo,
      criadaEm: n.criadoEm,
      lida: n.lida,
      destino: n.destino,
    })),
    preferencias: tipos.map(tipo => ({
      tipo,
      rotulo: ROTULO_DO_AVISO[tipo].rotulo,
      descricao: ROTULO_DO_AVISO[tipo].descricao,
      ativo: !desligadosSet.has(tipo),
    })),
  }
}

export async function marcarNotificacaoComoLida(
  repo: Repositorio, pessoaId: string, id: string,
): Promise<Record<string, never>> {
  await repo.marcarNotificacaoLida(id, pessoaId)
  return {}
}

export async function marcarTodasComoLidas(repo: Repositorio, pessoaId: string): Promise<Record<string, never>> {
  await repo.marcarTodasNotificacoesLidas(pessoaId)
  return {}
}

export async function salvarPreferenciasDeAvisos(
  repo: Repositorio, pessoaId: string, papel: Papel, tiposLigados: TipoDeAviso[],
): Promise<Record<string, never>> {
  await repo.salvarPreferencias(pessoaId, tiposDoPapel(papel), tiposLigados)
  return {}
}
