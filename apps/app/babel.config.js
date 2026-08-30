// A configuração mínima que o Expo pede. O `babel-preset-expo` já entende
// TypeScript, JSX e as rotas por arquivo do expo-router — não é preciso plugin
// extra desde o SDK 50.
module.exports = function (api) {
  api.cache(true)
  return { presets: ['babel-preset-expo'] }
}
