-- ════════════════════════════════════════════════════════════════════════════
-- 007 · Contestar uma batida errada ou que faltou
-- ════════════════════════════════════════════════════════════════════════════
--
-- Aditiva e isolada, como a 004, a 005 e a 006: uma tabela nova, só da API do
-- app (`credenciei-app`). O `credenciei-web` nunca teve este recurso — o
-- colaborador não tem conta lá, então "a pessoa contesta a própria batida"
-- não existia pra ele copiar. Escopo decidido com o Juan em 18/09/2026.
--
-- ─── O QUE ISTO RESOLVE ─────────────────────────────────────────────────────
--
-- Antes disso, quando uma batida saía errada (o app não registrou, ou
-- registrou fora da hora), a única saída era "fale com a produção" — sem
-- lugar nenhum no app pra isso virar uma pendência de verdade. Agora vira um
-- registro que aparece pro supervisor do setor (ou quem gerencia o evento)
-- como pendência, junto com as outras que a tela da equipe já mostra.
--
-- ─── O QUE ISTO NÃO É ───────────────────────────────────────────────────────
--
-- Não corrige a batida sozinha — quem resolve decide manualmente (lançar
-- ponto manual, corrigir na planilha, ou simplesmente confirmar que estava
-- certo). Este registro é só o AVISO de que algo pede atenção, com o motivo
-- que a pessoa escreveu.
--
-- RLS ligado, sem nenhuma política pública — só a service role lê e escreve.
--
-- ════════════════════════════════════════════════════════════════════════════

begin;

create table if not exists app_contestacoes (
  id             uuid primary key default gen_random_uuid(),
  participacao_id text not null,
  tipo           text not null check (tipo in ('entrada', 'meio', 'fim')),
  data_ref       date not null,
  motivo         text not null check (length(trim(motivo)) > 0),
  criado_em      timestamptz not null default now(),
  -- Nula enquanto aberta. Preenchidas as duas juntas, nunca uma sem a outra.
  resolvida_em   timestamptz,
  resolvida_por  text
);

comment on table app_contestacoes is
  'Contestações do colaborador sobre a própria batida (credenciei-app). '
  'Nada aqui é lido ou escrito pelo credenciei-web — recurso que só existe '
  'no app.';

comment on column app_contestacoes.participacao_id is
  'Mesmo id de funcionarios.id usado no resto do app — guardado como texto '
  'pelo mesmo motivo de app_sessoes.pessoa_id: aceitar formatos diferentes '
  'enquanto o schema antigo não migra de vez.';

comment on column app_contestacoes.motivo is
  'Obrigatório — decisão do Juan, 18/09/2026: sem contexto nenhum, quem '
  'resolve não tem por onde começar a investigar.';

-- A consulta mais comum é "quais contestações ainda estão abertas neste
-- setor" — feita indiretamente por participacao_id (o setor de uma
-- participação pode mudar, então filtrar por setor exige olhar o cadastro
-- atual, não esta tabela). Este índice serve a segunda mais comum: o
-- histórico de UMA pessoa.
create index if not exists app_contestacoes_participacao on app_contestacoes (participacao_id);

-- Achar as ainda abertas sem varrer a tabela inteira conforme ela cresce.
create index if not exists app_contestacoes_abertas on app_contestacoes (participacao_id) where resolvida_em is null;

alter table app_contestacoes enable row level security;

commit;

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK
-- ════════════════════════════════════════════════════════════════════════════
--
-- Derruba a tabela inteira. Ninguém mais além da API do app lê ou escreve
-- nela, então isto não afeta o credenciei-web — só perde as contestações já
-- registradas.
--
--   begin;
--     drop table if exists app_contestacoes;
--   commit;
--
-- ════════════════════════════════════════════════════════════════════════════
