// A fila de batidas que sobrevive à falta de internet.
//
// ─── O QUE ESTA FILA PROTEGE ────────────────────────────────────────────────
//
// Uma batida perdida não é um erro de software: é uma pessoa que trabalhou e
// não vai receber. Por isso a fila é conservadora em tudo — na dúvida, ela
// guarda. O único caso em que descarta é quando o servidor disse explicitamente
// que aquela batida não vale, e disse por quê.
//
// ─── ORDEM IMPORTA ──────────────────────────────────────────────────────────
//
// As batidas sobem na ordem em que foram feitas. Não é capricho: o servidor
// calcula o meio a partir da entrada e recusa a saída sem o meio. Enviar fora
// de ordem faria o servidor recusar batidas legítimas — e a fila, obedecendo,
// as descartaria como recusa definitiva.

import type {
  Armazem, BatidaPendente, EstadoBatida, Relogio,
  ResultadoEnvio, TipoBatida, Transporte,
} from './tipos.js'

/**
 * Quanto tempo uma batida enviada fica visível antes de sumir da lista.
 *
 * Não some na hora de propósito: a pessoa acabou de tocar no botão e precisa
 * ver a confirmação. Sumir instantaneamente parece que nada aconteceu.
 */
const VISIVEL_APOS_ENVIO_MS = 60_000

/**
 * Recuo progressivo entre tentativas: 2s, 4s, 8s… até 5 minutos.
 *
 * Tentar de segundo em segundo numa rede saturada de evento piora a rede para
 * todo mundo — mil aparelhos insistindo juntos é exatamente o que derruba o
 * sinal. O teto existe porque, quando a rede volta, ninguém quer esperar meia
 * hora pela próxima tentativa.
 */
const RECUO_BASE_MS = 2_000
const RECUO_TETO_MS = 5 * 60_000

export function recuoDaTentativa(tentativas: number): number {
  return Math.min(RECUO_BASE_MS * 2 ** Math.max(0, tentativas - 1), RECUO_TETO_MS)
}

/**
 * Depois de quantas tentativas a fila desiste sozinha.
 *
 * Com o recuo acima, trinta tentativas cobrem várias horas — muito mais do que
 * qualquer buraco de sinal em evento. O limite existe para uma batida corrompida
 * não ficar girando para sempre e consumir bateria.
 */
const TENTATIVAS_MAXIMAS = 30

type Ouvinte = (fila: BatidaPendente[]) => void

export type OpcoesDaFila = {
  armazem: Armazem
  transporte: Transporte
  /** Injetável para os testes não precisarem esperar de verdade. */
  agora?: Relogio
  /** Injetável porque `crypto.randomUUID` não existe em todo lugar. */
  novoId?: () => string
}

export class FilaDeBatidas {
  private itens: BatidaPendente[] = []
  private carregada = false
  private sincronizando = false
  private ouvintes = new Set<Ouvinte>()

  private readonly armazem: Armazem
  private readonly transporte: Transporte
  private readonly agora: Relogio
  private readonly novoId: () => string

  constructor(op: OpcoesDaFila) {
    this.armazem = op.armazem
    this.transporte = op.transporte
    this.agora = op.agora ?? (() => Date.now())
    this.novoId =
      op.novoId ??
      (() =>
        // `crypto.randomUUID` existe no Node e nos navegadores modernos, mas
        // não em toda versão do React Native. A alternativa não precisa ser
        // criptográfica: só precisa não repetir dentro de um aparelho.
        globalThis.crypto?.randomUUID?.() ??
        `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`)
  }

  // ── Leitura ───────────────────────────────────────────────────────────────

