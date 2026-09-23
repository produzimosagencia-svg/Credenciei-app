# Credenciei Web — regras de negócio centrais (22/09/2026)

Referência de como o site (`c:\Dev\credenciei`) decide fase de evento, valida
QR, registra ponto e trata os casos de borda. Escrito pra quem reimplementa
essa lógica no app — cada seção tem os bugs históricos já corrigidos no site,
porque reimplementar do zero corre o risco de reintroduzir exatamente o
mesmo bug. Citações são `arquivo:linha` do repo do site.

Ver também: [credenciei-web-permissoes-autenticacao.md](credenciei-web-permissoes-autenticacao.md),
[credenciei-web-modulos.md](credenciei-web-modulos.md),
[credenciei-web-funcoes-integracoes.md](credenciei-web-funcoes-integracoes.md).

---

## 1 · Janelas de horário e fases do evento — `lib/janelas.ts`

### 1.1 Modelo de dias

Um evento tem dois tipos de dia, decididos pela tabela `jornada_dias` (uma
linha por data de trabalho):

- **DIA PRINCIPAL** (`tipo: 'principal'`): o dia do evento em si. Entrada/
  meio/saída seguem os horários configurados em `eventos.janela_*`.
- **DIAS DE PREPARAÇÃO** (`tipo: 'preparacao'`): montagem/desmontagem.
  Entrada e saída são **livres** (a pessoa bate quando de fato chega/sai);
  o meio é **individual** = entrada real da pessoa + 4h.

**Pegadinha crítica**: dia que não existe em `jornada_dias` NÃO é dia de
trabalho — a batida é recusada (`avaliarEntradaSaida`, janelas.ts:211-216:
"não está marcado como dia de trabalho deste evento"). Proposital: sustenta
o relatório "estava escalado para 5 dias e veio em 4". Um app que criar sua
própria noção de "dia do evento" sem consultar `jornada_dias` vai divergir.

### 1.2 Constantes-chave

- `HORAS_ATE_MEIO = 4` — distância entre entrada real e abertura do meio.
- `DURACAO_JANELA_MEIO_H = 2` — duração da janela do meio (cobre o
  intervalo de almoço; nem instantâneo (injusto) nem infinito (perde a
  função)).
- `TETO_TURNO_H = 18` — teto para considerar uma entrada "ainda em aberto"
  ao decidir a que dia pertence uma saída. Cobre o turno que vira
  madrugada. É usado como filtro de consulta no banco
  (`entradaDoTurno`, actions.ts:3033-3050), não é só documentação.

### 1.3 Dia civil em BRT

`diaBRT()` calcula o dia em Brasília subtraindo 3h (`OFFSET_BRT_MS`) em vez
de usar `toLocaleDateString`, porque o servidor roda em UTC (Vercel) — às
22h de Brasília já é o dia seguinte lá. **Pegadinha para o app**: se o
backend/app rodar em outro fuso ou usar bibliotecas de data com DST,
replicar exatamente esse offset fixo de -3h (Brasil não tem mais horário
de verão, então é seguro fixar).

### 1.4 Dia principal e período do evento

- `periodoDoEvento`: evento sem `data_fim` (ou com fim antes do início)
  vale por 1 dia só.
- `ehDiaPrincipal`: dia principal = `diaBRT(evento.data_inicio)`. É o único
  dia com portaria/janela configurada.

### 1.5 Janela do meio — SEMPRE individual

`janelaDoMeio()`/`janelaMeio()`: a janela do meio é **sempre** entrada real
+ 4h, **inclusive no dia principal**. O produtor não configura horário de
meio em lugar nenhum. Motivo: no estádio a equipe não entra junta; um
horário fixo para todos cobraria a selfie de quem chegou às 15h no mesmo
instante que cobra de quem chegou às 11h. Retorna `null` se a pessoa ainda
não bateu entrada.

### 1.6 Avaliação de entrada/saída

`dentroDaJanela()`: sem `inicio`/`fim` configurado = sem trava (`ok: true`).

