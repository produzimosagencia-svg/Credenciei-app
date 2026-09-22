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
  Acesso, AtividadesDoEvento, AvisoPendente, BatidaAssistida, CandidatoLocalizado,
  ConferenciaPorCpf, ConviteDoEvento, DiaDaParticipacao, EnvioDeBatida, Eu,
  ArquivoDePlanilha, ConfiguracaoDoEvento, ConfiguracaoDoMeio, DadosDeNovoEvento, EdicaoDoEvento, EquipeDoSetor,
  EventoComSetores, EventoDetalhado, EventoEscaneavel, FichaDaPessoa,
  FichaLocalizada,
  FiltroDeAcessos, FinanceiroDaParticipacao, ListaDeAcessos,
  NovoAcesso, Painel, PainelDaEquipe, Portaria, LinkCadastroIndividual,
  BaseDeFuncionarios, BuscaRegional, CentralDeAvisos, DadosDeNovaOrganizacao, FichaDaPessoaNaBase,
  ListaDeOrganizacoes, Organizacao, PainelDoWhatsApp, ResultadoDeAtribuicao,
  ResultadoDaImportacao,
  ResultadoDaLeitura, ResultadoDosDias, RespostaDeBatida, ResumoParticipacao,
  SetorDetalhado, Sessao, TipoDeAviso, VisaoDeAtividade,
  CondutorEncontrado, DadosDeVeiculo, VeiculosDoEvento, CpfBloqueado,
  ConferenciaDoSetor, LinhaConferencia, Periodo, QuemNoRelatorio, ResumoDeRelatorios,
  DadosParaLancarPonto, BuscaDeColaboradores,
  DadosDeSuporte, DadosDeNovoSuporte, EdicaoDeSuporte,
  ConfiguracoesDePermissao, LinhaDeAuditoria, MinhasPermissoes,
} from './tipos.js'
import type { Papel } from '@credenciei/dominio'
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

  async minhasPermissoes(): Promise<MinhasPermissoes> {
    const r = await this.pedir('/v1/minhas-permissoes')
    if (r.status >= 400) throw new Error(this.erroDe(r, 'Não conseguimos buscar suas permissões.'))
    return r.corpo as unknown as MinhasPermissoes
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

  async excluirMinhaConta(): Promise<{ erro?: string }> {
    const r = await this.pedir('/v1/minha-conta/excluir', { metodo: 'POST' })
    if (r.status >= 400) return { erro: this.erroDe(r, 'Não conseguimos excluir sua conta.') }
    return r.corpo as unknown as { erro?: string }
  }

  async meuQr(participacaoId: string) {
    const r = await this.pedir(`/v1/participacoes/${encodeURIComponent(participacaoId)}/qr`)
    if (r.status >= 400) throw new Error(this.erroDe(r, 'Não conseguimos gerar seu QR.'))
    return r.corpo as unknown as { codigo: string; etapa: string; liberado: boolean; liberaEm: string | null }
  }

  async avisosPendentes(eventoId: string): Promise<AvisoPendente[]> {
    const r = await this.pedir(`/v1/eventos/${encodeURIComponent(eventoId)}/avisos-pendentes`)
    if (r.status >= 400) throw new Error(this.erroDe(r, 'Não conseguimos buscar os avisos.'))
    return r.corpo as unknown as AvisoPendente[]
  }

  async marcarAvisoVisto(avisoId: string): Promise<{ erro?: string }> {
    const r = await this.pedir(`/v1/avisos/${encodeURIComponent(avisoId)}/visto`, { metodo: 'POST' })
    if (r.status >= 400) return { erro: this.erroDe(r, 'Não conseguimos confirmar.') }
    return {}
  }

  // ─── Bater ponto ──────────────────────────────────────────────────────────

  async registrarBatida(envio: EnvioDeBatida): Promise<RespostaDeBatida> {
    /*
     * A foto sobe DENTRO do pedido de bater ponto, como no site
     * (`lib/actions.ts` de lá recebe a mesma base64 por uma chamada de
     * servidor e decodifica do outro lado) — não é a API que guarda a
     * imagem, é o Storage; a API só decodifica e repassa. 12/09/2026.
     */
    const r = await this.pedir('/v1/batidas', {
      metodo: 'POST',
      corpo: {
        id: envio.id,
        participacaoId: envio.participacaoId,
        tipo: envio.tipo,
        registradoEm: envio.registradoEm,
        ...(envio.fotoBase64 !== undefined ? { fotoBase64: envio.fotoBase64 } : {}),
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

  async registrarEntradaLivre(
    participacaoId: string,
    dados: { lat?: number; lng?: number },
  ): Promise<RespostaDeBatida> {
    const r = await this.pedir(`/v1/participacoes/${encodeURIComponent(participacaoId)}/entrada-livre`, {
      metodo: 'POST',
      corpo: dados,
    })
    // 422 é a recusa por regra, e o corpo já vem no formato do contrato —
    // mesma régua de `registrarBatida`.
    if (r.status === 200 || r.status === 422) {
      return r.corpo as unknown as RespostaDeBatida
    }
    return { situacao: 'recusado', motivo: this.erroDe(r, 'O servidor não aceitou este registro.') }
  }

  async contestarBatida(
    participacaoId: string, tipo: TipoBatida, dataRef: string, motivo: string,
  ): Promise<{ erro?: string }> {
    const r = await this.pedir(`/v1/participacoes/${encodeURIComponent(participacaoId)}/contestar`, {
      metodo: 'POST',
      corpo: { tipo, dataRef, motivo },
    })
    if (r.status >= 400) return { erro: this.erroDe(r, 'Não conseguimos registrar a contestação.') }
    return r.corpo as unknown as { erro?: string }
  }

  // ─── Painel ───────────────────────────────────────────────────────────────

  async painel(): Promise<Painel> {
    const r = await this.pedir('/v1/painel')
    if (r.status >= 400) throw new Error(this.erroDe(r, 'Não conseguimos montar o painel.'))
    return r.corpo as unknown as Painel
  }

  // ─── Escanear QR ──────────────────────────────────────────────────────────

  async eventosParaEscanear(): Promise<EventoEscaneavel[]> {
    const r = await this.pedir('/v1/escanear/eventos')
    if (r.status >= 400) throw new Error(this.erroDe(r, 'Não conseguimos buscar os eventos.'))
    return (Array.isArray(r.corpo) ? r.corpo : []) as unknown as EventoEscaneavel[]
  }

  async registrarPorQr(eventoId: string, codigoLido: string): Promise<ResultadoDaLeitura> {
    const r = await this.pedir(`/v1/escanear/${encodeURIComponent(eventoId)}`, {
      metodo: 'POST',
      corpo: { codigo: codigoLido },
    })
    if (r.status >= 400) throw new Error(this.erroDe(r, 'Não conseguimos registrar a leitura.'))
    return r.corpo as unknown as ResultadoDaLeitura
  }

  async conferirPorCpf(eventoId: string, cpf: string): Promise<ConferenciaPorCpf> {
    const r = await this.pedir(`/v1/escanear/${encodeURIComponent(eventoId)}/cpf`, {
      metodo: 'POST',
      corpo: { cpf },
    })
    if (r.status >= 400) throw new Error(this.erroDe(r, 'Não conseguimos conferir o CPF.'))
    return r.corpo as unknown as ConferenciaPorCpf
  }

  // ─── Registrar ponto por outra pessoa ─────────────────────────────────────

  async localizarPessoa(termo: string): Promise<{
    ficha?: FichaLocalizada
    candidatos?: CandidatoLocalizado[]
    erro?: string
  }> {
    const r = await this.pedir(`/v1/localizar?termo=${encodeURIComponent(termo)}`)
    if (r.status >= 400) throw new Error(this.erroDe(r, 'Não conseguimos localizar esta pessoa.'))
    return r.corpo as unknown as { ficha?: FichaLocalizada; candidatos?: CandidatoLocalizado[]; erro?: string }
  }

  async abrirFicha(participacaoId: string): Promise<{ ficha?: FichaLocalizada; erro?: string }> {
    const r = await this.pedir(`/v1/localizar/${encodeURIComponent(participacaoId)}`)
    if (r.status >= 400) throw new Error(this.erroDe(r, 'Não conseguimos abrir esta ficha.'))
    return r.corpo as unknown as { ficha?: FichaLocalizada; erro?: string }
  }

  async registrarPresencaAssistida(
    participacaoId: string, dados: BatidaAssistida,
  ): Promise<{ nome?: string; etapa?: string; erro?: string }> {
    const r = await this.pedir(`/v1/localizar/${encodeURIComponent(participacaoId)}/presenca`, {
      metodo: 'POST',
      corpo: dados,
    })
    if (r.status >= 400) throw new Error(this.erroDe(r, 'Não conseguimos registrar a presença.'))
    return r.corpo as unknown as { nome?: string; etapa?: string; erro?: string }
  }

  // ─── Atividades ───────────────────────────────────────────────────────────

  async eventosParaAcompanhar(): Promise<EventoEscaneavel[]> {
    const r = await this.pedir('/v1/atividades/eventos')
    if (r.status >= 400) throw new Error(this.erroDe(r, 'Não conseguimos buscar os eventos.'))
    return (Array.isArray(r.corpo) ? r.corpo : []) as unknown as EventoEscaneavel[]
  }

  async atividades(
    eventoId: string,
    opcoes?: { visao?: VisaoDeAtividade; dia?: string },
  ): Promise<AtividadesDoEvento> {
    const partes: string[] = []
    if (opcoes?.visao) partes.push(`visao=${encodeURIComponent(opcoes.visao)}`)
    if (opcoes?.dia) partes.push(`dia=${encodeURIComponent(opcoes.dia)}`)
    const query = partes.length ? `?${partes.join('&')}` : ''

    const r = await this.pedir(`/v1/atividades/${encodeURIComponent(eventoId)}${query}`)
    if (r.status >= 400) throw new Error(this.erroDe(r, 'Não conseguimos buscar as atividades.'))
    return r.corpo as unknown as AtividadesDoEvento
  }

  async criarEvento(dados: DadosDeNovoEvento): Promise<{ eventoId?: string; erro?: string }> {
    const r = await this.pedir('/v1/eventos', { metodo: 'POST', corpo: dados })
    if (r.status >= 400) return { erro: this.erroDe(r, 'Não conseguimos criar o evento.') }
    return r.corpo as unknown as { eventoId?: string; erro?: string }
  }

  // ─── O evento por dentro ──────────────────────────────────────────────────

  async evento(eventoId: string, dia?: string): Promise<EventoDetalhado> {
    const query = dia ? `?dia=${encodeURIComponent(dia)}` : ''
    const r = await this.pedir(`/v1/eventos/${encodeURIComponent(eventoId)}${query}`)
    if (r.status >= 400) throw new Error(this.erroDe(r, 'Não conseguimos abrir este evento.'))
    return r.corpo as unknown as EventoDetalhado
  }

  async alternarPortaria(
    eventoId: string, aberta: boolean,
  ): Promise<{ portaria?: Portaria; erro?: string }> {
    const r = await this.pedir(`/v1/eventos/${encodeURIComponent(eventoId)}/portaria`, {
      metodo: 'POST',
      corpo: { aberta },
    })
    if (r.status >= 400) return { erro: this.erroDe(r, 'Não conseguimos mexer na portaria.') }
    return r.corpo as unknown as { portaria?: Portaria; erro?: string }
  }

  async trocarTokenDaPortaria(
    eventoId: string,
  ): Promise<{ portaria?: Portaria; erro?: string }> {
    const r = await this.pedir(`/v1/eventos/${encodeURIComponent(eventoId)}/portaria/trocar`, { metodo: 'POST' })
    if (r.status >= 400) return { erro: this.erroDe(r, 'Não conseguimos trocar o QR da portaria.') }
    return r.corpo as unknown as { portaria?: Portaria; erro?: string }
  }

  async alternarCadastroPorLink(eventoId: string, suspenso: boolean): Promise<{ erro?: string }> {
    const r = await this.pedir(`/v1/eventos/${encodeURIComponent(eventoId)}/cadastro`, {
      metodo: 'POST',
      corpo: { suspenso },
    })
    if (r.status >= 400) return { erro: this.erroDe(r, 'Não conseguimos mudar o cadastro por link deste evento.') }
    return r.corpo as unknown as { erro?: string }
  }

  async criarLinkCadastroIndividual(
    eventoId: string, setorId: string,
  ): Promise<{ resultado?: LinkCadastroIndividual; erro?: string }> {
    const r = await this.pedir(`/v1/eventos/${encodeURIComponent(eventoId)}/cadastro-individual`, {
      metodo: 'POST',
      corpo: { setorId },
    })
    if (r.status >= 400) return { erro: this.erroDe(r, 'Não conseguimos gerar o link individual.') }
    const corpo = r.corpo as { link?: string; expiraEm?: string; setorNome?: string; eventoNome?: string; erro?: string }
    if (corpo.erro) return { erro: corpo.erro }
    return {
      resultado: {
        link: corpo.link ?? '',
        expiraEm: corpo.expiraEm ?? '',
        setorNome: corpo.setorNome ?? '',
        eventoNome: corpo.eventoNome ?? '',
      },
    }
  }

  async configuracaoDoEvento(eventoId: string): Promise<ConfiguracaoDoEvento> {
    const r = await this.pedir(`/v1/eventos/${encodeURIComponent(eventoId)}/configuracao`)
    if (r.status >= 400) throw new Error(this.erroDe(r, 'Não conseguimos abrir a configuração do evento.'))
    return r.corpo as unknown as ConfiguracaoDoEvento
  }

  async salvarEvento(eventoId: string, dados: EdicaoDoEvento): Promise<{ erro?: string }> {
    const r = await this.pedir(`/v1/eventos/${encodeURIComponent(eventoId)}/configuracao`, {
      metodo: 'POST',
      corpo: dados,
    })
    if (r.status >= 400) return { erro: this.erroDe(r, 'Não conseguimos salvar o evento.') }
    return r.corpo as unknown as { erro?: string }
  }

  async salvarDiasDeTrabalho(
    eventoId: string, dias: string[],
  ): Promise<{ resultado?: ResultadoDosDias; erro?: string }> {
    const r = await this.pedir(`/v1/eventos/${encodeURIComponent(eventoId)}/dias`, {
      metodo: 'POST',
      corpo: { dias },
    })
    if (r.status >= 400) return { erro: this.erroDe(r, 'Não conseguimos salvar os dias de trabalho.') }
    return r.corpo as unknown as { resultado?: ResultadoDosDias; erro?: string }
  }

  async criarSetor(
    eventoId: string,
    dados: {
      nome: string
      valorPorPessoa?: number | null
      supervisor: { nome: string; cpf: string; telefone: string }
      exigeMeio?: boolean
    },
  ): Promise<{ setor?: SetorDetalhado; erro?: string }> {
    const r = await this.pedir(`/v1/eventos/${encodeURIComponent(eventoId)}/setores`, {
      metodo: 'POST',
      corpo: dados,
    })
    if (r.status >= 400) return { erro: this.erroDe(r, 'Não conseguimos criar o setor.') }
    return r.corpo as unknown as { setor?: SetorDetalhado; erro?: string }
  }

  async editarSetor(
    setorId: string,
    dados: { nome: string; valorPorPessoa?: number | null; exigeMeio?: boolean },
  ): Promise<{ setor?: SetorDetalhado; erro?: string }> {
    const r = await this.pedir(`/v1/setores/${encodeURIComponent(setorId)}`, {
      metodo: 'POST',
      corpo: dados,
    })
    if (r.status >= 400) return { erro: this.erroDe(r, 'Não conseguimos salvar as alterações do setor.') }
    return r.corpo as unknown as { setor?: SetorDetalhado; erro?: string }
  }

  async alternarLinkDoSetor(setorId: string, ativo: boolean): Promise<{ erro?: string }> {
    const r = await this.pedir(`/v1/setores/${encodeURIComponent(setorId)}/link`, {
      metodo: 'POST',
      corpo: { ativo },
    })
    if (r.status >= 400) return { erro: this.erroDe(r, 'Não conseguimos mudar o link deste setor.') }
    return r.corpo as unknown as { erro?: string }
  }

  async excluirSetor(setorId: string): Promise<{ erro?: string }> {
    const r = await this.pedir(`/v1/setores/${encodeURIComponent(setorId)}/excluir`, { metodo: 'POST' })
    if (r.status >= 400) return { erro: this.erroDe(r, 'Não conseguimos excluir este setor.') }
    return r.corpo as unknown as { erro?: string }
  }

  async adicionarSupervisor(
    setorId: string,
    dados: { nome: string; cpf: string; telefone: string },
  ): Promise<{ erro?: string }> {
    const r = await this.pedir(`/v1/setores/${encodeURIComponent(setorId)}/supervisores`, {
      metodo: 'POST',
      corpo: dados,
    })
    if (r.status >= 400) return { erro: this.erroDe(r, 'Não conseguimos adicionar este supervisor.') }
    return r.corpo as unknown as { erro?: string }
  }

  async editarSupervisor(
    id: string,
    dados: { nome: string; telefone: string; ativo: boolean; permissoesUsuario?: Record<string, boolean> },
  ): Promise<{ erro?: string }> {
    const r = await this.pedir(`/v1/acessos/${encodeURIComponent(id)}/editar`, {
      metodo: 'POST',
      corpo: dados,
    })
    if (r.status >= 400) return { erro: this.erroDe(r, 'Não conseguimos salvar as alterações deste supervisor.') }
    return r.corpo as unknown as { erro?: string }
  }

  async configuracaoDoMeio(eventoId: string): Promise<ConfiguracaoDoMeio> {
    const r = await this.pedir(`/v1/eventos/${encodeURIComponent(eventoId)}/meio`)
    if (r.status >= 400) throw new Error(this.erroDe(r, 'Não conseguimos abrir a configuração do meio.'))
    return r.corpo as unknown as ConfiguracaoDoMeio
  }

  async salvarConfiguracaoDoMeio(
    eventoId: string,
    setoresLigados: string[],
    diasLigados: string[],
  ): Promise<{ setores?: number; dias?: number; erro?: string }> {
    const r = await this.pedir(`/v1/eventos/${encodeURIComponent(eventoId)}/meio`, {
      metodo: 'POST',
      corpo: { setoresLigados, diasLigados },
    })
    if (r.status >= 400) return { erro: this.erroDe(r, 'Não conseguimos salvar a configuração do meio.') }
    return r.corpo as unknown as { setores?: number; dias?: number; erro?: string }
  }

  async equipeDoSetor(setorId: string): Promise<EquipeDoSetor> {
    const r = await this.pedir(`/v1/setores/${encodeURIComponent(setorId)}/equipe`)
    if (r.status >= 400) throw new Error(this.erroDe(r, 'Não conseguimos abrir a equipe deste setor.'))
    return r.corpo as unknown as EquipeDoSetor
  }

  async fichaDaPessoa(participacaoId: string): Promise<FichaDaPessoa> {
    const r = await this.pedir(`/v1/pessoas/${encodeURIComponent(participacaoId)}/ficha`)
    if (r.status >= 400) throw new Error(this.erroDe(r, 'Não conseguimos abrir esta ficha.'))
    return r.corpo as unknown as FichaDaPessoa
  }

  async moverDeSetor(participacaoId: string, setorId: string): Promise<{ erro?: string }> {
    const r = await this.pedir(`/v1/pessoas/${encodeURIComponent(participacaoId)}/mover`, {
      metodo: 'POST',
      corpo: { setorId },
    })
    if (r.status >= 400) return { erro: this.erroDe(r, 'Não conseguimos mover esta pessoa de setor.') }
    return r.corpo as unknown as { erro?: string }
  }

  async tornarSupervisor(participacaoId: string, telefone: string): Promise<{ erro?: string }> {
    const r = await this.pedir(`/v1/pessoas/${encodeURIComponent(participacaoId)}/tornar-supervisor`, {
      metodo: 'POST',
      corpo: { telefone },
    })
    if (r.status >= 400) return { erro: this.erroDe(r, 'Não conseguimos tornar esta pessoa supervisora.') }
    return r.corpo as unknown as { erro?: string }
  }

  async marcarPagamento(participacaoId: string, pago: boolean): Promise<{ erro?: string }> {
    const r = await this.pedir(`/v1/pessoas/${encodeURIComponent(participacaoId)}/pagamento`, {
      metodo: 'POST',
      corpo: { pago },
    })
    if (r.status >= 400) return { erro: this.erroDe(r, 'Não conseguimos atualizar o pagamento.') }
    return r.corpo as unknown as { erro?: string }
  }

  async salvarValorAReceber(participacaoId: string, valor: number): Promise<{ erro?: string }> {
    const r = await this.pedir(`/v1/pessoas/${encodeURIComponent(participacaoId)}/valor-a-receber`, {
      metodo: 'POST',
      corpo: { valor },
    })
    if (r.status >= 400) return { erro: this.erroDe(r, 'Não conseguimos salvar o valor a receber.') }
    return r.corpo as unknown as { erro?: string }
  }

  async tirarDaEquipe(participacaoId: string): Promise<{ erro?: string }> {
    const r = await this.pedir(`/v1/pessoas/${encodeURIComponent(participacaoId)}/tirar`, { metodo: 'POST' })
    if (r.status >= 400) return { erro: this.erroDe(r, 'Não conseguimos tirar esta pessoa da equipe.') }
    return r.corpo as unknown as { erro?: string }
  }

  async trazerDeVolta(participacaoId: string): Promise<{ erro?: string }> {
    const r = await this.pedir(`/v1/pessoas/${encodeURIComponent(participacaoId)}/trazer-de-volta`, { metodo: 'POST' })
    if (r.status >= 400) return { erro: this.erroDe(r, 'Não conseguimos trazer esta pessoa de volta.') }
    return r.corpo as unknown as { erro?: string }
  }

  async excluirDaEquipe(participacaoId: string, motivo?: string): Promise<{ erro?: string }> {
    const r = await this.pedir(`/v1/pessoas/${encodeURIComponent(participacaoId)}/excluir`, {
      metodo: 'POST',
      corpo: { motivo },
    })
    if (r.status >= 400) return { erro: this.erroDe(r, 'Não conseguimos excluir esta pessoa.') }
    return r.corpo as unknown as { erro?: string }
  }

  async corrigirTelefone(participacaoId: string, telefone: string, motivo?: string): Promise<{ erro?: string }> {
    const r = await this.pedir(`/v1/pessoas/${encodeURIComponent(participacaoId)}/telefone`, {
      metodo: 'POST',
      corpo: { telefone, motivo },
    })
    if (r.status >= 400) return { erro: this.erroDe(r, 'Não conseguimos corrigir o telefone.') }
    return r.corpo as unknown as { erro?: string }
  }

  async alternarAtivacao(participacaoId: string, ativo: boolean): Promise<{ erro?: string }> {
    const r = await this.pedir(`/v1/pessoas/${encodeURIComponent(participacaoId)}/ativacao`, {
      metodo: 'POST',
      corpo: { ativo },
    })
    if (r.status >= 400) return { erro: this.erroDe(r, `Não conseguimos ${ativo ? 'ativar' : 'desativar'} esta pessoa.`) }
    return r.corpo as unknown as { erro?: string }
  }

  async corrigirFuncao(participacaoId: string, funcao: string): Promise<{ erro?: string }> {
    const r = await this.pedir(`/v1/pessoas/${encodeURIComponent(participacaoId)}/funcao`, {
      metodo: 'POST',
      corpo: { funcao },
    })
    if (r.status >= 400) return { erro: this.erroDe(r, 'Não conseguimos corrigir a função.') }
    return r.corpo as unknown as { erro?: string }
  }

  async corrigirCpf(participacaoId: string, cpf: string): Promise<{ erro?: string }> {
    const r = await this.pedir(`/v1/pessoas/${encodeURIComponent(participacaoId)}/cpf`, {
      metodo: 'POST',
      corpo: { cpf },
    })
    if (r.status >= 400) return { erro: this.erroDe(r, 'Não conseguimos corrigir o CPF.') }
    return r.corpo as unknown as { erro?: string }
  }

  async crachaDaPessoa(participacaoId: string): Promise<{ codigo: string; etapa: string }> {
    const r = await this.pedir(`/v1/pessoas/${encodeURIComponent(participacaoId)}/qr`)
    if (r.status >= 400) throw new Error(this.erroDe(r, 'Não conseguimos gerar o crachá.'))
    return r.corpo as unknown as { codigo: string; etapa: string }
  }

  async resolverContestacao(id: string): Promise<{ erro?: string }> {
    const r = await this.pedir(`/v1/contestacoes/${encodeURIComponent(id)}/resolver`, { metodo: 'POST' })
    if (r.status >= 400) return { erro: this.erroDe(r, 'Não conseguimos resolver esta contestação.') }
    return r.corpo as unknown as { erro?: string }
  }

  // ─── Planilhas ────────────────────────────────────────────────────────────

  async baixarModelo(): Promise<ArquivoDePlanilha> {
    const r = await this.pedir('/v1/setores/modelo-de-importacao')
    if (r.status >= 400) throw new Error(this.erroDe(r, 'Não conseguimos gerar o modelo.'))
    return r.corpo as unknown as ArquivoDePlanilha
  }

  async exportarEquipe(setorId: string, op?: { dia?: string }): Promise<ArquivoDePlanilha> {
    const query = op?.dia ? `?dia=${encodeURIComponent(op.dia)}` : ''
    const r = await this.pedir(`/v1/setores/${encodeURIComponent(setorId)}/planilha${query}`)
    if (r.status >= 400) throw new Error(this.erroDe(r, 'Não conseguimos gerar a planilha desta equipe.'))
    return r.corpo as unknown as ArquivoDePlanilha
  }

  async importarPlanilha(
    setorId: string,
    arquivo: { nome: string; base64: string },
  ): Promise<{ resultado?: ResultadoDaImportacao; erro?: string }> {
    const r = await this.pedir(`/v1/setores/${encodeURIComponent(setorId)}/importar`, {
      metodo: 'POST',
      corpo: { base64: arquivo.base64 },
    })
    if (r.status >= 400) return { erro: this.erroDe(r, 'Não conseguimos importar esta planilha.') }
    return r.corpo as unknown as { resultado?: ResultadoDaImportacao; erro?: string }
  }

  // ─── Acessos ──────────────────────────────────────────────────────────────

  async acessos(filtro?: FiltroDeAcessos): Promise<ListaDeAcessos> {
    const partes: string[] = []
    if (filtro?.busca) partes.push(`busca=${encodeURIComponent(filtro.busca)}`)
    if (filtro?.situacao && filtro.situacao !== 'todos') partes.push(`situacao=${encodeURIComponent(filtro.situacao)}`)
    const query = partes.length ? `?${partes.join('&')}` : ''

    const r = await this.pedir(`/v1/acessos${query}`)
    if (r.status >= 400) throw new Error(this.erroDe(r, 'Não conseguimos buscar os acessos.'))
    return r.corpo as unknown as ListaDeAcessos
  }

  async mudarSituacaoDoAcesso(id: string, ativo: boolean): Promise<{ erro?: string }> {
    const r = await this.pedir(`/v1/acessos/${encodeURIComponent(id)}/situacao`, {
      metodo: 'POST',
      corpo: { ativo },
    })
    if (r.status >= 400) return { erro: this.erroDe(r, 'Não conseguimos mudar este acesso.') }
    return r.corpo as unknown as { erro?: string }
  }

  async trocarSenhaDoAcesso(id: string, novaSenha: string): Promise<{ erro?: string }> {
    const r = await this.pedir(`/v1/acessos/${encodeURIComponent(id)}/senha`, {
      metodo: 'POST',
      corpo: { senha: novaSenha },
    })
    if (r.status >= 400) return { erro: this.erroDe(r, 'Não conseguimos trocar a senha.') }
    return r.corpo as unknown as { erro?: string }
  }

  async excluirAcesso(id: string): Promise<{ erro?: string }> {
    const r = await this.pedir(`/v1/acessos/${encodeURIComponent(id)}/excluir`, { metodo: 'POST' })
    if (r.status >= 400) return { erro: this.erroDe(r, 'Não conseguimos excluir este acesso.') }
    return r.corpo as unknown as { erro?: string }
  }

  async eventosComSetores(): Promise<EventoComSetores[]> {
    const r = await this.pedir('/v1/acessos/eventos')
    if (r.status >= 400) throw new Error(this.erroDe(r, 'Não conseguimos buscar os eventos.'))
    return (Array.isArray(r.corpo) ? r.corpo : []) as unknown as EventoComSetores[]
  }

  async operadoresDoEvento(eventoId: string): Promise<Acesso[]> {
    const r = await this.pedir(`/v1/eventos/${encodeURIComponent(eventoId)}/operadores-portao`)
    if (r.status >= 400) throw new Error(this.erroDe(r, 'Não conseguimos buscar os operadores de portão.'))
    return (Array.isArray(r.corpo) ? r.corpo : []) as unknown as Acesso[]
  }

  async criarAcesso(dados: NovoAcesso): Promise<{ acesso?: Acesso; erro?: string }> {
    const r = await this.pedir('/v1/acessos', { metodo: 'POST', corpo: dados })
    if (r.status >= 400) return { erro: this.erroDe(r, 'Não conseguimos criar este acesso.') }
    return r.corpo as unknown as { acesso?: Acesso; erro?: string }
  }

  // ─── Plataforma ───────────────────────────────────────────────────────────

  async organizacoes(): Promise<ListaDeOrganizacoes> {
    const r = await this.pedir('/v1/organizacoes')
    if (r.status >= 400) throw new Error(this.erroDe(r, 'Não conseguimos buscar as organizações.'))
    return r.corpo as unknown as ListaDeOrganizacoes
  }

  async criarOrganizacao(dados: DadosDeNovaOrganizacao): Promise<{ organizacao?: Organizacao; erro?: string }> {
    const r = await this.pedir('/v1/organizacoes', { metodo: 'POST', corpo: dados })
    if (r.status >= 400) return { erro: this.erroDe(r, 'Não conseguimos criar a organização.') }
    return r.corpo as unknown as { organizacao?: Organizacao; erro?: string }
  }

  async alternarOrganizacao(id: string, ativa: boolean): Promise<{ erro?: string }> {
    const r = await this.pedir(`/v1/organizacoes/${encodeURIComponent(id)}/situacao`, {
      metodo: 'POST',
      corpo: { ativa },
    })
    if (r.status >= 400) return { erro: this.erroDe(r, 'Não conseguimos mudar esta organização.') }
    return r.corpo as unknown as { erro?: string }
  }

  async permissoesDaOrganizacao(organizacaoId: string | null): Promise<ConfiguracoesDePermissao> {
    const r = await this.pedir(`/v1/permissoes?organizacao=${encodeURIComponent(organizacaoId ?? 'plataforma')}`)
    if (r.status >= 400) throw new Error(this.erroDe(r, 'Não conseguimos buscar as permissões.'))
    return r.corpo as unknown as ConfiguracoesDePermissao
  }

  async salvarPermissaoDaOrganizacao(
    organizacaoId: string | null, papel: Papel, chave: string, permitido: boolean | null,
  ): Promise<{ erro?: string }> {
    const r = await this.pedir('/v1/permissoes', { metodo: 'POST', corpo: { organizacaoId, papel, chave, permitido } })
    if (r.status >= 400) return { erro: this.erroDe(r, 'Não conseguimos salvar esta permissão.') }
    return r.corpo as unknown as { erro?: string }
  }

  async auditoria(filtro?: { eventoId?: string; dias?: number }): Promise<LinhaDeAuditoria[]> {
    const params = new URLSearchParams()
    if (filtro?.eventoId) params.set('eventoId', filtro.eventoId)
    if (filtro?.dias !== undefined) params.set('dias', String(filtro.dias))
    const query = params.toString()
    const r = await this.pedir(`/v1/auditoria${query ? `?${query}` : ''}`)
    if (r.status >= 400) throw new Error(this.erroDe(r, 'Não conseguimos buscar a trilha de auditoria.'))
    return r.corpo as unknown as LinhaDeAuditoria[]
  }

  async baseDeFuncionarios(busca?: string): Promise<BaseDeFuncionarios> {
    const query = busca ? `?busca=${encodeURIComponent(busca)}` : ''
    const r = await this.pedir(`/v1/base-de-funcionarios${query}`)
    if (r.status >= 400) throw new Error(this.erroDe(r, 'Não conseguimos buscar a base de funcionários.'))
    return r.corpo as unknown as BaseDeFuncionarios
  }

  async encontrarColaborador(
    filtro?: { busca?: string; cidade?: string },
  ): Promise<BuscaRegional> {
    const partes: string[] = []
    if (filtro?.busca) partes.push(`busca=${encodeURIComponent(filtro.busca)}`)
    if (filtro?.cidade) partes.push(`cidade=${encodeURIComponent(filtro.cidade)}`)
    const query = partes.length ? `?${partes.join('&')}` : ''

    const r = await this.pedir(`/v1/encontrar-colaborador${query}`)
    if (r.status >= 400) throw new Error(this.erroDe(r, 'Não conseguimos buscar na base regional.'))
    return r.corpo as unknown as BuscaRegional
  }

  async fichaDaPessoaNaBase(cpf: string): Promise<FichaDaPessoaNaBase> {
    const r = await this.pedir(`/v1/base-de-funcionarios/${encodeURIComponent(cpf)}`)
    if (r.status >= 400) throw new Error(this.erroDe(r, 'Não conseguimos abrir esta ficha.'))
    return r.corpo as unknown as FichaDaPessoaNaBase
  }

  async atribuirPessoaAoEvento(
    cpf: string, setorId: string,
  ): Promise<{ resultado?: ResultadoDeAtribuicao; erro?: string }> {
    const r = await this.pedir(`/v1/base-de-funcionarios/${encodeURIComponent(cpf)}/atribuir`, {
      metodo: 'POST',
      corpo: { setorId },
    })
    if (r.status >= 400) return { erro: this.erroDe(r, 'Não conseguimos atribuir esta pessoa.') }
    return r.corpo as unknown as { resultado?: ResultadoDeAtribuicao; erro?: string }
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
    const r = await this.pedir('/v1/veiculos/eventos')
    if (r.status >= 400) throw new Error(this.erroDe(r, 'Não conseguimos buscar os eventos.'))
    return (Array.isArray(r.corpo) ? r.corpo : []) as unknown as EventoEscaneavel[]
  }

  async veiculosDoEvento(eventoId: string): Promise<VeiculosDoEvento> {
    const r = await this.pedir(`/v1/veiculos/${encodeURIComponent(eventoId)}`)
    if (r.status >= 400) throw new Error(this.erroDe(r, 'Não conseguimos buscar os veículos.'))
    return r.corpo as unknown as VeiculosDoEvento
  }

  async buscarCondutorPorCpf(
    eventoId: string, cpf: string,
  ): Promise<{ condutor?: CondutorEncontrado; erro?: string }> {
    const r = await this.pedir(`/v1/veiculos/${encodeURIComponent(eventoId)}/condutor`, {
      metodo: 'POST',
      corpo: { cpf },
    })
    if (r.status >= 400) throw new Error(this.erroDe(r, 'Não conseguimos buscar o condutor.'))
    return r.corpo as unknown as { condutor?: CondutorEncontrado; erro?: string }
  }

  async cadastrarVeiculo(
    eventoId: string, dados: DadosDeVeiculo,
  ): Promise<{ placa?: string; condutor?: string; erro?: string }> {
    const r = await this.pedir(`/v1/veiculos/${encodeURIComponent(eventoId)}`, { metodo: 'POST', corpo: dados })
    if (r.status >= 400) return { erro: this.erroDe(r, 'Não conseguimos cadastrar o veículo.') }
    return r.corpo as unknown as { placa?: string; condutor?: string; erro?: string }
  }

  async excluirVeiculo(veiculoId: string, eventoId: string): Promise<{ erro?: string }> {
    const r = await this.pedir(`/v1/veiculos/${encodeURIComponent(eventoId)}/excluir`, {
      metodo: 'POST',
      corpo: { veiculoId },
    })
    if (r.status >= 400) return { erro: this.erroDe(r, 'Não conseguimos excluir o veículo.') }
    return r.corpo as unknown as { erro?: string }
  }

  // ─── Bloquear CPF ─────────────────────────────────────────────────────────

  async eventosParaBloqueio(): Promise<EventoEscaneavel[]> {
    const r = await this.pedir('/v1/bloqueio-cpf/eventos')
    if (r.status >= 400) throw new Error(this.erroDe(r, 'Não conseguimos buscar os eventos.'))
    return (Array.isArray(r.corpo) ? r.corpo : []) as unknown as EventoEscaneavel[]
  }

  async bloqueiosDoEvento(eventoId: string): Promise<CpfBloqueado[]> {
    const r = await this.pedir(`/v1/bloqueio-cpf/${encodeURIComponent(eventoId)}`)
    if (r.status >= 400) throw new Error(this.erroDe(r, 'Não conseguimos buscar os bloqueios.'))
    return (Array.isArray(r.corpo) ? r.corpo : []) as unknown as CpfBloqueado[]
  }

  async bloquearCpf(
    eventoId: string, cpf: string, motivo?: string,
  ): Promise<{ cpf?: string; erro?: string }> {
    const r = await this.pedir(`/v1/bloqueio-cpf/${encodeURIComponent(eventoId)}`, {
      metodo: 'POST',
      corpo: { cpf, motivo },
    })
    if (r.status >= 400) return { erro: this.erroDe(r, 'Não conseguimos bloquear este CPF.') }
    return r.corpo as unknown as { cpf?: string; erro?: string }
  }

  async desbloquearCpf(bloqueioId: string, eventoId: string): Promise<{ erro?: string }> {
    const r = await this.pedir(`/v1/bloqueio-cpf/${encodeURIComponent(eventoId)}/desbloquear`, {
      metodo: 'POST',
      corpo: { bloqueioId },
    })
    if (r.status >= 400) return { erro: this.erroDe(r, 'Não conseguimos liberar este CPF.') }
    return r.corpo as unknown as { erro?: string }
  }

  // ─── Conferência de equipe ────────────────────────────────────────────────

  async conferenciasDoEvento(eventoId: string): Promise<LinhaConferencia[]> {
    const r = await this.pedir(`/v1/eventos/${encodeURIComponent(eventoId)}/conferencias`)
    if (r.status >= 400) throw new Error(this.erroDe(r, 'Não conseguimos buscar as conferências.'))
    return (Array.isArray(r.corpo) ? r.corpo : []) as unknown as LinhaConferencia[]
  }

  async conferenciaDoSetor(setorId: string): Promise<ConferenciaDoSetor> {
    const r = await this.pedir(`/v1/conferencia/${encodeURIComponent(setorId)}`)
    if (r.status >= 400) throw new Error(this.erroDe(r, 'Não conseguimos abrir esta conferência.'))
    return r.corpo as unknown as ConferenciaDoSetor
  }

  async removerDaConferencia(funcionarioId: string, setorId: string): Promise<{ erro?: string }> {
    const r = await this.pedir(`/v1/conferencia/${encodeURIComponent(setorId)}/remover`, {
      metodo: 'POST',
      corpo: { funcionarioId },
    })
    if (r.status >= 400) return { erro: this.erroDe(r, 'Não conseguimos tirar esta pessoa.') }
    return r.corpo as unknown as { erro?: string }
  }

  async confirmarConferencia(setorId: string): Promise<{ erro?: string }> {
    const r = await this.pedir(`/v1/conferencia/${encodeURIComponent(setorId)}/confirmar`, { metodo: 'POST' })
    if (r.status >= 400) return { erro: this.erroDe(r, 'Não conseguimos confirmar a equipe.') }
    return r.corpo as unknown as { erro?: string }
  }

  async planilhaDaConferencia(setorId: string): Promise<ArquivoDePlanilha> {
    const r = await this.pedir(`/v1/conferencia/${encodeURIComponent(setorId)}/planilha`)
    if (r.status >= 400) throw new Error(this.erroDe(r, 'Não conseguimos gerar a planilha.'))
    return r.corpo as unknown as ArquivoDePlanilha
  }

  // ─── Relatórios ───────────────────────────────────────────────────────────

  async eventosParaRelatorios(): Promise<EventoEscaneavel[]> {
    const r = await this.pedir('/v1/relatorios/eventos')
    if (r.status >= 400) throw new Error(this.erroDe(r, 'Não conseguimos buscar os eventos.'))
    return (Array.isArray(r.corpo) ? r.corpo : []) as unknown as EventoEscaneavel[]
  }

  async resumoDeRelatorios(eventoId: string): Promise<ResumoDeRelatorios> {
    const r = await this.pedir(`/v1/relatorios/${encodeURIComponent(eventoId)}`)
    if (r.status >= 400) throw new Error(this.erroDe(r, 'Não conseguimos montar o resumo.'))
    return r.corpo as unknown as ResumoDeRelatorios
  }

  async relatorioDoEvento(
    eventoId: string, periodo: Periodo, quem: QuemNoRelatorio,
  ): Promise<ArquivoDePlanilha> {
    const r = await this.pedir(
      `/v1/relatorios/${encodeURIComponent(eventoId)}/arquivo`
      + `?de=${encodeURIComponent(periodo.de)}&ate=${encodeURIComponent(periodo.ate)}&quem=${quem}`,
    )
    if (r.status >= 400) throw new Error(this.erroDe(r, 'Não conseguimos gerar o relatório.'))
    return r.corpo as unknown as ArquivoDePlanilha
  }

  async relatorioDoSetor(
    eventoId: string, setorId: string, periodo: Periodo, quem: QuemNoRelatorio,
  ): Promise<ArquivoDePlanilha> {
    const r = await this.pedir(
      `/v1/relatorios/${encodeURIComponent(eventoId)}/setor/${encodeURIComponent(setorId)}/arquivo`
      + `?de=${encodeURIComponent(periodo.de)}&ate=${encodeURIComponent(periodo.ate)}&quem=${quem}`,
    )
    if (r.status >= 400) throw new Error(this.erroDe(r, 'Não conseguimos gerar o relatório.'))
    return r.corpo as unknown as ArquivoDePlanilha
  }

  async relatoriosPorSetorZip(
    eventoId: string, periodo: Periodo, quem: QuemNoRelatorio,
  ): Promise<ArquivoDePlanilha> {
    const r = await this.pedir(
      `/v1/relatorios/${encodeURIComponent(eventoId)}/zip`
      + `?de=${encodeURIComponent(periodo.de)}&ate=${encodeURIComponent(periodo.ate)}&quem=${quem}`,
    )
    if (r.status >= 400) throw new Error(this.erroDe(r, 'Não conseguimos gerar os relatórios.'))
    return r.corpo as unknown as ArquivoDePlanilha
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

  async registrarTokenDePush(token: string, plataforma: 'ios' | 'android'): Promise<{ erro?: string }> {
    const r = await this.pedir('/v1/push/token', { metodo: 'POST', corpo: { token, plataforma } })
    if (r.status >= 400) return { erro: this.erroDe(r, 'Não conseguimos registrar este aparelho.') }
    return r.corpo as unknown as { erro?: string }
  }
}
