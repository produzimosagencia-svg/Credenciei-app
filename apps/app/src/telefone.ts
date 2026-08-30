// O número de WhatsApp, que é como a pessoa entra.
//
// Está fora da tela de propósito: máscara e validação são regra, não desenho, e
// regra dá para testar sem emulador. A tela só chama estas funções.

/** Só os dígitos. Tudo que a pessoa colou de qualquer jeito vira número. */
export function apenasDigitos(texto: string): string {
  return (texto ?? '').replace(/\D/g, '')
}

/**
 * Tira o 55 da frente quando ele é claramente código do país.
 *
 * Muita gente copia o número do próprio WhatsApp, que vem como
 * `+55 27 99925-5959`. Recusar isso seria recusar o caminho mais natural de
 * todos — a pessoa copiou do lugar certo.
 *
 * O corte só acontece com 12 ou 13 dígitos: um número brasileiro tem 10 ou 11,
 * então não há como confundir com um DDD 55 (que não existe) nem cortar
 * dígito de quem digitou só o número.
 */
export function semCodigoDoPais(digitos: string): string {
  if ((digitos.length === 12 || digitos.length === 13) && digitos.startsWith('55')) {
    return digitos.slice(2)
  }
  return digitos
}

/**
 * Formata enquanto a pessoa digita: 27999255959 → (27) 99925-5959
 *
 * Formatar durante a digitação, e não no fim, é o que deixa o erro visível na
 * hora: um dígito a menos aparece como um traço no lugar errado, e a pessoa
 * corrige sozinha antes de pedir o código.
 */
export function mascararTelefone(parcial: string): string {
  const d = semCodigoDoPais(apenasDigitos(parcial)).slice(0, 11)
  if (d.length === 0) return ''
  if (d.length <= 2) return `(${d}`
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  // Celular tem 9 dígitos depois do DDD; fixo tem 8. O corte muda de lugar.
  const corte = d.length > 10 ? 7 : 6
  return `(${d.slice(0, 2)}) ${d.slice(2, corte)}-${d.slice(corte)}`
}

/**
 * O número serve para receber o código?
 *
 * A checagem é de FORMA, não de existência: só o WhatsApp sabe se o número
 * existe, e ele responde depois. O que dá para pegar aqui é o erro de digitação
 * — e pegar aqui evita gastar uma mensagem e trinta segundos de espera para
 * descobrir que faltava um dígito.
 */
export function telefoneValido(texto: string): boolean {
  const d = semCodigoDoPais(apenasDigitos(texto))
  if (d.length !== 10 && d.length !== 11) return false
  // DDD brasileiro vai de 11 a 99. Nenhum começa com zero.
  const ddd = Number(d.slice(0, 2))
  if (ddd < 11 || ddd > 99) return false
  // Com 11 dígitos é celular, e todo celular do país começa com 9.
  if (d.length === 11 && d[2] !== '9') return false
  return true
}

/** O que vai para o servidor: sem máscara, sem código do país. */
export function telefoneParaEnvio(texto: string): string {
  return semCodigoDoPais(apenasDigitos(texto))
}