`avaliarEntradaSaida()` — ordem de decisão:
1. Dia não é dia de trabalho (`!dia`) → recusa.
2. Dia cancelado → recusa.
3. Dia de preparação (`tipo !== 'principal'`) → **sempre livre**.
4. `evento.batida_livre === true` → também livre (reusa o mesmo caminho
   dos dias de preparação "para os dois nunca divergirem").
5. Caso contrário → checa contra `janela_{entrada|fim}_{inicio|fim}`.

### 1.7 Horários ESPERADOS vs. o que trava

Não bloqueia nada — alimenta listas de pendência/lembretes.
`LIMITE_PADRAO_ENTRADA = '12:00'`, `LIMITE_PADRAO_SAIDA = '23:59'`,
`ENTRADA_PADRAO = '08:00'`. `horariosEsperados()` calcula `meioAlerta` como
entrada esperada + 6h — quando cobrar o meio do setor nas listas do
supervisor.

`batida_livre` (booleano) NÃO muda o que se espera de horário — a pessoa
pode bater a qualquer hora mas continua "esperada" no horário combinado
(aparece como atrasada nas listas).

### 1.8 Fases da operação

`FaseDoDia = 'montagem' | 'evento' | 'desmontagem'`.

`faseDoDia(dia, diaPrincipal)`: corte é o **dia do evento**, não
`data_fim` — qualquer dia depois do dia principal já é desmontagem, mesmo
que o evento termine tecnicamente na madrugada seguinte. Usado para
comunicação (avisos diários).

`faseAtualDoQR(agora, dataInicio, dataFim)` — **DIFERENTE de `faseDoDia`,
diferença essencial**: se o evento atravessa a meia-noite, a fase "evento"
continua valendo (para fins de QR) até `agora <= data_fim`, mesmo que já
seja o dia civil seguinte. A comunicação diária pode dizer "amanhã é
desmonte", mas o crachá do dia do evento continua válido até o horário
real de término. **Um app que usar `faseDoDia` para decidir a validade do
QR (em vez de `faseAtualDoQR`) vai recusar QRs válidos de eventos que
viram a noite.**

`HORA_AVISO_DIA = '07:00'` — hora de disparo do aviso diário em
montagem/desmontagem.

### 1.9 Liberação visual do QR

`liberacaoDoQR(evento, dia, agora, toleranciaMin=15)`: decide quando o QR
deve **aparecer** na tela (embaçado antes disso). Motivo: um print do QR
pode circular no WhatsApp dias antes; amarrar a liberação ao horário
encolhe a janela útil daquela imagem aos minutos em que a pessoa deveria
estar no portão. Só vale para entrada/saída — **o meio é selfie, não usa
QR, não passa por aqui**.

- `batida_livre === true` no dia principal → sempre liberado.
- **IMPORTANTE PARA O APP**: esta função foi ligada pela primeira vez no
  `credenciei-app` em 18/09/2026 — **no site ela nunca foi usada em
  nenhuma tela** (confirmado por grep: não aparece fora de
  `lib/janelas.ts`). É lógica pronta e testada, mas o comportamento visual
  do site não a usa; o app é quem deve consumi-la.
- Sem nenhum horário configurado → QR sempre liberado.

### 1.10 Conferência de horários configurados

`conferirHorariosDoEvento()` existe por causa de um incidente real: no
evento "Kleber Andrade" a saída ficou marcada 01:30–08:00 do dia 5, quando
o show começava 18:30 do dia 5 e a equipe só saía na madrugada do dia 6 —
os horários pareciam razoáveis isoladamente, mas o DIA estava errado. Só
apareceria na madrugada do evento, com mil pessoas tentando sair e sendo
recusadas. Separa **bloqueio** (`bloqueia: true`, impede salvar) de
**alerta** (`bloqueia: false`) de propósito — bloquear o "estranho mas
possível" transformaria a conferência em obstáculo a ser contornado.

---

## 2 · QR Code e credencial — `lib/credencial-qr.ts`

### 2.1 Um QR por ETAPA, não por dia

Dentro de uma etapa (montagem/principal/desmontagem) o código é **o mesmo
todos os dias** daquela etapa. O que muda o código é virar de etapa. Isso
separa deliberadamente o crachá do dia do evento (com portaria e cliente
na frente) do crachá de montagem: um QR de montagem no dia do evento é
recusado, e vice-versa.

