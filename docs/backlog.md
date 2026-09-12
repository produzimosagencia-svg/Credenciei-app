# Backlog

**332 tasks · 211 no MVP · 178 concluídas (54%)**

**Só o MVP: 149 de 211 (71%).** É o número que responde "quando dá para usar" —
o outro inclui push, publicação, web e escala, que vêm depois.

> Os dois números saem de `npm run backlog`, que soma a tabela abaixo e recusa
> cabeçalho que não bate. Em 31/08 eles divergiram em treze tasks porque eu
> mantinha o cabeçalho à mão — e o número reportado saiu errado em seis pontos.
> A regra é contar, não estimar; um número que depende de alguém lembrar de
> somar é estimativa com passos extras.

> **30/08/2026 — o escopo cresceu, e o total mudou junto.** O Juan pediu que o
> app tenha as mesmas telas e a mesma lógica do sistema que já está no ar, e
> não só a parte do colaborador. Isso é a Epic 17, com 20 tasks novas. O
> percentual caiu de 24% para 25% mesmo com trabalho feito porque o
> denominador cresceu — é o número honesto.

> **31/08/2026 — mapeamento completo contra o site, e o total cresceu de
> novo.** Não foi diff do dia a dia: foi passar por toda rota de
> `credenciei-web/app/admin` e marcar o que ainda não tem par no app — criar
> evento, criar acesso de outros papéis além de supervisor, trocar senha e
> excluir acesso, a ficha da pessoa da base entre organizações e atribuí-la a
> um evento, e as três telas de WhatsApp que já eram avisadas dentro do app
> como "ainda no computador". Dez tasks que existiam sem estar contadas — indo
> de 296 para 306, o percentual caiu de 49% para 47%. Detalhe na seção
> "Mapeado em 31/08" mais abaixo.

O percentual reportado ao Juan sai daqui. Nunca estimar: contar.

Atualizado em 11/09/2026.

> **11/09/2026 — o site mudou muito mais do que um diff do dia a dia
> conseguiria pegar.** 134 commits em 12 dias, com módulos inteiramente
> novos (Gastos, Financeiro, Auditoria, Veículos, Avisos) e — mais sério —
> duas regras de negócio que o app já tinha implementado e que ficaram
> **erradas**: a fase do QR de evento que vira a noite, e o que acontece
> quando alguém sai e volta no mesmo dia. Levantamento completo em
> `docs/credenciei-web-estado-atual.md`. Os dois bugs de regra estão
> corrigidos de ponta a ponta, inclusive a tela do scanner (que perdeu o
> seletor manual Entrada/Saída, igual ao site). O resto do achado — papéis
> novos, telas que mudaram de estrutura, o produto Gastos — já está
> recontado no total abaixo (+24 tasks, de 307 para 331; o percentual caiu
> de 51% para 47% mesmo sem perder trabalho feito, porque o denominador
> cresceu). Detalhe em "Mapeado em 11/09" mais abaixo.

---

## O caminho até finalizar, em fases

As 18 epics agrupadas pela ordem em que fazem sentido — não por número.
Cada fase soma exatamente as tasks restantes (Total − Feito) das epics que
carrega; a soma das sete bate com as 159 que faltam no total. Onde o resumo
não é mais fundo que "o que sobrou da epic" é porque a epic não foi
detalhada tarefa a tarefa ainda — ver a tabela abaixo para o Feito/Total de
cada uma.

| Fase | Epics | Restam | O que é |
|---|---|---|---|
| 1 — Fechar o mapeamento | 17 | 7 | As 6 linhas de `Mapeado em 31/08` que ainda não têm ✅, mais a tela de pendências do evento |
| 2 — Ligar a API de verdade | 3, 18 | 16 | Epic 3 (API v1) está completa. Falta configurar evento (Epic 18) e a Plataforma (organizações, veículos, bloqueio de CPF, relatórios) — ainda falam com `ClienteFalso` |
| 3 — Fechar os ciclos pela metade | 2, 4, 6, 7, 8, 9, 10 | 48 | Sincronização com o site, recuperação de conta, QR (Ed25519, código giratório), foto no storage, o resto do ciclo de ponto, histórico e polimento do supervisor |
| 4 — Aguentar 20 mil pessoas | 13, 14 | 23 | Teste de carga, LGPD, retenção de dados |
| 5 — Publicar | 11, 16 | 30 | Push e as duas lojas — **bloqueado na conta Apple Developer** |
| 6 — O banco de verdade | 1 | 13 | Rodar as três migrações — **bloqueado no banco de homologação** |
| 7 — Depois do MVP | 12, 15 | 21 | Versão web e os últimos testes — por definição, o que "vem depois" |

