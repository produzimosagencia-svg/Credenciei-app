// Sessões sobre uma tabela do Supabase — a implementação que substitui
// `SessoesEmMemoria` (ver `sessoes.ts`) para valer em mais de uma instância e
// sobreviver a reiniciar o processo.
//
// A tabela (`app_sessoes`, migração 004) é NOVA e isolada: nenhuma tela do
// credenciei-web lê ou escreve nela. O `pessoa_id` é `text`, não `uuid`,
// porque carrega dois formatos diferentes — o uuid de verdade de quem tem
// conta de painel, e o id sintético `pes-...` de colaborador, enquanto a
// tabela `pessoas` (migração 001) não roda neste projeto.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Papel } from '@credenciei/dominio'
import { VALIDADE_ACESSO_MS, VALIDADE_RENOVACAO_MS, type SessaoAberta, type Sessoes } from './sessoes.js'

function padraoToken(): string {
  const v = new Uint8Array(32)
  globalThis.crypto.getRandomValues(v)
  return [...v].map(b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Quanto tempo uma validação de token fica em memória antes de conferir a
 * tabela de novo.
 *
 * `sessaoDoToken` roda em TODA requisição autenticada — virou o caminho mais
 * quente da API no dia em que trocou de mapa em memória (microssegundos)
 * para uma ida de rede ao Supabase (~100ms cada, medido em 12/09/2026: o app
 * "travando muito" era isto). Sem cache, cada toque na tela pagava essa
 * latência de novo, mesmo com o MESMO token de segundos atrás.
 *
 * O custo: se `encerrar` rodar numa instância e outra requisição (nesta
 * mesma instância) já tiver o token em cache, a sessão encerrada ainda
 * responde por até este tanto de tempo. Curto o bastante para não importar
 * numa portaria de evento; comprido o bastante para tirar quase toda a
 * latência do caminho comum.
 */
const CACHE_MS = 20_000

type Validado = { pessoaId: string; papel: Papel; expiraEmMs: number; cacheadoAte: number }

export class SessoesNoSupabase implements Sessoes {
  private db: SupabaseClient
  private agora: () => number
  private novoToken: () => string
  private cache = new Map<string, Validado>()

  constructor(db: SupabaseClient, op: { agora?: () => number; novoToken?: () => string } = {}) {
    this.db = db
    this.agora = op.agora ?? (() => Date.now())
    this.novoToken = op.novoToken ?? padraoToken
  }

  async abrir(pessoaId: string, papel: Papel): Promise<SessaoAberta> {
    const token = this.novoToken()
    const renovacao = this.novoToken()
    const agora = this.agora()

    const { error } = await this.db.from('app_sessoes').insert([
      {
        token, tipo: 'acesso', pessoa_id: pessoaId, papel,
        expira_em: new Date(agora + VALIDADE_ACESSO_MS).toISOString(),
      },
      {
        token: renovacao, tipo: 'renovacao', pessoa_id: pessoaId, papel,
        expira_em: new Date(agora + VALIDADE_RENOVACAO_MS).toISOString(),
      },
    ])
    if (error) throw new Error('Não foi possível abrir a sessão.')

    return {
      token,
      renovacao,
      expiraEm: new Date(agora + VALIDADE_ACESSO_MS).toISOString(),
      papel,
    }
  }

  async sessaoDoToken(token: string): Promise<{ pessoaId: string; papel: Papel } | null> {
    const agora = this.agora()
    const emCache = this.cache.get(token)
    if (emCache && agora < emCache.cacheadoAte) {
      if (agora > emCache.expiraEmMs) return null
      return { pessoaId: emCache.pessoaId, papel: emCache.papel }
    }

    const { data } = await this.db
      .from('app_sessoes')
      .select('pessoa_id, papel, expira_em')
      .eq('token', token)
      .eq('tipo', 'acesso')
      .maybeSingle()
    if (!data) {
      this.cache.delete(token)
      return null
    }

    const expiraEmMs = new Date(data.expira_em as string).getTime()
    if (agora > expiraEmMs) {
      // Vencido: apaga e trata como se não existisse. Não precisa esperar
      // resposta — quem chamou já sabe que a sessão não vale mais.
      void this.db.from('app_sessoes').delete().eq('token', token)
      this.cache.delete(token)
      return null
    }

    const pessoaId = data.pessoa_id as string
    const papel = data.papel as Papel
    this.cache.set(token, { pessoaId, papel, expiraEmMs, cacheadoAte: agora + CACHE_MS })
    return { pessoaId, papel }
  }

  async renovar(renovacao: string): Promise<SessaoAberta | null> {
    const { data } = await this.db
      .from('app_sessoes')
      .select('pessoa_id, papel, expira_em')
      .eq('token', renovacao)
      .eq('tipo', 'renovacao')
      .maybeSingle()

    /*
     * O token de renovação é queimado e trocado por um novo — mesma regra de
     * `SessoesEmMemoria`. Sem isto, um de renovação vazado valeria sessenta
     * dias inteiros; trocando a cada uso, o roubado para de funcionar assim
     * que a pessoa legítima abrir o app.
     */
    await this.db.from('app_sessoes').delete().eq('token', renovacao)

    if (!data || this.agora() > new Date(data.expira_em as string).getTime()) return null
    return this.abrir(data.pessoa_id as string, data.papel as Papel)
  }

  async encerrar(token: string): Promise<void> {
    this.cache.delete(token)
    await this.db.from('app_sessoes').delete().eq('token', token)
  }

  /** Remove o que já venceu — sem isto a tabela cresce para sempre. Chamar periodicamente. */
  async limpar(): Promise<number> {
    const { data } = await this.db
      .from('app_sessoes')
      .delete()
      .lt('expira_em', new Date(this.agora()).toISOString())
      .select('token')
    return data?.length ?? 0
  }
}