**O que isso NÃO resolve, por design**: emprestar o crachá DENTRO da mesma
etapa é possível (print de segunda vale na quarta, na montagem). É
consequência aceita, não bug — no dia principal a exposição é curta (1 dia
só). A defesa complementar é humana: o scanner mostra nome/função de quem
está sendo lido.

### 2.2 Formatos de código (versões)

- `c1` — cru, sem assinatura. **Nunca mais aceito.**
- `c2` (`PREFIXO_LEGADO`) — HMAC amarrado ao **DIA**. Ainda aceito, só
  para compatibilidade transitória.
- `c3` (`PREFIXO`) — **formato atual**, HMAC-SHA256 amarrado à **ETAPA**.
  `assinar(token, sigla) = HMAC-SHA256(chave, "c3.<token>.<sigla>").base64url.slice(0,16)`.
- `c4` (`PREFIXO_ED25519`) — assinatura Ed25519 (chave assimétrica)
  cobrindo etapa + **janela de tempo giratória**. Documentado no ADR
  [009-qr-offline-ed25519.md](decisoes/009-qr-offline-ed25519.md):
  motivado por locais com internet ruim, onde o scanner do portão precisa
  validar offline. HMAC simétrico não pode ir para o aparelho do operador
  (quem extraísse o segredo forjaria qualquer crachá); Ed25519 permite
  distribuir só a chave PÚBLICA para conferência offline. **Ainda não é
  gerado pelo site nem pelo app** — só é **aceito** por ambos (fase 2 do
  ADR; gerar é fase 3). Intencional: os dois sistemas devem estar prontos
  para ACEITAR antes de qualquer um GERAR, nunca o contrário.

### 2.3 Código giratório (`c4`) — janela de 2 minutos

`JANELA_MS = 2 * 60_000`. `janelasAceitas(agora)` aceita a janela atual E
a anterior (~4 min de folga). **Os dois sistemas (site e app) têm que
concordar exatamente nesse valor** — acoplamento direto, documentado no
próprio código do site.

### 2.4 Chave de assinatura

Deriva de `CREDENCIAL_SEGREDO` (se definido) ou `SUPABASE_SERVICE_ROLE_KEY`
como fallback — nunca chega ao navegador. Rotacionar `CREDENCIAL_SEGREDO`
invalida **todos** os códigos HMAC em circulação instantaneamente.

### 2.5 Leitura e validação (`lerCodigoQR`)

Aceita os 3 formatos simultaneamente, inferindo pelo prefixo. Retorna
`{ ok, token, fase }` — `fase: null` significa QR c2 (antigo, amarrado ao
dia, não à etapa).

- **c4**: valida sigla, chave pública Ed25519 (via
  `CHAVE_PUBLICA_QR_ED25519` — se ausente, recusa mesmo com assinatura
  válida), janela dentro de `janelasAceitas`, e a assinatura.
- **c3**: valida sigla e HMAC.
- **c2**: valida HMAC amarrado ao dia, e **também compara a data contra o
  dia de hoje** — um c2 de segunda não passa no dia do evento. Mantido
  vivo pra não derrubar quem está com a credencial já aberta na tela no
  momento do deploy da mudança para c3.
- Todas as comparações de assinatura usam `timingSafeEqual` — proteção
  contra timing attack.

### 2.6 Conferência de etapa (`faseConfere`)

Depois de ler o código, quem chama (site) confere se `leitura.fase` bate
com a fase de HOJE daquele evento específico (`faseAtualDoQR`) — a leitura
em si só confirma "este código saiu deste sistema e para qual etapa", não
se serve para hoje. Mensagem de erro nomeia as duas etapas (não diz
genericamente "QR inválido"), porque a recusa por etapa exige decisão
humana no portão — oferece conferência por CPF como saída.

### 2.7 QR fixo de portaria vs. QR do colaborador

Conceitos distintos:
- **QR do colaborador** (`gerarCodigoQR`/`obterQRDoFuncionario`,
  actions.ts:4788-4821): amarrado ao `qr_token` do funcionário, muda de
  conteúdo conforme a fase.
