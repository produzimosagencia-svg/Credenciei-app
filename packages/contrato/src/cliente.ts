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
  ConviteDoEvento, DiaDaParticipacao, EnvioDeBatida, Eu,
  FinanceiroDaParticipacao, Painel, PainelDaEquipe, RespostaDeBatida,
  ResumoParticipacao, Sessao,
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

  // ── Supervisor ──────────────────────────────────────────────────────────
  painelDaEquipe(eventoId: string): Promise<PainelDaEquipe>
}
