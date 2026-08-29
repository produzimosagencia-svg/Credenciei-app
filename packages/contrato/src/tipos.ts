// O contrato entre o aplicativo e o servidor.
//
// ─── POR QUE ISTO EXISTE ANTES DA API ───────────────────────────────────────
//
// A API ainda não pode ser construída — ela mora no sistema de produção, e
// mexer lá depende de autorização. Mas o aplicativo não precisa esperar: basta
// que o contrato esteja escrito.
//
// Escrever o contrato primeiro tem uma vantagem que não é só de cronograma. É
// aqui que se decide o que o app PODE pedir — e, por consequência, o que ele
// nunca vai conseguir ver. Um contrato onde o colaborador pede
// `/participacoes/{id}` é um contrato que convida a trocar o id e ver a de
// outra pessoa. Um contrato onde ele pede "as minhas" não tem essa porta.
//
// Por isso quase nada aqui recebe id de pessoa: o servidor sabe quem está
// perguntando pelo token, e responde sobre essa pessoa. É a diferença entre
// "quem está pedindo pode ver isto?" e "isto existe?".

import type { TipoBatida } from './comum.js'

// ─── Identidade ─────────────────────────────────────────────────────────────

export type Sessao = {
  /** Token curto, mandado em toda chamada. */
  token: string
  /** Quando o token vence — o app renova antes, sem a pessoa perceber. */
  expiraEm: string
  /** Token longo, guardado em local seguro do aparelho, só para renovar. */
  renovacao: string
  papel: Papel
}

/**
 * Os papéis, iguais aos do sistema atual.
 *
 * `colaborador` é novo: hoje essa pessoa não tem login nenhum, ela acessa por
 * um link com o token da credencial dentro. Com conta permanente, passa a ser
 * um papel de verdade — e o mais restrito de todos.
 */
export type Papel = 'master' | 'admin' | 'supervisor' | 'colaborador'

export type Eu = {
  pessoaId: string
  nome: string
  /** Só os últimos dígitos: a tela não precisa do CPF inteiro para confirmar. */
  cpfFinal: string
  telefone: string | null
  fotoUrl: string | null
  papel: Papel
}

// ─── Entrar num evento ──────────────────────────────────────────────────────

export type ConviteDoEvento = {
  eventoId: string
  eventoNome: string
  organizacaoNome: string
  local: string | null
  dataInicio: string
  /** Campos que ESTE evento pede além do que já está na conta. */
  camposExtras: CampoDoFormulario[]
  /** O organizador confere antes de valer? Muda o que a tela promete. */
  exigeAprovacao: boolean
}

export type CampoDoFormulario = {
  chave: string
  rotulo: string
  tipo: 'texto' | 'numero' | 'escolha' | 'data'
  obrigatorio: boolean
  /** Só para `escolha`. */
  opcoes?: string[]
}

// ─── A participação, que é o vínculo com um evento ──────────────────────────

export type ResumoParticipacao = {
  participacaoId: string
  eventoId: string
  eventoNome: string
  local: string | null
  dataInicio: string
  equipe: string | null
  funcao: string | null
  supervisor: string | null
  situacao: 'aguardando_aprovacao' | 'credenciado' | 'descredenciado'
  /** Quando existe, é o próximo evento da pessoa — o que a tela abre primeiro. */
  emAndamento: boolean
}

export type DiaDaParticipacao = {
  data: string
  etapa: 'montagem' | 'evento' | 'desmontagem'
  entrada: string | null
  meioEsperado: string | null
  meio: string | null
  meioAtrasoMin: number | null
  saida: string | null
  compareceu: boolean
  horas: number | null
}

/**
 * O que a pessoa vê sobre o próprio dinheiro.
 *
 * Só dela, sempre. Não existe endpoint que devolva o financeiro de outra
 * pessoa para o papel `colaborador` — a restrição está no formato, não numa
 * verificação que alguém possa esquecer de fazer.
 */
export type FinanceiroDaParticipacao = {
  diasTrabalhados: number
  valorPrevisto: number | null
  situacao: 'pendente' | 'em_processamento' | 'pago'
  pagoEm: string | null
}

// ─── Bater ponto ────────────────────────────────────────────────────────────

export type EnvioDeBatida = {
  /**
   * Gerado no aparelho. O servidor guarda e recusa o segundo envio do mesmo.
   * É o que torna reenviar seguro — ver `@credenciei/offline`.
   */
  id: string
  participacaoId: string
  tipo: TipoBatida
  /** O relógio do APARELHO. O servidor grava também o próprio, para conferir. */
  registradoEm: string
  fotoBase64?: string
  lat?: number
  lng?: number
}

/**
 * A resposta precisa distinguir DECISÃO de FALHA.
 *
 * `recusado` é decisão: fora da janela, cadastro inativo, dia não marcado.
 * Reenviar não muda, e a fila descarta e explica.
 *
 * Falha de transporte nem chega aqui — vira exceção, e a fila tenta de novo.
 * Confundir os dois faz o aparelho insistir para sempre em algo que nunca vai
 * passar, ou jogar fora uma batida que a pessoa fez de verdade.
 */
export type RespostaDeBatida =
  | { situacao: 'registrado'; em: string }
  | { situacao: 'duplicado'; em: string }
  | { situacao: 'recusado'; motivo: string }

// ─── Supervisor ─────────────────────────────────────────────────────────────

export type PessoaNaEquipe = {
  participacaoId: string
  nome: string
  funcao: string | null
  fotoUrl: string | null
  entrada: string | null
  meio: string | null
  saida: string | null
  /** O que falta agora — o que o supervisor precisa resolver. */
  pendencia: 'entrada' | 'meio' | 'saida' | null
}

export type PainelDaEquipe = {
  eventoNome: string
  equipeNome: string
  data: string
  etapa: 'montagem' | 'evento' | 'desmontagem'
  total: number
  presentes: number
  pessoas: PessoaNaEquipe[]
}