- **QR fixo da portaria** (`token_portaria` em `eventos`,
  `alternarPortaria`, actions.ts:5409-5426): token fixo por evento (não
  HMAC do credencial-qr.ts), gerado uma vez e reaproveitado entre
  liga/desliga. Serve para identificar quem chega sem cadastro
  (`identificarNaPortaria`) e como prova de presença física quando
  escaneado em `registrarPresencaLivre` (`tokenDoLocal`, ver §3.9c).
  `trocarTokenDaPortaria` invalida todo cartaz impresso — usado quando o
  QR vaza.

---

## 3 · Registro de presença/ponto — `lib/actions.ts` (~3000–4350)

### 3.1 Carência de saída

`CARENCIA_SAIDA_MIN = 5` — só se aplica ao **scanner** (`inferirMomentoQR`).
Registro assistido e lançamento manual **não passam por essa carência de
propósito**: são conscientes, e o manual existe justamente para consertar
o que o portão errou.

### 3.2 `entradaDoTurno`

Busca a última entrada dentro de `TETO_TURNO_H` (18h) para aquele
funcionário/evento. É a "âncora" do turno atual — dela deriva o dia
(`data_ref`) da saída e a janela do meio.

### 3.3 `inferirMomentoQR` — decide sozinho entrada/meio/saída

Desde 03/09/2026 a pessoa/operador **não escolhe mais o botão** — o
sistema decide pela ordem de leitura:
1. Existe turno aberto (entrada sem saída, dentro de 18h)? → é **SAÍDA**.
   Exceto se a entrada foi há menos de `CARENCIA_SAIDA_MIN` (5 min) →
   recusa com aviso ("acabou de registrar a ENTRADA, aguarde N min").
2. Sem turno aberto: já existe entrada E saída **com data_ref de HOJE**? →
   **REABERTURA** (§3.4), a menos que a saída tenha sido há menos de 5 min
   (mesma carência).
3. Caso contrário → **ENTRADA**.

**Bug histórico corrigido**: a primeira versão checava só "o turno atual
(janela de 18h) já tem saída?" — só que 18h atrás alcança a TARDE DE
ONTEM. Quem entrou 17h e saiu 20h ontem, chegando hoje de manhã, era
recusado com "já registrou entrada e saída hoje" — parou a portaria numa
manhã de montagem. Correção: primeiro perguntar pelo turno ABERTO, só
depois pelo par completo de HOJE.

**Segundo bug histórico**: quem "dobra o turno" (sai de manhã, volta à
noite, sai de novo de madrugada) tem DUAS saídas no mesmo `data_ref`.
Perguntar só "existe saída neste dia?" acharia a saída da manhã e
concluiria erroneamente que o turno da noite está fechado. Correção: só
uma saída **posterior à entrada em aberto** conta como fechamento daquele
turno.

### 3.4 Reabertura de turno

Como o banco tem índice único `registros_unico_por_dia` (funcionário,
evento, tipo, data_ref), não é possível ter duas entradas no mesmo dia.
Quem sai e volta no mesmo dia:
- A saída anterior daquele dia é **APAGADA** — a entrada original é
  preservada.
- O turno fica "reaberto"; a próxima leitura vira a saída final.
- **O que se perde**: o intervalo de dois blocos — o relatório mostra
  08:00→20:00, não os dois períodos separados. Decisão consciente do
  Juan (05/09/2026); a versão completa (múltiplos turnos por dia) exigiria
  trocar o índice único e reescrever as leituras do sistema inteiro.
- **Auditoria**: cada reabertura gera `REABERTURA_TURNO` — a saída apagada
  não some, fica na Auditoria, não mais em `registros`.
- Não passa por `resolverRegistro` — não há janela de horário a validar.

### 3.5 `resolverRegistro` — onde o registro cai e se pode ser feito

Responde 3 perguntas: (1) a etapa está liberada agora? (2) a que
`data_ref` pertence? (3) já existe essa etapa nesse dia (idempotência)?

- `data_ref` é herdado da entrada em aberto quando `momento !== 'entrada'`
  — é isso que faz o turno de madrugada fechar no dia certo.
