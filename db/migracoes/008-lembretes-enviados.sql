-- ════════════════════════════════════════════════════════════════════════════
-- 008 · Lembretes de push já enviados
-- ════════════════════════════════════════════════════════════════════════════
--
-- Aditiva e isolada, como a 006 (tokens de push): uma tabela nova, só da API
-- do app, que o `credenciei-web` nunca lê nem escreve.
--
-- ─── PRA QUE SERVE ───────────────────────────────────────────────────────────
--
-- O lembrete de entrada é disparado por um agendador externo que bate na
-- nossa rota de tempos em tempos (ver `apps/api/src/rotas/manutencao.ts`) —
-- ele não sabe se já mandou aquele lembrete antes. Sem esta tabela, cada
-- vez que o agendador rodasse dentro da janela de aviso a pessoa levaria
-- outro push, e outro, até o prazo passar.
--
-- Idempotência ANTES da regra, mesmo princípio de `registrarBatida`: marcar
-- "já mandei" só depois do envio de verdade dar certo, e checar antes de
-- mandar de novo.
--
-- ════════════════════════════════════════════════════════════════════════════

begin;

create table if not exists app_lembretes_enviados (
  participacao_id text not null,
  tipo             text not null,
  data_ref         date not null,
  enviado_em       timestamptz not null default now(),
  primary key (participacao_id, tipo, data_ref)
);

comment on table app_lembretes_enviados is
  'Lembretes de push já mandados (credenciei-app). Nada aqui é lido ou '
  'escrito pelo credenciei-web. Existe só pra não mandar o mesmo lembrete '
  'duas vezes no mesmo dia.';

alter table app_lembretes_enviados enable row level security;

commit;

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK
-- ════════════════════════════════════════════════════════════════════════════
--
-- Derruba a tabela inteira. Pior caso: alguém recebe um lembrete duplicado
-- até a tabela ser recriada — nada mais depende dela.
--
--   begin;
--     drop table if exists app_lembretes_enviados;
--   commit;
--
-- ════════════════════════════════════════════════════════════════════════════
