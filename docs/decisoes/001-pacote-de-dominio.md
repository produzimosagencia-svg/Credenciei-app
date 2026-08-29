# 001 — A regra de negócio vira um pacote

**Decidido em** 29/08/2026 · **Estado:** aceito

## Contexto

O sistema web tem ~900 linhas de regra pura (`janelas`, `credencial-qr`,
`format`, `tz`) — sem banco, sem framework. O app precisa das mesmas regras, e
precisa delas funcionando offline, dentro do celular.

## Decisão

Extrair para `@credenciei/dominio`, importado pelo servidor, pela web e pelo app.

## Por quê

Se a regra existir em dois lugares, ela vai divergir. Não é hipótese: "meio =
entrada + 4h" já mudou três vezes neste projeto. Cada mudança precisaria ser
feita duas vezes, e a primeira que alguém esquecesse apareceria como pagamento
errado no fechamento.

## Consequência

`node:crypto` teve que sair — não existe no React Native. Trocado por
`@noble/hashes`: JavaScript puro, auditado, mesmo resultado em qualquer
ambiente. **Verificado por teste: a assinatura bate byte a byte com a que o
sistema produz hoje**, então nenhuma credencial em circulação quebra.

## Alternativa descartada

Flutter. A regra teria que ser reescrita em Dart e mantida em dobro — exatamente
o problema que esta decisão evita.
