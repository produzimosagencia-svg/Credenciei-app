// Um repositório em memória, para a API ser testável sem banco.
//
// O único banco que existe hoje é o de produção, com pessoas reais e um evento
// marcado para daqui a uma semana. Testar contra ele está fora de questão —
// então a API precisa rodar inteira sem nenhum.
//
// Este arquivo não vai para produção. Ele existe para os testes e para o
// desenvolvimento local antes de a implementação sobre o Supabase ficar pronta.

import { chaveDaPermissao, diaBRT, EVENTO_INTERNO, faseDoDia, quandoAvisarDoDia, HORA_AVISO_DIA } from '@credenciei/dominio'
import type { Papel } from '@credenciei/dominio'
import type {
  AcessoCompleto, AtividadeBruta, BloqueioDeCpf, Contestacao, DadosDeSuporteNoRepositorio, DiaDeTrabalho,
  EdicaoDeEventoNoRepositorio, EdicaoDeSuporteNoRepositorio,
  EstadoDaConferencia, EstadoDaPortaria, Evento, EventoComContagens, ExcecaoDePermissao,
  FiltroDeAuditoria, FiltroDeGastosNoRepositorio, GastoNoRepositorio, LinhaConferenciaNoRepositorio, LinhaDeAuditoria, LinhaDoDia,
  NovaEntradaDeAuditoria, NovaOrganizacaoNoRepositorio, NovoAcessoNoRepositorio,
  NovoBloqueioNoRepositorio, NovoGastoNoRepositorio,
  NovoAdminNoRepositorio, NovoEventoNoRepositorio, NovoRegistro, NovoSetorNoRepositorio,
  NovoSuporteNoRepositorio, NovoVeiculoNoRepositorio,
  Organizacao,
  OrganizacaoComContagens, Participacao, ParticipacaoParaLocalizar, Perfil, Pessoa, PessoaDaBase, Registro,
  Repositorio, SetorComPessoas, SetorCriado, TrabalhoNaBase, Veiculo,
} from './repositorio.js'

let seq = 0
const novoId = (p: string) => `${p}-${++seq}`

/**
 * O que a memória guarda de cada perfil além do que `Perfil` expõe — os
 * campos que só a tela de Acessos precisa. `Perfil` fica enxuto de propósito:
 * é lido em toda checagem de permissão da API, e a maioria dessas checagens
 * não olha para nada disto.
 */
type PerfilInterno = Perfil & {
  cpf?: string
  email?: string
  telefone?: string | null
  setorId?: string | null
  criadoEm?: string
  expiraEm?: string | null
}

export class RepositorioEmMemoria implements Repositorio {
  pessoas: Pessoa[] = []
  perfis: PerfilInterno[] = []
  eventos: Evento[] = []
  participacoes: Participacao[] = []
  registros: Registro[] = []
  dias = new Map<string, DiaDeTrabalho[]>()
  equipes: {
    id: string; nome: string; eventoId: string; supervisorPessoaId?: string; exigeMeio?: boolean
    valorPorPessoa?: number | null; token?: string | null; linkAtivo?: boolean
  }[] = []
  organizacoes: Organizacao[] = []
  veiculos: (Veiculo & { eventoId: string })[] = []
  bloqueios: (BloqueioDeCpf & { eventoId: string })[] = []
  portarias = new Map<string, EstadoDaPortaria>()
  /** Por setorId — a mesma linha só existe depois de confirmada, igual à tabela real. */
  conferencias = new Map<string, EstadoDaConferencia>()
  /** Os links individuais de 48h já gerados — só pra teste confirmar o que foi salvo. */
  autorizacoesIndividuais: { setorId: string; eventoId: string; token: string; expiraEm: string }[] = []
  /** As exceções de "Funções ligadas" por organização — camada 2 de `capacidade()`. */
  permissoesOrganizacao: ExcecaoDePermissao[] = []
  /**
   * A trilha de auditoria. `eventoNome` some daqui de propósito — é
   * calculado na leitura (`auditoria()`), porque um evento pode ser
   * renomeado depois da linha gravada, e a memória não deveria guardar as
   * duas versões independentes.
   */
  auditorias: (Omit<LinhaDeAuditoria, 'eventoNome'> & {
    autorId: string; participacaoId: string | null; organizacaoId: string | null
  })[] = []
  /** token → dono atual. Chave é o token (do aparelho), não a pessoa. */
  tokensDeAparelhos = new Map<string, { pessoaId: string; plataforma: 'ios' | 'android' }>()
  contestacoes: (Contestacao & { resolvidaEm: string | null })[] = []
  /** Chave `participacaoId|tipo|data` — mesma dedupe da tabela `app_lembretes_enviados`. */
  lembretesEnviados = new Set<string>()
  /** Mesma tabela `avisos` que o site já usa — ver o comentário em `repositorio.ts`. */
  avisos: {
    id: string; eventoId: string; titulo: string; mensagem: string; ativo: boolean
    dataInicio: string; dataFim: string | null
    publico: 'todos' | 'setores' | 'pessoa' | 'supervisores'
    pessoaId: string | null; equipeIds: string[]; recorrente: boolean
  }[] = []
  /** Chave `avisoId|pessoaId` — mesma dedupe de `aviso_visualizacoes`. */
  avisosVistos = new Set<string>()
  /** Mesma tabela `app_notificacoes` — o histórico de push da Central de Avisos. */
  notificacoes: {
    id: string; pessoaId: string; tipo: string; titulo: string; corpo: string
    destino: string | null; criadoEm: string; lida: boolean
  }[] = []
  /** Chave `pessoaId|tipo` → ativo. Ausência = ligado (mesma tabela `app_preferencias_de_aviso`). */
  preferenciasDeAviso = new Map<string, boolean>()
  /** Mesma tabela `produtor_eventos` do site. */
  produtorEventos: { produtorId: string; eventoId: string }[] = []
  /** Mesma tabela `gastos_evento` do site — `comprovantePath` só existe aqui pra simular o Storage. */
  gastos: (GastoNoRepositorio & { organizacaoIdSeInterno: string | null; comprovantePath: string | null })[] = []
  /** Mesma tabela `suporte_escopo` do site — organização OU evento por linha, nunca os dois. */
  suporteEscopo: { perfilId: string; organizacaoId: string | null; eventoId: string | null }[] = []
  /** participacaoId → quando autorizou aparecer na busca regional (mesma coluna `funcionarios.consentimento_em` do site). */
  consentimentosDeBase = new Map<string, string>()

  // ── Identidade ────────────────────────────────────────────────────────────

  async pessoaPorTelefone(telefone: string) {
    const d = (telefone ?? '').replace(/\D/g, '')
    return this.pessoas.find(p => (p.telefone ?? '').replace(/\D/g, '') === d) ?? null
  }

  async pessoaPorId(id: string) {
    return this.pessoas.find(p => p.id === id) ?? null
  }

  async pessoaPorCpf(cpf: string) {
    const d = (cpf ?? '').replace(/\D/g, '')
    return this.pessoas.find(p => p.cpf.replace(/\D/g, '') === d) ?? null
  }

  async criarPessoa(p: Omit<Pessoa, 'id'>) {
    const nova = { ...p, id: novoId('pes') }
    this.pessoas.push(nova)
    return nova
  }

  async excluirMinhaConta(pessoaId: string): Promise<void> {
    const p = this.pessoas.find(x => x.id === pessoaId)
    if (!p) return
    p.nome = 'Pessoa excluída'
    p.telefone = null
    p.fotoPath = null
  }

  async perfilPorId(id: string) {
    const p = this.perfis.find(x => x.id === id)
    if (!p) return null
    return { ...p, permissoesOrganizacao: this.mapaDeExcecoes(p.organizacaoId) }
  }

  /** A da organização mescla POR CIMA da da plataforma — mesma regra do site. */
  private mapaDeExcecoes(organizacaoId: string | null): Record<string, boolean> {
    const mapa: Record<string, boolean> = {}
    for (const e of this.permissoesOrganizacao) {
      if (e.organizacaoId === null) mapa[chaveDaPermissao(e.papel, e.chave)] = e.permitido
    }
    if (organizacaoId) {
      for (const e of this.permissoesOrganizacao) {
        if (e.organizacaoId === organizacaoId) mapa[chaveDaPermissao(e.papel, e.chave)] = e.permitido
      }
    }
    return mapa
  }

  async excecoesDePermissao(organizacaoId: string | null): Promise<ExcecaoDePermissao[]> {
    return this.permissoesOrganizacao.filter(e => e.organizacaoId === organizacaoId)
  }

  async salvarExcecaoDePermissao(
    organizacaoId: string | null, papel: Papel, chave: string, permitido: boolean | null,
  ): Promise<void> {
    // `atualizadoPor` não é guardado em memória — só a Supabase grava
    // auditoria; os testes não precisam conferir quem alterou.
    this.permissoesOrganizacao = this.permissoesOrganizacao
      .filter(e => !(e.organizacaoId === organizacaoId && e.papel === papel && e.chave === chave))
    if (permitido !== null) this.permissoesOrganizacao.push({ organizacaoId, papel, chave, permitido })
  }

  // ── Evento ────────────────────────────────────────────────────────────────

  async eventoPorCodigo(codigo: string) {
    return this.eventos.find(e => e.codigoConvite === codigo) ?? null
  }

