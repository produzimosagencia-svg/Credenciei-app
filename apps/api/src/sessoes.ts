// Sessões: quem é o dono do token que chegou.
//
// ─── DOIS TOKENS, E NÃO UM ──────────────────────────────────────────────────
//
//   acesso     curto (1h), mandado em toda requisição
//   renovação  longo (60 dias), guardado no cofre do aparelho e usado só para
//              trocar por um acesso novo
//
// Um token só, longo, seria mais simples e pior: ele viaja em toda chamada, e
// qualquer vazamento — um log, um proxy, um erro de configuração — daria acesso
// permanente. O de acesso vaza e expira em uma hora; o de renovação quase não
// circula.
//
// Sessenta dias no de renovação vem da operação: quem trabalha um evento por
// trimestre não pode ser obrigado a pedir código toda vez que abre o app, ou o
// login por WhatsApp deixa de ser conveniência e vira obstáculo.
//
// ─── A LIMITAÇÃO DESTA VERSÃO ───────────────────────────────────────────────
//
// As sessões vivem na memória do processo. Reiniciar o servidor desconecta
// todo mundo, e com várias instâncias cada uma tem as suas.
//
// É uma etapa, não um desenho: a interface já está certa, e trocar por uma
// tabela é substituir a implementação. Antes da produção, obrigatório.

import type { Papel } from '@credenciei/dominio'

export type SessaoAberta = {
  token: string
  expiraEm: string
  renovacao: string
  papel: Papel
}

export const VALIDADE_ACESSO_MS = 60 * 60_000
export const VALIDADE_RENOVACAO_MS = 60 * 24 * 60 * 60_000

export interface Sessoes {
  /**
   * O papel é decidido por quem chama `abrir` — login por WhatsApp sempre
   * abre como `'colaborador'`; login por senha lê o papel do perfil. A
   * sessão nunca descobre o papel sozinha, e não o reconsulta depois: mudar
   * o papel de alguém no meio da sessão dela é assunto de derrubar a
   * sessão, não de ela se atualizar sozinha.
   */
  abrir(pessoaId: string, papel: Papel): Promise<SessaoAberta>
  sessaoDoToken(token: string): Promise<{ pessoaId: string; papel: Papel } | null>
  renovar(renovacao: string): Promise<SessaoAberta | null>
  /** Sair, ou aparelho perdido. */
  encerrar(token: string): Promise<void>
  /**
   * Derruba TODAS as sessões da pessoa, de qualquer aparelho — usado só ao
   * excluir a conta: continuar deixando entrar de um aparelho já logado
   * enquanto o cadastro está sendo anonimizado não faria sentido.
   */
  encerrarTodasDaPessoa(pessoaId: string): Promise<void>
}

type Registro = { pessoaId: string; papel: Papel; expiraEm: number }

export class SessoesEmMemoria implements Sessoes {
  private acessos = new Map<string, Registro>()
  private renovacoes = new Map<string, Registro>()
  private agora: () => number
  private novoToken: () => string

  constructor(op: { agora?: () => number; novoToken?: () => string } = {}) {
    this.agora = op.agora ?? (() => Date.now())
    this.novoToken = op.novoToken ?? padraoToken
  }

  async abrir(pessoaId: string, papel: Papel): Promise<SessaoAberta> {
    const token = this.novoToken()
    const renovacao = this.novoToken()
    const agora = this.agora()

    this.acessos.set(token, { pessoaId, papel, expiraEm: agora + VALIDADE_ACESSO_MS })
    this.renovacoes.set(renovacao, { pessoaId, papel, expiraEm: agora + VALIDADE_RENOVACAO_MS })

    return {
      token,
      renovacao,
      expiraEm: new Date(agora + VALIDADE_ACESSO_MS).toISOString(),
      papel,
    }
  }

  async sessaoDoToken(token: string): Promise<{ pessoaId: string; papel: Papel } | null> {
    const r = this.acessos.get(token)
    if (!r) return null
    if (this.agora() > r.expiraEm) {
      this.acessos.delete(token)
      return null
    }
    return { pessoaId: r.pessoaId, papel: r.papel }
  }

  async renovar(renovacao: string): Promise<SessaoAberta | null> {
    const r = this.renovacoes.get(renovacao)
    if (!r || this.agora() > r.expiraEm) {
      this.renovacoes.delete(renovacao)
      return null
    }
    /*
     * O token de renovação é queimado e trocado por um novo.
     *
     * Sem isso, um de renovação vazado valeria sessenta dias inteiros. Trocando
     * a cada uso, o roubado para de funcionar assim que a pessoa legítima abrir
     * o app — e a sessão dela cair sem explicação é o sinal de que algo
     * aconteceu.
     */
    this.renovacoes.delete(renovacao)
    return this.abrir(r.pessoaId, r.papel)
  }

  async encerrar(token: string): Promise<void> {
    this.acessos.delete(token)
  }

  async encerrarTodasDaPessoa(pessoaId: string): Promise<void> {
    for (const mapa of [this.acessos, this.renovacoes]) {
      for (const [k, v] of mapa) if (v.pessoaId === pessoaId) mapa.delete(k)
    }
  }

  /** Remove o que já venceu — sem isto o mapa cresce para sempre. */
  limpar(): number {
    const agora = this.agora()
    let n = 0
    for (const mapa of [this.acessos, this.renovacoes]) {
      for (const [k, v] of mapa) if (agora > v.expiraEm) { mapa.delete(k); n++ }
    }
    return n
  }
}

function padraoToken(): string {
  const c = globalThis.crypto
  if (c?.getRandomValues) {
    const v = new Uint8Array(32)
    c.getRandomValues(v)
    return [...v].map(b => b.toString(16).padStart(2, '0')).join('')
  }
  /*
   * Sem `crypto`, o processo não sobe.
   *
   * `Math.random` é previsível, e um token de sessão previsível é uma sessão
   * de qualquer pessoa. Melhor não subir do que subir inseguro sem avisar.
   */
  throw new Error('Sem gerador criptográfico disponível: não é seguro emitir tokens de sessão.')
}
