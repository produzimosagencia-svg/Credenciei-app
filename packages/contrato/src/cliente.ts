// O que o aplicativo pode pedir ao servidor.
//
// Uma interface, e não uma implementação: o app é escrito contra ela, e hoje
// roda com o cliente falso. Quando a API existir, entra a implementação real e
// nenhuma tela muda — é a diferença entre esperar a API para começar o app e
// construir os dois em paralelo.
//
// Note o que NÃO existe aqui: nenhum método que receba id de pessoa. O servidor
// sabe quem está perguntando pelo token da sessão. `minhasParticipacoes()` não
// tem como devolver as de outra pessoa; `participacoesDe(id)` teria.

import type {
  Acesso, AtividadesDoEvento, BatidaAssistida, CandidatoLocalizado,
  ConferenciaPorCpf, ConviteDoEvento, DiaDaParticipacao, EnvioDeBatida, Eu,
  ArquivoDePlanilha, ConfiguracaoDoEvento, ConfiguracaoDoMeio, DadosDeNovoEvento, EdicaoDoEvento, EquipeDoSetor,
  EventoComSetores, EventoDetalhado, EventoEscaneavel, FichaDaPessoa,
  FichaLocalizada, FiltroDeAcessos, FinanceiroDaParticipacao, ListaDeAcessos,
  NovoAcesso, Painel, PainelDaEquipe, Portaria, LinkCadastroIndividual,
  BaseDeFuncionarios, BuscaRegional, CentralDeAvisos, DadosDeNovaOrganizacao, FichaDaPessoaNaBase,
  ListaDeOrganizacoes, Organizacao, PainelDoWhatsApp, ResultadoDeAtribuicao,
  ResultadoDaImportacao, ResultadoDaLeitura, ResultadoDosDias, RespostaDeBatida,
  ResumoParticipacao, SetorDetalhado, Sessao, TipoDeAviso, VisaoDeAtividade,
  CondutorEncontrado, DadosDeVeiculo, VeiculosDoEvento, CpfBloqueado,
  ConferenciaDoSetor, LinhaConferencia, Periodo, QuemNoRelatorio, ResumoDeRelatorios,
  DadosParaLancarPonto, BuscaDeColaboradores,
  DadosDeSuporte, DadosDeNovoSuporte, EdicaoDeSuporte,
  ConfiguracoesDePermissao, LinhaDeAuditoria, MinhasPermissoes,
} from './tipos.js'
import type { Papel } from '@credenciei/dominio'
import type { TipoBatida } from './comum.js'

export interface ClienteApi {
  // ── Identidade ──────────────────────────────────────────────────────────
  /**
   * O caminho de quem tem conta de painel: CPF ou e-mail, mais senha.
   *
   * É o mesmo login do sistema web. Existe em paralelo ao do WhatsApp porque
   * são duas populações diferentes: dezenas de pessoas com conta permanente e
   * senha, e dezenas de MILHARES contratadas por um dia, que não vão criar nem
   * lembrar de senha nenhuma.
   *
   * A resposta é sempre a mesma quando falha — "CPF ou senha incorretos" —,
   * nunca "esse CPF não existe": diferenciar entregaria uma forma de descobrir
   * quem tem conta no sistema.
   */
  entrarComSenha(identificador: string, senha: string): Promise<{ sessao?: Sessao; erro?: string }>
  /** Pede o código de acesso por WhatsApp. */
  pedirCodigo(telefone: string): Promise<{ enviado: boolean; erro?: string }>
  /** Troca o código recebido por uma sessão. */
  entrar(telefone: string, codigo: string): Promise<{ sessao?: Sessao; erro?: string }>
  renovar(renovacao: string): Promise<{ sessao?: Sessao; erro?: string }>
  eu(): Promise<Eu>

  /**
   * As duas camadas de override que valem para ESTE acesso — usuário e
   * organização. É o que faz o MENU do app decidir o que mostrar sem
   * esperar o servidor recusar o clique (ver `useAlvoDePermissao`, no app).
   */
  minhasPermissoes(): Promise<MinhasPermissoes>

  // ── Entrar num evento ───────────────────────────────────────────────────
  /** Confere o código do evento e devolve o que falta preencher. */
  consultarConvite(codigo: string): Promise<{ convite?: ConviteDoEvento; erro?: string }>
  /** Cria o vínculo com o evento. Os dados da conta não são repetidos aqui. */
  entrarNoEvento(
    codigo: string,
    respostas: Record<string, string>,
  ): Promise<{ participacao?: ResumoParticipacao; erro?: string }>

