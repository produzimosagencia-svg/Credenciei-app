# Credenciei Web — funções e integrações externas (22/09/2026)

Inventário do que existe em `lib/actions.ts` e nas integrações externas do
site (`c:\Dev\credenciei`), pra quem constrói a API própria do app saber
que superfície precisa ter paridade. Citações são `arquivo:linha`.

Ver também: [credenciei-web-regras-de-negocio.md](credenciei-web-regras-de-negocio.md),
[credenciei-web-permissoes-autenticacao.md](credenciei-web-permissoes-autenticacao.md),
[credenciei-web-modulos.md](credenciei-web-modulos.md).

---

## 1 · Server Actions — `lib/actions.ts` (6430 linhas)

Todas usam `getPerfil()` (sessão via cookie, server-only) para
autorização e `supabaseAdmin` (service role — RLS ligado, banco só
acessível no servidor). Agrupadas por área.

### Organizações (só master) — :268-430
- `criarOrganizacao(formData)` :268 — cria organização + admin dono +
  evento opcional; cria pasta no Drive.
- `toggleAtivoOrganizacao(id, ativo)` :375 — liga/desliga organização.
- `editarOrganizacao(id, formData)` :383 — edita dados/foto da organização.
- `deletarOrganizacao(id)` :419 — apaga organização, cascata
  perfis+eventos, remove logins do Auth.

### Supervisores / Operadores de portão / Suporte / Produtor (acessos)
- `situacaoDoAcesso(cpf)` :522 — que tipo de acesso um CPF já tem, antes
  de preencher o formulário.
- `criarSupervisor(fornecedorId, eventoId, formData)` :540 — cria/realoca
  supervisor (1 setor, soma setores via `supervisor_setores`); dispara
  WhatsApp (link de senha + aviso de escala).
- `criarOperadorPortaria(eventoId, formData)` :844 — cria/realoca operador
  de portão (escopo = organização inteira, sem setor).
- `criarSuporte(formData)` :1019 — só master; acesso de suporte
  cross-organização, com escopo (`suporte_escopo`) e expiração.
- `criarProdutor(formData)` :1085 — só master; acesso do produto
  "Gastos", preso a 1 organização + eventos escolhidos.
- `editarSuporte(perfilId, formData)` :1160 — edita suporte existente.
- `obterAuditoria(opcoes)` :1207 / `opcoesDaAuditoria()` :1327 — trilha de
  auditoria filtrada por escopo.
- `revogarSuporte(perfilId)` :1372 — revoga acesso de suporte na hora.
- `gerarLinkDeAcesso(perfilId)` :1396 — gera link de criar-senha de uso
  único (24h) sem invalidar a senha atual.
- `editarSupervisor(id, formData)` :1432 — edita nome/telefone/status/
  CPF/senha.
- `deletarUsuario(id)` :1489 — exclui acesso (só master).
- `adicionarAdmin(formData)` :1544 — adiciona admin a organização
  existente (login por e-mail+senha).
- `alternarAtivoUsuario(id)` :1604 / `editarUsuario(id, formData)` :1641
  — liga/desliga e edita acesso genérico.

### Eventos — :1696-2023
- `criarEvento(formData)` :1696 — cria evento (respeita limite de
  licenças do admin), materializa "dia principal", cria planilha no
  Sheets, sincroniza agendamentos de WhatsApp.
- `editarEvento(id, formData)` :1770 — edita nome/datas/local/
  janelas/mensagem pré-evento.
- `toggleAtivoEvento(id, ativo)` :1791 — encerra/reabre; inativa ou
  reativa acessos criados PARA aquele evento.
- `deletarEvento(id)` :1886 — só master; desvincula supervisores antes de
  apagar (FK).
- `atribuirEventoAOrganizacao(eventoId, organizacaoId)` :1932 — só
  master; move evento entre organizações.
- `redefinirSenha(usuarioId, novaSenha, motivo?)` :1982 — redefine senha
  de qualquer acesso, com escopo por papel.

### Setores/Fornecedores — :2049-2173
- `criarFornecedor(eventoId, formData)` :2049 — cria setor SEMPRE com
  supervisor (desfaz o setor se o supervisor falhar).
- `editarFornecedor(id, eventoId, formData)` :2127 — edita nome/valor/
  exige_meio.
- `deletarFornecedor(id, eventoId)` :2153 — só master; recusa se houver
  supervisor vinculado.

