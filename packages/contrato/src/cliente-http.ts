// O cliente de verdade: a mesma interface, falando HTTP com a API.
//
// ─── A DECISÃO QUE ESTE ARQUIVO INTEIRO EXISTE PARA ACERTAR ─────────────────
//
// Traduzir uma resposta HTTP em "o servidor decidiu não" ou "o servidor não
// respondeu". A fila offline trata os dois de formas opostas, e errar aqui
// significa uma das duas coisas:
//
//   recusa lida como falha    o aparelho reenvia para sempre algo que nunca vai
//                             passar, gastando bateria e rede de evento;
//
//   falha lida como recusa    a fila descarta uma batida que a pessoa fez de
//                             verdade, e ela só descobre no pagamento.
//
// A régua é a que a própria API já documenta no endpoint de batidas:
//
//   sem resposta (fetch estourou)   transporte — a rede caiu
//   5xx                             transporte — o servidor caiu, e volta
//   408 e 429                       transporte — "demorou" e "devagar aí"
//   401                             transporte — a sessão precisa ser renovada,
//                                   e depois disso a mesma batida vale
//   outros 4xx                      DECISÃO — reenviar não muda nada
//
// O 401 no meio dos transportes não é descuido. Do ponto de vista da fila, ele
// é temporário: o token venceu, a guarda renova, e a mesma batida sobe. Tratar
// como decisão descartaria a batida de quem ficou uma hora sem abrir o app.

import type { ClienteApi } from './cliente.js'
import type {
  Acesso, AtividadesDoEvento, BatidaAssistida, CandidatoLocalizado,
  ConferenciaPorCpf, ConviteDoEvento, DiaDaParticipacao, EnvioDeBatida, Eu,
  ArquivoDePlanilha, ConfiguracaoDoEvento, DadosDeNovoEvento, EdicaoDoEvento, EquipeDoSetor,
  EventoComSetores, EventoDetalhado, EventoEscaneavel, FichaDaPessoa,
  FichaLocalizada,
  FiltroDeAcessos, FinanceiroDaParticipacao, ListaDeAcessos,
  NovoAcesso, Painel, PainelDaEquipe, Portaria,
  BaseDeFuncionarios, BuscaRegional, CentralDeAvisos, DadosDeNovaOrganizacao, FichaDaPessoaNaBase,
  ListaDeOrganizacoes, Organizacao, PainelDoWhatsApp, ResultadoDeAtribuicao,
  ResultadoDaImportacao,
  ResultadoDaLeitura, ResultadoDosDias, RespostaDeBatida, ResumoParticipacao,
  SetorDetalhado, Sessao, TipoDeAviso, VisaoDeAtividade,
  CondutorEncontrado, DadosDeVeiculo, VeiculosDoEvento, CpfBloqueado,
  ConferenciaDoSetor, Periodo, QuemNoRelatorio, ResumoDeRelatorios,
  DadosParaLancarPonto, BuscaDeColaboradores,
  DadosDeSuporte, DadosDeNovoSuporte, EdicaoDeSuporte,
} from './tipos.js'
import type { TipoBatida } from './comum.js'

export type OpcoesDoClienteHttp = {
  /** Onde a API mora. Sem barra no fim. */
  base: string
  /**
   * De onde vem o token de cada chamada.
   *
   * Injetado, e não guardado aqui, porque o token GIRA: quem sabe se ele ainda
   * vale, e quem renova, é a guarda da sessão no app. Um cliente que guardasse
   * o token teria a sua própria cópia, e as duas divergiriam na primeira
   * renovação.
   */
  credencial: () => Promise<string | null>
  /** Injetável para o teste falar com o servidor sem abrir porta. */
  buscar?: typeof fetch
  /** Avisado quando o servidor diz que a sessão morreu de vez. */
  aoPerderSessao?: () => void
}

/** O que a fila precisa saber: isto aqui volta. */
export class FalhaDeTransporte extends Error {
  constructor(mensagem = 'Sem conexão com o servidor.') {
    super(mensagem)
    this.name = 'FalhaDeTransporte'
  }
}

