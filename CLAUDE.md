# Credenciei — plataforma (app + API)

> Este arquivo é lido automaticamente por qualquer sessão aberta nesta pasta.
> Ele existe porque o contexto NÃO passa de uma conversa para outra: tudo que
> foi decidido precisa estar escrito aqui, não na cabeça de quem estava junto.

O dono do projeto é o **Juan** (agência Produzimos, Vitória/ES). Ele nunca
desenvolveu um aplicativo antes e pediu explicitamente para ser orientado a
cada decisão — não só receber código pronto. Explique o que é, por que
precisa, quanto custa, qual a alternativa e o que você recomenda.

---

## 🔁 Os dois sistemas andam juntos

`c:\Dev\credenciei` é o sistema em produção, com eventos reais acontecendo —
isso nunca deixou de ser verdade. Mas desde 13/09/2026 (decisão
`docs/decisoes/008`) a autorização para editá-lo é **permanente**: não é mais
preciso pedir permissão a cada arquivo antes de mudar o site, como era a regra
anterior.

**A obrigação que vem junto: todo ajuste de REGRA DE NEGÓCIO, NOVO ESCOPO ou
FUNCIONALIDADE feito de um lado precisa ser refletido no outro, e vice-versa.**
Não é mais só trazer do site para o app — os dois compartilham o mesmo banco e
podem estar servindo o mesmo evento no mesmo minuto. O procedimento de
comparação (fontes copiadas, diff, teste) está em
`docs/decisoes/007-sincronizar-com-o-sistema-web.md` e vale nos dois sentidos.

**Layout e visual ficam de fora dessa obrigação** (confirmado por Juan em
13/09/2026) — isso continua de mão única, site → app, como já diz a seção "O
visual não é escolha nossa" mais abaixo. A obrigação de ida-e-volta é sobre
regra, escopo e funcionalidade, não sobre cor, espaçamento ou desenho de tela.

Continua valendo, mesmo com a autorização mais fácil:
- Ler e entender o porquê da regra atual antes de mudar — nunca "simplificar"
  sem saber de que erro real ela nasceu.
- Testar antes de considerar terminado, dos dois lados.
- Avisar o Juan do que mudou e por quê, mesmo sem precisar pedir permissão
  antes.
- Telas não se copiam (Next.js × React Native) — o que se sincroniza é a
  regra.

---

## Os dois sistemas

| Como ele fala | O que é | Onde |
|---|---|---|
| **credenciei-web** | O sistema atual, em produção | `c:\Dev\credenciei` |
| **credenciei-app** | O que estamos construindo | `c:\Dev\credenciei-app` (aqui) |

Os dois usam **o mesmo banco Supabase**. Isso é decisão dele: uma base só,
uma regra só.

---

## O que já está construído

```
packages/dominio     a regra de negócio, pura — 140 testes
packages/offline     a fila de batidas sem internet — 22 testes
packages/contrato    o que o app pode pedir + servidor falso — 292 testes
apps/api             a API HTTP completa — 627 testes
apps/app             o aplicativo, em React Native + Expo — 102 testes
db/migracoes         oito migrações escritas (001-008, 010); todas já executadas em produção
```

**1.183 testes.** `npm run verificar` roda tipos e testes de
tudo, sem banco e sem rede. Só `npm run teste` NÃO confere tipos — o `tsx` não
olha para eles.

Para VER o app: `npm run web --workspace=@credenciei/app` abre no navegador, sem
instalar nada. No celular, `npm run start --workspace=@credenciei/app` gera um QR
para o aplicativo **Expo Go** (grátis, na loja). Sozinho, o app fala com o
servidor falso, e ele se anuncia como demonstração na própria tela.

**Para MOSTRAR algo pro Juan (screenshot, tela rodando), isso não serve —
precisa ser dado real do banco compartilhado, nunca inventado** (decisão de
13/09/2026: ele viu um evento de mentira com 41 pessoas e achou que era o
evento de verdade, que tem ~2000). Suba a API de verdade
(`npm run dev --workspace=@credenciei/api`, porta do `PORT` em
`apps/api/.env`) e aponte o app pra ela:
`EXPO_PUBLIC_API_URL=http://localhost:<porta> npm run web --workspace=@credenciei/app`.
Entre pelo caminho "Tenho conta" (e-mail/CPF + senha) — nunca "Sou da
equipe" (WhatsApp), que dispara mensagem de verdade
(`enviarCodigoPeloWhatsapp`) pro número digitado. Testar um botão de ação
nessa configuração GRAVA de verdade no banco de produção — autorizado pelo
Juan, mas evite ações destrutivas ou que avisem gente real sem avisar antes.
O cliente-falso continua existindo para os testes automatizados; a régua
acima é só para o que aparece na tela do Juan.

