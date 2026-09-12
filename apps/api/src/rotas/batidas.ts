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
  fotoPath?: string | null
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
    fotoPath: pedido.fotoPath ?? null,
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