/**
 * O que ainda não existe do outro lado.
 *
 * As telas de painel foram construídas contra o servidor falso, e os endpoints
 * delas ainda não estão na API. Falhar com o nome do método é melhor que
 * devolver lista vazia: vazio parece "não tem nada", e mandaria alguém procurar
 * o problema no banco.
 */
export class AindaNaoNaApi extends Error {
  constructor(metodo: string) {
    super(`\`${metodo}\` ainda não existe na API. A tela está rodando contra o servidor falso.`)
    this.name = 'AindaNaoNaApi'
  }
}

type Resposta = { status: number; corpo: Record<string, unknown> }

export class ClienteHttp implements ClienteApi {
  private readonly base: string
  private readonly credencial: () => Promise<string | null>
  private readonly buscar: typeof fetch
  private readonly aoPerderSessao: (() => void) | undefined

  constructor(op: OpcoesDoClienteHttp) {
    this.base = op.base.replace(/\/+$/, '')
    this.credencial = op.credencial
    this.buscar = op.buscar ?? globalThis.fetch.bind(globalThis)
    this.aoPerderSessao = op.aoPerderSessao
  }

  // ─── O transporte ─────────────────────────────────────────────────────────

  private async pedir(
    caminho: string,
    op: { metodo?: string; corpo?: unknown; semToken?: boolean } = {},
  ): Promise<Resposta> {
    const cabecalhos: Record<string, string> = { Accept: 'application/json' }
    if (op.corpo !== undefined) cabecalhos['Content-Type'] = 'application/json'

    if (!op.semToken) {
      const token = await this.credencial()
      // Sem token não adianta nem sair: seria um 401 garantido, e a fila
      // contaria uma tentativa à toa.
      if (!token) throw new FalhaDeTransporte('Sessão não disponível neste aparelho.')
      cabecalhos.Authorization = `Bearer ${token}`
    }

    let resposta: Response
    try {
      resposta = await this.buscar(`${this.base}${caminho}`, {
        method: op.metodo ?? 'GET',
        headers: cabecalhos,
        ...(op.corpo !== undefined ? { body: JSON.stringify(op.corpo) } : {}),
      })
    } catch {
      // A rede caiu, o DNS falhou, o aparelho está em modo avião. Volta.
      throw new FalhaDeTransporte()
    }

    /*
     * 401 é transporte — EXCETO em quem entra sem sessão nenhuma.
     *
     * Sem token não existe "sessão que caiu": é `pedirCodigo`/`entrar`/
     * `entrarComSenha`, e um 401 ali só pode ser código ou senha errados —
     * uma DECISÃO, do mesmo jeito que `renovar` já trata a própria. Se
     * caísse na regra geral, a tela de login mostraria "sessão expirada,
     * entre de novo" para quem simplesmente digitou a senha errada.
     */
    if (resposta.status === 401 && !op.semToken) {
      this.aoPerderSessao?.()
      throw new FalhaDeTransporte('Sessão expirada. Entre de novo.')
    }

    // 5xx, 408 e 429 são transporte: o servidor caiu, demorou ou pediu calma.
    if (resposta.status >= 500 || resposta.status === 408 || resposta.status === 429) {
      throw new FalhaDeTransporte('O servidor não respondeu. Tentando de novo.')
    }

    let corpo: Record<string, unknown> = {}
    try {
      corpo = (await resposta.json()) as Record<string, unknown>
    } catch {
      /*
       * Resposta sem corpo legível.
       *
       * Num 2xx isso é só um endpoint que não devolve nada. Num 4xx, quem
       * chamou fica sem motivo para mostrar — e é por isso que cada método
       * abaixo tem um texto de reserva em vez de mostrar vazio.
       */
    }

    return { status: resposta.status, corpo }
  }

  /** O texto de erro que o servidor mandou, ou um de reserva. */
  private erroDe(r: Resposta, reserva: string): string {
    return typeof r.corpo.erro === 'string' && r.corpo.erro ? r.corpo.erro : reserva
  }

