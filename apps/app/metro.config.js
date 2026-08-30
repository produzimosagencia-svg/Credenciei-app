// Como o empacotador do app encontra os arquivos.
//
// ─── O ÚNICO AJUSTE QUE ESTE ARQUIVO FAZ ────────────────────────────────────
//
// Os pacotes compartilhados (`packages/dominio`, `contrato`, `offline`) são
// TypeScript, e escrevem os imports internos assim:
//
//     export * from './janelas.js'
//
// Isso não é engano. É a convenção do TypeScript moderno: o código-fonte cita o
// nome que o arquivo VAI TER depois de compilado. O compilador, o `tsx` e o
// Node entendem e vão buscar `janelas.ts`.
//
// O Metro — o empacotador do React Native — não faz essa tradução. Ele procura
// literalmente por `janelas.js`, não acha, e o app inteiro deixa de compilar.
//
// A tradução vai abaixo, e SÓ para os nossos pacotes. Aplicar em tudo seria
// perigoso: dentro de `node_modules` existe biblioteca que traz `.js` e `.ts`
// com o mesmo nome, e aí tirar a extensão faria o Metro escolher o arquivo
// errado, em silêncio.
//
// Fora isso, nada é configurado à mão: desde o SDK 52 o Expo já resolve sozinho
// o funcionamento dentro de um monorepo.

const { getDefaultConfig } = require('expo/metro-config')
const path = require('path')

const config = getDefaultConfig(__dirname)

const NOSSOS_PACOTES = path.resolve(__dirname, '..', '..', 'packages')

config.resolver.resolveRequest = (contexto, pedido, plataforma) => {
  const veioDosNossosPacotes =
    typeof contexto.originModulePath === 'string' &&
    contexto.originModulePath.startsWith(NOSSOS_PACOTES)

  if (veioDosNossosPacotes && pedido.startsWith('.') && pedido.endsWith('.js')) {
    // Sem a extensão, o Metro tenta `.ts` e `.tsx` sozinho — que é o que existe.
    return contexto.resolveRequest(contexto, pedido.slice(0, -'.js'.length), plataforma)
  }

  return contexto.resolveRequest(contexto, pedido, plataforma)
}

module.exports = config
