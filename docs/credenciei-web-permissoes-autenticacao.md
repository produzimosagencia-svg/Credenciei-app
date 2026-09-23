# Credenciei Web — papéis, permissões e autenticação (22/09/2026)

Referência de como o site (`c:\Dev\credenciei`) decide quem pode fazer o
quê e como alguém entra no sistema. Citações são `arquivo:linha` do repo
do site.

Ver também: [credenciei-web-regras-de-negocio.md](credenciei-web-regras-de-negocio.md),
[credenciei-web-modulos.md](credenciei-web-modulos.md),
[credenciei-web-funcoes-integracoes.md](credenciei-web-funcoes-integracoes.md).

---

## 1 · Modelo de papéis (`perfis.role`)

Fonte de verdade: `lib/permissions.ts:1-33` (comentário-cabeçalho +
`export type Role`).

```
export type Role = 'master' | 'admin' | 'supervisor' | 'gerente' | 'cliente'
  | 'operador_portao' | 'suporte' | 'produtor'
```

| role | organizacao_id | O que faz | Login |
|---|---|---|---|
| **master** | sempre `null` | Dono da plataforma. Vê e gerencia TODAS as organizações/eventos, cria admins, único que EXCLUI algo. Nunca é afetado por override de permissão. | e-mail + senha |
| **admin** | de UMA organização | Dono de uma organização. Vê só `eventos.organizacao_id = perfil.organizacao_id`. Cria equipe (supervisores) e eventos até o limite da org. NÃO exclui (só encerra/desativa). | e-mail + senha |
| **supervisor** | herdada via `fornecedor_id` | Preso a UM setor (fornecedor) de um evento. Gerencia a equipe daquele setor. Pode cobrir vários setores via `supervisor_setores`. Não escaneia por padrão (ver §3a). | **CPF + senha** |
| **operador_portao** | da organização (não do evento) | Vinculado ao EVENTO inteiro (`fornecedor_id` nulo), não a um setor. Só lê QR e registra ponto manual — nunca gerencia evento/equipe/usuários. "Posto de credenciamento sem senha de admin". | CPF + senha |
| **suporte** | nenhuma (escopo próprio) | Acesso CONTRATADO pro dia do evento (corrige CPF errado, setor errado, ponto que não bateu, reset de senha). Escopo granular em `suporte_escopo` (organização inteira OU evento avulso — nunca as duas na mesma linha). Pode ter `acesso_expira_em`. Nunca exclui, não mexe em financeiro, não cria admin, não dispara WhatsApp em massa. | CPF + senha |
| **produtor** | de UMA organização | Cliente do produto separado "Gastos". Só enxerga `/gastos`, só os eventos vinculados em `produtor_eventos`. Nenhum acesso ao credenciamento. Master continua entrando só para dar suporte a um produtor. | CPF + senha |
| **gerente**, **cliente** | de organização (como admin) | **Legados**: continuam válidos no banco, mas a UI não oferece mais criá-los. "Tratamos `gerente` como equivalente a admin" — quase toda `capacidade()` inclui `role === 'gerente'`/`'cliente'` ao lado de `admin` pelo mesmo motivo. | e-mail + senha |

Evolução histórica da constraint de banco (útil pra saber o que o SQL
aceita hoje):
- `upgrade-papeis-setores-qr.sql` → `admin, gerente, supervisor, cliente`
- `upgrade-multi-organizacao.sql` → adiciona `master`
- `upgrade-operador-portaria.sql` → adiciona `operador_portao`
- `upgrade-suporte.sql` (mais recente) → `master, admin, gerente,
  supervisor, cliente, operador_portao, suporte`

**Ponto não óbvio**: `produtor` **não está em nenhum CHECK constraint**
(`upgrade-produtor.sql:9`: "texto livre — nenhum CHECK a barrar"). Para o
app: a validação de papel válido não pode confiar em constraint de banco
para `produtor`; é 100% responsabilidade da aplicação.

---

## 2 · Isolamento multi-organização

Introduzido em `upgrade-multi-organizacao.sql`:
- Tabela `organizacoes`: `id`, `nome`, `limite_eventos` (quantos eventos o
  admin pode criar), `ativo` (master pode suspender a organização inteira).
- `perfis.organizacao_id` — `NULL` = usuário master da plataforma.
- `eventos.organizacao_id` — a mesma fronteira.

**Master é a única exceção que vê tudo.** Padrão repetido dezenas de vezes
no código: `if (!ehMaster(perfil.role) && evento.organizacao_id !==
perfil.organizacao_id) throw ...` (ex.: `lib/actions.ts:1613-1615,
1650-1652, 169-171, 5936-5938`).

Funções utilitárias que aplicam o mesmo corte (`lib/supabase-server.ts`):
- `eventosEscaneaveis` (224-252): master vê todos os eventos ativos;
  supervisor só o evento do seu setor; admin/gerente/cliente só os
  eventos ativos da própria organização.