  // ─── Identidade ───────────────────────────────────────────────────────────

  async entrarComSenha(identificador: string, senha: string): Promise<{ sessao?: Sessao; erro?: string }> {
    const r = await this.pedir('/v1/entrar/senha', {
      metodo: 'POST',
      corpo: { identificador, senha },
      semToken: true,
    })
    if (r.status >= 400 || !r.corpo.sessao) {
      return { erro: this.erroDe(r, 'CPF ou senha incorretos.') }
    }
    return { sessao: r.corpo.sessao as Sessao }
  }

  async pedirCodigo(telefone: string) {
    const r = await this.pedir('/v1/entrar/codigo', {
      metodo: 'POST',
      corpo: { telefone },
      semToken: true,
    })
    if (r.status >= 400) {
      return { enviado: false, erro: this.erroDe(r, 'Não conseguimos enviar o código.') }
    }
    return {
      enviado: r.corpo.enviado === true,
      ...(typeof r.corpo.erro === 'string' ? { erro: r.corpo.erro } : {}),
    }
  }

  async entrar(telefone: string, codigo: string) {
    const r = await this.pedir('/v1/entrar', {
      metodo: 'POST',
      corpo: { telefone, codigo },
      semToken: true,
    })
    if (r.status >= 400 || !r.corpo.sessao) {
      return { erro: this.erroDe(r, 'Código incorreto.') }
    }
    return { sessao: r.corpo.sessao as Sessao }
  }

