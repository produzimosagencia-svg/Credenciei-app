// De onde o app tira os dados.
//
// ─── É ESTE O ÚNICO ARQUIVO QUE SABE SE O SERVIDOR É DE VERDADE ─────────────
//
// As telas são escritas contra a INTERFACE `ClienteApi`, nunca contra uma
// implementação. Aqui se decide qual delas entra:
//
//   sem `EXPO_PUBLIC_API_URL`   o `ClienteFalso`: um servidor de mentira que
//                               roda dentro do app. Demora, cai, recusa com
//                               motivo e lembra do que já recebeu.
//
//   com a variável definida     o `ClienteHttp`, falando com a API de verdade.
//
// A troca é uma variável de ambiente, e nenhuma tela muda. Isso deixou de ser
// promessa em 31/08/2026: `apps/api/src/cliente-real.teste.ts` roda o mesmo
// roteiro do colaborador nos dois clientes e exige que os dois se comportem
// igual. Ele achou duas divergências no primeiro dia.
//
// ─── O QUE AINDA NÃO EXISTE DO OUTRO LADO ───────────────────────────────────
//
// Os endpoints do painel (Painel, Escanear QR, Registrar ponto, Atividades,
// Acessos) ainda não estão na API. Com a variável definida, essas telas falham
// dizendo o nome do método que falta — de propósito. Devolver lista vazia
// pareceria "não tem nada" e mandaria alguém procurar o problema no banco.

import {
  ClienteFalso, ClienteHttp, type ClienteApi, type Sessao,
} from '@credenciei/contrato'

/**
 * Onde a API mora, se houver.
 *
 * `EXPO_PUBLIC_` é o prefixo que o Expo troca por valor na hora de empacotar —
 * sem ele, a variável simplesmente não existe dentro do app. Lida uma vez, no
 * carregamento: trocar de servidor exige reiniciar o empacotador de qualquer
 * jeito.
 */
const URL_DA_API = (process.env.EXPO_PUBLIC_API_URL ?? '').trim()

/**
 * O app está falando com o servidor de mentira?
 *
 * As telas usam isto para dizer isso na cara da pessoa. Uma demonstração que
 * não se anuncia como demonstração acaba confundida com o sistema de verdade —
 * e alguém bate ponto num servidor que não guarda nada.
 */
export const DEMONSTRACAO = URL_DA_API === ''

/**
 * O atraso artificial de cada chamada do servidor falso, em milissegundos.
 *
 * Não é zero de propósito. Um cliente falso instantâneo produz telas sem estado
 * de espera, que depois piscam e travam contra a rede de um estádio lotado.
 * Meio segundo é o suficiente para o buraco aparecer durante o desenvolvimento.
 */
const ATRASO_DA_DEMONSTRACAO = 450

export type OpcoesDoCliente = {
  /** A sessão que estava guardada no aparelho, se havia. */
  sessao?: Sessao
  /** Só para os testes: o atraso do servidor falso. */
  atrasoMs?: number
  /**
   * De onde sai o token de cada chamada.
   *
   * Quem sabe se o token ainda vale — e quem renova — é a guarda da sessão. O
   * cliente pergunta a cada chamada em vez de guardar uma cópia, porque o token
   * gira e duas cópias divergiriam na primeira renovação.
   */
  credencial?: () => Promise<string | null>
  /** Avisado quando o servidor diz que a sessão morreu de vez. */
  aoPerderSessao?: () => void
}

export function criarCliente(op: OpcoesDoCliente = {}): ClienteApi {
  if (DEMONSTRACAO) {
    return new ClienteFalso({
      atrasoMs: op.atrasoMs ?? ATRASO_DA_DEMONSTRACAO,
      ...(op.sessao ? { sessaoInicial: op.sessao } : {}),
    })
  }

  return new ClienteHttp({
    base: URL_DA_API,
    // Sem guarda, o cliente não tem como conseguir token — e sair sem token só
    // gastaria uma tentativa da fila num 401 garantido.
    credencial: op.credencial ?? (async () => op.sessao?.token ?? null),
    ...(op.aoPerderSessao ? { aoPerderSessao: op.aoPerderSessao } : {}),
  })
}