  async eventoPorId(id: string) {
    return this.eventos.find(e => e.id === id) ?? null
  }

  async diasDoEvento(eventoId: string) {
    return this.dias.get(eventoId) ?? []
  }

  async criarEvento(dados: NovoEventoNoRepositorio): Promise<Evento> {
    const evento: Evento = {
      id: novoId('ev'),
      nome: dados.nome,
      descricao: dados.descricao,
      organizacaoId: dados.organizacaoId,
      organizacaoNome: null,
      local: dados.local,
      dataInicio: dados.dataInicio,
      dataFim: dados.dataFim,
      janela_entrada_inicio: dados.janela_entrada_inicio,
      janela_entrada_fim: dados.janela_entrada_fim,
      janela_fim_inicio: dados.janela_fim_inicio,
      janela_fim_fim: dados.janela_fim_fim,
      batida_livre: false,
      checkin_autonomo: false,
      codigoConvite: dados.codigoConvite,
      exigeAprovacao: false,
      ativo: true,
    }
    this.eventos.push(evento)
    // Sem o dia principal, o evento nasce inutilizável — nenhuma batida
    // encontraria jornada nenhuma para valer.
    this.dias.set(evento.id, [])
    await this.garantirDiaPrincipal(evento.id, diaBRT(dados.dataInicio))
    return evento
  }

  async atualizarEvento(id: string, dados: EdicaoDeEventoNoRepositorio) {
    const evento = this.eventos.find(e => e.id === id)
    if (!evento) return
    evento.nome = dados.nome
    evento.descricao = dados.descricao
    evento.local = dados.local
    evento.dataInicio = dados.dataInicio
    evento.dataFim = dados.dataFim
    evento.batida_livre = dados.batida_livre
    evento.checkin_autonomo = dados.checkin_autonomo
    evento.janela_entrada_inicio = dados.janela_entrada_inicio
    evento.janela_entrada_fim = dados.janela_entrada_fim
    evento.janela_fim_inicio = dados.janela_fim_inicio
    evento.janela_fim_fim = dados.janela_fim_fim
  }

  async garantirDiaPrincipal(eventoId: string, novaData: string): Promise<void> {
    const atuais = this.dias.get(eventoId) ?? []
    // O dia antigo vira preparação em vez de sumir — se já tem batida
    // registrada, ela precisa continuar tendo um dia ao qual pertencer.
    const rebaixados = atuais.map((d): DiaDeTrabalho =>
      d.tipo === 'principal' && d.data !== novaData ? { ...d, tipo: 'preparacao' } : d)

    const existente = rebaixados.find(d => d.data === novaData)
    if (existente) {
      existente.tipo = 'principal'
      this.dias.set(eventoId, rebaixados)
    } else {
      this.dias.set(eventoId, [
        ...rebaixados,
        { data: novaData, tipo: 'principal', cancelado: false, exigeMeio: true },
      ])
    }
  }

  async datasComRegistro(eventoId: string): Promise<Set<string>> {
    const idsDeEquipe = new Set(this.equipes.filter(eq => eq.eventoId === eventoId).map(eq => eq.id))
    const idsDeParticipacao = new Set(
      this.participacoes.filter(p => idsDeEquipe.has(p.equipeId)).map(p => p.id),
    )
    return new Set(
      this.registros.filter(r => idsDeParticipacao.has(r.participacaoId)).map(r => r.dataRef),
    )
  }

  async salvarDiasDeTrabalho(eventoId: string, datasFinais: string[]) {
    const atuais = this.dias.get(eventoId) ?? []
    const principal = atuais.filter(d => d.tipo === 'principal')
    const finalSet = new Set(datasFinais)
    const preparacaoMantida = atuais.filter(d => d.tipo === 'preparacao' && finalSet.has(d.data))
    const datasJaPresentes = new Set(preparacaoMantida.map(d => d.data))
    const novas = datasFinais
      .filter(d => !datasJaPresentes.has(d))
      .map((d): DiaDeTrabalho => ({ data: d, tipo: 'preparacao', cancelado: false, exigeMeio: true }))
    this.dias.set(eventoId, [...principal, ...preparacaoMantida, ...novas])
  }

  async eventosComContagens(
    opcoes: { organizacaoId?: string | null; eventoId?: string },
  ): Promise<EventoComContagens[]> {
    const alvo = opcoes.eventoId
      ? this.eventos.filter(e => e.id === opcoes.eventoId)
      : opcoes.organizacaoId === undefined
        ? this.eventos
        : this.eventos.filter(e => opcoes.organizacaoId === null || e.organizacaoId === opcoes.organizacaoId)

    return alvo.map(evento => {
      const equipesDoEvento = this.equipes.filter(eq => eq.eventoId === evento.id)
      const idsDeEquipe = new Set(equipesDoEvento.map(eq => eq.id))
      const participacoesDoEvento = this.participacoes.filter(p => idsDeEquipe.has(p.equipeId))
      const presentes = participacoesDoEvento.filter(
        p => this.registros.some(r => r.participacaoId === p.id && r.tipo === 'entrada'),
      ).length

      return {
        id: evento.id,
        nome: evento.nome,
        local: evento.local,
        dataInicio: evento.dataInicio,
        organizacaoId: evento.organizacaoId,
        ativo: evento.ativo,
        setores: equipesDoEvento.length,
        equipe: participacoesDoEvento.length,
        presentes,
      }
    })
  }

  async registrosEntrePeriodo(eventoId: string, de: string, ate: string) {
    const idsDeEquipe = new Set(this.equipes.filter(eq => eq.eventoId === eventoId).map(eq => eq.id))
    const idsDeParticipacao = new Set(
      this.participacoes.filter(p => idsDeEquipe.has(p.equipeId)).map(p => p.id),
    )
    return this.registros
      .filter(r => idsDeParticipacao.has(r.participacaoId) && r.registradoEm >= de && r.registradoEm <= ate)
      .map(r => ({ tipo: r.tipo }))
  }

  async registrosDoEventoNoDia(eventoId: string, dataRef: string) {
    const idsDeEquipe = new Set(this.equipes.filter(eq => eq.eventoId === eventoId).map(eq => eq.id))
    const idsDeParticipacao = new Set(
      this.participacoes.filter(p => idsDeEquipe.has(p.equipeId)).map(p => p.id),
    )
    return this.registros
      .filter(r => idsDeParticipacao.has(r.participacaoId) && r.dataRef === dataRef)
      .map(r => ({ participacaoId: r.participacaoId, tipo: r.tipo }))
  }

  async funcionariosNaBaseTotal(): Promise<number> {
    return new Set(this.pessoas.map(p => p.cpf)).size
  }

  async valorCobradoEmEventosAtivos(): Promise<number> {
    const idsDeEventoAtivo = new Set(this.eventos.filter(e => e.ativo).map(e => e.id))
    return this.participacoes
      .filter(p => idsDeEventoAtivo.has(p.eventoId))
      .reduce((a, p) => a + (p.valorReceber ?? 0), 0)
  }

  async custoWhatsappRecente(): Promise<{ enviados: number; custoEstimado: number }> {
    // Sem tabela de disparos no cenário de mentira — nenhum teste ainda
    // exercita este número. Ver `RepositorioSupabase` para a conta real.
    return { enviados: 0, custoEstimado: 0 }
  }

  async atividadeRecente(eventoIds: string[], limite: number): Promise<AtividadeBruta[]> {
    const idsDeEventoAlvo = new Set(eventoIds)
    const idsDeEquipe = new Set(
      this.equipes.filter(eq => idsDeEventoAlvo.has(eq.eventoId)).map(eq => eq.id),
    )
    const participacaoPorId = new Map(
      this.participacoes.filter(p => idsDeEquipe.has(p.equipeId)).map(p => [p.id, p]),
    )

    return this.registros
      .filter(r => participacaoPorId.has(r.participacaoId))
      .sort((a, b) => b.registradoEm.localeCompare(a.registradoEm))
      .slice(0, limite)
      .map(r => {
        const participacao = participacaoPorId.get(r.participacaoId)!
        const pessoa = this.pessoas.find(p => p.id === participacao.pessoaId)
        return {
          id: r.id,
          nomePessoa: pessoa?.nome ?? '',
          setorNome: participacao.equipeNome,
          tipo: r.tipo,
          em: r.registradoEm,
        }
      })
  }

  async linhasDoEventoNoDia(eventoId: string, dia: string, equipeId?: string): Promise<LinhaDoDia[]> {
    const equipesAlvo = this.equipes.filter(eq => eq.eventoId === eventoId && (!equipeId || eq.id === equipeId))
    const idsDeEquipe = new Set(equipesAlvo.map(eq => eq.id))

    return this.participacoes
      .filter(p => idsDeEquipe.has(p.equipeId))
      .map(p => {
        const pessoa = this.pessoas.find(x => x.id === p.pessoaId)!
        const equipe = equipesAlvo.find(eq => eq.id === p.equipeId)!
        const doDia = this.registros.filter(r => r.participacaoId === p.id && r.dataRef === dia)
        const porTipo = (tipo: 'entrada' | 'meio' | 'fim') => {
          const r = doDia.find(x => x.tipo === tipo)
          return r ? { em: r.registradoEm, manual: r.manual } : null
        }
        return {
          participacaoId: p.id,
          nome: pessoa.nome,
          cpf: pessoa.cpf,
          telefone: pessoa.telefone,
          setorId: equipe.id,
          setorNome: p.equipeNome,
          exigeMeio: equipe.exigeMeio ?? false,
          ativo: p.ativo,
          descredenciadoEm: p.descredenciadoEm,
          entrada: porTipo('entrada'),
          meio: porTipo('meio'),
          fim: porTipo('fim'),
        }
      })
  }

