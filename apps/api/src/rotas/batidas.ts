// Registrar ponto — o endpoint que mais precisa estar certo.
//
// ─── A ORDEM DAS VERIFICAÇÕES IMPORTA ───────────────────────────────────────
//
// 1. A participação é de quem está pedindo?   ← segurança, sempre primeiro
// 2. Já recebemos esta batida?                ← idempotência, antes de qualquer regra
// 3. A regra do domínio permite?              ← a mesma função que o app usa
// 4. Grava.
//
// A idempotência vem ANTES das regras de propósito. Uma batida legítima
// reenviada porque a resposta se perdeu não pode ser avaliada de novo: entre a
// primeira tentativa e a segunda o relógio andou, e a janela pode ter fechado.
// A pessoa bateu no horário certo e seria recusada por causa da rede dela.

import {
  avaliarEntradaSaida, diaBRT, diaDeReferenciaAssistida, janelaMeio, type EventoJanelas,
} from '@credenciei/dominio'
import type { RespostaDeBatida } from '@credenciei/contrato'
import type { NovoRegistro, Repositorio } from '../dados/repositorio.js'

export type PedidoDeBatida = {
  id: string
  participacaoId: string
  /*
   * SÓ O MEIO passa por aqui — decidido com o Juan em 22/09/2026, copiando a
   * forma do site, onde a selfie do meio tem uma action própria
   * (`registrarPresencaFoto`) e as outras duas etapas nem chegam nela.
   *
   * Cada etapa tem uma porta, e cada porta tem a sua trava:
   *   meio     esta rota — a única que passa pela fila offline
   *   entrada  `registrarEntradaLivre`, que exige `checkinAutonomo` no dia
   *            principal
   *   saída    só o QR lido por um operador (`escanear.ts`)
   *
   * Aceitar as três aqui abria caminho em volta dessas travas: bastava
   * chamar a rota direto, com o próprio token, para marcar a própria
   * presença de qualquer lugar. É a mesma porta que o site fechou na action,
   * e não só escondendo o botão na tela — "uma recusa só na tela não impede
   * quem chama esta action direto".
   */
  tipo: 'meio'
  registradoEm: string
  /**
   * A selfie, como data URL (`data:image/jpeg;base64,...`). Sobe para o
   * Storage aqui dentro; só o CAMINHO resultante é que vira `foto_url` no
   * registro. Ver `Repositorio.subirFotoDoMeio`.
   */
  fotoBase64?: string | null
  lat?: number | null
  lng?: number | null
}

/**
 * Quanta divergência entre o relógio do aparelho e o do servidor é aceitável
 * sem marcar.
 *
 * A batida offline sobe depois — às vezes horas depois —, então a diferença
 * sozinha não é suspeita. O que é suspeito é o aparelho dizer que bateu no
 * FUTURO, ou muito antes do que qualquer fila explicaria.
 */
export const DIVERGENCIA_TOLERADA_MS = 18 * 60 * 60 * 1000

export type ResultadoInterno = RespostaDeBatida & {
  /** Marcado quando o relógio do aparelho não é plausível. */
  relogioSuspeito?: boolean
}

