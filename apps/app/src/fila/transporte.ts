// A ponte entre a fila offline e o servidor.
//
// ─── É AQUI QUE A DISTINÇÃO MAIS IMPORTANTE DO PROJETO ACONTECE ─────────────
//
// A fila trata duas situações de formas opostas, e quem decide qual é qual é
// esta função:
//
//   o servidor DIZ NÃO       decisão: fora da janela, cadastro inativo, dia não
//                            marcado. Reenviar não muda nada — a fila descarta
//                            e explica para a pessoa.
//
//   o servidor NÃO RESPONDE  transporte: a rede caiu, o pedido não chegou. A
//                            fila guarda e tenta de novo, com recuo.
//
// Confundir os dois é como uma fila offline estraga. Tratar recusa como falha
// de rede faz o aparelho reenviar para sempre algo que nunca vai passar; tratar
// falha de rede como recusa joga fora uma batida que a pessoa fez de verdade.
//
// O cliente já entrega a diferença pronta: recusa volta como RESPOSTA, falha de
// transporte volta como EXCEÇÃO. Esta função só traduz — e é justamente por ser
// só tradução que ela pode ser testada inteira, sem rede.

import type { ClienteApi } from '@credenciei/contrato'
import type { Transporte } from '@credenciei/offline'

export function transporteDe(cliente: ClienteApi): Transporte {
  return async (batida) => {
    /*
     * A fila é um transporte genérico — quem só aceita o MEIO é a rota do
     * outro lado (ver `EnvioDeBatida`, no contrato). Entrada tem porta
     * própria, com a trava do `checkinAutonomo`, e saída é só o QR lido por
     * um operador; nenhuma das duas passa pela fila.
     *
     * Se uma delas cair aqui, é RECUSA e não falha de rede: reenviar não
     * mudaria nada, e insistir para sempre é exatamente o que a distinção no
     * topo deste arquivo existe para evitar.
     */
    if (batida.tipo !== 'meio') {
      return { ok: false, definitivo: true, motivo: 'Só a selfie do meio é enviada pela fila.' }
    }

    try {
      const resposta = await cliente.registrarBatida({
        id: batida.id,
        participacaoId: batida.participacaoId,
        tipo: batida.tipo,
        registradoEm: batida.registradoEm,
        ...(batida.foto !== undefined ? { fotoBase64: batida.foto } : {}),
        ...(batida.lat !== undefined ? { lat: batida.lat } : {}),
        ...(batida.lng !== undefined ? { lng: batida.lng } : {}),
      })

      if (resposta.situacao === 'registrado') return { ok: true }

      /*
       * Duplicada é SUCESSO, não erro.
       *
       * Significa que o envio anterior chegou e só a resposta se perdeu — o que
       * é o caso normal numa rede de evento. Tratar como falha faria a pessoa
       * ver "você já registrou" e achar que alguma coisa deu errado, quando na
       * verdade a batida dela está gravada.
       */
      if (resposta.situacao === 'duplicado') return { ok: true, duplicada: true }

      return { ok: false, definitivo: true, motivo: resposta.motivo }
    } catch {
      /*
       * Exceção é transporte, sempre.
       *
       * Nenhuma recusa do servidor chega por aqui: o contrato manda recusa como
       * resposta. O que sobra é rede — e rede volta.
       */
      return { ok: false, definitivo: false }
    }
  }
}
