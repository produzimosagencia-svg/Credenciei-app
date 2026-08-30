-- ════════════════════════════════════════════════════════════════════════════
-- 001 · A pessoa passa a existir
-- ════════════════════════════════════════════════════════════════════════════
--
-- NÃO EXECUTE ISTO EM PRODUÇÃO SEM LER ATÉ O FIM.
--
-- ─── O PROBLEMA ─────────────────────────────────────────────────────────────
--
-- Hoje `funcionarios` não guarda uma pessoa. Guarda uma pessoa DENTRO de um
-- setor DE um evento. Trabalhar em dois eventos cria dois cadastros sem nada
-- ligando um ao outro:
--
--     Juan Muzy · CPF 154.321.447-94
--       linha 1   Fantástico Mundo do Lukão / Bar    qr_token A   histórico A
--       linha 2   Manos da Vila / Produção           qr_token B   histórico B
--
-- Nenhuma linha diz "Juan Muzy, a pessoa". Isso é incompatível com conta
-- permanente, histórico que acompanha a pessoa e entrar em evento novo sem
-- recadastrar.
--
-- ─── O QUE ESTA MIGRAÇÃO FAZ, E O QUE NÃO FAZ ───────────────────────────────
--
-- FAZ: cria a tabela `pessoas` e liga cada cadastro à sua pessoa.
-- NÃO FAZ: renomear tabela, apagar coluna, mexer em nada que o sistema atual
--          lê hoje.
--
-- Tudo aqui é ADITIVO. Depois de rodar, as 29 telas do sistema continuam
-- funcionando exatamente como antes — elas nem sabem que `pessoas` existe.
-- Essa é a propriedade que torna a migração segura: se algo der errado, o
-- rollback no fim desfaz sem perder um byte.
--
-- ─── A ORDEM DAS MIGRAÇÕES ──────────────────────────────────────────────────
--
--   001  cria `pessoas` e liga            ← esta, aditiva e reversível
--   002  cria `codigo_convite`             aditiva
--   003  cria `recebido_em` em registros   aditiva
--   004  views com os nomes novos          aditiva
--   005  o sistema web passa a usar as views
--   006  renomeia as tabelas físicas       ← só aqui deixa de ser reversível
--
-- Rodar 001 hoje não obriga a rodar 006 nunca.
--
-- ─── ANTES DE RODAR ─────────────────────────────────────────────────────────
--
--   1. Faça backup. No plano gratuito do Supabase não há backup automático:
--      exporte antes, à mão.
--   2. Rode primeiro no projeto de homologação.
--   3. Não rode em semana de evento.
--
-- ════════════════════════════════════════════════════════════════════════════

begin;

-- ── 1. A tabela ─────────────────────────────────────────────────────────────

