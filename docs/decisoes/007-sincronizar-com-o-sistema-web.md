# 007 — Como trazer as mudanças do sistema web

**Decidido em** 31/08/2026 · **Estado:** aceito

## Contexto

O `credenciei-web` continua sendo desenvolvido enquanto o app é construído. Em
31/08 o Juan pediu para trazer as atualizações, e a pergunta prática apareceu:
**trazer o quê, exatamente?**

Foram dez commits novos em dois dias. Só UM mexia em algo que o app tem.
Descobrir isso na mão, arquivo por arquivo, não escala — e errar para o lado de
"não trouxe" é o pior dos dois: o app passa a recusar o que o site aceita, e
ninguém entende por quê.

## Decisão

Uma lista fixa de **fontes copiadas** e um procedimento de quatro passos.

### As fontes

Estes arquivos do app são cópia de um arquivo de produção. Cada linha é um
lugar onde os dois podem divergir:

| No app | Vem de | O que é |
|---|---|---|
| `packages/dominio/src/janelas.ts` | `lib/janelas.ts` | Janelas, fases, horários esperados |
| `packages/dominio/src/format.ts` | `lib/format.ts` | CPF, telefone, nome |
| `packages/dominio/src/tz.ts` | `lib/tz.ts` | Fuso de Brasília |
| `packages/dominio/src/credencial-qr.ts` | `lib/credencial-qr.ts` | Geração e leitura do QR |
| `packages/dominio/src/permissoes.ts` | `lib/permissions.ts` | Quem pode o quê |
| `apps/app/src/ui/tema.ts` | `app/globals.css` | Cor, tipografia, raio, sombra |
| `apps/app/src/ui/marca.tsx` | `app/icon.svg` | O logotipo |
| `apps/app/src/navegacao/menu.ts` | `components/AppShell.tsx` | O menu e a ordem dele |

### O procedimento

**1. Perguntar ao git o que mudou em cada fonte.**

```sh
cd c:\Dev\credenciei
for f in lib/janelas.ts lib/format.ts lib/tz.ts lib/credencial-qr.ts \
         lib/permissions.ts app/globals.css app/icon.svg components/AppShell.tsx
do printf "%-28s " "$f"; git log --format="%h %ad %s" --date=format:"%d/%m %H:%M" -1 -- "$f"; done
```

**2. Conferir por DIFF, nunca só pela data.** Data engana: um arquivo pode ter
mudado antes da última cópia e ainda assim estar diferente, porque a cópia veio
de outro lugar ou foi adaptada.

```sh
diff <(sed 's/[[:space:]]*$//' c:/Dev/credenciei/lib/janelas.ts) \
     <(sed 's/[[:space:]]*$//' packages/dominio/src/janelas.ts)
```

Diferença **esperada** é a portabilidade já documentada — `credencial-qr.ts`
usa `@noble/hashes` no lugar de `node:crypto`, e recebe o segredo por parâmetro.
Diferença **nova** é o que precisa vir.

**3. Trazer a regra, com o comentário original junto.** O motivo é a parte que
não pode se perder na cópia: sem ele, alguém "simplifica" seis meses depois.

**4. Escrever o teste no app.** Não basta copiar a regra: ela tem que ter teste
aqui, porque é aqui que ela vai ser quebrada. E o teste diz por que a regra
existe, não só o que ela faz.

## Consequência

`npm run verificar` (tipos + testes de todos os pacotes) passou a existir por
causa disto: a primeira sincronização quebrou um tipo num arquivo de teste, e
`npm run teste` não pegou — `tsx` não confere tipos. Rodar os dois é o que
fecha o buraco.

O tipo `Evento` da API é a rede de segurança do porte: quando `batida_livre`
entrou nele como campo obrigatório, o compilador apontou sozinho o repositório
em memória que faltava atualizar. Campo opcional não teria apontado nada.

## O que NÃO se copia

- **Telas.** O sistema web é Next.js e o app é React Native; a tela se
  reconstrói lendo a de lá, e não copiando. O que se copia é a REGRA.
- **Acesso a banco.** `lib/historico.ts` e `lib/actions.ts` importam
  `supabaseAdmin`. A parte pura deles pode virar domínio um dia; o resto é da
  API.
- **Mensagens de WhatsApp.** `lib/mensagens*.ts` é do servidor. O app não
  dispara mensagem.

## Alternativa descartada

**Importar `c:\Dev\credenciei` como dependência.** Acabaria com a duplicação de
uma vez. Mas amarraria o app ao repositório de produção — que o Juan quis
separado justamente para o desenvolvimento não chegar perto dele — e faria uma
alteração lá quebrar a construção aqui, sem aviso. A cópia por valor é o preço
já aceito na decisão 005.