- **Meio**: abre (`janelaDoMeio`), mas **NUNCA FECHA** — fechar faria quem
  chegasse atrasado perder a chance de vez, e "a saída não depende mais
  do meio". O horário exato de abertura NÃO é revelado na mensagem de
  erro, para não ensinar a burlar.
- **Saída NÃO exige mais o meio** — chegou a existir essa trava, mas
  travava quem mais precisava sair (quem perdeu o meio ficava preso até
  um supervisor destravar). A ausência do meio continua VISÍVEL
  (`justificativa` no histórico/pendências), só deixou de IMPEDIR.
- Idempotência: se já existe registro daquela etapa/dia, devolve `jaEm`
  (o timestamp existente) em vez de sobrescrever.

### 3.6 `upsertRegistro`

`DELETE` (por funcionário+evento+tipo+data_ref) seguido de `INSERT`.
Escopo do delete é **por DIA**, não por evento inteiro (antes um evento de
30 dias fazia o dia 2 apagar o dia 1). O QR não passa duas vezes pelo
mesmo dia aqui — a duplicata é recusada antes em `resolverRegistro`. O
delete-e-reinsere serve ao **registro assistido**, onde o supervisor
corrige de propósito.

### 3.7 `diaDeReferencia` — usado fora da janela (assistido/manual)

Mesma regra de qual dia herdar, com uma trava adicional, corrigindo um
**bug histórico grave com impacto real**: faltavam duas travas, e quem
trabalhou ontem à noite e teve a ENTRADA de hoje lançada via registro
assistido recebia `data_ref` de ONTEM (porque a entrada de ontem ainda
estava dentro das 18h do teto). Como `upsertRegistro` apaga a linha
daquela chave antes de inserir, **a entrada de ontem foi destruída e
substituída pelo horário de hoje** — ficha mostrando "entrada 03/09
08:07, saída 02/09 20:12" (cronologicamente impossível). Duas pessoas
afetadas antes da correção:
1. **ENTRADA nunca herda dia de turno nenhum** — sempre abre hoje.
2. **Turno com saída é turno FECHADO** — não manda mais no dia de hoje (só
   um turno AINDA ABERTO puxa o registro para o dia dele).

**Crítico para o app**: qualquer reimplementação de "a que dia pertence
esta batida" precisa replicar exatamente essas duas regras, senão
reintroduz o mesmo bug de corrupção de dado histórico.

### 3.8 Ausência de meio na saída

`observacaoSemMeio()`: se não existe registro `meio` para aquele
`data_ref`, grava `justificativa = 'Saída registrada sem registro de
meio.'` no registro de saída.

### 3.9 Presença híbrida — os 3 canais de registro

**a) `registrarPresencaQR`** (scanner do operador) — QR → `lerCodigoQR` →
`faseConfere` → permissão de escanear → busca funcionário por `qr_token`
→ confere pertencimento ao evento, `ativo`, não descredenciado, CPF não
bloqueado (supervisor só escaneia o próprio setor) → `inferirMomentoQR` →
reabertura (§3.4) ou `resolverRegistro` → grava.
- Segunda leitura do mesmo QR no mesmo dia **retorna sucesso**
  (`jaRegistrado: true`), não erro — do ponto de vista do portão a
  pessoa está credenciada; pintar de vermelho faria o operador chamá-la
  de volta.
- **Saída no dia principal descredencia automaticamente** — só no dia
  principal; nos dias de preparação a pessoa sai e volta no dia seguinte.

**b) `registrarPresencaFoto`** (selfie do meio, página pública da
credencial) — exclusivo da etapa MEIO.
- **Localização deixou de ser obrigatória**: era exigida como prova, mas
  na prática 13 de 13 meios do histórico eram feitos por supervisor
  (registro assistido), zero pelo próprio funcionário — o navegador
  embutido do WhatsApp (por onde o link chega) não responde ao pedido de
  GPS (a câmera funciona, o GPS não). Exigir GPS produzia MENOS prova
  real, não mais. Hoje: foto + horário são a prova base; sem GPS o
  registro é marcado com `justificativa` em vez de recusado.