**Onde estamos de verdade hoje**: o app inteiro é navegável, com a lógica de
negócio real por baixo — mas contra um servidor de mentira. A Fase 2 é o que
faz a diferença entre "protótipo completo" e "sistema em produção": sem ela,
nada do resto importa ainda.

---

## Progresso por epic

| # | Epic | Feito | Total | MVP | Situação |
|---|---|---|---|---|---|
| 1 | Modelo de dados | 3 | 16 | ✓ | SQL escrito, nada executado |
| 2 | Fundação | 8 | 13 | ✓ | `operador_portao` e `suporte` no domínio; falta só `produtor` (módulo Gastos) |
| 3 | API v1 | 32 | 32 | ✓ | Completo: login, painel, escanear, ponto assistido, atividades e acessos, todos reais e ligados pelo `ClienteHttp` |
| 4 | Conta do colaborador | 9 | 18 | ✓ | Login e entrada no evento, com tela |
| 5 | App base | 15 | 15 | ✓ | Navegação com voltar, campos, data/hora e o redesign "Arena" (laranja/escuro) |
| 6 | QR | 9 | 15 | ✓ | Falta Ed25519, código giratório, captura de tela |
| 7 | Offline | 13 | 19 | ✓ | Fila ligada ao app; falta o envio da foto ao storage |
| 8 | Ponto no app | 4 | 13 | ✓ | O meio com selfie; falta o resto do ciclo |
| 9 | Histórico | 4 | 11 | — | Meus dias e Meu pagamento prontos |
| 10 | Supervisor | 11 | 15 | — | Equipe, ficha da pessoa e histórico |
| 11 | Push | 0 | 12 | — | Depende da conta Apple |
| 12 | Web | 0 | 16 | — | |
| 13 | Escala | 0 | 14 | — | Teste de carga antes de evento grande |
| 14 | Segurança | 5 | 15 | — | Isolamento e limite feitos; falta LGPD, retenção e a trilha de auditoria |
| 15 | Testes | 9 | 14 | — | 605 testes rodando |
| 16 | Publicação | 0 | 18 | — | |
| 17 | Painel no app | 45 | 53 | ✓ | O achado de 11/09 entrou aqui — ver "Mapeado em 11/09" |
| 18 | Configurar evento | 11 | 17 | ✓ | Falta a API |
| 19 | Gastos (produto do Produtor) | 0 | 6 | — | Produto novo e isolado do credenciamento — escopo a confirmar com o Juan |

---

## Concluído

**Epic 1 — Modelo de dados**
- Migração `pessoas` escrita, com verificação e rollback
- Migração `codigo_convite` escrita
- Migração dos dois relógios escrita

**Epic 2 — Fundação**
- Workspace npm com pacotes e apps
- Procedimento de sincronização com o sistema web, e `npm run verificar`
- `janelas`, `format`, `tz` copiados do sistema web sem alteração
- `credencial-qr` portado de `node:crypto` para `@noble/hashes`
- Teste que prova assinatura idêntica à de produção
- Suíte rodando em todos os pacotes

