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


// ─── Atividades do evento ───────────────────────────────────────────────────
//
// Não é o Painel. O Painel responde "como está"; esta tela responde "o que
// aconteceu, na ordem, e por quem". É a tela que se abre quando alguém contesta
// uma batida — e a que mostra NOME POR NOME quem ainda não chegou, em vez de só
// o número.

/**
 * Como a batida entrou no sistema.
 *
 * É a primeira coisa que se olha quando um registro é contestado: uma leitura
 * de QR no portão e uma batida que outra pessoa fez pelo colaborador têm pesos
 * diferentes na hora de decidir quem tem razão.
 */
export type ComoFoiRegistrada = 'qr' | 'foto' | 'assistido'

export type LinhaDaAtividade = {
  id: string
  nome: string
  cpf: string
  setor: string
  etapa: TipoBatida
  em: string
  como: ComoFoiRegistrada
  /** Endereço aproximado, quando o aparelho deu a localização. */
  local: string | null
  /** Quem registrou, quando não foi a própria pessoa. */
  registradoPor: string | null
  justificativa: string | null
}

/** Uma pessoa nas listas de "não chegou" e "ainda no evento". */
export type PessoaDaLista = {
  id: string
  nome: string
  setor: string
  /**
   * O telefone aparece na lista de quem não chegou de propósito: é dali que
   * sai a ligação. Ter que abrir outra tela para achar o número, no meio do
   * evento, é o que faz ninguém ligar.
   */
  telefone: string | null
}

export type AtividadesDoEvento = {
  eventoId: string
  eventoNome: string
  /** Batidas hoje · Presentes agora · Ainda não chegaram · Já saíram. */
  indicadores: IndicadorDoPainel[]
  /** Da mais recente para a mais antiga. */
  linhas: LinhaDaAtividade[]
  /** Quantas em cada etapa — é o contador que vai nas abas do filtro. */
  porEtapa: Record<TipoBatida, number>
  naoChegaram: PessoaDaLista[]
  aindaNoEvento: PessoaDaLista[]
  /**
   * O log bateu no teto?
   *
   * Acima de umas duzentas linhas a tela fica pesada e ninguém rola até o fim.
   * Quando corta, a tela precisa DIZER que está mostrando só as mais recentes —
   * senão quem procura uma batida antiga conclui que ela não existe.
   */
  noTeto: boolean
}

// ─── Acessos ────────────────────────────────────────────────────────────────
//
// Quem consegue ENTRAR no sistema. Não confundir com a equipe do evento: quem
// só trabalha no dia aparece dentro do setor, não aqui.

export type Acesso = {
  id: string
  nome: string
  /** E-mail ou CPF, do jeito que a pessoa entra. */
  identificador: string
  papel: Papel
  /**
   * Inativo é bloqueado no login SEM perder o histórico.
   *
   * É o que se usa quando alguém sai da equipe mas os registros antigos
   * precisam continuar existindo. Excluir apaga; desativar só fecha a porta.
   */
  ativo: boolean
  /** Supervisor mostra o setor; os outros papéis, quantos eventos. */
  setorNome: string | null
  eventos: number
  criadoEm: string
  /**
   * É a própria pessoa que está olhando?
   *
   * A linha de quem está logado nunca mostra as ações — ninguém remove o
   * próprio acesso por engano e fica trancado para fora do sistema.
   */
  souEu: boolean
}

export type ListaDeAcessos = {
  itens: Acesso[]
  total: number
  ativos: number
  inativos: number
}

export type FiltroDeAcessos = {
  busca?: string
  situacao?: 'todos' | 'ativos' | 'inativos'
}

export type SetorDoEvento = { setorId: string; nome: string }

/** Evento com os setores dele: todo supervisor nasce preso a um setor. */
export type EventoComSetores = {
  eventoId: string
  nome: string
  setores: SetorDoEvento[]
}

export type NovoAcesso = {
  nome: string
  cpf: string
  telefone: string
  eventoId: string
  setorId: string
  /**
   * Criar já ativo, ou bloqueado?
   *
   * Bloqueado é útil para deixar tudo pronto na véspera e liberar só no dia.
   */
  ativo: boolean
}


