// O que a API precisa saber buscar e gravar.
//
// ─── POR QUE UMA INTERFACE, E NÃO SUPABASE DIRETO ───────────────────────────
//
// Duas razões, e a segunda é a que pesa.
//
// A primeira é teste: com uma interface, a API inteira roda contra um
// repositório em memória. Sem ela, testar qualquer endpoint exigiria um banco
// de verdade — e o único banco que existe hoje é o de produção, com dados de
// pessoas reais e um evento marcado para daqui a uma semana. Escrever teste
// contra ele está fora de questão.
//
// A segunda é a migração. O modelo de dados vai mudar: hoje `funcionarios` é
// pessoa-dentro-de-setor-de-evento, e precisa virar `pessoas` (permanente) e
// `participacoes` (do evento). Com a interface no meio, essa troca acontece em
// UM arquivo — a implementação — e nenhum endpoint muda. Sem ela, a mudança
// tocaria cada consulta espalhada pela API.
//
// Os nomes aqui já são os do modelo NOVO. A implementação sobre o banco atual
// traduz; quando o banco migrar, a tradução some e o resto continua igual.

import type { Papel } from '@credenciei/dominio'

export type Pessoa = {
  id: string
  nome: string
  cpf: string
  telefone: string | null
  fotoPath: string | null
}

/**
 * Quem tem conta de painel — master, admin, gerente, cliente ou supervisor.
 *
 * `id` é o mesmo id do Supabase Auth (`perfis.id`), não um id à parte: é por
 * ele que a senha já foi conferida antes de chegar aqui. Este tipo não
 * carrega senha nenhuma — a senha nunca sai do Supabase Auth, que já a
 * verificou antes de `perfilPorId` ser chamado.
 */
export type Perfil = {
  id: string
  nome: string
  papel: Papel
  /** Null para o master: ele não pertence a organização nenhuma. */
  organizacaoId: string | null
  /** Bloqueado no login, sem apagar. É o "Suspender acesso" das telas. */
  ativo: boolean
  /**
   * Overrides deste ACESSO especificamente — camada 1 de `capacidade()`
   * (`packages/dominio/src/permissoes.ts`). Só as chaves que DIFEREM do
   * padrão do papel entram aqui. `undefined` = nenhum override gravado.
   */
  permissoesUsuario?: Record<string, boolean>
  /**
   * Exceções que a ORGANIZAÇÃO deste perfil configurou — camada 2, chaveadas
   * por `papel:chave` (ver `chaveDaPermissao`). Já vem com a exceção da
   * PLATAFORMA (organizacaoId nulo) mesclada por baixo, a da organização por
   * cima — mesma regra do site's `excecoesDePermissao`. `undefined` = nenhuma
   * exceção carregada (trate como vazio).
   */
  permissoesOrganizacao?: Record<string, boolean>
}

/**
 * Uma linha de `permissoes_organizacao` — a exceção que uma ORGANIZAÇÃO (ou
 * a plataforma inteira, se `organizacaoId` for null) configurou pra um papel
 * numa capacidade do catálogo (`packages/dominio/src/capacidades.ts`).
 */
export type ExcecaoDePermissao = {
  /** Null = padrão da PLATAFORMA, vale pra quem não tiver regra própria. */
  organizacaoId: string | null
  papel: Papel
  chave: string
  permitido: boolean
}

export type Evento = {
  id: string
  nome: string
  descricao: string | null
  organizacaoId: string | null
  organizacaoNome: string | null
  local: string | null
  dataInicio: string | null
  dataFim: string | null
  janela_entrada_inicio: string | null
  janela_entrada_fim: string | null
  janela_fim_inicio: string | null
  janela_fim_fim: string | null
  /**
   * O dia do evento não recusa por horário.
   *
   * O nome vem com underline porque este objeto é passado direto como
   * `EventoJanelas` para o domínio — renomear aqui exigiria uma tradução no
   * meio, e é justamente a tradução que faz duas regras divergirem.
   */
  batida_livre: boolean | null
  /**
   * O QR fixo da portaria também libera entrada no dia principal, sem tirar
   * o operador de cena. Independe de `batida_livre` — ver o mesmo campo em
   * `ConfiguracaoDoEvento`, no contrato.
   */
  checkin_autonomo: boolean | null
  codigoConvite: string | null
  exigeAprovacao: boolean
  /** Encerrado não some — só para de aceitar presença nova. Ver o Painel. */
  ativo: boolean
  /**
   * Fecha o cadastro por link do evento INTEIRO de uma vez — os links dos
   * setores e o cartaz da portaria continuam os mesmos, só passam a
   * recusar. Cópia do site's `cadastro_suspenso` (`alternarCadastroPorLink`).
   * Diferente de `alternarLinkDoSetor`, que fecha só UM setor.
   *
   * Opcional pelo mesmo motivo de `Participacao.empresa`: não quebrar todo
   * fixture de teste que monta um `Evento` na mão. Ausente vale como `false`.
   */
  cadastroSuspenso?: boolean
}

/** Um evento com o que o Painel precisa contar, sem carregar o resto dele. */
export type EventoResumido = {
  id: string
  nome: string
  local: string | null
  dataInicio: string | null
  organizacaoId: string | null
  ativo: boolean
}

export type EventoComContagens = EventoResumido & {
  setores: number
  /** Quantas pessoas têm participação neste evento — ativa ou não. */
  equipe: number
  /** Quantas já bateram entrada alguma vez neste evento — pessoa distinta. */
  presentes: number
}

/** Uma batida do feed "Atividade recente" do Painel. */
export type AtividadeBruta = {
  id: string
  nomePessoa: string
  /** O nome do setor (fornecedor) de quem bateu — `null` se não achou. */
  setorNome: string | null
  tipo: 'entrada' | 'meio' | 'fim'
  em: string
}

/**
 * Uma participação candidata do registro assistido — o que sobra depois de
 * juntar pessoa + participação + evento, pronto para virar `CandidatoLocalizado`
 * ou `FichaLocalizada` no contrato, sem a rota precisar saber o schema.
 */
