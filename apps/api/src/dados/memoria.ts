// Um repositório em memória, para a API ser testável sem banco.
//
// O único banco que existe hoje é o de produção, com pessoas reais e um evento
// marcado para daqui a uma semana. Testar contra ele está fora de questão —
// então a API precisa rodar inteira sem nenhum.
//
// Este arquivo não vai para produção. Ele existe para os testes e para o
// desenvolvimento local antes de a implementação sobre o Supabase ficar pronta.

import type {
  DiaDeTrabalho, Evento, NovoRegistro, Participacao, Pessoa, Registro, Repositorio,
} from './repositorio.js'

let seq = 0
const novoId = (p: string) => `${p}-${++seq}`

export class RepositorioEmMemoria implements Repositorio {
  pessoas: Pessoa[] = []
  eventos: Evento[] = []
  participacoes: Participacao[] = []
  registros: Registro[] = []
  dias = new Map<string, DiaDeTrabalho[]>()
  equipes: { id: string; nome: string; eventoId: string; supervisorPessoaId?: string }[] = []

  // ── Identidade ────────────────────────────────────────────────────────────

  async pessoaPorTelefone(telefone: string) {
    const d = (telefone ?? '').replace(/\D/g, '')
    return this.pessoas.find(p => (p.telefone ?? '').replace(/\D/g, '') === d) ?? null
  }

  async pessoaPorId(id: string) {
    return this.pessoas.find(p => p.id === id) ?? null
  }

  async criarPessoa(p: Omit<Pessoa, 'id'>) {
    const nova = { ...p, id: novoId('pes') }
    this.pessoas.push(nova)
    return nova
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

  // ── Participação ──────────────────────────────────────────────────────────

  async participacoesDaPessoa(pessoaId: string) {
    return this.participacoes.filter(p => p.pessoaId === pessoaId)
  }

  async participacaoPorId(id: string) {
    return this.participacoes.find(p => p.id === id) ?? null
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
    codigoConvite: 'HJK-2026-K7M2',
    exigeAprovacao: false,
  }
  repo.eventos.push(evento)

  repo.dias.set(evento.id, [
    { data: '2026-09-03', tipo: 'preparacao', cancelado: false },
    { data: '2026-09-04', tipo: 'preparacao', cancelado: false },
    { data: '2026-09-05', tipo: 'principal', cancelado: false },
    { data: '2026-09-06', tipo: 'preparacao', cancelado: false },
  ])

  repo.equipes.push({ id: 'eq-1', nome: 'Produção', eventoId: evento.id })

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

  return { repo, pessoa, evento, participacao }
}
