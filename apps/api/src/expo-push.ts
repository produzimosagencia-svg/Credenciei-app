// Manda notificação push de verdade, pela API do Expo.
//
// ─── POR QUE A EXPO, E NÃO O FIREBASE/APNS DIRETO ───────────────────────────
//
// O app já usa `expo-notifications`, que registra um token no formato
// `ExponentPushToken[...]` — esse token só a Expo sabe entregar. É a Expo
// quem fala com o FCM (Android) e a APNs (iOS) por trás, usando as
// credenciais que já configuramos (`eas credentials`, 21/09/2026): a conta
// de serviço do Firebase pro Android, e a chave APNs pro iOS quando existir.
// Não precisa de token de autenticação nosso pra chamar essa API — a
// validação é pelo token do aparelho em si.
//
// ─── POR QUE HÁ UM MODO SEM ENVIO DE VERDADE ────────────────────────────────
//
// Mesmo padrão de `whatsapp.ts`: sem nada pra configurar aqui (a Expo não
// exige chave), o "desligado" é só pra testar local sem barulho de push de
// verdade disparando sem querer — controlado pelo mesmo tipo de interruptor
// (`PUSH_PAUSADO`).

import type { EnviarPush } from './rotas/lembretes.js'

const URL_EXPO_PUSH = 'https://exp.host/--/api/v2/push/send'

function envioDesligado(): boolean {
  return process.env.PUSH_PAUSADO === 'true'
}

export const enviarPushDeVerdade: EnviarPush = async (tokens, mensagem) => {
  if (envioDesligado()) {
    // eslint-disable-next-line no-console
    console.log(`[push desligado] ${mensagem.titulo} — ${tokens.length} aparelho(s)`)
    return
  }

  const validos = tokens.filter(t => t.startsWith('ExponentPushToken'))
  if (!validos.length) return

  const resposta = await fetch(URL_EXPO_PUSH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    signal: AbortSignal.timeout(20_000),
    body: JSON.stringify(validos.map(to => ({
      to, title: mensagem.titulo, body: mensagem.corpo, data: mensagem.dados ?? {},
    }))),
  })

  if (!resposta.ok) {
    const corpo = await resposta.json().catch(() => null)
    throw new Error(`A Expo recusou o envio: ${JSON.stringify(corpo ?? resposta.statusText)}`)
  }
}
