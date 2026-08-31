# Backlog

**277 tasks · 164 no MVP · 109 concluídas (39%)**

**Só o MVP: 92 de 164 (56%).** É o número que responde "quando dá para usar" —
o outro inclui push, publicação, web e escala, que vêm depois.

> Os dois números saem de `npm run backlog`, que soma a tabela abaixo e recusa
> cabeçalho que não bate. Em 31/08 eles divergiram em treze tasks porque eu
> mantinha o cabeçalho à mão — e o número reportado saiu errado em seis pontos.
> A regra é contar, não estimar; um número que depende de alguém lembrar de
> somar é estimativa com passos extras.

> **30/08/2026 — o escopo cresceu, e o total mudou junto.** O Juan pediu que o
> app tenha as mesmas telas e a mesma lógica do sistema que já está no ar, e
> não só a parte do colaborador. Isso é a Epic 17, com 20 tasks novas. O
> percentual caiu de 24% para 25% mesmo com trabalho feito porque o
> denominador cresceu — é o número honesto.

O percentual reportado ao Juan sai daqui. Nunca estimar: contar.

Atualizado em 31/08/2026.

---

## Progresso por epic

| # | Epic | Feito | Total | MVP | Situação |
|---|---|---|---|---|---|
| 1 | Modelo de dados | 3 | 16 | ✓ | SQL escrito, nada executado |
| 2 | Fundação | 6 | 12 | ✓ | Domínio pronto e sincronizado com a web |
| 3 | API v1 | 21 | 32 | ✓ | Cliente HTTP ligado; faltam as rotas do painel |
| 4 | Conta do colaborador | 9 | 18 | ✓ | Login e entrada no evento, com tela |
| 5 | App base | 12 | 14 | ✓ | Navegação por papel, com abas e menu |
| 6 | QR | 7 | 15 | ✓ | Falta Ed25519, código giratório, captura de tela |
| 7 | Offline | 13 | 19 | ✓ | Fila ligada ao app; falta o envio da foto ao storage |
| 8 | Ponto no app | 4 | 13 | ✓ | O meio com selfie; falta o resto do ciclo |
| 9 | Histórico | 4 | 11 | — | Meus dias e Meu pagamento prontos |
| 10 | Supervisor | 1 | 15 | — | Painel na API; falta a tela |
| 11 | Push | 0 | 12 | — | Depende da conta Apple |
| 12 | Web | 0 | 16 | — | |
| 13 | Escala | 0 | 14 | — | Teste de carga antes de evento grande |
| 14 | Segurança | 4 | 13 | — | Isolamento e limite feitos; falta LGPD e retenção |
| 15 | Testes | 8 | 14 | — | 299 testes rodando |
| 16 | Publicação | 0 | 18 | — | |
| 17 | Painel no app | 17 | 25 | ✓ | Falta Plataforma, o que a web ganhou e a API |

---

## Concluído

**Epic 1 — Modelo de dados**
- Migração `pessoas` escrita, com verificação e rollback
- Migração `codigo_convite` escrita
- Migração dos dois relógios escrita

**Epic 2 — Fundação**
- Workspace npm com pacotes e apps
- Procedimento de sincronização com o sistema web, e `npm run verificar`
- `janelas`, `format`, `tz` copiados do sistema web sem alteração
- `credencial-qr` portado de `node:crypto` para `@noble/hashes`
- Teste que prova assinatura idêntica à de produção
- Suíte rodando em todos os pacotes

**Epic 3 — API v1**
- Interface `Repositorio` e implementação em memória
- Implementação sobre Supabase, traduzindo o schema antigo
- Endpoint de batida, com a ordem de verificações correta
- Login: pedir código, entrar, renovar
- Convite, entrar no evento, minhas participações
- Meus dias, meu financeiro, meu QR
- Painel do supervisor
- Servidor HTTP com middleware de autenticação
- Sessões com dois tokens e rotação
- Limite de tentativas
- Cliente HTTP de verdade, com a régua de recusa × falha de transporte
- Troca entre servidor falso e API por variável de ambiente
- Teste que roda o mesmo roteiro nos dois clientes e exige comportamento igual

**Epic 4 — Conta do colaborador**
- Código de evento: geração, leitura, máscara, tolerância a confusão
- Login por WhatsApp, com código de uso único
- Formulário do evento com campos configuráveis
- Guarda de "já está neste evento"
- Tela de entrar, em dois passos (número e código)
- Tela de entrar no evento, montando o formulário que o evento mandou

**Epic 5 — App base**
- Projeto Expo (SDK 57) dentro do workspace
- Metro ensinado a ler os pacotes compartilhados, que são TypeScript
- Navegação por arquivos, com uma pasta inteira protegida por sessão
- Tema: cor, espaço, tipografia e alvo mínimo de toque, pensados para sol e pressa
- Componentes base: botão, campo, escolha, cartão, aviso, selo, carregando
- Cofre do aparelho — chaveiro do sistema no celular, armazenamento do site na web
- Sessão que sobrevive a fechar o app
- Renovação automática, com giro do token e uma renovação por vez
- "Sem rede" e "sem sessão" tratados como coisas diferentes, e ditos na tela
- Carregando, erro e "tentar de novo" resolvidos num lugar só

**Epic 6 — QR**
- Formato por etapa (`c3`), com `c2` aceito na transição
- Geração e leitura no pacote compartilhado
- Endpoint `meuQr` com a etapa do dia
- O QR desenhado na credencial, dizendo de qual etapa é
- Some quando o app sai do primeiro plano, e volta com um toque
- Leitura pela câmera no scanner do portão

