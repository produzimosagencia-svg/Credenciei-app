-- ════════════════════════════════════════════════════════════════════════════
-- 003 · Os dois horários de uma batida
-- ════════════════════════════════════════════════════════════════════════════
--
-- Aditiva. Nenhuma tela existente lê estas colunas.
--
-- ─── O PROBLEMA QUE ISTO RESOLVE ────────────────────────────────────────────
--
-- Hoje `created_at` guarda o horário da batida, e é ele que vale na folha de
-- chamada. Funciona enquanto tudo é online: bateu, gravou, mesmo instante.
--
-- Com o aplicativo offline deixa de funcionar. Uma batida feita às 14:00 e
-- sincronizada às 17:00 precisa valer 14:00 — senão entra no relatório com
-- hora errada, contra a pessoa, justo no dado que serve para pagar.
--
-- Mas confiar cegamente no relógio do celular abre uma brecha: dá para mexer
-- nele. A defesa NÃO é impedir — é tornar visível. Guardando os dois horários,
-- a folha de chamada marca a divergência para conferência, do mesmo jeito que
-- já marca o meio atrasado em vermelho.
--
-- Barrar seria pior: puniria quem está com o fuso errado no celular — coisa
-- comum — e deixaria a pessoa sem registro nenhum.
-- ════════════════════════════════════════════════════════════════════════════

begin;

alter table registros add column if not exists recebido_em timestamptz;
alter table registros add column if not exists origem text;

-- As batidas que já existem foram todas online: os dois horários são o mesmo.
update registros set recebido_em = created_at where recebido_em is null;
update registros set origem = 'web' where origem is null;

comment on column registros.created_at is
  'O relógio de quem bateu. É este que vale na folha de chamada.';

comment on column registros.recebido_em is
  'O relógio do servidor. Guardado para a divergência ficar visível — offline '
  'faz os dois se afastarem legitimamente, e mexer no relógio também.';

comment on column registros.origem is
  'web, app ou assistido. Permite separar o que veio de fila offline na hora '
  'de conferir uma divergência.';

-- Achar as divergências suspeitas no fechamento, sem varrer a tabela.
create index if not exists registros_divergencia
  on registros (evento_id, data_ref)
  where recebido_em is not null and abs(extract(epoch from (recebido_em - created_at))) > 64800;

commit;

-- ROLLBACK
--   begin;
--     drop index if exists registros_divergencia;
--     alter table registros drop column if exists recebido_em;
--     alter table registros drop column if exists origem;
--   commit;
