# Credenciei Web — módulos de produto (22/09/2026)

Um módulo por seção: rotas, quem acessa, tabelas, regras específicas.
Citações são `arquivo:linha` do repo do site (`c:\Dev\credenciei`).

Ver também: [credenciei-web-regras-de-negocio.md](credenciei-web-regras-de-negocio.md),
[credenciei-web-permissoes-autenticacao.md](credenciei-web-permissoes-autenticacao.md),
[credenciei-web-funcoes-integracoes.md](credenciei-web-funcoes-integracoes.md).

---

## 1 · Gastos

**Rotas**: `/gastos` (captura), `/gastos/lista` (tabela+filtros+exportação),
`/gastos/painel` (dashboard). API auxiliar: `POST /api/gastos/transcrever`.

**Quem acessa**: só `produtor` e `master` (`podeRegistrarGastos`,
`lib/permissions.ts:176-177`). Desde a virada em "produto à parte", nenhum
papel operacional do credenciamento (admin, supervisor, gestor, suporte)
entra mais — antes entrava. `produtor` é o cliente do produto: login
próprio, só este módulo, só os eventos vinculados via `produtor_eventos`.
Master entra só para dar suporte.

**Tabelas**: `gastos_evento` (`supabase/upgrade-gastos.sql`), bucket
privado `gastos`. Colunas acrescentadas por 3 migrações incrementais:
`upgrade-produtor.sql` (forma_pagamento, produtor_eventos),
`upgrade-gastos-interno.sql` (organizacao_id, pagador, evento_id agora
nullable), `upgrade-gastos-pago.sql` (coluna `pago`).

**Regras de negócio**:
- **Lançamento por voz**: `GravadorDeGasto.tsx` grava até 2 min de áudio →
  `POST /api/gastos/transcrever` (rota HTTP, não Server Action, de
  propósito — Server Actions mascaram erro em produção) →
  `interpretarAudioDeGasto` (`lib/gastos-ia.ts`) manda pro Gemini
  (`gemini-3.6-flash`) com `responseSchema` estruturado, extrai
  `valor/descricao/fornecedor/categoria/dataGasto`. Regra "nunca inventa":
  campo incerto vira `null` e entra em `precisaConfirmar`; a tela pinta em
  âmbar e não deixa salvar sem completar. Nada é salvo até o produtor
  confirmar (`criarGasto`).
- **Gasto "Interno"** (`EVENTO_INTERNO = 'interno'`,
  `lib/gastos-constantes.ts:59`): sentinel de UI, não é linha em
  `eventos`. No banco é `evento_id IS NULL`; quando interno,
  `organizacao_id` é gravado na própria linha do gasto para escopar quem
  vê (produtor só vê o Interno da própria org; master vê de todas).
- **Pagador** (texto livre): quem adiantou do próprio bolso, pra saber
  quem reembolsar — separado de "fornecedor" (quem recebeu) e de "status
  pago".
- **Status Pago/A pagar** (coluna `pago`, boolean, default `true`): "já
  saiu do caixa" vs "conta a pagar". Quem marca é quem lança (campo
  "Situação" no form manual); no áudio, ausência de campo = `pago = true`
  sempre — o fluxo de voz não pergunta isso.
- **Isolamento de `custos_evento` (Financeiro)**: decisão explícita do
  Juan (10/09/2026) — tabelas, público, permissão e ciclo de vida
  totalmente separados, sem ligação nem futura, para Gastos poder virar
  produto financeiro próprio.
- **Exportação**: `.xlsx` montado no servidor com identidade visual
  Credenciei (faixa laranja, linha de TOTAL) via ExcelJS; `.csv` gerado
  no cliente. Ambos reconsultam pelo filtro atual da URL, não pela lista
  já carregada.
- Categoria e forma de pagamento são texto livre no banco — a lista
  fechada vive só em `lib/gastos-constantes.ts` (sem CHECK constraint),
  para adicionar categoria não exigir migração.

---

## 2 · Financeiro

**Rotas**: `/admin/financeiro` (dashboard geral), `/admin/eventos/[id]/financeiro`.

**Quem acessa**: exclusivo do `master`.

**Tabelas**: `financeiro_eventos` (faturamento + NFe por evento),
`custos_evento` (despesas, `evento_id` nullable = despesa interna da
agência), bucket `financeiro`.