  // ── O que é meu ─────────────────────────────────────────────────────────
  minhasParticipacoes(): Promise<ResumoParticipacao[]>
  meusDias(participacaoId: string): Promise<DiaDaParticipacao[]>
  meuFinanceiro(participacaoId: string): Promise<FinanceiroDaParticipacao>
  /**
   * "Excluir minha conta" — LGPD, direito ao esquecimento. Decidido com o
   * Juan em 21/09/2026: anonimiza nome, telefone e foto, mas NUNCA toca
   * batida, valor a receber ou chave PIX — histórico de ponto e pagamento
   * sobrevive por obrigação trabalhista (CLT), e um valor ainda pendente
   * ficaria impossível de pagar sem a chave PIX. Derruba a sessão em
   * qualquer aparelho — só faz sentido pra conta de colaborador.
   */
  excluirMinhaConta(): Promise<{ erro?: string }>
  /**
   * O código do QR para a etapa de hoje daquele evento.
   *
   * `liberado` decide se a tela mostra o QR ou o embaça — decisão do Juan,
   * 18/09/2026: contra o print mandado com antecedência pra alguém entrar
   * no lugar da pessoa, o QR só aparece perto da hora de bater
   * (`liberacaoDoQR`, no domínio). `liberaEm` é o horário em que libera,
   * para a tela mostrar a contagem e se desbloquear sozinha; `null` quando
   * já está liberado ou quando não há horário nenhum a esperar.
   */
  meuQr(participacaoId: string): Promise<{
    codigo: string
    etapa: string
    liberado: boolean
    liberaEm: string | null
  }>

  // ── Bater ponto ─────────────────────────────────────────────────────────
  /** Lança exceção em falha de transporte; devolve `recusado` em decisão. */
  registrarBatida(envio: EnvioDeBatida): Promise<RespostaDeBatida>

  /**
   * Entrada sem operador — o auto-atendimento.
   *
   * Só ENTRADA: a saída continua exigindo sempre o QR mostrado no
   * credenciamento — decisão do Juan, não esquecimento. "Ainda não tá
   * desenvolvido totalmente isso, não tá mapeado, não tá estudado como a
   * gente pode fazer na prática." Reversível depois, mas até lá o método nem
   * aceita a etapa como parâmetro. Trazido do site em 11/09/2026.
   *
   * Fora do dia principal já funciona sempre, do mesmo jeito que a montagem e
   * a desmontagem sempre foram livres. No dia principal, só quando o evento
   * tem `checkinAutonomo` ligado — ver `ConfiguracaoDoEvento`.
   *
   * Sem foto de propósito: o que precisa ser rápido é o toque, e é uma
   * chamada direta à rede (não passa pela fila offline) porque a pessoa
   * espera a confirmação na hora, igual ao site.
   */
  registrarEntradaLivre(
    participacaoId: string,
    dados: { lat?: number; lng?: number },
  ): Promise<RespostaDeBatida>

  /**
   * Contestar uma batida errada ou que faltou — recurso que só existe no
   * app (o site nunca teve, o colaborador não tem conta lá pra copiar a
   * regra). Escopo decidido com o Juan em 18/09/2026: vira pendência na
   * tela da equipe do setor, visível pro supervisor e por quem gerencia o
   * evento; motivo é obrigatório, pra quem for resolver ter por onde
   * começar.
   */
  contestarBatida(
    participacaoId: string,
    tipo: TipoBatida,
    dataRef: string,
    motivo: string,
  ): Promise<{ erro?: string }>

  // ── Painel ──────────────────────────────────────────────────────────────
  /**
   * A tela inicial de quem tem conta de painel.
   *
   * Não recebe organização nem evento: o servidor decide o recorte pelo papel
   * de quem está pedindo. Um `painel(organizacaoId)` seria um convite a trocar
   * o id e ver a operação de outro cliente.
   */
  painel(): Promise<Painel>

  // ── Escanear QR ─────────────────────────────────────────────────────────
  /**
   * Os eventos que ESTA pessoa pode escanear.
   *
   * Master vê todos os ativos, admin os da própria organização, supervisor só o
   * do próprio setor. Vem do servidor pronto: uma lista completa filtrada na
   * tela permitiria escanear no evento errado trocando um id.
   */
  eventosParaEscanear(): Promise<EventoEscaneavel[]>

  /**
   * Lê o crachá e grava a presença.
   *
   * O servidor decide sozinho se é entrada ou saída — não é mais o operador
   * quem escolhe. Primeira leitura do turno é entrada; a próxima é saída;
   * sair e voltar no mesmo dia reabre o turno. A validação é toda do
   * servidor.
   */
  registrarPorQr(eventoId: string, codigoLido: string): Promise<ResultadoDaLeitura>

