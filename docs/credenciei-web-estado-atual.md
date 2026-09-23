# Credenciei Web — estado atual (11/09/2026)

Escrito depois de um pedido explícito do Juan: **desconsiderar qualquer
versão antiga usada como referência** — o site mudou muito (134 commits em
12 dias, 31/08 a 11/09) e este documento é o retrato de agora, não de
memória de conversa anterior.

**22/09/2026**: pra regras de negócio, permissões e módulos, prefira os
quatro documentos de referência mais novos e mais fundos — este aqui
continua útil pro panorama de identidade visual e "o que mudou desde a
última vez que o app olhou":
[credenciei-web-regras-de-negocio.md](credenciei-web-regras-de-negocio.md),
[credenciei-web-permissoes-autenticacao.md](credenciei-web-permissoes-autenticacao.md),
[credenciei-web-modulos.md](credenciei-web-modulos.md),
[credenciei-web-funcoes-integracoes.md](credenciei-web-funcoes-integracoes.md).
Duas correções pontuais encontradas nessa investigação: Auditoria tem
**21 tipos de ação** em uso (não 18 — 19 têm rótulo, 2 caem em fallback de
texto cru); e a seção 4.1 abaixo ("Base de funcionários virou toggle")
ganhou depois um módulo bem maior, "Encontrar colaborador"
(`/admin/encontrar`), cross-organização e exclusivo do master — ver
[credenciei-web-modulos.md §12](credenciei-web-modulos.md#12--encontrar-colaborador--base-regional-de-cpfs).

Levantado por 4 investigações paralelas, só leitura, direto no código de
`c:\Dev\credenciei` (HEAD `fcd7dd3`). Nada foi alterado lá — é proibido, e
continua proibido.

**O evento de referência mudou de status.** Henrique e Juliano, Kleber
Andrade, 05/09/2026 — usado em boa parte dos testes e fixtures deste
projeto — **já aconteceu**. Não é mais evento futuro em nenhum exemplo daqui
pra frente.

---

## 0 · O que isso muda, em uma frase

O app foi construído contra uma versão do site que já não existe mais em
pontos importantes — inclusive **regras de negócio que o app já implementou
e que hoje estão erradas**, não só faltando. A cor, a fonte e o layout
também mudaram por completo. Isto aqui é o mapa; o que fazer com ele é
decisão de prioridade, não deste documento.

---

## 1 · Identidade visual — trocou por completo

`app/globals.css` do site passou por um redesign chamado **"Arena"**.
`apps/app/src/ui/tema.ts` (copiado do roxo/claro antigo) **está
desatualizado**:

| | Antes (o que `tema.ts` tem hoje) | Agora, no site |
|---|---|---|
| Tema padrão | Claro | **Escuro** — fundo `#0d0c0c`, texto `#f3f2f2` |
| Cor de marca | Roxo `#6d46ff` | **Laranja** `#FF4A0F`, gradiente `#A31B05 → #FF4A0F → #FF8A4C` |
| Fundo | `#d9dce3` | `#0d0c0c` (escuro) / `#f3f2f2` (tema claro opcional) |
| Ícone da marca | QR roxo desenhado à mão | Símbolo oficial da marca, laranja |

Não é bug de regra — é branding. Mas **toda tela do app carrega a
identidade antiga hoje**, e quanto mais tempo passar, mais telas terão que
ser revisitadas quando a cor trocar.

---

## 2 · Papéis — três novos que não existem no app

`packages/dominio/src/permissoes.ts` hoje tem:
`master | admin | supervisor | gerente | cliente | colaborador`.

O site tem, além desses:

- **`produtor`** — cliente do produto **Gastos** (seção 5). Não vê nada do
  credenciamento — só os eventos vinculados a ele, e só a tela de Gastos.
  Login por CPF + senha. Criado exclusivamente pelo master.
- **`operador_portao`** (rótulo na tela: "Gestor de credenciamento",
  popularmente "porteiro") — escaneia o portão e faz registro assistido.
  Preso à organização (não a um evento), cobre vários eventos do mesmo
  cliente. Já existia; ganhou uma tela de apresentação
  (`admin/criar-porteiro`) recentemente.
- **`suporte`** — acesso contratado externamente para resolver problema
  pontual (CPF errado, ponto que não bateu). Escopo definido por evento e/ou
  organização, com data de expiração. Só master cria.

Além disso, o sistema de permissões inteiro ficou mais granular: **3
camadas** (override por pessoa → exceção por organização → padrão do
código), com um catálogo de capacidades (`CAPACIDADES` em
`lib/permissions.ts`) editável tanto por organização (`/admin/configuracoes`)
quanto por pessoa individual (aba "Funções" no criar/editar acesso).

---

## 3 · Regras de negócio que o app JÁ IMPLEMENTOU e que hoje estão erradas

Esta é a seção que mais importa. Não é "falta construir" — é comportamento
que o app mostra hoje e que diverge do que o site faz agora.

### 3.1 — QR de evento que atravessa a meia-noite (`faseAtualDoQR`)

`lib/janelas.ts` do site: um evento noturno continua com o QR válido como
"fase = evento" até `data_fim`, em vez de virar "desmontagem" à meia-noite
pela lógica antiga de calendário civil. Usado tanto para gerar o QR quanto
para ler.

**Risco**: se `packages/dominio/src/janelas.ts` ainda usa a lógica antiga,
o crachá de alguém que trabalha depois da meia-noite pode ser recusado no
portão, ou mostrar a fase errada — o tipo de coisa que só aparece num
evento de verdade, tarde da noite.

### 3.2 — Sair e voltar no mesmo dia: reabre o turno, não recusa

Antes: quem batia saída e voltava no mesmo dia era recusado (índice único
no banco). Hoje: a leitura seguinte **reabre o turno** — apaga a saída
anterior, mantém a entrada original, a próxima leitura vira a saída final.
Vai pra auditoria (`REABERTURA_TURNO`). Carência de 5 minutos para não
apagar uma saída batida por leitura duplicada.

**Risco**: se `avaliarEntradaSaida` no domínio do app ainda recusa esse
caso, o app está barrando um comportamento que o site aceita — no mesmo
evento, no mesmo minuto.

### 3.3 — Registro assistido: o operador escolhe a etapa, não é mais automático

`app/admin/localizar` hoje: o operador vê uma grade Entrada/Meio/Saída,
pré-marcada com a sugestão do sistema, mas livre para trocar — inclusive
sobrescrevendo uma etapa já registrada, com aviso explícito. Antes o
sistema decidia sozinho.

**Risco**: se a tela `ponto.tsx` do app ainda decide a etapa sozinha sem
deixar escolher, diverge do fluxo real.

### 3.4 — Busca de CPF com erro de digitação

`localizarFuncionario` no site: se a busca exata por CPF não achar nada,
tenta de novo com distância de até 2 dígitos diferentes contra toda a base,
e mostra candidatos marcados como aproximados. O app provavelmente só faz
busca exata.

---

## 4 · Estruturas de tela que mudaram

### 4.1 — Base de funcionários virou um toggle dentro de Encontre colaborador

`app/admin/base-funcionarios` hoje é **só um redirect** para
`/admin/encontrar?ver=todos`. As duas telas se fundiram: "Prontas para
recrutar" (quem autorizou aparecer na base, ordenado por relevância) e
"Toda a base" (todo mundo, ordenado por cadastro recente) são a MESMA tela
com um toggle. Ambas exclusivas do master.

O app hoje tem `base-funcionarios.tsx` e `encontrar.tsx` como **duas telas
separadas**, com fixtures diferentes — diverge da estrutura atual.

### 4.2 — Criar setor agora exige o supervisor no mesmo formulário

Antes: criar setor era uma etapa; criar/convidar supervisor, outra. Hoje:
o formulário de criar setor já pede nome + CPF + WhatsApp do supervisor
junto — comentário do código: "o setor nascia com link de cadastro aberto
e ninguém responsável".

### 4.3 — Editar evento perdeu o horário do meio, ganhou 3 controles novos

- **Horário do meio**: não existe mais como campo — o meio é sempre
  entrada + 4h, calculado por pessoa (isso o app já constrói certo).
- **Batida livre** (`batida_livre`): checkbox que desliga a trava de
  horário no dia principal — o app já tem isso.
- **Auto-atendimento no dia principal** (`checkin_autonomo`): **novo**,
  libera o funcionário escanear o próprio QR fixo da portaria mesmo no dia
  do evento (antes só valia pra montagem/desmontagem). O app não tem.
- **Configuração do meio por setor+dia** (`ConfiguracaoDoMeio.tsx`):
  **novo** — não é mais "que horas", é "quais setores pedem confirmação do
  meio, em quais dias" (existe por causa do custo de WhatsApp por
  confirmação). O app não tem.