O commit mais importante é o primeiro: a assinatura do QR do pacote novo
**bate byte a byte** com a que o sistema web produz hoje. Se divergisse, toda
credencial em circulação seria recusada no portão. Há um teste que compara com
o `node:crypto` real — não com um valor escrito à mão.

---

## Onde a API roda de verdade

Desde 23/09/2026 a API roda no **VPS da Hostinger**, em
`https://api.credenciei.com.br`. Antes disso esteve no Render (21 a 23/09), e
antes só existia na máquina de quem desenvolvia. O porquê da mudança, o
desenho completo e o procedimento de volta estão em
`docs/decisoes/010-api-no-vps-hostinger.md` — leia antes de mexer em
hospedagem.

- **GitHub**: `https://github.com/produzimosagencia-svg/Credenciei-app` —
  repositório **privado**. Um `git push origin main` sobe o código.
- **VPS Hostinger** (KVM 2, IP `187.77.251.119`, Campinas, pago até
  julho/2028), com **EasyPanel** publicando a cada `git push` — isso depende
  de um webhook configurado nos Settings do repositório no GitHub, apontando
  pro "Gatilho de Implantação" do serviço. **Sem ele o EasyPanel NÃO sabe que
  houve push**, e só publica quando alguém aperta "Implantar". Foi o que
  aconteceu em 23/09/2026: quatro commits ficaram fora do ar enquanto eu
  diagnosticava bug no código que já estava corrigido. O caminho do
  pedido é `nginx (host) → 127.0.0.1:3001 → contêiner:3000` — o EasyPanel
  desta instalação **não tem Traefik**, e quem roteia é o nginx. Variáveis de
  ambiente no painel do EasyPanel, nunca commitadas.
- **⚠️ O VPS não é só nosso.** Rodam nele, e não podem ser derrubados: o
  **CondoDesk** (`condodesk.net`, outro sistema do Juan, em produção, servido
  pelo mesmo nginx) e a **Evolution API** (gateway de WhatsApp — conferir
  `WHATSAPP_PROVEDOR` na Vercel antes de desligar).
- **Render** (plano gratuito): `https://credenciei-app.onrender.com` — **fica
  no ar por tempo indeterminado como plano B**. É grátis e é o único lugar
  pra onde voltar. A volta é trocar o registro `api` na Vercel de `A` para
  `CNAME → credenciei-app.onrender.com`; leva ~1 minuto (o TTL é 60s de
  propósito) e **não exige republicar o app**, porque ele aponta pro nosso
  domínio e nunca pro do provedor.
- **UptimeRobot**: existia só pra impedir o Render de dormir. **Perdeu a
  razão de ser** — desligar.

**Para MOSTRAR algo pro Juan**, aponte o app pra API publicada:
`EXPO_PUBLIC_API_URL=https://api.credenciei.com.br npm run web --workspace=@credenciei/app`.
O caminho da API local (seção acima) continua válido pra testar o que ainda
não foi publicado.

**Build do aplicativo**: `apps/app/eas.json` define `EXPO_PUBLIC_API_URL` nos
perfis `preview` e `production`. Sem isso o APK sai falando com o servidor
falso e não avisa — o app abre, mostra um evento de 41 pessoas e parece
funcionar.

---

## Decisões travadas pelo Juan