**Epic 3 — API v1**
- Interface `Repositorio` e implementação em memória
- Implementação sobre Supabase, traduzindo o schema antigo
- Endpoint de batida, com a ordem de verificações correta
- Login: pedir código, entrar, renovar
- Convite, entrar no evento, minhas participações
- Meus dias, meu financeiro, meu QR
- Painel do supervisor
- Servidor HTTP com middleware de autenticação
- Sessões com dois tokens e rotação
- Limite de tentativas
- Cliente HTTP de verdade, com a régua de recusa × falha de transporte
- Troca entre servidor falso e API por variável de ambiente
- Teste que roda o mesmo roteiro nos dois clientes e exige comportamento igual
- `Perfil` no Repositorio — quem tem conta de painel, por cima do Supabase Auth
- Login por senha de verdade: CPF (supervisor) ou e-mail (admin/master), a mesma régua de tentativas do WhatsApp
- Painel real: indicadores, eventos ativos e atividade recente, com o mesmo recorte por papel de `app/admin/page.tsx` (master vê tudo, quem gerencia evento só a própria organização, supervisor só o próprio evento)
- Escanear QR real: `inferirMomentoDoScanner` decide a etapa, `avaliarEntradaSaida` confere dia/janela, isolamento por evento e organização — trouxe também a correção "a saída não exige mais o meio" (mudou no site em 11/09/2026, corrigido ao mesmo tempo no servidor de mentira)
- Ponto assistido real: localizar por CPF (com a busca aproximada de `distanciaEntreCpfs`) ou por nome, abrir ficha, registrar — quem escolhe a etapa é o operador, não o servidor (mudou no site em 11/09/2026); sobrescrever uma etapa já registrada é correção, não duplicata; `diaDeReferenciaAssistida` decide a que dia a batida pertence, igual ao `diaDeReferencia` do site
- Atividades real: as sete visões (entrada, meio, saída, presentes, e as três pendências) sobre uma consulta só (`linhasDoEventoNoDia`); pendência só cobra depois do horário esperado (`horariosEsperados`); o meio exige as duas chaves ligadas — setor (`exigeMeio`, nasce desligado) e dia (nasce ligado), a mesma dupla trava do site; `Registro.manual` novo, para a coluna distinguir batida do QR de batida lançada por outra pessoa
- Acessos real: listar (com busca e filtro por situação), ativar/desativar (ninguém desativa o próprio acesso), os eventos com setores para o formulário, e criar supervisor/operador de portão/suporte — a conta nasce de verdade no Supabase Auth + `perfis`, mas ainda sem o convite de senha por WhatsApp (documentado como pendência, não falha silenciosa); achado ao portar: só o master cria suporte, regra que faltava no servidor de mentira e foi corrigida ao mesmo tempo
- Sessão carrega o papel de quem entrou, de verdade — não mais fixo em "colaborador"
- `/v1/eu` responde o papel certo pra quem tem conta de painel
- `ClienteHttp.entrarComSenha` ligado — a tela de entrar não mudou uma linha
- Corrigido: 401 no login virava "sessão expirada" em vez de "senha errada" — achado testando o caminho novo, valia pro WhatsApp também

**Epic 4 — Conta do colaborador**
- Código de evento: geração, leitura, máscara, tolerância a confusão
- Login por WhatsApp, com código de uso único
- Formulário do evento com campos configuráveis
- Guarda de "já está neste evento"
- Tela de entrar, em dois passos (número e código)
- Tela de entrar no evento, montando o formulário que o evento mandou

**Epic 5 — App base**
- Projeto Expo (SDK 57) dentro do workspace
- Metro ensinado a ler os pacotes compartilhados, que são TypeScript
- Navegação por arquivos, com uma pasta inteira protegida por sessão
- Tema: cor, espaço, tipografia e alvo mínimo de toque, pensados para sol e pressa
- Componentes base: botão, campo, escolha, cartão, aviso, selo, carregando
- Cofre do aparelho — chaveiro do sistema no celular, armazenamento do site na web
- Sessão que sobrevive a fechar o app
- Renovação automática, com giro do token e uma renovação por vez
- "Sem rede" e "sem sessão" tratados como coisas diferentes, e ditos na tela
- Carregando, erro e "tentar de novo" resolvidos num lugar só

**Epic 6 — QR**
- Formato por etapa (`c3`), com `c2` aceito na transição
- Geração e leitura no pacote compartilhado
- Endpoint `meuQr` com a etapa do dia
- O QR desenhado na credencial, dizendo de qual etapa é
- Some quando o app sai do primeiro plano, e volta com um toque
- Leitura pela câmera no scanner do portão
- `faseAtualDoQR`: crachá de evento que vira a noite não recusa na virada do dia — trazido do site (11/09), com o bug que corrigia lá corrigido aqui também (`meuQr` e o painel do supervisor usavam `faseDoDia` sozinho)
- Escanear QR: o operador não escolhe mais Entrada/Saída — `inferirMomentoDoScanner` decide sozinho, com carência de 5 min e reabertura de turno pra quem sai e volta no mesmo dia (`ResultadoDaLeitura` ganhou a situação `reaberto`)

