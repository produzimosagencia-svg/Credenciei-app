# Backlog

**252 tasks · 139 no MVP · 48 concluídas (19%)**

O percentual reportado ao Juan sai daqui. Nunca estimar: contar.

Atualizado em 30/08/2026.

---

## Progresso por epic

| # | Epic | Feito | Total | MVP | Situação |
|---|---|---|---|---|---|
| 1 | Modelo de dados | 3 | 16 | ✓ | SQL escrito, nada executado |
| 2 | Fundação | 5 | 12 | ✓ | Workspace e domínio prontos |
| 3 | API v1 | 18 | 32 | ✓ | Lógica completa; falta foto e rotas de admin |
| 4 | Conta do colaborador | 7 | 18 | ✓ | Login e código de evento prontos |
| 5 | App base | 0 | 14 | ✓ | Não começou |
| 6 | QR | 4 | 15 | ✓ | Falta Ed25519, código giratório, captura de tela |
| 7 | Offline | 10 | 19 | ✓ | Fila pronta; falta foto e integração com o app |
| 8 | Ponto no app | 0 | 13 | ✓ | Depende do app base |
| 9 | Histórico | 1 | 11 | — | A API já devolve; falta a tela |
| 10 | Supervisor | 1 | 15 | — | Painel na API; falta a tela |
| 11 | Push | 0 | 12 | — | Depende da conta Apple |
| 12 | Web | 0 | 16 | — | |
| 13 | Escala | 0 | 14 | — | Teste de carga antes de evento grande |
| 14 | Segurança | 4 | 13 | — | Isolamento e limite feitos; falta LGPD e retenção |
| 15 | Testes | 5 | 14 | — | 151 testes rodando |
| 16 | Publicação | 0 | 18 | — | |

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

---

## Próximas, pela ordem

1. **App Expo — telas do colaborador** (Epic 5). Roda contra o `ClienteFalso`,
   que já existe. Não depende de mais nada.
2. **Upload de foto** (Epic 3 + 7). Compressão, guarda offline, envio direto
   ao storage sem passar pela API — é o caminho que não aguenta pico.
3. **Sessões e limite em tabela** (Epic 3). Hoje na memória do processo.
4. **Rodar as migrações** (Epic 1). Precisa do banco de homologação.

---

## Bloqueado, esperando o Juan

- **Conta Apple Developer** → toda a Epic 11 e a 16
- **Banco de homologação** → executar a Epic 1
- **Caminho de recuperação de conta** → decisão de produto, antes da produção