### Funcionários/Equipe — :2194-2793, 6279-6430
- `moverFuncionarioDeSetor(funcionarioId, eventoId, novoFornecedorId, motivo?)` :2194
- `exportarFuncionariosDoSetor(fornecedorId, eventoId, filtro?)` :2331 —
  dados crus para montar .xlsx no navegador.
- `criarFuncionario(fornecedorId, eventoId, formData)` :2387 — cadastro
  pelo painel; agenda boas-vindas WhatsApp.
- `atribuirColaboradorAoEvento(cpfBruto, fornecedorId)` :2444 — só
  master; puxa pessoa da base regional para um setor.
- `deletarFuncionario(id, fornecedorId, eventoId, motivo?)` :2537 —
  exclusão destrutiva (cascata registros/veículos).
- `atualizarValorReceber` :2571, `editarCpfFuncionario` :2615 (devolve
  `{erro}`, nunca lança — Server Actions apagam a mensagem de erro em
  produção), `alternarPagamento` :2679, `trocarSetorAtivo(fornecedorId)` :2717
  (supervisor troca setor ativo entre os que cobre), `alternarAtivacao` :2757.
- `sincronizarFuncionarioNaPlanilha` :2809, `sincronizarRegistroNaPlanilha` :2836
  — espelham no Google Sheets.
- `desdeQuandoNaBase(cpf)` :6279, `editarTelefoneFuncionario` :6314
  (corrige telefone + fila de WhatsApp pendente), `editarCargoFuncionario` :6385.

### Dias de trabalho / Jornada — :2890-2994
- `diasDoEvento(eventoId)` :2890, `salvarDiasDeTrabalho(eventoId, datas[])` :2927
  — dia principal = data do evento; dias de preparação; nunca remove dia
  com batida.

