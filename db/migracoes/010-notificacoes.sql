-- ════════════════════════════════════════════════════════════════════════════
-- 010 · Central de Avisos — histórico e preferências
-- ════════════════════════════════════════════════════════════════════════════
--
-- Aditiva e isolada, como a 006 e a 008: duas tabelas novas, só da API do
-- app, que o `credenciei-web` nunca lê nem escreve.
--
-- ─── PRA QUE SERVE ───────────────────────────────────────────────────────────
--
-- `app_notificacoes` é o HISTÓRICO do que já foi mandado por push — cada vez
-- que um lembrete/alerta/aviso do dia (`apps/api/src/rotas/lembretes.ts`) é
-- enviado com sucesso, uma linha nasce aqui. Sem ela, a pessoa só vê a
-- notificação no momento em que ela chega; se deslizar sem tocar, ou se o
-- aparelho estava desligado, o aviso desaparece pra sempre. Guardar o
-- histórico é o que permite uma tela "Central de Avisos" dentro do app.
--
-- `app_preferencias_de_aviso` é o interruptor por tipo — a pessoa pode
-- desligar "hora da entrada" sem desligar "pendência da equipe". Ausência de
-- linha = ligado (mesmo raciocínio de `exigeMeio`/`ativo` nascerem ligados
-- em outras tabelas deste projeto: uma migração não pode apagar preferência
-- de ninguém por padrão).
--
-- ════════════════════════════════════════════════════════════════════════════

begin;

create table if not exists app_notificacoes (
  id         uuid primary key default gen_random_uuid(),
  pessoa_id  text not null,
  tipo       text not null,
  titulo     text not null,
  corpo      text not null,
  -- Pra onde o toque leva na tela — a mesma que o push abriria no aparelho.
  destino    text,
  criado_em  timestamptz not null default now(),
  lida       boolean not null default false
);

comment on table app_notificacoes is
  'Histórico de push do credenciei-app (API separada, ver apps/api). Nada '
  'aqui é lido ou escrito pelo credenciei-web.';

create index if not exists app_notificacoes_pessoa on app_notificacoes (pessoa_id, criado_em desc);

create table if not exists app_preferencias_de_aviso (
  pessoa_id text not null,
  tipo      text not null,
  ativo     boolean not null default true,
  primary key (pessoa_id, tipo)
);

comment on table app_preferencias_de_aviso is
  'Quais tipos de aviso cada pessoa quer receber — ausência de linha é '
  'LIGADO (nasce ligado, mesmo padrão de app_lembretes_enviados/exigeMeio).';

alter table app_notificacoes enable row level security;
alter table app_preferencias_de_aviso enable row level security;

commit;

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK
-- ════════════════════════════════════════════════════════════════════════════
--
-- Derruba as duas tabelas. Ninguém mais além da API do app lê ou escreve
-- nelas, então isto não afeta o credenciei-web — só perde o histórico de
-- avisos já mostrados e as preferências já salvas (tudo volta a "ligado").
--
--   begin;
--     drop table if exists app_notificacoes;
--     drop table if exists app_preferencias_de_aviso;
--   commit;
--
-- ════════════════════════════════════════════════════════════════════════════
