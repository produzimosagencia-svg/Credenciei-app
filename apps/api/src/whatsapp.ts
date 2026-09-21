// Envia o código de entrar pelo WhatsApp.
//
// ─── POR QUE ISTO NÃO É SÓ COPIAR O SITE ────────────────────────────────────
//
// O credenciei-web não tem este fluxo: lá quem tem conta de painel entra com
// CPF/e-mail + senha, nunca por código. O código de 6 dígitos é uma decisão
// só deste app, pro colaborador (que não tem senha nenhuma) — ver CLAUDE.md.
//
// O que SE reaproveita do site é o TRANSPORTE — a Meta Cloud API, a mesma
// formatação de telefone (`formatarNumeroWhatsApp`, copiada de
// `lib/whatsapp-meta.ts`) — porque é o mesmo número, a mesma conta Meta.
//
// ─── POR QUE HÁ UM MODO SEM ENVIO DE VERDADE ────────────────────────────────
//
// Mandar de verdade exige um TEMPLATE DE AUTENTICAÇÃO aprovado pela Meta
// Business Manager — um processo manual, fora deste código, que só o Juan
// pode iniciar (e que a Meta pode levar horas ou dias para aprovar). Até lá
// (ou sempre que `WHATSAPP_PAUSADO=true`, mesmo interruptor que o site usa,
// ou sem `WHATSAPP_TOKEN` configurado), o código só é escrito no terminal —
// dá pra testar o resto da API de ponta a ponta sem esperar a Meta.

import type { EnviarPorWhatsapp } from './rotas/sessao.js'

const URL_BASE_META = 'https://graph.facebook.com/v21.0'

/**
 * `55` + DDD + número, sem `+`, sem espaço — o formato que a Meta espera no
 * campo `to`. Copiado de `formatarNumeroWhatsApp` em `lib/whatsapp-meta.ts`
 * do site: 10-11 dígitos (sem DDI) ganham o `55` na frente; 12-13 que já
 * começam com `55` passam direto; o resto é inválido.
 */
export function formatarNumeroWhatsApp(telefone: string): string | null {
  const digitos = (telefone ?? '').replace(/\D/g, '')
  if (digitos.length === 10 || digitos.length === 11) return `55${digitos}`
  if (digitos.length === 12 || digitos.length === 13) {
    return digitos.startsWith('55') ? digitos : null
  }
  return null
}

/**
 * `true` enquanto não há como mandar de verdade: sem token, sem phone id, ou
 * com o interruptor de emergência ligado (mesma variável do site,
 * `WHATSAPP_PAUSADO` — para os dois sistemas pararem juntos se precisar).
 */
function envioDesligado(): boolean {
  if (process.env.WHATSAPP_PAUSADO === 'true') return true
  return !process.env.WHATSAPP_TOKEN || !process.env.WHATSAPP_PHONE_ID
}

async function enviarTemplateDeAutenticacao(numero: string, codigo: string): Promise<void> {
  const token = process.env.WHATSAPP_TOKEN!
  const phoneId = process.env.WHATSAPP_PHONE_ID!
  const template = process.env.WHATSAPP_TEMPLATE_CODIGO ?? 'entrar_codigo'

  const resposta = await fetch(`${URL_BASE_META}/${phoneId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(20_000),
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: numero,
      type: 'template',
      template: {
        name: template,
        language: { code: 'pt_BR' },
        components: [
          { type: 'body', parameters: [{ type: 'text', text: codigo }] },
          // Todo template de AUTENTICAÇÃO da Meta tem o botão "copiar código"
          // — o código entra de novo aqui, ou a Meta recusa por contagem de
          // parâmetro errada. Mesmo padrão de `TEMPLATES_AUTENTICACAO` no site.
          { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: codigo }] },
        ],
      },
    }),
  })

  if (!resposta.ok) {
    const corpo = await resposta.json().catch(() => null)
    throw new Error(`A Meta recusou o envio: ${JSON.stringify(corpo?.error ?? resposta.statusText)}`)
  }
}

export const enviarCodigoPeloWhatsapp: EnviarPorWhatsapp = async (telefone, codigo) => {
  if (envioDesligado()) {
    // eslint-disable-next-line no-console
    console.log(`[whatsapp desligado] código para ${telefone}: ${codigo}`)
    return
  }

  const numero = formatarNumeroWhatsApp(telefone)
  if (!numero) throw new Error(`Telefone inválido para WhatsApp: ${telefone}`)
  await enviarTemplateDeAutenticacao(numero, codigo)
}