**Epic 7 — Offline**
- Fila ligada ao app, acima das telas e viva em segundo plano
- Tradução entre servidor e fila, com teste da recusa e da falha de rede
- Estado da batida visível na credencial: guardada, enviada ou recusada
- Fila com persistência, ordem e recuo progressivo
- Idempotência por id gerado no aparelho
- Distinção entre recusa e falha de transporte
- Recuperação de batida travada em "enviando"
- Tolerância a armazenamento corrompido

**Epic 8 — Ponto no app**
- Credencial com as três etapas do dia e o estado de cada uma
- O meio registrado pela própria pessoa, com selfie
- Janela do meio contada a partir da entrada DELA, não do relógio do evento
- Atraso marcado, nunca barrado

**Epic 9 — Histórico**
- Meus dias: cada dia com as três etapas e o status
- "Não realizada" só quando é anomalia, e não em dia inteiro ausente
- Resumo com dias trabalhados, faltados, incompletos e horas
- Meu pagamento: valor previsto, com a conta de onde ele vem

**Epic 10 — Supervisor**
- Equipe do setor, com o estado de cada pessoa em cada etapa
- Busca por nome, CPF (com ou sem pontuação), empresa e função
- Filtros: todos, com pendências, presentes, ausentes, não ativados
- Importação que diz o que entrou E o que ficou de fora
- Ficha da pessoa em modal, com Dados e Histórico de batidas
- Mover de setor, tirando de um e pondo no outro
- Promover alguém da equipe a supervisor, reaproveitando nome e CPF
- Marcar e DESMARCAR pagamento, e o valor individual a receber
- Histórico com dias escalados, trabalhados, faltas e horas
- Botão de voltar em toda tela que não é aba

**Epic 14 — Segurança**
- Isolamento por pessoa em todos os endpoints
- Respostas idênticas para "não existe" e "não é seu"
- Limite de tentativas no código de evento e no login
- Rotação do token de renovação
- Isolamento por organização no Painel: admin só vê evento da própria — o mesmo isolamento que já existia entre setores, um nível acima

**Epic 15 — Testes**
- 31 testes do app, sem emulador e sem rede

**Epic 17 — Painel no app**
- Papéis e permissões copiados para o domínio compartilhado, com teste
- Login com senha para quem tem conta de painel, no contrato e no falso
- Navegação por papel: três abas embaixo e o menu inteiro em "Mais"
- Painel: os quatro indicadores, com degradê e brilho
- Painel: cartões de evento ao vivo, com a barra de presença
- Painel: atividade recente e a janela do fluxo
- Escanear QR: câmera contínua, evento e momento, aviso em tela cheia
- Escanear QR: crachá de outra etapa com decisão, e não com "inválido"
- Conferência pelo CPF quando o crachá não passa
- Registrar ponto: busca por CPF ou nome, com escolha entre homônimos
- Registrar ponto: foto obrigatória e etapa decidida pelo servidor
- Câmera de rosto, com permissão explicada e foto já reduzida
- Atividades: log com QR, foto e registro assistido separados
- Atividades: filtro por etapa, com contador vindo da mesma lista
- Atividades: quem não chegou e quem está no evento, nome por nome
- Acessos: lista com abas, busca e bloquear sem apagar histórico
- Criar acesso de supervisor, preso a um setor de um evento
- Configuração do evento: números, progresso por etapa e lista de setores
- Cartaz da portaria: abrir, fechar, copiar, compartilhar e trocar o QR
- Criar setor, com nome único e teto de pessoas
- Setor com link próprio de cadastro e supervisores vinculados
- O cartão do painel abre a configuração do evento
- Equipe do setor: lista, busca e os cinco filtros rápidos
- Planilha: um botão só, com importar, baixar modelo e exportar dentro
- Organizações: lista dos clientes da plataforma, suspender e reativar sem apagar histórico
- Base de funcionários: busca por CPF, a pessoa uma vez só e não um cadastro por evento
- Encontre colaborador: busca regional por cidade, chamar direto no WhatsApp
- WhatsApp: estado do canal antes dos números — fila pausada não pode parecer fila cheia
- Nova organização: cadastro do cliente, do admin dono dele e do primeiro evento opcional
- Ficha da pessoa da base: histórico entre organizações, sem mostrar valor pago (preço de concorrente)
- Atribuir pessoa da base a um evento: fecha o ciclo "achei" → "chamei", direto na ficha