  async participacoesParaLocalizar(
    escopo: { organizacaoId?: string | null; equipeId?: string },
  ): Promise<ParticipacaoParaLocalizar[]> {
    const equipesNoEscopo = escopo.equipeId
      ? this.equipes.filter(eq => eq.id === escopo.equipeId)
      : escopo.organizacaoId === undefined
        ? this.equipes
        : this.equipes.filter(eq => {
            const evento = this.eventos.find(e => e.id === eq.eventoId)
            return escopo.organizacaoId === null || evento?.organizacaoId === escopo.organizacaoId
          })

    const eventoDaEquipe = new Map(equipesNoEscopo.map(eq => [eq.id, this.eventos.find(e => e.id === eq.eventoId)]))
    const idsDeEquipeAtiva = new Set(
      [...eventoDaEquipe.entries()].filter(([, ev]) => ev?.ativo).map(([id]) => id),
    )

    return this.participacoes
      .filter(p => idsDeEquipeAtiva.has(p.equipeId))
      .map(p => {
        const pessoa = this.pessoas.find(x => x.id === p.pessoaId)!
        const evento = eventoDaEquipe.get(p.equipeId)!
        return {
          participacaoId: p.id,
          pessoaId: p.pessoaId,
          nome: pessoa.nome,
          cpf: pessoa.cpf,
          funcao: p.funcao,
          setorNome: p.equipeNome,
          eventoId: evento.id,
          eventoNome: evento.nome,
          ativo: p.ativo,
          supervisorNome: p.supervisorNome,
        }
      })
  }

  // ── Participação ──────────────────────────────────────────────────────────

  async participacoesDaPessoa(pessoaId: string) {
    return this.participacoes.filter(p => p.pessoaId === pessoaId)
  }

  async participacaoPorId(id: string) {
    return this.participacoes.find(p => p.id === id) ?? null
  }

  async participacaoPorQrToken(token: string) {
    return this.participacoes.find(p => p.qrToken === token) ?? null
  }

  async criarParticipacao(p: Omit<Participacao, 'id'>) {
    const nova = { ...p, id: novoId('part') }
    this.participacoes.push(nova)
    return nova
  }

  async moverParticipacao(participacaoId: string, novoEquipeId: string): Promise<void> {
    const p = this.participacoes.find(x => x.id === participacaoId)
    if (!p) throw new Error('Não encontramos esta pessoa.')
    const equipe = this.equipes.find(e => e.id === novoEquipeId)
    p.equipeId = novoEquipeId
    p.equipeNome = equipe?.nome ?? p.equipeNome
  }

  async definirPagamentoDaParticipacao(participacaoId: string, pago: boolean): Promise<void> {
    const p = this.participacoes.find(x => x.id === participacaoId)
    if (!p) throw new Error('Não encontramos esta pessoa.')
    p.pago = pago
    p.pagoEm = pago ? new Date().toISOString() : null
  }

  async definirValorAReceberDaParticipacao(participacaoId: string, valor: number): Promise<void> {
    const p = this.participacoes.find(x => x.id === participacaoId)
    if (!p) throw new Error('Não encontramos esta pessoa.')
    p.valorReceber = valor
  }

  async recredenciarParticipacao(participacaoId: string): Promise<void> {
    const p = this.participacoes.find(x => x.id === participacaoId)
    if (p) p.descredenciadoEm = null
  }

  async corrigirTelefoneDaParticipacao(participacaoId: string, telefone: string): Promise<void> {
    const p = this.participacoes.find(x => x.id === participacaoId)
    if (!p) throw new Error('Não encontramos esta pessoa.')
    const pessoa = this.pessoas.find(x => x.id === p.pessoaId)
    if (pessoa) pessoa.telefone = telefone
  }

  async alternarAtivacaoDaParticipacao(participacaoId: string, ativo: boolean): Promise<void> {
    const p = this.participacoes.find(x => x.id === participacaoId)
    if (!p) throw new Error('Não encontramos esta pessoa.')
    p.ativo = ativo
  }

  async corrigirFuncaoDaParticipacao(participacaoId: string, funcao: string): Promise<void> {
    const p = this.participacoes.find(x => x.id === participacaoId)
    if (!p) throw new Error('Não encontramos esta pessoa.')
    p.funcao = funcao
  }

  async excluirParticipacaoDeVez(participacaoId: string): Promise<void> {
    this.participacoes = this.participacoes.filter(p => p.id !== participacaoId)
    this.registros = this.registros.filter(r => r.participacaoId !== participacaoId)
  }

  async corrigirCpfDaParticipacao(participacaoId: string, cpf: string): Promise<void> {
    const p = this.participacoes.find(x => x.id === participacaoId)
    if (!p) throw new Error('Não encontramos esta pessoa.')
    const pessoa = this.pessoas.find(x => x.id === p.pessoaId)
    if (pessoa) pessoa.cpf = cpf
  }

  async participacaoPorCpfNoEvento(eventoId: string, cpf: string): Promise<{ nome: string; setorNome: string } | null> {
    for (const p of this.participacoes) {
      if (p.eventoId !== eventoId) continue
      const pessoa = this.pessoas.find(x => x.id === p.pessoaId)
      if (pessoa?.cpf === cpf) return { nome: pessoa.nome, setorNome: p.equipeNome }
    }
    return null
  }

  async criarParticipacaoDaImportacao(dados: {
    equipeId: string; nome: string; cpf: string; telefone: string | null
    funcao: string | null; cidade: string | null; valorReceber: number
  }): Promise<Participacao> {
    const equipe = this.equipes.find(e => e.id === dados.equipeId)
    if (!equipe) throw new Error('Não encontramos este setor.')

    let pessoa = this.pessoas.find(x => x.cpf === dados.cpf)
    if (!pessoa) {
      pessoa = { id: novoId('pes'), nome: dados.nome, cpf: dados.cpf, telefone: dados.telefone, fotoPath: null }
      this.pessoas.push(pessoa)
    }

    const nova: Participacao = {
      id: novoId('part'),
      pessoaId: pessoa.id,
      eventoId: equipe.eventoId,
      equipeId: dados.equipeId,
      equipeNome: equipe.nome,
      funcao: dados.funcao,
      supervisorNome: null,
      ativo: true,
      descredenciadoEm: null,
      valorReceber: dados.valorReceber,
      pago: false,
      pagoEm: null,
      qrToken: novoId('qr'),
      cidade: dados.cidade,
      criadoEm: new Date().toISOString(),
    }
    this.participacoes.push(nova)
    return nova
  }

  // ── Batidas ───────────────────────────────────────────────────────────────

  async registroPorId(id: string) {
    return this.registros.find(r => r.id === id) ?? null
  }

  async registrosDoDia(participacaoId: string, dataRef: string) {
    return this.registros.filter(r => r.participacaoId === participacaoId && r.dataRef === dataRef)
  }

  async registrosDaParticipacao(participacaoId: string) {
    return this.registros.filter(r => r.participacaoId === participacaoId)
  }

  async registrosDeParticipacoes(participacaoIds: string[]) {
    const ids = new Set(participacaoIds)
    return this.registros.filter(r => ids.has(r.participacaoId))
  }

  /** Teste não sobe nada de verdade — só confirma que o caminho foi pedido. */
  async subirFotoDoMeio(eventoId: string, participacaoId: string, dataRef: string) {
    return `${eventoId}/${participacaoId}/meio-${dataRef}.jpg`
  }

  async subirFotoAssistida(eventoId: string, participacaoId: string, tipo: string, dataRef: string) {
    return `${eventoId}/${participacaoId}/assistido-${tipo}-${dataRef}.jpg`
  }

  async urlDaFoto(caminho: string): Promise<string | null> {
    return `https://storage.falso.local/presencas/${encodeURIComponent(caminho)}`
  }

  async gravarRegistro(r: NovoRegistro) {
    /*
     * Recusa id repetido, como uma chave primária faria.
     *
     * Se o falso aceitasse, o teste de idempotência passaria mesmo com a API
     * esquecendo de conferir — e a falha só apareceria em produção, como uma
     * batida contada duas vezes na folha de pagamento.
     */
    if (this.registros.some(x => x.id === r.id)) {
      throw new Error(`registro duplicado: ${r.id}`)
    }
    const gravado: Registro = { ...r, recebidoEm: r.recebidoEm ?? new Date().toISOString() }
    this.registros.push(gravado)
    return gravado
  }

  async apagarRegistro(id: string) {
    this.registros = this.registros.filter(r => r.id !== id)
  }

  async apagarFotosVencidas(diasDeRetencao: number, agora: Date): Promise<{ apagadas: number }> {
    const corte = agora.getTime() - diasDeRetencao * 86_400_000
    const fechado = (e: Evento) => {
      const ref = e.dataFim ?? e.dataInicio
      return !!ref && Date.parse(ref) < corte
    }
    const eventoIdsFechados = new Set(this.eventos.filter(fechado).map(e => e.id))

    let apagadas = 0
    for (const r of this.registros) {
      if (!r.fotoPath) continue
      const part = this.participacoes.find(p => p.id === r.participacaoId)
      if (!part || !eventoIdsFechados.has(part.eventoId)) continue
      r.fotoPath = null
      apagadas++
    }
    return { apagadas }
  }