### 4.4 — Atividades do evento foi reescrita

Compartilha lógica com uma tela nova, `/admin/eventos/[id]/presenca`, via
`lib/presenca-visoes.ts` — 7 "visões" (entrada, meio, fim, presentes,
faltam, sem_meio, sem_saida) em vez dos KPIs antigos. "Ainda não chegaram"
e "Batidas hoje" foram removidos por enganosos. Seletor de dia agora é
sempre visível, mesmo com evento único, e virou calendário.

---

## 5 · Módulos inteiramente novos

| Módulo | Rota | Quem acessa | Pra que serve |
|---|---|---|---|
| **Gastos** | `/gastos`, `/gastos/lista`, `/gastos/painel` | `produtor`, `master` | Despesa de evento lançada por voz (IA transcreve e extrai campos, nunca inventa dado incerto) ou manual. Produto isolado do credenciamento — "não pode virar Financeiro". |
| **Financeiro** | `/admin/financeiro`, `/admin/eventos/[id]/financeiro` | só `master` | Receita/Despesa/Lucro da agência (o que ela cobra do cliente e o que gasta). Isolado de Gastos por decisão explícita — nenhuma ligação de dados entre os dois. |
| **Auditoria** | `/admin/auditoria` | master/admin/gerente/suporte (escopo) | Trilha de quem alterou o quê em cadastro de pessoa — 18 tipos de ação registrados. |
| **Veículos** | `/admin/veiculos` | master/admin/suporte | Cadastro de veículo por evento (placa, condutor já credenciado) — só consulta manual na portaria, não bate ponto nem tem QR. |
| **Bloquear CPF** | `/admin/bloquear-cpf` | supervisor (só nos eventos onde atua), admin/master, suporte | Bloqueia uma pessoa **do evento inteiro** (não global, não por setor) — recusa cadastro e leitura de QR, sem apagar histórico. |
| **Avisos** | `/admin/avisos`, `/admin/eventos/[id]/avisos` | admin/master/gerente/cliente escreve; colaborador e supervisor recebem | **Mural in-app, não é WhatsApp.** Admin escreve título+mensagem, escolhe público (todos / setores / pessoa / supervisores), período de validade, recorrente ou não. Aparece como modal na credencial do colaborador e no painel do supervisor. Rastreado por pessoa (`aviso_visualizacoes`). **Ver seção 7 — muda o modelo de notificação que eu estava desenhando.** |
| **Conferência de equipe (D-1)** | `/admin/conferencia/[fid]` | supervisor do setor, admin/master, suporte | A partir de 24h antes do evento (nunca fecha depois), supervisor confere a lista do setor e confirma ou remove quem não deveria estar. Lembrete automático por **e-mail** (Resend, canal novo) 1x/dia via cron. |
| **Criar porteiro** | `/admin/criar-porteiro` | quem gerencia acessos | Só uma tela explicativa sobre o papel `operador_portao`, que já existia. |
| **Suporte** | `/admin/suporte` | só master | Gerencia o papel `suporte` (acesso externo com escopo e expiração). |
| **Backlog Operacional** | `/admin/backlog` | só master | Pipeline comercial **interno da agência** (clientes em prospecção, tarefas). Não é dos clientes da plataforma — provavelmente não faz sentido no app mobile. |
| **Relatórios** | `/admin/relatorios`, `/admin/eventos/[id]/relatorios` | quem tem acesso ao evento | Exporta presença/ponto da equipe em planilha — não é financeiro, apesar do nome parecer. |
| **Lançar ponto manual** | `/admin/lancar-ponto` | quem gerencia eventos, supervisor (próprio setor) | Diferente de "Registrar ponto assistido": aqui a pessoa **já foi embora**, sem foto possível — regulariza hora/dia/etapa manualmente, com motivo e autor registrados. |
| **Editar colaborador** (atalho) | `/admin/editar-colaborador` | quem gerencia eventos, suporte | Atalho de menu pro mesmo modal de ficha que já existe dentro de um setor — busca o colaborador em TODOS os setores do evento primeiro. |

