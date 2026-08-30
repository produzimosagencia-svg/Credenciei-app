-- ════════════════════════════════════════════════════════════════════════════
-- 002 · O código que leva o colaborador para dentro do evento
-- ════════════════════════════════════════════════════════════════════════════
--
-- Aditiva. Nenhuma tela existente lê esta coluna.
--
-- Formato: ABC-2026-K7M2 — sigla do evento, ano, e quatro caracteres sorteados
-- de um alfabeto de 32 (base32 de Crockford, sem I, L, O e U). Mais de um
-- milhão de combinações.
--
-- O formato pedido originalmente tinha quatro DÍGITOS — dez mil combinações,
-- com as outras duas partes públicas. Um script entraria em qualquer evento em
-- minutos, e entrar num evento não é curiosidade: é aparecer na lista de
-- pagamento. Ver packages/dominio/src/codigo-evento.ts.
--
-- O código sozinho não é a defesa. Ele é uma camada; a API limita tentativas
-- por pessoa (20 por hora), e o organizador pode exigir aprovação.
-- ════════════════════════════════════════════════════════════════════════════

begin;

alter table eventos add column if not exists codigo_convite text;
alter table eventos add column if not exists exige_aprovacao boolean not null default false;

-- Único, mas só entre os que TÊM código: vários eventos antigos ficam nulos, e
-- um índice único comum trataria todos os nulos como colisão.
create unique index if not exists eventos_codigo_convite_unico
  on eventos (codigo_convite) where codigo_convite is not null;

comment on column eventos.codigo_convite is
  'ABC-2026-K7M2. Gerado na criação do evento. Pode ser trocado se vazar.';

comment on column eventos.exige_aprovacao is
  'Quando true, quem entra pelo código fica com ativo=false até o organizador '
  'liberar. Reusa `ativo`, que toda a API já respeita — um estado novo daria '
  'chance de alguma verificação esquecer de considerá-lo.';

commit;

-- ROLLBACK
--   begin;
--     drop index if exists eventos_codigo_convite_unico;
--     alter table eventos drop column if exists codigo_convite;
--     alter table eventos drop column if exists exige_aprovacao;
--   commit;
