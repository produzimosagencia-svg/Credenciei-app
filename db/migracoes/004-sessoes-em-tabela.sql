-- ════════════════════════════════════════════════════════════════════════════
-- 004 · Sessões do app, numa tabela — não mais na memória do processo
-- ════════════════════════════════════════════════════════════════════════════
--
-- Aditiva e isolada. Cria UMA tabela nova, que nenhuma tela do site lê ou
-- escreve — é só da API do app (`credenciei-app`), nunca do `credenciei-web`.
--
-- ─── O PROBLEMA ─────────────────────────────────────────────────────────────
--
-- `SessoesEmMemoria` (apps/api/src/sessoes.ts) guarda token de acesso e de
-- renovação num Map, dentro do processo Node. Reiniciar a API desconecta todo
-- mundo; com mais de uma instância rodando, cada uma tem seu próprio mapa —
-- uma pessoa pode logar numa instância e a próxima requisição, atendida por
-- outra, não reconhecer o token dela.
--
-- ─── O QUE ESTA MIGRAÇÃO FAZ ────────────────────────────────────────────────
--
-- Cria `app_sessoes`, com os dois tipos de token (acesso e renovação) na
-- MESMA tabela, distinguidos pela coluna `tipo` — é a tradução direta dos
-- dois `Map` que `SessoesEmMemoria` já mantém separados.
--
-- `pessoa_id` é `text`, não `uuid`: quem tem conta de painel (admin, master,
-- supervisor...) usa o id de verdade do Supabase Auth (um uuid); quem é só
-- colaborador ainda não tem tabela `pessoas` (ver migração 001) e usa um id
-- sintético prefixado (`pes-...`). A coluna precisa aceitar os dois formatos
-- até a 001 rodar de verdade neste projeto.
--
-- RLS ligado, sem NENHUMA política: só a service role (que ignora RLS) lê ou
-- escreve aqui. Um token de sessão não deveria ser alcançável por uma chave
-- anônima ou de usuário comum em nenhuma hipótese.
--
-- ════════════════════════════════════════════════════════════════════════════

begin;

create table if not exists app_sessoes (
  token      text primary key,
  tipo       text not null check (tipo in ('acesso', 'renovacao')),
  pessoa_id  text not null,
  papel      text not null,
  expira_em  timestamptz not null,
  criada_em  timestamptz not null default now()
);

comment on table app_sessoes is
  'Sessões do credenciei-app (API separada, ver apps/api). Nada aqui é lido '
  'ou escrito pelo credenciei-web.';

comment on column app_sessoes.pessoa_id is
  'uuid (texto) de auth.users para quem tem conta de painel; id sintético '
  '"pes-..." para colaborador, enquanto a tabela pessoas (migração 001) não '
  'roda neste projeto.';

comment on column app_sessoes.tipo is
  'acesso: token curto (1h), mandado em toda requisição. '
  'renovacao: token longo (60 dias), só para trocar por um acesso novo.';

-- A consulta mais comum é "isto ainda vale?" — e a limpeza de expirados
-- percorre por data. Sem este índice, as duas viram varredura da tabela
-- inteira conforme ela cresce.
create index if not exists app_sessoes_expira_em on app_sessoes (expira_em);

alter table app_sessoes enable row level security;

commit;

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK
-- ════════════════════════════════════════════════════════════════════════════
--
-- Derruba a tabela inteira. Ninguém mais além da API do app lê ou escreve
-- nela, então isto não afeta o credenciei-web nem apaga nada de produção.
--
--   begin;
--     drop table if exists app_sessoes;
--   commit;
--
-- ════════════════════════════════════════════════════════════════════════════