| Decisão | Escolha | Por quê |
|---|---|---|
| Onde vive a API | **Repositório separado**, mesmo banco | Produção fora de risco durante o desenvolvimento |
| App do colaborador | **Sim**, conta permanente | Ele decidiu contra a minha recomendação. O código de evento resolve boa parte do risco de adoção |
| Stack mobile | **React Native + Expo** | A regra existe uma vez só, em TypeScript |
| Login do colaborador | **WhatsApp** | SMS custaria R$ 2–4 mil para 20 mil contas; e-mail muita gente não abre |
| Foto do meio | **Apagar em 90 dias** | A batida fica para sempre; só a imagem sai |
| Escala alvo | **20.000 colaboradores** | Muda o modelo de dados, não só a infraestrutura |
| Conta Apple / Supabase Pro | **Adiados** | "Vamos desenvolvendo o código primeiro" |
| Repositório remoto | **Não criar** | Os commits ficam só nesta máquina, por escolha dele |
| Escopo do app | **As mesmas telas do sistema web** | Decidido em 30/08. Não é só o app do colaborador: é o Credenciei inteiro em formato de app |
| Quem entra no app | **Os dois** | Conta de painel com CPF e senha; colaborador com WhatsApp. O menu muda pelo papel |
| Como avançar | **Telas primeiro, com dados de mentira** | O app fica navegável contra o servidor falso, o Juan corrige o desenho, e a API entra por baixo depois |
| Qual servidor o app usa | **`EXPO_PUBLIC_API_URL`** | Sem a variável, o servidor falso. Com ela, a API. Um teste roda o mesmo roteiro nos dois e exige comportamento igual |

As decisões arquiteturais estão em `docs/decisoes/` — uma por arquivo, com o
motivo e a alternativa descartada.

---

## O achado que define o projeto

**A pessoa não existe no banco.** `funcionarios` guarda uma pessoa DENTRO de
um setor DE um evento:

```
Juan Muzy · CPF 154.321.447-94
  linha 1   Fantástico Mundo do Lukão / Bar    qr_token A   histórico A
  linha 2   Manos da Vila / Produção           qr_token B   histórico B
```

Nenhuma linha diz "Juan Muzy, a pessoa" — **era assim até 22/09/2026.**

**A migração 001 rodou.** A tabela `pessoas` existe de verdade (2.029
linhas), e `funcionarios.pessoa_id` está 100% preenchido — não há mais
cadastro órfão. `apps/api/src/dados/supabase.ts` já lê/escreve `pessoas`
como fonte canônica de identidade (`pessoaPorId`, `pessoaPorCpf`,
`pessoaPorTelefone`, `criarPessoa`, `excluirMinhaConta`,
`corrigirTelefoneDaParticipacao` — todos com dual-write pra `funcionarios`
continuar correto pro site, que ainda não conhece `pessoas`).

**O que NÃO mudou, de propósito, por decisão do Juan (22/09/2026)**: o
`pessoaId` que a API expõe pra fora continua sendo `cpf:XXXXX`
(`idDaPessoa`/`cpfDoId`), não o `pessoas.id` (uuid) de verdade. Trocar o
formato quebraria sessão, token de push, histórico de notificação e
preferências de quem já usa o app — é um corte de identidade que precisa
de plano próprio, não uma leitura a mais. `pessoas` entrou como dado mais
correto, sem mudar a FORMA da identidade externa ainda.

**Pendência conhecida, não resolvida ainda**: `corrigirCpfDaParticipacao`
(ficha da pessoa) NÃO religa `pessoa_id` pra outra linha de `pessoas` —
corrigir o CPF muda qual PESSOA aquela participação é, e decidir se isso
religa pra uma `pessoas` existente ou cria uma nova (e o que fazer com o
histórico da `pessoas` antiga) é mexer em identidade, não só ler. Até
resolver, `pessoaPorId` de quem teve o CPF corrigido pode mostrar dado
desatualizado — mesma limitação que o site já tem hoje, não é regressão.

---

## Princípios que o código segue

Não são preferências — cada um veio de algo que deu errado de verdade.

**Recusa é diferente de falha de rede.** O servidor DIZER NÃO (fora da janela,
cadastro inativo) é decisão: a fila descarta e explica. O servidor NÃO
RESPONDER é transporte: a fila guarda e tenta de novo. Confundir os dois faz o
aparelho insistir para sempre em algo que nunca vai passar, ou jogar fora uma
batida que a pessoa fez.

**Nenhuma rota aceita id de pessoa vindo de fora.** O token resolve em
`pessoaId` e é ele que as rotas recebem. Fecha o IDOR por construção, não por
disciplina.

**"Não encontrado" e "não é seu" respondem igual.** Diferenciar entrega um
jeito de varrer ids e descobrir quais existem.

**O horário que vale é o do aparelho**, não o da chegada. Uma batida que sobe
três horas depois entraria no relatório com hora errada, contra a pessoa, no
dado que serve para pagar. Relógio suspeito é MARCADO, nunca barrado — barrar
puniria quem está com o fuso errado e deixaria a pessoa sem registro.

