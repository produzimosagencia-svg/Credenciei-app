# 010 — A API sai do Render e vai para o VPS da Hostinger

**Decidido em** 23/09/2026 por Juan · **Estado:** aceito, infraestrutura pronta,
troca do app pendente

## Contexto

O Juan descobriu que pagava um VPS da Hostinger desde junho/2026 (KVM 2, válido
até julho/2028) sem usar para nada. A pergunta foi direta: serve para o
projeto?

Servia, e resolvia um problema real. A API vivia no plano gratuito do Render,
que **derruba a instância depois de 15 minutos sem uso** — daí o UptimeRobot
cutucando de 5 em 5 minutos para ninguém esperar 40 segundos no portão. A
saída definitiva conhecida era o plano pago (~US$ 7/mês).

Minha recomendação inicial foi **não migrar antes de 12/10** (o prazo), porque
montar nginx + certbot + systemd na mão é um dia de trabalho mais
responsabilidade permanente, enquanto o Render entrega deploy automático e
HTTPS renovado sozinho, de graça. O Juan decidiu migrar assim mesmo.

## Decisão

A API do app roda em `https://api.credenciei.com.br`, no VPS da Hostinger
(Campinas — a melhor latência disponível para Vitória/ES).

**O site NÃO se move.** Continua na Vercel, onde está bem servido. O que saiu
do Render é só o servidor Node que o aplicativo consulta.

### O que encontramos no caminho, e que mudou o plano duas vezes

**1. O servidor não estava limpo — tinha EasyPanel.** Eu havia recomendado
reinstalar Ubuntu limpo, avisando que "painel briga com nginx". Com o painel
já lá, mudei de ideia: o EasyPanel faz exatamente o que eu ia montar na mão
(deploy do GitHub, reinício automático, tela de logs), e é o que dá ao Juan
uma tela para olhar quando eu não estiver junto.

**2. O servidor tinha OUTRO SISTEMA EM PRODUÇÃO: o CondoDesk.** O Juan
acreditava que não usava Hostinger para ele. A prova de que usava:
`condodesk.net` resolve para o mesmo IP, e a porta 443 apresenta um
certificado `CN=condodesk.net` da Let's Encrypt renovado há menos de um mês.
É um site estático servido pelo nginx do host — não aparece em `docker ps`.

Isso foi descoberto porque `api.credenciei.com.br` respondeu **a tela do
CondoDesk** no primeiro teste. Se o app tivesse sido apontado antes de
testar, todo mundo que abrisse o aplicativo cairia num sistema de condomínio.

**3. O EasyPanel desta instalação NÃO TEM Traefik** — nem parado. A aba
"Domínios" dele é decorativa aqui: as portas 80 e 443 são do nginx do host, e
o proxy do painel nunca conseguiu subir. Foi por isso que o domínio
cadastrado por lá não teve efeito nenhum.

### A arquitetura que ficou

```
internet → nginx (host, portas 80/443)
             ├── condodesk.net            → arquivos estáticos em disco
             └── api.credenciei.com.br    → 127.0.0.1:3001
                                              └── Docker Swarm (EasyPanel)
                                                    → contêiner da API, porta 3000
```

- **nginx como porta de entrada**, e não o Traefik: trocar o dono das portas
  80/443 significaria derrubar a entrada de um sistema em produção para ver
  se sobe direito. Não com o CondoDesk vivo.
- **Porta publicada 3001 → 3000**: a 3000 do host já é do próprio EasyPanel.
- **`iptables -t raw PREROUTING ! -i lo --dport 3001 DROP`**, em
  `/etc/systemd/system/fecha-3001.service`: o Swarm publica em `0.0.0.0`, e
  sem isso a API ficaria acessível em texto puro pela 3001, contornando todo o
  HTTPS. O `! -i lo` é o que mantém o nginx alcançando por dentro. Virou
  serviço porque regra de firewall se perde ao reiniciar.
- **`client_max_body_size 50m`** no vhost: a selfie do meio e o áudio do gasto
  sobem codificados em texto, e o padrão do nginx (1 MB) recusaria os dois. O
  erro apareceria só em produção, na mão de quem está no evento.
- **`proxy_read_timeout 120s`**: transcrição de áudio pela IA e geração de
  planilha demoram mais que uma requisição comum.