  /** Recupera o que ficou de sessões anteriores. Idempotente. */
  async carregar(): Promise<void> {
    if (this.carregada) return
    try {
      const cru = await this.armazem.ler()
      const lido: unknown = cru ? JSON.parse(cru) : []
      this.itens = Array.isArray(lido) ? (lido as BatidaPendente[]).filter(temFormatoValido) : []
    } catch {
      /*
       * Conteúdo corrompido não pode derrubar o aplicativo inteiro.
       *
       * É a escolha menos ruim entre duas ruins: recomeçar de uma fila vazia
       * perde batidas, mas travar na abertura impede a pessoa de bater as
       * próximas. Perder o passado é melhor do que perder o presente também.
       */
      this.itens = []
    }
    /*
     * "Enviando" não sobrevive a um recomeço.
     *
     * Se o aplicativo morreu no meio de um envio — bateria, pessoa fechando a
     * tela —, a batida ficou gravada nesse estado. Só que `sincronizar` só olha
     * as pendentes: ela ficaria parada para sempre, contando como pendente na
     * tela e nunca sendo tentada de novo. Volta para a fila.
     *
     * Reenviar é seguro: é para isso que existe a chave de idempotência.
     */
    for (const b of this.itens) if (b.estado === 'enviando') b.estado = 'pendente'

    this.carregada = true
    this.avisar()
  }

  /** Tudo que a fila conhece, na ordem em que foi registrado. */
  todas(): BatidaPendente[] {
    return [...this.itens]
  }

  /** Só o que ainda não chegou ao servidor — o número que a tela mostra. */
  pendentes(): BatidaPendente[] {
    return this.itens.filter(b => b.estado === 'pendente' || b.estado === 'enviando')
  }

  /** O que o servidor recusou e a pessoa precisa ver. */
  recusadas(): BatidaPendente[] {
    return this.itens.filter(b => b.estado === 'recusada')
  }

  observar(f: Ouvinte): () => void {
    this.ouvintes.add(f)
    return () => this.ouvintes.delete(f)
  }

  // ── Escrita ───────────────────────────────────────────────────────────────

  /**
   * Registra uma batida. Grava ANTES de tentar enviar.
   *
   * A ordem importa: se o aplicativo morrer entre a batida e o envio — bateria
   * acabando, pessoa fechando a tela —, a batida já está no disco. Tentar
   * enviar primeiro e gravar depois perderia exatamente as batidas feitas nas
   * piores condições, que são as que mais precisam da fila.
   */
  async registrar(dados: {
    participacaoId: string
    tipo: TipoBatida
    foto?: string
    lat?: number
    lng?: number
    /** Só para testes e para reprocessar; normalmente é o relógio do aparelho. */
    registradoEm?: string
  }): Promise<BatidaPendente> {
    await this.carregar()

    const batida: BatidaPendente = {
      id: this.novoId(),
      participacaoId: dados.participacaoId,
      tipo: dados.tipo,
      registradoEm: dados.registradoEm ?? new Date(this.agora()).toISOString(),
      ...(dados.foto !== undefined ? { foto: dados.foto } : {}),
      ...(dados.lat !== undefined ? { lat: dados.lat } : {}),
      ...(dados.lng !== undefined ? { lng: dados.lng } : {}),
      estado: 'pendente',
      tentativas: 0,
    }

    this.itens.push(batida)
    await this.persistir()
    return batida
  }