**Regras**:
- **Vocabulário traduzido só na tela**: desde 09/09/2026 a UI chama
  "Receita"/"Despesa" o que no código e banco continua
  `faturamento`/`custo` — deliberado, para não forçar migração de banco
  por causa de rótulo.
- **Isolado de Gastos** (ver módulo 1).
- Faturamento nasce só quando o master salva pela primeira vez (`upsert`);
  sem linha, lucro = -custo total.
- Dashboard: período filtra **duas coisas diferentes** — quais EVENTOS
  entram (pela `data_inicio`) e quais CUSTOS entram (pela data própria de
  cada custo) — em paralelo.
- Despesa interna (`evento_id = null`) entra no gráfico "por evento" como
  se fosse mais um evento chamado "Despesas internas".
- Categorias com tratamento especial nos KPIs: "WhatsApp / disparos de
  mensagens" e "Funcionários" viram números próprios.

---

## 3 · Auditoria

**Rota**: `/admin/auditoria`.

**Quem acessa**: `podeGerenciarUsuarios` (master/admin) ou
`role === 'suporte'`. Escopo: master vê tudo, admin só a própria
organização, suporte só o que ele mesmo fez.

**Tabela**: `alteracoes_cadastro` (gravada por `registrarAuditoria`,
`lib/auditoria.ts`, chamada por QUALQUER papel que faça ação sensível).

**Contagem de tipos hoje**: `ACAO_LABELS` (`lib/auditoria-rotulos.ts:11-31`)
tem **19 rótulos** (não 18 como uma doc antiga registrava):
`ALTERACAO_CPF`, `ALTERACAO_NOME`, `ALTERACAO_TELEFONE`,
`ALTERACAO_SETOR`, `ATIVACAO_FUNCIONARIO`, `DESATIVACAO_FUNCIONARIO`,
`CADASTRO_EMERGENCIAL`, `REGISTRO_ENTRADA_ASSISTIDA`,
`REGISTRO_SAIDA_ASSISTIDA`, `CORRECAO_PONTO`, `DESCREDENCIAMENTO`,
`EXCLUSAO_FUNCIONARIO`, `BLOQUEIO_CPF`, `DESBLOQUEIO_CPF`,
`EXCLUSAO_PONTO`, `RESET_SENHA`, `ALTERACAO_SUPERVISOR`,
`ALTERACAO_PERMISSAO`, `REABERTURA_TURNO`.

**Achado**: o código grava **2 tipos a mais sem rótulo** —
`ALTERACAO_EVENTO` (`lib/actions.ts:1812`) e
`REABERTURA_CADASTRO_INDIVIDUAL` (`lib/actions.ts:5487`) — caem no
fallback `ACAO_LABELS[l.acao] ?? l.acao` (texto cru na tela). **Total real:
21 tipos de ação em uso.** `CADASTRO_EMERGENCIAL` tem rótulo mas nenhuma
chamada o usa hoje (rótulo órfão).

**Regras**:
- Nunca lança exceção — falha ao gravar não pode travar a ação em si.
- Filtro por setor casa dos DOIS lados (setor da pessoa afetada E setor
  de quem fez) — necessário porque exclusão zera o vínculo do afetado.
- Teto de 200 linhas por período, com aviso explícito na tela.
- Padrão de período é 7 dias, não "tudo".

---

## 4 · Veículos

**Rota**: `/admin/veiculos`.

**Quem acessa**: `podeGerenciarVeiculos` = master, admin, suporte
(`lib/permissions.ts:210-211`) — **supervisor e cliente ficam de fora de
propósito** (decisão do Juan 03/09/2026): quem responde pelo portão, não
quem acompanha equipe. Escopo checado em `exigirAcessoAVeiculos`: master
todos, admin só a própria org, suporte só o escopo contratado.

**Tabelas**: `veiculos`, `veiculo_dias` (dias em que o veículo está
autorizado a entrar).

**Regras**:
- Regra central: **todo veículo é vinculado ao CPF de um condutor já
  credenciado NAQUELE evento** — sem condutor, sem veículo. Busca do
  condutor distingue "CPF não existe" de "CPF existe mas não neste
  evento".
- Placa validada nos dois formatos brasileiros (antigo `ABC1234` e
  Mercosul `ABC1D23`), índice único `(evento_id, placa)`.
- Só cadastro e consulta — veículo **não bate ponto, não tem QR, não
  passa por scanner**.
