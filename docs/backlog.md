# Backlog

**272 tasks · 159 no MVP · 75 concluídas (28%)**

> **30/08/2026 — o escopo cresceu, e o total mudou junto.** O Juan pediu que o
> app tenha as mesmas telas e a mesma lógica do sistema que já está no ar, e
> não só a parte do colaborador. Isso é a Epic 17, com 20 tasks novas. O
> percentual caiu de 24% para 25% mesmo com trabalho feito porque o
> denominador cresceu — é o número honesto.

O percentual reportado ao Juan sai daqui. Nunca estimar: contar.

Atualizado em 30/08/2026.

---

## Progresso por epic

| # | Epic | Feito | Total | MVP | Situação |
|---|---|---|---|---|---|
| 1 | Modelo de dados | 3 | 16 | ✓ | SQL escrito, nada executado |
| 2 | Fundação | 5 | 12 | ✓ | Workspace e domínio prontos |
| 3 | API v1 | 18 | 32 | ✓ | Lógica completa; falta foto e rotas de admin |
| 4 | Conta do colaborador | 9 | 18 | ✓ | Login e entrada no evento, com tela |
| 5 | App base | 12 | 14 | ✓ | Navegação por papel, com abas e menu |
| 6 | QR | 4 | 15 | ✓ | Falta a TELA, Ed25519, código giratório, captura |
| 7 | Offline | 10 | 19 | ✓ | Fila pronta; falta foto e integração com o app |
| 8 | Ponto no app | 0 | 13 | ✓ | Destravado: o app base existe |
| 9 | Histórico | 1 | 11 | — | A API já devolve; falta a tela |
| 10 | Supervisor | 1 | 15 | — | Painel na API; falta a tela |
| 11 | Push | 0 | 12 | — | Depende da conta Apple |
| 12 | Web | 0 | 16 | — | |
| 13 | Escala | 0 | 14 | — | Teste de carga antes de evento grande |
| 14 | Segurança | 4 | 13 | — | Isolamento e limite feitos; falta LGPD e retenção |
| 15 | Testes | 6 | 14 | — | 238 testes rodando |
| 16 | Publicação | 0 | 18 | — | |
| 17 | Painel no app | 12 | 20 | ✓ | Painel, scanner e ponto; falta a API |

---

## Concluído

**Epic 1 — Modelo de dados**
- Migração `pessoas` escrita, com verificação e rollback
- Migração `codigo_convite` escrita
- Migração dos dois relógios escrita

**Epic 2 — Fundação**
- Workspace npm com pacotes e apps
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

**Epic 7 — Offline**
- Fila com persistência, ordem e recuo progressivo
- Idempotência por id gerado no aparelho
- Distinção entre recusa e falha de transporte
- Recuperação de batida travada em "enviando"
- Tolerância a armazenamento corrompido

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

---

## Próximas, pela ordem

O Juan escolheu **telas primeiro, com dados de mentira**: o app inteiro fica
navegável contra o servidor falso, ele olha e corrige, e só depois a API real
entra por baixo. Nenhuma tela muda na troca.

1. **Atividades do evento** (Epic 17). O que aconteceu no evento em ordem —
   quem chegou, quem bateu o meio, quem saiu.
2. **Acessos** (Epic 17). Quem tem conta, e com qual papel.
3. **A credencial na tela** (Epic 6 + 8). O QR do dia e os três botões de bater
   ponto, ligados à fila offline que já existe.
4. **Organizações, Base de funcionários, Encontre colaborador, WhatsApp**
   (Epic 17). O bloco Plataforma, que só o master vê.
5. **Cliente HTTP de verdade** (Epic 3 + 17). Trocar o falso pelo real é um
   arquivo só, mas ele ainda não existe — e faltam os endpoints do painel.
6. **Upload de foto** (Epic 3 + 7). Compressão, guarda offline, envio direto
   ao storage sem passar pela API.
7. **Sessões e limite em tabela** (Epic 3). Hoje na memória do processo.
8. **Rodar as migrações** (Epic 1). Precisa do banco de homologação.

---

## Bloqueado, esperando o Juan

- **Conta Apple Developer** → toda a Epic 11 e a 16
- **Banco de homologação** → executar a Epic 1
- **Caminho de recuperação de conta** → decisão de produto, antes da produção
