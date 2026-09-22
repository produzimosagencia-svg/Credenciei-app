# Backlog

**326 tasks · 200 no MVP · 218 concluídas (67%)**

**Só o MVP: 163 de 200 (82%).** É o número que responde "quando dá para usar" —
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

Atualizado em 12/09/2026.

> **12/09/2026 — a Epic 18 (Configurar evento) fechou, e a jornada do
> colaborador ficou 100% real na API.** Editar evento, dias de trabalho,
> batida do meio e criar evento saíram do servidor falso (17/17). Separado
> disso: todo método que o colaborador (quem só tem conta do evento, sem
> papel de painel) usa — entrar, achar evento pelo código, ver a
> credencial/QR, os meus dias, o meu pagamento, bater ponto e a entrada sem
> operador (`registrarEntradaLivre`) — já fala com o Supabase de verdade,
> com o mesmo roteiro testado nos dois clientes (`cliente-real.teste.ts`).
> Falta ainda, fora da API em si: a foto subir direto pro storage (hoje
> viaja dentro da batida), e um caminho de recuperação de conta pra quem
> troca de número de WhatsApp — ver "Limitações conhecidas" no `CLAUDE.md`.
>
> **Mesmo dia, mais tarde — Organizações (Plataforma) também ligou na API
> real.** Listar, criar (com o admin dono dela nascendo como conta de
> verdade no Supabase Auth, e o primeiro evento opcional reaproveitando
> `criarEvento`) e suspender/reativar sem apagar histórico. Isso também
> destrava o seletor de organização que o master usa em "Criar evento" —
> antes falava com o servidor falso e quebrava nesse caminho.
>
> **Mesmo dia, ainda mais tarde — a Fase 2 fechou inteira.** Veículos
> (cadastro, condutor buscado por CPF dentro do evento), bloqueio de CPF
> (evento inteiro, supervisor só no próprio setor), base de funcionários e
> encontrar colaborador (agrupados por CPF — a mesma pessoa em vários
> eventos é uma linha; taxa de presença conta só quem bateu entrada, não
> quem só se cadastrou) e atribuir pessoa a um evento (sem teto de vaga —
> o site tirou esse limite, então não tem mais "entra bloqueada"). Por
> último, Relatórios: a planilha agora é gerada de verdade (`exceljs` para
> o `.xlsx`, `jszip` para o `.zip` por setor — as duas dependências que o
> próprio site já usa), guardada 15 minutos na memória do processo e
> servida por um link com token opaco, fora de `/v1` e sem exigir a sessão
> — pensado para ser compartilhado, não só aberto no aparelho que gerou.
>
> Único ponto pendente da Epic 17 agora: cartaz da portaria, criar setor e
> equipe do setor — depende de uma decisão sua (o app mostra um teto de
> pessoas por setor que o site removeu; ver conversa anterior). Fora da
> Epic 17, o que falta é só o que a Fase 3 já lista: sincronizar com o
> site, recuperação de conta, QR (Ed25519), foto no storage de verdade
> (relatórios e batidas ainda não sobem a arquivos reais), e o resto do
> ciclo de ponto/histórico/supervisor.
>
> **Mesmo dia, mais tarde ainda — a Epic 17 fechou de vez.** A decisão
> pendente saiu (o teto de vaga por setor, `estimado`, foi removido do
> app inteiro — contrato, servidor falso e tela do evento — para bater com
> o site, que já não tem mais esse limite). Com isso: o cartaz da portaria
> (abrir, fechar, trocar o QR — o token mora em `eventos.token_portaria`,
> não numa tabela própria, confirmado no código do site), criar setor (o
> supervisor entra no mesmo formulário, e reaproveita o acesso se o CPF já
> supervisiona outro setor do evento — sem criar login novo) e a equipe do
> setor (os quatro estados de cada etapa — feito/aberto/fechado/indefinido
> — calculados pelo servidor, nunca pela tela) agora falam com o Supabase
> de verdade. `evento()` (a tela do evento por dentro: números, progresso,
> portaria e a lista de setores) também saiu do servidor falso — era a
> última peça que faltava para as três funcionarem juntas. Limitação nova,
> registrada no `CLAUDE.md`: reatribuir um supervisor para um setor novo
> troca qual setor ele vê em "Minha equipe" — o app ainda não tem a tela de
> trocar de setor que o site ganhou depois de um bug parecido.

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
carrega; a soma das sete bate com as 122 que faltam no total (recalculado
em 21/09, depois da Epic 7 fechar e a retenção de foto entrar — antes
disso já tinha sido corrigido no mesmo dia por um arrasto de alguma rodada
anterior que não recalculava esta linha). Onde o resumo
não é mais fundo que "o que sobrou da epic" é porque a epic não foi
detalhada tarefa a tarefa ainda — ver a tabela abaixo para o Feito/Total de
cada uma.

| Fase | Epics | Restam | O que é |
|---|---|---|---|
| 1 — Fechar o mapeamento | 17 | 3 | Restam só as três telas de WhatsApp (conversas, disparo, fluxos) — deliberadamente adiadas |
| 2 — Ligar a API de verdade | 3, 17, 18 | 0 | **Completa.** Epic 3, Epic 18 e a Epic 17 inteira — organizações, veículos, bloqueio de CPF, base de funcionários, encontrar colaborador, relatórios (com planilha `.xlsx`/`.zip` de verdade), cartaz da portaria, criar setor e equipe do setor |
| 3 — Fechar os ciclos pela metade | 2, 4, 6, 7, 8, 9, 10 | 33 | Sincronização com o site, QR (Ed25519, código giratório), histórico e polimento do supervisor. **Epic 8 fechou em 18/09** (7/7) e **Epic 7 fechou em 21/09** (13/13) — as duas remapeadas sem tarefa concreta sobrando |
| 4 — Aguentar 20 mil pessoas | 13, 14 | 22 | Teste de carga, resto do LGPD. **Retenção de foto (90 dias) construída em 21/09** |
| 5 — Publicar | 11, 16 | 30 | Push e as duas lojas — **bloqueado na conta Apple Developer** |
| 6 — O banco de verdade | 1 | 13 | Rodar as três migrações — **bloqueado no banco de homologação** |
| 7 — Depois do MVP | 12, 15 | 21 | Versão web e os últimos testes — por definição, o que "vem depois" |

**Onde estamos de verdade hoje**: a Fase 2 fechou — a API de verdade cobre
tudo que o backlog original previa para ela, Epic 17 inclusive. O que resta
do app ainda navegável contra o servidor falso é só o que a Fase 3 lista.

---

## Progresso por epic

| # | Epic | Feito | Total | MVP | Situação |
|---|---|---|---|---|---|
| 1 | Modelo de dados | 3 | 16 | ✓ | SQL escrito, nada executado |
| 2 | Fundação | 8 | 13 | ✓ | `operador_portao` e `suporte` no domínio; falta só `produtor` (módulo Gastos) |
| 3 | API v1 | 32 | 32 | ✓ | Completo: login, painel, escanear, ponto assistido, atividades e acessos, todos reais e ligados pelo `ClienteHttp` |
| 4 | Conta do colaborador | 9 | 18 | ✓ | Login e entrada no evento, com tela |
| 5 | App base | 15 | 15 | ✓ | Navegação com voltar, campos, data/hora e o redesign "Arena" (laranja/escuro) |
| 6 | QR | 11 | 16 | ✓ | Falta Ed25519 e código giratório. Captura de tela trazida em 12/09: `expo-screen-capture` no crachá — bloqueia print/gravação no Android (`FLAG_SECURE`), só gravação no iOS (a plataforma não deixa impedir print, só avisar depois). Liberação do QR perto da hora de bater (`liberacaoDoQR`), 18/09: existia pronta e sem uso dos dois lados, ligada agora só no app |
| 7 | Offline | 13 | 13 | ✓ | **Completa** — remapeada em 21/09 do mesmo jeito que a Epic 8: sem `NetInfo` nenhum (deliberado — a fila não precisa SABER que está offline, só tentar e tratar a falha como transporte, não como recusa), aviso "sem internet" já presente nas telas que dependem de dado fresco (`meus-eventos.tsx`, `painel.tsx`), esgotar as 30 tentativas já vira recusada com mensagem clara. Nenhuma lacuna concreta achada — não confirmado com o Juan ainda, diferente da Epic 8 (lá ele validou antes de eu recontar). Fila ligada ao app; a foto do meio sobe de verdade pro Storage (`subirFotoDoMeio`, desde 12/09) |
| 8 | Ponto no app | 7 | 7 | ✓ | **Completa** — recontada em 18/09 depois de remapear e não achar tarefa concreta pendente (o "falta o resto do ciclo" era folga de estimativa antiga, não trabalho esquecido; Juan confirmou fechar assim, e aponta o que faltar se aparecer usando de verdade). O meio com selfie; `registrarEntradaLivre` (auto-atendimento) real na API; a credencial esconde o QR quando a participação não está credenciada, e avisa quando o dia foi cancelado; troca de evento quando a pessoa está em dois ao mesmo tempo; aviso de batida pendente na aba; contestar uma batida errada ou que faltou |
| 9 | Histórico | 4 | 11 | — | Meus dias e Meu pagamento prontos |
| 10 | Supervisor | 19 | 19 | — | Equipe, ficha da pessoa e histórico; tirar da equipe/excluir de vez/corrigir telefone são tasks novas, achadas em 14/09. Ativar/desativar sem tirar da equipe, foto/localização na presença de hoje, corrigir função, corrigir CPF e a aba de crachá (todos 21/09) — os 5 achados comparando com o site, todos fechados |
| 11 | Push | 9 | 12 | — | Registro do token pronto. Firebase (Android/FCM) configurado de ponta a ponta em 21/09. `lembrete_entrada`, `lembrete_fim`, `lembrete_meio`, `alerta_supervisor_entrada`/`alerta_supervisor_fim` e `aviso_dia_evento`/`aviso_montagem`/`aviso_desmontagem` construídos no mesmo dia — motor próprio, cópia da regra que o site já manda por WhatsApp. Mural "Avisos" (leitura) e Central de Avisos (histórico + preferências) também construídos — ver as duas entradas no changelog. Faltam confirmação de escala (precisa de campo novo que o app não modela), boas-vindas (dispara na hora do cadastro, não por cron, valor questionável), disparo manual (parece redundante com o mural); o total desta epic (12) ainda não reflete esse tamanho. iOS (APNs) parado: precisa do Apple Developer Program pago, adiado por decisão do Juan |
| 12 | Web | 0 | 16 | — | |
| 13 | Escala | 0 | 14 | — | Teste de carga antes de evento grande |
| 14 | Segurança | 8 | 16 | — | Isolamento, limite e a trilha de auditoria feitos. Retenção de foto (ADR 003, 90 dias) e "excluir minha conta" (LGPD, direito ao esquecimento) construídos em 21/09 — escopo novo, decidido na hora com o Juan; falta o resto do LGPD |
| 15 | Testes | 9 | 14 | — | 605 testes rodando |
| 16 | Publicação | 0 | 18 | — | |
| 17 | Painel no app | 48 | 53 | ✓ | O achado de 11/09 entrou aqui — ver "Mapeado em 11/09". Toda a epic fala com a API real agora: organizações, veículos, bloqueio de CPF, base de funcionários, encontrar colaborador, relatórios, cartaz da portaria, criar setor, equipe do setor, trocar senha, excluir acesso e criar acesso de admin — número não recontado por falta de lista tarefa a tarefa desta epic |
| 18 | Configurar evento | 17 | 17 | ✓ | Completo: editar evento, dias de trabalho, batida do meio e criar evento, reais e ligados pelo `ClienteHttp` |
| 19 | Gastos (produto do Produtor) | 6 | 6 | — | Backend inteiro pronto e testado (22/09) — papel `produtor`, lançamento manual e por voz, lista+filtros, painel e exportação `.xlsx`. **Sem tela no app ainda** — ver "Bloqueado" |

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
- Captura de tela bloqueada no crachá (`expo-screen-capture`), 12/09
- Liberação do QR perto da hora de bater (`liberacaoDoQR`), 18/09 — embaça até a janela abrir (com folga configurável), destrava sozinho, e não se aplica a dia sem trabalho, cancelado ou com batida livre

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
- Tirar da equipe (descredencia, reversível) e trazer de volta
- Excluir de vez (apaga cadastro e batidas, sem volta) — só master/admin/supervisor
- Corrigir telefone — caminho de recuperação de conta, suporte manual

