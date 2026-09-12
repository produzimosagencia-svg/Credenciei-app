# Credenciei — plataforma (app + API)

> Este arquivo é lido automaticamente por qualquer sessão aberta nesta pasta.
> Ele existe porque o contexto NÃO passa de uma conversa para outra: tudo que
> foi decidido precisa estar escrito aqui, não na cabeça de quem estava junto.

O dono do projeto é o **Juan** (agência Produzimos, Vitória/ES). Ele nunca
desenvolveu um aplicativo antes e pediu explicitamente para ser orientado a
cada decisão — não só receber código pronto. Explique o que é, por que
precisa, quanto custa, qual a alternativa e o que você recomenda.

---

## 🚫 A regra que não se quebra

**NÃO TOQUE em `c:\Dev\credenciei`.**

É o sistema em produção, com eventos reais acontecendo. O Juan foi enfático
mais de uma vez. Arquivos vêm por **cópia**, nunca por movimentação, e
qualquer alteração lá exige autorização explícita dele, pedida na hora.

Isso vale inclusive quando parecer óbvio ou pequeno.

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
packages/dominio     a regra de negócio, pura — 81 testes
packages/offline     a fila de batidas sem internet — 22 testes
packages/contrato    o que o app pode pedir + servidor falso — 219 testes
apps/api             a API HTTP completa — 121 testes
apps/app             o aplicativo, em React Native + Expo — 85 testes
db/migracoes         três migrações escritas, NENHUMA executada
```

**528 testes.** `npm run verificar` roda tipos e testes de
tudo, sem banco e sem rede. Só `npm run teste` NÃO confere tipos — o `tsx` não
olha para eles.

Para VER o app: `npm run web --workspace=@credenciei/app` abre no navegador, sem
instalar nada. No celular, `npm run start --workspace=@credenciei/app` gera um QR
para o aplicativo **Expo Go** (grátis, na loja). O app fala hoje com o servidor
falso, e ele se anuncia como demonstração na própria tela.

O commit mais importante é o primeiro: a assinatura do QR do pacote novo
**bate byte a byte** com a que o sistema web produz hoje. Se divergisse, toda
credencial em circulação seria recusada no portão. Há um teste que compara com
o `node:crypto` real — não com um valor escrito à mão.

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

Nenhuma linha diz "Juan Muzy, a pessoa". Conta permanente exige separar
`pessoas` (permanente) de `participacoes` (do evento). A coluna
`funcionarios.pessoa_id` **já existe, vazia e sem tabela do outro lado** —
alguém começou isto antes e parou.

`apps/api/src/dados/supabase.ts` traduz entre os dois modelos e é o único
arquivo que conhece o schema antigo. Quando o banco migrar, a tradução some
dali e nenhum endpoint muda.

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

- **Sessões e limite de tentativas vivem na memória do processo.** Reiniciar
  desconecta todo mundo; com várias instâncias cada uma conta separado. As
  interfaces já estão certas — trocar por tabela é substituir a implementação.
- **A conta fica amarrada ao número de WhatsApp.** Quem troca de número perde o
  acesso e o histórico. Falta um caminho de recuperação.
- **Se a conta de WhatsApp for restringida** (já aconteceu neste projeto), o
  login para junto com os avisos. Ponto único de falha.
- **`created_at` guarda o horário da batida** e não há coluna separada para o
  de recebimento — a divergência de relógio só fica detectável depois da
  migração 003.

---

## Como acompanhar

O Juan pede status assim: *"como estamos?"*. Responda com **percentual real do
backlog** (332 tasks, 211 no MVP) — e o do MVP é o que responde "quando dá para usar"; `npm run backlog` calcula os dois — nunca invente número. Login de painel (`entrarComSenha`) e o Painel (`painel()`) já são reais na API, ligados pelo `ClienteHttp`; o resto das rotas ainda usa o servidor falso — ver a Fase 2 em `docs/backlog.md`. O que está feito por
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
(`texto`, `tipo`, `espaco`, `raio`, `gradiente`, `corDaEtapa`, `eventoAoVivo`)
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
db/migracoes/                       SQL escrito, não executado — leia o cabeçalho antes
```
