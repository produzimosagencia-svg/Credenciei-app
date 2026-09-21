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
  avaliarEntradaSaida, diaBRT, janelaMeio, type EventoJanelas,
} from '@credenciei/dominio'
import type { RespostaDeBatida } from '@credenciei/contrato'
import type { NovoRegistro, Repositorio } from '../dados/repositorio.js'

export type PedidoDeBatida = {
  id: string
  participacaoId: string
  tipo: 'entrada' | 'meio' | 'fim'
  registradoEm: string
  /**
   * A selfie do "meio", como data URL (`data:image/jpeg;base64,...`) — só faz
   * sentido para `tipo: 'meio'`. Sobe para o Storage aqui dentro; só o
   * CAMINHO resultante é que vira `foto_url` no registro. Ver
   * `Repositorio.subirFotoDoMeio`.
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
   * O dia da batida sai do relógio do APARELHO, não do servidor.
   *
   * Quem bateu 23:50 sem sinal e sincronizou 00:10 pertence ao dia anterior.
   * Usar o relógio do servidor jogaria a batida para o dia seguinte, onde
   * provavelmente não há dia de trabalho — e ela seria recusada.
   */
  const dataRef = diaBRT(pedido.registradoEm)
  const dias = await repo.diasDoEvento(evento.id)
  const dia = dias.find(d => d.data === dataRef) ?? null
  const doDia = await repo.registrosDoDia(part.id, dataRef)

  // ── 3. As regras, importadas do domínio ─────────────────────────────────
  if (pedido.tipo === 'meio') {
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
  } else {
    const v = avaliarEntradaSaida(
      evento as EventoJanelas,
      dia ? { tipo: dia.tipo, cancelado: dia.cancelado } : null,
      pedido.tipo,
      dataRef,
      new Date(pedido.registradoEm),
    )
    if (!v.ok) return { situacao: 'recusado', motivo: v.erro }

    if (pedido.tipo === 'fim' && !doDia.some(r => r.tipo === 'meio')) {
      return {
        situacao: 'recusado',
        motivo: 'Registre o meio antes de sair. Abra sua credencial, tire a selfie do meio e volte aqui.',
      }
    }
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
  const fotoPath = pedido.tipo === 'meio' && pedido.fotoBase64
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
    fotoPath,
    lat: pedido.lat ?? null,
    lng: pedido.lng ?? null,
    manual: false,
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