  /** A saída quando o crachá não passa e a pessoa está na frente. */
  conferirPorCpf(eventoId: string, cpf: string): Promise<ConferenciaPorCpf>

  // ── Registrar ponto por outra pessoa ────────────────────────────────────
  /**
   * Acha quem perdeu o horário, por CPF ou nome.
   *
   * Devolve UMA ficha quando não há dúvida, ou a lista de candidatos quando o
   * nome bate com mais de uma pessoa — que é o caso comum. Quem escolhe é quem
   * está atendendo, olhando para a pessoa.
   */
  localizarPessoa(termo: string): Promise<{
    ficha?: FichaLocalizada
    candidatos?: CandidatoLocalizado[]
    erro?: string
  }>

  /** A ficha completa de alguém escolhido na lista de candidatos. */
  abrirFicha(participacaoId: string): Promise<{ ficha?: FichaLocalizada; erro?: string }>

  /**
   * Grava a batida escolhida daquela pessoa, com a foto de quem a validou.
   *
   * A etapa vem em `dados.tipo` — quem escolhe é o operador (ver
   * `FichaLocalizada.etapas`), não mais o servidor pela pendência. Escolher
   * uma etapa que já tem registro sobrescreve o horário, de propósito: é
   * uma correção, não uma duplicata. Trazido do site em 11/09/2026.
   */
  registrarPresencaAssistida(
    participacaoId: string,
    dados: BatidaAssistida,
  ): Promise<{ nome?: string; etapa?: string; erro?: string }>

  // ── Atividades do evento ────────────────────────────────────────────────
  /**
   * Os eventos que ESTA pessoa pode acompanhar.
   *
   * Lista própria, e não a mesma de `eventosParaEscanear`: acompanhar e
   * escanear são permissões diferentes. O supervisor acompanha o próprio setor
   * sem poder escanear — tirar o scanner dele não pode cegá-lo.
   */
  eventosParaAcompanhar(): Promise<EventoEscaneavel[]>

  /**
   * As sete visões de um dia — quem cumpriu, ou está devendo, cada etapa.
   *
   * Mesma pergunta de `/admin/eventos/[id]/presenca` no site, entrando pelo
   * menu em vez de por dentro do evento. `visao` e `dia` default para
   * "entrada" e o dia mais recente ≤ hoje — a mesma régua de fallback do site.
   */
  atividades(
    eventoId: string,
    opcoes?: { visao?: VisaoDeAtividade; dia?: string },
  ): Promise<AtividadesDoEvento>

  /**
   * Cria um evento novo. O master escolhe a organização dona; o admin cria
   * sempre para a própria, sem escolher — e nunca vê um evento que não seja
   * dela, antes ou depois de criado.
   */
  criarEvento(dados: DadosDeNovoEvento): Promise<{ eventoId?: string; erro?: string }>

  // ── O evento por dentro ─────────────────────────────────────────────────
  /** A tela de configuração de um evento: setores, progresso e portaria. */
  evento(eventoId: string, dia?: string): Promise<EventoDetalhado>

  /**
   * Abre ou fecha o cadastro na portaria.
   *
   * Fechar NÃO invalida os cartazes impressos: eles voltam a funcionar quando
   * a portaria abre de novo. É o que evita reimpressão à toa, e por isso a tela
   * diz isso quando está fechada.
   */
  alternarPortaria(eventoId: string, aberta: boolean): Promise<{ portaria?: Portaria; erro?: string }>

  /**
   * Gera um endereço novo para o cartaz.
   *
   * É destrutivo: todo cartaz já impresso para de funcionar. Existe para o caso
   * de o QR vazar — alguém fotografou o cartaz e mandou no grupo. Quem já se
   * cadastrou não é afetado.
   */
  trocarTokenDaPortaria(eventoId: string): Promise<{ portaria?: Portaria; erro?: string }>

  /**
   * Suspende/reabre o cadastro por link do evento INTEIRO de uma vez — os
   * links dos setores e o cartaz da portaria continuam os mesmos, só
   * passam a recusar. Cópia do site's `alternarCadastroPorLink`. Diferente
   * de `alternarLinkDoSetor`, que fecha só um setor.
   */
  alternarCadastroPorLink(eventoId: string, suspenso: boolean): Promise<{ erro?: string }>

