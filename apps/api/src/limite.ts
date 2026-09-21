// Limite de tentativas.
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
// ─── DUAS IMPLEMENTAÇÕES, MESMA INTERFACE ───────────────────────────────────
//
// `LimiteEmMemoria` — testes e o servidor falso: instantâneo, e cada
// instância de teste começa zerada. `LimiteNoSupabase` (`limite-supabase.ts`)
// — a API de verdade, sobre a tabela `app_limites` (migração 005): sobrevive
// a reiniciar o processo, e mais de uma instância conta junto — mesma razão
// de `SessoesNoSupabase` ter saído da memória em 12/09/2026.

export interface LimiteDeTentativas {
  /**
   * Esta chave ainda pode passar?
   *
   * Conta ANTES de deixar passar, não depois: se o processo morrer no meio da
   * operação, o gasto já está registrado. O contrário permitiria burlar o
   * limite derrubando a requisição na hora certa.
   */
  podePassar(chave: string, maximo: number, janelaMs: number, agora?: number): Promise<boolean>
}

type Janela = { ate: number; usos: number }

export class LimiteEmMemoria implements LimiteDeTentativas {
  private janelas = new Map<string, Janela>()

  async podePassar(chave: string, maximo: number, janelaMs: number, agora = Date.now()): Promise<boolean> {
    const atual = this.janelas.get(chave)

    if (!atual || agora > atual.ate) {
      this.janelas.set(chave, { ate: agora + janelaMs, usos: 1 })
      return true
    }

    if (atual.usos >= maximo) return false

    atual.usos++
    return true
  }

  /** Só para os testes: limpa a contagem entre casos. */
  esquecer(): void {
    this.janelas.clear()
  }

  /** Remove o que já venceu — sem isto o mapa cresce para sempre. */
  limparVencidos(agora = Date.now()): number {
    let n = 0
    for (const [k, v] of this.janelas) if (agora > v.ate) { this.janelas.delete(k); n++ }
    return n
  }
}