---

## 6 · O que não é prioridade pro app mobile

- **Backlog Operacional** — ferramenta de escritório da própria Produzimos, não dos clientes. Kanban/calendário fazem mais sentido no computador.
- **Financeiro** e **Auditoria** completos — dashboards densos de análise, mais naturais no computador. Pode fazer sentido uma versão bem mais enxuta no app (ex.: só o resumo dos KPIs), mas não a réplica completa.
- **Configurações de permissão por organização** — tela de administração pesada, uso esporádico.

---

## 7 · O que isso muda no trabalho de notificação que eu estava fazendo

Eu tinha desenhado o modelo de push com base só no sistema de lembretes
automáticos por WhatsApp (`lib/mensagens.ts`). Esse sistema continua
existindo e continua sendo a base certa para os **lembretes agendados**
(dia do evento, hora da etapa, reforço, alerta de pendência ao
supervisor).

Mas existe um **segundo mecanismo**, "Avisos" (seção 5), que é mais
parecido com o que push deveria ser: um admin ESCREVE uma mensagem, escolhe
o público, e ela aparece pra quem deveria ver. Antes de eu continuar
construindo a tela de notificações do app, preciso decidir com o Juan se
o modelo final funde os dois (lembretes automáticos + avisos manuais do
admin) ou trata como duas coisas separadas na tela.

---

## 8 · Tabelas de banco novas (visão rápida)

`gastos_evento`, `produtor_eventos`, `financeiro_eventos`, `custos_evento`,
`alteracoes_cadastro` (auditoria), `veiculos`, `veiculo_dias`,
`cpfs_bloqueados`, `avisos`, `aviso_setores`, `aviso_visualizacoes`,
`conferencias_equipe`, `suporte_escopo`, `backlog_itens`,
`backlog_historico`, `permissoes_organizacao`. Coluna nova em `perfis`:
`permissoes_usuario`, `email_contato`, `acesso_expira_em`,
`inativado_em_evento`.

Todas com RLS habilitado mas sem policy — autorização é 100% em código de
aplicação (`supabaseAdmin`, service role), nunca confiar só em RLS.

---

## Metodologia

Read-only, via 4 investigações paralelas no código atual de
`c:\Dev\credenciei` (HEAD `fcd7dd3`, 11/09/2026), cruzando `git log --since
2026-08-31` com leitura do estado atual dos arquivos (nunca só a mensagem
do commit). Nenhum arquivo de produção foi alterado.