- Foto é opcional e pode vir depois do cadastro; caminho da foto nunca
  desce pro cliente — só URL assinada de 30 min quando alguém abre.

---

## 5 · Bloquear CPF

**Rota**: `/admin/bloquear-cpf`.

**Quem acessa**: supervisor (só nos próprios setores/eventos), admin,
master, suporte (escopo).

**Tabela**: `cpfs_bloqueados`.

Ver detalhes de regra em
[credenciei-web-regras-de-negocio.md §6](credenciei-web-regras-de-negocio.md#6--bloqueio-de-cpf--escopo-por-evento).

---

## 6 · Avisos

**Rotas**: `/admin/avisos` (escolhe evento primeiro) e
`/admin/eventos/[id]/avisos` (mesma tela, `PainelDeAvisos`).

**Quem escreve**: quem gerencia o evento (`podeGerenciarEventos`) —
admin/master/gerente. Exclusão é liberada até para quem criou, sem exigir
`podeExcluir` (aviso não tem histórico de presença/pagamento embaixo).

**Tabelas**: `avisos`, `aviso_setores` (join N:N quando público =
"setores"), `aviso_visualizacoes` (índices únicos parciais por
`funcionario_id` OU `perfil_id`, nunca os dois).

**Regras**:
- **Público-alvo**: `todos`, `setores` (lista de `fornecedor_id`),
  `pessoa` (por CPF específico), `supervisores` (só quem tem
  `role='supervisor'` ativo).
- **Período de validade**: `data_inicio`/`data_fim` (opcional) —
  comparado contra "hoje em Brasília" (`diaBRT()`), não UTC.
- **Recorrência**: aviso `recorrente` nunca marca "visto" (sempre
  reaparece); não-recorrente só aparece uma vez por identificador.
- **Onde aparece**: modal na credencial pública (via
  `avisosPendentesFuncionario`) e no painel do setor do supervisor (via
  `avisosPendentesSupervisor` — só dispara se `role === 'supervisor'`).
- **Rastreamento de visualização**: `marcarVisualizacao` grava por
  `aviso_id` + UM identificador; `VisualizacoesAvisoModal.tsx` mostra pro
  admin quem já viu.
- `cpf_pessoa` é a chave que cruza os dois mundos (funcionário e perfil de
  supervisor).

---

## 7 · Conferência de equipe (D-1)

**Rota**: `/admin/conferencia/[fid]` (fid = id do setor/fornecedor).

**Quem acessa**: supervisor do próprio setor, admin/master da
organização, suporte no escopo.

**Tabela**: `conferencias_equipe` (uma linha por setor, upsert
idempotente).

**Regras**:
- **Abre 24h antes do início do evento**, nunca fecha depois — "melhor
  confirmar tarde que não confirmar".
- Remover alguém na conferência reusa `descredenciarFuncionario` (mesmo
  motor de exclusão da equipe), só embrulha o motivo padrão.
- Confirmar carimba `confirmada_por`, `confirmada_em`, e **fotografa os
  números** (`total_mantidos`/`total_removidos`) no momento — não
  recalcula depois.
- **Cron diário** (`/api/cron/conferencia-equipe`, protegido por
  `CRON_SECRET`): para todo evento ativo que começa nas próximas ~25h,
  garante a linha (status pendente) para cada setor com supervisor, e
  manda **um único email via Resend** com a planilha CSV da equipe anexa
  — idempotente por `email_enviado_em`. Só manda se o supervisor tiver
  `email_contato` válido.
- CSV da equipe (`planilhaEquipeCsv`) é compartilhado entre o anexo do
  email e o botão "Baixar planilha" da tela.

---

## 8 · Suporte

**Rota**: `/admin/suporte` (só master).

**Tabelas**: `perfis` (role='suporte', campo `acesso_expira_em`),
`suporte_escopo` (organizacao_id OU evento_id por linha).

**Regras**:
- **Escopo por evento OU por organização inteira**, nunca role sozinho:
  `suporteTemEscopo` (`lib/suporte.ts:13-34`) é a ÚNICA função chamada
  por toda action sensível — evita duas réguas divergentes entre módulos.
  `podeEditarIdentidade`, `podeGerenciarVeiculos`, bloqueio de CPF,
  veículos, conferência etc. — todos delegam pra ela.
- **Expiração automática**: `acesso_expira_em` checado dentro de
  `getPerfil()` — passada a data, tratamento idêntico a `ativo=false`. É
  hoje o único papel que usa esse campo.
- Revogação manual zera `acesso_expira_em` para "agora" e marca
  `ativo=false` — não espera a data marcada, revoga na hora.
- Suporte **nunca administra** — é acesso de apoio contratado, não um
  papel operacional.

---

## 9 · Backlog Operacional

**Rota**: `/admin/backlog`.

**Quem acessa**: exclusivo do `master` — é a agência olhando o próprio
pipeline comercial, não um cliente vendo o evento dele.

**Tabelas**: `backlog_itens`, `backlog_historico`.

**Regras**:
- Dois tipos de item: `cliente` (funil comercial de 7 colunas: novo → ...
  → fechado/perdido) e `tarefa` (interna — 6 colunas: backlog → ... →
  concluído/cancelado). A ORDEM das colunas é o funil.
- Escopo é a **plataforma inteira** — comercial da própria agência.
- Quadro/Agenda/Contatos/Lista são **4 leituras dos mesmos itens buscados
  uma vez**, nunca 4 consultas separadas — evita as visões discordarem.
- `converterEmCliente`: transforma um lead em organização de verdade,
  fecha o card automaticamente e **preserva o histórico do Backlog**.
- Datas sempre em `hojeBRT()`, nunca `new Date()` do servidor.

---

## 10 · Relatórios

**Rotas**: `/admin/relatorios` e `/admin/eventos/[id]/relatorios` — mesma
tela, mesmo componente `ExportarRelatorio`.

**Quem acessa**: master (qualquer evento), admin/gerente/cliente (só
própria org), supervisor (só os próprios setores — nunca o relatório
completo do evento). Régua única em `exigirAcessoAoEvento`, reaproveitada
pela página e pela geração da planilha.

**Regras**:
- Relatório é deliberadamente **enxuto**: só 8 perguntas (quem
  entrou/saiu, quando, setor, função, quantos entraram/saíram, período) —
  versão anterior tinha meio/método/status/justificativa e foi cortada a
  pedido do Juan por excesso de informação.
- Cada linha junta quem tem registro e quem estava escalado mas não
  bateu nada, da mesma consulta — as duas listas nunca divergem.
- Período padrão vem de `jornada_dias` (inclui montagem/desmontagem), não
  só `data_inicio`/`data_fim` do show.
- Módulo relacionado mas separado: `lib/relatorio-custo-whatsapp.ts` gera
  PDF simples de comprovante de custo de WhatsApp por evento — função
  pura, sem dependência de banco.

---

## 11 · Lançar ponto manual vs. Registrar ponto assistido

**Lançar ponto manual** — `/admin/lancar-ponto`.
**Registrar ponto assistido** — dentro de `/admin/localizar`.

A diferença real (ver também
[credenciei-web-regras-de-negocio.md §4](credenciei-web-regras-de-negocio.md#4--registro-assistido--appadminlocalizar--libactionsts)):
- **Assistido**: a pessoa está NA FRENTE do operador agora — exige foto
  do rosto (obrigatória), grava a hora ATUAL, GPS opcional. Quem pode:
  `podeAcompanhar` (inclui supervisor, operador de portão). O operador
  escolhe a etapa manualmente.
- **Manual**: a pessoa **já foi embora** — foto é impossível, a prova é
  motivo escrito (mín. 5 caracteres) + autor. Permite hora retroativa.
  Mais restrito: `podeGerenciarEventos` + supervisor + suporte. Existe
  porque, antes dele, regularizar ponto passado só era possível via
  script direto no banco (caso real: 13 pessoas em 01/09/2026).
- **Distinção de campos**: `dataRef` (dia de trabalho) ≠
  `created_at`/hora real da batida — não colapsam num campo só, senão a
  batida "some" do dia trabalhado no fechamento de pagamento.
- Manual valida que a hora informada fica a até 36h depois (ou 12h antes)
  do início do dia de trabalho — trava contra erro de digitação.
- Ambos usam `upsertRegistro` — escolher uma etapa já registrada
  **sobrescreve**, é correção deliberada, nunca duplica.
- Existe ainda `apagarBatida` (apaga de vez) — só master e suporte, mais
  restrito que ambos, porque apagar faz dado sumir sem trilha de "o que
  era antes" recuperável.

---

## 12 · Encontrar colaborador / Base regional de CPFs

**Rotas**: `/admin/encontrar` (tela principal, toggle `?ver=recrutar|todos`)
e `/admin/pessoas/[cpf]` (ficha da pessoa). `/admin/base-funcionarios` e
`/admin/clientes` hoje são **apenas redirects** para essas rotas fundidas
— vestígios de telas antigas.

Este é o item de roadmap "base central de CPFs" da reunião com a Kiki
(15/07/2026) evoluído bem além do escopo original (que era só
pré-preencher formulário — `buscarCadastroPorCpf`, ver
[credenciei-web-regras-de-negocio.md §8.2](credenciei-web-regras-de-negocio.md#82--base-central-de-cpfs-buscarcadastroporcpf)):
agora é um módulo de recrutamento cross-organização inteiro.

**Quem acessa**: **exclusivo do master** — a base cruza gente de TODAS as
organizações da plataforma; abrir pra admin entregaria a equipe de um
cliente ao concorrente dele.

**Tabela**: `funcionarios` (a mesma tabela do credenciamento normal,
agrupada por CPF) — sem tabela nova própria. Colunas-chave:
`consentimento_base`, `consentimento_em`.

**Regras**:
- É o **serviço de montagem de equipe que a agência vende**: quando um
  cliente não consegue fechar a própria equipe, o master busca aqui gente
  que já trabalhou em QUALQUER evento da plataforma e atribui ao evento
  do cliente (`atribuirColaboradorAoEvento`).
- **Toggle "recrutar" vs "todos"**: "recrutar" (padrão) só mostra quem
  tem `consentimento_base = true`, ordenado por relevância (mais eventos
  trabalhados primeiro) — "quem vale ligar". "todos" mostra a base
  inteira sem esse filtro, ordenado por cadastro mais recente — usado
  quando um cliente novo manda planilha e se quer conferir quem o sistema
  já reconhece pelo CPF.
- `consentimento_base` só é gravado `true` automaticamente no **cadastro
  público via link/formulário** — cadastro manual pelo admin, importação
  por planilha e atribuição pelo master **não** marcam consentimento. Não
  há tela de opt-in explícita separada; é implícito no ato de se
  autocadastrar.
- **"Chamar" vs "Atribuir"**: Chamar abre o WhatsApp do PRÓPRIO master
  com o número da pessoa (sem convite automático). Combinado o trabalho,
  "Atribuir" abre a ficha, escolhe evento → setor (dois passos
  deliberados, porque os setores dependem do evento escolhido) e a pessoa
  entra na equipe do cliente recebendo o link da credencial.
- A ficha da pessoa **nunca mostra valores pagos** — decisão de
  privacidade competitiva: "o que outra organização pagou é preço de
  concorrente". Mostra só onde já trabalhou, em que função, se bateu
  ponto.
- Teto de leitura de 10.000 registros (subiu de 300→2000→10000 conforme a
  base cresceu; hoje passa de 1000 pessoas autorizadas).
- Trava de "um CPF por evento" reaplicada aqui (mesma trava do formulário
  público e da importação por planilha).

Outros candidatos verificados e descartados como "módulo novo":
`/admin/atividades` é só outra entrada pra tela de presença/pendências já
existente; `/admin/clientes` é um redirect morto para `/admin/usuarios`.

---

## Observações gerais úteis pro app

- Datas de negócio quase sempre usam `diaBRT()`/`hojeBRT()` (fuso
  America/Sao_Paulo), nunca o relógio do servidor (roda em Washington) —
  importante replicar na API própria.
- Server Actions em produção mascaram exceções cruas — módulos recentes
  (Gastos, Financeiro) padronizaram em `{ ok, erro }` sempre, ou usam
  rota HTTP quando a mensagem de erro precisa chegar íntegra (ex.:
  transcrição de áudio).
- Padrão recorrente de escopo: master (tudo) → admin (própria
  `organizacao_id`) → suporte (`suporte_escopo`) → supervisor
  (`meusSetores`) — repetido quase idêntico em Veículos, Bloquear CPF,
  Conferência, Relatórios, Lançar ponto.
- RLS é ligado, mas todo acesso passa pelo `supabaseAdmin` (service role)
  no servidor — nenhuma tabela é lida direto do browser.

---

## Metodologia

Investigação read-only em 22/09/2026, código atual (não documentação
antiga). Nenhum arquivo do site foi alterado.
