// Autoatendimento sobre a própria conta — hoje só "excluir".

import type { Repositorio } from '../dados/repositorio.js'
import type { Sessoes } from '../sessoes.js'

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
