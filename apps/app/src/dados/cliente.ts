// De onde o app tira os dados.
//
// ─── É ESTE O ÚNICO ARQUIVO QUE MUDA QUANDO A API ENTRAR ────────────────────
//
// Hoje o app conversa com o `ClienteFalso`: um servidor de mentira que se
// comporta como o de verdade — demora, cai, recusa com motivo e lembra do que
// já recebeu. As telas são escritas contra a INTERFACE `ClienteApi`, não contra
// ele.
//
// Quando a API HTTP estiver de pé (ela já existe em `apps/api`, falta o cliente
// que fala com ela), a troca é aqui: `new ClienteHttp({ base, credencial })` no
// lugar do falso. Nenhuma tela muda. É o que permitiu construir o app e a API
// em paralelo em vez de um esperar o outro.

import { ClienteFalso, type ClienteApi, type Sessao } from '@credenciei/contrato'

/**
 * O app está falando com o servidor de mentira?
 *
 * As telas usam isto para dizer isso na cara da pessoa. Uma demonstração que
 * não se anuncia como demonstração acaba confundida com o sistema de verdade —
 * e alguém bate ponto num servidor que não guarda nada.
 */
export const DEMONSTRACAO = true

/**
 * O atraso artificial de cada chamada, em milissegundos.
 *
 * Não é zero de propósito. Um cliente falso instantâneo produz telas sem estado
 * de espera, que depois piscam e travam contra a rede de um estádio lotado.
 * Meio segundo é o suficiente para o buraco aparecer durante o desenvolvimento.
 */
const ATRASO_DA_DEMONSTRACAO = 450

export function criarCliente(op: { sessao?: Sessao; atrasoMs?: number } = {}): ClienteApi {
  return new ClienteFalso({
    atrasoMs: op.atrasoMs ?? ATRASO_DA_DEMONSTRACAO,
    sessaoInicial: op.sessao,
  })
}