- A selfie do meio vira foto de perfil automaticamente SE
  `foto_perfil_path` estiver vazio — nunca sobrescreve, só a primeira vez.

**c) `registrarPresencaLivre`** (auto-atendimento entrada/saída) — sem
foto de propósito (é a foto que trava a câmera em navegador embutido
quebrado).
- **SAÍDA livre está DESLIGADA por decisão de produto, não limitação
  técnica**: "não tá mapeado, não tá estudado como a gente pode fazer na
  prática" — risco de alguém sair sem confirmação real. Recusa
  `momento === 'fim'` incondicionalmente logo no topo. Reversível
  removendo só esse bloco (e o equivalente em `CheckinPresenca.tsx`).
- Sempre disponível fora do dia principal. **No dia principal, só
  funciona se `evento.checkin_autonomo === true`** (ver §7).
- `tokenDoLocal` opcional: escanear o cartaz da portaria em vez de só
  tocar o botão é prova mais forte, checada contra `evento.token_portaria`.

---

## 4 · Registro assistido — `app/admin/localizar/*` + `lib/actions.ts`

### 4.1 `localizarFuncionario`

Busca por CPF **ou** nome. CPF é detectado heuristicamente (majoritariamente
dígitos). Nome não usa `ilike` (ignora acentos de forma inconsistente) —
carrega tudo paginado (teto 10.000) e compara via normalização sem acento
em memória; CPF é filtrado no banco (exato). Escopo: supervisor só o
próprio setor; admin só a própria organização; master tudo; suporte pelo
escopo — busca só em **eventos ativos**.

### 4.2 Escolha manual da etapa

`registrarPresencaAssistida` deixou de decidir sozinho a etapa. **A pedido
do Juan, quem escolhe é o operador**: sem QR na hora, pode ser entrada,
meio OU saída que falta, e às vezes o "próximo calculado" não é o que de
fato aconteceu.
- **Sobrescrever uma etapa já registrada é permitido e tratado como
  correção deliberada, não erro** — a UI avisa: "confirmar substitui o
  horário anterior por agora."
- **Não valida janela de horário de propósito** — existe justamente para
  quando a janela já fechou; o que sustenta a confiança é a auditoria
  (autor, foto, GPS, aparelho, motivo), não o horário.
- **Foto do rosto é obrigatória** (prova de presença).
- Auditoria: `REGISTRO_ENTRADA_ASSISTIDA` / `REGISTRO_SAIDA_ASSISTIDA` /
  `CORRECAO_PONTO` (meio), com GPS quando disponível.

### 4.3 `lancarPontoManual` — parente, mas diferente

Diferença conceitual: registro assistido acontece COM a pessoa na frente
(exige foto, grava a hora ATUAL); lançamento manual acontece DEPOIS, na
mesa, com hora escolhida no passado (foto é impossível). Motivado por um
caso real: 13 pessoas cujo ponto só pôde ser corrigido via script direto
no banco (01/09/2026).
- Permissão mais ampla: gestor de eventos, supervisor OU suporte.
- Exige `motivo` com >= 5 caracteres (a prova aqui é a trilha escrita).
- **Dois campos de propósito distintos**: `dataRef` (dia de trabalho a
  que a batida pertence — o que o fechamento/pagamento conta) vs.
  `quandoLocal`/`created_at` (o instante real). Ex.: trabalhou dia 05,
  bateu saída 02h do dia 06 → `dataRef='05'`, `created_at` = 06 02:00.
  Colapsar os dois campos jogaria a batida para o dia errado no
  fechamento.
- Rede de sanidade (não regra de negócio): a hora só pode estar entre
  -12h e +36h do início do `dataRef` — protege contra dedo escorregado.

### 4.4 `apagarBatida` — remove de vez

Diferente de lançar (que sobrescreve/soma): apaga a linha de `registros`
inteiramente. Caso motivador: entrada e saída no MESMO minuto — mudar a
hora não resolveria, a linha precisa sumir. **Permissão MAIS restrita**:
só master e suporte. Exige motivo >= 5 caracteres. A linha some de
`registros`, mas etapa/horário/dia/motivo ficam em `alteracoes_cadastro`
(auditoria).

---

