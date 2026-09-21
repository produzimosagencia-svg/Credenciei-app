-- ════════════════════════════════════════════════════════════════════════════
-- 006 · Tokens de push do app
-- ════════════════════════════════════════════════════════════════════════════
--
-- Aditiva e isolada, como a 004 e a 005: uma tabela nova, só da API do app
-- (`credenciei-app`), que o `credenciei-web` nunca lê nem escreve.
--
-- ─── O QUE É UM TOKEN DE PUSH ───────────────────────────────────────────────
--
-- Não é do usuário, é do APARELHO (mais exatamente, desta instalação do app
-- neste aparelho). O Expo devolve um token quando o app pede permissão de
-- notificação; é esse token que o servidor da Expo usa pra entregar o aviso
-- no aparelho certo. Por isso a chave primária é o TOKEN, não a pessoa: se
-- alguém sai da conta e outra pessoa entra no mesmo aparelho, o mesmo token
-- passa a apontar pra ela — é o dono atual do aparelho que deve receber, não
-- quem usou por último e esqueceu de sair.
--
-- ─── O QUE ESTA MIGRAÇÃO NÃO FAZ ────────────────────────────────────────────
--
-- Não manda notificação nenhuma. Só guarda o endereço de entrega. O modelo de
-- QUEM manda o quê e QUANDO (lembrete automático vs aviso escrito por um
-- admin) ainda depende de uma decisão do Juan — ver seção 7 de
-- `docs/credenciei-web-estado-atual.md`.
--
-- RLS ligado, sem NENHUMA política: só a service role escreve ou lê. Um token
-- de push na mão errada é um jeito de mandar notificação falsa pro aparelho
-- de alguém.
--
-- ════════════════════════════════════════════════════════════════════════════

begin;

create table if not exists app_push_tokens (
  token         text primary key,
  pessoa_id     text not null,
  plataforma    text not null check (plataforma in ('ios', 'android')),
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

comment on table app_push_tokens is
  'Tokens de push do credenciei-app (API separada, ver apps/api). Nada aqui '
  'é lido ou escrito pelo credenciei-web.';

comment on column app_push_tokens.token is
  'Chave primária é o TOKEN (do aparelho), não a pessoa — um token muda de '
  'dono se outra pessoa entrar no mesmo aparelho depois.';

comment on column app_push_tokens.pessoa_id is
  'Mesmo formato de app_sessoes.pessoa_id: uuid (texto) de auth.users pra '
  'quem tem conta de painel, id sintético "pes-..." pra colaborador.';

-- A consulta mais comum é "quais aparelhos avisar desta pessoa" — sem este
-- índice, vira varredura da tabela inteira conforme ela cresce.
create index if not exists app_push_tokens_pessoa_id on app_push_tokens (pessoa_id);

alter table app_push_tokens enable row level security;

commit;

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK
-- ════════════════════════════════════════════════════════════════════════════
--
-- Derruba a tabela inteira. Ninguém mais além da API do app lê ou escreve
-- nela, então isto não afeta o credenciei-web nem apaga nada de produção —
-- só perde os tokens já registrados (o app registra de novo sozinho, na
-- próxima vez que abrir com permissão concedida).
--
--   begin;
--     drop table if exists app_push_tokens;
--   commit;
--
-- ════════════════════════════════════════════════════════════════════════════