- `podeEscanearEvento` (255-271): mesma régua, checando um evento
  específico.
- `licencasDeEventoRestantes` (164-175): master = `Infinity`; admin =
  `limite_eventos - eventos_já_criados`; organização suspensa ou sem
  permissão = `0`.

Uma segunda camada de isolamento, mais fina, está em desenvolvimento (ver
§3b) em `lib/autorizacao.ts` (`alcancaEvento`, `alcancaSetor`) — cobre
também `supervisor` e `suporte`, mas **ainda não está ligada em nenhuma
tela/action**.

---

## 3 · Sistema de permissões granular

Há **dois sistemas coexistindo**, um em produção e um em construção.
Crítico entender qual é qual.

### 3a. Sistema em produção — `lib/permissions.ts`

Camadas de resolução, da mais específica para a mais geral
(`resolver`, linhas 60-87):
1. **Override do próprio ACESSO** — `perfis.permissoes_usuario[chave]`
   (booleano por pessoa, gravado no criar/editar acesso).
2. **Exceção da ORGANIZAÇÃO** — tabela `permissoes_organizacao`, chaveada
   por `role:chave` (ex.: `supervisor:escanear`), carregada em
   `getPerfil()` (`excecoesDePermissao`) e anexada como `perfil.permissoes`.
3. **Padrão do código** — a função `padrao(role)` de cada capacidade.

