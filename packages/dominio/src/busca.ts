// A busca de uma pessoa por CPF ou nome, quando o CPF exato não bate.
//
// ─── DE ONDE ISTO VEIO ──────────────────────────────────────────────────────
//
// Ported de `distanciaEntreCpfs`, em `lib/actions.ts` do site — não é um dos
// arquivos da lista fixa de `docs/decisoes/007`, mas a regra é a mesma: o
// documento na mão do operador está certo, a consulta exata é que não acha
// uma linha gravada com um algarismo trocado. Trazido em 11/09/2026.

/**
 * Quantos algarismos diferem entre dois CPFs completos, posição a posição.
 *
 * Distância de Hamming, não de edição: um CPF digitado errado no cadastro
 * quase sempre troca um dígito por outro no mesmo lugar ("154.321.447-94"
 * virar "154.321.847-94"), não insere ou apaga um — então comparar por
 * POSIÇÃO acha o erro típico sem os falsos positivos que uma distância de
 * edição (que também aceita deslocar os dígitos) traria.
 *
 * Exige os dois com 11 dígitos — CPF incompleto não compara, retorna
 * infinito para nunca entrar como aproximado.
 */
export function distanciaEntreCpfs(a: string, b: string): number {
  if (!/^\d{11}$/.test(a) || !/^\d{11}$/.test(b)) return Number.POSITIVE_INFINITY
  let diferentes = 0
  for (let i = 0; i < 11; i++) if (a[i] !== b[i]) diferentes++
  return diferentes
}

/** Até quantos algarismos diferentes a busca aproximada ainda considera. */
export const TOLERANCIA_DE_CPF = 2