### Duas correções no código que a migração forçou

**`tsx` e `@hono/node-server` estavam em `devDependencies`** — mas o `tsx` é o
que RODA o servidor e o `@hono/node-server` é o que atende as requisições. O
Render disfarçava, porque instala tudo sem distinguir. O Nixpacks define
`NODE_ENV=production`, o `npm install` pula devDependencies, e o servidor
morreria ao subir com `Cannot find module 'tsx'` — erro que não aponta para a
causa.

**`API_URL` não era lida por nada** desde 12/09/2026, quando o relatório passou
a morar no Storage do Supabase. Continuava escrita no `.env.example` e fez o
Juan configurá-la no servidor novo achando que precisava.

## O plano B, e por que ele é manual

Não há failover automático — isso exigiria um balanceador na frente dos dois,
e é outro nível de custo. O que existe é **troca manual rápida**, e ela só é
rápida por causa de uma escolha: **o aplicativo aponta para
`api.credenciei.com.br`, que é nosso, e nunca para o endereço do provedor.**

Se apontasse direto para o Render ou para o IP, voltar exigiria reconstruir e
republicar o app — horas ou dias em loja. Apontando para o nosso domínio, a
volta é mudar para onde o nome aponta.

**Procedimento de emergência** (também gravado no comentário do registro DNS,
que é onde a pessoa vai estar quando precisar):

1. Na Vercel, DNS de `credenciei.com.br`: trocar o registro `api` de
   `A → 187.77.251.119` para `CNAME → credenciei-app.onrender.com`
2. Esperar ~1 minuto (o TTL é 60s, escolhido para isto)

`api.credenciei.com.br` **já está cadastrado como domínio personalizado no
Render**, marcado como não verificado — é esperado, e some quando o DNS
apontar para lá. O certificado é emitido automaticamente nesse momento.

**O Render fica no ar por tempo indeterminado.** É plano gratuito, não custa
nada, e é o único lugar para onde voltar.

## Limitação aceita

Um VPS só não é alta disponibilidade. Queda da Hostinger, disco cheio ou
reinício ruim derrubam tudo até alguém agir. O Render gratuito também não
tinha garantia — só era problema de outra pessoa.

O que a mudança dá: não dorme mais, latência menor, controle, custo zero
adicional. O que **não** dá: redundância.

## Pendente

- **Apontar o app** (`EXPO_PUBLIC_API_URL`) para `https://api.credenciei.com.br`
  e republicar. Até isso, o aplicativo continua no Render e a API nova não
  recebe ninguém.
- **Rotacionar os segredos**: `SUPABASE_SERVICE_ROLE_KEY`, `WHATSAPP_TOKEN`,
  `GEMINI_API_KEY`, `SEGREDO_MANUTENCAO` foram expostos num chat durante a
  configuração. `SEGREDO_QR` fica por último e com data marcada — trocá-lo
  invalida todo crachá em circulação. Antes de trocar a chave do Supabase,
  conferir se `CREDENCIAL_SEGREDO` existe na Vercel: sem ela, o site assina o
  QR com a própria chave do Supabase, e a troca derrubaria as credenciais.
- **O agendador dos lembretes** vira um `crontab` neste servidor, no lugar do
  cron-job.org.
- **Desligar o UptimeRobot** depois que o app estiver apontado — não há mais
  instância dormindo para acordar.
- **Evolution API** (`evolution_api`, `evolution_postgres`) roda neste VPS e
  **não foi tocada**. O Juan acredita não usar mais, mas o site ainda escolhe
  o canal por `WHATSAPP_PROVEDOR`: se o valor for `evolution`, desligar corta
  o WhatsApp do site. Conferir a variável na Vercel antes de mexer. Vale notar
  que a API do app só fala com a Meta — não tem suporte a Evolution no código.

## Alternativa descartada

**Reinstalar o servidor limpo e montar tudo na mão.** Daria o mesmo resultado
com mais trabalho, mais coisa para manter, e sem tela nenhuma para o Juan
olhar sozinho. Deixou de fazer sentido no momento em que o EasyPanel já estava
instalado — e, depois, no momento em que descobrimos que havia um sistema em
produção no servidor.