  async apagarRegistroDoTipo(participacaoId: string, tipo: 'entrada' | 'meio' | 'fim', dataRef: string) {
    this.registros = this.registros.filter(
      r => !(r.participacaoId === participacaoId && r.tipo === tipo && r.dataRef === dataRef),
    )
  }

  // ── Supervisor ────────────────────────────────────────────────────────────

  async participacoesDaEquipe(equipeId: string) {
    return this.participacoes
      .filter(p => p.equipeId === equipeId)
      .map(p => ({ ...p, pessoa: this.pessoas.find(x => x.id === p.pessoaId)! }))
  }

  async equipeDoSupervisor(pessoaId: string) {
    const e = this.equipes.find(x => x.supervisorPessoaId === pessoaId)
    return e ? { id: e.id, nome: e.nome, eventoId: e.eventoId } : null
  }

  // ── Acessos ───────────────────────────────────────────────────────────────

  private paraAcesso(p: PerfilInterno): AcessoCompleto {
    const setorNome = p.setorId ? this.equipes.find(eq => eq.id === p.setorId)?.nome ?? null : null
    return {
      id: p.id,
      nome: p.nome,
      cpf: p.cpf ?? '',
      telefone: p.telefone ?? null,
      email: p.email ?? null,
      papel: p.papel,
      organizacaoId: p.organizacaoId,
      ativo: p.ativo,
      setorId: p.setorId ?? null,
      setorNome,
      eventos: 1,
      criadoEm: p.criadoEm ?? new Date(0).toISOString(),
      expiraEm: p.expiraEm ?? null,
      permissoesUsuario: p.permissoesUsuario ?? {},
    }
  }

  async acessosNoEscopo(organizacaoId?: string | null): Promise<AcessoCompleto[]> {
    return this.perfis
      .filter(p => p.papel !== 'master')
      .filter(p => organizacaoId === undefined || organizacaoId === null || p.organizacaoId === organizacaoId)
      .map(p => this.paraAcesso(p))
  }

  async acessoPorCpf(cpf: string): Promise<AcessoCompleto | null> {
    const d = (cpf ?? '').replace(/\D/g, '')
    const p = this.perfis.find(x => (x.cpf ?? '').replace(/\D/g, '') === d && d.length > 0)
    return p ? this.paraAcesso(p) : null
  }

  async definirSituacaoDoAcesso(id: string, ativo: boolean): Promise<AcessoCompleto | null> {
    const p = this.perfis.find(x => x.id === id)
    if (!p) return null
    p.ativo = ativo
    return this.paraAcesso(p)
  }

  async atualizarAcesso(
    id: string,
    dados: { nome: string; telefone: string; ativo: boolean; permissoesUsuario?: Record<string, boolean> },
  ): Promise<void> {
    const p = this.perfis.find(x => x.id === id)
    if (!p) throw new Error('Não encontramos este acesso.')
    p.nome = dados.nome
    p.telefone = dados.telefone
    p.ativo = dados.ativo
    if (dados.permissoesUsuario !== undefined) p.permissoesUsuario = dados.permissoesUsuario
  }

  async equipesDoEvento(eventoId: string): Promise<{ setorId: string; nome: string; exigeMeio: boolean }[]> {
    return this.equipes
      .filter(eq => eq.eventoId === eventoId)
      .map(eq => ({ setorId: eq.id, nome: eq.nome, exigeMeio: eq.exigeMeio ?? false }))
  }

  // ── Batida do meio ────────────────────────────────────────────────────────

  async definirSetoresComMeio(eventoId: string, setorIdsLigados: string[]) {
    const ligados = new Set(setorIdsLigados)
    for (const eq of this.equipes) {
      if (eq.eventoId === eventoId) eq.exigeMeio = ligados.has(eq.id)
    }
  }

  async definirDiasComMeio(eventoId: string, datasLigadas: string[]) {
    const ligadas = new Set(datasLigadas)
    const dias = this.dias.get(eventoId) ?? []
    this.dias.set(eventoId, dias.map(d => ({ ...d, exigeMeio: ligadas.has(d.data) })))
  }

  // ── Plataforma (organizações) ──────────────────────────────────────────────

  private paraOrganizacaoComContagens(o: Organizacao): OrganizacaoComContagens {
    const admin = this.perfis.find(p => p.organizacaoId === o.id && p.papel === 'admin')
    return {
      ...o,
      eventos: this.eventos.filter(e => e.organizacaoId === o.id).length,
      adminNome: admin?.nome ?? null,
      adminEmail: admin?.email ?? null,
    }
  }

  async organizacoesComContagens(): Promise<OrganizacaoComContagens[]> {
    return this.organizacoes.map(o => this.paraOrganizacaoComContagens(o))
  }

  async organizacaoPorId(id: string): Promise<Organizacao | null> {
    return this.organizacoes.find(o => o.id === id) ?? null
  }

  async definirSituacaoDaOrganizacao(id: string, ativa: boolean) {
    const org = this.organizacoes.find(o => o.id === id)
    if (org) org.ativo = ativa
  }

  async criarOrganizacao(dados: NovaOrganizacaoNoRepositorio): Promise<OrganizacaoComContagens> {
    const emEmUso = this.perfis.some(p => (p.email ?? '').toLowerCase() === dados.email.toLowerCase())
    if (emEmUso) throw new Error('Já existe uma conta com este e-mail.')

    const org: Organizacao = {
      id: novoId('org'),
      nome: dados.nome,
      documento: dados.documento,
      responsavelNome: dados.responsavelNome,
      limiteEventos: dados.limiteEventos,
      valorCobrado: dados.valorCobrado,
      valorCobradoPeriodo: dados.valorCobradoPeriodo,
      ativo: true,
      criadaEm: new Date().toISOString(),
    }
    this.organizacoes.push(org)

    this.perfis.push({
      id: novoId('auth'),
      nome: dados.adminNome,
      papel: 'admin',
      organizacaoId: org.id,
      ativo: true,
      email: dados.email,
      criadoEm: new Date().toISOString(),
      permissoesUsuario: {},
    })

    return this.paraOrganizacaoComContagens(org)
  }

  // ── Veículos ────────────────────────────────────────────────────────────

  async veiculosDoEvento(eventoId: string): Promise<Veiculo[]> {
    return this.veiculos.filter(v => v.eventoId === eventoId).map(({ eventoId: _e, ...v }) => v)
  }

  async criarVeiculo(dados: NovoVeiculoNoRepositorio): Promise<Veiculo> {
    const veiculo: Veiculo & { eventoId: string } = {
      id: novoId('vec'),
      eventoId: dados.eventoId,
      placa: dados.placa,
      modelo: dados.modelo,
      cor: dados.cor,
      tipo: dados.tipo,
      empresa: dados.empresa,
      observacoes: dados.observacoes,
      condutorNome: dados.condutorNome,
      condutorCpf: dados.condutorCpf,
      dias: dados.dias,
    }
    this.veiculos.push(veiculo)
    const { eventoId: _e, ...semEvento } = veiculo
    return semEvento
  }

  async excluirVeiculo(veiculoId: string, eventoId: string): Promise<boolean> {
    const i = this.veiculos.findIndex(v => v.id === veiculoId && v.eventoId === eventoId)
    if (i < 0) return false
    this.veiculos.splice(i, 1)
    return true
  }

  // ── Bloqueio de CPF ─────────────────────────────────────────────────────

  async bloqueiosDoEvento(eventoId: string): Promise<BloqueioDeCpf[]> {
    return this.bloqueios.filter(b => b.eventoId === eventoId).map(({ eventoId: _e, ...b }) => b)
  }

  async existeBloqueio(eventoId: string, cpf: string): Promise<boolean> {
    return this.bloqueios.some(b => b.eventoId === eventoId && b.cpf === cpf)
  }

  async criarBloqueio(dados: NovoBloqueioNoRepositorio): Promise<BloqueioDeCpf> {
    const bloqueio: BloqueioDeCpf & { eventoId: string } = {
      id: novoId('bloq'),
      eventoId: dados.eventoId,
      cpf: dados.cpf,
      motivo: dados.motivo,
      criadoEm: new Date().toISOString(),
      bloqueadoPorNome: dados.bloqueadoPorNome,
    }
    this.bloqueios.push(bloqueio)
    const { eventoId: _e, ...semEvento } = bloqueio
    return semEvento
  }

  async removerBloqueio(bloqueioId: string, eventoId: string): Promise<boolean> {
    const i = this.bloqueios.findIndex(b => b.id === bloqueioId && b.eventoId === eventoId)
    if (i < 0) return false
    this.bloqueios.splice(i, 1)
    return true
  }

  // ── Base de funcionários ────────────────────────────────────────────────

