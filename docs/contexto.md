# Contexto — como chegamos até aqui

Escrito em 30/08/2026, no fim da conversa em que este projeto nasceu.

Existe porque o contexto de uma conversa não passa para a próxima. O que está
aqui é o que alguém precisa saber para continuar sem repetir discussões já
resolvidas — ou, pior, refazer escolhas que já foram testadas e descartadas.

---

## 1 · De onde isto veio

O Credenciei é um sistema de credenciamento e ponto para eventos, em produção,
usado pela agência Produzimos. Ele já funciona: 26 mil linhas, 29 telas, 39
operações, WhatsApp oficial da Meta integrado, eventos reais acontecendo.

O evento que serve de referência em quase tudo é o **Henrique e Juliano no
Estádio Kleber Andrade, 05/09/2026, 56 pessoas na equipe**. Vários testes usam
os horários reais dele — não por preguiça, mas porque é o caso que já produziu
bug de configuração duas vezes.

O Juan pediu para transformar isso numa plataforma: Android, iOS e web, com uma
base de dados só e uma regra de negócio só.

---

## 2 · A auditoria que abriu o projeto

Antes de escrever qualquer linha, testei o que um aplicativo faria: conectar no
banco com a chave pública (`anon`), que é o modo normal de um app falar com
Supabase.

```
funcionarios   0 linhas (RLS sem policy)
eventos        0 linhas (RLS sem policy)
registros      0 linhas (RLS sem policy)
```

O banco está trancado — só a chave de serviço, e só no servidor. É uma decisão
de segurança boa e deliberada. Mas significa que **um app não tem porta de
entrada**.

A segunda porta também estava fechada: as 39 operações são Server Actions do
Next.js, um mecanismo interno do framework. Um app React Native não consegue
chamá-las.

Daí o trabalho central do projeto: **construir uma API HTTP**.

---

## 3 · Onde a API foi parar, e por quê mudou

O Juan aprovou primeiro a **opção A** — a API dentro do sistema atual, de forma
aditiva, sem duplicação.

Depois ele foi mais restritivo: *"não mexe na API que temos no momento"*. Isso
colidia com a opção A. Perguntei, e ele decidiu por uma **API em repositório
separado, conversando com o mesmo banco**.

O custo dessa escolha é real e vale saber: enquanto os dois existirem, uma
correção de **consulta ao banco** precisa ser feita nos dois lugares.

O que **não** é custo: as regras de negócio. Elas moram em
`packages/dominio`, importado pelos dois lados. Esse risco morreu quando o
domínio virou pacote — foi o que tornou a API separada viável.

---

## 4 · A decisão que eu perdi

Recomendei que o aplicativo fosse **só para supervisor e administrador**.

O raciocínio: mil pessoas contratadas para um dia, celular cheio, internet
limitada. Pedir que baixem um app da loja, criem senha e façam login para bater
três pontos é barreira demais para um vínculo de um dia. Hoje a credencial é um
**link** — chega no WhatsApp e abre em qualquer celular, sem instalar nada.

O Juan decidiu incluir o colaborador, com **conta permanente**: instala uma
vez, participa de vários eventos, o histórico acompanha a conta. Mais o
**código de evento** (`ABC-2026-K7M2`), que resolve a entrada em cada evento
novo sem recadastro.

Isso muda o cálculo de verdade — o custo de adoção deixa de ser cobrado a cada
contratação. Segui com a decisão dele.

**A ressalva que mantenho:** a adoção não depende de nós. A defesa é manter o
link da credencial funcionando em paralelo, para sempre. Quem instalar tem o
app; quem não instalar tem o link.

---

## 5 · Erros meus, e o que cada um ensinou

Estão aqui porque a lição é reaproveitável.

**Cancelei 157 mensagens quando ele pediu para cancelar 15.** Rodei um delete
sem conferir a contagem. Consegui restaurar 147 — nenhuma tinha disparado.
→ *Contar antes de agir na fila. Sempre.*

**Disse "tipos ok" com o `tsc` sem ter rodado.** Faltava `@types/node`, e o
`echo` de sucesso rodava independente do resultado.
→ *Não afirmar sobre uma verificação que não se viu passar.*

**O alfabeto do código de evento tinha 30 caracteres e documentei 32.** E a
correção de confusão de leitura se desfazia sozinha — mapeava `O` para `0` e de
volta, sendo que nenhum dos dois estava no alfabeto. Base32 de Crockford
resolveu os dois.
→ *Contar, não estimar.*

**Bloqueei o formulário de horários em silêncio.** `preventDefault` e um scroll
discreto. O Juan clicou em salvar, a tela não reagiu, e ele saiu acreditando
que tinha salvado. Uma configuração que a pessoa PENSA que salvou é mais
perigosa que uma que ela sabe estar errada.
→ *Bloqueio sem explicação é pior que nenhum bloqueio.*

**Depois travei o mesmo formulário com um veredito velho.** O `DateTimePicker`
grava num input controlado pelo React, que não emite evento — minha validação
ficou congelada nos valores da carga da página. Ele corrigiu tudo certo e
continuou barrado.
→ *Nunca confiar em veredito guardado. Recalcular no instante da decisão.*

**O aviso do dia voltou para as 05:00 depois de eu "consertar".** Minha exceção
antecipava quando a entrada ABRIA cedo; a certa é quando ela FECHA antes das
9h.
→ *Uma exceção mal desenhada reintroduz exatamente o problema que ela evitava.*

---

## 6 · Coisas que parecem bug e não são

- **`data_ref` das boas-vindas é `1970-01-01`.** É sentinela, não erro: um valor
  não-nulo é o que permite ao índice único `(evento, funcionário, tipo,
  data_ref)` impedir mensagem duplicada. Com `NULL`, o Postgres trataria cada
  linha como distinta e a guarda nunca dispararia.

- **A Meta responde `accepted` para número que não existe.** Ela só ecoa o que
  recebeu. A falha real chega depois, pelo webhook, como `failed · Message
  undeliverable` — e hoje **não volta para a fila**. Está pendente.

- **O meio abre e nunca fecha.** De propósito: como a saída exige o meio,
  fechar a janela prenderia quem se atrasou. O atraso é medido e aparece em
  vermelho no histórico, não impede.

---

## 7 · O que está esperando o Juan

| | Trava o quê |
|---|---|
| **Conta Apple Developer** | Todo o lado iOS. É espera pura, não trabalho |
| **Banco de homologação** (grátis) | Testar migração sem chegar perto da produção |
| **Repositório remoto** | Nada hoje. Mas os commits só existem nesta máquina |
| **Testar a importação com o número dele** | Confirmar o disparo automático de boas-vindas |

---

## 8 · O que vem depois

Pela ordem de valor, considerando que a API já está de pé:

1. **O aplicativo Expo** — as telas do colaborador contra o servidor falso, que
   já existe e se comporta como o real (demora, falha por transporte, recusa
   por regra, lembra dos ids).
2. **Upload de foto** — compressão, armazenamento offline, envio direto ao
   storage sem passar pela API.
3. **Sessões e limite em tabela**, saindo da memória do processo.
4. **Rodar as migrações**, quando houver banco de homologação.

O backlog completo, com o que está feito por epic, está em `docs/backlog.md`.
