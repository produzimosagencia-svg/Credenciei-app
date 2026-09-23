/**
 * O valor em reais, escrito à mão.
 *
 * `toLocaleString('pt-BR')` depende de dados de idioma que o motor JavaScript
 * do celular pode não trazer — e o resultado silencioso seria "R$ 600.00", com
 * ponto, na tela do pagamento de alguém.
 */
export function emReais(valor: number): string {
  const centavos = Math.round(valor * 100)
  const negativo = centavos < 0
  const absoluto = Math.abs(centavos)
  const inteiros = String(Math.floor(absoluto / 100))
  const resto = String(absoluto % 100).padStart(2, '0')

  let comPontos = ''
  for (let i = 0; i < inteiros.length; i++) {
    const faltam = inteiros.length - i
    comPontos += inteiros[i]
    if (faltam > 1 && (faltam - 1) % 3 === 0) comPontos += '.'
  }

  return `${negativo ? '-' : ''}R$ ${comPontos},${resto}`
}
