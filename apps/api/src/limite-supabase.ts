// Limite de tentativas sobre uma tabela do Supabase — a implementação que
// substitui `LimiteEmMemoria` (ver `limite.ts`) para valer em mais de uma
// instância e sobreviver a reiniciar o processo.
//
// A tabela (`app_limites`, migração 005) é NOVA e isolada, mesmo espírito de
// `SessoesNoSupabase`/`app_sessoes` — nenhuma tela do credenciei-web lê ou
// escreve nela.
//
// LIMITE CONHECIDO: ler e depois gravar são DUAS idas ao banco, não uma
// operação atômica — duas requisições simultâneas com a mesma chave podem,
// na pior das hipóteses, deixar passar uma tentativa além do máximo. Para o
// que este limite protege (desacelerar força bruta, não impedir por
// completo), a janela de corrida é aceitável; se um dia isto precisar ser
// exato, a conta vira uma função de banco (`increment`) numa chamada só.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { LimiteDeTentativas } from './limite.js'

export class LimiteNoSupabase implements LimiteDeTentativas {
  constructor(private db: SupabaseClient) {}

  async podePassar(chave: string, maximo: number, janelaMs: number, agora = Date.now()): Promise<boolean> {
    const { data } = await this.db
      .from('app_limites')
      .select('valida_ate, usos')
      .eq('chave', chave)
      .maybeSingle()

    if (!data || agora > new Date(data.valida_ate as string).getTime()) {
      await this.db
        .from('app_limites')
        .upsert({ chave, valida_ate: new Date(agora + janelaMs).toISOString(), usos: 1 })
      return true
    }

    if ((data.usos as number) >= maximo) return false

    await this.db.from('app_limites').update({ usos: (data.usos as number) + 1 }).eq('chave', chave)
    return true
  }
}