  /**
   * Reabre o cadastro de UM setor por 48h, sem religar o link geral do
   * evento — a exceção do master quando alguém precisa entrar depois de a
   * lista ter fechado. Cópia do site's `criarLinkCadastroIndividual`. O
   * link aponta pro formulário do SITE — quem preenche é a pessoa sendo
   * credenciada, não este app.
   */
  criarLinkCadastroIndividual(
    eventoId: string, setorId: string,
  ): Promise<{ resultado?: LinkCadastroIndividual; erro?: string }>

  /** O evento como ele está configurado hoje, para a tela de edição. */
  configuracaoDoEvento(eventoId: string): Promise<ConfiguracaoDoEvento>

  /**
   * Grava as informações e os horários do evento.
   *
   * O servidor confere os horários de novo, mesmo a tela já tendo conferido: a
   * tela é conveniência, o servidor é a garantia. Uma configuração impossível
   * gravada aqui só apareceria na madrugada do evento, com mil pessoas
   * tentando bater a saída ao mesmo tempo.
   */
  salvarEvento(eventoId: string, dados: EdicaoDoEvento): Promise<{ erro?: string }>

  /**
   * Marca quais dias a equipe trabalha.
   *
   * Grava separado do resto porque é outra tabela — e porque o produtor mexe
   * nos dias sem necessariamente mexer no evento. Dia com batida registrada é
   * preservado mesmo se vier desmarcado.
   */
  salvarDiasDeTrabalho(
    eventoId: string,
    dias: string[],
  ): Promise<{ resultado?: ResultadoDosDias; erro?: string }>

  /**
   * Cria um setor (fornecedor) do evento.
   *
   * O supervisor vem junto, não depois — trazido do site em 11/09: um setor
   * só existe com alguém respondendo por ele, senão nasce com o link de
   * cadastro aberto e ninguém para conferir quem entra.
   */
  criarSetor(
    eventoId: string,
    dados: {
      nome: string
      valorPorPessoa?: number | null
      supervisor: { nome: string; cpf: string; telefone: string }
      /**
       * Pedir a confirmação do meio para quem entra neste setor. Nasce
       * desligado — só faz sentido gasto de WhatsApp em equipe paga por
       * pessoa (ver `ConfiguracaoDoMeio`).
       */
      exigeMeio?: boolean
    },
  ): Promise<{ setor?: SetorDetalhado; erro?: string }>

  /**
   * Muda nome, valor por pessoa e se este setor pede o meio — cópia do site's
   * `editarFornecedor`. O supervisor não entra aqui: trocar quem responde por
   * uma equipe é outra decisão, que mora em Acessos.
   */
  editarSetor(
    setorId: string,
    dados: { nome: string; valorPorPessoa?: number | null; exigeMeio?: boolean },
  ): Promise<{ setor?: SetorDetalhado; erro?: string }>

  /**
   * Liga/desliga o link de cadastro DESTE setor — cópia do site's
   * `alternarLinkDoSetor`. Diferente do interruptor da portaria, que fecha
   * o evento inteiro de uma vez.
   */
  alternarLinkDoSetor(setorId: string, ativo: boolean): Promise<{ erro?: string }>

  /**
   * Apaga o setor — cópia do site's `deletarFornecedor`. Só o master exclui;
   * os demais encerram o evento, que resolve sem destruir dado. Recusa
   * quando há supervisor vinculado.
   */
  excluirSetor(setorId: string): Promise<{ erro?: string }>

  /**
   * Adiciona um supervisor a um setor que JÁ EXISTE — cópia do site's
   * `criarSupervisor` chamado a partir do card do setor. Reaproveita login
   * se o CPF já supervisiona outro setor; recusa CPF de outro papel ou de
   * outra organização.
   */
  adicionarSupervisor(
    setorId: string,
    dados: { nome: string; cpf: string; telefone: string },
  ): Promise<{ erro?: string }>

  /**
   * Muda nome, telefone e situação de um supervisor já vinculado — cópia do
   * site's `editarSupervisor`, sem CPF nem senha (que têm caminho próprio:
   * o CPF não muda, e a senha troca por `trocarSenhaDoAcesso`, em Acessos).
   *
   * `permissoesUsuario` é opcional e SÓ sobrescreve quando vier — omitir
   * mantém o que já estava gravado (outra tela pode ter decidido antes).
   */
  editarSupervisor(
    id: string,
    dados: { nome: string; telefone: string; ativo: boolean; permissoesUsuario?: Record<string, boolean> },
  ): Promise<{ erro?: string }>

  /** A equipe de um setor, com o estado de cada pessoa em cada etapa. */
  equipeDoSetor(setorId: string): Promise<EquipeDoSetor>