  /**
   * Tenta enviar tudo que está pendente e maduro, em ordem.
   *
   * Chamável à vontade: quando a conexão volta, quando a tela abre, de tempos
   * em tempos. Duas chamadas ao mesmo tempo não se atropelam — a segunda
   * desiste, porque enviar a mesma batida em paralelo é como se cria duplicata
   * que a idempotência depois precisa limpar.
   */
  async sincronizar(): Promise<{ enviadas: number; recusadas: number; restantes: number }> {
    await this.carregar()
    if (this.sincronizando) {
      return { enviadas: 0, recusadas: 0, restantes: this.pendentes().length }
    }
    this.sincronizando = true

    let enviadas = 0
    let recusadas = 0

    try {
      for (const batida of this.itens) {
        if (batida.estado !== 'pendente') continue
        // Ainda de castigo pelo recuo: para a fila aqui em vez de pular.
        // Pular quebraria a ordem, e o servidor recusaria a saída de alguém
        // cuja entrada ficou para trás.
        if (batida.proximaTentativaEm && this.agora() < Date.parse(batida.proximaTentativaEm)) break

        batida.estado = 'enviando'
        this.avisar()

        let r: ResultadoEnvio
        try {
          r = await this.transporte(batida)
        } catch {
          // Exceção do transporte é sempre falha de rede: se o servidor tivesse
          // decidido algo, teria respondido.
          r = { ok: false, definitivo: false }
        }

        if (r.ok) {
          batida.estado = 'enviada'
          batida.enviadaEm = new Date(this.agora()).toISOString()
          delete batida.proximaTentativaEm
          delete batida.motivo
          enviadas++
        } else if (r.definitivo) {
          batida.estado = 'recusada'
          batida.motivo = r.motivo
          recusadas++
        } else {
          batida.tentativas++
          if (batida.tentativas >= TENTATIVAS_MAXIMAS) {
            batida.estado = 'recusada'
            batida.motivo = 'Não conseguimos enviar esta batida. Procure o credenciamento.'
            recusadas++
          } else {
            batida.estado = 'pendente'
            batida.proximaTentativaEm = new Date(this.agora() + recuoDaTentativa(batida.tentativas)).toISOString()
            /*
             * PARA a sincronização inteira na primeira falha de rede.
             *
             * Se a rede caiu para esta batida, caiu para as seguintes. Insistir
             * nas outras só gastaria bateria e quebraria a ordem — e ordem é o
             * que garante que a entrada chegue antes da saída.
             */
            break
          }
        }
        await this.persistir()
      }
    } finally {
      this.sincronizando = false
    }

    await this.limpar()
    return { enviadas, recusadas, restantes: this.pendentes().length }
  }

  /**
   * Tira da fila uma batida recusada, depois que a pessoa leu o motivo.
   *
   * Só as recusadas: uma pendente ainda pode ir, e apagá-la seria jogar fora
   * trabalho feito.
   */
  async descartar(id: string): Promise<boolean> {
    await this.carregar()
    const i = this.itens.findIndex(b => b.id === id && b.estado === 'recusada')
    if (i < 0) return false
    this.itens.splice(i, 1)
    await this.persistir()
    return true
  }

  // ── Interno ───────────────────────────────────────────────────────────────

  /**
   * Some com o que já foi enviado e a pessoa teve tempo de ver.
   *
   * Conta a partir do ENVIO, não da batida. Uma batida feita às 14:00 e enviada
   * às 17:00, quando o sinal voltou, sumiria na hora se o corte olhasse
   * `registradoEm` — bem no momento em que a pessoa mais quer ver que deu certo.
   */
  private async limpar(): Promise<void> {
    const corte = this.agora() - VISIVEL_APOS_ENVIO_MS
    const antes = this.itens.length
    this.itens = this.itens.filter(
      b => b.estado !== 'enviada' || !b.enviadaEm || Date.parse(b.enviadaEm) > corte,
    )
    if (this.itens.length !== antes) await this.persistir()
  }

  private async persistir(): Promise<void> {
    await this.armazem.gravar(JSON.stringify(this.itens))
    this.avisar()
  }

  private avisar(): void {
    const copia = this.todas()
    for (const f of this.ouvintes) f(copia)
  }
}

/** Descarta lixo do armazenamento sem derrubar o resto da fila. */
function temFormatoValido(b: unknown): b is BatidaPendente {
  if (!b || typeof b !== 'object') return false
  const x = b as Record<string, unknown>
  const estados: EstadoBatida[] = ['pendente', 'enviando', 'enviada', 'recusada']
  return (
    typeof x.id === 'string' &&
    typeof x.participacaoId === 'string' &&
    typeof x.registradoEm === 'string' &&
    (x.tipo === 'entrada' || x.tipo === 'meio' || x.tipo === 'fim') &&
    estados.includes(x.estado as EstadoBatida) &&
    typeof x.tentativas === 'number'
  )
}