  async renovar(renovacao: string) {
    /*
     * A renovação NÃO passa pelo caminho do 401.
     *
     * Um 401 aqui significa que a sessão morreu de verdade — é decisão, e quem
     * chamou precisa saber para mandar a pessoa entrar de novo. Se ela caísse
     * na regra geral, viraria "falha de transporte" e a guarda ficaria
     * tentando renovar para sempre uma sessão que não existe mais.
     */
    let resposta: Response
    try {
      resposta = await this.buscar(`${this.base}/v1/renovar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ renovacao }),
      })
    } catch {
      throw new FalhaDeTransporte()
    }

    if (resposta.status >= 500) throw new FalhaDeTransporte()

    let corpo: Record<string, unknown> = {}
    try {
      corpo = (await resposta.json()) as Record<string, unknown>
    } catch { /* sem corpo: cai no erro de reserva abaixo */ }

    if (resposta.status >= 400 || !corpo.sessao) {
      return {
        erro: typeof corpo.erro === 'string' ? corpo.erro : 'Sessão expirada. Entre de novo.',
      }
    }
    return { sessao: corpo.sessao as Sessao }
  }

  async eu(): Promise<Eu> {
    const r = await this.pedir('/v1/eu')
    if (r.status >= 400) throw new Error(this.erroDe(r, 'Conta não encontrada.'))
    return r.corpo as unknown as Eu
  }

  // ─── Entrar num evento ────────────────────────────────────────────────────

  /*
   * ─── SOBRE O FORMATO DAS RESPOSTAS ────────────────────────────────────────
   *
   * A API devolve o RECURSO direto no corpo — o convite, a participação, a
   * lista de dias — e usa `{ erro }` só quando recusa. Ela não embrulha em
   * `{ convite: ... }`.
   *
   * A primeira versão deste cliente assumiu o embrulho, e o resultado foi o
   * pior tipo de bug: nada estourava. `r.corpo.convite` vinha `undefined`, o
   * código caía no ramo de erro e a tela dizia "não encontramos um evento com
   * este código" — uma mensagem plausível, sobre um evento que existia.
   *
   * Foi o teste do roteiro compartilhado que achou. Nenhum teste de unidade
   * acharia: os dois lados estavam certos sozinhos.
   */
  async consultarConvite(codigo: string) {
    const r = await this.pedir(`/v1/convites/${encodeURIComponent(codigo)}`)
    if (r.status >= 400) {
      return { erro: this.erroDe(r, 'Não encontramos um evento com este código.') }
    }
    return { convite: r.corpo as unknown as ConviteDoEvento }
  }

  async entrarNoEvento(codigo: string, respostas: Record<string, string>) {
    const r = await this.pedir('/v1/participacoes', {
      metodo: 'POST',
      corpo: { codigo, respostas },
    })
    // 201: a participação foi CRIADA. Tratar só 200 como sucesso faria toda
    // inscrição bem-sucedida aparecer como falha.
    if (r.status >= 400) {
      return { erro: this.erroDe(r, 'Não conseguimos concluir sua inscrição.') }
    }
    return { participacao: r.corpo as unknown as ResumoParticipacao }
  }

  // ─── O que é meu ──────────────────────────────────────────────────────────

  async minhasParticipacoes(): Promise<ResumoParticipacao[]> {
    const r = await this.pedir('/v1/participacoes')
    if (r.status >= 400) throw new Error(this.erroDe(r, 'Não conseguimos buscar seus eventos.'))
    return (Array.isArray(r.corpo) ? r.corpo : []) as unknown as ResumoParticipacao[]
  }

  async meusDias(participacaoId: string): Promise<DiaDaParticipacao[]> {
    const r = await this.pedir(`/v1/participacoes/${encodeURIComponent(participacaoId)}/dias`)
    if (r.status >= 400) throw new Error(this.erroDe(r, 'Não conseguimos buscar seus dias.'))
    return (Array.isArray(r.corpo) ? r.corpo : []) as unknown as DiaDaParticipacao[]
  }

  async meuFinanceiro(participacaoId: string): Promise<FinanceiroDaParticipacao> {
    const r = await this.pedir(`/v1/participacoes/${encodeURIComponent(participacaoId)}/financeiro`)
    if (r.status >= 400) throw new Error(this.erroDe(r, 'Não conseguimos buscar seu acerto.'))
    return r.corpo as unknown as FinanceiroDaParticipacao
  }

  async meuQr(participacaoId: string) {
    const r = await this.pedir(`/v1/participacoes/${encodeURIComponent(participacaoId)}/qr`)
    if (r.status >= 400) throw new Error(this.erroDe(r, 'Não conseguimos gerar seu QR.'))
    return r.corpo as unknown as { codigo: string; etapa: string }
  }

  // ─── Bater ponto ──────────────────────────────────────────────────────────

  async registrarBatida(envio: EnvioDeBatida): Promise<RespostaDeBatida> {
    /*
     * A FOTO AINDA NÃO SOBE POR AQUI.
     *
     * O contrato carrega `fotoBase64` e a API espera `fotoPath` — ela quer o
     * caminho de um arquivo que já está no storage, não a imagem. É o desenho
     * certo (a foto não deve atravessar a API num pico de evento), mas o envio
     * direto ao storage ainda não existe.
     *
     * Mandar a base64 num campo que a API ignora seria pior que não mandar:
     * gastaria a rede do evento carregando uma imagem que ninguém guarda, e a
     * tela diria "registrado com foto" sem foto nenhuma. Enquanto o storage não
     * entra, a batida sobe sem imagem — e isso está anotado no backlog.
     */
    const r = await this.pedir('/v1/batidas', {
      metodo: 'POST',
      corpo: {
        id: envio.id,
        participacaoId: envio.participacaoId,
        tipo: envio.tipo,
        registradoEm: envio.registradoEm,
        ...(envio.lat !== undefined ? { lat: envio.lat } : {}),
        ...(envio.lng !== undefined ? { lng: envio.lng } : {}),
      },
    })

    // 422 é a recusa por regra, e o corpo já vem no formato do contrato.
    if (r.status === 200 || r.status === 422) {
      return r.corpo as unknown as RespostaDeBatida
    }
    // 400 é pedido malformado — culpa nossa, e reenviar igual não resolve.
    return { situacao: 'recusado', motivo: this.erroDe(r, 'O servidor não aceitou este registro.') }
  }

  // ─── Painel ───────────────────────────────────────────────────────────────

  async painel(): Promise<Painel> { throw new AindaNaoNaApi('painel') }

  // ─── Escanear QR ──────────────────────────────────────────────────────────

  async eventosParaEscanear(): Promise<EventoEscaneavel[]> {
    throw new AindaNaoNaApi('eventosParaEscanear')
  }

  async registrarPorQr(_eventoId: string, _codigoLido: string): Promise<ResultadoDaLeitura> {
    void _eventoId; void _codigoLido
    throw new AindaNaoNaApi('registrarPorQr')
  }

  async conferirPorCpf(_eventoId: string, _cpf: string): Promise<ConferenciaPorCpf> {
    void _eventoId; void _cpf
    throw new AindaNaoNaApi('conferirPorCpf')
  }

  // ─── Registrar ponto por outra pessoa ─────────────────────────────────────

  async localizarPessoa(_termo: string): Promise<{
    ficha?: FichaLocalizada
    candidatos?: CandidatoLocalizado[]
    erro?: string
  }> {
    void _termo
    throw new AindaNaoNaApi('localizarPessoa')
  }

  async abrirFicha(_participacaoId: string): Promise<{ ficha?: FichaLocalizada; erro?: string }> {
    void _participacaoId
    throw new AindaNaoNaApi('abrirFicha')
  }

  async registrarPresencaAssistida(
    _participacaoId: string, _dados: BatidaAssistida,
  ): Promise<{ nome?: string; etapa?: string; erro?: string }> {
    void _participacaoId; void _dados
    throw new AindaNaoNaApi('registrarPresencaAssistida')
  }

  // ─── Atividades ───────────────────────────────────────────────────────────

  async eventosParaAcompanhar(): Promise<EventoEscaneavel[]> {
    throw new AindaNaoNaApi('eventosParaAcompanhar')
  }

  async atividades(
    _eventoId: string,
    _opcoes?: { visao?: VisaoDeAtividade; dia?: string },
  ): Promise<AtividadesDoEvento> {
    void _eventoId; void _opcoes
    throw new AindaNaoNaApi('atividades')
  }

  async criarEvento(_dados: DadosDeNovoEvento): Promise<{ eventoId?: string; erro?: string }> {
    void _dados
    throw new AindaNaoNaApi('criarEvento')
  }

  // ─── O evento por dentro ──────────────────────────────────────────────────

  async evento(_eventoId: string): Promise<EventoDetalhado> {
    void _eventoId
    throw new AindaNaoNaApi('evento')
  }

  async alternarPortaria(
    _eventoId: string, _aberta: boolean,
  ): Promise<{ portaria?: Portaria; erro?: string }> {
    void _eventoId; void _aberta
    throw new AindaNaoNaApi('alternarPortaria')
  }

  async trocarTokenDaPortaria(
    _eventoId: string,
  ): Promise<{ portaria?: Portaria; erro?: string }> {
    void _eventoId
    throw new AindaNaoNaApi('trocarTokenDaPortaria')
  }

  async configuracaoDoEvento(_eventoId: string): Promise<ConfiguracaoDoEvento> {
    void _eventoId
    throw new AindaNaoNaApi('configuracaoDoEvento')
  }

  async salvarEvento(_eventoId: string, _dados: EdicaoDoEvento): Promise<{ erro?: string }> {
    void _eventoId; void _dados
    throw new AindaNaoNaApi('salvarEvento')
  }

  async salvarDiasDeTrabalho(
    _eventoId: string, _dias: string[],
  ): Promise<{ resultado?: ResultadoDosDias; erro?: string }> {
    void _eventoId; void _dias
    throw new AindaNaoNaApi('salvarDiasDeTrabalho')
  }

  async criarSetor(
    _eventoId: string,
    _dados: {
      nome: string
      estimado?: number | null
      valorPorPessoa?: number | null
      supervisor: { nome: string; cpf: string; telefone: string }
    },
  ): Promise<{ setor?: SetorDetalhado; erro?: string }> {
    void _eventoId; void _dados
    throw new AindaNaoNaApi('criarSetor')
  }

  async equipeDoSetor(_setorId: string): Promise<EquipeDoSetor> {
    void _setorId
    throw new AindaNaoNaApi('equipeDoSetor')
  }

  async fichaDaPessoa(_participacaoId: string): Promise<FichaDaPessoa> {
    void _participacaoId
    throw new AindaNaoNaApi('fichaDaPessoa')
  }

  async moverDeSetor(_participacaoId: string, _setorId: string): Promise<{ erro?: string }> {
    void _participacaoId; void _setorId
    throw new AindaNaoNaApi('moverDeSetor')
  }

  async tornarSupervisor(_participacaoId: string, _telefone: string): Promise<{ erro?: string }> {
    void _participacaoId; void _telefone
    throw new AindaNaoNaApi('tornarSupervisor')
  }

  async marcarPagamento(_participacaoId: string, _pago: boolean): Promise<{ erro?: string }> {
    void _participacaoId; void _pago
    throw new AindaNaoNaApi('marcarPagamento')
  }

  async salvarValorAReceber(_participacaoId: string, _valor: number): Promise<{ erro?: string }> {
    void _participacaoId; void _valor
    throw new AindaNaoNaApi('salvarValorAReceber')
  }

  // ─── Planilhas ────────────────────────────────────────────────────────────

  async baixarModelo(): Promise<ArquivoDePlanilha> {
    throw new AindaNaoNaApi('baixarModelo')
  }

  async exportarEquipe(_setorId: string, _op?: { dia?: string }): Promise<ArquivoDePlanilha> {
    void _setorId; void _op
    throw new AindaNaoNaApi('exportarEquipe')
  }

  async importarPlanilha(
    _setorId: string,
    _arquivo: { nome: string; base64: string },
  ): Promise<{ resultado?: ResultadoDaImportacao; erro?: string }> {
    void _setorId; void _arquivo
    throw new AindaNaoNaApi('importarPlanilha')
  }

  // ─── Acessos ──────────────────────────────────────────────────────────────

  async acessos(_filtro?: FiltroDeAcessos): Promise<ListaDeAcessos> {
    void _filtro
    throw new AindaNaoNaApi('acessos')
  }

  async mudarSituacaoDoAcesso(_id: string, _ativo: boolean): Promise<{ erro?: string }> {
    void _id; void _ativo
    throw new AindaNaoNaApi('mudarSituacaoDoAcesso')
  }

  async eventosComSetores(): Promise<EventoComSetores[]> {
    throw new AindaNaoNaApi('eventosComSetores')
  }

  async criarAcesso(_dados: NovoAcesso): Promise<{ acesso?: Acesso; erro?: string }> {
    void _dados
    throw new AindaNaoNaApi('criarAcesso')
  }

  // ─── Plataforma ───────────────────────────────────────────────────────────

  async organizacoes(): Promise<ListaDeOrganizacoes> {
    throw new AindaNaoNaApi('organizacoes')
  }

  async criarOrganizacao(_dados: DadosDeNovaOrganizacao): Promise<{ organizacao?: Organizacao; erro?: string }> {
    void _dados
    throw new AindaNaoNaApi('criarOrganizacao')
  }

  async alternarOrganizacao(_id: string, _ativa: boolean): Promise<{ erro?: string }> {
    void _id; void _ativa
    throw new AindaNaoNaApi('alternarOrganizacao')
  }

  async baseDeFuncionarios(_busca?: string): Promise<BaseDeFuncionarios> {
    void _busca
    throw new AindaNaoNaApi('baseDeFuncionarios')
  }

  async encontrarColaborador(
    _filtro?: { busca?: string; cidade?: string },
  ): Promise<BuscaRegional> {
    void _filtro
    throw new AindaNaoNaApi('encontrarColaborador')
  }

  async fichaDaPessoaNaBase(_cpf: string): Promise<FichaDaPessoaNaBase> {
    void _cpf
    throw new AindaNaoNaApi('fichaDaPessoaNaBase')
  }

  async atribuirPessoaAoEvento(
    _cpf: string, _setorId: string,
  ): Promise<{ resultado?: ResultadoDeAtribuicao; erro?: string }> {
    void _cpf; void _setorId
    throw new AindaNaoNaApi('atribuirPessoaAoEvento')
  }

  async painelDoWhatsApp(): Promise<PainelDoWhatsApp> {
    throw new AindaNaoNaApi('painelDoWhatsApp')
  }

  // ─── Avisos ───────────────────────────────────────────────────────────────

  async minhasNotificacoes(): Promise<CentralDeAvisos> {
    throw new AindaNaoNaApi('minhasNotificacoes')
  }

  async marcarNotificacaoComoLida(_id: string): Promise<{ erro?: string }> {
    void _id
    throw new AindaNaoNaApi('marcarNotificacaoComoLida')
  }

  async marcarTodasComoLidas(): Promise<{ erro?: string }> {
    throw new AindaNaoNaApi('marcarTodasComoLidas')
  }

  async salvarPreferenciasDeAvisos(_tiposLigados: TipoDeAviso[]): Promise<{ erro?: string }> {
    void _tiposLigados
    throw new AindaNaoNaApi('salvarPreferenciasDeAvisos')
  }

  async registrarTokenDeAviso(
    _token: string, _plataforma: 'ios' | 'android' | 'web',
  ): Promise<{ erro?: string }> {
    void _token; void _plataforma
    throw new AindaNaoNaApi('registrarTokenDeAviso')
  }

  // ─── Supervisor ───────────────────────────────────────────────────────────

  async painelDaEquipe(_eventoId: string): Promise<PainelDaEquipe> {
    void _eventoId
    const r = await this.pedir('/v1/equipe')
    if (r.status >= 400) throw new Error(this.erroDe(r, 'Não conseguimos buscar o painel.'))
    return r.corpo as unknown as PainelDaEquipe
  }

  // ─── Veículos ───────────────────────────────────────────────────────────

  async eventosParaVeiculos(): Promise<EventoEscaneavel[]> {
    throw new AindaNaoNaApi('eventosParaVeiculos')
  }

  async veiculosDoEvento(_eventoId: string): Promise<VeiculosDoEvento> {
    void _eventoId
    throw new AindaNaoNaApi('veiculosDoEvento')
  }

  async buscarCondutorPorCpf(
    _eventoId: string, _cpf: string,
  ): Promise<{ condutor?: CondutorEncontrado; erro?: string }> {
    void _eventoId; void _cpf
    throw new AindaNaoNaApi('buscarCondutorPorCpf')
  }

  async cadastrarVeiculo(
    _eventoId: string, _dados: DadosDeVeiculo,
  ): Promise<{ placa?: string; condutor?: string; erro?: string }> {
    void _eventoId; void _dados
    throw new AindaNaoNaApi('cadastrarVeiculo')
  }

  async excluirVeiculo(_veiculoId: string, _eventoId: string): Promise<{ erro?: string }> {
    void _veiculoId; void _eventoId
    throw new AindaNaoNaApi('excluirVeiculo')
  }

  // ─── Bloquear CPF ─────────────────────────────────────────────────────────

  async eventosParaBloqueio(): Promise<EventoEscaneavel[]> {
    throw new AindaNaoNaApi('eventosParaBloqueio')
  }

  async bloqueiosDoEvento(_eventoId: string): Promise<CpfBloqueado[]> {
    void _eventoId
    throw new AindaNaoNaApi('bloqueiosDoEvento')
  }

  async bloquearCpf(
    _eventoId: string, _cpf: string, _motivo?: string,
  ): Promise<{ cpf?: string; erro?: string }> {
    void _eventoId; void _cpf; void _motivo
    throw new AindaNaoNaApi('bloquearCpf')
  }

  async desbloquearCpf(_bloqueioId: string, _eventoId: string): Promise<{ erro?: string }> {
    void _bloqueioId; void _eventoId
    throw new AindaNaoNaApi('desbloquearCpf')
  }

  // ─── Conferência de equipe ────────────────────────────────────────────────

  async conferenciaDoSetor(_setorId: string): Promise<ConferenciaDoSetor> {
    void _setorId
    throw new AindaNaoNaApi('conferenciaDoSetor')
  }

  async removerDaConferencia(_funcionarioId: string, _setorId: string): Promise<{ erro?: string }> {
    void _funcionarioId; void _setorId
    throw new AindaNaoNaApi('removerDaConferencia')
  }

  async confirmarConferencia(_setorId: string): Promise<{ erro?: string }> {
    void _setorId
    throw new AindaNaoNaApi('confirmarConferencia')
  }

  // ─── Relatórios ───────────────────────────────────────────────────────────

  async eventosParaRelatorios(): Promise<EventoEscaneavel[]> {
    throw new AindaNaoNaApi('eventosParaRelatorios')
  }

  async resumoDeRelatorios(_eventoId: string): Promise<ResumoDeRelatorios> {
    void _eventoId
    throw new AindaNaoNaApi('resumoDeRelatorios')
  }

  async relatorioDoEvento(
    _eventoId: string, _periodo: Periodo, _quem: QuemNoRelatorio,
  ): Promise<ArquivoDePlanilha> {
    void _eventoId; void _periodo; void _quem
    throw new AindaNaoNaApi('relatorioDoEvento')
  }

  async relatorioDoSetor(
    _eventoId: string, _setorId: string, _periodo: Periodo, _quem: QuemNoRelatorio,
  ): Promise<ArquivoDePlanilha> {
    void _eventoId; void _setorId; void _periodo; void _quem
    throw new AindaNaoNaApi('relatorioDoSetor')
  }

  async relatoriosPorSetorZip(
    _eventoId: string, _periodo: Periodo, _quem: QuemNoRelatorio,
  ): Promise<ArquivoDePlanilha> {
    void _eventoId; void _periodo; void _quem
    throw new AindaNaoNaApi('relatoriosPorSetorZip')
  }

  // ─── Lançar ponto manual ──────────────────────────────────────────────────

  async eventosParaLancarPonto(): Promise<EventoEscaneavel[]> {
    throw new AindaNaoNaApi('eventosParaLancarPonto')
  }

  async dadosParaLancarPonto(_eventoId: string): Promise<DadosParaLancarPonto> {
    void _eventoId
    throw new AindaNaoNaApi('dadosParaLancarPonto')
  }

  async lancarPontoManual(
    _funcionarioId: string, _tipo: TipoBatida, _dataRef: string, _quandoISO: string, _motivo: string,
  ): Promise<{ nome?: string; etapa?: string; erro?: string }> {
    void _funcionarioId; void _tipo; void _dataRef; void _quandoISO; void _motivo
    throw new AindaNaoNaApi('lancarPontoManual')
  }

  // ─── Editar colaborador (atalho) ──────────────────────────────────────────

  async eventosParaEditarColaborador(): Promise<EventoEscaneavel[]> {
    throw new AindaNaoNaApi('eventosParaEditarColaborador')
  }

  async colaboradoresDoEvento(_eventoId: string): Promise<BuscaDeColaboradores> {
    void _eventoId
    throw new AindaNaoNaApi('colaboradoresDoEvento')
  }

  // ─── Suporte de Sistema ───────────────────────────────────────────────────

  async dadosDeSuporte(): Promise<DadosDeSuporte> {
    throw new AindaNaoNaApi('dadosDeSuporte')
  }

  async criarSuporte(_dados: DadosDeNovoSuporte): Promise<{ id?: string; erro?: string }> {
    void _dados
    throw new AindaNaoNaApi('criarSuporte')
  }

  async editarSuporte(_id: string, _dados: EdicaoDeSuporte): Promise<{ erro?: string }> {
    void _id; void _dados
    throw new AindaNaoNaApi('editarSuporte')
  }

  async revogarSuporte(_id: string): Promise<{ erro?: string }> {
    void _id
    throw new AindaNaoNaApi('revogarSuporte')
  }
}