export type ParticipacaoParaLocalizar = {
  participacaoId: string
  pessoaId: string
  nome: string
  cpf: string
  funcao: string | null
  setorNome: string
  eventoId: string
  eventoNome: string
  ativo: boolean
  supervisorNome: string | null
}

export type Participacao = {
  id: string
  pessoaId: string
  eventoId: string
  equipeId: string
  equipeNome: string
  funcao: string | null
  supervisorNome: string | null
  ativo: boolean
  descredenciadoEm: string | null
  valorReceber: number | null
  pago: boolean
  pagoEm: string | null
  /** O token que vai dentro do QR daquela pessoa naquele evento. */
  qrToken: string
  /** Onde a pessoa mora — escrita por ela no cadastro. Usada pela busca regional. */
  cidade: string | null
  /** Quando este vínculo foi criado — a base de funcionários ordena por aqui. */
  criadoEm: string
  /**
   * Opcional para não quebrar todo fixture que monta `Participacao` na mão —
   * só a equipe do setor mostra este campo, e mesmo lá aceita faltar.
   */
  empresa?: string | null
  /**
   * A chave PIX que a própria pessoa escreveu no auto-cadastro — mesma coluna
   * `funcionarios.chave_pix` do site. Opcional pelo mesmo motivo de `empresa`:
   * só "Meu pagamento" usa este campo.
   */
  chavePix?: string | null
}

export type DiaDeTrabalho = {
  data: string
  tipo: 'principal' | 'preparacao'
  cancelado: boolean
  /**
   * Este dia pede o meio? Nasce LIGADO — é o padrão da coluna
   * `jornada_dias.exige_meio` no site: antes da migração rodar, todo dia
   * pedia o meio, e desligar por padrão silenciaria o meio do evento
   * inteiro.
   */
  exigeMeio: boolean
}

/** Uma batida de uma etapa, para as telas que só precisam do resumo. */
export type BatidaResumida = { em: string; manual: boolean }

/**
 * Uma pessoa da equipe, com o que ela fez NUM DIA — a mesma pergunta de
 * `linhasDaVisao` e `pendenciasDoDia` no site, juntas numa consulta só: as
 * duas olham a mesma equipe+dia e só filtram diferente depois.
 */
export type LinhaDoDia = {
  participacaoId: string
  nome: string
  cpf: string
  telefone: string | null
  setorId: string
  setorNome: string
  /**
   * Este SETOR pede o meio? Nasce DESLIGADO — o outro lado da mesma conta de
   * `DiaDeTrabalho.exigeMeio`: as duas chaves precisam estar ligadas para o
   * meio valer, ver `fornecedores.exige_meio` no site.
   */
  exigeMeio: boolean
  ativo: boolean
  descredenciadoEm: string | null
  entrada: BatidaResumida | null
  meio: BatidaResumida | null
  fim: BatidaResumida | null
}

export type Registro = {
  id: string
  participacaoId: string
  tipo: 'entrada' | 'meio' | 'fim'
  dataRef: string
  /** O relógio do aparelho — o que vale na folha de chamada. */
  registradoEm: string
  /** O relógio do servidor. Guardado para a divergência ficar visível. */
  recebidoEm: string
  fotoPath: string | null
  lat: number | null
  lng: number | null
  /**
   * Lançado por outra pessoa (registro assistido), e não pelo próprio QR ou
   * pela selfie do próprio colaborador. É o que a coluna "Atividades" precisa
   * para marcar a batida como manual — mesmo campo de `registro_manual` no
   * site.
   */
  manual: boolean
}

export type NovoRegistro = Omit<Registro, 'recebidoEm'> & { recebidoEm?: string }

export interface Repositorio {
  // ── Identidade ──────────────────────────────────────────────────────────
  pessoaPorTelefone(telefone: string): Promise<Pessoa | null>
  pessoaPorId(id: string): Promise<Pessoa | null>
  /** A conferência pelo CPF, no portão, resolve por aqui. */
  pessoaPorCpf(cpf: string): Promise<Pessoa | null>
  criarPessoa(p: Omit<Pessoa, 'id'>): Promise<Pessoa>
  /**
   * "Excluir minha conta" — autoatendimento do colaborador, decidido com o
   * Juan em 21/09/2026. Anonimiza nome, telefone e foto em TODOS os
   * cadastros com o mesmo CPF (a pessoa pode estar espalhada em vários
   * eventos — a migração 001, que uniria isso numa `pessoas` só, ainda não
   * rodou em produção). O CPF em si NÃO é apagado: é a chave que amarra
   * tudo isso, e apagá-la impediria achar de novo estas linhas se um dia
   * precisar (auditoria, obrigação trabalhista).
   *
   * O que NUNCA é tocado: batidas (`registros`), valor a receber e chave
   * PIX — histórico de ponto e pagamento tem que sobreviver à exclusão de
   * conta, por obrigação trabalhista (CLT), e sem a chave PIX um valor
   * ainda pendente ficaria impossível de pagar.
   */
  excluirMinhaConta(pessoaId: string): Promise<void>

  /** Quem tem conta de painel, pelo id do Supabase Auth. */
  perfilPorId(id: string): Promise<Perfil | null>

  /**
   * As exceções de capacidade vigentes para uma organização — a da
   * organização (se houver) já mesclada por cima da da plataforma. Null =
   * só a da plataforma inteira. Ver `Perfil.permissoesOrganizacao`.
   */
  excecoesDePermissao(organizacaoId: string | null): Promise<ExcecaoDePermissao[]>
  /**
   * Liga, desliga ou apaga (permitido `null` volta ao padrão do código) uma
   * capacidade de um papel — numa organização, ou na plataforma inteira
   * (organizacaoId nulo). Cópia do site's `salvarPermissao`.
   */
  salvarExcecaoDePermissao(
    organizacaoId: string | null, papel: Papel, chave: string, permitido: boolean | null,
    atualizadoPor: string,
  ): Promise<void>

  // ── Evento ──────────────────────────────────────────────────────────────
  eventoPorCodigo(codigo: string): Promise<Evento | null>
  eventoPorId(id: string): Promise<Evento | null>
  diasDoEvento(eventoId: string): Promise<DiaDeTrabalho[]>

