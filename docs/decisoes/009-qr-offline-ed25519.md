# 009 — QR offline: Ed25519 e código giratório

**Decidido em** 18/09/2026 por Juan · **Estado:** aceito, em construção por fases

## Contexto

O comentário em `packages/dominio/src/credencial-qr.ts` já citava "Ed25519" e
"verificação offline" desde 29/08/2026, apontando para
`docs/decisoes/002-qr-offline.md` — um arquivo que **nunca existiu**. Foi
conferido por git log nos dois repositórios: nenhuma versão, nenhum commit
apagado, nenhuma discussão registrada em lugar nenhum além dessas duas
palavras soltas no backlog (Epic 6 — QR: "Falta Ed25519 e código
giratório"). A referência estava quebrada desde o commit que a escreveu.

Perguntado direto ao Juan qual era o problema real por trás disso: **alguns
locais de evento têm internet ruim, e o scanner do portão hoje depende de
rede 100% do tempo** — toda leitura de QR é uma chamada HTTP síncrona
(`POST /v1/escanear/:eventoId`), sem nenhum caminho offline.

## Por que Ed25519 especificamente

A assinatura do QR hoje é HMAC-SHA256 — chave **simétrica**: o mesmo segredo
assina e confere. Um segredo simétrico nunca pode ir para o aparelho do
operador do portão: quem o extraísse do celular forjaria crachá de qualquer
pessoa. Ed25519 é assimétrica — o servidor guarda a chave **privada** (nunca
sai de lá) e o aparelho do operador recebe só a **pública**, que serve para
CONFERIR mas nunca para FORJAR. É isso que torna a conferência offline
segura.

## Decisão

Construir em fases, nunca de uma vez — mudar o formato de assinatura do QR
em produção é a mudança de maior risco que este projeto já fez nele: se a
assinatura nova divergir, toda credencial em circulação é recusada no
portão.

1. Gerar o par de chaves Ed25519; a privada vira variável de ambiente nova
   nos dois sistemas (mesmo padrão de `SEGREDO_QR`/`CREDENCIAL_SEGREDO`).
2. Os dois sistemas passam a **aceitar** o formato novo (`c4`) sem gerar
   nenhum ainda — só confere em produção por um tempo.
3. Os dois sistemas passam a **gerar** `c4`.
4. Só depois de `c4` estabilizado: roster offline (lista da equipe baixada
   antes do evento, com foto/nome/situação) e a fila de leituras offline do
   scanner, espelhando `packages/offline`'s `FilaDeBatidas` — mesma
   persistência, recuo progressivo, distinção entre recusa e falha de rede.
5. `c2` e `c3` continuam aceitos por tempo indefinido — o código não custa
   nada mantendo os três formatos, e não há pressa em remover.

**Formato `c4`**: `c4.<token>.<sigla>.<janela>.<assinatura>` — `<janela>` é
o contador de tempo do código giratório (janelas de 2 minutos; a leitura
aceita a atual e a anterior, ~4 min de folga). Resolve o "código giratório"
e o "Ed25519" com o mesmo campo: só o servidor pode assinar uma janela nova
(a colaboradora não tem a chave privada), então a credencial re-busca
`meuQr` periodicamente enquanto a tela está aberta.

**Risco aceito e documentado, não escondido**: o scanner offline decide com
base no roster baixado antes do evento — alguém desativado DEPOIS do
download pode ser aceito por engano. Ao sincronizar, isso vira uma linha na
trilha de auditoria para quem gerencia revisar depois; não há como eliminar
esse risco sem internet, é inerente a qualquer verificação offline.

## O que isso NÃO muda agora

- A fila de batida do PRÓPRIO colaborador (`packages/offline`,
  `credencial.tsx`) não muda de arquitetura — só ganha polling mais
  frequente para o código giratório.
- Nenhuma tela de "conflitos de sincronização" nova — fica como filtro na
  auditoria já existente.
- LGPD sobre guardar foto/nome no aparelho do operador offline é
  consideração da Epic 14 (Segurança), não desta decisão.

## Consequência

`packages/dominio/src/credencial-qr.ts` e o espelho em
`c:\Dev\credenciei\lib\credencial-qr.ts` mudam juntos, sempre — os dois
sistemas geram E leem QR hoje (o app pela API, o site por
`app/credential/[token]/page.tsx` e `lib/actions.ts`). Plano completo (com
os detalhes de implementação por camada) arquivado em
`C:\Users\Juan Muzy\.claude\plans\functional-sprouting-sunset.md`.