**Epic 18 — Configurar evento**
- Tela de edição: informações, duração e horários do dia principal
- Interruptor de batida livre, antes dos horários porque muda o sentido deles
- Conferência de horários recalculada no toque, nunca de um veredito velho
- Bloqueio que ABRE um aviso e diz que nada foi salvo
- Explicação do meio automático, que perdeu o campo mas não a regra
- Dias de trabalho numa tira que rola, com montagem, evento e desmontagem
- Dia com batida preservado mesmo se vier desmarcado
- Campo de data e hora: seletor do sistema no celular, máscara no navegador
- Criar evento novo: o master escolhe a organização dona, o admin sempre a própria — sem escolher

---

## Próximas, pela ordem

O Juan escolheu **telas primeiro, com dados de mentira**: o app inteiro fica
navegável contra o servidor falso, ele olha e corrige, e só depois a API real
entra por baixo. Nenhuma tela muda na troca.

1. **O que o mapeamento de 31/08 achou** (Epic 17 + 18) — ver a seção logo
   abaixo para a lista com as nove linhas, o que cada uma resolve e onde
   olhar no site.
2. **Endpoints do painel na API** (Epic 3 + 17). Epic 3 está completa: login,
   Painel, Escanear QR, Ponto assistido, Atividades e Acessos, todos reais e
   testados. Falta configurar evento (Epic 18) e as quatro telas da
   Plataforma. Sem elas, essas telas continuam no servidor falso.

   **Achado ao começar esta fase**: a API nunca foi de fato ligada a nada —
   não existe arquivo que suba um servidor de verdade (`servidor.ts` só
   exporta a fábrica do Hono; quem chama `serve()` e ouve uma porta ainda
   não existe), nem implementação real de `GuardaDeCodigos` sobre o
   Supabase, nem `.env` com as credenciais. "Ligar a API" não é só escrever
   mais rotas: em algum ponto precisa de um entrypoint publicável e de uma
   decisão de onde ele roda — ainda não é hoje, mas vai ser antes do fim
   desta fase.
3. **Upload de foto ao storage** (Epic 3 + 7). Hoje a selfie do meio viaja
   dentro da batida; o caminho que aguenta pico é subir direto ao storage.
4. **Sessões e limite em tabela** (Epic 3). Hoje na memória do processo.
5. **Rodar as migrações** (Epic 1). Precisa do banco de homologação.


---

## Veio do sistema web, ainda não está no app

O `credenciei-web` continua sendo desenvolvido. Estes são recursos que ele
ganhou e que o app precisa espelhar — o procedimento para achá-los está em
`docs/decisoes/007`.

| O que | Quando entrou lá | O que muda aqui |
|---|---|---|
| **Batida livre no dia do evento** | 30/08 | ✅ **Trazido.** Regra do domínio, com teste no domínio e na API |
| **Cartaz da portaria** — auto cadastro de quem chega sem estar na lista | 30/08 | ✅ **Trazido.** O lado de quem administra o cartaz. A página onde a pessoa se cadastra continua sendo web — é ela que o QR abre |
| **Histórico de batidas como aba do funcionário** | 31/08 | ✅ **Trazido.** É a tela "Meus dias" |
| **"Não realizada" só quando é anomalia** | 31/08 | ✅ **Trazido.** Regra em `historico.ts`, com teste — ver abaixo |
| **Admin move funcionário de setor** | 31/08 | ✅ **Trazido.** Ação na ficha da pessoa |
| **Pendências do evento, com todos os dias** | 31/08 | Tela que o app ainda não tem |