**Recusa apaga a sessão; falta de rede, não.** Para entrar de novo a pessoa
precisa de um código no WhatsApp — ou seja, da internet que ela não tem.
Deslogar por falha de transporte a tranca para fora do próprio crachá, no
portão, sem saída. Ver `docs/decisoes/006`.

**Idempotência antes das regras.** A pessoa bateu às 20:00, dentro da janela; a
resposta se perdeu; o celular reenvia às 23:58, depois de a janela fechar. Se a
idempotência viesse depois, ela seria recusada — bateu no horário e perderia o
registro por causa da rede dela.

**Comentário explica o PORQUÊ**, não o quê. Metade das regras deste sistema
nasceu de um erro em evento real; sem o motivo escrito, alguém "simplifica" e
o erro volta.

---

## Limitações conhecidas, obrigatórias antes de produção

- **Sessões e limite de tentativas já não vivem mais na memória do processo.**
  `SessoesNoSupabase` (12/09/2026, migração `004-sessoes-em-tabela.sql`,
  tabela `app_sessoes`) e `LimiteNoSupabase` (12/09/2026, migração
  `005-limite-de-tentativas.sql`, tabela `app_limites`) substituem as duas
  implementações em memória — sobrevivem a reiniciar a API, e mais de uma
  instância conta junto. As duas usam o MESMO cliente Supabase dedicado
  (`semSessao`, em `principal.ts`), separado do que faz `signInWithPassword`
  — ver o comentário lá: reusar o cliente de login para operações de service
  role quebra por RLS, já aconteceu.
- **A conta fica amarrada ao número de WhatsApp.** Quem troca de número perde
  o acesso — mas não o histórico: desde 14/09/2026 (decisão do Juan) quem
  administra corrige o telefone na ficha da pessoa (`corrigirTelefone`,
  cópia do site's `editarTelefoneFuncionario` — inclusive o efeito de
  atualizar mensagens do WhatsApp ainda não enviadas na fila do site). É
  suporte manual (a pessoa avisa, alguém troca), não autoatendimento — essa
  foi a escolha dele, não uma limitação técnica.
- **Se a conta de WhatsApp for restringida** (já aconteceu neste projeto), o
  login para junto com os avisos. Ponto único de falha.
- **`created_at` guarda o horário da batida** e não há coluna separada para o
  de recebimento — a divergência de relógio só fica detectável depois da
  migração 003.
- **`criarAcesso` (Acessos) cria a conta de verdade no Supabase Auth, mas não
  manda o convite de senha por WhatsApp.** No site é isso que torna a conta
  utilizável; sem ele, quem acabou de ser criado não tem como entrar até
  alguém redefinir a senha por fora (Supabase Studio).
- **Um supervisor só enxerga UM setor por vez no app — o que ele viu por
  último.** Se "criar setor" reaproveita um CPF que já supervisiona outro
  setor do mesmo evento (o app grava certo no banco: `supervisor_setores`
  ganha os dois, sem apagar o anterior — ver `reatribuirSupervisorAoSetor`
  em `dados/supabase.ts`), a tela "Minha equipe" dele passa a mostrar o
  setor NOVO, não os dois. É o mesmo bug que o site já teve e corrigiu com
  uma tela de trocar de setor; aqui falta essa tela — só o dado já está
  certo, esperando por ela.

---

## Como acompanhar

O Juan pede status assim: *"como estamos?"*. Responda com **percentual real do
backlog** (332 tasks, 211 no MVP) — e o do MVP é o que responde "quando dá para usar"; `npm run backlog` calcula os dois — nunca invente número. **A Fase 2 ("Ligar a API de verdade") está completa, Epic 17 inteira inclusive.** Epic 3, Epic 18 e a Epic 17 completa — Organizações, Veículos, Bloqueio de CPF, Base de funcionários, Encontrar colaborador, Relatórios (planilha `.xlsx`/`.zip` gerada de verdade, com `exceljs`/`jszip`), cartaz da portaria, criar setor e equipe do setor — já são reais na API, ligados pelo `ClienteHttp`. O teto de vaga por setor (`estimado`) saiu do app inteiro para bater com o site, que já não tem mais esse limite. O que falta é o que a Fase 3 lista: sincronizar com o site, recuperação de conta, e QR (Ed25519) — a foto da batida e os relatórios (`.xlsx`/`.zip`) já saíram da memória do processo e sobem de verdade ao Storage (12/09/2026: `presencas` para a foto, `app-relatorios` — bucket novo, criado por este app — para o relatório, com URL assinada). Ver `docs/backlog.md`. O que está feito por
epic está em `docs/backlog.md`.

