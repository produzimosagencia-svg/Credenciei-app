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
  ArquivoDePlanilha, ConfiguracaoDoEvento, EdicaoDoEvento, EquipeDoSetor,
  EventoComSetores, EventoDetalhado, EventoEscaneavel, FichaDaPessoa,
  FichaLocalizada, FiltroDeAcessos, FinanceiroDaParticipacao, ListaDeAcessos,
  MomentoDaLeitura, NovoAcesso, Painel, PainelDaEquipe, Portaria,
  ResultadoDaImportacao, ResultadoDaLeitura, ResultadoDosDias, RespostaDeBatida,
  ResumoParticipacao, SetorDetalhado, Sessao,
} from './tipos.js'

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
  /** O código do QR para a etapa de hoje daquele evento. */
  meuQr(participacaoId: string): Promise<{ codigo: string; etapa: string }>

  // ── Bater ponto ─────────────────────────────────────────────────────────
  /** Lança exceção em falha de transporte; devolve `recusado` em decisão. */
  registrarBatida(envio: EnvioDeBatida): Promise<RespostaDeBatida>

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

  /** Lê o crachá e grava a presença. A validação é toda do servidor. */
  registrarPorQr(
    eventoId: string,
    codigoLido: string,
    momento: MomentoDaLeitura,
  ): Promise<ResultadoDaLeitura>

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
   * Grava a batida pendente daquela pessoa, com a foto de quem a validou.
   *
   * Não recebe qual etapa gravar: quem decide é o servidor, pela pendência.
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

  /** O log da operação: cada batida, na ordem em que aconteceu. */
  atividades(eventoId: string): Promise<AtividadesDoEvento>

  // ── O evento por dentro ─────────────────────────────────────────────────
  /** A tela de configuração de um evento: setores, progresso e portaria. */
  evento(eventoId: string): Promise<EventoDetalhado>

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

  /** Cria um setor (fornecedor) do evento. */
  criarSetor(
    eventoId: string,
    dados: { nome: string; estimado?: number | null; valorPorPessoa?: number | null },
  ): Promise<{ setor?: SetorDetalhado; erro?: string }>

  /** A equipe de um setor, com o estado de cada pessoa em cada etapa. */
  equipeDoSetor(setorId: string): Promise<EquipeDoSetor>

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

  /** Os eventos com os setores de cada um — todo supervisor nasce num setor. */
  eventosComSetores(): Promise<EventoComSetores[]>

  /** Cria o acesso de um supervisor, preso a um setor. */
  criarAcesso(dados: NovoAcesso): Promise<{ acesso?: Acesso; erro?: string }>

  // ── Supervisor ──────────────────────────────────────────────────────────
  painelDaEquipe(eventoId: string): Promise<PainelDaEquipe>
}
