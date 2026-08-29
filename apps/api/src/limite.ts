// Limite de tentativas, em memória.
//
// ─── POR QUE ISTO EXISTE ────────────────────────────────────────────────────
//
// Três portas do sistema são adivinháveis por força bruta:
//
//   o código do evento    quatro caracteres, ~1 milhão de combinações
//   o código de acesso    seis dígitos, 1 milhão
//   o número de telefone  descobrir quem está cadastrado testando números
//
// Nenhuma delas resiste a mil tentativas por segundo. O limite é o que
// transforma "minutos" em "anos" — e é mais eficaz que alongar os códigos,
// porque não custa nada a quem digita.
//
// ─── A LIMITAÇÃO DESTA VERSÃO ───────────────────────────────────────────────
//
// A contagem vive na memória do processo. Com uma instância só, funciona. Com
// várias — que é o que acontece em produção serverless —, cada uma conta
// separado, e o limite efetivo multiplica pelo número de instâncias.
//
// Não é falha de desenho, é uma etapa: a interface já está certa, e trocar por
// uma contagem compartilhada (Redis, ou uma tabela no Postgres) é substituir
// este arquivo. Está anotado como pendência para antes da produção.

type Janela = { ate: number; usos: number }

const janelas = new Map<string, Janela>()

/**
 * Esta chave ainda pode passar?
 *
 * Conta ANTES de deixar passar, não depois: se o processo morrer no meio da
 * operação, o gasto já está registrado. O contrário permitiria burlar o limite
 * derrubando a requisição na hora certa.
 */
export function podePassar(
  chave: string,
  maximo: number,
  janelaMs: number,
  agora = Date.now(),
): boolean {
  const atual = janelas.get(chave)

  if (!atual || agora > atual.ate) {
    janelas.set(chave, { ate: agora + janelaMs, usos: 1 })
    return true
  }

  if (atual.usos >= maximo) return false

  atual.usos++
  return true
}

/** Só para os testes: limpa a contagem entre casos. */
export function esquecerLimites(): void {
  janelas.clear()
}

/**
 * Remove janelas vencidas.
 *
 * Sem isto o mapa cresce para sempre: cada telefone que já tentou entrar deixa
 * uma entrada permanente, e com vinte mil contas isso vira memória parada.
 */
export function limparVencidos(agora = Date.now()): number {
  let removidos = 0
  for (const [chave, j] of janelas) {
    if (agora > j.ate) { janelas.delete(chave); removidos++ }
  }
  return removidos
}