  async todasAsPessoasDaBase(): Promise<PessoaDaBase[]> {
    type Acumulado = {
      cpf: string; nome: string; telefone: string | null; funcao: string | null; cidade: string | null
      eventoIds: Set<string>; eventosComPresenca: Set<string>; orgIds: Set<string>; ultimo: string
      autorizou: boolean; autorizouEm: string | null
    }
    const porCpf = new Map<string, Acumulado>()

    for (const part of this.participacoes) {
      const pessoa = this.pessoas.find(p => p.id === part.pessoaId)
      if (!pessoa) continue
      const evento = this.eventos.find(e => e.id === part.eventoId)
      const compareceu = this.registros.some(r => r.participacaoId === part.id && r.tipo === 'entrada')

      const atual = porCpf.get(pessoa.cpf) ?? {
        cpf: pessoa.cpf, nome: pessoa.nome, telefone: pessoa.telefone, funcao: part.funcao,
        cidade: part.cidade, eventoIds: new Set<string>(), eventosComPresenca: new Set<string>(),
        orgIds: new Set<string>(), ultimo: part.criadoEm, autorizou: false, autorizouEm: null,
      }
      atual.eventoIds.add(part.eventoId)
      if (compareceu) atual.eventosComPresenca.add(part.eventoId)
      if (evento?.organizacaoId) atual.orgIds.add(evento.organizacaoId)
      if (part.criadoEm > atual.ultimo) atual.ultimo = part.criadoEm
      if (part.cidade && !atual.cidade) atual.cidade = part.cidade
      // Basta UMA participação ter autorizado — a pessoa é a mesma em todas.
      const consentiuEm = this.consentimentosDeBase.get(part.id)
      if (consentiuEm) {
        atual.autorizou = true
        if (!atual.autorizouEm || consentiuEm > atual.autorizouEm) atual.autorizouEm = consentiuEm
      }
      porCpf.set(pessoa.cpf, atual)
    }

    return [...porCpf.values()].map(a => ({
      cpf: a.cpf, nome: a.nome, telefone: a.telefone, funcao: a.funcao, cidade: a.cidade,
      eventos: a.eventoIds.size, eventosTrabalhados: a.eventosComPresenca.size,
      organizacoes: a.orgIds.size, ultimoCadastro: a.ultimo,
      autorizouBaseRegional: a.autorizou, autorizouEm: a.autorizouEm,
    }))
  }

  async registrarConsentimentoDeBase(participacaoId: string, quando: string): Promise<void> {
    this.consentimentosDeBase.set(participacaoId, quando)
  }

  async trabalhosDaPessoa(cpf: string): Promise<TrabalhoNaBase[]> {
    const pessoa = await this.pessoaPorCpf(cpf)
    if (!pessoa) return []

    return this.participacoes
      .filter(p => p.pessoaId === pessoa.id)
      .map(p => {
        const evento = this.eventos.find(e => e.id === p.eventoId)
        const compareceu = this.registros.some(r => r.participacaoId === p.id && r.tipo === 'entrada')
        return {
          participacaoId: p.id,
          eventoId: p.eventoId,
          eventoNome: evento?.nome ?? '',
          organizacaoId: evento?.organizacaoId ?? null,
          organizacaoNome: evento?.organizacaoNome ?? '',
          setorId: p.equipeId,
          setorNome: p.equipeNome,
          cargo: p.funcao,
          dataInicio: evento?.dataInicio ?? p.criadoEm,
          dataFim: evento?.dataFim ?? null,
          ativo: p.ativo,
          descredenciadoEm: p.descredenciadoEm,
          compareceu,
          criadoEm: p.criadoEm,
        }
      })
      .sort((x, y) => y.criadoEm.localeCompare(x.criadoEm))
  }

  async setorPorId(setorId: string): Promise<{ setorId: string; nome: string; eventoId: string } | null> {
    const eq = this.equipes.find(e => e.id === setorId)
    return eq ? { setorId: eq.id, nome: eq.nome, eventoId: eq.eventoId } : null
  }

  async criarAcesso(dados: NovoAcessoNoRepositorio): Promise<AcessoCompleto> {
    const novo: PerfilInterno = {
      id: novoId('auth'),
      nome: dados.nome,
      papel: dados.papel,
      organizacaoId: dados.organizacaoId,
      ativo: dados.ativo,
      cpf: dados.cpf.replace(/\D/g, ''),
      telefone: dados.telefone,
      setorId: dados.setorId ?? null,
      criadoEm: new Date().toISOString(),
      expiraEm: dados.expiraEm ?? null,
      permissoesUsuario: dados.permissoesUsuario,
    }
    this.perfis.push(novo)
    return this.paraAcesso(novo)
  }

  async criarAdmin(dados: NovoAdminNoRepositorio): Promise<AcessoCompleto> {
    const novo: PerfilInterno = {
      id: novoId('auth'),
      nome: dados.nome,
      papel: 'admin',
      organizacaoId: dados.organizacaoId,
      ativo: dados.ativo,
      email: dados.email,
      criadoEm: new Date().toISOString(),
      permissoesUsuario: {},
    }
    this.perfis.push(novo)
    return this.paraAcesso(novo)
  }

  async definirSenhaDoAcesso(): Promise<void> {
    // Nada para guardar em memória — nenhum teste autentica de verdade contra
    // este repositório. O que importa (quem pode chamar, com qual escopo) já
    // é conferido na rota, antes de chegar aqui.
  }

  async excluirAcesso(id: string): Promise<void> {
    this.perfis = this.perfis.filter(p => p.id !== id)
  }

  // ── Suporte de Sistema ───────────────────────────────────────────────────

  async dadosDeSuporte(): Promise<DadosDeSuporteNoRepositorio> {
    const organizacoes = this.organizacoes.map(o => ({ id: o.id, nome: o.nome }))
    const nomeDaOrganizacao = new Map(organizacoes.map(o => [o.id, o.nome]))
    const eventosParaEscopo = this.eventos
      .map(e => ({ id: e.id, nome: e.nome, organizacaoNome: nomeDaOrganizacao.get(e.organizacaoId ?? '') ?? '—' }))
    const nomeDoEvento = new Map(eventosParaEscopo.map(e => [e.id, e]))

    const suportes = this.perfis.filter(p => p.papel === 'suporte')
    return {
      suportes: suportes.map(s => {
        const escopos = this.suporteEscopo.filter(e => e.perfilId === s.id)
        return {
          id: s.id, nome: s.nome, telefone: s.telefone ?? null, ativo: s.ativo,
          acessoExpiraEm: s.expiraEm ? diaBRT(s.expiraEm) : null,
          escopoOrganizacoes: escopos
            .filter(e => e.organizacaoId)
            .map(e => ({ id: e.organizacaoId!, nome: nomeDaOrganizacao.get(e.organizacaoId!) ?? '—' })),
          escopoEventos: escopos
            .filter(e => e.eventoId)
            .map(e => nomeDoEvento.get(e.eventoId!))
            .filter((e): e is { id: string; nome: string; organizacaoNome: string } => !!e),
        }
      }),
      organizacoes,
      eventos: eventosParaEscopo,
    }
  }

  private gravarEscopoSuporte(perfilId: string, orgIds: string[], eventoIds: string[]): void {
    this.suporteEscopo = this.suporteEscopo.filter(e => e.perfilId !== perfilId)
    for (const organizacaoId of orgIds) this.suporteEscopo.push({ perfilId, organizacaoId, eventoId: null })
    for (const eventoId of eventoIds) this.suporteEscopo.push({ perfilId, organizacaoId: null, eventoId })
  }

  async criarSuporte(dados: NovoSuporteNoRepositorio): Promise<{ id?: string; erro?: string }> {
    const cpf = dados.cpf.replace(/\D/g, '')
    if (this.perfis.some(p => p.cpf === cpf)) {
      return { erro: `Já existe um acesso com o CPF ${cpf}. Edite esse acesso em vez de criar outro.` }
    }

    const id = novoId('auth')
    this.perfis.push({
      id, nome: dados.nome, papel: 'suporte', organizacaoId: null, ativo: dados.ativo, cpf,
      telefone: dados.telefone, setorId: null, criadoEm: new Date().toISOString(),
      expiraEm: dados.acessoExpiraEm ? `${dados.acessoExpiraEm}T23:59:00-03:00` : null,
      permissoesUsuario: {},
    })
    this.gravarEscopoSuporte(id, dados.escopoOrganizacaoIds, dados.escopoEventoIds)
    return { id }
  }

  async editarSuporte(id: string, dados: EdicaoDeSuporteNoRepositorio): Promise<{ erro?: string }> {
    const alvo = this.perfis.find(p => p.id === id && p.papel === 'suporte')
    if (!alvo) return { erro: 'Acesso de suporte não encontrado.' }

    alvo.nome = dados.nome
    alvo.telefone = dados.telefone || null
    alvo.ativo = dados.ativo
    alvo.expiraEm = dados.acessoExpiraEm ? `${dados.acessoExpiraEm}T23:59:00-03:00` : null
    this.gravarEscopoSuporte(id, dados.escopoOrganizacaoIds, dados.escopoEventoIds)
    return {}
  }

  async revogarSuporte(id: string): Promise<{ erro?: string }> {
    const alvo = this.perfis.find(p => p.id === id && p.papel === 'suporte')
    if (!alvo) return { erro: 'Acesso de suporte não encontrado.' }
    alvo.ativo = false
    alvo.expiraEm = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    return {}
  }

  // ── Cartaz da portaria, criar setor e equipe do setor ────────────────────

  async portariaDoEvento(eventoId: string): Promise<EstadoDaPortaria | null> {
    if (!this.eventos.some(e => e.id === eventoId)) return null
    return this.portarias.get(eventoId) ?? { aberta: false, token: null, cadastrados: 0 }
  }