  /**
   * O que a tela de "Batida do meio" mostra: os setores do evento e os dias
   * da operação, cada um com o próprio interruptor. Trazido do site em
   * 11/09/2026.
   */
  configuracaoDoMeio(eventoId: string): Promise<ConfiguracaoDoMeio>

  /**
   * Liga/desliga a batida do meio: quais SETORES pedem, e em quais DIAS.
   *
   * Escreve os dois lados de uma vez porque a regra é um E entre eles — salvar
   * metade deixaria a tela dizendo uma coisa e o sistema fazendo outra.
   * Grava explicitamente o que foi DESMARCADO, e não só o marcado: sem isso,
   * desligar não desligaria nada — só deixaria de ligar de novo.
   */
  salvarConfiguracaoDoMeio(
    eventoId: string,
    setoresLigados: string[],
    diasLigados: string[],
  ): Promise<{ setores?: number; dias?: number; erro?: string }>

  // ── A ficha de uma pessoa ───────────────────────────────────────────────
  /** Tudo sobre uma pessoa da equipe, numa chamada só. */
  fichaDaPessoa(participacaoId: string): Promise<FichaDaPessoa>

  /**
   * Move a pessoa para outro setor do mesmo evento.
   *
   * Existe para o admin resolver cadastro no setor errado sozinho, sem
   * precisar mexer no banco — foi exatamente isso que aconteceu com dois
   * setores duplicados no Kleber Andrade.
   */
  moverDeSetor(participacaoId: string, setorId: string): Promise<{ erro?: string }>

  /**
   * Promove alguém da equipe a supervisor do próprio setor.
   *
   * Reaproveita nome e CPF de quem já está credenciado: a pessoa promovida
   * quase sempre já está na equipe, e digitar tudo de novo só multiplica a
   * chance de erro. O telefone é pedido porque é por ele que o convite vai.
   */
  tornarSupervisor(participacaoId: string, telefone: string): Promise<{ erro?: string }>

  /** Marca ou desmarca o pagamento. Desfazer é tão necessário quanto marcar. */
  marcarPagamento(participacaoId: string, pago: boolean): Promise<{ erro?: string }>

  /** Quanto esta pessoa recebe — pode diferir do valor combinado do setor. */
  salvarValorAReceber(participacaoId: string, valor: number): Promise<{ erro?: string }>

  /** "Tirar da equipe" — descredencia, sem apagar nada. Reversível por `trazerDeVolta`. */
  tirarDaEquipe(participacaoId: string): Promise<{ erro?: string }>
  /** Desfaz um "tirar da equipe" — reabre o vínculo. */
  trazerDeVolta(participacaoId: string): Promise<{ erro?: string }>
  /**
   * Exclui de vez — cadastro e batidas, sem volta. Diferente de
   * `tirarDaEquipe`, que é reversível. Só master, admin e supervisor do
   * próprio setor (ver `podeExcluirDaEquipe`, no domínio).
   */
  excluirDaEquipe(participacaoId: string, motivo?: string): Promise<{ erro?: string }>
  /**
   * Corrige o telefone vinculado a esta participação — é por ele que a
   * pessoa recebe a credencial e os avisos pelo WhatsApp. Cópia de
   * `editarTelefoneFuncionario`, no site.
   */
  corrigirTelefone(participacaoId: string, telefone: string, motivo?: string): Promise<{ erro?: string }>
  /**
   * Marca uma contestação como resolvida — não corrige a batida sozinha
   * (isso é lançar ponto manual, ou corrigir na planilha); só tira a
   * pendência da tela da equipe.
   */
  resolverContestacao(id: string): Promise<{ erro?: string }>

  // ── Planilhas ───────────────────────────────────────────────────────────
  /** O modelo em branco, com as colunas que a importação espera. */
  baixarModelo(): Promise<ArquivoDePlanilha>

  /**
   * A equipe do setor em planilha.
   *
   * `dia` recorta a exportação para um dia específico — é o formato que a
   * produção manda para o cliente no fechamento. Sem ele, sai a equipe inteira.
   */
  exportarEquipe(setorId: string, op?: { dia?: string }): Promise<ArquivoDePlanilha>

  /**
   * Importa a equipe de uma planilha.
   *
   * Devolve o que entrou E o que ficou de fora. Recusar o arquivo inteiro por
   * causa de duas linhas erradas obriga a pessoa a caçar o erro sem pista.
   */
  importarPlanilha(
    setorId: string,
    arquivo: { nome: string; base64: string },
  ): Promise<{ resultado?: ResultadoDaImportacao; erro?: string }>