  /** Cria o evento, e o dia principal junto — sem ele, o evento nasce inutilizável. */
  criarEvento(dados: NovoEventoNoRepositorio): Promise<Evento>

  /** Grava as informações e os horários — nunca o dono nem o código, que não mudam depois de criado. */
  atualizarEvento(id: string, dados: EdicaoDeEventoNoRepositorio): Promise<void>

  /**
   * Garante que `novaData` é o dia principal do evento — e só ele.
   *
   * Chamado depois de TODA edição do evento, não só quando a data muda
   * (idempotente: se já é o dia principal, não faz nada). Existe porque
   * editar a data de início não movia sozinho qual dia era "principal" em
   * `jornada_dias` — o dia antigo continuava marcado, e o novo nunca ganhava
   * linha nenhuma, quebrando tudo que depende do dia principal (o
   * auto-atendimento, os indicadores "hoje" do evento). O dia antigo vira
   * `preparacao` em vez de sumir: se já tem batida registrada nele, ela
   * precisa continuar tendo um dia ao qual pertencer. Mesma regra do
   * `garantirDiaPrincipal` do site (`lib/actions.ts`), 13/09/2026.
   */
  garantirDiaPrincipal(eventoId: string, novaData: string): Promise<void>

  /**
   * As datas (qualquer tipo de dia) deste evento que já têm alguma batida
   * registrada — a régua de "não pode apagar isto". Consulta direto em
   * `registros`: não existe (e não precisa existir) uma coluna que guarde
   * isso à parte, porque ela poderia ficar desatualizada; aqui é sempre o
   * estado real. Quem chama decide o que fazer com a informação — aqui é só
   * o fato.
   */
  datasComRegistro(eventoId: string): Promise<Set<string>>

  /**
   * Substitui o conjunto de dias de PREPARAÇÃO pelo final já decidido (com os
   * preservados já somados por quem chamou) — nunca toca no dia principal.
   * Dia novo nasce com `exigeMeio` ligado (o padrão da coluna); dia que já
   * existia mantém o que já tinha.
   */
  salvarDiasDeTrabalho(eventoId: string, datasFinais: string[]): Promise<void>

  /**
   * Os eventos com setores/equipe/presentes já contados — para o Painel.
   *
   * `organizacaoId: null` sem `eventoId` é o master: todas as organizações.
   * Com `eventoId`, o recorte é UM evento só — o caso do supervisor, que só
   * enxerga o próprio (ver `equipeDoSupervisor`).
   */
  eventosComContagens(opcoes: { organizacaoId?: string | null; eventoId?: string }): Promise<EventoComContagens[]>

  /** Registros de QUALQUER participação do evento, entre dois instantes. */
  registrosEntrePeriodo(eventoId: string, de: string, ate: string): Promise<{ tipo: 'entrada' | 'meio' | 'fim' }[]>

  /**
   * Registros de QUALQUER participação do evento, num dia (`dataRef`) só —
   * o que a tela do evento usa pra "Entradas hoje"/"Presentes no momento".
   * Traz `participacaoId` (não só `tipo`, como `registrosEntrePeriodo`)
   * porque "presentes no momento" precisa DEDUPLICAR por pessoa: quem bateu
   * entrada duas vezes é uma pessoa presente, não duas.
   */
  registrosDoEventoNoDia(eventoId: string, dataRef: string): Promise<{ participacaoId: string; tipo: 'entrada' | 'meio' | 'fim' }[]>

  // ── KPIs do Painel do MASTER ───────────────────────────────────────────────
  //
  // Só o master vê estes três — respondem "como vai o negócio", e não "como
  // está o evento agora" (que é o que os outros papéis veem, acima). Trazidos
  // do site em 12/09/2026, ver `app/admin/page.tsx` → `calcularStatsMestre`.

  /** Quantas pessoas distintas (por CPF) já foram credenciadas, em toda a plataforma. */
  funcionariosNaBaseTotal(): Promise<number>

  /** Soma do que se combinou pagar à equipe, só nos eventos ATIVOS agora. */
  valorCobradoEmEventosAtivos(): Promise<number>

  /** O custo estimado de disparo de WhatsApp nos últimos `dias` dias. */
  custoWhatsappRecente(dias: number): Promise<{ enviados: number; custoEstimado: number }>

  /** As últimas batidas dos eventos informados — o pulso da operação. */
  atividadeRecente(eventoIds: string[], limite: number): Promise<AtividadeBruta[]>

  /**
   * A equipe do evento (ou de UM setor só, para o supervisor), com o que
   * cada um fez NAQUELE DIA — a base das sete visões de "Atividades".
   *
   * Devolve TODO MUNDO, ativo ou não, credenciado ou não: cada visão filtra
   * diferente depois (quem já registrou algo aparece mesmo inativo; quem é
   * cobrado por pendência, não) — a mesma divisão de `linhasDaVisao` e
   * `pendenciasDoDia` no site.
   */
  linhasDoEventoNoDia(eventoId: string, dia: string, equipeId?: string): Promise<LinhaDoDia[]>

  /**
   * As participações candidatas do registro assistido, já dentro do escopo
   * de quem procura — só eventos ATIVOS, a mesma régua do site: regularizar
   * ponto de evento encerrado não é o caso de uso e só abriria espaço a erro.
   *
   * `organizacaoId: null` sem `equipeId` é o master: todas as organizações.
   * Com `equipeId`, o recorte é a equipe de UM supervisor só.
   */
  participacoesParaLocalizar(
    escopo: { organizacaoId?: string | null; equipeId?: string },
  ): Promise<ParticipacaoParaLocalizar[]>

  // ── Participação ────────────────────────────────────────────────────────
  participacoesDaPessoa(pessoaId: string): Promise<Participacao[]>
  participacaoPorId(id: string): Promise<Participacao | null>
  /** O crachá lido no portão resolve nisto — é o que o QR carrega. */
  participacaoPorQrToken(token: string): Promise<Participacao | null>
  criarParticipacao(p: Omit<Participacao, 'id'>): Promise<Participacao>

