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

import type { Papel } from '@credenciei/dominio'
import type { TipoBatida } from './comum.js'

export type { Papel }

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

// ─── O painel ───────────────────────────────────────────────────────────────
//
// É a tela inicial de quem tem conta de painel — a mesma do sistema web, em
// formato de app. O RECORTE dos números vem do servidor, nunca da tela: o
// master soma todas as organizações, o admin só a dele, o supervisor só o
// próprio setor. Se a tela filtrasse, bastaria adulterar o pedido para ver o
// que não é seu.

/**
 * Um número do topo do painel.
 *
 * O `tom` vem do SIGNIFICADO do número — o que precisa de atenção é laranja, o
 * que está bem é verde, o que só conta coisa é azul — nunca da posição na
 * fileira. Quem decide é o servidor, porque é ele que sabe se 65 pessoas fora
 * é normal às 9h e preocupante às 19h.
 */
export type IndicadorDoPainel = {
  chave: string
  rotulo: string
  valor: number
  sub?: string
  tom: 'acento' | 'sucesso' | 'aviso' | 'info' | 'erro' | 'neutro'
}

export type EventoDoPainel = {
  eventoId: string
  nome: string
  dataInicio: string
  local: string | null
  setores: number
  /** Quantas pessoas o evento espera hoje. */
  equipe: number
  presentes: number
  /** Está acontecendo agora? É o que ganha a marca "AO VIVO". */
  aoVivo: boolean
}

/** Uma batida que acabou de acontecer. É o pulso da operação. */
export type AtividadeRecente = {
  id: string
  nome: string
  setor: string | null
  tipo: TipoBatida
  em: string
}

export type Painel = {
  /** A data vem do SERVIDOR, não do relógio do aparelho — fusos divergem. */
  data: string
  indicadores: IndicadorDoPainel[]
  eventos: EventoDoPainel[]
  atividade: AtividadeRecente[]
  /**
   * De que janela falam os números, escrito para a pessoa ler.
   *
   * Sem isto, "Batidas na janela: 0" é ambíguo: ninguém bateu, ou a janela
   * ainda não abriu? A frase resolve, e é a mesma que o painel web mostra.
   */
  legendaDaJanela: string | null
}

// ─── Operação: escanear e registrar por outra pessoa ────────────────────────
//
// ─── POR QUE ESTES MÉTODOS RECEBEM ID, E OS DO COLABORADOR NÃO ──────────────
//
// A regra "nenhuma rota aceita id de pessoa vindo de fora" nasceu para o
// colaborador: ele pergunta "as MINHAS", e o servidor responde sobre ele mesmo.
// Não existe pedido dele que possa apontar para outra pessoa.
//
// Aqui é o contrário por natureza: o trabalho de quem opera o evento é agir
// SOBRE outras pessoas — escanear o crachá de alguém, registrar a batida de
// quem perdeu o horário. O id tem que vir de fora, porque é o de outra pessoa.
//
// O que protege não é a ausência do id, é o ESCOPO: o servidor só aceita ids
// que estão dentro do alcance de quem pediu. O supervisor não localiza gente de
// outro setor, o admin não localiza gente de outra organização. Quem não está
// no alcance responde igual a quem não existe — senão, trocar o id vira uma
// forma de descobrir quem está cadastrado.

/** Um evento que ESTA pessoa pode escanear. Master vê todos; supervisor, um. */
export type EventoEscaneavel = {
  eventoId: string
  nome: string
}

/**
 * O que a leitura vai gravar.
 *
 * Só entrada e saída. **O meio não está aqui de propósito**: ele é registrado
 * pelo próprio colaborador, com foto, na credencial dele — é a etapa que prova
 * que a pessoa continuou no evento, e não faria sentido outra pessoa registrar
 * por ela no portão.
 */
export type MomentoDaLeitura = 'entrada' | 'fim'

export type PessoaLida = {
  nome: string
  funcao: string | null
}

/**
 * O que aconteceu na leitura.
 *
 * `etapa_errada` é um caso separado dos outros de propósito. Nos demais, o
 * aviso pode sumir sozinho em dois segundos e meio: a fila anda, e o próximo já
 * está com o celular na mão. Neste, há uma DECISÃO a tomar com a pessoa parada
 * na frente — e apagar a tela no meio dela devolveria o operador ao escuro.
 *
 * Ela também não é "QR inválido": isso faria o operador pensar em falsificação
 * e chamar a segurança, quando o que houve foi alguém mostrar o crachá da
 * montagem no dia do evento. Por isso a resposta diz as DUAS etapas.
 */
export type ResultadoDaLeitura =
  | { situacao: 'registrado'; momento: TipoBatida; pessoa: PessoaLida; mensagem: string }
  | { situacao: 'duplicado'; momento: TipoBatida; pessoa: PessoaLida; mensagem: string }
  | { situacao: 'etapa_errada'; doQr: string; deHoje: string; mensagem: string }
  | { situacao: 'recusado'; mensagem: string }

/**
 * A conferência pelo CPF, quando o QR não serve.
 *
 * É a saída para o operador que está com alguém na frente e um crachá que não
 * passa. Sem ela sobram duas opções ruins: mandar a pessoa embora, ou deixar
 * entrar sem conferir.
 */
export type ConferenciaPorCpf = {
  encontrada: boolean
  nome?: string
  funcao?: string | null
  setorNome?: string | null
  /** Já foi ativada no evento? Quem não foi não pode ter presença registrada. */
  ativo?: boolean
  /** As etapas que ela já registrou hoje. */
  etapasFeitas?: TipoBatida[]
  mensagem: string
}

/** Uma das pessoas que a busca encontrou. Nome quase nunca é único. */
export type CandidatoLocalizado = {
  participacaoId: string
  nome: string
  cpf: string
  funcao: string | null
  setorNome: string
  eventoNome: string
}

export type FichaLocalizada = {
  participacaoId: string
  nome: string
  cpf: string
  funcao: string | null
  fotoUrl: string | null
  /** Já ativada no evento? Sem isso não há presença a registrar. */
  ativo: boolean
  setorNome: string
  eventoNome: string
  supervisorNome: string | null
  ultimaBatida: { rotulo: string; quandoISO: string } | null
  /**
   * A batida que está faltando.
   *
   * Quem opera NÃO escolhe qual etapa gravar: o servidor grava a pendente. Uma
   * lista de opções abriria espaço para gravar a saída de alguém que ainda não
   * entrou, e para "consertar" um horário depois do fato.
   */
  proximaPendente: { tipo: TipoBatida; rotulo: string } | null
}

/**
 * O que acompanha uma batida registrada POR OUTRA PESSOA.
 *
 * A foto é obrigatória, e é o ponto central: ela prova que o colaborador estava
 * na frente de quem registrou. Sem ela, registrar por terceiro seria só digitar
 * um nome — e uma batida que ninguém consegue contestar é uma porta aberta.
 *
 * A localização é prova de auditoria, não requisito: se o aparelho negar o GPS,
 * o registro segue. Barrar por falta de GPS deixaria alguém sem ponto por causa
 * de uma permissão do celular.
 */
export type BatidaAssistida = {
  fotoBase64: string
  lat?: number
  lng?: number
  dispositivo?: string
}
