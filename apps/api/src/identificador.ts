// Identificação de quem tem conta de painel — CPF, e-mail ou usuário antigo.
//
// Copiado por VALOR de `credenciei-web/lib/usuario.ts`, com o comentário
// original: o Supabase Auth só autentica por e-mail, então o CPF do
// supervisor vira um endereço interno reservado, que nunca recebe mensagem
// de verdade. Admin e master continuam com e-mail real — eles recebem
// comunicação e precisam de recuperação de senha.
//
// Ver `docs/decisoes/007-sincronizar-com-o-sistema-web.md`: este arquivo é
// cópia, não importação. Quando o sistema web mudar esta regra, alguém muda
// aqui também.

/** Domínio interno. Não existe fora do banco de autenticação. */
export const DOMINIO_INTERNO = 'supervisor.credenciei'

/** Letras, números, ponto, hífen e sublinhado. Nada de espaço nem acento. */
const VALIDO_USUARIO = /^[a-z0-9._-]{3,32}$/

/**
 * Normaliza o que a pessoa digitou: minúsculas, sem acento, espaço vira
 * ponto. "João Bar" → "joao.bar".
 */
export function normalizarUsuario(bruto: string): string {
  return (bruto ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // tira acento
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '.')
    .replace(/[^a-z0-9._-]/g, '')
    .replace(/\.{2,}/g, '.')
    .replace(/^[.\-_]+|[.\-_]+$/g, '')
}

export function validarUsuario(usuario: string): string | null {
  if (!usuario) return 'Informe o nome de usuário do supervisor.'
  if (usuario.length < 3) return 'O nome de usuário precisa ter ao menos 3 caracteres.'
  if (usuario.length > 32) return 'O nome de usuário é muito longo (máximo 32 caracteres).'
  if (!VALIDO_USUARIO.test(usuario)) return 'Use apenas letras, números, ponto, hífen ou sublinhado.'
  return null
}

/** Só os dígitos. "123.456.789-00" e "12345678900" viram a mesma coisa. */
export function normalizarCpf(bruto: string): string {
  return (bruto ?? '').replace(/\D/g, '')
}

/** É um CPF (11 dígitos) e não um nome de usuário? */
export function pareceCpf(bruto: string): boolean {
  return normalizarCpf(bruto).length === 11
}

/** "123.456.789-00" → "12345678900@supervisor.credenciei" */
export function cpfParaEmail(cpf: string): string {
  return `${normalizarCpf(cpf)}@${DOMINIO_INTERNO}`
}

/** "juan.bar" → "juan.bar@supervisor.credenciei" */
export function usuarioParaEmail(usuario: string): string {
  return `${usuario}@${DOMINIO_INTERNO}`
}

/**
 * O que mandar pro Supabase no login.
 *
 * Sem "@", é CPF (ou usuário antigo) de supervisor e vira o endereço
 * interno. Com "@", é e-mail de admin/master e passa direto. Assim a MESMA
 * tela de login atende os dois, sem a pessoa precisar dizer que tipo de
 * conta tem.
 */
export function identificadorParaEmail(digitado: string): string {
  const v = (digitado ?? '').trim()
  if (v.includes('@')) return v.toLowerCase()
  if (pareceCpf(v)) return cpfParaEmail(v)
  // Nome de usuário do formato anterior à troca para CPF — continua valendo
  // para quem foi cadastrado antes, sem trancar ninguém para fora.
  return usuarioParaEmail(normalizarUsuario(v))
}