// ─── O evento por dentro ────────────────────────────────────────────────────
//
// A tela de configuração de um evento: quantos setores e pessoas, quanto da
// equipe já passou por cada etapa, o cartaz da portaria e a lista de setores
// com os supervisores de cada um.
//
// É a tela de quem ORGANIZA — diferente do Painel, que responde "como está", e
// das Atividades, que respondem "o que aconteceu".

export type SupervisorDoSetor = {
  id: string
  nome: string
  ativo: boolean
}

/**
 * Um setor visto de dentro da tela do evento.
 *
 * Tem nome próprio porque já existe `SetorDoEvento`, que é o par
 * id-e-nome usado para escolher o setor de um supervisor novo. Este aqui
 * carrega o estado do setor — quantos, quanto e quem cuida.
 */
export type SetorDetalhado = {
  setorId: string
  nome: string
  pessoas: number
  /**
   * Quantas pessoas o setor espera ter.
   *
   * Quando existe, vira barra de progresso — que diz o que o número sozinho não
   * diz: o quanto falta. Sem teto para comparar, a barra não aparece.
   */
  estimado: number | null
  valorPorPessoa: number | null
  /** O link que a equipe usa para se cadastrar sozinha neste setor. */
  linkDoFormulario: string
  supervisores: SupervisorDoSetor[]
}

/**
 * O cartaz da portaria.
 *
 * Um QR impresso e colado na entrada. Quem chega sem estar na lista aponta a
 * câmera, escolhe o setor e se cadastra sozinho.
 *
 * `cadastrados` em zero é diferente de "ainda não ligou" — por isso os dois
 * estados existem separados: `aberta` diz se a porta está de pé, `cadastrados`
 * diz se alguém passou por ela.
 */
export type Portaria = {
  aberta: boolean
  /** O endereço do cartaz. `null` enquanto a portaria nunca foi ligada. */
  endereco: string | null
  cadastrados: number
}

export type ProgressoDaEtapa = {
  etapa: TipoBatida
  feitos: number
  total: number
}

export type EventoDetalhado = {
  eventoId: string
  nome: string
  ativo: boolean
  local: string | null
  dataInicio: string
  dataFim: string | null
  /**
   * Quantos dias de preparação o evento tem além do dia principal.
   *
   * A tela diz isso em uma linha porque é a dúvida que mais aparece: por que
   * fulano bateu ponto às três da manhã num dia e no outro não conseguiu às
   * dez. Nos dias de preparação a entrada e a saída são livres; no dia do
   * evento valem os horários configurados.
   */
  diasDePreparacao: number
  /** Setores · Funcionários · Presentes agora · Ainda não chegaram. */
  indicadores: IndicadorDoPainel[]
  progresso: ProgressoDaEtapa[]
  portaria: Portaria
  setores: SetorDetalhado[]
  totalPessoas: number
}


// ─── A equipe de um setor ───────────────────────────────────────────────────

/**
 * Como está uma etapa para uma pessoa, AGORA.
 *
 *   feito        ela registrou;
 *   aberto       ainda dá tempo — ou a etapa é livre, sem horário;
 *   fechado      o prazo passou e ela não registrou. É a pendência;
 *   indefinido   a janela ainda nem abriu.
 *
 * Quem calcula é o SERVIDOR, e não a tela: o status depende da janela do
 * evento, do dia, e — no caso do meio — da entrada de CADA pessoa. Deixar a
 * tela adivinhar a partir de "tem horário?" faria "livre" virar "indefinido", e
 * a equipe inteira apareceria cinza.
 */
export type StatusDaEtapa = 'feito' | 'aberto' | 'fechado' | 'indefinido'

export type PessoaDoSetor = {
  participacaoId: string
  nome: string
  cpf: string
  telefone: string | null
  empresa: string | null
  funcao: string | null
  fotoUrl: string | null
  /**
   * Ativada no evento?
   *
   * Quem não foi ativada não registra presença. Ela aparece na lista de
   * propósito — sumir faria parecer que o cadastro não chegou.
   */
  ativo: boolean
  valorReceber: number
  pago: boolean
  entrada: string | null
  meio: string | null
  fim: string | null
  statusEntrada: StatusDaEtapa
  statusMeio: StatusDaEtapa
  statusFim: StatusDaEtapa
}