Ao terminar um dia de trabalho, ele espera um resumo: feito, alterado, testado,
problemas, pendências, próximo passo.

---

## O sistema web continua andando

Ele é desenvolvido em paralelo, e o que muda de REGRA lá precisa vir para cá —
senão o app recusa o que o site aceita, no mesmo evento e no mesmo minuto.

O procedimento está em `docs/decisoes/007-sincronizar-com-o-sistema-web.md`:
uma lista fixa de arquivos copiados, e a ordem de conferir por diff (nunca só
pela data), trazer o comentário junto com a regra, e escrever o teste aqui.

O que já veio e o que ainda falta está na seção "Veio do sistema web" de
`docs/backlog.md`.

---

## O visual não é escolha nossa

O app veste o design do sistema que já está no ar: o rebranding "Arena"
(11/09/2026) — laranja `#FF4A0F`, fonte Archivo (peso 800 nos títulos e
números grandes), separação por fio de 1px (não por sombra), corpo de 13px,
cantos mais arredondados (raio de 6 a 20). Os valores foram copiados de
`c:\Dev\credenciei\app\globals.css` para `apps/app/src/ui/tema.ts`, com o
motivo de cada um junto.

É cópia por VALOR, não por referência: o arquivo de produção não é importado, e
não pode ser. Quando o laranja mudar lá, alguém muda aqui.

**Claro e escuro, mas claro é o padrão.** No site o escuro ("Arena") é o
padrão e o claro é a opção; aqui é o contrário — decisão do Juan, 11/09/2026.
O app abre claro e a pessoa liga o escuro em "Mais → Tema", guardado no
aparelho. Os dois temas usam o mesmo laranja.

Cada tela lê a cor de dentro do componente, via `useTema()`
(`apps/app/src/ui/tema-contexto.tsx`) — nunca importando `cor`/`uso`/`sombra`
como constante do módulo, porque esses três variam com o tema e um
`StyleSheet.create` de nível de módulo só roda uma vez. O resto
(`texto`, `tipo`, `espaco`, `raio`, `corDoIndicador`, `corDaEtapa`, `eventoAoVivo`)
é igual nos dois temas e continua sendo import direto de `tema.ts`. Ver
`apps/app/src/ui/ficha-da-pessoa.tsx` como referência do padrão em um arquivo
com vários componentes.

Simplificação conhecida: os painéis "de vidro" do site (gradiente + blur)
viram superfície de cor sólida aqui — sem tradução barata em React Native.

**Não invente paleta, fonte nem componente.** Antes de desenhar qualquer tela
nova, abra a equivalente em `c:\Dev\credenciei\app\` — só para LER — e siga
o que está lá.

---

## Onde está o resto

```
docs/contexto.md                    a história completa: como chegamos aqui
docs/decisoes/                      uma decisão por arquivo, com o motivo
docs/credenciei-web-estado-atual.md o site em 11/09/2026 — leia antes de assumir
                                     que uma tela ou regra antiga ainda vale
docs/credenciei-web-notas-operacionais.md
                                     infra/operação do site (domínio, contas,
                                     deploy) — atualizado por fora deste repo
docs/credenciei-web-regras-de-negocio.md
                                     janelas/fases, QR, presença híbrida, bugs
                                     históricos já corrigidos — leia antes de
                                     reimplementar qualquer lógica de ponto
docs/credenciei-web-permissoes-autenticacao.md
                                     papéis, capacidades, RLS, login por CPF —
                                     por que o app não pode falar com o Supabase direto
docs/credenciei-web-modulos.md      Gastos, Financeiro, Auditoria, Avisos,
                                     Conferência, Suporte, Backlog etc.
docs/credenciei-web-funcoes-integracoes.md
                                     inventário de Server Actions + WhatsApp/
                                     e-mail/Sheets/IA/cron
db/migracoes/                       oito migrações (001-008, 010), todas já executadas em
                                     produção — leia o cabeçalho antes de escrever a próxima
```
