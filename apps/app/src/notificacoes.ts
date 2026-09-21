// Registro do token de push — a metade "aparelho avisa que existe" do app.
// Só isso: pedir permissão, pegar o token do Expo, e mandar pro servidor
// guardar. Não decide QUANDO nem O QUE notificar — isso ainda depende de uma
// decisão do Juan (lembrete automático × aviso escrito por um admin, ver
// seção 7 de `docs/credenciei-web-estado-atual.md`).
//
// ─── POR QUE TUDO AQUI ENGOLE O PRÓPRIO ERRO ────────────────────────────────
//
// Notificação é conveniência: ninguém deveria ficar impedido de bater ponto
// porque o registro de push falhou. Cada saída antecipada (sem aparelho de
// verdade, sem permissão, sem projeto EAS configurado) é o caminho normal
// até que as duas peças que faltam (Apple/APNs e o projeto EAS) existam —
// não um bug.

import * as Device from 'expo-device'
import * as Notifications from 'expo-notifications'
import Constants from 'expo-constants'
import { Platform } from 'react-native'
import type { ClienteApi } from '@credenciei/contrato'

/**
 * Pede permissão (se ainda não foi negada) e registra o token deste
 * aparelho no servidor. Chamar de novo não tem custo — o servidor faz
 * upsert pelo token, então repetir é o mesmo que não fazer nada.
 */
export async function registrarTokenDePush(cliente: ClienteApi): Promise<void> {
  try {
    // Emulador/simulador geralmente não recebe push de verdade — pedir
    // permissão ali só treina a pessoa a clicar "permitir" à toa.
    if (!Device.isDevice) return
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') return

    const atual = await Notifications.getPermissionsAsync()
    let status = atual.status
    if (status !== 'granted') {
      const pedido = await Notifications.requestPermissionsAsync()
      status = pedido.status
    }
    if (status !== 'granted') return

    // Sem projeto EAS (`eas init`), o Expo não tem pra onde mandar o token —
    // a chamada abaixo lançaria. Isso é esperado até o projeto existir.
    const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined
    if (!projectId) return

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId })
    await cliente.registrarTokenDePush(token, Platform.OS)
  } catch {
    // Convite recusado, aparelho sem Play Services, rede caiu no meio —
    // nenhum desses motivos deveria aparecer pra pessoa como um erro.
  }
}
