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
}

export type Evento = {
  id: string
  nome: string
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
  codigoConvite: string | null
  exigeAprovacao: boolean
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
}

export type DiaDeTrabalho = {
  data: string
  tipo: 'principal' | 'preparacao'
  cancelado: boolean
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
}

export type NovoRegistro = Omit<Registro, 'recebidoEm'> & { recebidoEm?: string }

export interface Repositorio {
  // ── Identidade ──────────────────────────────────────────────────────────
  pessoaPorTelefone(telefone: string): Promise<Pessoa | null>
  pessoaPorId(id: string): Promise<Pessoa | null>
  criarPessoa(p: Omit<Pessoa, 'id'>): Promise<Pessoa>

  /** Quem tem conta de painel, pelo id do Supabase Auth. */
  perfilPorId(id: string): Promise<Perfil | null>

  // ── Evento ──────────────────────────────────────────────────────────────
  eventoPorCodigo(codigo: string): Promise<Evento | null>
  eventoPorId(id: string): Promise<Evento | null>
  diasDoEvento(eventoId: string): Promise<DiaDeTrabalho[]>

  // ── Participação ────────────────────────────────────────────────────────
  participacoesDaPessoa(pessoaId: string): Promise<Participacao[]>
  participacaoPorId(id: string): Promise<Participacao | null>
  criarParticipacao(p: Omit<Participacao, 'id'>): Promise<Participacao>

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
  gravarRegistro(r: NovoRegistro): Promise<Registro>

  // ── Supervisor ──────────────────────────────────────────────────────────
  participacoesDaEquipe(equipeId: string): Promise<(Participacao & { pessoa: Pessoa })[]>
  equipeDoSupervisor(pessoaId: string): Promise<{ id: string; nome: string; eventoId: string } | null>
}
