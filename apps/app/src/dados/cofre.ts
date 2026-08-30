// Onde a sessão fica guardada no aparelho.
//
// Duas implementações porque os lugares são diferentes de verdade:
//
//   celular    o chaveiro do sistema (Keychain no iOS, Keystore no Android).
//              O conteúdo fica cifrado pelo próprio sistema operacional e não
//              sai num backup comum.
//
//   navegador  não existe chaveiro. Sobra o armazenamento do site, que é o
//              mesmo lugar onde qualquer aplicação web guarda sessão.
//
// A diferença é real e vale saber: na web, o token de renovação está tão
// protegido quanto o de um site comum — nem mais, nem menos. A web existe hoje
// para desenvolver e demonstrar sem depender de aparelho; quando virar produto,
// é uma decisão a revisitar.

import { Platform } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as SecureStore from 'expo-secure-store'
import type { Cofre } from '../sessao/guarda'

/**
 * O cofre do celular.
 *
 * Toda operação é tolerante a falha: chaveiro indisponível (aparelho sem
 * bloqueio de tela configurado, por exemplo) devolve "não tem nada guardado" em
 * vez de derrubar o app. Pedir login de novo é chato; não abrir é fatal.
 */
const chaveiro: Cofre = {
  async ler(chave) {
    try {
      return await SecureStore.getItemAsync(chave)
    } catch {
      return null
    }
  },
  async gravar(chave, valor) {
    await SecureStore.setItemAsync(chave, valor)
  },
  async apagar(chave) {
    try {
      await SecureStore.deleteItemAsync(chave)
    } catch {
      // Apagar o que já não existe não é erro.
    }
  },
}

const navegador: Cofre = {
  async ler(chave) {
    try {
      return await AsyncStorage.getItem(chave)
    } catch {
      return null
    }
  },
  async gravar(chave, valor) {
    await AsyncStorage.setItem(chave, valor)
  },
  async apagar(chave) {
    try {
      await AsyncStorage.removeItem(chave)
    } catch {
      // idem
    }
  },
}

export const cofreDoAparelho: Cofre = Platform.OS === 'web' ? navegador : chaveiro