  async definirPortaria(eventoId: string, estado: { aberta: boolean; token: string | null }): Promise<void> {
    const atual = this.portarias.get(eventoId) ?? { aberta: false, token: null, cadastrados: 0 }
    this.portarias.set(eventoId, { ...atual, aberta: estado.aberta, token: estado.token })
  }

  async criarSetor(dados: NovoSetorNoRepositorio): Promise<SetorCriado> {
    const novo = {
      id: novoId('setor'),
      nome: dados.nome,
      eventoId: dados.eventoId,
      exigeMeio: dados.exigeMeio,
      valorPorPessoa: dados.valorPorPessoa,
      token: novoId('tok'),
    }
    this.equipes.push(novo)
    return { setorId: novo.id, nome: novo.nome, token: novo.token }
  }

  async excluirSetor(setorId: string): Promise<void> {
    this.equipes = this.equipes.filter(eq => eq.id !== setorId)
  }

  async atualizarSetor(
    setorId: string, dados: { nome: string; valorPorPessoa: number | null; exigeMeio: boolean },
  ): Promise<void> {
    const eq = this.equipes.find(e => e.id === setorId)
    if (!eq) throw new Error('Não encontramos este setor.')
    eq.nome = dados.nome
    eq.valorPorPessoa = dados.valorPorPessoa
    eq.exigeMeio = dados.exigeMeio
  }

  async alternarLinkDoSetor(setorId: string, ativo: boolean): Promise<void> {
    const eq = this.equipes.find(e => e.id === setorId)
    if (eq) eq.linkAtivo = ativo
  }

  async alternarCadastroPorLink(eventoId: string, suspenso: boolean): Promise<void> {
    const evento = this.eventos.find(e => e.id === eventoId)
    if (evento) evento.cadastroSuspenso = suspenso
  }

  async salvarAutorizacaoIndividual(
    setorId: string, eventoId: string, token: string, expiraEm: string,
  ): Promise<void> {
    this.autorizacoesIndividuais.push({ setorId, eventoId, token, expiraEm })
  }

  async reatribuirSupervisorAoSetor(perfilId: string, setorId: string): Promise<AcessoCompleto> {
    const p = this.perfis.find(x => x.id === perfilId)
    if (!p) throw new Error('Não encontramos este acesso.')
    p.setorId = setorId
    p.ativo = true
    return this.paraAcesso(p)
  }

  async setoresDoEvento(eventoId: string): Promise<SetorComPessoas[]> {
    return this.equipes
      .filter(eq => eq.eventoId === eventoId)
      .map(eq => ({
        setorId: eq.id,
        nome: eq.nome,
        pessoas: this.participacoes.filter(p => p.equipeId === eq.id).length,
        valorPorPessoa: eq.valorPorPessoa ?? null,
        token: eq.token ?? null,
        linkAtivo: eq.linkAtivo !== false,
        exigeMeio: eq.exigeMeio === true,
        supervisores: this.perfis
          .filter(p => p.papel === 'supervisor' && p.setorId === eq.id)
          .map(p => ({
            id: p.id, nome: p.nome, ativo: p.ativo, telefone: p.telefone ?? null,
            permissoesUsuario: p.permissoesUsuario ?? {},
          })),
      }))
  }

  // ── Conferência de equipe ──────────────────────────────────────────────

  async conferenciasDoEvento(eventoId: string): Promise<LinhaConferenciaNoRepositorio[]> {
    return this.equipes
      .filter(eq => eq.eventoId === eventoId)
      .map(eq => {
        const supervisor = this.perfis.find(p => p.papel === 'supervisor' && p.setorId === eq.id)
        return {
          setorId: eq.id,
          setorNome: eq.nome,
          supervisorNome: supervisor?.nome ?? null,
          estado: this.conferencias.get(eq.id) ?? null,
        }
      })
  }

  async estadoDaConferencia(setorId: string): Promise<EstadoDaConferencia | null> {
    return this.conferencias.get(setorId) ?? null
  }

  async confirmarConferencia(dados: {
    setorId: string
    eventoId: string
    confirmadoPorPessoaId: string
    mantidos: number
    removidos: number
    agora: string
  }): Promise<void> {
    this.conferencias.set(dados.setorId, {
      status: 'confirmada',
      confirmadaEm: dados.agora,
      confirmadaPorPessoaId: dados.confirmadoPorPessoaId,
      totalMantidos: dados.mantidos,
      totalRemovidos: dados.removidos,
    })
  }

  async descredenciarParticipacao(participacaoId: string, agora: string): Promise<void> {
    const p = this.participacoes.find(x => x.id === participacaoId)
    if (p) p.descredenciadoEm = agora
  }

  // ── Auditoria ─────────────────────────────────────────────────────────────

  async registrarAuditoria(entrada: NovaEntradaDeAuditoria): Promise<void> {
    this.auditorias.push({
      id: novoId('aud'),
      quando: new Date().toISOString(),
      autorId: entrada.autorId,
      autorNome: entrada.autorNome,
      acao: entrada.acao,
      campoAlterado: entrada.campoAlterado ?? null,
      valorAnterior: entrada.valorAnterior ?? null,
      valorNovo: entrada.valorNovo ?? null,
      motivo: entrada.motivo ?? null,
      participacaoId: entrada.participacaoId ?? null,
      eventoId: entrada.eventoId ?? null,
      organizacaoId: entrada.organizacaoId ?? null,
    })
  }

  async auditoria(filtro: FiltroDeAuditoria): Promise<LinhaDeAuditoria[]> {
    // A ordem de inserção JÁ é a ordem cronológica (é um array só-de-anexar,
    // preenchido sempre com `push`) — reverter é mais robusto que comparar
    // `quando` como texto, que empata sempre que duas linhas nascem no mesmo
    // milissegundo (comum nos testes, que não esperam relógio nenhum).
    return [...this.auditorias]
      .reverse()
      .filter(a => filtro.organizacaoId === undefined || a.organizacaoId === filtro.organizacaoId)
      .filter(a => filtro.autorId === undefined || a.autorId === filtro.autorId)
      .filter(a => filtro.eventoId === undefined || a.eventoId === filtro.eventoId)
      .filter(a => filtro.desde === undefined || a.quando >= filtro.desde)
      .slice(0, filtro.limite ?? 200)
      .map(a => ({
        id: a.id, quando: a.quando, autorNome: a.autorNome, acao: a.acao,
        campoAlterado: a.campoAlterado, valorAnterior: a.valorAnterior, valorNovo: a.valorNovo,
        motivo: a.motivo, eventoId: a.eventoId,
        eventoNome: a.eventoId ? (this.eventos.find(e => e.id === a.eventoId)?.nome ?? null) : null,
      }))
  }

  // ── Push ──────────────────────────────────────────────────────────────────

  async registrarTokenDePush(pessoaId: string, token: string, plataforma: 'ios' | 'android'): Promise<void> {
    this.tokensDeAparelhos.set(token, { pessoaId, plataforma })
  }

  async tokensDePush(pessoaId: string): Promise<{ token: string; plataforma: 'ios' | 'android' }[]> {
    return [...this.tokensDeAparelhos.entries()]
      .filter(([, dono]) => dono.pessoaId === pessoaId)
      .map(([token, dono]) => ({ token, plataforma: dono.plataforma }))
  }

  async participacoesSemRegistroHoje(momento: 'entrada' | 'fim', agora: Date): Promise<{
    participacaoId: string; pessoaId: string; nome: string; cpf: string
    equipeId: string; equipeNome: string; eventoNome: string
    janelaFim: string | null; diaRef: string
  }[]> {
    const hoje = diaBRT(agora)
    // A saída de um turno que atravessa a meia-noite ainda pertence ao dia
    // principal de ONTEM (mesmo `dataRef` da entrada que abriu o turno) —
    // sem isto, o lembrete de saída nunca dispararia depois da virada do
    // dia. Mesmo raciocínio de `diaDeReferenciaAssistida`, no domínio.
    const ontem = diaBRT(new Date(agora.getTime() - 24 * 3_600_000))

    const diaRefPorEvento = new Map<string, string>()
    for (const e of this.eventos) {
      if (!e.ativo || e.batida_livre === true) continue
      const dia = (this.dias.get(e.id) ?? [])
        .find(d => (d.data === hoje || d.data === ontem) && d.tipo === 'principal' && !d.cancelado)
      if (dia) diaRefPorEvento.set(e.id, dia.data)
    }
    if (!diaRefPorEvento.size) return []

    const jaRegistraram = new Set(
      this.registros
        .filter(r => r.tipo === momento && diaRefPorEvento.get(
          this.participacoes.find(p => p.id === r.participacaoId)?.eventoId ?? '',
        ) === r.dataRef)
        .map(r => r.participacaoId),
    )

    return this.participacoes
      .filter(p => p.ativo && !p.descredenciadoEm && diaRefPorEvento.has(p.eventoId))
      .filter(p => !jaRegistraram.has(p.id))
      .map(p => {
        const evento = this.eventos.find(e => e.id === p.eventoId)
        const pessoa = this.pessoas.find(pe => pe.id === p.pessoaId)
        return {
          participacaoId: p.id,
          pessoaId: p.pessoaId,
          nome: pessoa?.nome ?? '',
          cpf: pessoa?.cpf ?? '',
          equipeId: p.equipeId,
          equipeNome: p.equipeNome,
          eventoNome: evento?.nome ?? '',
          janelaFim: (momento === 'entrada' ? evento?.janela_entrada_fim : evento?.janela_fim_fim) ?? null,
          diaRef: diaRefPorEvento.get(p.eventoId)!,
        }
      })
  }