**Epic 14 — Segurança**
- Isolamento por pessoa em todos os endpoints
- Respostas idênticas para "não existe" e "não é seu"
- Limite de tentativas no código de evento e no login
- Rotação do token de renovação
- Isolamento por organização no Painel: admin só vê evento da própria — o mesmo isolamento que já existia entre setores, um nível acima
- Retenção de foto do meio, 90 dias após o evento fechar (ADR 003), 21/09
- "Excluir minha conta" — LGPD, direito ao esquecimento, 21/09

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
2. **Endpoints do painel na API** (Epic 3 + 17 + 18). Epic 3 e Epic 18 estão
   completas: login, Painel, Escanear QR, Ponto assistido, Atividades,
   Acessos e Configurar evento (editar informações/horários, dias de
   trabalho, batida do meio e criar evento), todos reais e testados. Falta
   as quatro telas da Plataforma, e — dentro da Epic 17 — o cartaz da
   portaria, criar setor e a equipe do setor. Sem elas, essas telas
   continuam no servidor falso.

   **Achado ao começar esta fase**: a API nunca foi de fato ligada a nada —
   não existe arquivo que suba um servidor de verdade (`servidor.ts` só
   exporta a fábrica do Hono; quem chama `serve()` e ouve uma porta ainda
   não existe), nem implementação real de `GuardaDeCodigos` sobre o
   Supabase, nem `.env` com as credenciais. "Ligar a API" não é só escrever
   mais rotas: em algum ponto precisa de um entrypoint publicável e de uma
   decisão de onde ele roda — ainda não é hoje, mas vai ser antes do fim
   desta fase.
3. ~~Upload de foto ao storage~~ (Epic 3 + 7). **Feito em 12/09** — ver as
   duas notas abaixo. A selfie do meio (autoatendido e assistido) sobe para
   o bucket `presencas` (o mesmo do site) e os relatórios (`.xlsx`/`.zip`)
   sobem para um bucket próprio do app (`app-relatorios`), com URL assinada
   — nenhum dos dois fica mais na memória do processo.
4. ~~Limite de tentativas em tabela~~ (Epic 3). **Feito em 12/09** — ver a
   nota abaixo. Sessões já tinham saído da memória antes.
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
| **Pendências do evento, com todos os dias** | 31/08 | ✅ **Trazido, achado desatualizado em 21/09.** A reescrita de "Atividades" em 11/09/2026 já cobre exatamente isto — as mesmas 7 visões e o mesmo seletor de dia do site (`lib/presenca-visoes.ts` ↔ `cliente.atividades()`), só a linha desta tabela nunca tinha sido marcada |

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
| Criar acesso de admin | `admin/usuarios/novo` | ✅ **Trazido em 12/09.** Mesmo formulário de "Criar acesso" — entra por e-mail/senha, preso à organização; master escolhe qual, quem já é admin só adiciona na própria (`adicionarAdmin` do site). `gerente`/`cliente` são papéis legados que o próprio site não oferece mais; `produtor` é o módulo Gastos, fora de escopo |
| Trocar a senha de um acesso | `UsuarioActions` no site | ✅ **Trazido.** Ação inline na lista, mesma mensagem do site — "passe a senha para a pessoa, o app não avisa sozinho" |
| Excluir um acesso | `UsuarioActions` no site | ✅ **Trazido.** Só o master (`podeExcluir`); admin continua só desativando |
| Ficha da pessoa da base, entre organizações | `admin/pessoas/[cpf]` | ✅ **Trazido.** O nome, em Base de funcionários e Encontre colaborador, abre a ficha |
| Atribuir pessoa da base a um evento | `AtribuirEvento`, dentro da ficha acima | ✅ **Trazido.** Dentro da ficha — sem teto de vaga (o site removeu esse limite em 12/09, ver acima) |
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
| Acessos: aba "Funções ligadas" — catálogo de capacidades por acesso, 3 camadas (usuário → organização → padrão do código) | 17 | ✅ **Trazido em 13/09/2026** — as 3 camadas resolvem de ponta a ponta agora, ver nota abaixo. Catálogo continua restrito a Escanear/Acompanhar/Veículos — só o que já é tela no app |
| Veículos: cadastro por evento, consulta manual na portaria | 17 | ✅ **Trazido** — `podeGerenciarVeiculos` novo no domínio (master/admin/suporte); condutor primeiro, o resto só depois |
| Bloquear CPF do evento inteiro, sem apagar histórico | 17 | ✅ **Trazido** — `podeBloquearCpf` novo no domínio; supervisor entra, operador de portão não |
| Conferência de equipe (D-1): supervisor confirma a lista antes do evento | 17 | ✅ **Trazido** — abre 24h antes e não fecha mais; `packages/dominio` tem a janela |
| Suporte: tela de gerenciar o acesso externo, com escopo e expiração | 17 | ✅ **Trazido** — organização inteira e/ou eventos avulsos; revogar expira na hora |
| Relatórios: exportar presença/ponto da equipe em planilha | 17 | ✅ **Trazido** — mesmo padrão de `exportarEquipe`: o app pede `{ nome, url }` e compartilha |
| Lançar ponto manual: regulariza quem já foi embora, com motivo | 17 | ✅ **Trazido** — dia de trabalho ≠ hora da batida; motivo mínimo de 5 caracteres |
| Editar colaborador: atalho que busca em todos os setores do evento | 17 | ✅ **Trazido** — reaproveita a ficha que já existe; sem supervisor de propósito |
| Auto-atendimento no dia principal (`checkin_autonomo`) | 18 | ✅ **Trazido** — só entrada, nunca saída (decisão do Juan); QR fixo/cartaz físico ficou de fora desta rodada |
| Configuração do meio por setor + dia (não mais por horário) | 18 | ✅ **Trazido** — tela em Editar evento; supervisor/pendência da equipe ainda não leem o novo interruptor, só a credencial do colaborador |
| Trilha de auditoria — visualização simples de quem alterou o quê | 14 | ✅ **Trazido em 13/09/2026** — ver nota abaixo |
| Gastos — produto do Produtor (voz, manual, lista, painel, exportação) | 19 | Falta — **escopo ainda não confirmado com o Juan**, ver abaixo |

**Deliberadamente fora da contagem, e agora decidido — 18/09/2026: o app NÃO
vai ter.** Financeiro completo (dashboard do master) e o Backlog Operacional
(ferramenta interna da agência, não dos clientes da plataforma) — decisão
do Juan, não falta de tempo. Auditoria completa continua de fora do mesmo
jeito (a linha acima é só a versão enxuta, essa sim trazida).