export async function registrarBatida(
  repo: Repositorio,
  pessoaId: string,
  pedido: PedidoDeBatida,
  agora = new Date(),
): Promise<ResultadoInterno> {
  // ── 1. Segurança ────────────────────────────────────────────────────────
  const part = await repo.participacaoPorId(pedido.participacaoId)
  /*
   * "Não encontrada" para participação de outra pessoa, e não "sem permissão".
   *
   * Responder diferente para "não existe" e "existe mas não é sua" entrega um
   * jeito de descobrir quais ids existem — bastaria varrer e ver qual das duas
   * mensagens volta. É a mesma resposta para os dois casos, de propósito.
   */
  if (!part || part.pessoaId !== pessoaId) {
    return { situacao: 'recusado', motivo: 'Participação não encontrada.' }
  }
  if (part.descredenciadoEm) {
    return { situacao: 'recusado', motivo: 'Seu vínculo com este evento já foi encerrado.' }
  }
  if (!part.ativo) {
    return { situacao: 'recusado', motivo: 'Seu cadastro ainda não foi ativado pelo organizador.' }
  }

  // ── 2. Idempotência, antes das regras ───────────────────────────────────
  const jaRecebida = await repo.registroPorId(pedido.id)
  if (jaRecebida) {
    return { situacao: 'duplicado', em: jaRecebida.registradoEm }
  }

  const evento = await repo.eventoPorId(part.eventoId)
  if (!evento) return { situacao: 'recusado', motivo: 'Evento não encontrado.' }

  /*
   * A que dia de trabalho o meio pertence — duas coisas somadas.
   *
   * 1. O relógio que conta é o do APARELHO, não o do servidor. Quem bateu
   *    23:50 sem sinal e sincronizou 00:10 pertence ao dia anterior; usar o
   *    relógio do servidor jogaria a batida para o dia seguinte, onde
   *    provavelmente não há dia de trabalho, e ela seria recusada.
   *
   * 2. O meio pertence ao TURNO AINDA ABERTO, não ao dia do calendário — é o
   *    turno que atravessa a meia-noite, que é o caso central deste sistema.
   *    Quem entrou 22:00 do dia 5 bate o meio 02:00 do dia 6 (abre entrada +
   *    4h), e ele é do dia 5. Sem isto o servidor procurava a entrada no dia
   *    6, não achava, e recusava com "registre primeiro a sua entrada" — para
   *    quem tinha acabado de entrar. Mesma régua do site (`entradaDoTurno`,
   *    em `resolverRegistro`).
   */
  const registros = await repo.registrosDaParticipacao(part.id)
  const dataRef = diaDeReferenciaAssistida(
    registros.map(r => ({ id: r.id, tipo: r.tipo, em: r.registradoEm, dataRef: r.dataRef })),
    'meio',
    diaBRT(pedido.registradoEm),
    new Date(pedido.registradoEm),
  )
  const doDia = registros.filter(r => r.dataRef === dataRef)

  /*
   * ── 3. As regras do meio ────────────────────────────────────────────────
   *
   * O meio ABRE num horário e não FECHA — igual ao site. O ponto dele é o
   * horário ficar gravado, para conferir a jornada com a pessoa depois;
   * fechar a janela faria quem passou da hora perder o registro de vez, sem
   * ganho nenhum. Chegar atrasado não some do relatório: as pendências
   * comparam o feito com o esperado.
   */
  const entrada = doDia.find(r => r.tipo === 'entrada')
  if (!entrada) {
    return { situacao: 'recusado', motivo: 'Registre primeiro a sua entrada. O horário do meio é contado a partir dela.' }
  }
  if (Date.parse(pedido.registradoEm) < Date.parse(janelaMeio(entrada.registradoEm).inicio)) {
    /*
     * A recusa não conta a fórmula.
     *
     * "Abre 4h depois da entrada" ensina a burlar: bastaria bater a entrada,
     * sair e voltar no minuto certo. O horário exato aparece só para quem
     * administra.
     */
    return { situacao: 'recusado', motivo: 'O registro do meio ainda não abriu. Você será avisado quando chegar a hora.' }
  }

  // Etapa já registrada hoje por OUTRO envio: sucesso, não erro. Do ponto de
  // vista da pessoa, ela está registrada.
  const mesmaEtapa = doDia.find(r => r.tipo === pedido.tipo)
  if (mesmaEtapa) return { situacao: 'duplicado', em: mesmaEtapa.registradoEm }

  /*
   * A foto sobe SÓ depois de passar por toda regra acima — e só para o meio,
   * que é a única etapa com selfie hoje. Subir antes gastaria o Storage com
   * uma imagem de uma batida que ia ser recusada de qualquer jeito.
   */
  const fotoPath = pedido.fotoBase64
    ? await repo.subirFotoDoMeio(evento.id, part.id, dataRef, pedido.fotoBase64)
    : null

  // ── 4. Grava, com os dois relógios ──────────────────────────────────────
  const recebidoEm = agora.toISOString()
  const divergencia = Math.abs(Date.parse(recebidoEm) - Date.parse(pedido.registradoEm))
  const noFuturo = Date.parse(pedido.registradoEm) > Date.parse(recebidoEm) + 5 * 60_000

  const novo: NovoRegistro = {
    id: pedido.id,
    participacaoId: part.id,
    tipo: pedido.tipo,
    dataRef,
    registradoEm: pedido.registradoEm,
    recebidoEm,
    origem: 'app',
    fotoPath,
    lat: pedido.lat ?? null,
    lng: pedido.lng ?? null,
    manual: false,
    justificativa: null,
  }

  const gravado = await repo.gravarRegistro(novo)

  return {
    situacao: 'registrado',
    em: gravado.registradoEm,
    /*
     * Relógio suspeito NÃO impede a batida.
     *
     * Barrar aqui puniria quem está com o fuso errado no celular — coisa
     * comum — e deixaria a pessoa sem registro. A defesa é tornar visível: o
     * servidor guarda os dois horários, e a folha de chamada marca o dia para
     * conferência, do mesmo jeito que já marca o meio atrasado.
     */
    ...(noFuturo || divergencia > DIVERGENCIA_TOLERADA_MS ? { relogioSuspeito: true } : {}),
  }
}

