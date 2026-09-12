// Um repositório em memória, para a API ser testável sem banco.
//
// O único banco que existe hoje é o de produção, com pessoas reais e um evento
// marcado para daqui a uma semana. Testar contra ele está fora de questão —
// então a API precisa rodar inteira sem nenhum.
//
// Este arquivo não vai para produção. Ele existe para os testes e para o
// desenvolvimento local antes de a implementação sobre o Supabase ficar pronta.

import type {
  AtividadeBruta, DiaDeTrabalho, Evento, EventoComContagens, LinhaDoDia, NovoRegistro, Participacao,
  ParticipacaoParaLocalizar, Perfil, Pessoa, Registro, Repositorio,
} from './repositorio.js'

let seq = 0
const novoId = (p: string) => `${p}-${++seq}`

export class RepositorioEmMemoria implements Repositorio {
  pessoas: Pessoa[] = []
  perfis: Perfil[] = []
  eventos: Evento[] = []
  participacoes: Participacao[] = []
  registros: Registro[] = []
  dias = new Map<string, DiaDeTrabalho[]>()
  equipes: { id: string; nome: string; eventoId: string; supervisorPessoaId?: string; exigeMeio?: boolean }[] = []

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

  async perfilPorId(id: string) {
    return this.perfis.find(p => p.id === id) ?? null
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
  }
  repo.participacoes.push(participacao)

  return { repo, pessoa, evento, participacao, master, admin, adminSuspenso }
}