## 5 · Busca de CPF com tolerância a erro de digitação

`distanciaEntreCpfs` (actions.ts:4731-4736): distância de Hamming simples
— conta quantos dos 11 dígitos diferem (retorna `Infinity` se algum não
tiver exatamente 11 dígitos). **Não é Levenshtein** — não lida com dígito
a mais/a menos ou transposição, só substituição posição-a-posição.

Só é acionada como fallback: (a) o termo parece CPF completo (11
dígitos), (b) a busca **exata** não encontrou nada visível no escopo do
usuário. Carrega TODOS os funcionários de eventos ativos e filtra por
`distanciaEntreCpfs(...) <= 2`, aplicando de novo o filtro de
escopo/permissão.
- **Nunca escolhe automaticamente**, mesmo com um único resultado —
  sempre retorna como `candidatos` com `cpfAproximado: true`, exigindo
  confirmação visual (nome, CPF salvo, setor, evento).
- Motivo: "rede de segurança para CPF digitado errado NO CADASTRO" — o
  documento na mão do operador está certo, mas a linha gravada tem um
  dígito trocado.

---

## 6 · Bloqueio de CPF — escopo por EVENTO

Tabela `cpfs_bloqueados` com `evento_id` + `cpf` + `fornecedor_id`
(nullable, mas `bloquearCpf` sempre grava `null`). **Bloqueio é sempre do
evento inteiro**:
- Motivo do escopo ser o evento, não o setor: sem isso, a pessoa barrada
  num setor se cadastraria no setor ao lado.
- Motivo do escopo NÃO ser global: a pessoa continua livre para se
  cadastrar em QUALQUER OUTRO evento da plataforma — "bloquear alguém de
  trabalhar em qualquer lugar é outra decisão, de outra pessoa".