create table if not exists pessoas (
  id            uuid primary key default gen_random_uuid(),

  -- O CPF é a identidade. Único em toda a base: é isto que faz duas
  -- participações da mesma pessoa apontarem para a mesma linha.
  cpf           text not null unique check (length(regexp_replace(cpf, '\D', '', 'g')) = 11),

  nome          text not null,
  telefone      text,
  email         text,
  foto_path     text,
  chave_pix     text,

  -- Ligação com o login, quando a pessoa criar conta no aplicativo.
  -- Nula para quem só foi cadastrado por planilha e nunca instalou nada.
  auth_user_id  uuid unique,

  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

comment on table pessoas is
  'A pessoa, independente de evento. Permanente: nunca apagada, nem quando o '
  'vínculo com um evento é encerrado.';

comment on column pessoas.auth_user_id is
  'Nulo para quem nunca instalou o aplicativo. A maior parte da base é assim, '
  'e continuará sendo — cadastro por planilha não cria conta.';

-- Busca por telefone no login. Compara os últimos dígitos porque o mesmo
-- número está gravado com e sem o 55, com e sem o 9, com e sem máscara.
create index if not exists pessoas_telefone_final
  on pessoas (right(regexp_replace(telefone, '\D', '', 'g'), 8));

-- ── 2. Preencher a partir do que já existe ──────────────────────────────────
--
-- Um cadastro por CPF distinto. Quando o mesmo CPF aparece em vários eventos,
-- vale o mais RECENTE: é o que tem o telefone e a foto atualizados.

insert into pessoas (cpf, nome, telefone, foto_path, chave_pix, criado_em)
select distinct on (regexp_replace(f.cpf, '\D', '', 'g'))
       regexp_replace(f.cpf, '\D', '', 'g'),
       f.nome,
       f.telefone,
       f.foto_perfil_path,
       f.chave_pix,
       f.created_at
  from funcionarios f
 where f.cpf is not null
   and length(regexp_replace(f.cpf, '\D', '', 'g')) = 11
 order by regexp_replace(f.cpf, '\D', '', 'g'), f.created_at desc
    on conflict (cpf) do nothing;

-- ── 3. Ligar cada cadastro à sua pessoa ─────────────────────────────────────
--
-- A coluna `pessoa_id` JÁ EXISTE em `funcionarios`, vazia e sem tabela do
-- outro lado — alguém começou isto antes e parou. Aqui ela é preenchida e
-- ganha a chave estrangeira que faltava.

update funcionarios f
   set pessoa_id = p.id
  from pessoas p
 where p.cpf = regexp_replace(f.cpf, '\D', '', 'g')
   and f.pessoa_id is distinct from p.id;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'funcionarios_pessoa_id_fkey'
  ) then
    alter table funcionarios
      add constraint funcionarios_pessoa_id_fkey
      foreign key (pessoa_id) references pessoas (id)
      -- RESTRICT, e não CASCADE: apagar uma pessoa não pode levar as
      -- participações e o histórico dela junto. É a regra que o Juan repetiu
      -- várias vezes — descredenciar não é excluir.
      on delete restrict;
  end if;
end $$;

create index if not exists funcionarios_pessoa_id on funcionarios (pessoa_id);

-- ── 4. Conferir antes de confirmar ──────────────────────────────────────────
--
-- Se qualquer cadastro com CPF válido ficou sem pessoa, algo deu errado e é
-- melhor não confirmar. `raise exception` dentro da transação desfaz tudo.

do $$
declare
  orfaos int;
  total  int;
  gente  int;
begin
  select count(*) into orfaos
    from funcionarios
   where cpf is not null
     and length(regexp_replace(cpf, '\D', '', 'g')) = 11
     and pessoa_id is null;

  if orfaos > 0 then
    raise exception 'MIGRAÇÃO ABORTADA: % cadastros com CPF válido ficaram sem pessoa', orfaos;
  end if;

  select count(*) into total from funcionarios;
  select count(*) into gente from pessoas;
  raise notice 'ok: % cadastros -> % pessoas distintas', total, gente;
end $$;

commit;

-- ════════════════════════════════════════════════════════════════════════════
-- CONFERÊNCIA (rode depois, para ver com os próprios olhos)
-- ════════════════════════════════════════════════════════════════════════════
--
--   -- Quem trabalhou em mais de um evento agora aparece como uma pessoa só:
--   select p.nome, p.cpf, count(*) as participacoes
--     from pessoas p
--     join funcionarios f on f.pessoa_id = p.id
--    group by p.id, p.nome, p.cpf
--   having count(*) > 1;
--
--   -- Nenhum cadastro com CPF válido pode estar sem pessoa:
--   select count(*) from funcionarios
--    where cpf is not null
--      and length(regexp_replace(cpf, '\D', '', 'g')) = 11
--      and pessoa_id is null;   -- precisa dar 0
--
-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK
-- ════════════════════════════════════════════════════════════════════════════
--
-- Desfaz por completo. Nenhum dado de `funcionarios` é perdido: `pessoas` foi
-- derivada dele, não o contrário.
--
--   begin;
--     alter table funcionarios drop constraint if exists funcionarios_pessoa_id_fkey;
--     update funcionarios set pessoa_id = null;
--     drop index if exists funcionarios_pessoa_id;
--     drop table if exists pessoas;
--   commit;
--
-- ════════════════════════════════════════════════════════════════════════════