  /** "Mover de setor" — muda a equipe (fornecedor) desta participação, dentro do mesmo evento. */
  moverParticipacao(participacaoId: string, novoEquipeId: string): Promise<void>
  /** Marca/desmarca o pagamento — `pago: true` carimba agora; `false` limpa a data. */
  definirPagamentoDaParticipacao(participacaoId: string, pago: boolean): Promise<void>
  definirValorAReceberDaParticipacao(participacaoId: string, valor: number): Promise<void>
  /** Desfaz um "tirar da equipe" — reabre o vínculo, sem outro efeito colateral. */
  recredenciarParticipacao(participacaoId: string): Promise<void>
  /**
   * Corrige o telefone — escopado a ESTA participação, não à pessoa
   * inteira (cópia exata do site's `editarTelefoneFuncionario`: ele
   * também só toca a linha do funcionário aberto, nunca as de outros
   * eventos com o mesmo CPF).
   */
  corrigirTelefoneDaParticipacao(participacaoId: string, telefone: string): Promise<void>
  /**
   * Ativa ou desativa, SEM tirar da equipe — cópia de `alternarAtivacao`
   * no site, achada ao comparar a ficha da pessoa (21/09/2026). Diferente
   * de `descredenciarParticipacao` ("tirar da equipe", que remove do
   * fechamento e da equipe visível): aqui a pessoa continua na lista, só
   * marcada como inativa — pára lembrete de WhatsApp e sai da conta do
   * fechamento, mas sem perder o vínculo. É o estado que já existe desde
   * o cadastro (`Participacao.ativo`, hoje só lido, nunca escrito por
   * este app) — só faltava o jeito de mudar.
   */
  alternarAtivacaoDaParticipacao(participacaoId: string, ativo: boolean): Promise<void>
  /**
   * Corrige a função/cargo (texto livre) — cópia de `editarCargoFuncionario`
   * no site, achada comparando a ficha da pessoa (21/09/2026).
   */
  corrigirFuncaoDaParticipacao(participacaoId: string, funcao: string): Promise<void>
  /**
   * Corrige o CPF — cópia de `editarCpfFuncionario` no site, achada
   * comparando a ficha da pessoa (21/09/2026). Só master, aqui: o site
   * também deixa suporte corrigir dentro do escopo dele, mas o app ainda
   * não modela `suporte_escopo` — mesmo motivo de `podeExcluirDaEquipe`.
   */
  corrigirCpfDaParticipacao(participacaoId: string, cpf: string): Promise<void>
  /**
   * Apaga de vez — cadastro e batidas, sem volta. Diferente de
   * `descredenciarParticipacao` ("tirar da equipe"), que é reversível.
   */
  excluirParticipacaoDeVez(participacaoId: string): Promise<void>

  /** Existe alguém com este CPF em QUALQUER setor deste evento? Pra dizer onde, na importação. */
  participacaoPorCpfNoEvento(eventoId: string, cpf: string): Promise<{ nome: string; setorNome: string } | null>
  /**
   * Cria uma participação com os dados que vieram da PLANILHA — ao
   * contrário de `criarParticipacao`, que reaproveita nome/telefone de um
   * cadastro anterior pelo `pessoaId`, aqui os dados são os que a produção
   * acabou de digitar/importar, para uma pessoa que pode nunca ter
   * trabalhado em nenhum evento antes.
   */
  criarParticipacaoDaImportacao(dados: {
    equipeId: string
    nome: string
    cpf: string
    telefone: string | null
    funcao: string | null
    cidade: string | null
    valorReceber: number
  }): Promise<Participacao>

  // ── Batidas ─────────────────────────────────────────────────────────────
  /**
   * Existe registro com este id?
   *
   * O id vem do aparelho e é a chave de idempotência. Esta consulta é o que
   * torna reenviar seguro: sem ela, uma resposta perdida no caminho viraria
   * duas batidas gravadas.
   */
  registroPorId(id: string): Promise<Registro | null>
  registrosDoDia(participacaoId: string, dataRef: string): Promise<Registro[]>
  registrosDaParticipacao(participacaoId: string): Promise<Registro[]>
  /**
   * Sobe a selfie do "meio" para o Storage e devolve o CAMINHO gravado — não
   * a imagem, nem uma URL. A foto não deve viver em memória nem trafegar de
   * volta em toda consulta; quem precisa VER a foto pede uma URL assinada à
   * parte, quando essa tela existir.
   */
  subirFotoDoMeio(eventoId: string, participacaoId: string, dataRef: string, fotoBase64: string): Promise<string>
  /** Mesma ideia, para o registro ASSISTIDO — o caminho leva a etapa, porque aqui pode ser entrada, meio ou saída. */
  subirFotoAssistida(
    eventoId: string, participacaoId: string, tipo: string, dataRef: string, fotoBase64: string,
  ): Promise<string>
  /**
   * URL assinada pra VER a foto de uma batida (não baixar) — achado
   * comparando a ficha da pessoa com o site (21/09/2026): lá o ícone de
   * câmera na presença do dia abre a foto direto. 15 minutos de validade,
   * mesma janela do link de relatório. `null` se o caminho não existir
   * mais no Storage.
   */
  urlDaFoto(caminho: string): Promise<string | null>
  gravarRegistro(r: NovoRegistro): Promise<Registro>
  /**
   * Apaga um registro — só usado para REABRIR um turno (a saída que a
   * pessoa "desfez" voltando a trabalhar). O horário apagado não é
   * segredo: quem chama já sabe qual era antes de decidir apagar.
   */
  apagarRegistro(id: string): Promise<void>
  /**
   * Apaga do Storage a foto de todo registro de um evento já FECHADO há
   * mais de `diasDeRetencao` dias (decisão do Juan, ADR 003: 90 dias) — só
   * a imagem some, `foto_url` vira null; a batida em si (horário, GPS,
   * quem registrou) permanece para sempre. "Fechado" é `dataFim` do
   * evento, ou `dataInicio` quando não há fim configurado.
   */
  apagarFotosVencidas(diasDeRetencao: number, agora: Date): Promise<{ apagadas: number }>

  /**
   * Apaga a batida desta etapa, neste dia, se existir — o passo de
   * "sobrescrever" do registro assistido. Escolher uma etapa que já tem
   * registro é correção, não duplicata: apaga a antiga e quem chama grava a
   * nova por cima, no mesmo espírito de `apagarRegistro`.
   */
  apagarRegistroDoTipo(participacaoId: string, tipo: 'entrada' | 'meio' | 'fim', dataRef: string): Promise<void>