**A regra do "não realizada"**, para não repetir o erro quando eu montar a
tabela de histórico: o selo vermelho existe para marcar ANOMALIA — a pessoa
esteve no evento e pulou uma etapa. Num dia em que ela não apareceu, repetir o
selo nas três colunas diz três vezes o que o "Ausente" já disse uma, e onze
linhas assim viram uma parede vermelha sem informação. Dia inteiro ausente: um
traço quieto em cinza.

---

## Mapeado em 31/08: o que o site tem e o app ainda não

Levantamento direto pelas rotas do `credenciei-web` (`app/admin/**`), não pelo
diff de sincronização do dia a dia (esse é o procedimento da seção acima, para
o que MUDA lá) — este aqui é para pegar o que nunca foi portado. Cada linha já
está contada no total do backlog, dentro da Epic 17 ou 18: falta só construir,
não falta mapear.

| O que | Onde no site | Pra que serve |
|---|---|---|
| Criar evento novo | `admin/eventos/novo` | ✅ **Trazido.** Botão "Novo evento" no Painel, para quem `podeGerenciarEventos` |
| Criar acesso de admin, gerente ou cliente | `admin/usuarios/novo` | "Criar acesso" no app só cria supervisor, de propósito — os outros papéis ainda não têm formulário |
| Trocar a senha de um acesso | `UsuarioActions` no site | Falta como ação na lista de Acessos |
| Excluir um acesso | `UsuarioActions` no site | Só o master; hoje dá para bloquear, não para apagar |
| Ficha da pessoa da base, entre organizações | `admin/pessoas/[cpf]` | ✅ **Trazido.** O nome, em Base de funcionários e Encontre colaborador, abre a ficha |
| Atribuir pessoa da base a um evento | `AtribuirEvento`, dentro da ficha acima | ✅ **Trazido.** Dentro da ficha, com o mesmo "bloqueada se o setor bateu o teto" do site |
| WhatsApp: conversas por pessoa | `admin/whatsapp/conversas` | Avisado na própria tela do app como "ainda no computador" |
| WhatsApp: disparo em massa | `admin/whatsapp/disparo` | Idem |
| WhatsApp: fluxos automáticos | `admin/whatsapp/fluxos` | Idem |

**Conferido e não é gap:** `admin/clientes` é um redirect morto para o próprio
`admin/usuarios` (comentário no código do site diz isso). `admin/localizar` é
o mesmo "Registrar ponto" que já foi trazido, só com nome diferente.
`funcionarios/[id]/historico` só existe como link direto vindo das Conversas
de WhatsApp (que ainda não existem); o mesmo conteúdo já mora na ficha da
pessoa, dentro da tela do setor.

---

## Mapeado em 11/09: o achado da auditoria completa, contado

Detalhe inteiro em `docs/credenciei-web-estado-atual.md`. Aqui só a lista
countable, cada linha já dentro do total da tabela acima.