**Epic 7 — Offline**
- Fila ligada ao app, acima das telas e viva em segundo plano
- Tradução entre servidor e fila, com teste da recusa e da falha de rede
- Estado da batida visível na credencial: guardada, enviada ou recusada
- Fila com persistência, ordem e recuo progressivo
- Idempotência por id gerado no aparelho
- Distinção entre recusa e falha de transporte
- Recuperação de batida travada em "enviando"
- Tolerância a armazenamento corrompido

**Epic 8 — Ponto no app**
- Credencial com as três etapas do dia e o estado de cada uma
- O meio registrado pela própria pessoa, com selfie
- Janela do meio contada a partir da entrada DELA, não do relógio do evento
- Atraso marcado, nunca barrado

**Epic 9 — Histórico**
- Meus dias: cada dia com as três etapas e o status
- "Não realizada" só quando é anomalia, e não em dia inteiro ausente
- Resumo com dias trabalhados, faltados, incompletos e horas
- Meu pagamento: valor previsto, com a conta de onde ele vem

**Epic 14 — Segurança**
- Isolamento por pessoa em todos os endpoints
- Respostas idênticas para "não existe" e "não é seu"
- Limite de tentativas no código de evento e no login
- Rotação do token de renovação

**Epic 15 — Testes**
- 31 testes do app, sem emulador e sem rede

**Epic 17 — Painel no app**
- Papéis e permissões copiados para o domínio compartilhado, com teste
- Login com senha para quem tem conta de painel, no contrato e no falso
- Navegação por papel: três abas embaixo e o menu inteiro em "Mais"
- Painel: os quatro indicadores, com degradê e brilho
- Painel: cartões de evento ao vivo, com a barra de presença
- Painel: atividade recente e a janela do fluxo
- Escanear QR: câmera contínua, evento e momento, aviso em tela cheia
- Escanear QR: crachá de outra etapa com decisão, e não com "inválido"
- Conferência pelo CPF quando o crachá não passa
- Registrar ponto: busca por CPF ou nome, com escolha entre homônimos
- Registrar ponto: foto obrigatória e etapa decidida pelo servidor
- Câmera de rosto, com permissão explicada e foto já reduzida
- Atividades: log com QR, foto e registro assistido separados
- Atividades: filtro por etapa, com contador vindo da mesma lista
- Atividades: quem não chegou e quem está no evento, nome por nome
- Acessos: lista com abas, busca e bloquear sem apagar histórico
- Criar acesso de supervisor, preso a um setor de um evento

---

## Próximas, pela ordem

O Juan escolheu **telas primeiro, com dados de mentira**: o app inteiro fica
navegável contra o servidor falso, ele olha e corrige, e só depois a API real
entra por baixo. Nenhuma tela muda na troca.

1. **Organizações, Base de funcionários, Encontre colaborador, WhatsApp**
   (Epic 17). O bloco Plataforma, que só o master vê.
2. **O que o sistema web ganhou** (Epic 17). Cartaz da portaria, mover
   funcionário de setor, pendências — ver a seção abaixo.
3. **Endpoints do painel na API** (Epic 3 + 17). O cliente HTTP já existe e já
   fala com a API; faltam as rotas de painel, escanear, ponto, atividades e
   acessos. Sem elas, essas telas continuam no servidor falso.
4. **Upload de foto ao storage** (Epic 3 + 7). Hoje a selfie do meio viaja
   dentro da batida; o caminho que aguenta pico é subir direto ao storage.
5. **Sessões e limite em tabela** (Epic 3). Hoje na memória do processo.
6. **Rodar as migrações** (Epic 1). Precisa do banco de homologação.


---

## Veio do sistema web, ainda não está no app

O `credenciei-web` continua sendo desenvolvido. Estes são recursos que ele
ganhou e que o app precisa espelhar — o procedimento para achá-los está em
`docs/decisoes/007`.

| O que | Quando entrou lá | O que muda aqui |
|---|---|---|
| **Batida livre no dia do evento** | 30/08 | ✅ **Trazido.** Regra do domínio, com teste no domínio e na API |
| **Cartaz da portaria** — auto cadastro de quem chega sem estar na lista | 30/08 | Tela nova, e um formulário público. Depende de coluna nova no banco |
| **Histórico de batidas como aba do funcionário** | 31/08 | Vale para a tela "Meus dias" do colaborador |
| **"Não realizada" só quando é anomalia** | 31/08 | Regra de leitura da tabela de histórico — ver abaixo |
| **Admin move funcionário de setor** | 31/08 | Ação nova na tela do setor |
| **Pendências do evento, com todos os dias** | 31/08 | Tela que o app ainda não tem |

**A regra do "não realizada"**, para não repetir o erro quando eu montar a
tabela de histórico: o selo vermelho existe para marcar ANOMALIA — a pessoa
esteve no evento e pulou uma etapa. Num dia em que ela não apareceu, repetir o
selo nas três colunas diz três vezes o que o "Ausente" já disse uma, e onze
linhas assim viram uma parede vermelha sem informação. Dia inteiro ausente: um
traço quieto em cinza.

---

## Bloqueado, esperando o Juan

- **Conta Apple Developer** → toda a Epic 11 e a 16
- **Banco de homologação** → executar a Epic 1
- **Caminho de recuperação de conta** → decisão de produto, antes da produção