  async supervisorDoSetor(equipeId: string): Promise<string | null> {
    const equipe = this.equipes.find(e => e.id === equipeId)
    return equipe?.supervisorPessoaId ?? null
  }

  async participacoesSemMeioHoje(agora: Date): Promise<{
    participacaoId: string; pessoaId: string; nome: string; entradaEm: string; diaRef: string
  }[]> {
    const hoje = diaBRT(agora)
    const ontem = diaBRT(new Date(agora.getTime() - 24 * 3_600_000))
    const diasValidos = new Set([hoje, ontem])

    const entradas = this.registros.filter(r => r.tipo === 'entrada' && diasValidos.has(r.dataRef))
    const jaFizeramMeio = new Set(
      this.registros
        .filter(r => r.tipo === 'meio' && diasValidos.has(r.dataRef))
        .map(r => `${r.participacaoId}|${r.dataRef}`),
    )

    const resultado: { participacaoId: string; pessoaId: string; nome: string; entradaEm: string; diaRef: string }[] = []
    for (const entrada of entradas) {
      if (jaFizeramMeio.has(`${entrada.participacaoId}|${entrada.dataRef}`)) continue

      const p = this.participacoes.find(x => x.id === entrada.participacaoId)
      if (!p || !p.ativo || p.descredenciadoEm) continue

      // Nasce LIGADO — ver `DiaDeTrabalho.exigeMeio`.
      const dia = (this.dias.get(p.eventoId) ?? []).find(d => d.data === entrada.dataRef)
      if (dia && !dia.exigeMeio) continue

      resultado.push({
        participacaoId: p.id,
        pessoaId: p.pessoaId,
        nome: this.pessoas.find(pe => pe.id === p.pessoaId)?.nome ?? '',
        entradaEm: entrada.registradoEm,
        diaRef: entrada.dataRef,
      })
    }
    return resultado
  }

  async diasParaAvisarHoje(agora: Date): Promise<{
    participacaoId: string; pessoaId: string; nome: string; eventoNome: string
    data: string; fase: 'montagem' | 'evento' | 'desmontagem'; horaDoAviso: string
  }[]> {
    const hoje = diaBRT(agora)

    type Alvo = {
      eventoId: string; eventoNome: string; data: string
      fase: 'montagem' | 'evento' | 'desmontagem'; horaDoAviso: string
    }
    const alvos: Alvo[] = []
    for (const evento of this.eventos) {
      if (!evento.ativo) continue
      const dia = (this.dias.get(evento.id) ?? []).find(d => d.data === hoje && !d.cancelado)
      if (!dia) continue

      if (dia.tipo === 'principal') {
        if (!evento.janela_entrada_inicio) continue
        alvos.push({
          eventoId: evento.id, eventoNome: evento.nome, data: dia.data, fase: 'evento',
          horaDoAviso: quandoAvisarDoDia(dia.data, evento.janela_entrada_inicio, evento.janela_entrada_fim),
        })
      } else {
        const diaPrincipal = diaBRT(evento.dataInicio ?? dia.data)
        const fase = faseDoDia(dia.data, diaPrincipal)
        if (fase === 'evento') continue
        alvos.push({
          eventoId: evento.id, eventoNome: evento.nome, data: dia.data, fase,
          horaDoAviso: new Date(`${dia.data}T${HORA_AVISO_DIA}:00-03:00`).toISOString(),
        })
      }
    }

    const prontos = alvos.filter(a => new Date(a.horaDoAviso).getTime() <= agora.getTime())
    if (!prontos.length) return []

    const resultado: {
      participacaoId: string; pessoaId: string; nome: string; eventoNome: string
      data: string; fase: 'montagem' | 'evento' | 'desmontagem'; horaDoAviso: string
    }[] = []
    for (const alvo of prontos) {
      for (const p of this.participacoes) {
        if (p.eventoId !== alvo.eventoId || !p.ativo || p.descredenciadoEm) continue
        resultado.push({
          participacaoId: p.id,
          pessoaId: p.pessoaId,
          nome: this.pessoas.find(pe => pe.id === p.pessoaId)?.nome ?? '',
          eventoNome: alvo.eventoNome,
          data: alvo.data,
          fase: alvo.fase,
          horaDoAviso: alvo.horaDoAviso,
        })
      }
    }
    return resultado
  }

  async jaEnviouLembreteHoje(participacaoId: string, tipo: string, data: string): Promise<boolean> {
    return this.lembretesEnviados.has(`${participacaoId}|${tipo}|${data}`)
  }

  async registrarLembreteEnviado(participacaoId: string, tipo: string, data: string): Promise<void> {
    this.lembretesEnviados.add(`${participacaoId}|${tipo}|${data}`)
  }

  async avisosPendentes(pessoaId: string, eventoId: string): Promise<{ id: string; titulo: string; mensagem: string }[]> {
    const hoje = diaBRT()
    const ativos = this.avisos.filter(a =>
      a.eventoId === eventoId && a.ativo && a.dataInicio <= hoje && (!a.dataFim || a.dataFim >= hoje),
    )
    if (!ativos.length) return []

    const participacao = this.participacoes.find(p => p.pessoaId === pessoaId && p.eventoId === eventoId)
    const equipeComoSupervisor = this.equipes.find(e => e.eventoId === eventoId && e.supervisorPessoaId === pessoaId)
    const equipeId = participacao?.equipeId ?? equipeComoSupervisor?.id ?? null
    const ehSupervisor = !!equipeComoSupervisor

    const elegiveis = ativos.filter(a => {
      if (a.publico === 'todos') return true
      if (a.publico === 'setores') return !!equipeId && a.equipeIds.includes(equipeId)
      if (a.publico === 'pessoa') return a.pessoaId === pessoaId
      if (a.publico === 'supervisores') return ehSupervisor
      return false
    })

    return elegiveis
      .filter(a => a.recorrente || !this.avisosVistos.has(`${a.id}|${pessoaId}`))
      .map(a => ({ id: a.id, titulo: a.titulo, mensagem: a.mensagem }))
  }

  async marcarAvisoVisto(avisoId: string, pessoaId: string): Promise<void> {
    this.avisosVistos.add(`${avisoId}|${pessoaId}`)
  }

  async registrarNotificacao(dados: {
    pessoaId: string; tipo: string; titulo: string; corpo: string; destino: string | null
  }): Promise<void> {
    this.notificacoes.push({
      id: novoId('notif'), pessoaId: dados.pessoaId, tipo: dados.tipo, titulo: dados.titulo, corpo: dados.corpo,
      destino: dados.destino, criadoEm: new Date().toISOString(), lida: false,
    })
  }

  async notificacoesDaPessoa(pessoaId: string): Promise<{
    id: string; tipo: string; titulo: string; corpo: string; criadoEm: string; lida: boolean; destino: string | null
  }[]> {
    return this.notificacoes
      .filter(n => n.pessoaId === pessoaId)
      .sort((a, b) => b.criadoEm.localeCompare(a.criadoEm))
      .map(({ id, tipo, titulo, corpo, criadoEm, lida, destino }) => ({ id, tipo, titulo, corpo, criadoEm, lida, destino }))
  }

  async marcarNotificacaoLida(id: string, pessoaId: string): Promise<void> {
    const n = this.notificacoes.find(x => x.id === id && x.pessoaId === pessoaId)
    if (n) n.lida = true
  }

  async marcarTodasNotificacoesLidas(pessoaId: string): Promise<void> {
    for (const n of this.notificacoes) if (n.pessoaId === pessoaId) n.lida = true
  }

  async tiposDesligados(pessoaId: string): Promise<string[]> {
    return [...this.preferenciasDeAviso.entries()]
      .filter(([chave, ativo]) => chave.startsWith(`${pessoaId}|`) && !ativo)
      .map(([chave]) => chave.slice(pessoaId.length + 1))
  }

  async salvarPreferencias(pessoaId: string, todosOsTipos: string[], tiposLigados: string[]): Promise<void> {
    const ligados = new Set(tiposLigados)
    for (const tipo of todosOsTipos) this.preferenciasDeAviso.set(`${pessoaId}|${tipo}`, ligados.has(tipo))
  }

  // ── Contestação de batida ────────────────────────────────────────────────

  async criarContestacao(dados: {
    participacaoId: string; tipo: 'entrada' | 'meio' | 'fim'; dataRef: string; motivo: string
  }): Promise<Contestacao> {
    const nova = {
      id: novoId('cont'),
      participacaoId: dados.participacaoId,
      tipo: dados.tipo,
      dataRef: dados.dataRef,
      motivo: dados.motivo,
      criadoEm: new Date().toISOString(),
      resolvidaEm: null,
    }
    this.contestacoes.push(nova)
    return nova
  }

  async contestacoesAbertas(participacaoId: string): Promise<Contestacao[]> {
    return this.contestacoes
      .filter(c => c.participacaoId === participacaoId && !c.resolvidaEm)
      .map(({ resolvidaEm: _resolvidaEm, ...c }) => c)
  }