  // ── Acessos ─────────────────────────────────────────────────────────────
  /** Quem consegue entrar no sistema. Não é a equipe do evento. */
  acessos(filtro?: FiltroDeAcessos): Promise<ListaDeAcessos>

  /**
   * Bloqueia ou libera o login de alguém, sem apagar o histórico.
   *
   * O servidor recusa quando o alvo é quem está pedindo: ninguém se tranca
   * para fora do sistema por engano.
   */
  mudarSituacaoDoAcesso(id: string, ativo: boolean): Promise<{ erro?: string }>

  /**
   * Troca a senha de um acesso — o caminho de "esqueci a senha" enquanto o
   * convite por WhatsApp não existe (ver `criarAcesso`). Ninguém troca a
   * própria senha por aqui: é o fluxo de conta que resolve isso.
   */
  trocarSenhaDoAcesso(id: string, novaSenha: string): Promise<{ erro?: string }>

  /**
   * Apaga o acesso — diferente de `mudarSituacaoDoAcesso`, que só bloqueia o
   * login sem perder o histórico. Só o master apaga; os demais só desativam.
   */
  excluirAcesso(id: string): Promise<{ erro?: string }>

  /** Os eventos com os setores de cada um — todo supervisor nasce num setor. */
  eventosComSetores(): Promise<EventoComSetores[]>

  /**
   * Os operadores de portão da mesma organização deste evento — são da
   * ORGANIZAÇÃO, não deste evento sozinho (não há como prender um perfil
   * sem setor a um evento). Widget na tela do evento, ao lado do cartaz da
   * portaria.
   */
  operadoresDoEvento(eventoId: string): Promise<Acesso[]>

  /**
   * Cria um acesso — supervisor (preso a um setor), operador de portão ou
   * suporte (os dois presos ao evento inteiro, sem setor).
   */
  criarAcesso(dados: NovoAcesso): Promise<{ acesso?: Acesso; erro?: string }>

  // ── Plataforma ──────────────────────────────────────────────────────────
  //
  // Tudo aqui é só do master. O servidor recusa os outros papéis — o menu já
  // esconde, mas menu escondido é arrumação, não segurança.

  /** Os clientes da plataforma. */
  organizacoes(): Promise<ListaDeOrganizacoes>

  /**
   * Cadastra um cliente novo: a organização, o admin dono dela e — se vier
   * preenchido — o primeiro evento.
   */
  criarOrganizacao(dados: DadosDeNovaOrganizacao): Promise<{ organizacao?: Organizacao; erro?: string }>

  /** Suspende ou reativa um cliente. Suspender bloqueia sem apagar histórico. */
  alternarOrganizacao(organizacaoId: string, ativa: boolean): Promise<{ erro?: string }>

  /**
   * A tela de Configurações: a lista de organizações (o seletor de escopo) e
   * o que já foi ligado/desligado no escopo pedido. `organizacaoId: null` =
   * o padrão da PLATAFORMA, que vale pra quem não tiver regra própria.
   */
  permissoesDaOrganizacao(organizacaoId: string | null): Promise<ConfiguracoesDePermissao>

  /**
   * Liga, desliga ou apaga (`permitido: null` volta ao padrão do código)
   * uma capacidade de um papel — numa organização, ou na plataforma inteira
   * (`organizacaoId` nulo). Cópia do site's `salvarPermissao`.
   */
  salvarPermissaoDaOrganizacao(
    organizacaoId: string | null, papel: Papel, chave: string, permitido: boolean | null,
  ): Promise<{ erro?: string }>

  /**
   * A trilha de auditoria — quem alterou o quê. Master vê tudo; os demais
   * gestores só a própria organização; suporte só o que ele mesmo fez (a
   * régua mora no servidor, não aqui). "Visualização simples": período e
   * evento, sem filtro em cascata nem exportação.
   */
  auditoria(filtro?: { eventoId?: string; dias?: number }): Promise<LinhaDeAuditoria[]>

  /** Todo mundo que já foi credenciado por qualquer cliente, por CPF. */
  baseDeFuncionarios(busca?: string): Promise<BaseDeFuncionarios>

  /** A base regional, para montar equipe para o evento de um cliente. */
  encontrarColaborador(filtro?: { busca?: string; cidade?: string }): Promise<BuscaRegional>

  /**
   * A ficha completa de alguém da base: todo evento em que já trabalhou, em
   * qualquer organização. Responde "posso chamar essa pessoa?".
   */
  fichaDaPessoaNaBase(cpf: string): Promise<FichaDaPessoaNaBase>

