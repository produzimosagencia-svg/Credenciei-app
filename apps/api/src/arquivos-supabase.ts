// A implementação de verdade de `Arquivos` (ver `arquivos.ts`) — sobe o
// relatório para um bucket do Supabase Storage e devolve uma URL ASSINADA,
// em vez de guardar os bytes na memória do processo.
//
// Bucket ISOLADO (`app-relatorios`), criado por este app — ao contrário do
// bucket da foto da batida (`presencas`), que é o MESMO que o
// credenciei-web já usa. Aqui não tem o que reaproveitar: o site gera a
// planilha e devolve na hora, na resposta HTTP; ele nunca precisou de um
// link para compartilhar depois, que é o problema que este arquivo resolve.
//
// `upsert: true` e um caminho DETERMINÍSTICO (evento/relatório-período-quem,
// ver `relatorios.ts`): gerar o mesmo relatório de novo troca o arquivo
// antigo por cima, em vez de acumular uma cópia por pedido para sempre.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Arquivos } from './arquivos.js'

const BUCKET = 'app-relatorios'

/** Mesma janela da versão em memória — o link vale por 15 minutos. */
const VALIDADE_S = 15 * 60

export class ArquivosNoSupabase implements Arquivos {
  constructor(private db: SupabaseClient) {}

  async guardar(caminho: string, tipo: string, bytes: Buffer): Promise<string> {
    const { error: erroDeUpload } = await this.db.storage
      .from(BUCKET)
      .upload(caminho, bytes, { contentType: tipo, upsert: true })
    if (erroDeUpload) throw new Error(`Falha ao subir o relatório: ${erroDeUpload.message}`)

    // `download: true` mantém o mesmo comportamento de antes — o navegador
    // baixa o arquivo (com o nome original) em vez de tentar abrir inline.
    const { data, error: erroDeUrl } = await this.db.storage
      .from(BUCKET)
      .createSignedUrl(caminho, VALIDADE_S, { download: true })
    if (erroDeUrl || !data) throw new Error(`Falha ao gerar o link: ${erroDeUrl?.message ?? 'sem dados'}`)

    return data.signedUrl
  }
}