  // ── Supervisor ──────────────────────────────────────────────────────────
  participacoesDaEquipe(equipeId: string): Promise<(Participacao & { pessoa: Pessoa })[]>
  equipeDoSupervisor(pessoaId: string): Promise<{ id: string; nome: string; eventoId: string } | null>

  // ── Acessos ─────────────────────────────────────────────────────────────
  /**
   * Os acessos de painel no escopo de quem pergunta — nunca inclui o master
   * (ele "não é gerenciado por aqui", mesma frase do site).
   *
   * `organizacaoId: undefined` é o master perguntando: a plataforma inteira.
   */
  acessosNoEscopo(organizacaoId?: string | null): Promise<AcessoCompleto[]>

  /** Um acesso com este CPF, em QUALQUER organização — a checagem de unicidade antes de criar. */
  acessoPorCpf(cpf: string): Promise<AcessoCompleto | null>

  /** Ativa ou desativa um acesso. `null` quando o id não existe. */
  definirSituacaoDoAcesso(id: string, ativo: boolean): Promise<AcessoCompleto | null>

  /**
   * Muda nome, telefone e situação de um acesso já existente — cópia do
   * site's `editarSupervisor`, sem o CPF: aqui ele não muda nunca, então o
   * e-mail interno (`cpfParaEmail`) também não, e a edição nunca precisa
   * tocar no Supabase Auth (o site só toca quando o CPF muda).
   */
  atualizarAcesso(
    id: string,
    dados: { nome: string; telefone: string; ativo: boolean; permissoesUsuario?: Record<string, boolean> },
  ): Promise<void>

  /**
   * Os setores (equipes) de um evento — para o formulário de criar acesso de
   * supervisor, e para a tela de "Batida do meio" (`exigeMeio`, nasce
   * desligado — ver `LinhaDoDia.exigeMeio`).
   */
  equipesDoEvento(eventoId: string): Promise<{ setorId: string; nome: string; exigeMeio: boolean }[]>

  /**
   * Cria um acesso de painel novo — supervisor, operador de portão ou
   * suporte. Admin e master não nascem por aqui: são a Plataforma, ainda no
   * servidor falso.
   */
  criarAcesso(dados: NovoAcessoNoRepositorio): Promise<AcessoCompleto>

  /**
   * Cria um admin de uma organização já existente — entra por e-mail e
   * senha escolhidos na hora, nunca por CPF. Uma organização pode ter mais
   * de um admin (o site permite); a criação da PRIMEIRA conta acontece em
   * `criarOrganizacao`, junto com a organização — este método é só para
   * ADICIONAR mais uma depois.
   */
  criarAdmin(dados: NovoAdminNoRepositorio): Promise<AcessoCompleto>

  /** Troca a senha de um acesso existente — o caminho de "esqueci a senha" hoje. */
  definirSenhaDoAcesso(id: string, senha: string): Promise<void>

  /** Apaga o acesso — diferente de desativar, que só bloqueia o login sem perder histórico. */
  excluirAcesso(id: string): Promise<void>

  // ── Batida do meio ───────────────────────────────────────────────────────
  //
  // Duas chaves independentes — SETOR e DIA —, que se combinam com E (ver
  // `LinhaDoDia.exigeMeio` e `DiaDeTrabalho.exigeMeio`). Cada gravação
  // desliga primeiro TUDO do evento e liga de novo só o que veio marcado:
  // grava explicitamente o que foi DESMARCADO, e não só o marcado — sem
  // isso, desligar não desligaria nada.

  /** Liga a batida do meio nos setores informados; desliga todo o resto do evento. */
  definirSetoresComMeio(eventoId: string, setorIdsLigados: string[]): Promise<void>

  /** Liga a batida do meio nos dias informados; desliga todo o resto do evento. */
  definirDiasComMeio(eventoId: string, datasLigadas: string[]): Promise<void>

  // ── Plataforma (organizações) ────────────────────────────────────────────
  //
  // Só o master enxerga — cada uma é um cliente da plataforma, com o próprio
  // painel, equipe e limite de eventos.

  organizacoesComContagens(): Promise<OrganizacaoComContagens[]>
  organizacaoPorId(id: string): Promise<Organizacao | null>

  /** Suspende ou reativa. Suspender bloqueia sem apagar — o histórico é do cliente. */
  definirSituacaoDaOrganizacao(id: string, ativa: boolean): Promise<void>

  /**
   * Cria a organização e o usuário admin dono dela — uma conta de painel de
   * verdade, do mesmo jeito que `criarAcesso` já faz para supervisor. Se o
   * admin falhar (e-mail já em uso, por exemplo), desfaz a organização: sem
   * isso, ficaria um cliente cadastrado sem ninguém para administrá-lo.
   */
  criarOrganizacao(dados: NovaOrganizacaoNoRepositorio): Promise<OrganizacaoComContagens>

  // ── Veículos ──────────────────────────────────────────────────────────────
  //
  // Só cadastro e consulta: o veículo não bate ponto, não tem QR e não passa
  // pelo scanner. O condutor precisa já estar credenciado NESTE evento — é
  // ele que responde pelo veículo.

  veiculosDoEvento(eventoId: string): Promise<Veiculo[]>

  /**
   * A FOTO AINDA NÃO SOBE AO STORAGE — mesma pendência documentada em
   * `registrarBatida`/`rotas/batidas.ts`. `NovoVeiculoNoRepositorio` nem
   * carrega o campo: a tela manda a foto, e ela é descartada por ora.
   */
  criarVeiculo(dados: NovoVeiculoNoRepositorio): Promise<Veiculo>

  /** `false` quando o id não existe (neste evento) — nunca lança. */
  excluirVeiculo(veiculoId: string, eventoId: string): Promise<boolean>

  // ── Bloqueio de CPF ───────────────────────────────────────────────────────
  //
  // Vale para o evento INTEIRO, não um setor; e só para ESTE evento — a
  // pessoa segue livre em qualquer outro.