  /**
   * Coloca a pessoa na equipe de um setor.
   *
   * É o passo que fecha o ciclo: a Base e o Encontre colaborador só acham
   * gente; isto aqui é o "chamei".
   */
  atribuirPessoaAoEvento(cpf: string, setorId: string): Promise<{ resultado?: ResultadoDeAtribuicao; erro?: string }>

  /** O estado do canal de WhatsApp e os templates aprovados pela Meta. */
  painelDoWhatsApp(): Promise<PainelDoWhatsApp>

  // ── Avisos ───────────────────────────────────────────────────────────────
  /** O histórico e as preferências de quem está logado — cada papel vê o que é seu. */
  minhasNotificacoes(): Promise<CentralDeAvisos>

  marcarNotificacaoComoLida(id: string): Promise<{ erro?: string }>
  marcarTodasComoLidas(): Promise<{ erro?: string }>

  /** A lista dos tipos que ficam LIGADOS — o resto desliga. */
  salvarPreferenciasDeAvisos(tiposLigados: TipoDeAviso[]): Promise<{ erro?: string }>

  /**
   * Registra o token do aparelho para receber push.
   *
   * Chamado depois que a pessoa autoriza notificação no sistema — a
   * permissão em si não passa por aqui, é uma pergunta do aparelho, não do
   * servidor.
   */
  registrarTokenDeAviso(token: string, plataforma: 'ios' | 'android' | 'web'): Promise<{ erro?: string }>

  // ── Supervisor ──────────────────────────────────────────────────────────
  painelDaEquipe(eventoId: string): Promise<PainelDaEquipe>

  // ── Veículos ─────────────────────────────────────────────────────────────
  //
  // Só cadastro e consulta: o veículo não bate ponto, não tem QR e não passa
  // pelo scanner. Trazido do site em 11/09/2026.

  /** Os eventos que ESTA pessoa pode cadastrar veículo — mesmo alcance de `podeGerenciarVeiculos`. */
  eventosParaVeiculos(): Promise<EventoEscaneavel[]>

  /** Os veículos já cadastrados de um evento, e os dias em que ele opera. */
  veiculosDoEvento(eventoId: string): Promise<VeiculosDoEvento>

  /**
   * Acha o condutor pelo CPF, DENTRO do evento — é o que preenche o resto do
   * formulário sozinho. Um CPF que existe na base mas não neste evento
   * devolve um erro que diz exatamente isso.
   */
  buscarCondutorPorCpf(
    eventoId: string,
    cpf: string,
  ): Promise<{ condutor?: CondutorEncontrado; erro?: string }>

  /** Cadastra um veículo, sempre vinculado ao CPF de alguém já credenciado no evento. */
  cadastrarVeiculo(
    eventoId: string,
    dados: DadosDeVeiculo,
  ): Promise<{ placa?: string; condutor?: string; erro?: string }>

  excluirVeiculo(veiculoId: string, eventoId: string): Promise<{ erro?: string }>

  // ── Bloquear CPF ────────────────────────────────────────────────────────
  //
  // Quem não pode se cadastrar NESTE evento. Vale para o evento inteiro, não
  // um setor; e só para este evento — a pessoa segue livre em qualquer
  // outro. Trazido do site em 11/09/2026.

  /** Os eventos que ESTA pessoa pode bloquear CPF — mesmo alcance de `podeBloquearCpf`. */
  eventosParaBloqueio(): Promise<EventoEscaneavel[]>

  bloqueiosDoEvento(eventoId: string): Promise<CpfBloqueado[]>

  bloquearCpf(
    eventoId: string,
    cpf: string,
    motivo?: string,
  ): Promise<{ cpf?: string; erro?: string }>

  /** Mesma régua de quem pode bloquear: quem bloqueia pode liberar. */
  desbloquearCpf(bloqueioId: string, eventoId: string): Promise<{ erro?: string }>

  // ── Conferência de equipe ───────────────────────────────────────────────
  //
  // A tela que o supervisor usa 1 dia antes do evento: vê a equipe, tira
  // quem não é dele, confirma. Trazido do site em 11/09/2026.

  /** A visão geral do organizador: setor a setor, quem já confirmou. */
  conferenciasDoEvento(eventoId: string): Promise<LinhaConferencia[]>

  conferenciaDoSetor(setorId: string): Promise<ConferenciaDoSetor>

  /** Tira alguém da equipe durante a conferência — o histórico dela fica. */
  removerDaConferencia(funcionarioId: string, setorId: string): Promise<{ erro?: string }>

