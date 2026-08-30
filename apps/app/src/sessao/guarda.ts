// Quem guarda a sessão da pessoa entre uma abertura do app e a outra.
//
// ─── A DECISÃO QUE ESTE ARQUIVO EXISTE PARA ACERTAR ─────────────────────────
//
// O token curto vence a cada hora. Quando vence, o app troca o token longo por
// um novo — e é aí que mora a pergunta perigosa: **o que fazer quando a troca
// não dá certo?**
//
//   o servidor RECUSOU     a sessão morreu de verdade (expirou, foi revogada).
//                          Apagar e pedir login de novo é o certo.
//
//   o servidor NÃO RESPONDEU   a rede caiu. Apagar aqui seria o pior erro
//                          possível do app inteiro: para entrar de novo a
//                          pessoa precisa receber um código no WhatsApp, o que
//                          exige justamente a internet que não tem. Ela ficaria
//                          trancada para fora, no meio do evento, com a
//                          credencial dentro do aparelho e sem conseguir abrir.
//
// É a mesma distinção da fila offline, aplicada à identidade. Ver
// `@credenciei/offline`.

import type { Sessao } from '@credenciei/contrato'

/**
 * Onde a sessão fica no aparelho.
 *
 * Interface, e não escolha fixa, porque cada lugar guarda de um jeito: o
 * chaveiro do sistema no celular, o navegador na web, memória nos testes.
 */
export type Cofre = {
  ler(chave: string): Promise<string | null>
  gravar(chave: string, valor: string): Promise<void>
  apagar(chave: string): Promise<void>
}

/** Como a renovação é feita. Injetada para o teste não precisar de rede. */
export type Renovar = (renovacao: string) => Promise<{ sessao?: Sessao; erro?: string }>

/**
 * O que a chamada seguinte recebe.
 *
 * `sem-rede` e `sem-sessao` são respostas diferentes de propósito: a primeira
 * manda tentar de novo mais tarde, a segunda manda para a tela de entrar. Um
 * único `null` para os dois casos jogaria a pessoa para fora por falta de sinal.
 */
export type Credencial =
  | { ok: true; token: string }
  | { ok: false; motivo: 'sem-sessao' }
  | { ok: false; motivo: 'sem-rede' }

const CHAVE = 'credenciei.sessao'

/**
 * Quanto antes do vencimento a renovação começa.
 *
 * Um minuto porque a chamada precisa caber na sobra: renovar exatamente no
 * segundo do vencimento faria o pedido chegar ao servidor já vencido numa rede
 * lenta de evento.
 */
const MARGEM_MS = 60_000

type Ouvinte = (sessao: Sessao | null) => void

export type OpcoesDaGuarda = {
  cofre: Cofre
  renovar: Renovar
  agora?: () => number
  margemMs?: number
}

export class GuardaDaSessao {
  private sessao: Sessao | null = null
  private leitura: Promise<Sessao | null> | null = null
  /** A renovação em andamento, se houver. Ver `credencial()`. */
  private renovacaoEmCurso: Promise<Credencial> | null = null
  private ouvintes = new Set<Ouvinte>()

  private readonly cofre: Cofre
  private readonly renovar: Renovar
  private readonly agora: () => number
  private readonly margemMs: number

  constructor(op: OpcoesDaGuarda) {
    this.cofre = op.cofre
    this.renovar = op.renovar
    this.agora = op.agora ?? (() => Date.now())
    this.margemMs = op.margemMs ?? MARGEM_MS
  }

  /** O que está em mãos agora, sem ir ao cofre nem à rede. */
  atual(): Sessao | null {
    return this.sessao
  }

  /** Lê o que estava guardado. Uma vez só, mesmo se chamada de vários lugares. */
  carregar(): Promise<Sessao | null> {
    if (!this.leitura) this.leitura = this.lerDoCofre()
    return this.leitura
  }

