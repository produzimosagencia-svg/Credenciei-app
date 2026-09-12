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

  /** Quem tem conta de painel, pelo id do Supabase Auth. */
  perfilPorId(id: string): Promise<Perfil | null>

  // ── Evento ──────────────────────────────────────────────────────────────
  eventoPorCodigo(codigo: string): Promise<Evento | null>
  eventoPorId(id: string): Promise<Evento | null>
  diasDoEvento(eventoId: string): Promise<DiaDeTrabalho[]>

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
  /**
   * Apaga um registro — só usado para REABRIR um turno (a saída que a
   * pessoa "desfez" voltando a trabalhar). O horário apagado não é
   * segredo: quem chama já sabe qual era antes de decidir apagar.
   */
  apagarRegistro(id: string): Promise<void>

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
}