export type EquipeDoSetor = {
  setorId: string
  setorNome: string
  eventoId: string
  eventoNome: string
  /** Total · Com pendências · A receber (equipe). */
  indicadores: IndicadorDoPainel[]
  progresso: ProgressoDaEtapa[]
  pessoas: PessoaDoSetor[]
}

// ─── Planilhas ──────────────────────────────────────────────────────────────
//
// Importar, baixar o modelo e exportar são três operações da MESMA ideia — a
// equipe entrando ou saindo por arquivo. No computador elas cabem lado a lado;
// num celular, três botões numa fileira já quebram a linha e escondem o que
// importa. Por isso a tela tem um botão só, e as três opções aparecem dentro.

export type ArquivoDePlanilha = {
  /** O nome com extensão, como a pessoa vai ver ao salvar. */
  nome: string
  /**
   * Onde baixar.
   *
   * Um endereço, e não os bytes: a planilha de um evento grande passa de um
   * megabyte, e trafegá-la dentro da resposta JSON dobraria o tamanho dela em
   * base64 numa rede de estádio.
   */
  url: string
}

export type ResultadoDaImportacao = {
  criados: number
  atualizados: number
  /** Linhas puladas — duplicadas, ou sem os campos obrigatórios. */
  ignorados: number
  /**
   * O que deu errado, linha a linha.
   *
   * Uma planilha com trinta linhas e dois erros precisa importar as vinte e
   * oito e DIZER quais duas ficaram de fora. Recusar o arquivo inteiro por
   * causa de duas linhas obriga a pessoa a caçar o erro sem nenhuma pista.
   */
  erros: string[]
}


// ─── Editar o evento ────────────────────────────────────────────────────────

export type DiaDeTrabalho = {
  /** "2026-09-05". */
  data: string
  tipo: 'principal' | 'preparacao'
  /**
   * Já tem batida registrada neste dia?
   *
   * Dia com batida NÃO pode ser desmarcado: apagá-lo tiraria do sistema
   * presenças que já aconteceram — e é justamente delas que sai o pagamento.
   * A tela mostra o cadeado; o servidor recusa de qualquer jeito.
   */
  temBatidas: boolean
}

export type ConfiguracaoDoEvento = {
  eventoId: string
  nome: string
  descricao: string | null
  local: string | null
  dataInicio: string | null
  dataFim: string | null
  /**
   * O dia do evento não recusa por horário.
   *
   * Os horários abaixo continuam gravados e valendo como REFERÊNCIA: são eles
   * que a equipe recebe na mensagem do dia, e é por eles que o sistema calcula
   * quem está atrasado. O que sai é só a recusa no portão.
   */
  batidaLivre: boolean
  janelaEntradaInicio: string | null
  janelaEntradaFim: string | null
  janelaFimInicio: string | null
  janelaFimFim: string | null
  /** O dia principal, derivado de `dataInicio`. Não é escolhido à mão. */
  diaPrincipal: string | null
  dias: DiaDeTrabalho[]
}

/** O que a tela de edição manda de volta. Tudo junto, num salvamento só. */
export type EdicaoDoEvento = {
  nome: string
  descricao: string | null
  local: string | null
  dataInicio: string | null
  dataFim: string | null
  batidaLivre: boolean
  janelaEntradaInicio: string | null
  janelaEntradaFim: string | null
  janelaFimInicio: string | null
  janelaFimFim: string | null
}

export type ResultadoDosDias = {
  /** Quantos dias de PREPARAÇÃO ficaram salvos — sem contar o dia do evento. */
  dias: number
  /**
   * Quantos foram mantidos mesmo desmarcados, por já terem batidas.
   *
   * A tela precisa dizer isso: sem o aviso, o produtor desmarca, salva, e vê o
   * dia continuar lá — e conclui que o botão não funcionou.
   */
  preservados: number
}