  /** Fecha a conferência: carimba quem, quando, e os números. */
  confirmarConferencia(setorId: string): Promise<{ erro?: string }>

  /** O CSV da equipe do setor — pro botão "Baixar planilha" da tela de conferência. */
  planilhaDaConferencia(setorId: string): Promise<ArquivoDePlanilha>

  // ── Relatórios ───────────────────────────────────────────────────────────
  //
  // Presença/ponto da equipe em planilha — não é financeiro. Trazido do site
  // em 11/09/2026.

  /** Os eventos que ESTA pessoa pode exportar — mesmo alcance de `exigirAcessoAoEvento` no site. */
  eventosParaRelatorios(): Promise<EventoEscaneavel[]>

  /** O que a TELA precisa pra se montar — não a planilha em si. */
  resumoDeRelatorios(eventoId: string): Promise<ResumoDeRelatorios>

  /**
   * Todos os setores, uma planilha só. Só para quem gerencia o evento
   * inteiro — supervisor nunca chega aqui (o site recusa: "é só para quem
   * gerencia o evento inteiro").
   */
  relatorioDoEvento(
    eventoId: string,
    periodo: Periodo,
    quem: QuemNoRelatorio,
  ): Promise<ArquivoDePlanilha>

  relatorioDoSetor(
    eventoId: string,
    setorId: string,
    periodo: Periodo,
    quem: QuemNoRelatorio,
  ): Promise<ArquivoDePlanilha>

  /** Todos os setores, um arquivo por setor, num .zip — pronto pra mandar pro fornecedor. */
  relatoriosPorSetorZip(
    eventoId: string,
    periodo: Periodo,
    quem: QuemNoRelatorio,
  ): Promise<ArquivoDePlanilha>

  // ── Lançar ponto manual ──────────────────────────────────────────────────
  //
  // A batida de quem já foi embora — retroativa, com motivo. Diferente do
  // registro assistido: aqui não há foto, a hora é escolhida (no passado), e
  // é ato de gestão — mais restrito. Trazido do site em 11/09/2026.

  /** Os eventos que ESTA pessoa pode lançar ponto — mesmo alcance de `podeBloquearCpf`. */
  eventosParaLancarPonto(): Promise<EventoEscaneavel[]>

  dadosParaLancarPonto(eventoId: string): Promise<DadosParaLancarPonto>

  /**
   * `dataRef` é o dia de TRABALHO a que a batida pertence ('AAAA-MM-DD');
   * `quandoISO`, o instante real. Numa saída de madrugada os dois divergem —
   * a pessoa trabalhou no dia 05 e bateu às 02:00 do dia 06.
   */
  lancarPontoManual(
    funcionarioId: string,
    tipo: TipoBatida,
    dataRef: string,
    quandoISO: string,
    motivo: string,
  ): Promise<{ nome?: string; etapa?: string; erro?: string }>

  // ── Editar colaborador (atalho) ─────────────────────────────────────────
  //
  // Achar a pessoa em TODOS os setores do evento, sem precisar saber em qual
  // ela está — a ficha em si (mover de setor, corrigir CPF, etc.) é a mesma
  // de `fichaDaPessoa`. Trazido do site em 11/09/2026.

  /** Os eventos que ESTA pessoa pode editar colaborador — quem gerencia eventos, e suporte. */
  eventosParaEditarColaborador(): Promise<EventoEscaneavel[]>

  colaboradoresDoEvento(eventoId: string): Promise<BuscaDeColaboradores>

  // ── Suporte de Sistema ───────────────────────────────────────────────────
  //
  // Só o master gerencia — o escopo atravessa organizações, quem contrata é
  // a plataforma. Trazido do site em 11/09/2026.

  dadosDeSuporte(): Promise<DadosDeSuporte>

  criarSuporte(dados: DadosDeNovoSuporte): Promise<{ id?: string; erro?: string }>

  editarSuporte(id: string, dados: EdicaoDeSuporte): Promise<{ erro?: string }>

  /** Diferente de excluir: o histórico do que a pessoa fez continua na Auditoria. */
  revogarSuporte(id: string): Promise<{ erro?: string }>

  // ── Push ───────────────────────────────────────────────────────────────
  //
  // Só guarda o endereço de entrega (o token do aparelho) — não manda
  // notificação nenhuma. Nunca falha de um jeito que interrompa quem está
  // usando o app: registrar push é conveniência, não parte essencial do
  // fluxo.

  registrarTokenDePush(token: string, plataforma: 'ios' | 'android'): Promise<{ erro?: string }>
}