  private async lerDoCofre(): Promise<Sessao | null> {
    const cru = await this.cofre.ler(CHAVE)
    this.sessao = cru ? interpretar(cru) : null
    this.avisar()
    return this.sessao
  }

  /** Depois de entrar, ou depois de renovar. Grava antes de devolver. */
  async abrir(sessao: Sessao): Promise<void> {
    this.sessao = sessao
    this.leitura = Promise.resolve(sessao)
    await this.cofre.gravar(CHAVE, JSON.stringify(sessao))
    this.avisar()
  }

  async sair(): Promise<void> {
    this.sessao = null
    this.leitura = Promise.resolve(null)
    await this.cofre.apagar(CHAVE)
    this.avisar()
  }

  /**
   * O token para a próxima chamada, renovando se estiver na hora.
   *
   * Renovações simultâneas são reduzidas a uma só. Isso não é economia: o token
   * de renovação GIRA — o servidor invalida o antigo assim que entrega o novo.
   * Duas telas pedindo credencial ao mesmo tempo mandariam o mesmo token longo
   * duas vezes, e a segunda chamada voltaria recusada, derrubando uma sessão
   * que estava perfeitamente viva.
   */
  async credencial(): Promise<Credencial> {
    const sessao = await this.carregar()
    if (!sessao) return { ok: false, motivo: 'sem-sessao' }

    const sobra = Date.parse(sessao.expiraEm) - this.agora()
    if (sobra > this.margemMs) return { ok: true, token: sessao.token }

    if (!this.renovacaoEmCurso) {
      this.renovacaoEmCurso = this.renovarAgora(sessao.renovacao)
        .finally(() => { this.renovacaoEmCurso = null })
    }
    return this.renovacaoEmCurso
  }

  private async renovarAgora(renovacao: string): Promise<Credencial> {
    let resposta: { sessao?: Sessao; erro?: string }
    try {
      resposta = await this.renovar(renovacao)
    } catch {
      // Transporte. A sessão continua inteira no cofre — ver o cabeçalho.
      return { ok: false, motivo: 'sem-rede' }
    }

    if (!resposta.sessao) {
      // Decisão do servidor: esta sessão não vale mais. Insistir não muda.
      await this.sair()
      return { ok: false, motivo: 'sem-sessao' }
    }

    // Gravar ANTES de devolver o token. O servidor já girou o token longo; se o
    // app usasse o novo token curto e morresse antes de gravar, o token longo
    // guardado seria o velho — que o servidor acabou de invalidar. A pessoa
    // perderia a conta por causa de um fechamento de app.
    await this.abrir(resposta.sessao)
    return { ok: true, token: resposta.sessao.token }
  }

  assinar(ouvinte: Ouvinte): () => void {
    this.ouvintes.add(ouvinte)
    return () => this.ouvintes.delete(ouvinte)
  }

  private avisar(): void {
    for (const o of this.ouvintes) o(this.sessao)
  }
}

/**
 * Lê o que estava guardado, aceitando que possa estar corrompido.
 *
 * Armazenamento de celular corrompe: atualização interrompida, disco cheio,
 * migração de aparelho. Estourar aqui deixaria o app sem abrir NUNCA MAIS, com
 * a única saída sendo desinstalar. Sessão ilegível vira sessão inexistente — a
 * pessoa entra de novo, que é chato, mas é um caminho que existe.
 */
function interpretar(cru: string): Sessao | null {
  try {
    const x: unknown = JSON.parse(cru)
    if (!x || typeof x !== 'object') return null
    const s = x as Record<string, unknown>
    if (typeof s.token !== 'string' || !s.token) return null
    if (typeof s.expiraEm !== 'string' || Number.isNaN(Date.parse(s.expiraEm))) return null
    if (typeof s.renovacao !== 'string' || !s.renovacao) return null
    if (typeof s.papel !== 'string') return null
    return { token: s.token, expiraEm: s.expiraEm, renovacao: s.renovacao, papel: s.papel as Sessao['papel'] }
  } catch {
    return null
  }
}