/**
 * Entrada sem operador — o auto-atendimento.
 *
 * Só ENTRADA: a saída continua exigindo sempre o QR mostrado no
 * credenciamento — decisão do Juan. Fora do dia principal já funciona
 * sempre, do mesmo jeito que a montagem e a desmontagem sempre foram
 * livres. No dia principal, só quando o evento tem `checkinAutonomo`
 * ligado.
 *
 * É uma chamada direta, sem idempotência de aparelho: a pessoa está parada
 * esperando a confirmação, e não passa pela fila offline (ver o comentário
 * em `credencial.tsx`). O id gravado é determinístico — participação + dia —
 * então repetir a chamada no mesmo dia cai no caminho de "duplicado", nunca
 * grava duas entradas.
 */
export async function registrarEntradaLivre(
  repo: Repositorio,
  pessoaId: string,
  participacaoId: string,
  dados: { lat?: number; lng?: number },
  agora = new Date(),
): Promise<RespostaDeBatida> {
  const part = await repo.participacaoPorId(participacaoId)
  if (!part || part.pessoaId !== pessoaId) {
    return { situacao: 'recusado', motivo: 'Participação não encontrada.' }
  }
  if (part.descredenciadoEm) {
    return { situacao: 'recusado', motivo: 'Seu vínculo com este evento já foi encerrado.' }
  }
  if (!part.ativo) {
    return { situacao: 'recusado', motivo: 'Seu cadastro ainda não foi ativado pelo organizador.' }
  }

  const evento = await repo.eventoPorId(part.eventoId)
  if (!evento) return { situacao: 'recusado', motivo: 'Evento não encontrado.' }

  const dataRef = diaBRT(agora)
  const dias = await repo.diasDoEvento(evento.id)
  const dia = dias.find(d => d.data === dataRef) ?? null

  if (dia?.tipo === 'principal' && evento.checkin_autonomo !== true) {
    return { situacao: 'recusado', motivo: 'No dia do evento, a entrada é pelo QR Code no credenciamento.' }
  }

  const v = avaliarEntradaSaida(
    evento as EventoJanelas,
    dia ? { tipo: dia.tipo, cancelado: dia.cancelado } : null,
    'entrada',
    dataRef,
    agora,
  )
  if (!v.ok) return { situacao: 'recusado', motivo: v.erro }

  const doDia = await repo.registrosDoDia(part.id, dataRef)
  const jaTemEntrada = doDia.find(r => r.tipo === 'entrada')
  if (jaTemEntrada) return { situacao: 'duplicado', em: jaTemEntrada.registradoEm }

  const registradoEm = agora.toISOString()
  const gravado = await repo.gravarRegistro({
    id: `livre-${participacaoId}-${dataRef}`,
    participacaoId: part.id,
    tipo: 'entrada',
    dataRef,
    registradoEm,
    recebidoEm: registradoEm,
    origem: 'app',
    fotoPath: null,
    lat: dados.lat ?? null,
    lng: dados.lng ?? null,
    manual: false,
  })

  return { situacao: 'registrado', em: gravado.registradoEm }
}

/**
 * O colaborador contesta a própria batida — errada ou que faltou. Recurso só
 * do app, o site nunca teve isto pra copiar (colaborador não tem conta lá).
 * Escopo decidido com o Juan em 18/09/2026: vira pendência na equipe do
 * setor (`temContestacaoAberta`, em `rotas/setor.ts`), resolvida por quem já
 * pode mexer na equipe (`podeMexerNaEquipe`, em `ficha-da-pessoa.ts`). Ver
 * migração `007-contestacoes-de-batida.sql`.
 *
 * "Não encontrada" é a mesma resposta pra participação inexistente e pra
 * participação de outra pessoa — mesma régua de `registrarBatida`.
 */
export async function contestarBatida(
  repo: Repositorio,
  pessoaId: string,
  participacaoId: string,
  tipo: 'entrada' | 'meio' | 'fim',
  dataRef: string,
  motivoBruto: string,
): Promise<{ erro?: string }> {
  const part = await repo.participacaoPorId(participacaoId)
  if (!part || part.pessoaId !== pessoaId) return { erro: 'Participação não encontrada.' }

  const motivo = (motivoBruto ?? '').trim()
  if (!motivo) {
    return { erro: 'Escreva o que está errado — sem isso, quem for resolver não sabe por onde começar.' }
  }

  await repo.criarContestacao({ participacaoId, tipo, dataRef, motivo })
  return {}
}
