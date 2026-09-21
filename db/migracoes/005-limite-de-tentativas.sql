-- ════════════════════════════════════════════════════════════════════════════
-- 005 · Limite de tentativas, numa tabela — não mais na memória do processo
-- ════════════════════════════════════════════════════════════════════════════
--
-- Aditiva e isolada, mesmo espírito da 004 (sessões): cria UMA tabela nova,
-- que nenhuma tela do credenciei-web lê ou escreve — é só da API do app.
--
-- ─── O PROBLEMA ─────────────────────────────────────────────────────────────
--
-- `LimiteEmMemoria` (apps/api/src/limite.ts) conta tentativas (código de
-- evento, código de acesso, telefone) num Map, dentro do processo. Reiniciar
-- zera a contagem; com mais de uma instância, cada uma conta separado — o
-- limite efetivo multiplica pelo número de instâncias.
--
-- ─── O QUE ESTA MIGRAÇÃO FAZ ────────────────────────────────────────────────
--
-- Cria `app_limites`: uma linha por CHAVE (`codigo:5511999998888`,
-- `senha:juan@produzimos.com.br`...), com até quando a janela atual vale e
-- quantos usos já foram gastos nela.
--
-- RLS ligado, sem NENHUMA política: só a service role (que ignora RLS) lê ou
-- escreve aqui.
--
-- ════════════════════════════════════════════════════════════════════════════

begin;

create table if not exists app_limites (
  chave      text primary key,
  valida_ate timestamptz not null,
  usos       integer not null default 1
);

comment on table app_limites is
  'Limite de tentativas do credenciei-app (API separada, ver apps/api). Nada '
  'aqui é lido ou escrito pelo credenciei-web.';

comment on column app_limites.chave is
  'Prefixo:identificador — "codigo:<telefone>", "senha:<identificador>", '
  '"convite:<pessoaId>". Ver limite.ts.';

create index if not exists app_limites_valida_ate on app_limites (valida_ate);

alter table app_limites enable row level security;

commit;

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK
-- ════════════════════════════════════════════════════════════════════════════
--
--   begin;
--     drop table if exists app_limites;
--   commit;
--
-- ════════════════════════════════════════════════════════════════════════════