  async contestacoesAbertasDeParticipacoes(participacaoIds: string[]): Promise<Contestacao[]> {
    const ids = new Set(participacaoIds)
    return this.contestacoes
      .filter(c => ids.has(c.participacaoId) && !c.resolvidaEm)
      .map(({ resolvidaEm: _resolvidaEm, ...c }) => c)
  }

  async contestacaoPorId(id: string): Promise<Contestacao | null> {
    const c = this.contestacoes.find(x => x.id === id)
    if (!c) return null
    const { resolvidaEm: _resolvidaEm, ...resto } = c
    return resto
  }

  async resolverContestacao(id: string, _resolvidaPorPessoaId: string): Promise<void> {
    const c = this.contestacoes.find(x => x.id === id)
    if (c) c.resolvidaEm = new Date().toISOString()
  }

  // ── Gastos (produto do Produtor) ────────────────────────────────────────

  async eventosDoProdutor(perfilId: string): Promise<string[]> {
    return this.produtorEventos.filter(p => p.produtorId === perfilId).map(p => p.eventoId)
  }

  async listarGastos(filtro: FiltroDeGastosNoRepositorio): Promise<GastoNoRepositorio[]> {
    const apenasInterno = filtro.eventoId === EVENTO_INTERNO
    let gastos = this.gastos.filter(g => {
      if (apenasInterno) {
        if (g.eventoId !== EVENTO_INTERNO) return false
        if (filtro.organizacaoIdSeInterno && g.organizacaoIdSeInterno !== filtro.organizacaoIdSeInterno) return false
        return true
      }
      if (filtro.eventoId) return g.eventoId === filtro.eventoId
      return true
    })
    if (filtro.categoria) gastos = gastos.filter(g => g.categoria === filtro.categoria)
    if (filtro.fornecedor) gastos = gastos.filter(g => g.fornecedor === filtro.fornecedor)
    if (filtro.pago !== undefined) gastos = gastos.filter(g => g.pago === filtro.pago)
    if (filtro.de) gastos = gastos.filter(g => g.dataGasto >= filtro.de!)
    if (filtro.ate) gastos = gastos.filter(g => g.dataGasto <= filtro.ate!)

    return [...gastos]
      .sort((a, b) => b.dataGasto.localeCompare(a.dataGasto) || b.registradoEm.localeCompare(a.registradoEm))
      .map(({ organizacaoIdSeInterno: _o, comprovantePath: _c, ...g }) => g)
  }

  async gastoPorId(id: string): Promise<GastoNoRepositorio | null> {
    const g = this.gastos.find(x => x.id === id)
    if (!g) return null
    const { organizacaoIdSeInterno: _o, comprovantePath: _c, ...resto } = g
    return resto
  }

  async criarGasto(dados: NovoGastoNoRepositorio, criadoPorId: string): Promise<{ id: string }> {
    const interno = dados.eventoId === EVENTO_INTERNO
    const eventoNome = interno
      ? 'Interno — despesas da empresa'
      : this.eventos.find(e => e.id === dados.eventoId)?.nome ?? null
    const criadoPor = this.perfis.find(p => p.id === criadoPorId)

    const id = novoId('gasto')
    this.gastos.push({
      id,
      eventoId: dados.eventoId,
      eventoNome,
      descricao: dados.descricao,
      valor: dados.valor,
      categoria: dados.categoria,
      dataGasto: dados.dataGasto,
      fornecedor: dados.fornecedor,
      formaPagamento: dados.formaPagamento,
      pagador: dados.pagador,
      pago: dados.pago,
      observacao: dados.observacao,
      origem: dados.origem,
      status: 'confirmado',
      transcricao: dados.origem === 'audio' ? dados.transcricao : null,
      registradoEm: new Date().toISOString(),
      temComprovante: !!dados.comprovanteBase64,
      comprovanteNome: dados.comprovanteBase64 ? 'comprovante.jpg' : null,
      comprovantePath: dados.comprovanteBase64 ? `${id}.jpg` : null,
      criadoPorNome: criadoPor?.nome ?? null,
      organizacaoIdSeInterno: interno ? dados.organizacaoIdSeInterno : null,
    })
    return { id }
  }

  async editarGasto(id: string, dados: NovoGastoNoRepositorio): Promise<{ erro?: string }> {
    const g = this.gastos.find(x => x.id === id)
    if (!g) return { erro: 'Este gasto não existe mais.' }

    g.descricao = dados.descricao
    g.valor = dados.valor
    g.categoria = dados.categoria
    g.dataGasto = dados.dataGasto
    g.fornecedor = dados.fornecedor
    g.formaPagamento = dados.formaPagamento
    g.pagador = dados.pagador
    g.pago = dados.pago
    g.observacao = dados.observacao
    if (dados.comprovanteBase64) {
      g.temComprovante = true
      g.comprovanteNome = 'comprovante.jpg'
      g.comprovantePath = `${id}.jpg`
    }
    return {}
  }

  async excluirGasto(id: string): Promise<{ erro?: string }> {
    const i = this.gastos.findIndex(g => g.id === id)
    if (i === -1) return { erro: 'Este gasto já não existe.' }
    this.gastos.splice(i, 1)
    return {}
  }

  async urlComprovanteGasto(id: string): Promise<string | null> {
    const g = this.gastos.find(x => x.id === id)
    if (!g?.comprovantePath) return null
    return `https://exemplo-de-teste.invalido/${g.comprovantePath}`
  }
}

/**
 * Um cenário pronto: o Henrique e Juliano, com montagem, dia do evento e
 * desmontagem — os mesmos horários que estão no banco de verdade.
 *
 * Usar o evento real como cenário de teste não é preguiça: é o caso que já
 * produziu bug de configuração duas vezes, e que a suíte precisa cobrir.
 */
export function cenarioHenriqueEJuliano() {
  const repo = new RepositorioEmMemoria()

  const pessoa = { id: 'pes-joao', nome: 'João da Silva', cpf: '12345678901', telefone: '27999255959', fotoPath: null }
  repo.pessoas.push(pessoa)

  const evento: Evento = {
    id: 'ev-hj',
    nome: 'Henrique e Juliano — Kleber Andrade',
    descricao: null,
    organizacaoId: 'org-1',
    organizacaoNome: 'Produzimos',
    local: 'Estádio Kleber Andrade',
    dataInicio: '2026-09-05T18:30:00-03:00',
    dataFim: '2026-09-06T08:00:00-03:00',
    janela_entrada_inicio: '2026-09-05T07:00:00-03:00',
    janela_entrada_fim: '2026-09-05T23:55:00-03:00',
    janela_fim_inicio: '2026-09-06T01:30:00-03:00',
    janela_fim_fim: '2026-09-06T08:00:00-03:00',
    // Desligada aqui de propósito: é com ela desligada que os testes exercitam
    // a recusa por janela. O caso ligado tem teste próprio, que a liga.
    batida_livre: false,
    checkin_autonomo: false,
    codigoConvite: 'HJK-2026-K7M2',
    exigeAprovacao: false,
    ativo: true,
  }
  repo.eventos.push(evento)

  repo.organizacoes.push({
    id: 'org-1', nome: 'Produzimos', documento: null, responsavelNome: null,
    limiteEventos: 10, valorCobrado: null, valorCobradoPeriodo: null, ativo: true,
    criadaEm: '2025-01-01T00:00:00-03:00',
  })

  repo.dias.set(evento.id, [
    { data: '2026-09-03', tipo: 'preparacao', cancelado: false, exigeMeio: true },
    { data: '2026-09-04', tipo: 'preparacao', cancelado: false, exigeMeio: true },
    { data: '2026-09-05', tipo: 'principal', cancelado: false, exigeMeio: true },
    { data: '2026-09-06', tipo: 'preparacao', cancelado: false, exigeMeio: true },
  ])

  repo.equipes.push({ id: 'eq-1', nome: 'Produção', eventoId: evento.id, exigeMeio: true })

  // Duas contas de painel prontas, na mesma organização do evento: o master
  // não pertence a nenhuma; o admin é sempre da Produzimos (org-1) — a mesma
  // regra de isolamento que `entrarComSenha` e as rotas do painel precisam
  // respeitar.
  const master: Perfil = { id: 'auth-master', nome: 'Juan Muzy', papel: 'master', organizacaoId: null, ativo: true }
  const admin: Perfil = { id: 'auth-admin', nome: 'Marina Alves', papel: 'admin', organizacaoId: 'org-1', ativo: true }
  const adminSuspenso: Perfil = {
    id: 'auth-suspenso', nome: 'Conta Bloqueada', papel: 'admin', organizacaoId: 'org-1', ativo: false,
  }
  repo.perfis.push(master, admin, adminSuspenso)

  const participacao: Participacao = {
    id: 'part-joao',
    pessoaId: pessoa.id,
    eventoId: evento.id,
    equipeId: 'eq-1',
    equipeNome: 'Produção',
    funcao: 'Auxiliar',
    supervisorNome: 'Carlos Silva',
    ativo: true,
    descredenciadoEm: null,
    valorReceber: 150,
    pago: false,
    pagoEm: null,
    qrToken: 'token-do-joao',
    cidade: 'Vitória',
    criadoEm: '2026-08-20T10:00:00-03:00',
  }
  repo.participacoes.push(participacao)

  return { repo, pessoa, evento, participacao, master, admin, adminSuspenso }
}