  bloqueiosDoEvento(eventoId: string): Promise<BloqueioDeCpf[]>
  existeBloqueio(eventoId: string, cpf: string): Promise<boolean>
  criarBloqueio(dados: NovoBloqueioNoRepositorio): Promise<BloqueioDeCpf>

  /** `false` quando o id não existe (neste evento) — nunca lança. */
  removerBloqueio(bloqueioId: string, eventoId: string): Promise<boolean>

  // ── Base de funcionários ──────────────────────────────────────────────────
  //
  // Todo mundo que já foi credenciado por QUALQUER organização, agrupado por
  // CPF — a mesma pessoa em cinco eventos de três clientes é UMA linha. Não
  // existe tabela `pessoas` ainda (ver o topo de `supabase.ts`), então isto é
  // agregado por cima de `participacoes` — caro, e é a razão nº 1 da
  // migração, não um detalhe.

  todasAsPessoasDaBase(): Promise<PessoaDaBase[]>

  /** Todo evento em que esta pessoa (por CPF) já trabalhou, em qualquer organização. */
  trabalhosDaPessoa(cpf: string): Promise<TrabalhoNaBase[]>

  /** Um setor por id, sem precisar saber de qual evento — para "atribuir pessoa". */
  setorPorId(setorId: string): Promise<{ setorId: string; nome: string; eventoId: string } | null>

  // ── Cartaz da portaria, criar setor e equipe do setor ────────────────────
  //
  // As três telas que faltavam da Epic 17 — a decisão que faltava (o teto de
  // vaga por setor) já saiu do app, ver `estimado` removido de `SetorDetalhado`.

  /** O estado do cartaz da portaria — `null` quando o evento não existe. */
  portariaDoEvento(eventoId: string): Promise<EstadoDaPortaria | null>

  /**
   * Grava o estado da portaria. Quem decide ABRIR/FECHAR e quando sortear um
   * token novo é a ROTA (mesmo padrão de `novoToken` em `arquivos.ts`) — o
   * repositório só grava o que mandarem.
   */
  definirPortaria(eventoId: string, estado: { aberta: boolean; token: string | null }): Promise<void>

  criarSetor(dados: NovoSetorNoRepositorio): Promise<SetorCriado>

  /** Desfaz a criação do setor — usado quando o supervisor falha ao ser criado. */
  excluirSetor(setorId: string): Promise<void>

  /** Muda nome, valor por pessoa e se o setor pede o meio — cópia do site's `editarFornecedor`. */
  atualizarSetor(setorId: string, dados: { nome: string; valorPorPessoa: number | null; exigeMeio: boolean }): Promise<void>

  /**
   * Liga/desliga o link de cadastro DESTE setor, sem mexer no interruptor do
   * evento inteiro (`definirPortaria` é outro) — o caso de um setor que já
   * fechou a equipe enquanto os outros seguem montando. Cópia do site's
   * `alternarLinkDoSetor`, 13/09/2026.
   */
  alternarLinkDoSetor(setorId: string, ativo: boolean): Promise<void>

  /**
   * Suspende/reabre o cadastro por link do evento INTEIRO — cópia do site's
   * `alternarCadastroPorLink`. Qualquer um dos dois interruptores (este ou
   * `alternarLinkDoSetor`) já basta pra recusar; nenhum vence o outro.
   */
  alternarCadastroPorLink(eventoId: string, suspenso: boolean): Promise<void>

  /**
   * Grava a exceção de 48h que reabre o cadastro de UM setor sem religar o
   * link geral do evento — cópia do site's `criarAutorizacaoCadastroIndividual`
   * (`lib/cadastro-individual.ts`): mesma tabela (`sistema_estado`), mesmo
   * prefixo de chave e mesmo hash do token, pra um link gerado por qualquer
   * um dos dois lados (app ou site) ser lido pelo formulário público do site
   * — é ele que consulta essa mesma tabela ao validar `?individual=`.
   *
   * O token é gerado pela ROTA (mesmo padrão de `novoToken`, em
   * `principal.ts`) — o repositório só grava o que mandarem.
   */
  salvarAutorizacaoIndividual(
    setorId: string, eventoId: string, token: string, expiraEm: string,
  ): Promise<void>

  /**
   * Prende um supervisor JÁ EXISTENTE a um setor novo, sem criar login —
   * "este setor entra nos dela". Atualiza qual setor esta pessoa vê agora;
   * ver o comentário de `AcessoCompleto.eventos` sobre a simplificação de
   * 1 setor por supervisor neste app (o site tem `supervisor_setores`, uma
   * tabela N:N — aqui ela só é escrita, para não perder o histórico do lado
   * do banco, mas ainda não é lida: reatribuir troca qual setor a pessoa
   * enxerga em "Minha equipe", mesmo bug que o site já corrigiu uma vez —
   * ver `docs/backlog.md`).
   */
  reatribuirSupervisorAoSetor(perfilId: string, setorId: string): Promise<AcessoCompleto>

  /** Os setores de um evento, já com quantas pessoas e quais supervisores — para a tela do evento. */
  setoresDoEvento(eventoId: string): Promise<SetorComPessoas[]>

  // ── Conferência de equipe ────────────────────────────────────────────────
  //
  // A tela que o supervisor usa 1 dia antes do evento: vê a equipe, tira quem
  // não é dele, confirma que a lista está certa. A régua da janela (quando
  // abre) é pura, em `packages/dominio/src/conferencia.ts` — aqui é só o dado.

  /** Todos os setores do evento, cada um com o supervisor (se tiver) e o estado da conferência. */
  conferenciasDoEvento(eventoId: string): Promise<LinhaConferenciaNoRepositorio[]>

  /** O estado gravado da conferência de UM setor — `null` quando ela nunca foi tocada. */
  estadoDaConferencia(setorId: string): Promise<EstadoDaConferencia | null>

  /** Fecha a conferência: grava status, quem, quando e os números, tudo de uma vez. */
  confirmarConferencia(dados: {
    setorId: string
    eventoId: string
    confirmadoPorPessoaId: string
    mantidos: number
    removidos: number
    agora: string
  }): Promise<void>

