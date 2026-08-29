# 005 — A API nasce em repositório separado

**Decidido em** 29/08/2026 por Juan · **Estado:** aceito

## Contexto

A opção A (API dentro do sistema atual) foi aprovada antes, mas esbarrou numa
regra mais forte: não tocar em `c:\Dev\credenciei`. O sistema tem um evento de
56 pessoas em uma semana e não pode oscilar.

## Decisão

`apps/api` no repositório novo, conversando com o **mesmo banco**.

## Por quê

A produção fica fora de risco durante todo o desenvolvimento. E a API nova
nasce falando o modelo NOVO (pessoas × participações) sem carregar o antigo.

O risco que eu temia — regras divergirem entre os dois lados — morreu quando o
domínio virou pacote: `avaliarEntradaSaida` é a mesma função nos dois.

## Consequência

Enquanto os dois existirem, uma correção de CONSULTA precisa ser feita duas
vezes. As regras não — elas moram num lugar só.

O acesso ao banco fica atrás de uma interface (`Repositorio`), por duas razões:
a API roda inteira em testes sem banco (o único que existe é o de produção), e
quando o modelo migrar a troca acontece em um arquivo.