| O que | Epic | Situação |
|---|---|---|
| QR de evento que vira a noite (`faseAtualDoQR`) | 6 | ✅ **Trazido e corrigido** — `meuQr`, `painelDaEquipe` e o servidor falso todo |
| Sair e volta no mesmo dia reabre o turno (`inferirMomentoDoScanner`) | 6 | ✅ **Trazido e corrigido** — inclusive a tela Escanear, que perdeu o seletor manual |
| Papéis `produtor`, `operador_portao` e `suporte` no domínio | 2 | ⚠️ **Parcial** — `operador_portao` e `suporte` trazidos, com `podeEscanear`/`podeAcompanhar`; `produtor` fica de fora (é o módulo Gastos, que o app não tem) |
| Identidade visual "Arena" (laranja `#FF4A0F`, tema escuro) | 5 | ✅ **Trazido** — decisão do Juan, 11/09/2026: o app troca para o laranja da marca nos dois temas, mas continua abrindo CLARO por padrão (diferente do site) — o escuro entra como opção, em "Mais → Tema", guardada no aparelho. Toda tela convertida para reagir ao toggle; painéis "de vidro" do site viram superfície sólida aqui (RN não tem uma tradução barata para isso) |
| Registrar ponto: operador escolhe a etapa (pré-marcada, livre pra trocar) | 17 | ✅ **Trazido** — sobrescrever uma etapa já feita é correção, não duplicata |
| Registrar ponto: busca de CPF tolera até 2 dígitos errados | 17 | ✅ **Trazido** — `distanciaEntreCpfs` no domínio, candidatos marcados "CPF parecido" na tela |
| Base de funcionários funde com Encontre colaborador (um toggle, não duas telas) | 17 | ✅ **Trazido** — `/encontrar` ganhou o toggle, `/base-funcionarios` virou redirect |
| Criar setor pede o supervisor (nome, CPF, WhatsApp) no mesmo formulário | 17 | ✅ **Trazido** — mesmo CPF reaproveita supervisor já existente, sem login novo |
| Atividades: reescrita com as 7 visões, seletor de dia sempre visível | 17 | ✅ **Trazido** — `cliente.atividades(eventoId, { visao, dia })`, uma régua só |
| Acessos: operador de portão e Suporte como opções na criação | 17 | ✅ **Trazido** — Produtor fica de fora (módulo Gastos) |
| Acessos: aba "Funções ligadas" — catálogo de capacidades por acesso, 3 camadas (usuário → organização → padrão do código) | 17 | ⚠️ **Parcial** — catálogo (`capacidadesDoPapel`) e a aba na criação de acesso prontos, override é gravado e volta na lista; falta ligar o override no menu/rotas (só a 1ª das 3 camadas roda) e a tela de Configurações que edita a 2ª (organização). Catálogo restrito a Escanear/Acompanhar/Veículos — só o que já é tela no app |
| Veículos: cadastro por evento, consulta manual na portaria | 17 | ✅ **Trazido** — `podeGerenciarVeiculos` novo no domínio (master/admin/suporte); condutor primeiro, o resto só depois |
| Bloquear CPF do evento inteiro, sem apagar histórico | 17 | ✅ **Trazido** — `podeBloquearCpf` novo no domínio; supervisor entra, operador de portão não |
| Conferência de equipe (D-1): supervisor confirma a lista antes do evento | 17 | ✅ **Trazido** — abre 24h antes e não fecha mais; `packages/dominio` tem a janela |
| Suporte: tela de gerenciar o acesso externo, com escopo e expiração | 17 | ✅ **Trazido** — organização inteira e/ou eventos avulsos; revogar expira na hora |
| Relatórios: exportar presença/ponto da equipe em planilha | 17 | ✅ **Trazido** — mesmo padrão de `exportarEquipe`: o app pede `{ nome, url }` e compartilha |
| Lançar ponto manual: regulariza quem já foi embora, com motivo | 17 | ✅ **Trazido** — dia de trabalho ≠ hora da batida; motivo mínimo de 5 caracteres |
| Editar colaborador: atalho que busca em todos os setores do evento | 17 | ✅ **Trazido** — reaproveita a ficha que já existe; sem supervisor de propósito |
| Auto-atendimento no dia principal (`checkin_autonomo`) | 18 | ✅ **Trazido** — só entrada, nunca saída (decisão do Juan); QR fixo/cartaz físico ficou de fora desta rodada |
| Configuração do meio por setor + dia (não mais por horário) | 18 | ✅ **Trazido** — tela em Editar evento; supervisor/pendência da equipe ainda não leem o novo interruptor, só a credencial do colaborador |
| Trilha de auditoria — visualização simples de quem alterou o quê | 14 | Falta |
| Gastos — produto do Produtor (voz, manual, lista, painel, exportação) | 19 | Falta — **escopo ainda não confirmado com o Juan**, ver abaixo |

**Deliberadamente fora da contagem**, porque ainda não foi decidido SE vira
tela do app (não é "esquecido", é "não decidido"): Financeiro completo
(dashboard do master), Auditoria completa (a linha acima é só uma versão
enxuta), e o Backlog Operacional (ferramenta interna da agência, não dos
clientes da plataforma).

---

## Bloqueado, esperando o Juan

- **Conta Apple Developer** → toda a Epic 11 e a 16
- **Banco de homologação** → executar a Epic 1
- **Caminho de recuperação de conta** → decisão de produto, antes da produção