  /**
   * Encerra o vínculo da pessoa com o evento — "tirar da conferência" é só
   * este mesmo desligamento com um motivo fixo, não uma operação à parte.
   */
  descredenciarParticipacao(participacaoId: string, agora: string): Promise<void>

  // ── Auditoria ───────────────────────────────────────────────────────────
  /**
   * Grava uma linha em `alteracoes_cadastro` — cópia do site's
   * `registrarAuditoria`. NUNCA lança: uma falha ao gravar auditoria não
   * pode travar a ação de negócio que já aconteceu.
   */
  registrarAuditoria(entrada: NovaEntradaDeAuditoria): Promise<void>
  /** A trilha, já no escopo de quem pergunta (a régua mora na rota, não aqui). */
  auditoria(filtro: FiltroDeAuditoria): Promise<LinhaDeAuditoria[]>

  // ── Push ───────────────────────────────────────────────────────────────
  /**
   * Registra (ou atualiza o dono de) um token de push — é do APARELHO, não
   * da pessoa: se outra pessoa entrar no mesmo aparelho depois, o mesmo
   * token passa a apontar pra ela. Ver migração `006-tokens-de-push.sql`.
   */
  registrarTokenDePush(pessoaId: string, token: string, plataforma: 'ios' | 'android'): Promise<void>
  /** Os tokens de push já registrados para esta pessoa — pode ter mais de um aparelho. */
  tokensDePush(pessoaId: string): Promise<{ token: string; plataforma: 'ios' | 'android' }[]>

  /**
   * Quem ainda não bateu a entrada/saída hoje, num dia principal sem
   * batida livre — mesma trava do site (`diaComTrava`, em
   * `lib/mensagens.ts`): só entra aqui quem tem um prazo de verdade pra
   * perder. Fora disso (montagem, desmontagem, evento com auto-
   * atendimento) ninguém precisa de lembrete, porque não existe hora fixa
   * pra cobrar. `momento` decide qual etapa e qual janela do evento
   * (`janela_entrada_fim`/`janela_fim_fim`) valem.
   */
  participacoesSemRegistroHoje(momento: 'entrada' | 'fim', agora: Date): Promise<{
    participacaoId: string
    pessoaId: string
    nome: string
    cpf: string
    equipeId: string
    equipeNome: string
    eventoNome: string
    janelaFim: string | null
    /**
     * O dia do PRINCIPAL, não o calendário de `agora` — numa saída depois
     * da meia-noite os dois divergem, e é este que serve pra dedupe
     * (`jaEnviouLembreteHoje`/`registrarLembreteEnviado`).
     */
    diaRef: string
  }[]>

  /** O pessoaId (perfil) de quem supervisiona este setor agora — `null` se não tiver. */
  supervisorDoSetor(equipeId: string): Promise<string | null>

  /** Já mandamos este lembrete pra esta participação, neste dia? Evita duplicar. */
  jaEnviouLembreteHoje(participacaoId: string, tipo: string, data: string): Promise<boolean>
  /** Marca o lembrete como enviado — chamar só depois do envio de verdade dar certo. */
  registrarLembreteEnviado(participacaoId: string, tipo: string, data: string): Promise<void>

  // ── Contestação de batida ────────────────────────────────────────────────
  //
  // O colaborador contesta a própria batida (errada ou que faltou) — recurso
  // que só existe no app, o site nunca teve isto pra copiar. Escopo decidido
  // com o Juan em 18/09/2026. Ver migração `007-contestacoes-de-batida.sql`.

  criarContestacao(dados: {
    participacaoId: string
    tipo: 'entrada' | 'meio' | 'fim'
    dataRef: string
    motivo: string
  }): Promise<Contestacao>

  /** As ainda abertas de UMA participação — a ficha da pessoa mostra estas. */
  contestacoesAbertas(participacaoId: string): Promise<Contestacao[]>

  /**
   * Busca uma contestação pelo próprio id, sem saber de quem é — a rota que
   * resolve só recebe o `id` (o app não carrega o `participacaoId` junto,
   * ver `ClienteApi.resolverContestacao`), então este é o jeito de achar o
   * dono e o evento antes de checar `podeMexerNaEquipe`.
   */
  contestacaoPorId(id: string): Promise<Contestacao | null>

  /** Marca como resolvida — quem resolveu e quando, pra rastrear depois. */
  resolverContestacao(id: string, resolvidaPorPessoaId: string): Promise<void>
}

export type Contestacao = {
  id: string
  participacaoId: string
  tipo: 'entrada' | 'meio' | 'fim'
  dataRef: string
  motivo: string
  criadoEm: string
}

export type EstadoDaConferencia = {
  status: 'pendente' | 'confirmada'
  confirmadaEm: string | null
  confirmadaPorPessoaId: string | null
  totalMantidos: number | null
  totalRemovidos: number | null
}

export type LinhaConferenciaNoRepositorio = {
  setorId: string
  setorNome: string
  supervisorNome: string | null
  estado: EstadoDaConferencia | null
}

export type EstadoDaPortaria = { aberta: boolean; token: string | null; cadastrados: number }

export type SetorComPessoas = {
  setorId: string
  nome: string
  pessoas: number
  valorPorPessoa: number | null
  /** O token do link de cadastro — a rota monta a URL, com o domínio do site. */
  token: string | null
  /** Falso = este setor não aceita cadastro novo, mesmo com a portaria/evento ligados. */
  linkAtivo: boolean
  /** Pede a confirmação do meio? Só faz sentido em equipe paga por pessoa. */
  exigeMeio: boolean
  supervisores: {
    id: string; nome: string; ativo: boolean; telefone: string | null
    permissoesUsuario?: Record<string, boolean>
  }[]
}

export type NovoSetorNoRepositorio = {
  eventoId: string
  nome: string
  valorPorPessoa: number | null
  exigeMeio: boolean
}

export type SetorCriado = { setorId: string; nome: string; token: string | null }

