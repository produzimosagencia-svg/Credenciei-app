# 008 — Autorização permanente para editar o `credenciei-web`, com obrigação de sincronizar nos dois sentidos

**Decidido em** 13/09/2026 por Juan · **Estado:** aceito

## Contexto

Até aqui, `c:\Dev\credenciei` era **read-only**: qualquer alteração exigia
pedir autorização na hora, arquivo por arquivo (ver decisão 005). A
sincronização também era de mão única — `docs/decisoes/007` só trazia REGRA
do site para o app, nunca o contrário.

Na revisão contínua da tela "Fornecedores e setores", vários ajustes de
comportamento e de regra foram surgindo dos dois lados ao mesmo tempo. Pedir
autorização a cada arquivo do site virou fricção, e uma regra corrigida só no
app (ou só no site) é pior que as duas versões antigas: os dois sistemas
compartilham o MESMO banco e podem estar servindo o MESMO evento no mesmo
minuto.

## Decisão

1. Autorização **permanente** para editar tanto `c:\Dev\credenciei` quanto
   `c:\Dev\credenciei-app` — não é mais preciso pedir permissão antes de cada
   mudança no site.
2. **Todo ajuste de REGRA DE NEGÓCIO, NOVO ESCOPO ou FUNCIONALIDADE feito de um
   lado precisa ser refletido no outro, e vice-versa.** Não é mais só "trazer
   o que mudou no site" — é manter os dois iguais nos dois sentidos.

## O que fica de fora (escopo confirmado por Juan em 13/09/2026)

**Layout e visual NÃO entram nesta obrigação.** A obrigação de sincronizar nos
dois sentidos é sobre regra de negócio, escopo novo e funcionalidade — não
sobre cor, espaçamento, tipografia ou desenho de tela. O visual continua de
mão única, site → app, exatamente como já documentado na seção "O visual não é
escolha nossa" do `CLAUDE.md`: os valores são copiados por valor de
`app/globals.css` para `apps/app/src/ui/tema.ts`, e o app não manda visual de
volta para o site.

## O que isso NÃO muda

- **`apps/api` continua em repositório separado** (decisão 005) — a razão
  daquela decisão era isolar a produção durante o desenvolvimento; hoje o
  domínio já é pacote único (`avaliarEntradaSaida` e companhia), então o risco
  original já estava resolvido antes desta decisão.
- **O comentário explicando o PORQUÊ continua indo junto com a regra copiada**
  (decisão 007, passo 3) — isso vale nos dois sentidos agora.
- **Uma mudança no site continua precisando de teste aqui**, e uma mudança no
  app que for refletida no site precisa ser conferida lá antes de considerar
  terminada — nenhum dos dois lados abre mão de verificação só porque a
  permissão ficou mais fácil.
- **Telas não se copiam** (Next.js vs. React Native) — o que se sincroniza é a
  REGRA, exatamente como já dizia a decisão 007.

## Consequência

O procedimento de comparação (fontes copiadas, diff, teste) que já existia em
`docs/decisoes/007-sincronizar-com-o-sistema-web.md` passa a valer nos dois
sentidos, não só site → app.