A primeira camada com um booleano definido vence. **`master` nunca é
afetado** (linha 77: "uma tela de permissões capaz de tirar do master a
permissão de abrir a tela de permissões se tranca sozinha").

Catálogo de capacidades (`CAPACIDADES`, linhas 257-308) — cada uma com
`chave`, `nome`, `descricao`, `padrao(role)`, e opcionalmente `peso`
(aviso de risco na UI). Chaves atuais: `ver_todos_eventos`,
`gerenciar_organizacoes`, `gerenciar_eventos`, `gerenciar_acessos`,
`escanear`, `acompanhar`, `gerenciar_veiculos`, `corrigir_cpf`,
`excluir_da_equipe`, `gerenciar_backlog`, `registrar_gastos`, `excluir`.

Cada capacidade é uma função exportada e testada no código onde a ação
acontece (não é middleware central): `podeGerenciarUsuarios` (115-116),
`podeEscanear` (225-226), `podeEditarIdentidade` (196), etc. Decisões não
óbvias:
- `podeExcluirDaEquipe` (132-147) é mais largo que `podeExcluir` de
  propósito — decisão do Juan em 04/09/2026 pra supervisor limpar a
  própria equipe sem depender de ninguém.
- `podeEscanear` (213-226) deliberadamente **exclui** supervisor: "Quem
  credencia é o posto de credenciamento — o supervisor cuida da equipe,
  não do portão."
- `podeGerenciarBacklog` e `podeRegistrarGastos` ficam restritos a
  `master`/`produtor` por decisão de negócio (dados comerciais sensíveis
  / produto separado), não por limitação técnica.

**Onde se configura**:
1. `/admin/configuracoes` (guard `ehMaster`) — grade por ORGANIZAÇÃO ×
   papel, grava/apaga linhas em `permissoes_organizacao`. Vazio = "segue
   o padrão do código". Só `PAPEIS_CONFIGURAVEIS = ['admin', 'supervisor',
   'operador_portao', 'suporte']` aparecem — `master`, `gerente`,
   `cliente` ficam de fora de propósito.
2. Aba "Funções ligadas" em `/admin/usuarios/novo` — toggles por PESSOA
   (override individual), usando `capacidadesDoPapel(role)` para listar
   só o que aquele papel tem por padrão (desligável) ou pode ganhar via
   `PODEM_GANHAR` (hoje só `supervisor: ['escanear']`). O form manda só o
   que DIFERE do padrão, gravado em `perfis.permissoes_usuario`.

### 3b. Sistema em construção — `lib/autorizacao.ts` + `lib/autorizacao-matriz.ts`

**⚠️ Aviso explícito no próprio código**: "EM DESENVOLVIMENTO —
10/09/2026. NÃO É USADO por nenhuma tela ou action ainda". É uma
refundação de permissões (por Ação, não por Capacidade solta), com uma
matriz `MATRIZ: Record<Acao, RegraAcao>` que já modela escopo (`nenhum` |
`evento` | `setor`) e mantém compatibilidade com os overrides antigos via
`chaveLegada`. Tem função-guard pronta (`exigirAcesso`), mas ela não é
chamada em produção hoje.

**Recomendação para o app espelho**: implementar contra o sistema §3a (o
que está de fato em vigor), mas ficar de olho neste arquivo — é a direção
futura, e várias decisões novas já documentadas ali (ex.: "Gestor de
Credenciamento" como elevação de `operador_portao`, supervisor ganhando
Auditoria) podem chegar à produção mais adiante.

---

## 4 · Autenticação — fluxos de login

Todo login físico é **Supabase Auth por e-mail + senha**; o "CPF" é só uma
tradução de identificador antes de chamar o Supabase. **Não existe login
por WhatsApp** — o WhatsApp é usado só como CANAL para entregar o
convite/link de criação de senha, nunca como fator de autenticação.

### 4a. Rota única de login — `app/api/auth/login/route.ts`

Recebe `{ email, senha }` (o campo se chama `email` mas aceita e-mail OU
CPF OU o username legado), chama `identificadorParaEmail(digitado)`
(`lib/usuario.ts:89-99`) e então `supabase.auth.signInWithPassword(...)`.
Tratamento especial: se o texto digitado é só dígitos e não tem 11,
devolve erro específico de "CPF incompleto" em vez do genérico
"credenciais inválidas" — porque isso gerava confusão real na portaria.

### 4b. CPF → e-mail sintético — `lib/usuario.ts`

- Domínio interno reservado: `DOMINIO_INTERNO = 'supervisor.credenciei'`
  — "não existe fora do banco de autenticação".
- `cpfParaEmail(cpf)`: `"123.456.789-00"` → `"12345678900@supervisor.credenciei"`
  (só os dígitos, pontuação não importa).
- `usuarioParaEmail(usuario)`: formato ANTIGO, nome de usuário livre (ex.
  `"joao.bar"`) → `"joao.bar@supervisor.credenciei"`. Mantido só por
  compatibilidade com quem foi cadastrado antes da troca para CPF ("tirar
  isso trancaria supervisores que já existem para fora do sistema, sem
  aviso").
- `identificadorParaEmail(digitado)` é o dispatcher: tem `@` → e-mail real
  (admin/master); só dígitos e 11 deles → CPF; senão → username legado.
- **Por quê existe**: Supabase Auth só autentica por e-mail; CPF resolve
  "a pessoa esquece o usuário que o organizador inventou" — todo mundo
  sabe o próprio CPF de cor.
- Admin e master usam e-mail de verdade porque "recebem comunicação e
  precisam de recuperação de senha" — **não há fluxo de "esqueci minha
  senha" para CPF via e-mail**; para esses papéis a recuperação é manual
  (`gerarLinkDeAcesso`, ver abaixo).

### 4c. Criação de conta

Todas as funções de criar acesso (`criarSupervisor`, `criarOperadorPortaria`,
`criarSuporte`, `criarProdutor`, `adicionarAdmin`, em `lib/actions.ts`)
seguem o mesmo padrão (exemplo em `criarSupervisor`, linhas 718-731):
1. `admin.auth.admin.createUser({ email, password: randomBytes(32).toString('base64url'), email_confirm: true })`
   — **cria a conta de verdade no Supabase Auth**, com senha aleatória de
   32 bytes que **nunca é mostrada nem enviada a ninguém**: ela só existe
   para deixar a conta inacessível até a pessoa definir a própria senha
   pelo convite.
2. Insert em `perfis` com `id = user.user!.id`. Se esse insert falhar, o
   usuário do Auth é apagado (rollback manual) — sem isso, 9 contas
   ficaram órfãs no passado (Auth existe, perfil não, e-mail "queimado"
   para sempre).
3. Convite de senha via `criarConviteSenhaSupervisor`
   (`lib/supervisor-convite.ts:62-87`): gera um token aleatório de uso
   único, guarda só o **SHA-256** dele numa tabela genérica
   `sistema_estado`, válido por 24h. Link: `{site}/supervisor/criar-senha/{token}`.
4. Entrega do link: para supervisor/operador, por template do WhatsApp via
   `agendarTemplateSupervisor`. Nota curiosa: o texto fixo aprovado na
   Meta diz "supervisor" mesmo quando é operador de portão — "decisão
   explícita do Juan, sabendo da limitação".
5. Para admin (`criarOrganizacao`), a senha é definida diretamente pelo
   formulário — não passa pelo fluxo de convite/link.
6. Consumo do convite: `definirSenhaComConvite(token, senha)` revalida o
   token no servidor, marca `usado_em` de forma atômica (impede duplo
   envio simultâneo do form) e chama
   `admin.auth.admin.updateUserById(perfilId, { password: senha })`.
7. Reset manual a qualquer momento: `gerarLinkDeAcesso(perfilId)` — gera
   novo link (mesmo mecanismo, 24h, uso único) sem invalidar a senha
   atual, para quando alguém esquece a senha no meio do evento.

**Não existe fluxo de login por WhatsApp** — confirmado por busca ampla;
WhatsApp aparece só como canal de entrega de convite/lembrete.

---

## 5 · Expiração e desativação de acesso

Três mecanismos independentes, todos verificados dentro de `getPerfil()`
(`lib/supabase-server.ts:87-119`, cache por requisição):

1. **`perfis.ativo`** (boolean) — "Conta desativada (Status = Inativo) é
   tratada como não-logada em todo o app" → se `ativo === false`,
   `getPerfil()` devolve `null` (equivalente a deslogado), mesmo com
   sessão válida no Supabase Auth. Ligado/desligado por
   `alternarAtivoUsuario`; master nunca é alvo.
2. **`perfis.acesso_expira_em`** (timestamptz, nullable) — passada a
   data, mesmo tratamento de `ativo=false`. Hoje só `suporte` recebe
   valor, mas a coluna é genérica.
3. **`perfis.inativado_em_evento`** (uuid → `eventos.id`, nullable). Ao
   **encerrar um evento**, `inativarAcessosDoEvento(eventoId)` marca
   `ativo=false` + `inativado_em_evento=eventoId` em quem foi criado PARA
   aquele evento (supervisores dos seus setores, suporte cujo escopo é só
   esse evento). Ao **reativar**, `reativarAcessosDoEvento` religa só
   quem tem essa marca — não religa quem foi desativado manualmente por
   outro motivo. **Fica de fora `operador_portao`** de propósito: pertence
   à organização, cobre vários eventos do mesmo cliente, e encerrar um
   evento não deve derrubar o acesso dele nos outros.

Ordem de checagem em `getPerfil()`: `ativo === false` → `null`; depois
`acesso_expira_em` vencido → `null`. Ambos checados a cada requisição
(cache por request), então a desativação/expiração tem efeito imediato na
próxima navegação, sem precisar derrubar sessão do Supabase Auth.

---

## 6 · RLS (Row Level Security)

Confirmado em `upgrade-rls-lockdown.sql` e `lib/autorizacao.ts:14-21`:

- RLS **ligado** em todas as tabelas de app.
- **Zero `CREATE POLICY`** — "RLS ligado + zero políticas = acesso negado
  para anon e authenticated. A service role (usada só no servidor) ignora
  o RLS por padrão."
- Único ponto de acesso ao banco: `supabaseAdmin`
  (`lib/supabase-server.ts:38-42`), criado com `SUPABASE_SERVICE_ROLE_KEY`
  — "É o ÚNICO caminho de acesso ao banco no servidor... NUNCA importar
  isto em componentes de browser ('use client')."
- Autorização inteira roda no código do servidor, nunca no banco.
  `lib/autorizacao.ts:14-20`: "a barreira real é este código rodando no
  servidor. Toda Server Action e todo RSC chamam `exigirAcesso` no topo,
  senão a linha do menu é a única proteção — e menu não é segurança."
- O SQL já antecipa o app: "Fase futura (defesa em profundidade,
  opcional): criar políticas por organizacao_id para o papel
  authenticated, caso algum dia o cliente passe a acessar o Supabase
  direto do navegador. Hoje isso não acontece."

**Implicação direta e crítica para o app**: como não há nenhuma policy, a
chave `anon` do Supabase não consegue ler nem escrever NADA — nem dados
da própria organização do usuário logado. O app React Native **não pode
falar direto com o Supabase** (nem com a chave anon autenticada via
Supabase Auth) para nenhuma tabela de negócio: qualquer leitura ou
escrita de `perfis`, `eventos`, `funcionarios`, `registros` etc. precisa
passar por uma API própria (a mesma lógica de
`lib/permissions.ts`/`lib/autorizacao.ts`/checagens inline de
`lib/actions.ts` reimplementada no backend da API) que use a service role
no lado do servidor. O único uso legítimo do Supabase Auth do lado do
cliente seria a troca de credenciais por sessão (login), nunca consultas
de dados.

---

## Arquivos-chave para referência rápida

- `lib/permissions.ts` — catálogo de capacidades em produção.
- `lib/autorizacao.ts` + `lib/autorizacao-matriz.ts` — sistema de
  ações/matriz em construção (não ligado ainda).
- `lib/usuario.ts` — toda a lógica de CPF↔e-mail sintético.
- `lib/supervisor-convite.ts` — convite/reset de senha por link único.
- `lib/supabase-server.ts` — `getPerfil()`, `supabaseAdmin`, isolamento
  por organização.
- `lib/suporte.ts` — escopo do papel suporte.
- `app/api/auth/login/route.ts` — única rota de login.
- `supabase/upgrade-rls-lockdown.sql`, `upgrade-suporte.sql`,
  `upgrade-produtor.sql`, `upgrade-multi-organizacao.sql`,
  `upgrade-evento-encerrado-inativa-acesso.sql`.

---

## Metodologia

Investigação read-only em 22/09/2026, arquivos lidos por inteiro onde
citados. Nenhum arquivo do site foi alterado.
