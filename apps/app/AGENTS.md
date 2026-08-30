# Notas para quem for mexer no app

**O Expo muda rápido.** Este app está no **SDK 57**. Antes de escrever código
que use uma API do Expo, confira a documentação DA VERSÃO:
<https://docs.expo.dev/versions/v57.0.0/> — respostas de memória costumam estar
uma ou duas versões atrás e falham em silêncio.

**A regra de negócio não mora aqui.** Ela está em `packages/dominio`. Se você
precisou de um cálculo de janela, de fase do dia ou de QR dentro de uma tela,
provavelmente está reescrevendo algo que já existe — e que o servidor usa.

**O que dá para testar sem React Native fica em `src/`, fora das telas.**
`npm run teste` roda com `tsx --test`, sem emulador e sem rede. Se um módulo
importar `react-native`, ele deixa de ser testável desse jeito — então a lógica
mora separada da tela.