> **12/09/2026 — sessões saem da memória do processo, vão para uma tabela.**
> `SessoesNoSupabase` (`apps/api/src/sessoes-supabase.ts`) substitui
> `SessoesEmMemoria` em `principal.ts`, sobre a tabela nova `app_sessoes`
> (migração `004-sessoes-em-tabela.sql`, isolada — nenhuma tela do site lê
> ou escreve nela, RLS ligado sem nenhuma política pública). Conferido com
> um teste direto na tabela (inserir, ler, apagar) e com a API rodando
> contra o Supabase real, sem quebrar o login. **Não mudou o número do
> backlog**: Epic 3 já estava 32/32 — isto é uma melhora de robustez em
> cima de trabalho já contado, não uma task nova; contar de novo aqui seria
> estimar, não contar.
>
> **12/09/2026 — limite de tentativas sai da memória do processo, vai para
> uma tabela.** Mesmo desenho de `Sessoes`/`SessoesNoSupabase`: nova
> interface `LimiteDeTentativas` (`apps/api/src/limite.ts`) com duas
> implementações — `LimiteEmMemoria` (testes) e `LimiteNoSupabase`
> (`limite-supabase.ts`), sobre a tabela nova `app_limites` (migração
> `005-limite-de-tentativas.sql`, mesmo isolamento da 004: RLS ligado, sem
> nenhuma política, nada lido ou escrito pelo site). Os dois — sessões e
> limite — usam o MESMO cliente Supabase dedicado (`semSessao`, em
> `principal.ts`), nunca o `auth` que faz `signInWithPassword` — reusar
> aquele quebra por RLS, achado testando o login de verdade. Conferido ao
> vivo contra a API real: quatro tentativas seguidas de pedir código pro
> mesmo telefone, as três primeiras passam e a quarta é barrada, sem erro.
> **Não muda o número do backlog**, mesmo motivo da nota de sessões acima —
> Epic 3 já estava 32/32.
>
> **12/09/2026 — a selfie do meio sobe de verdade para o Storage.** Até
> aqui a câmera capturava a foto (`CameraDeRosto`), ela viajava até
> `ClienteHttp.registrarBatida`... e era descartada ali mesmo, de propósito
> (comentário antigo dizia "a foto ainda não sobe por aqui"); no registro
> assistido (`ponto-assistido.ts`) a foto era só VALIDADA como obrigatória
> e jogada fora depois. `Repositorio` ganhou `subirFotoDoMeio` e
> `subirFotoAssistida` — `RepositorioSupabase` decodifica a data URL que a
> câmera já produz e sobe para o bucket `presencas`, o MESMO que o site já
> usa (privado, criado pela migração dele — conferido ao vivo que já
> existe no projeto Supabase compartilhado; não foi preciso criar nada).
> Esquema de caminho igual ao do site: `evento/participação/meio-dia.ext`
> para o autoatendido, `evento/participação/assistido-etapa-dia.ext` para
> o assistido (prefixo diferente para os dois nunca se sobrescreverem no
> mesmo dia). Upload confirmado ao vivo contra o bucket real. **Fora desta
> rodada, de propósito**: URL assinada para MOSTRAR a foto de volta (não
> existe tela ainda que peça isso) e a exclusão automática em 90 dias
> (decisão já tomada, mas nem o site tem a rotina automática — ver
> `docs/decisoes/003`). **Não muda o número do backlog** — mesmo motivo
> das notas acima, é robustez em cima de uma feature já contada.
>
> **12/09/2026 — o relatório (.xlsx/.zip) também sai da memória, vai para o
> Storage.** Mesmo espírito das notas acima: nova interface `Arquivos`
> (`apps/api/src/arquivos.ts`) no lugar das funções soltas
> `guardarArquivo`/`buscarArquivo` — `ArquivosEmMemoria` (testes, com o
> mesmo token opaco de antes) e `ArquivosNoSupabase`
> (`arquivos-supabase.ts`, a de verdade). Diferente da foto: aqui NÃO havia
> bucket para reaproveitar (o site gera a planilha e devolve na hora, na
> própria resposta HTTP — nunca precisou de um link para compartilhar
> depois), então foi criado um bucket NOVO e isolado, `app-relatorios`
> (privado, só para esta API), pela Storage API do Supabase — sem exigir
> SQL, é uma chamada de service role, não uma alteração de schema. Upload
> com `upsert: true` sobre um caminho determinístico (evento/relatório), e
> o link devolvido passa a ser uma URL ASSINADA do próprio Supabase (15
> minutos, `download: true` para continuar baixando com o nome certo em vez
> de abrir inline) — não mais um token guardado no processo. `/arquivos/:token`
> continua existindo em `servidor.ts`, mas só serve a versão em memória
> (testes); a versão real nunca passa por ali. Confirmado ao vivo: upload,
> geração da URL assinada e download de volta pela mesma URL, conteúdo
> batendo. **Não muda o número do backlog** — mesmo motivo das notas
> acima.
>
> **12/09/2026 — criar acesso de admin, e captura de tela no crachá.**
> "Criar acesso" ganhou a quarta função: admin entra por e-mail e senha,
> preso à organização (nunca a um evento) — o mesmo formulário do site
> (`NovoUsuarioForm`), que trata admin como só mais uma opção, não uma tela
> separada na Plataforma. Master escolhe a organização; um admin só
> adiciona outro na própria (`adicionarAdmin`). Com isso, a Fase 1 fica
> só com as três telas de WhatsApp, deliberadamente adiadas. Também
> instalado `expo-screen-capture` no crachá do colaborador: bloqueia
> print e gravação de tela no Android enquanto a tela está aberta (no
> iOS só a gravação — a plataforma não deixa impedir print). Testado
> (rotas + servidor falso) e conferido ao vivo no navegador nos dois
> casos.
>
> **12/09/2026 — trocar senha e excluir acesso, trazidos do site
> (`redefinirSenha`/`deletarUsuario` em `lib/actions.ts`).** A tela de
> Acessos ganhou as duas ações que faltavam desde sempre: admin/master
> trocam a senha de qualquer acesso da própria organização (min. 6
> caracteres, ninguém troca a própria por aqui — existe o fluxo de conta
> para isso), e só o master exclui de vez (`podeExcluir`, já existia no
> domínio sem nunca ter sido usado) — o resto continua só desativando, sem
> perder histórico. Simplificação conhecida: o site também deixa o suporte
> trocar senha de supervisor/operador dentro do escopo dele, com motivo
> obrigatório; esta rota ainda não tem esse terceiro caminho.
>
> **12/09/2026 — a "tela de pendências do evento" não existe mais no site
> para portar.** Conferido no código: `admin/eventos/[id]/pendencias` hoje é
> só um redirect para `/presenca?ver=faltam` — as duas telas divergiam sobre
> quem estava faltando (um incidente real, com um evento de 679 pessoas
> mostrando "587 faltando" por contar quem nem tinha chegado a hora ainda) e
> foram fundidas. `faltam` é só uma das sete visões de "Presença" — que é
> exatamente o que a Atividades do app já é (`cliente.atividades(eventoId,
> { visao, dia })`, trazida em 11/09, com as mesmas sete visões e a mesma
> régua `presenca-visoes.ts`). Não sobrou nada para construir; a linha saiu
> da Fase 1 (8→7 tasks da Epic 17, e a Fase 1 de 7 para 6 restantes).
>
> **13/09/2026 — "Conferência de equipe" estava marcada ✅ Trazido, mas só
> tinha a tela e o servidor falso — a API de verdade nunca existiu.**
> `ClienteHttp` jogava `AindaNaoNaApi` nas três chamadas (achado comparando
> a tela com o site a pedido do Juan). Faltava tudo do lado do servidor:
> ler/gravar `conferencias_equipe`, "tirar" (que é descredenciar, sem
> apagar nada), confirmar (carimba quem/quando/os números, bloqueado antes
> de abrir), o CSV de "Baixar planilha", e a visão geral do organizador
> ("X de Y setores confirmaram") — essa última nem tinha TELA nenhuma,
> nem de mentira. Construído tudo (`rotas/conferencia.ts`, novo; métodos
> novos no `Repositorio`; a tela nova em `evento/[id]/index.tsx`, no mesmo
> lugar que o site põe `PainelConferencias`), com 17 testes novos.
>
> De brinde, um bug de verdade em produção: `setoresDoEvento` (a base de
> "Fornecedores e setores", que TAMBÉM está ✅ desde a Epic 17) usava
> `perfis(...)` sem dizer qual das duas relações entre `fornecedores` e
> `perfis` o Postgres devia seguir — o PostgREST recusa a consulta
> INTEIRA nesse caso ("more than one relationship was found"), então
> qualquer evento pego por essa ambiguidade aparecia sem setor nenhum,
> silenciosamente. Corrigido com o hint `perfis!fornecedor_id(...)`,
> conferido ao vivo contra o banco real nos dois lugares (o antigo e o
> novo). **Não muda o número do backlog** — a task já estava contada; isto
> é a mesma robustez das notas anteriores, só que puxada pelo Juan
> revisando tela por tela contra o site, não por mim sozinho.
>
> **13/09/2026 — o cartão de setor ("Fornecedores e setores") também estava
> ✅ Trazido incompleto: dava para ver e criar, mas não editar, desligar o
> link nem excluir.** Achado do mesmo jeito que a conferência — o Juan
> mandou o print do card do app e pediu para ficar igual ao
> `FornecedorCard.tsx` do site. Faltavam, ponta a ponta (contrato, API,
> repositório e tela): `editarSetor` (nome/valor/pedido do meio —
> `editarFornecedor` no site), `alternarLinkDoSetor` (liga/desliga só o
> link deste setor, sem mexer no do evento inteiro — a coluna `link_ativo`
> já existia no banco compartilhado, só nunca tinha sido lida por aqui) e
> `excluirSetor` (só o master, recusa se tiver supervisor vinculado —
> `deletarFornecedor`). O popup de planilhas também foi refeito do zero
> pixel a pixel (era tela cheia; virou o popup centralizado do site, com os
> três rótulos exatos: "Importar lista", "Baixar modelo", "Lista de
> funcionários"). Diferença deliberada do site a pedido do Juan: desligar o
> link e excluir agora pedem confirmação num popup antes de agir — o site
> não tem esse freio. 6 testes novos de rota (`configurar-evento.teste.ts`).
> **Não muda o número do backlog** — "Criar setor" e "Setor com link
> próprio de cadastro e supervisores vinculados" já estavam contadas ✅;
> isto fecha a mesma lacuna de robustez das duas notas acima, achada pela
> mesma revisão tela a tela.
>
> **13/09/2026 — continuação da mesma revisão: adicionar/editar supervisor
> de um setor já existente, e suspender o cadastro por link do evento
> inteiro.** Duas lacunas que só apareciam olhando o `FornecedorCard.tsx` e
> o `CadastroPorLinkCard.tsx` do site lado a lado com o app:
>
> - **Supervisor**: dava pra CRIAR um setor com supervisor junto, mas não
>   adicionar um supervisor a um setor que já existia, nem editar
>   nome/telefone/situação de um já vinculado. Novo `adicionarSupervisor`
>   (mesma regra de CPF de `criarSetor`, sem criar setor) e `editarSupervisor`
>   (sem CPF nem senha — não mudam depois de criado; senha já tem caminho
>   próprio em Acessos). 8 testes novos.
> - **Cadastro por link do evento inteiro**: o app só tinha o interruptor
>   POR SETOR (`alternarLinkDoSetor`); o do site que fecha TODOS os setores
>   e o cartaz da portaria de uma vez (`eventos.cadastro_suspenso`, coluna
>   já existente no banco) nunca tinha sido trazido. Novo
>   `alternarCadastroPorLink`, com o mesmo popup de confirmação que o
>   resto do app já usa. 3 testes novos. Simplificação conhecida: o site
>   também deixa o master reabrir um cadastro individual por 48h com o
>   geral suspenso — esse caminho ainda não existe aqui.
>
> Também nesta revisão: os cards de setor viraram grade de 2 colunas (com
> as ações que antes eram botões de texto — "Ver equipe", "Link do
> formulário" — recolhidas em ícones e num toque no próprio card), a lista
> de "Conferência de equipe" e a de setores de "Batida do meio" (em Editar
> evento) viraram um botão que abre um popup com a lista, em vez de ficarem
> sempre abertas na tela, e o mesmo pro filtro de cidade em "Encontre
> colaborador". Só arrumação de tela — nenhuma regra nova.
>
> **Não muda o número do backlog** de propósito: supervisor e cadastro por
> link são lacunas nas MESMAS tasks já contadas ✅ ("Setor com link próprio
> de cadastro e supervisores vinculados"); o resto é só layout.
>
> **13/09/2026 — "Copiar links" em massa, cópia do site's `CopiarLinks.tsx`.**
> Última peça pendente desta revisão da tela: antes só dava para copiar o
> link de cadastro setor por setor (botão dentro de cada card). Agora um
> botão ao lado de "Novo Setor" abre a lista com todos os setores já
> marcados (desmarcar é menos trabalho que marcar todos, mesma lógica do
> site), busca quando passa de 6 setores, e copia tudo formatado — nome em
> negrito, link embaixo, uma divisória entre setores — pronto pra colar no
> grupo de WhatsApp da produção. 100% no app: não precisou de rota nova,
> só usa o `linkDoFormulario` que a lista de setores já trazia.
>
> Com isso, as três lacunas que sobravam do `FornecedorCard`/tela de
> setores ficam em: widget de Operadores de portão e o link individual de
> 48h (ambos ainda pendentes, adiados a pedido do Juan — não é a prioridade
> agora). **Não muda o número do backlog** — mesma task já contada.
>
> **13/09/2026 — widget de Operadores de portão na tela do evento**, cópia
> do site's `OperadorPortariaCard.tsx`. São da ORGANIZAÇÃO, não do evento
> sozinho (não há como prender um perfil sem setor a um evento) — a nova
> rota `operadoresDoEvento` já filtra pela organização do evento sendo
> visto, não pela do usuário logado (importa pro master, que vê eventos de
> organizações diferentes). Criar e editar reaproveitam os MESMOS métodos
> que o supervisor já usava (`criarAcesso`/`editarSupervisor` — só o papel
> muda), e os dois modais do card de setor ganharam um título por fora
> para servir aos dois casos, em vez de duplicar componente. De brinde: o
> tipo `Acesso` do contrato ganhou o campo `telefone` (faltava para
> pré-preencher o formulário de editar — antes só existia na camada de
> repositório). 4 testes novos de rota (`acessos.teste.ts`).
>
> Com isso, só fica pendente o link individual de 48h (exceção do master
> com o cadastro geral suspenso) — adiado, não é prioridade agora. **Não
> muda o número do backlog** — mesma task já contada (Epic 17).
>
> **13/09/2026 — link individual de 48h, última lacuna desta revisão.**
> Cópia do site's `criarLinkCadastroIndividual`/`lib/cadastro-individual.ts`:
> com o cadastro geral suspenso, o master ainda pode reabrir UM setor por 48
> horas sem religar o link do evento inteiro — o caso de alguém precisar
> entrar depois de a lista já ter fechado. O token é hash SHA-256, gravado
> em `sistema_estado` (`cadastro_individual:<hash>`) — MESMA tabela e MESMO
> esquema de chave que o site já usa, então um link gerado por qualquer um
> dos dois sistemas é lido pelo validador público do formulário do site sem
> tradução nenhuma. Novo em `Repositorio.salvarAutorizacaoIndividual`, rota
> `criarLinkCadastroIndividual` (master-only), e o painel "Reabrir para uma
> pessoa" dentro do card de "Cadastro por link", com seletor de setor em
> popup e o link pronto pra copiar ao gerar. 3 testes novos
> (`configurar-evento.teste.ts`).
>
> Fecha as três lacunas do `FornecedorCard`/`CadastroPorLinkCard` que
> vinham sendo revisadas desde o início desta seção. **Não muda o número do
> backlog** — mesma task já contada (Epic 17, "Setor com link próprio de
> cadastro e supervisores vinculados").
>
> **13/09/2026 — "Funções ligadas" completa: as 3 camadas resolvem de ponta
> a ponta.** Cópia do site's `resolver`/`capacidade` (`lib/permissions.ts`):
> `podeEscanear`/`podeAcompanhar`/`podeGerenciarVeiculos` (as 3 capacidades
> do catálogo do app) agora aceitam o ACESSO inteiro, não só o papel, e
> resolvem override do usuário → exceção da organização → padrão do código,
> na mesma ordem e com o mesmo "master nunca é afetado" do site. As 7 rotas
> que travavam por `perfil.papel` (escanear, atividades, conferência ×2,
> ficha da pessoa, ponto assistido, setor, veículos) passaram a travar por
> `perfil` inteiro — o `Perfil` do repositório ganhou `permissoesUsuario` e
> `permissoesOrganizacao`, carregados junto em `perfilPorId` (mesma consulta
> que o site faz em `getPerfil`, incluindo o merge plataforma→organização de
> `excecoesDePermissao`). O menu do app faz o mesmo — novo
> `useAlvoDePermissao` busca `minhas-permissoes` e o menu decide com o
> override, não só o papel salvo na sessão do aparelho.
>
> **A tabela `permissoes_organizacao` e a coluna `perfis.permissoes_usuario`
> já existiam no banco compartilhado, com dado real** (conferido ao vivo
> antes de escrever qualquer código) — o site já usa as duas; não foi
> preciso nenhuma migração.
>
> Nova tela `/configuracoes` (master-only, mesmo gate do site): escolhe o
> escopo (padrão da plataforma, ou uma organização) e liga/desliga cada
> capacidade por papel — desenho próprio (uma seção por papel, não a grade
> de tabela do site, que não cabe na largura de um celular), mesma regra
> (`permitido: null` apaga a exceção e volta ao padrão do código). De
> brinde: `editarSupervisor` passou a aceitar `permissoesUsuario` também na
> EDIÇÃO, não só na criação — a aba "Funções ligadas" apareceu também no
> modal de editar supervisor/operador de portão, dentro do card do setor.
> 21 testes novos no domínio, 9 na API, 4 no cliente falso.
>
> **Não muda o número do backlog** — a linha já estava contada como
> ⚠️ Parcial (Epic 17); isto fecha a mesma task, não abre uma nova.
>
> **13/09/2026 — Trilha de auditoria (Epic 14): quem alterou o quê.** Cópia
> reduzida do site's `admin/auditoria` (`registrarAuditoria`/`obterAuditoria`,
> sobre a tabela `alteracoes_cadastro` — já existia no banco compartilhado,
> com dado real, conferido ao vivo antes de escrever qualquer código).
> Escopo combinado com o Juan: ligar auditoria nas ações que JÁ existem no
> app, sem construir mutações novas de outras epics (editar CPF/telefone,
> mover de setor, ativar/desativar ou excluir funcionário, excluir ponto,
> encerrar evento e o papel Produtor — todas de outras epics, ficam de
> fora). As 7 rotas que já existiam ganharam a chamada: bloquear/desbloquear
> CPF, mudar situação/trocar senha/editar/criar acesso (inclusive admin),
> adicionar supervisor a um setor, link individual de 48h, salvar permissão
> de organização, confirmar conferência de equipe, reabrir turno no
> scanner, e registro assistido (entrada/saída/meio, cada um com a ação
> certa). Nova tela `/auditoria` (visível a quem gerencia usuários, e ao
> suporte — que só vê o que ele mesmo fez, régua no servidor): período
> (Hoje/7 dias/30 dias/Tudo) e cartão por linha, sem o filtro em cascata
> nem a exportação `.xlsx` do site — "visualização simples", como o próprio
> backlog já descrevia. 12 testes novos na API, 2 no cliente falso.
>
> **Muda o número do backlog: Epic 14 vai de 5/15 para 6/15** — total
> 189/332. É escopo genuinamente novo (a trilha nunca existiu no app,
> nem para ler nem para gravar), não uma correção sobre algo já contado.
>
> **13/09/2026 — achado na revisão da Epic 9 (Histórico): "Meu pagamento"
> pode estar mostrando o valor errado.** `meuFinanceiro`
> (`apps/api/src/rotas/eventos.ts:280`) calcula
> `valorPrevisto = valorReceber * diasTrabalhados`. Conferido contra as
> migrações do site: `funcionarios.valor_receber` é descrito lá como
> *"um valor a receber dos demais integrantes do setor (ex: quem organiza a
> equipe recebe uma comissão dos colegas)"* — uma comissão interna, com
> `default 0` (ou seja, zero pra quase todo mundo) — não uma diária. O valor
> que de fato representa o combinado por pessoa é
> `fornecedores.valor_combinado` ("valor combinado por funcionário" para o
> evento inteiro), que esta conta nunca busca. O site em si NUNCA multiplica
> nada por dia trabalhado — só mostra o valor combinado fixo pro admin. Ou
> seja: hoje, pra quem não tem comissão configurada (a maioria), a tela
> provavelmente mostra R$ 0,00 previsto, quando a pessoa tem, sim, um valor
> combinado a receber. **Apontado ao Juan, que pediu para não mexer agora**
> — fica registrado aqui para não se perder, e decidir quando fizer sentido
> revisitar. Não muda o número do backlog: é um achado, não uma correção
> ainda aplicada.
>
> **Corrigido em 21/09/2026 — ver a entrada mais abaixo.** O diagnóstico
> acima (trocar para `valor_combinado`) estava errado: `valor_receber` É o
> campo certo, só não devia ser multiplicado por dia. O comentário da
> migração ("comissão dos colegas") ficou velho — o código de verdade do
> site (Financeiro, planilha, edição de colaborador) trata esse campo como
> o valor total e final da pessoa há tempos.
>
> **13/09/2026 — quatro lacunas fechadas em "Meus dias"/"Meu pagamento"
> (Epic 9), achadas na mesma revisão.** Comparado campo a campo com
> `lib/historico.ts` do site:
>
> - **Bug de verdade corrigido**: dia `cancelado` (o produtor desmarcou o
>   expediente) não existia no contrato nem na rota — o dia aparecia pro
>   colaborador como "ausente", contando falta de um dia que nem deveria
>   ter existido mais. Agora `DiaDaParticipacao.cancelado` viaja da coluna
>   `jornada_dias.cancelado` (já lida em `diasDoEvento`, só morria ali) até
>   a tela, com status próprio ("Cancelado", cinza) e excluído de TODAS as
>   contagens do resumo — mesma régua do site ("dia cancelado não conta
>   como escalado, ninguém falta a ele").
> - **`diasEscalados` no resumo** — sem ele, "faltou 3" não dizia de
>   quantos. Trazido pro resumo de Meus Dias E corrigido na ficha da pessoa
>   (`ficha-da-pessoa.tsx`, que já mostrava "Dias escalados" mas contava
>   `ficha.dias.length` bruto, incluindo cancelados — mesmo bug, achado de
>   graça).
> - **Batida "assistida"** (feita pelo supervisor em nome da pessoa, não
>   pela própria) — o app registrava mas nunca mostrava; agora aparece em
>   âmbar do lado do horário, nos dois lugares (Meus Dias e na ficha da
>   pessoa), mesmo tratamento do site.
> - **Chave PIX exibida em "Meu pagamento"** — no site esse dado só é
>   escrito UMA VEZ, no formulário público, e quem não tem conta nunca mais
>   consegue rever; o app, que TEM conta permanente, agora mostra o que
>   está cadastrado (`funcionarios.chave_pix`, nunca lido em lugar nenhum
>   antes desta revisão). Só leitura por enquanto — corrigir a própria
>   chave fica para outra rodada.
>
> 8 testes novos na API, 3 no domínio do app (`historico.teste.ts`).
> **Não muda o número do backlog** — as quatro são correções/complementos
> dentro de bullets já contados ("Meus dias: cada dia com as três etapas e
> o status", "Meu pagamento"), não tasks novas e distintas. Os outros
> itens que a revisão mapeou (recibo/extrato de pagamento — não existe
> nem no site, seria escopo novo — e a fórmula do valor previsto, nota
> acima) continuam de fora, sem contar.
>
> **14/09/2026 — Epic 10 (Supervisor) fechada de ponta a ponta: as 4 ações
> da ficha, a planilha, e "tirar da equipe"/"excluir de vez" novos.**
> Investigando a ficha da pessoa achei o mesmo bug já visto e corrigido em
> "Conferência de equipe" (nota de 13/09 acima): `moverDeSetor`,
> `tornarSupervisor`, `marcarPagamento`, `salvarValorAReceber`,
> `baixarModelo`, `exportarEquipe` e `importarPlanilha` estavam com a tela
> pronta e o `ClienteHttp` jogando `AindaNaoNaApi` — funcionavam contra o
> servidor falso e quebravam contra a API de verdade. Os sete agora têm
> rota real, com a mesma régua de permissão do site
> (`exigirAcessoFuncionarios`/`podeMexerNaEquipe`) e auditoria nas que o
> site audita (`ALTERACAO_SETOR`, `ALTERACAO_SUPERVISOR`).
>
> Escopo novo, que não existia nem na tela nem na API: **"Tirar da
> equipe"** (descredencia, reversível, registra `DESCREDENCIAMENTO`) e
> **"Excluir de vez"** (apaga cadastro e batidas, sem volta — cópia do
> site's `deletarFuncionario`, `podeExcluirDaEquipe`: master, admin e
> supervisor, nunca suporte nem operador de portão). As duas na ficha da
> pessoa, com confirmação em dois passos e motivo opcional para a
> exclusão.
>
> Peça nova de infraestrutura: `apps/api/src/planilha.ts` ganhou
> `lerXlsxDeEquipe` (leitura de .xlsx com o mesmo catálogo de apelidos de
> coluna do site's `lib/planilha.ts`), e o repositório ganhou
> `criarParticipacaoDaImportacao` — o `criarParticipacao` existente não
> serve para gente NOVA na base, porque sempre reaproveita nome/telefone
> de um cadastro já existente.
>
> **Três recortes conscientes, não esquecimento — para o Juan decidir se
> quer depois:**
> - `moverDeSetor` continua só para quem gerencia eventos (master/admin),
>   sem estender a supervisor/suporte como o site permite. O site usa
>   `meusSetores` (plural) para isso, e o app só modela UM setor por
>   supervisor de cada vez — a mesma limitação já escrita no CLAUDE.md
>   ("Um supervisor só enxerga UM setor por vez"). Estender exigiria essa
>   tela primeiro.
> - A importação não replica dois efeitos colaterais do site: sincronizar
>   com Google Sheets (`adicionarFuncionarioNaPlanilha`) e agendar o
>   WhatsApp de boas-vindas (`agendarBoasVindasFuncionario`) — o app não
>   tem nem uma integração nem a outra.
> - "Ativar/Desativar pessoa" (sem descredenciar) apareceu no mapeamento
>   da ficha mas não foi pedido nesta rodada — fica registrado para uma
>   decisão futura, não incluído aqui.
>
> 26 testes novos em `ficha-da-pessoa.teste.ts` (rota nova), 6 em
> `setor.teste.ts` (planilha), 6 em `cliente-falso.teste.ts`, 2 cenários de
> ponta a ponta em `cliente-real.teste.ts` (HTTP de verdade, servidor Hono
> real). De brinde, um bug achado nesta revisão: o cliente falso já
> recusava supervisor em `marcarPagamento`/`salvarValorAReceber` — a régua
> real do site deixa supervisor mexer na própria equipe; corrigido para
> não ensinar o app a esperar uma recusa que a API de verdade não dá.
> **Epic 10 sobe de 11/15 para 13/17** — as 4 ações da ficha e a planilha
> eram tasks já contadas (só corrigidas); tirar da equipe e excluir de vez
> são as 2 tasks novas.
>
> **14/09/2026 — verificado de ponta a ponta contra a API e o banco de
> verdade** (conta `teste@credenciei.com`, organização "Homologação" — real
> em produção, mas isolada de qualquer evento de cliente). Subi a API real,
> logei pelo caminho "Tenho conta", importei uma pessoa de teste por
> planilha de verdade, e testei mover o rótulo financeiro, marcar pago,
> salvar valor, tirar da equipe, trazer de volta e excluir — cada ação
> conferida direto no banco (a pessoa apareceu, o valor mudou, a auditoria
> registrou `DESCREDENCIAMENTO` e `EXCLUSAO_FUNCIONARIO` com o motivo
> certo). Achei e corrigi, no processo, **um bug de verdade que nenhum
> teste automatizado pegava**: a importação de planilha quebrava na web
> porque `expo-file-system`'s `readAsStringAsync` (mesmo pela entrada
> `/legacy`) não tem implementação nenhuma no navegador — só em iOS/Android.
> A tela mostrava exatamente o erro técnico do Expo pro usuário. Corrigido
> em `apps/app/src/ui/planilha.tsx`: na web, usa o base64 que o próprio
> `expo-document-picker` já devolve (opção `base64: true`, é uma data URL —
> preciso só cortar o prefixo); no app nativo continua lendo pelo
> `FileSystem`, que funciona lá. Nenhum teste automatizado cobria esse
> caminho porque `cliente-falso` nunca lê o arquivo de verdade — só um teste
> que efetivamente clica no seletor de arquivo do navegador pega isto, e é
> exatamente o motivo de ter feito esta rodada com Puppeteer contra a API
> real em vez de confiar só na suíte.
>
> **14/09/2026 — "Corrigir telefone", o caminho de recuperação de conta que
> o Juan decidiu (suporte troca manualmente, sem autoatendimento).** Achei
> que o site já tem exatamente essa regra —
> `editarTelefoneFuncionario`, em `lib/actions.ts` — então copiei em vez de
> inventar: mesma validação (10 a 13 dígitos, com ou sem o 55), mesmo
> código de auditoria (`ALTERACAO_TELEFONE`, que já tinha até tradução
> pronta em `auditoria-rotulos.ts` desde a rodada da trilha), e o mesmo
> efeito colateral de atualizar as mensagens do WhatsApp do site que ainda
> não saíram (`mensagens_agendadas`, `status = 'pendente'`) — sem isso, o
> aviso agendado sairia pro número antigo mesmo depois da correção. Botão
> novo na ficha da pessoa, ao lado do telefone. **Recorte consciente,
> mesmo motivo de `podeExcluirDaEquipe`**: o site também deixa o suporte
> corrigir dentro do escopo dele, mas o app ainda não modela
> `suporte_escopo` — fica de fora até essa peça existir. Testado com o
> mesmo roteiro Puppeteer contra a API e o banco reais desta rodada, mais
> testes em `ficha-da-pessoa.teste.ts`, `cliente-falso.teste.ts` e
> `cliente-real.teste.ts`. **Epic 10 sobe de 13/17 para 14/18** — task
> nova, achada agora, não estava em nenhuma lista anterior.
>
> **15/09/2026 — começo da Epic 11 (Push): registro do token do
> aparelho.** Enquanto o Juan resolve a conta Apple, adiantei a metade do
> Push que não depende dela: `expo-notifications` + `expo-device` +
> `expo-constants` instalados, migração `006-tokens-de-push.sql` escrita
> (não executada — mesma régua da Epic 1, revisar com o Juan antes de
> rodar), e o fluxo completo — pedir permissão, pegar o token do Expo,
> mandar pro servidor guardar (`POST /v1/push/token`, upsert pelo TOKEN,
> não pela pessoa: se outra pessoa usar o mesmo aparelho depois, é ela
> quem deve receber) — registrado uma vez por login em
> `apps/app/app/(dentro)/_layout.tsx`. Nunca falha de um jeito visível:
> sem aparelho de verdade, sem permissão, ou sem projeto EAS configurado,
> a função sai calada — são os dois pré-requisitos que ainda faltam, não
> bugs.
>
> **Achado nesta rodada, ainda sem solução**: mandar notificação de
> verdade também precisa de um projeto **Firebase** (FCM, para Android) —
> um bloqueio que não estava listado antes, e que o Juan ainda não
> decidiu. Também confirmei que o MODELO do que notificar (lembrete
> automático × aviso escrito por um admin) continua em aberto — ver seção
> 7 de `docs/credenciei-web-estado-atual.md` — e não faz parte do que foi
> construído agora.
>
> De brinde: reiniciando o servidor web pra testar isto, achei que ele
> tinha subido a partir da pasta ERRADA (raiz do monorepo, não
> `apps/app`) — o app carregava em branco, sem erro nenhum na tela. Só
> apareceu porque testei de verdade num navegador depois de mexer nas
> dependências; corrigido subindo de `apps/app` de novo. **Epic 11 sobe de
> 0/12 para 1/12.**
>
> **18/09/2026 — mapeamento da Epic 8 (Ponto no app): o que estava faltando
> tarefa a tarefa, finalmente escrito.** Investigação dedicada (a epic
> nunca teve a lista das 9 tarefas que faltavam). Achados:
>
> - **Dois bugs de verdade, corrigidos**: a credencial (`credencial.tsx`)
>   mostrava um QR funcionando e as três etapas normalmente mesmo quando
>   (a) a participação está `aguardando_aprovacao` ou `descredenciado` —
>   `meuQr` gera um código válido pra qualquer situação, a recusa de
>   verdade só acontece na LEITURA (`registrarPorQr`), então a pessoa só
>   descobria o problema na hora errada, na frente de todo mundo — e (b) o
>   dia de hoje foi cancelado pela produção, caso que `meus-dias.tsx` já
>   tratava mas a credencial não. **Não muda o número do backlog** —
>   correção dentro do bullet já contado ("Credencial com as três etapas
>   do dia e o estado de cada uma"), não task nova.
> - **Achado, mas não construído — decisão do Juan**: `liberacaoDoQR`
>   (embaçar o QR até pouco antes do horário, contra print mandado com
>   antecedência) existe pronta e testada em `packages/dominio/src/
>   janelas.ts`, copiada do site (`lib/janelas.ts`) — só que **o SITE
>   também nunca chama essa função em lugar nenhum**. Parece uma feature
>   que começou dos dois lados e não foi terminada nem lá. Não construí
>   por não ter uma referência funcionando pra copiar — perguntar ao Juan
>   se vale desenhar do zero ou deixar como está.
> - **Achados, ainda sem decisão de escopo**: (1) sem jeito de trocar de
>   evento quando a pessoa está em dois ao mesmo tempo — os cartões em
>   `meus-eventos.tsx` não têm toque nenhum; (2) nenhum indicador fora da
>   tela da credencial de que ainda tem batida na fila esperando subir;
>   (3) contestar uma batida errada ou que faltou — hoje só existe a
>   instrução em texto "fale com a produção", sem ação nenhuma no app; o
>   site nunca teve isso (é admin-only), então pode ser escopo NOVO, não
>   uma peça faltando de algo que já existe — perguntar antes de construir.
>
> **18/09/2026 — item (1) construído: trocar de evento quando a pessoa
> está em dois ao mesmo tempo.** O Juan confirmou o cenário exato (navio
> de manhã, lagoa à noite — tocar em cada um mostra o QR daquele evento) e
> pediu pra seguir. Os cartões de `meus-eventos.tsx` agora navegam pra
> "Minha credencial"; qual participação mostrar passou a viver num
> contexto pequeno (`participacao-selecionada.tsx`, `ProvedorDe
> ParticipacaoSelecionada`, montado em `(dentro)/_layout.tsx`) — sem nada
> selecionado, "Minha credencial"/"Meus dias"/"Meu pagamento" continuam
> escolhendo sozinhos do jeito de sempre (o evento em andamento, ou o
> primeiro); com uma seleção, as três passam a respeitar ela, até a pessoa
> trocar de novo ou sair da conta. 5 testes novos pra regra de escolha
> (`participacao-selecionada.teste.ts`).
>
> **Limite desta verificação, pra não fingir mais do que foi feito**: o
> clique de ponta a ponta (tocar no cartão → navegar → ver o QR do evento
> certo) não foi visto rodando de verdade. O `cliente-falso` só modela UMA
> participação por colaborador (não dá pra simular alguém em dois eventos
> nele), e testar pelo caminho real exigiria um número de WhatsApp de
> verdade — que a regra deste projeto proíbe usar sem necessidade. Typecheck
> limpo, os 5 testes da regra central passando, e nenhum teste existente
> quebrou — mas o CLIQUE em si só foi conferido lendo o código, não
> vendo rodar. **Epic 8 sobe de 4/13 para 5/14.**
>
> **18/09/2026 — bug crítico achado tentando ver o clique de cima rodando
> de verdade: a tela inteira de "Minha credencial" quebrava na web.**
> Mesmo padrão do bug do `expo-file-system` achado na semana passada:
> `usePreventScreenCapture()` (o hook pronto do `expo-screen-capture`, que
> bloqueia print/gravação no crachá) não confere a plataforma sozinho e
> LANÇA na web — "ScreenCapture.preventScreenCaptureAsync is not available
> on web". Isso derrubava a tela INTEIRA: ninguém via a própria
> credencial rodando `npm run web`, e olhando os últimos registros deste
> arquivo, isso pode ter passado despercebido desde 12/09, quando a
> proteção foi instalada. Corrigido chamando `preventScreenCaptureAsync`/
> `allowScreenCaptureAsync` direto, só fora da web — exatamente o
> comportamento que o comentário do código já dizia que deveria acontecer
> ("sem efeito na web"), só que a implementação não seguia isso.
> **Não muda o número do backlog** — correção de bug numa task já
> contada, não escopo novo.
>
> **De brinde, item (2) da lista de achados da Epic 8**: um número na aba
> "Minha credencial" mostrando quantas batidas ainda não subiram — hoje só
> aparecia dentro da própria tela; quem navega pra "Meus dias" ou fecha o
> app só descobre se voltar lá. Usa `tabBarBadge` (nativo do React
> Navigation, via `expo-router`), contando qualquer batida com
> `estado !== 'enviada'` — mesmo filtro que a tela já usava, só que
> somado de qualquer participação, não só a aberta. Não deu pra ver o
> badge aparecendo de verdade neste evento de demonstração (não tem dia
> de trabalho hoje, 18/09, então não tem como registrar uma batida pra
> testar) — o crachá rodando (achado acima) já confirma que a aba em si
> carrega sem erro; o número em cima do ícone ficou só no typecheck.
>
> **18/09/2026 — item (3) construído: contestar uma batida errada ou que
> faltou.** Escopo genuinamente novo (o site nunca teve isso — colaborador
> não tem conta lá pra copiar a regra), decidido com o Juan antes de
> construir: quem vê e resolve é o supervisor do setor e quem gerencia o
> evento (mesma régua de `podeMexerNaEquipe`, já usada em marcar pagamento
> e corrigir telefone); vira pendência na aba "Com pendências" da equipe
> do setor (reusa o indicador que já existe — Push/Epic 11 ainda não está
> pronto pra mandar notificação de verdade); motivo é obrigatório, texto
> curto, mesmo padrão de "Excluir de vez".
>
> Tabela nova (`app_contestacoes`, migração `007-contestacoes-de-batida.sql`
> — aditiva e isolada como a 004/005/006, RLS ligado sem política pública,
> **já executada pelo Juan no SQL Editor**), repositório, contrato,
> `cliente-falso` e `ClienteHttp` prontos; rotas
> novas na API (`POST /v1/participacoes/:id/contestar`,
> `POST /v1/contestacoes/:id/resolver`); UI em "Meus dias" (um botão por
> dia, "Uma batida está errada ou faltando?", escolhe a etapa e escreve o
> motivo) e uma seção "CONTESTAÇÕES" na ficha da pessoa, com "Marcar como
> resolvida" pra quem pode mexer na equipe. 12 testes novos nas quatro
> camadas (API, contrato, cliente-falso e o roteiro comparado falso×real).
>
> **Limite desta verificação**: o clique de ponta a ponta na UI não foi
> visto rodando — só typecheck limpo e os testes automatizados passando,
> mesma régua de transparência do item (1) acima. **Epic 8 sobe de 6/15
> para 7/16.**
>
> **18/09/2026 — `liberacaoDoQR`: o Juan decidiu desenhar do zero no app.**
> Achado no mapeamento de 18/09: a função que embaça o QR até pouco antes
> da hora de bater (contra print mandado com antecedência) já existia
> pronta em `packages/dominio/src/janelas.ts`, copiada do site — mas nem lá
> nem aqui ela chegava a ser chamada em lugar nenhum, e **não tinha teste
> nenhum** (apesar do comentário antigo dizer o contrário — checado agora,
> corrigido). Perguntado ao Juan o que fazer: decidiu desenhar do zero no
> app, sem esperar o site terminar.
>
> Achado ao ligar: a função não tratava `batida_livre` (dia do evento sem
> janela fixa) — ficaria embaçando o QR esperando um horário que já não
> impede nem libera nada. Corrigido nos DOIS lados (aqui e no site, mesmo
> a função nunca tendo sido chamada lá) — é regra de negócio, a
> sincronização é bidirecional. 18 testes novos no domínio (a suíte que
> faltava), cobrindo folga/tolerância, as duas janelas do dia principal,
> dia de preparação com e sem horário próprio, dia cancelado e batida
> livre.
>
> Ligado em `meuQr` (API, contrato, `cliente-falso`, `ClienteHttp`): o
> retorno ganhou `liberado`/`liberaEm`. Decisão de design (não perguntada
> ao Juan, por ser detalhe de implementação dentro do escopo já aprovado):
> dia sem trabalho hoje OU dia cancelado NÃO embaçam — a tela já explica
> isso com outro aviso, e embaçar sem uma janela real pra esperar só
> confundiria sem proteger nada. Na tela ("Minha credencial"), o QR embaça
> com "Libera às HH:MM" (ou "Fora do horário de hoje" quando não há mais
> janela pra esperar hoje) e destrava sozinho — sem toque pra revelar antes
> da hora, diferente do embaçado "por segurança" que já existia (esse
> continua com toque pra mostrar de novo). 6 testes novos (3 na API sobre
> achar o dia certo, 3 no `cliente-falso`), mais 2 de paridade de forma no
> roteiro comparado falso×real.
>
> **Limite desta verificação**: mesma régua de sempre — typecheck limpo e
> os testes automatizados passando, clique na UI não visto rodando (a
> contagem regressiva e o destrave sozinho, em especial, só foram
> conferidos lendo o código). **É proteção do QR, não do ciclo de ponto —
> conta na Epic 6, não na Epic 8: sobe de 10/15 para 11/16** (mesmo
> critério usado quando a captura de tela entrou, em 12/09: camada de
> proteção nova, não uma correção de algo já contado).
>
> **21/09/2026 — Ed25519 e código giratório: fase 1 do plano (ADR 009)
> construída.** As duas palavras que ficavam soltas no backlog há semanas,
> sem documento nenhum explicando o porquê — pesquisado a fundo (git, os
> dois repositórios) e confirmado: nunca existiu registro escrito, só um
> comentário apontando pra um arquivo que nunca foi criado. Perguntado
> direto ao Juan: o problema real é a portaria sem internet em alguns
> locais — o scanner hoje depende de rede 100% do tempo. Decisão registrada
> em `docs/decisoes/009-qr-offline-ed25519.md` e no plano completo
> (`functional-sprouting-sunset.md`), com faseamento por causa do risco de
> produção (mudar a assinatura do QR pode recusar credencial em circulação).
>
> Fase 1 (das 5): par de chaves Ed25519 documentado, `@noble/curves`
> adicionado nos dois sistemas, formato novo `c4` (Ed25519 + janela de 2
> minutos, com uma janela de folga — resolve o código giratório) escrito e
> **aceito** pelos dois sistemas — ainda NADA gera `c4` em produção, só
> `lerCodigoQR` já sabe conferir, de propósito (aceitar vem antes de
> gerar). Verificação cruzada rodada manualmente: a mesma chave privada
> nos dois sistemas produz o código `c4` BYTE A BYTE idêntico — mesma
> régua da verificação HMAC que já existia (`c3`), agora repetida pro
> formato novo. 21 testes novos (14 no domínio, 2 na API). `@noble/hashes`
> subiu de `^1.5.0` pra `^1.8.0` pra caber a dependência do `@noble/curves`
> — confirmado que a assinatura HMAC continua idêntica à do sistema web
> depois do bump, antes de seguir. **Não muda número do backlog** — já
> estava contado em "Falta Ed25519 e código giratório" (Epic 6, tabela
> acima); a fase 1 é parte desse mesmo item, não item novo.
>
> **Ainda faltam 4 fases** antes disto valer pra portaria de verdade: 2
> (confirmar em produção que `c4` é aceito sem problema, por um tempo,
> antes de gerar), 3 (os dois sistemas passam a gerar `c4`), 4 (roster
> offline + fila de leituras do scanner — a parte que resolve a portaria
> sem internet de verdade), 5 (nada a fazer). Fica pra sessões futuras,
> por decisão de escopo — é grande demais pra uma sessão só.
>
> **21/09/2026 — a API foi publicada pela primeira vez** (Render, plano
> grátis, com UptimeRobot pra ela não dormir) — investigando "quais são os
> próximos passos pra dia 12", descobri que ela nunca tinha sido publicada
> em lugar nenhum, só rodava local. Juan achava que era a Vercel — era o
> site, confusão fácil entre os dois nomes. Precisou criar repositório
> **privado** no GitHub pra isso (reverte, só nesse ponto, a decisão antiga
> de não ter remoto), e um script `start` novo na API (só existia `dev`,
> que não serve pra produção). Documentado em detalhe no `CLAUDE.md`,
> seção "Onde a API roda de verdade".
>
> **21/09/2026 — retenção de foto (ADR 003, 90 dias) construída.**
> Verificando o que mais estava só decidido e nunca virou código, achei
> que a decisão de apagar a foto do meio 90 dias após o evento fechar
> (29/08/2026) nunca ganhou rotina nenhuma — a ADR já dizia "precisa de
> rotina automática", e ninguém tinha voltado pra fazer isso. Construído
> como uma rota fora de `/v1`, protegida por segredo compartilhado (não
> sessão — quem chama é um agendador externo), pra um serviço grátis tipo
> cron-job.org bater 1x por dia. Apaga só a IMAGEM do Storage e zera
> `foto_url`; a batida (horário, GPS, quem registrou) nunca é tocada — 90
> dias contam a partir do fechamento do evento (`dataFim`, ou `dataInicio`
> quando não há fim configurado). 5 testes novos. **Epic 14 sobe de 6/15
> para 7/15** — já estava contado dentro do "falta LGPD e retenção", não é
> escopo novo, só deixou de faltar.
>
> **21/09/2026 — "excluir minha conta" construído (LGPD, direito ao
> esquecimento).** Enquanto mapeava a Epic 4, achei que o colaborador não
> tem NENHUM autoatendimento sobre a própria conta além de sair — nem
> editar perfil, nem excluir. Decidido com o Juan na hora, em duas
> perguntas que mudavam o desenho por completo:
>
> - **O que apaga**: só dado pessoal (nome, telefone, foto — viram
>   anônimos). Histórico de ponto e valor a receber NUNCA são tocados —
>   registro trabalhista (CLT) geralmente precisa ficar guardado por anos
>   mesmo que a pessoa saia, e sem a chave PIX um pagamento pendente
>   ficaria impossível de completar.
> - **Alcance**: afeta TODOS os cadastros com o mesmo CPF, não só um — a
>   pessoa pode estar espalhada em vários eventos (a migração 001, que
>   uniria isso numa `pessoas` só, ainda não rodou em produção; decidido
>   não esperar por ela).
>
> Rota nova (`POST /v1/minha-conta/excluir`), só para papel `colaborador`
> (conta de painel recusa com 400); derruba toda sessão da pessoa, em
> qualquer aparelho, depois de anonimizar (`Sessoes.encerrarTodasDaPessoa`,
> método novo). UI em "Mais", numa seção "ZONA DE RISCO" com confirmação,
> mesmo padrão visual de "Excluir de vez" na ficha da pessoa. 9 testes
> novos (3 na API, 3 no `cliente-falso`, 3 no roteiro comparado falso×real).
> **Epic 14 sobe de 7/15 para 8/16** — escopo novo, decidido na hora, não
> estava contado em lugar nenhum antes.
>
> **21/09/2026 — quatro achados da Epic 10, comparando a ficha da pessoa
> com o site (`FuncionarioDetalheModal.tsx`/`FuncionarioTable.tsx`).** Um
> agente dedicado comparou a tela do supervisor no site com a equivalente
> do app e achou 5 lacunas reais (diferente da Epic 7/8, remapeadas antes
> sem achado nenhum). Juan escolheu construir 4 das 5 de uma vez — ficou
> faltando só "aba de crachá":
>
> - **Ativar/desativar sem tirar da equipe** (`alternarAtivacao`) —
>   diferente de "tirar da equipe", a pessoa continua na lista e no setor,
>   só pára de contar no fechamento e de receber lembrete de WhatsApp.
>   Mesma régua de quem já mexe na equipe.
> - **Foto e localização na presença de hoje** — o ícone de câmera abre a
>   selfie do meio (só essa etapa tem foto; entrada/fim são por QR), o de
>   mapa abre a localização no Google Maps. `presencaHoje` trocou de hora
>   crua por `registradoEm`/`fotoUrl`/`lat`/`lng` por etapa; URL da foto é
>   assinada, 15 min de validade, mesmo padrão do bucket de relatórios.
> - **Corrigir função** (`corrigirFuncao`) — mesma régua de quem já
>   corrige telefone, sem flag nova no contrato.
> - **Corrigir CPF** (`corrigirCpf`) — cópia de `editarCpfFuncionario` do
>   site, mas só master aqui (o site também deixa suporte dentro do
>   escopo dele; o app ainda não modela `suporte_escopo`, mesmo motivo já
>   documentado em `podeExcluirDaEquipe`). Recusa CPF já usado por outra
>   pessoa no mesmo evento, e recusa CPF inválido antes de checar no-op.
>
> 27 testes novos, entre API, `cliente-falso` e `cliente-real`.
>
> **21/09/2026 — o quinto achado, "aba de crachá", fechado — Epic 10
> completa.** Cópia de `obterQRDoFuncionario` do site: o MESMO QR que está
> na credencial da pessoa agora (`gerarCodigoQR`, mesma etapa), pra
> quem já pode ver a ficha olhar/imprimir sem depender do celular dela —
> sem o embaçamento de `meuQr`, que protege é a PRÓPRIA pessoa. No app,
> mais simples que no site: `react-native-qrcode-svg` desenha o código
> direto do valor assinado, sem gerar imagem no servidor (`qrcode` +
> canvas, só necessário no Next.js). 7 testes novos.
>
> Aproveitei para corrigir uma conta que tinha ficado errada: o total do
> Epic 10 tinha subido pra 20 no commit de foto/localização, mas os 5
> achados da comparação com o site sempre foram só 5 tasks novas (18 → 19,
> não 18 → 20) — sobrou um ponto contado a mais por engano. **Epic 10 fecha
> em 19/19**, sem nada por vir da comparação de 21/09.
>
> **21/09/2026 — "Minha credencial" nunca se atualizava sozinha, achado
> comparando o autoatendimento do colaborador com o site.** Um agente
> comparou o fluxo público do site (`credential/[token]/*`) com as telas
> do colaborador no app e achou um gap real: a tela nunca refaz a busca
> sozinha, só uma vez ao abrir. Três incidentes concretos que isso causa,
> os mesmos que o site já resolveu com `ManterAtualizado.tsx`:
>
> - O operador escaneia no portão, mas o celular continua mostrando
>   "Registrar entrada" — a pessoa acha que não passou e insiste.
> - O "meio" libera 4h depois da entrada; quem deixou a tela aberta desde
>   o credenciamento nunca via o cartão aparecer sozinho.
> - A etapa vira à meia-noite (montagem → evento); quem não tocasse no
>   celular ficava com o QR da etapa errada.
>
> Corrigido com `atualizarSemPiscar`, capacidade nova em `usePedido`
> (`apps/app/src/dados/pedido.ts`) que busca de novo sem passar por
> "carregando" — um `recarregar` comum faria o QR sumir e a tela piscar de
> volta bem na hora em que alguém pode estar mostrando o crachá no
> portão. Ligado em `credencial.tsx`: atualiza ao voltar ao primeiro
> plano (`AppState` → `'active'`) e a cada 60s enquanto a tela está aberta
> — o mesmo padrão do site (`visibilitychange`/intervalo), sem `NetInfo`
> (decisão já tomada na Epic 7) e sem agendar a virada exata da meia-noite
> como o site faz: o intervalo de 60s já corrige sozinho, com no máximo um
> minuto de atraso. Verificado de verdade no navegador — a tela não pisca
> nem trava disparando o evento de "voltou ao primeiro plano" repetidas
> vezes. Sem teste automatizado: este projeto não testa hooks/componentes
> React, só lógica pura — a régua de sempre é rodar e conferir na tela.
>
> Não é escopo novo — o autoatendimento do colaborador já estava contado
> como pronto (Epic 8, 7/7); isto é uma correção de comportamento, não
> uma task nova, e não muda nenhum Feito/Total.
>
> **21/09/2026 — "Meu pagamento" corrigido de vez (achado em 13/09,
> reaberto e reinvestigado a fundo hoje).** O diagnóstico de 13/09 dizia
> que o app usava o campo errado (`valor_receber` no lugar de
> `valor_combinado`). Investigando mais fundo desta vez — não só o
> comentário da migração, mas o código de verdade do site (Financeiro,
> importação de planilha, edição de colaborador, ferramentas de IA) —
> achei que `valor_receber` é sim o campo certo: em todo lugar do site ele
> é somado direto, como o valor final da pessoa, nunca multiplicado por
> dia. O comentário da migração ("comissão dos colegas") descreve uma
> intenção antiga que o uso real do campo já não segue.
>
> **O bug de verdade era mais simples**: `meuFinanceiro` multiplicava
> `valorReceber * diasTrabalhados`, inflando o valor de quem trabalhasse
> mais de um dia. Corrigido para mostrar `valorReceber` direto, sem
> multiplicar — API, `cliente-falso`, e tipo do contrato documentado. A
> tela "Meu pagamento" também mudou de texto: "Dias com entrada
> registrada" continua aparecendo, mas agora como conferência de
> presença, não como explicação do cálculo (decisão do Juan, entre três
> opções). 2 testes novos provando que trabalhar mais dias não muda o
> valor. Verificado de verdade no navegador — R$ 450,00 fixo, mesmo com
> zero dias de entrada registrados.
>
> Não muda nenhum Feito/Total — é correção de bug, não escopo novo.
>
> **21/09/2026 — push de verdade: Firebase configurado e o primeiro
> lembrete construído (Epic 11).** O Juan achou que as coisas estavam
> muito atrasadas pro prazo — investigando, boa parte do que falta (Push
> + as duas lojas, 29 tasks) estava esperando conta externa que só ele
> pode criar, não código. Resolvido junto, passo a passo:
>
> - **Firebase (Android)**: projeto criado, app cadastrado
>   (`com.produzimos.credenciei`), `google-services.json` no lugar,
>   conta Expo criada, projeto ligado ao EAS, chave de serviço do
>   Firebase enviada pro EAS (FCM V1) — o Android está pronto pra
>   RECEBER push. Detalhe técnico em "Onde a API roda de verdade" não
>   mudou — isto é infraestrutura do APP, não da API.
> - **iOS parado por decisão, não por falta de orientação**: o Juan só
>   tem Apple ID comum, não o Developer Program pago (US$ 99/ano) —
>   sem ele não sai nem a chave APNs nem a App Store. Decidiu deixar
>   pra depois.
> - **Modelo de notificação decidido**: reaproveitar os lembretes
>   automáticos que o site já manda por WhatsApp (`lib/mensagens.ts`,
>   15 tipos) E construir o mural "Avisos" (não existe no app ainda) —
>   os dois, não um ou outro. Dado o tamanho real (o motor do site tem
>   1.449 linhas, deliberadamente isolado da tabela de tokens do app —
>   `app_push_tokens` foi construída de propósito pro site NUNCA ler),
>   entramos com o primeiro pedaço, não tudo de uma vez.
> - **`lembrete_entrada` construído de ponta a ponta**: quem ainda não
>   bateu a entrada, num dia principal sem auto-atendimento, dentro de
>   2h do prazo, leva um push — motor PRÓPRIO do app (não reaproveita o
>   do site, que é isolado de propósito), mesma trava (`diaComTrava`) e
>   mesma janela de antecedência que o site já usa. Rota nova
>   (`POST /manutencao/lembrete-entrada`), mesmo padrão da retenção de
>   foto: fora de `/v1`, protegida pelo `SEGREDO_MANUTENCAO` que já
>   existe, chamada por um agendador externo — falta o Juan configurar
>   esse agendador batendo nela (cron-job.org, mesma ferramenta cotada
>   pra retenção de foto). Idempotente por dia (`app_lembretes_enviados`,
>   **migração 008 rodada pelo Juan em 21/09**) — o agendador pode bater
>   quantas vezes quiser, cada pessoa recebe o lembrete uma vez só. 7
>   testes novos na regra, 2 na rota.
>
> **Epic 11 sobe de 1/12 para 2/12** — o total (12) ainda não reflete o
> tamanho real da escolha "os dois": faltam os outros 14 tipos de
> lembrete e o mural inteiro, que ainda não foram escopados tarefa a
> tarefa.
>
> **21/09/2026 — `lembrete_fim` (saída) construído, generalizando o
> motor de `lembrete_entrada`.** Achado real no meio do caminho: a saída
> de um turno que atravessa a meia-noite (este próprio evento de
> demonstração — janela de saída fecha 08:00 do dia seguinte) ainda
> pertence ao dia PRINCIPAL de ontem, não ao calendário de agora. Sem
> tratar isso, o lembrete de saída nunca dispararia depois da virada do
> dia — a trava (`dia principal, não cancelado`) e a dedupe
> (`app_lembretes_enviados`) só bateriam certo pro dia errado. Corrigido
> generalizando `participacoesSemEntradaHoje` (que já tinha o mesmo
> problema em potencial, só nunca testado) em
> `participacoesSemRegistroHoje`, que agora aceita `entrada` ou `fim` e
> resolve o dia de referência do PRÓPRIO evento (hoje OU ontem, o que
> tiver o dia principal), igual ao raciocínio de `diaDeReferenciaAssistida`
> no domínio. Rota nova (`POST /manutencao/lembrete-saida`), mesmo
> segredo compartilhado. 5 testes novos, incluindo o cenário de virada de
> meia-noite.
>
> **Epic 11 sobe de 2/12 para 3/12.**
>
> **21/09/2026 — alerta ao supervisor (entrada e saída), reaproveitando a
> mesma consulta dos lembretes individuais.** Em vez de um push por
> pessoa, um push só por SETOR, com a lista de quem falta — cópia de
> `alerta_supervisor_*` no site, que também cancela quando ninguém está
> faltando. `participacoesSemRegistroHoje` ganhou `equipeId`/
> `equipeNome`/`eventoNome`/`cpf` no retorno (já vinham calculados na
> consulta, só faltava devolver), e um método novo,
> `supervisorDoSetor(equipeId)`, resolve quem avisar — mesma régua de
> `equipeDoSupervisor` (o setor ATUAL do supervisor, não todos os que
> ele alcança; limitação já documentada no CLAUDE.md, não nova). Rotas
> novas (`POST /manutencao/alerta-supervisor-entrada` e `-saida`), mesmo
> segredo. 4 testes novos.
>
> **Epic 11 sobe de 3/12 para 5/12.**
>
> **21/09/2026 — `lembrete_meio` construído, consulta própria (janela é
> da pessoa, não do evento).** Diferente de entrada/saída: a janela do
> meio abre 4h depois da entrada REAL de cada pessoa (`janelaMeio`, no
> domínio) e vale TODO dia — inclusive montagem e evento com batida
> livre, ao contrário dos outros lembretes (mesmo raciocínio do site:
> "o meio fica de fora da trava de dia principal"). Por isso não deu pra
> reaproveitar `participacoesSemRegistroHoje` — método novo,
> `participacoesSemMeioHoje`, que olha quem tem entrada sem meio ainda,
> e só considera dias com `exige_meio` (nasce ligado, mesmo padrão de
> `DiaDeTrabalho.exigeMeio`). Rota nova
> (`POST /manutencao/lembrete-meio`), mesmo segredo. 8 testes novos.
>
> **Epic 11 sobe de 5/12 para 6/12.**
>
> **21/09/2026 — `aviso_dia_evento`/`aviso_montagem`/`aviso_desmontagem`
> construídos juntos ("hoje tem trabalho", não "você está devendo algo").**
> `quandoAvisarDoDia` e `HORA_AVISO_DIA` portados do site pro domínio
> (`packages/dominio/src/janelas.ts`) — 07:00 fixo pro dia do evento, a
> não ser que o credenciamento inteiro feche antes das 9h, caso em que
> cede pra 2h antes de abrir (achado real do site: sem essa exceção, um
> evento com entrada 06:00-08:00 mandaria aviso quando a portaria já
> tinha fechado). Montagem/desmontagem sempre às 07:00. Repositório ganhou
> `diasParaAvisarHoje`, que já filtra pro dia de hoje — sem sentido
> antecipar ou atrasar um aviso de "hoje". Rota nova
> (`POST /manutencao/aviso-do-dia`), mesmo segredo. 3 testes no domínio, 7
> na rota.
>
> **Parado aqui, por ora — três itens que sobraram pedem decisão ou têm
> problema de encaixe, não é só "mais um tipo":**
> - `confirmacao_escala` precisa de um campo novo no evento
>   (`msg_pre_evento_envio`, quando o produtor quer confirmar a escala)
>   que o app não modela — teria que virar tela de configuração nova.
> - `boas_vindas_funcionario` dispara na HORA do cadastro (`after()` no
>   site), não por cron como os outros — e quem acabou de entrar
>   raramente já tem um token de push registrado, então o valor prático é
>   baixo.
> - `disparo_manual` é uma ferramenta ad-hoc do site (master escolhe
>   template e manda na hora) que parece redundante com o mural "Avisos" —
>   talvez nem faça sentido replicar os dois.
>
> **Epic 11 sobe de 6/12 para 7/12.** Próximo passo natural: o mural
> "Avisos" (não existe no app ainda) — é a outra metade do que o Juan
> escolheu, e maior que qualquer um destes lembretes.
>
> **21/09/2026 — mural "Avisos" construído (leitura e confirmação).**
> Diferente dos lembretes: o site NUNCA manda "Avisos" como push, só
> mostra como modal quando a pessoa abre a tela — confirmado com o Juan
> antes de construir, pra não inventar push que o site não tem. Usa a
> MESMA tabela que o site já usa (`avisos`/`aviso_setores`/
> `aviso_visualizacoes`), não uma cópia isolada tipo `app_push_tokens` —
> um aviso criado no painel do site aparece no app, e vice-versa; só a
> tradução de identidade muda (o site guarda `cpf_pessoa`, o app resolve
> pelo `pessoaId`). Fase 1: só leitura — criar/editar continua no site,
> que já tem essa tela pronta. Rotas novas:
> `GET /v1/eventos/:id/avisos-pendentes`, `POST /v1/avisos/:id/visto`. 11
> testes na rota, mais o round-trip real. **Epic 11 sobe de 7/12 para
> 8/12** — este commit não tinha atualizado o backlog na hora, corrigido
> agora junto com a entrada de baixo.
>
> **21/09/2026 — achado no meio do caminho: a "Central de Avisos" já
> estava desenhada, e esquecida.** Investigando o contrato pra montar o
> mural, achei que `packages/contrato/src/cliente.ts` já tinha um
> contrato INTEIRO pra um histórico de push com preferências por tipo
> (`minhasNotificacoes`, `marcarNotificacaoComoLida`,
> `salvarPreferenciasDeAvisos`) — com dado de demonstração pronto no
> `cliente-falso.ts`, mas **nenhuma API de verdade por trás** (todo
> método jogava `AindaNaoNaApi`) e nenhuma tela no app. Achado
> apresentado ao Juan, que escolheu construir os dois — o mural E esta
> central — na mesma sessão.
>
> Ligado numa API de verdade: duas tabelas novas
> (`app_notificacoes`/`app_preferencias_de_aviso`, migração 010), e os
> sete lugares que mandam push (`rotas/lembretes.ts`) passaram a checar a
> preferência ANTES de mandar (não é decorativo — desligar "hora da
> entrada" realmente impede o envio) e gravar no histórico DEPOIS de
> mandar com sucesso. Os rótulos das categorias (`dia_evento`,
> `alerta_pendencia` etc.) já vinham prontos do `cliente-falso.ts`, só
> reaproveitados.
>
> Aproveitado pra limpar uma duplicata achada no caminho:
> `registrarTokenDeAviso` era uma segunda declaração pro mesmo registro
> de token que `registrarTokenDePush` já faz de verdade — nunca chamada
> por tela nenhuma, nunca implementada na API. Removida do contrato
> (interface, `cliente-http.ts`, `cliente-falso.ts`).
>
> **Epic 11 sobe de 8/12 para 9/12.**
>
> **22/09/2026 — migrações 001 (pessoas permanentes) e 003 (dois
> relógios) rodadas em produção, e `pessoas` passou a ser fonte
> canônica onde já é seguro.** Prioridade escolhida pelo Juan pra
> continuar a rodada de "backend primeiro" (ver decisão de 21-22/09 nas
> memórias): das migrações escritas e nunca rodadas, essas duas eram as
> únicas que abriam trabalho real — Epic 1 (`pessoas`/`participacoes`
> separadas) e a divergência de relógio que sustenta o "achado que
> define o projeto" do `CLAUDE.md`. Rodadas com backup revisado antes,
> fora de horário de evento ao vivo. Confirmado depois, com script
> descartável e sem imprimir dado sensível: `pessoas` com 2.029 linhas,
> `funcionarios.pessoa_id` 100% preenchido (zero órfão), e
> `registros.recebido_em`/`origem` existindo e populados.
>
> Antes de mexer em código, um risco real foi levantado pro Juan: o
> `pessoaId` que a API expõe hoje é sintético (`cpf:XXXXX`), não o uuid
> real de `pessoas.id` — trocar o formato quebraria sessão, token de
> push, histórico de notificação e preferência de quem já usa o app.
> Ele escolheu **só aproveitar `pessoas` como dado melhor, sem trocar o
> formato externo** — opção mais segura, não a "mais correta"
> arquiteturalmente. `apps/api/src/dados/supabase.ts` atualizado:
> `pessoaPorId`/`pessoaPorCpf`/`pessoaPorTelefone` agora leem de
> `pessoas`; `criarPessoa` (antes lançava erro) e `excluirMinhaConta`
> agora escrevem lá também; `corrigirTelefoneDaParticipacao` ganhou
> dual-write (`funcionarios` + `pessoas`) pra não ficar dessincronizado
> depois de uma correção. `corrigirCpfDaParticipacao` ficou de fora de
> propósito — corrigir CPF muda QUAL pessoa a participação pertence, e
> religar `pessoa_id` nesse caso é problema de identidade, não leitura
> segura; documentado como pendência conhecida no `CLAUDE.md`.
>
> Não é escopo novo, não muda nenhum Feito/Total — é correção de
> arquitetura interna sob funcionalidade que já existia.
>
> **22/09/2026 — Gastos (produto do Produtor, Epic 19) construído de ponta
> a ponta no backend.** Escopo confirmado com o Juan: papel `produtor`
> completo (login próprio, isolado do credenciamento, MESMA tabela que o
> site já usa — `gastos_evento`/`produtor_eventos`, sem tradução de schema
> nenhuma, ao contrário de pessoas/funcionarios), lançamento manual E por
> voz (Gemini, `apps/api/src/gastos-ia.ts`, porta quase verbatim de
> `lib/gastos-ia.ts` do site — a regra "nunca inventa" é a mesma: campo
> incerto vira `null` e entra em `precisaConfirmar`), lista com filtro,
> painel com KPIs e gráficos (`kpisDeGastos`/`dadosDosGraficosDeGastos`
> portados pro domínio, mesmo cálculo que o site), e exportação `.xlsx`.
> Master (dando suporte) vê todos os eventos e todos os "Interno"; produtor
> só os vinculados a ele em `produtor_eventos`. 20 testes na rota, mais o
> round-trip real (criar → listar → painel → exportar → editar → excluir,
> logado como master, pela API de verdade). **Epic 19 sobe de 0/6 pra
> 6/6** — mas **nenhuma tela existe ainda**: é backend puro, seguindo a
> ordem que o Juan escolheu (backend primeiro, UI depois — ver "Bloqueado"
> abaixo).
>
> **22/09/2026 — achado corrigido: "Lançar ponto manual" e "Editar
> colaborador" (Epic 17) estavam marcados ✅ Trazido, mas só existiam no
> `cliente-falso.ts` — a API de verdade lançava `AindaNaoNaApi` nos 5
> métodos.** Testando o app local contra a API publicada, o Juan achou as
> duas telas quebradas. Investigando, achei um TERCEIRO método no mesmo
> estado (Suporte de Sistema, 4 métodos) — ver nota abaixo, ficou de fora
> desta rodada de propósito.
>
> Construído de ponta a ponta, cópia de `lancarPontoManual` em
> `c:\Dev\credenciei\lib\actions.ts`: mesmas travas (motivo com 5+
> caracteres, dia de trabalho válido, hora dentro de ~36h do dia, pessoa
> ativa), mesmo padrão de prova que o registro assistido já usa
> (`apagarRegistroDoTipo` + `gravarRegistro` com `manual: true`,
> `registrarAuditoria` com o motivo em vez de exigir foto). "Editar
> colaborador" reaproveita `equipesDoEvento`/`participacoesDaEquipe` que já
> existiam — nenhuma consulta nova. `suporte` ficou de fora dos dois: o app
> ainda não modela `suporte_escopo` (mesma simplificação documentada em
> `podeExcluirDaEquipe`), então onde o site usa esse escopo fino, aqui cai
> como organização inteira — e por ora nem isso, fica de fora até o Juan
> decidir se essa simplificação serve.
>
> Rotas novas: `GET/POST /v1/lancar-ponto`, `GET /v1/lancar-ponto/eventos`,
> `GET /v1/lancar-ponto/:eventoId`, `GET /v1/editar-colaborador/eventos`,
> `GET /v1/editar-colaborador/:eventoId`. 12 testes novos na rota, mais 2
> round-trips reais. **Não muda nenhum Feito/Total** — as duas linhas já
> estavam contadas em Epic 17; isto só torna verdadeiro o que já estava
> marcado.
>
> **22/09/2026 — Suporte de Sistema construído, com o escopo fino igual ao
> site.** Perguntado se valia simplificar (organização inteira, sem
> evento avulso) pra ir mais rápido, o Juan escolheu o caminho certo:
> escopo completo, igual ao site. Achado que tornou isso mais simples do
> que parecia: `suporte_escopo` e `perfis.acesso_expira_em` **já existem em
> produção** (o site usa as duas desde `upgrade-suporte.sql`) — não foi
> preciso nenhuma migração nova, só ligar o app na mesma tabela pela
> primeira vez. Cópia de `criarSuporte`/`editarSuporte`/`revogarSuporte`/
> `suporteTemEscopo` em `c:\Dev\credenciei\lib\actions.ts`/`lib/suporte.ts`:
> escopo por organização inteira OU evento avulso (nunca os dois na mesma
> linha), uma pessoa pode ter várias linhas, `acessoExpiraEm` é
> `'AAAA-MM-DD'` mas o "expirado" só vira verdade às 23:59:59 daquele dia
> — e revogar marca `acessoExpiraEm` como ONTEM (não hoje), porque hoje
> ainda não terminou. Rotas novas: `GET/POST /v1/suporte`,
> `POST /v1/suporte/:id/editar`, `POST /v1/suporte/:id/revogar`. 10 testes
> novos na rota, mais um round-trip real (criar → listar → editar →
> revogar). **Não muda Feito/Total** — a linha já estava contada (e
> incorretamente marcada "✅ Trazido") em Epic 17.
>
> **Os três achados do Juan de hoje (Lançar ponto, Editar colaborador,
> Suporte de Sistema) estão fechados** — nenhuma tela do app fica mais
> quebrada contra a API de verdade por causa de método nunca ligado.
> `painelDoWhatsApp` (achado na varredura, não reportado pelo Juan) segue
> como `AindaNaoNaApi` — não investigado ainda, pode ser a mesma categoria
> de gap ou pode não ter tela correspondente; fica pra conferir depois.

## Bloqueado, esperando o Juan

> **14/09/2026 — os três decididos.** Prazo de 12/10 agora é pro backlog
> inteiro (não só o MVP), então valia a pena resolver os três de vez:
>
> - **Conta Apple Developer** → **correção em 21/09/2026 à noite: o que
>   existe é só um Apple ID comum, não o Developer Program pago (US$
>   99/ano)**. A entrada de baixo dizia "criada, confirmado em 21/09" — o
>   Juan tinha um Apple ID, não a assinatura paga, que é o que realmente
>   libera push e App Store. Perguntado direto, ele decidiu **deixar pra
>   depois** — segue sem iOS por enquanto, só Android.
> - ~~Recuperação de conta~~ → **já estava resolvida quando isto foi
>   escrito, e ninguém tinha voltado aqui pra fechar o item.** `corrigirTelefone`
>   (ficha da pessoa, Epic 10, construído no mesmo dia 14/09) é exatamente o
>   fluxo decidido: suporte troca o telefone vinculado ao CPF manualmente,
>   sem autoatendimento. Fechado em 21/09, sem task nova — já estava contado
>   dentro da Epic 10.
> - ~~Banco de homologação~~ → decidido rodar as migrações direto em
>   produção, com cuidado — backup e plano de rollback de cada uma
>   revisado com o Juan antes de rodar, fora de horário de evento ao
>   vivo. **001 (pessoas permanentes) e 003 (dois relógios) rodadas pelo
>   Juan em 22/09/2026** — ver achado de 22/09 abaixo. 006 (tokens de
>   push) já tinha rodado em 21/09.

- ~~Projeto Firebase (Android)~~ → **feito em 21/09/2026, guiado passo a passo com o Juan.** Projeto "Credenciei" criado no Firebase, app Android cadastrado (`com.produzimos.credenciei`), `google-services.json` no lugar (`apps/app/google-services.json`, referenciado em `app.json`), conta Expo criada, projeto ligado ao EAS (`eas init`), e a chave de conta de serviço do Firebase enviada pro EAS via `eas credentials` (FCM V1) — o Android já está pronto pra RECEBER notificação por push assim que o app tiver o código de ENVIAR uma (ver "Modelo de notificação" abaixo). A chave de serviço (`firebase-adminsdk.json`) fica só na máquina do Juan, nunca commitada — `.gitignore` atualizado pra isso.
- **Chave APNs e App Id (iOS)** → segue bloqueado, agora por decisão explícita: sem o Apple Developer Program pago (US$ 99/ano) não dá pra gerar nem uma coisa nem outra. Juan decidiu deixar pra depois (21/09) — Android segue sem depender disso.
- ~~Modelo de notificação~~ → **decidido em 21/09/2026: os dois** (lembretes automáticos, reaproveitando as regras que o site já usa, e o mural "Avisos", que ainda não existe no app). Primeiro lembrete (`lembrete_entrada`) já construído — ver o achado de 21/09 acima.
- ~~Rodar a migração 008~~ → **feito pelo Juan em 21/09.**
- **Configurar um agendador externo** (cron-job.org, mesma ferramenta já cotada pra retenção de foto) batendo nas seis rotas de tempos em tempos (sugestão: a cada 15-30 min) — sem isso, os lembretes existem no código mas nunca disparam sozinhos: `POST /manutencao/lembrete-entrada`, `/lembrete-saida`, `/lembrete-meio`, `/alerta-supervisor-entrada`, `/alerta-supervisor-saida`, `/aviso-do-dia`.
- **Decidir os três itens parados do push** (`confirmacao_escala`, `boas_vindas_funcionario`, `disparo_manual`) — ver o achado de 21/09 acima, cada um tem um motivo diferente pra não ter entrado ainda.
- **Rodar a migração 010** (`app_notificacoes`/`app_preferencias_de_aviso`) — aditiva e segura, sem pressa, mesma régua das outras.
- **Ainda falta a tela no app** pro mural "Avisos" (modal na credencial/painel), pra Central de Avisos (histórico + preferências) e pro módulo Gastos inteiro (captura manual/voz, lista, painel) — backend pronto e testado nos três, mas ninguém vê nada ainda sem a interface.
- ~~Suporte de Sistema quebrado contra a API de verdade~~ → **construído em 22/09/2026, escopo fino igual ao site** — ver achado acima.
- **Configurar `GEMINI_API_KEY` no Render** (mesma variável que o site já usa pro Gastos por voz) — sem ela, `transcreverAudioDeGasto` responde com um erro amigável ("leitura de áudio ainda não foi configurada"), mas ninguém consegue lançar gasto falando até essa chave existir no ambiente da API do app.
