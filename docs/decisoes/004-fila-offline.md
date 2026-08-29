# 004 — A fila offline vem antes da API

**Decidido em** 29/08/2026 · **Estado:** aceito

## Contexto

Juan pediu para não tocar na API atual nem criar banco de homologação por
enquanto. Isso fecha as portas do modelo de dados (precisa de banco) e da API
(precisa do repositório de produção).

## Decisão

Antecipar a Epic 7 — a fila offline — para agora.

## Por quê

É a única peça grande que não depende nem de banco nem de servidor: recebe um
jeito de guardar e um jeito de enviar, ambos injetados. E é a mais arriscada do
projeto, então de-riscar cedo vale mais do que seguir a ordem original.

## Consequência

A fila define o contrato que a API vai ter que cumprir — em especial a distinção
entre **recusa** (o servidor decidiu não) e **falha de transporte** (não chegou
resposta). Quando a API existir, ela precisa responder nesses termos.

Também fixa a chave de idempotência: o `id` nasce no aparelho, e o servidor
precisa guardá-lo e recusar o segundo envio do mesmo.
