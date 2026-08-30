# 006 — A sessão não se apaga quando falta rede

**Decidido em** 30/08/2026 · **Estado:** aceito

## Contexto

O app guarda dois tokens: um curto, que vence em uma hora e vai em toda chamada,
e um longo, que serve só para pedir um curto novo. Quando o curto vence, o app
troca o longo por um par novo — e o servidor **gira** o longo: ao entregar o
novo, invalida o anterior.

A pergunta que o código precisa responder é o que fazer quando essa troca não dá
certo. O caminho comum em aplicativos é o mesmo para os dois casos: falhou,
apaga tudo, manda para a tela de login.

## Decisão

Separar os dois casos, e tratá-los de forma oposta:

| O que aconteceu | O que o app faz |
|---|---|
| O servidor **recusou** a renovação | Apaga a sessão e pede login de novo |
| O servidor **não respondeu** | Mantém a sessão inteira no aparelho |

## Por quê

Porque, neste app, deslogar por falta de rede é uma armadilha sem saída.

Para entrar de novo, a pessoa precisa receber um código de seis dígitos **no
WhatsApp** — o que exige exatamente a internet que ela não tem. Um app que se
desloga sozinho num estádio sem sinal deixa a pessoa no portão, com a credencial
guardada dentro do aparelho e sem nenhuma forma de abrir.

Recusa é diferente: o servidor disse que aquela sessão não vale mais (expirou,
foi revogada). Insistir não muda, e manter uma sessão morta faria toda chamada
falhar sem a pessoa entender por quê.

É a mesma distinção que já sustenta a fila offline (decisão 004), aplicada à
identidade em vez das batidas.

## Consequência

Existe um terceiro estado na tela, além de "logado" e "deslogado": **logado, mas
sem conseguir falar com o servidor**. A tela precisa dizer isso — "você está sem
internet" —, e não fingir que está tudo bem nem mandar a pessoa para o login.

Renovações simultâneas precisam ser reduzidas a uma só, pelo mesmo motivo: como
o token longo gira, duas telas pedindo credencial ao mesmo tempo mandariam o
mesmo token duas vezes, e a segunda voltaria recusada — derrubando uma sessão
viva. A guarda mantém uma única renovação em curso.

O servidor falso passou a girar o token longo também. Um falso que aceitasse
sempre o mesmo deixaria o app ser escrito sem guardar o token novo, e a falha só
apareceria contra a API real — no evento.

## Alternativa descartada

**Apagar sempre que a renovação falhar.** É mais simples e é o que a maioria dos
apps faz. Funciona porque a maioria dos apps é usada com internet; este é usado
de propósito onde ela falta.

## Ainda em aberto

A conta continua amarrada ao número de WhatsApp: quem troca de número perde
acesso e histórico. Esta decisão reduz o número de vezes que o login é exigido,
mas não cria um caminho de recuperação — isso é decisão de produto, e continua
pendente antes da produção.