### Presença — QR / Foto / Livre / Assistida / Manual — :3844-5394
Modelo: **entrada/saída via QR** (scanner decide sozinho se é entrada ou
saída — `inferirMomentoQR`), **meio via selfie+GPS opcional**, e
auto-atendimento sem operador. Ver
[credenciei-web-regras-de-negocio.md §3](credenciei-web-regras-de-negocio.md#3--registro-de-presençaponto--libactionsts-30004350)
para as regras; aqui só o inventário de funções:
- `registrarPresencaQR(eventoId, qrData)` :3844 — scanner do portão.
- `registrarPresencaFoto(token, fotoBase64, lat, lng)` :4074 — check-in do
  meio pela credencial pública.
- `registrarPresencaLivre(token, momento, lat, lng, tokenDoLocal?)` :4211
  — auto check-in de entrada (saída livre desativada).
- `conferirCredenciamentoPorCpf(eventoId, cpf)` :3787 — conferência
  manual no portão sem registrar ponto.
- `obterHistoricoDoFuncionario` :4751, `obterQRDoFuncionario` :4788
  (reimprime o mesmo QR), `localizarFuncionario(termo)` :4823 /
  `abrirFuncionarioLocalizado` :4943 (busca CPF/nome com fuzzy-match).
- `registrarPresencaAssistida(funcionarioId, momento, dados, motivo?)` :5082
- `lancarPontoManual(funcionarioId, momento, dataRef, quandoLocal, motivo)` :5203
- `apagarBatida(funcionarioId, momento, dataRef, motivo)` :5323 — só
  master/suporte.
- `descredenciarFuncionario` :3510 / `recredenciarFuncionario` :3729 —
  encerra/reabre vínculo com o evento (não apaga cadastro).

### Bloqueio de CPF — :3587-3727
- `cpfEstaBloqueado`, `bloquearCpf(eventoId, cpf, motivo?)`,
  `desbloquearCpf` — bloqueio por evento inteiro.

### Cadastro público / Portaria — :4352-4643, 5409-5551
- `cadastrarFuncionarioPublico(fornecedorId, dados, autorizacaoIndividual?)` :4352
  — formulário público; anti-duplicidade por evento; rate-limit; bloqueio
  de CPF; foto opcional.
- `buscarCadastroPorCpf(fornecedorId, cpf)` :4538 — pré-preenche
  formulário com cadastro mais recente.
- `identificarNaPortaria(eventoId, cpf)` :4618 — QR fixo da portaria: já
  credenciado?
- `alternarPortaria`, `alternarCadastroPorLink`, `criarLinkCadastroIndividual`
  (só master), `alternarLinkDoSetor`, `trocarTokenDaPortaria`.

### Configuração do "meio" — :5570-5657
- `obterConfiguracaoDoMeio` / `salvarConfiguracaoDoMeio` — liga/desliga
  por setor × dia; cancela mensagens já agendadas na hora.

### Avisos — :5730-5891
- `criarAviso`, `editarAviso`, `alternarAtivoAviso`, `excluirAviso`,
  `visualizarAvisoPorToken`, `visualizarAvisoSupervisor`,
  `obterVisualizacoesDoAviso`.

### Veículos — :5962-6167
- `buscarCondutorPorCpf`, `atualizarFotoVeiculo`, `urlFotoVeiculo`,
  `cadastrarVeiculo`, `excluirVeiculo`.

### Permissões por organização — :6180-6265
- `obterPermissoes` / `salvarPermissao` — só master; exceções ao padrão
  de `role` gravadas em `permissoes_organizacao`.

---

## 2 · WhatsApp — dois canais

### 2a. Meta Cloud API oficial — `lib/whatsapp-meta.ts`,
`app/api/whatsapp/webhook/route.ts`, `lib/whatsapp-painel.ts`

Canal **padrão** hoje (a Evolution já causou 2 banimentos). Só envia
**templates aprovados** (texto livre só dentro da janela de 24h de
resposta). Webhook público protegido por assinatura HMAC
(`X-Hub-Signature-256`, `META_APP_SECRET`); trata handshake
(`WHATSAPP_VERIFY_TOKEN`), grava mensagens recebidas/status em
`whatsapp_eventos`, e propaga falhas de entrega para
`mensagens_agendadas.erro`.

### 2b. Evolution API (WhatsApp Web não-oficial) — `lib/whatsapp-evolution.ts`,
`lib/mensagens.ts`

Canal alternativo/emergência selecionado por `WHATSAPP_PROVEDOR` (ou por
presença de `WHATSAPP_TOKEN`). `lib/whatsapp.ts` abstrai os dois canais
(`enviarMensagem`, `responderConversa`, `estadoDaInstancia`).

**Tipos de lembrete/mensagem automática** (`TipoMensagem`,
`lib/mensagens.ts:54-63`):
- `lembrete_entrada/meio/fim` — aviso no horário esperado de cada etapa
  (só dia principal, sem batida livre).
- `reforco_entrada/meio/fim` — 2 min antes do prazo, só se ainda sem
  registro.
- `alerta_supervisor_entrada/meio/fim` — lista de pendentes ao
  supervisor (só dia principal, para não gerar custo excessivo).
- `confirmacao_escala` — mensagem pré-evento (data configurável).
- `aviso_dia_evento` — horário fixo 07:00 (com fallback antecipado se a
  janela de entrada fechar antes).
- `boas_vindas_funcionario` — ao cadastrar.
- `aviso_montagem` / `aviso_desmontagem` — dias de preparação.
- `disparo_manual` — campanhas do painel + convites de
  supervisor/operador/produtor (`agendarTemplateSupervisor`).

**Fila/agendamento**: tabela `mensagens_agendadas`.
`sincronizarAgendamentos(eventoId)` (idempotente, `lib/mensagens.ts:293`)
recalcula tudo a cada mudança de evento/equipe; `agendarMeioAposEntrada`
(só na entrada real, pois o meio não tem horário fixo);
`cancelarOqueNaoValeMais`/`cancelarMeioDesligado` cancelam o que deixou de
fazer sentido (histórico: 2.790/2.249 mensagens indevidas motivaram
essas funções).

**Processamento**: `processarFilaMensagens(limite)`
(`lib/mensagens.ts:801`) — claim atômico via UPDATE condicional, prioriza
convites de acesso, espaçamento com jitter (`ESPACAMENTO_MS`, evita
padrão de robô), backoff `[2,10,30] min`, teto de atraso 3h (mensagem
velha é cancelada, não enviada). Chamado pelo **worker 24/7 na VPS
(EasyPanel)** a cada ~20s e, como **fallback**, pelo cron da Vercel.

**`WHATSAPP_PAUSADO=true`** — interruptor de emergência lido em
`lib/mensagens.ts:804`, para todo envio sem redeploy.

---

## 3 · E-mail (Resend) — `lib/email.ts`, `app/api/cron/conferencia-equipe/route.ts`

Único uso: **lembrete D-1 de conferência de equipe** ao supervisor
(`email_contato` do perfil), com CSV da equipe anexo
(`lib/conferencia.ts::planilhaEquipeCsv`). Tolerante a não-configurado
(`RESEND_API_KEY` ausente → não lança, loga e devolve `{ok:false}`). Cron
`/api/cron/conferencia-equipe` roda 1x/dia, varre eventos ativos que
começam nas próximas ~25h, garante linha em `conferencias_equipe` e envia
(idempotente por `email_enviado_em`).

---

## 4 · Google Sheets — `lib/google-sheets.ts`

**Autenticação**: OAuth2 com refresh token (`GOOGLE_REFRESH_TOKEN` +
`GOOGLE_OAUTH_CLIENT_ID/SECRET/REDIRECT_URI`) se disponível; senão
fallback para Service Account (`GOOGLE_SERVICE_ACCOUNT_EMAIL` +
`GOOGLE_PRIVATE_KEY`). Fluxo OAuth próprio em
`app/api/auth/google/authorize` e `/callback`.

**Funções**: `encontrarOuCriarPasta`, `garantirPastaCliente` (pasta por
organização no Drive), `criarPlanilhaEvento` (1 planilha por evento,
compartilhada leitura pública), `garantirAbaFornecedor` (1 aba por setor,
cabeçalho: Nome/CPF/Telefone/Cargo/Chave PIX/Valor/QR Code/Cadastro/
Entrada/Saída), `adicionarFuncionarioNaPlanilha`,
`atualizarValorNaPlanilha`, `registrarPresencaNaPlanilha` — espelho
somente de leitura para o cliente, não é fonte de verdade (a API própria
não precisa reproduzir isso, é só exportação).

---

## 5 · IA / Gemini

### 5a. Assistente "Suporte" (chat) — `lib/ia/agente.ts`,
`lib/ia/ferramentas/*`, `app/api/ia/chat/route.ts`

Modelo `gemini-3.6-flash`, function-calling com laço manual (máx. 8
voltas), streaming NDJSON. Duas travas fora do prompt: **permissão**
(cada ferramenta reconfirma escopo do perfil, igual às Server Actions) e
**confirmação** (ações de risco devolvem `precisa_confirmar`; só executam
quando o id vem em `confirmacoes`, que só a UI grava após clique do
usuário).

**Ferramentas disponíveis** (`lib/ia/ferramentas/*.ts`):
- Consultas: `listar_eventos`, `detalhar_evento`, `pendencias_de_presenca`,
  `buscar_funcionario`, `resumo_financeiro`, `comparar_setores`,
  `detalhar_setor`.
- Eventos: `criar_evento`, `editar_evento`, `configurar_janelas`,
  `alternar_ativacao_evento`, `renovar_qrs_do_evento`,
  `regenerar_qr_funcionario`, `invalidar_qr_funcionario`, `excluir_evento`.
- Setores: `criar_setor`, `editar_setor`, `link_de_cadastro_do_setor`,
  `regenerar_link_do_setor`, `excluir_setor`.
- Funcionários: `cadastrar_funcionario`, `editar_funcionario`,
  `mover_funcionario_de_setor`, `alternar_ativacao_funcionario`,
  `registrar_pagamento`, `importar_planilha`, `excluir_funcionario`.
- Usuários: `listar_usuarios`, `criar_supervisor`, `editar_supervisor`,
  `vincular_supervisor_ao_setor`, `excluir_usuario`.
- WhatsApp: `diagnosticar_whatsapp`, `reenviar_whatsapp`,
  `cancelar_mensagens_agendadas`, `listar_mensagens_agendadas`,
  `configurar_mensagem_pre_evento`.

A IA nunca escreve texto livre de WhatsApp (só reenvia/cancela templates
já existentes), nunca gera/repete senha, e não cria organização.

### 5b. Extração de gasto por voz (módulo Gastos) — `lib/gastos-ia.ts`

`interpretarAudioDeGasto(audio, mime, ctx)` — função pura (não sabe de
sessão/origem; usada hoje pela tela, futuramente pelo worker de
WhatsApp). Uma chamada ao Gemini flash com `responseSchema` estruturado
(transcrição, valor, descrição, fornecedor, categoria, dataGasto,
`precisaConfirmar[]`).

**"Nunca inventa" é garantido em 2 camadas**:
1. Prompt explícito: campo incerto vira `null` e entra em
   `precisaConfirmar`.
2. Blindagem no código (`lib/gastos-ia.ts:143-147`): mesmo que a IA
   esqueça de avisar, o código força `valor`/`descricao`/`categoria` para
   `precisaConfirmar` sempre que o campo ficou vazio ou inválido
   (categoria fora da lista `CATEGORIAS_GASTO`, valor não-positivo). A
   tela pinta esses campos em âmbar e bloqueia salvar sem confirmação
   humana.

---

## 6 · Cron Jobs — `vercel.json`

```json
{"crons": [
  {"path": "/api/cron/enviar-mensagens", "schedule": "* * * * *"},
  {"path": "/api/cron/conferencia-equipe", "schedule": "0 12 * * *"}
]}
```
- `/api/cron/enviar-mensagens` (a cada minuto) — fallback do worker da
  VPS; chama `processarFilaMensagens()`.
- `/api/cron/conferencia-equipe` (1x/dia, 12h UTC = 9h BRT) — lembrete
  D-1 por e-mail (§3).

Ambos protegidos por **`CRON_SECRET`**: exigem header `Authorization:
Bearer <CRON_SECRET>`, senão 401.

---

## 7 · Variáveis de ambiente (nomes, por uso no código — valores não lidos)

| Variável | Uso |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Cliente Supabase (browser/login) |
| `SUPABASE_SERVICE_ROLE_KEY` | Cliente admin server-only (bypassa RLS); também deriva a chave de assinatura do QR quando `CREDENCIAL_SEGREDO` não está setada |
| `NEXT_PUBLIC_SITE_URL` | Base para montar links (credencial, formulários, painel) em mensagens WhatsApp/e-mail e QR |
| `CREDENCIAL_SEGREDO` | Chave HMAC dedicada para assinar QR (opcional; senão usa a service role key) |
| `CHAVE_PUBLICA_QR_ED25519` | Chave pública Ed25519 para aceitar o formato `c4` de QR (offline, ver ADR 009 do credenciei-app) |
| `WHATSAPP_PROVEDOR` | Força canal `meta` ou `evolution` |
| `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID` | Credenciais Meta Cloud API |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | Painel WhatsApp |
| `WHATSAPP_VERIFY_TOKEN` | Handshake do webhook Meta |
| `META_APP_SECRET` | Assina/valida o webhook Meta (HMAC) |
| `WHATSAPP_PAUSADO` | Interruptor de emergência — para todo envio |
| `EVOLUTION_URL`, `EVOLUTION_INSTANCIA`, `EVOLUTION_APIKEY` | Credenciais Evolution API (worker VPS) |
| `EMAIL_REMETENTE`, `RESEND_API_KEY` | E-mail via Resend |
| `GOOGLE_REFRESH_TOKEN`, `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI` | OAuth2 do Google (preferencial) |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY` | Fallback Service Account do Google (Sheets/Drive) |
| `GEMINI_API_KEY` | Google GenAI — chat IA e extração de áudio de gastos |
| `CRON_SECRET` | Autoriza os endpoints `/api/cron/*` |

---

## Observações úteis para paridade de API

- **Autorização**: não há "API key" central — tudo passa por
  `getPerfil()` (sessão cookie) + checagem de escopo por
  `role`/`organizacao_id`/`fornecedor_id`/`suporte_escopo` repetida em
  cada action. Um app RN precisa de mecanismo de sessão equivalente (hoje
  CPF+senha para supervisor/operador/suporte/produtor, e-mail+senha para
  admin/master).
- **QR de credencial**: formato `c3` (HMAC, por etapa) é o atual; `c2`
  legado ainda aceito (por dia); `c4` (Ed25519 + janela de tempo) já é
  aceito para leitura mas ainda não gerado — formato pensado para os dois
  sistemas (ver
  [decisoes/009-qr-offline-ed25519.md](decisoes/009-qr-offline-ed25519.md)).
- Muitas actions devolvem `{erro: string}` em vez de lançar exceção —
  comentário explícito em `editarCpfFuncionario` (`lib/actions.ts:2597`):
  Server Actions do Next.js **apagam a mensagem de erro em produção**;
  uma API REST equivalente não tem essa limitação, mas vale manter o
  padrão de retorno estruturado.
- `lib/janelas.ts` contém toda a lógica de horário/fase (montagem/evento/
  desmontagem, janela do meio = entrada+4h, teto de turno 18h) — arquivo
  mais denso de regras de negócio depois de `actions.ts`.

---

## Metodologia

Investigação read-only em 22/09/2026. Nenhum arquivo do site foi
alterado.
