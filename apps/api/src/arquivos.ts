// Arquivos gerados sob pedido (relatórios) — atrás de uma interface pequena,
// no mesmo espírito de `Sessoes`/`LimiteDeTentativas`: uma implementação em
// memória (testes, e quem ainda não tem Storage configurado) e uma de
// verdade sobre o Supabase Storage (`arquivos-supabase.ts`).
//
// ─── POR QUE O DOWNLOAD NÃO EXIGE O TOKEN DE SESSÃO ─────────────────────────
//
// A pessoa quer COMPARTILHAR o link (mandar pro grupo do WhatsApp, abrir no
// computador) — um link que só abre com o `Authorization` da sessão do
// celular não abriria em lugar nenhum. A segurança mora no LINK em si: opaco
// (um token de 16 bytes aqui; a assinatura de uma URL do Supabase na versão
// real) e que expira em 15 minutos.

import { randomBytes } from 'node:crypto'

export interface Arquivos {
  /** Guarda os bytes em `caminho` e devolve uma URL pronta para baixar. */
  guardar(caminho: string, tipo: string, bytes: Buffer): Promise<string>
}

type ArquivoGuardado = { nome: string; tipo: string; bytes: Buffer; expiraEm: number }

/** Por quanto tempo o link de download continua valendo — nas duas implementações. */
export const DURACAO_MS = 15 * 60_000

/**
 * Em memória — os testes, e quem ainda não ligou o Supabase Storage. Guarda
 * por um token opaco; `servidor.ts` serve os bytes de volta em
 * `/arquivos/:token`. Reiniciar o processo derruba todo link ainda válido —
 * mesma limitação de `SessoesEmMemoria`, e pelo mesmo motivo: é só o que
 * sustenta o caminho ANTES do Storage estar configurado.
 */
export class ArquivosEmMemoria implements Arquivos {
  private arquivos = new Map<string, ArquivoGuardado>()

  constructor(private urlBase: string) {}

  async guardar(caminho: string, tipo: string, bytes: Buffer): Promise<string> {
    const token = randomBytes(16).toString('hex')
    // O "nome" que aparece pro usuário é só o último pedaço do caminho — o
    // resto existe pela versão real (Supabase), que precisa de um caminho
    // que não colida entre eventos diferentes. Ver `relatorios.ts`.
    const nome = caminho.split('/').pop() ?? caminho
    this.arquivos.set(token, { nome, tipo, bytes, expiraEm: Date.now() + DURACAO_MS })
    return `${this.urlBase.replace(/\/+$/, '')}/arquivos/${token}`
  }

  /** `null` quando o token não existe ou já expirou — nunca lança. */
  buscar(token: string): ArquivoGuardado | null {
    const item = this.arquivos.get(token)
    if (!item) return null
    if (Date.now() > item.expiraEm) {
      this.arquivos.delete(token)
      return null
    }
    return item
  }
}