/** Um acesso de painel, com tudo que a tela de Acessos precisa mostrar. */
export type AcessoCompleto = {
  id: string
  nome: string
  cpf: string
  telefone: string | null
  /** Só admin/master têm — os outros entram por CPF. `null` para os demais. */
  email: string | null
  papel: Papel
  organizacaoId: string | null
  ativo: boolean
  setorId: string | null
  setorNome: string | null
  /**
   * Quantos eventos este acesso alcança. Supervisor é sempre 1 (um setor,
   * um evento); para operador de portão e suporte, o evento em que foi
   * criado — contar de verdade exigiria uma tabela de escopo por pessoa
   * (`suporte_escopo`, no site) que este domínio ainda não tem.
   */
  eventos: number
  criadoEm: string
  /** Só o suporte tem — `null` para os demais papéis. */
  expiraEm: string | null
  permissoesUsuario: Record<string, boolean>
}

export type NovoAcessoNoRepositorio = {
  nome: string
  cpf: string
  telefone: string
  papel: 'supervisor' | 'operador_portao' | 'suporte'
  organizacaoId: string | null
  ativo: boolean
  /** Só o supervisor tem — os outros dois são do evento inteiro. */
  setorId?: string
  expiraEm?: string | null
  permissoesUsuario: Record<string, boolean>
}

export type NovoAdminNoRepositorio = {
  nome: string
  email: string
  senha: string
  organizacaoId: string
  ativo: boolean
}

export type NovoEventoNoRepositorio = {
  nome: string
  descricao: string | null
  local: string | null
  dataInicio: string
  dataFim: string
  organizacaoId: string | null
  janela_entrada_inicio: string | null
  janela_entrada_fim: string | null
  janela_fim_inicio: string | null
  janela_fim_fim: string | null
  codigoConvite: string
}

export type EdicaoDeEventoNoRepositorio = {
  nome: string
  descricao: string | null
  local: string | null
  dataInicio: string | null
  dataFim: string | null
  batida_livre: boolean
  checkin_autonomo: boolean
  janela_entrada_inicio: string | null
  janela_entrada_fim: string | null
  janela_fim_inicio: string | null
  janela_fim_fim: string | null
}

export type Organizacao = {
  id: string
  nome: string
  documento: string | null
  responsavelNome: string | null
  limiteEventos: number
  valorCobrado: number | null
  valorCobradoPeriodo: 'mensal' | 'anual' | 'por_evento' | null
  ativo: boolean
  criadaEm: string
}

/** A organização com o que a lista precisa mostrar sem consulta à parte. */
export type OrganizacaoComContagens = Organizacao & {
  eventos: number
  /** O admin dono dela — o primeiro perfil com `papel: 'admin'` da organização. */
  adminNome: string | null
  adminEmail: string | null
}

export type NovaOrganizacaoNoRepositorio = {
  nome: string
  documento: string | null
  responsavelNome: string | null
  limiteEventos: number
  valorCobrado: number | null
  valorCobradoPeriodo: 'mensal' | 'anual' | 'por_evento' | null
  adminNome: string
  email: string
  senha: string
}

export type Veiculo = {
  id: string
  placa: string
  modelo: string
  cor: string | null
  tipo: string | null
  empresa: string | null
  observacoes: string | null
  condutorNome: string
  condutorCpf: string
  /** Vazio = autorizado todos os dias do evento. */
  dias: string[]
}

export type NovoVeiculoNoRepositorio = {
  eventoId: string
  /** O condutor — precisa já estar credenciado NESTE evento. */
  participacaoId: string
  placa: string
  modelo: string
  cor: string | null
  tipo: string | null
  empresa: string | null
  observacoes: string | null
  dias: string[]
  condutorNome: string
  condutorCpf: string
}

export type BloqueioDeCpf = {
  id: string
  cpf: string
  motivo: string | null
  criadoEm: string
  bloqueadoPorNome: string | null
}

export type NovoBloqueioNoRepositorio = {
  eventoId: string
  cpf: string
  motivo: string | null
  bloqueadoPorId: string
  bloqueadoPorNome: string
}

export type PessoaDaBase = {
  cpf: string
  nome: string
  telefone: string | null
  funcao: string | null
  cidade: string | null
  /** Em quantos eventos se CADASTROU — inclui quem nunca apareceu. */
  eventos: number
  /** Em quantos eventos de fato BATEU ENTRADA — "está na lista" x "apareceu". */
  eventosTrabalhados: number
  organizacoes: number
  ultimoCadastro: string
}

export type TrabalhoNaBase = {
  participacaoId: string
  eventoId: string
  eventoNome: string
  organizacaoId: string | null
  organizacaoNome: string | null
  setorId: string
  setorNome: string
  cargo: string | null
  dataInicio: string
  dataFim: string | null
  ativo: boolean
  descredenciadoEm: string | null
  /** Bateu entrada alguma vez neste evento — "está na lista" x "apareceu". */
  compareceu: boolean
  criadoEm: string
}

/**
 * Uma linha da trilha de auditoria — cópia do que `registrarAuditoria`
 * grava no site, em `alteracoes_cadastro`. Ver `packages/dominio` não: a
 * régua de quem pode ver o quê mora na rota (`rotas/auditoria.ts`), porque
 * depende de organização e papel de quem pergunta, não é uma regra pura.
 */
export type NovaEntradaDeAuditoria = {
  autorId: string
  /** O NOME no momento da ação — não depende de join com `perfis`, sobrevive a exclusão do autor. */
  autorNome: string
  acao: string
  campoAlterado?: string | null
  valorAnterior?: string | null
  valorNovo?: string | null
  motivo?: string | null
  /** O id da participação (pessoa dentro do setor do evento) afetada, se houver. */
  participacaoId?: string | null
  eventoId?: string | null
  organizacaoId?: string | null
}

export type LinhaDeAuditoria = {
  id: string
  quando: string
  autorNome: string
  acao: string
  campoAlterado: string | null
  valorAnterior: string | null
  valorNovo: string | null
  motivo: string | null
  eventoId: string | null
  eventoNome: string | null
}

export type FiltroDeAuditoria = {
  /** Omitido = todas as organizações (só o master pergunta assim). */
  organizacaoId?: string
  /** Omitido = de qualquer autor. Usado para prender o suporte só ao que ele mesmo fez. */
  autorId?: string
  eventoId?: string
  /** ISO — só linhas depois disto. */
  desde?: string
  limite?: number
}