**O que impede** (checado em dois pontos): cadastro pelo link público
(mensagem não revela o motivo — "não é possível concluir o cadastro neste
setor") e leitura de QR no portão (mensagem explícita pro OPERADOR: "não
libere a entrada").

**O que preserva**: `descredenciarFuncionario` NÃO apaga ninguém — mantém
histórico de batidas, veículos, base geral por CPF. Excluir de verdade
cascateia e destrói tudo sem chance de desfazer.

**Fail-open deliberado**: `cpfEstaBloqueado` engole erro de consulta (ex.:
tabela ainda não existe) e retorna `false` — "sem isso, o dia em que a
migração não tivesse rodado o sistema recusaria TODO MUNDO no portão".
Importante para o app replicar o mesmo comportamento de degradação.

---

## 7 · Batida livre e auto-atendimento — flags em `eventos`

### 7.1 `batida_livre`

Faz o **dia principal se comportar como dia de preparação** para fins de
janela de entrada/saída — sem horário fixo. Também libera sempre o QR
visualmente no dia principal. Caso de uso: shows com escala rotativa, onde
uma janela fixa recusaria quem chega às 3h da manhã.
- **NÃO muda o que se espera** — os horários configurados continuam
  valendo como referência (quem está atrasado nas listas).
- **NÃO afeta quem pode registrar** — continua exigindo QR lido por
  operador, a menos que `checkin_autonomo` também esteja ligado.

### 7.2 `checkin_autonomo`

No DIA PRINCIPAL, permite que a própria pessoa registre entrada/saída
pelo celular via `registrarPresencaLivre`, sem operador. Fora do dia
principal, esse caminho **já é sempre permitido**, independente da flag.
- **Independente de `batida_livre`** — dois eixos ortogonais:
  `batida_livre` = trava de horário; `checkin_autonomo` = quem pode
  registrar (operador vs. autoatendimento).
- Checagem é **no servidor**, não só escondendo o botão — chamada direta
  à action é igualmente bloqueada.
- Mesmo ligado, a **saída** autônoma continua bloqueada globalmente pela
  trava de "saída livre desligada" (§3.9c) — as duas travas são
  independentes e ambas precisam estar OK.

---

## 8 · Outras regras não óbvias

### 8.1 Anti-duplicidade por EVENTO, não por empresa

O mesmo CPF não pode se cadastrar em duas empresas/funções do **mesmo
evento**. Se tentar de novo no MESMO setor, devolve a credencial já
existente silenciosamente. Em setores/eventos DIFERENTES, mesmo no mesmo
dia, o cadastro é livre — "freelancer escolhe onde vai trabalhar".

### 8.2 Base central de CPFs (`buscarCadastroPorCpf`)

Pré-preenche o formulário público consultando primeiro a própria
organização, depois (se não achar) a base CENTRAL do Credenciei inteiro —
"um cliente novo já 'conhece' a equipe dele no primeiro evento". Superfície
pública sensível: sem sessão, recebe CPF e devolve nome/telefone/PIX —
contenções: rate limit por token de formulário (40/hora), a resposta nunca
inclui CPF/histórico/valores/eventos, prioridade à própria organização.
(Ver também o módulo maior "Encontrar colaborador" em
[credenciei-web-modulos.md](credenciei-web-modulos.md) §12 — evolução
master-only desta mesma ideia.)

### 8.3 `garantirDiaPrincipal` — auto-cura de dado

Se o dia principal não existir em `jornada_dias` na hora de alguém bater
ponto, o sistema materializa a linha ali mesmo, no caminho de falha, em
vez de recusar — "a pessoa está no portão agora, com o QR na mão." Só
vale para a data exata do evento. Também chamado ao editar a data do
evento: o dia principal antigo vira `preparacao` (preserva batidas já
feitas), o novo vira `principal`.

### 8.4 Cadastro público revalida no servidor

Cidade (mín. 2 caracteres) e consentimento (`=== true`) são revalidados na
action, porque `required` do HTML "some com qualquer chamada direta".
Cidade alimenta a busca regional; cadastro sem cidade nunca aparece em
busca nenhuma. Consentimento é questão de LGPD (finalidade diferente:
"trabalhar NESTE evento" vs. "guardar para recrutamento futuro").

### 8.5 Exceção individual de cadastro

Quando o cadastro por link do evento/setor está suspenso, existe exceção
temporária (48h) exclusiva do MASTER, amarrada a um evento+setor
específico — exceção deliberada à decisão da organização de fechar a
lista; um admin da própria organização não pode concedê-la.

### 8.6 Configuração do meio por setor × dia — NÃO é enforced no servidor

`ConfiguracaoDoMeio`/`setoresComMeio`/`diasComMeio` decidem **se o botão
do meio aparece** na credencial pública. **Confirmado por busca no
código**: nem `resolverRegistro` nem `registrarPresencaFoto` checam essas
flags no servidor antes de gravar um registro de tipo `meio`. **Pegadinha
real para o app**: se o app expõe uma rota equivalente a
`registrarPresencaFoto` sem replicar essa checagem, alguém pode registrar
o meio mesmo em setor/dia que não o exige — o site apenas não oferece o
botão na tela, mas a action aceitaria a chamada.
- Padrões inversos entre as duas colunas: setor sem coluna = não exige
  (padrão novo); dia sem coluna = exige (padrão retrocompatível). Nunca
  fazer JOIN nessas colunas — pedir coluna inexistente no
  Supabase/PostgREST derruba a consulta INTEIRA (já aconteceu em
  produção: tela do evento mostrou "nenhum fornecedor ainda" com 33
  setores e 387 pessoas intactos no banco).

### 8.7 Rate limiting em todas as superfícies públicas

`registrarPresencaFoto` (20/10min por token), `registrarPresencaLivre`
(20/10min por token), `cadastrarFuncionarioPublico` (60/hora por setor),
`buscarCadastroPorCpf` (40/hora por token de formulário — não por IP,
porque "IP em serverless atrás de CDN não é confiável"),
`identificarNaPortaria` (60/hora por evento). Todas usam uma chave
estável (token) em vez de IP.

---

## Metodologia

Investigação read-only em 22/09/2026, arquivos lidos por inteiro:
`lib/janelas.ts`, `lib/credencial-qr.ts`, `lib/meio.ts`,
`app/admin/localizar/LocalizarFuncionario.tsx`; trechos integrais de
`lib/actions.ts` (linhas 1-100, 3000-5700). Nenhum arquivo do site foi
alterado.
