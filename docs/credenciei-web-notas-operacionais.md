# Notas operacionais do Credenciei Web

Registro de mudanças operacionais/infra do site (`c:\Dev\credenciei`) que o
lado do app precisa saber, mas que não são "estado da UI" (isso fica em
`credenciei-web-estado-atual.md`) nem decisão de arquitetura do app (isso
fica em `decisoes/`). Ordem cronológica, mais recente primeiro.

---

## 22/09/2026 — Domínio próprio: credenciei.com.br

O Juan comprou `credenciei.com.br` no registro.br. Configurado assim:

- Nameservers do domínio apontam pra Vercel (`ns1.vercel-dns.com`,
  `ns2.vercel-dns.com`) — a Vercel passou a gerenciar o DNS inteiro.
- `credenciei.com.br` e `www.credenciei.com.br` anexados e verificados no
  projeto `credenciei` — que mora no time **`produzimosagencia-svg's
  projects`** da Vercel, não no time "credenciei" (outra conta, sem esse
  projeto — achado pelo caminho, vale saber se alguém for mexer por lá de
  novo). SSL automático já ativo, DNS já propagado.
- Variável de ambiente `NEXT_PUBLIC_SITE_URL=https://credenciei.com.br`
  criada em Produção na Vercel. O código do site já era preparado pra
  isso — todo link gerado (credencial, formulário, convite de supervisor,
  cartaz da portaria) já lia
  `process.env.NEXT_PUBLIC_SITE_URL ?? 'https://credenciei.vercel.app'`;
  nenhuma URL fixa precisou mudar no código.
- **Pendente**: redeploy de produção pra essa variável entrar em vigor (é
  `NEXT_PUBLIC_`, só é lida no build). Até lá os links continuam saindo
  com `credenciei.vercel.app` — funciona igual, só não é o domínio novo
  ainda.

Se o app referenciar `credenciei.vercel.app` em algum lugar (deep link, QR
fixo, e-mail, etc.), o domínio final passa a ser `credenciei.com.br` — os
dois continuam resolvendo pro mesmo projeto, então nada quebra, mas vale
trocar pra manter a marca consistente.

## 22/09/2026 — Logins master com e-mail @credenciei.com (concluído)

O Juan pediu contas master reais para ele, Gabriel Valiati e Guilherme
Silva, com e-mail `@credenciei.com` e uma senha em comum. Feito e
confirmado por login de teste de verdade (sessão criada nas três contas).

O que era importante saber, pra quem mexer nisso de novo:

- Os três **já eram master** em `perfis.role` desde 09/09/2026
  (`supabase/upgrade-socios-master.sql`, no repo do site) — não foi criar
  usuário do zero, foi dar login de verdade pra quem já tinha o papel.
- Juan já tinha conta em `juan@credenciei.com` — só a senha foi
  atualizada.
- Gabriel estava logado com um e-mail sintético derivado do CPF
  (`...@supervisor.credenciei`), herdado de quando era supervisor. A
  conta **existente** foi atualizada (e-mail + senha), não criada outra —
  o `id` em `perfis` está preso ao `auth.users.id`, então criar conta nova
  teria duplicado o perfil e perdido o histórico já atribuído a ele.
- Guilherme tinha sido criado de propósito como perfil "vazio": e-mail
  sintético (`@socio.credenciei`) e senha aleatória que ninguém tinha, só
  pra o nome dele aparecer no Backlog Operacional sem dar acesso real.
  Trocar o e-mail dele pelo real foi o que **ativou o acesso de verdade**
  pela primeira vez — planejado desde a criação da conta, agora
  executado.
- Como o banco tem RLS travado (só service role / SQL Editor acessam), a
  coluna `role` já era SQL puro de sobra — mas e-mail e senha de login
  vivem em `auth.users`, e o Supabase não deixa editar isso por SQL direto
  (o hash de senha exige a API de admin do GoTrue). Foi feito com
  `supabase.auth.admin.updateUserById(id, { email, password })` via
  script, não SQL Editor.
- Por segurança, a senha combinada **não fica registrada aqui** nem em
  nenhum outro arquivo do repositório.
