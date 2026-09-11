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
  /**
   * Quase sempre uma contagem. Aceita texto pronto — "68%", uma data curta —
   * para os poucos indicadores que não são contagem; quem monta já formata,
   * porque o cartão só imprime o que recebe.
   */
  valor: number | string
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
  /**
   * Saiu e voltou no mesmo dia: a saída anterior foi apagada, o turno está
   * aberto de novo. Separado de `registrado` de propósito — "turno
   * reaberto" é uma frase que o operador precisa ler, não uma entrada igual
   * às outras.
   */
  | { situacao: 'reaberto'; pessoa: PessoaLida; mensagem: string }
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
  /**
   * O CPF exato não achou ninguém, e isto veio da busca por proximidade
   * (até 2 algarismos diferentes) — o operador precisa CONFIRMAR que é a
   * pessoa certa antes de qualquer coisa, nunca é escolhido sozinho mesmo
   * quando sobra um candidato só.
   */
  cpfAproximado?: boolean
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
   * A etapa que o sistema RECOMENDA (a primeira sem registro) — só uma
   * sugestão pré-marcada na tela. Quem decide de verdade é o operador: ver
   * `etapas`, abaixo, e `registrarPresencaAssistida`.
   *
   * Trazido do site em 11/09/2026: existia uma trava aqui ("o sistema decide
   * sozinho"), pensada contra erro; na operação real virou o problema
   * oposto — sem QR na hora, pode faltar entrada, meio OU saída, e às vezes
   * o que o sistema calcula como "próxima" não é a que aconteceu de
   * verdade. O operador não tinha como corrigir.
   */
  proximaPendente: { tipo: TipoBatida; rotulo: string } | null
  /**
   * As três etapas com o estado de cada uma — o que alimenta o seletor.
   * `quandoISO: null` = ainda não registrada; presente = já tem registro, e
   * escolhê-la de novo SOBRESCREVE o horário — é uma correção, não uma
   * duplicata.
   */
  etapas: { tipo: TipoBatida; rotulo: string; quandoISO: string | null }[]
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
 *
 * `tipo` é a etapa que O OPERADOR escolheu — não é mais recalculada pelo
 * servidor a partir da pendência. Continua validada (precisa ser uma das
 * três), e continua tudo auditado do mesmo jeito.
 */
export type BatidaAssistida = {
  tipo: TipoBatida
  fotoBase64: string
  lat?: number
  lng?: number
  dispositivo?: string
  motivo?: string
}


// ─── Atividades do evento ───────────────────────────────────────────────────
//
// Não é o Painel. O Painel responde "como está"; esta tela responde "quem, num
// dia, cumpriu (ou não) cada etapa" — a mesma pergunta que `/admin/atividades`
// responde no site, trazida em 11/09/2026 com as sete visões e o mesmo
// seletor de dia, no lugar da linha do tempo que a tela tinha antes.
//
// As sete visões e as linhas vêm de `lib/presenca-visoes.ts` no site,
// compartilhado com a tela de Presença de dentro do evento — uma régua só,
// para "Atividades" e "Presença" nunca dizerem coisas diferentes sobre a
// mesma pessoa no mesmo dia.

export type VisaoDeAtividade =
  | 'entrada' | 'meio' | 'fim' | 'presentes' | 'faltam' | 'sem_meio' | 'sem_saida'

export const VISOES_DE_ATIVIDADE: Record<VisaoDeAtividade, { titulo: string; icone: string }> = {
  entrada: { titulo: 'Registraram a entrada', icone: 'LogIn' },
  meio: { titulo: 'Registraram o meio', icone: 'Camera' },
  fim: { titulo: 'Registraram a saída', icone: 'LogOut' },
  presentes: { titulo: 'Presentes agora', icone: 'Clock' },
  faltam: { titulo: 'Ainda não chegaram', icone: 'UserX' },
  sem_meio: { titulo: 'Não fizeram o meio', icone: 'CameraOff' },
  sem_saida: { titulo: 'Não fizeram a saída', icone: 'LogOut' },
}

/** Uma linha da visão escolhida — quem fez, ou quem está devendo, a etapa. */
export type LinhaPresenca = {
  id: string
  nome: string
  cpf: string
  setor: string
  /** `null` numa pendência: é justamente o horário que está faltando. */
  em: string | null
  /** Lançado à mão (registro assistido / ponto manual), e não pelo próprio QR. */
  manual: boolean
}

export type AtividadesDoEvento = {
  eventoId: string
  eventoNome: string
  /** Os dias de operação do evento — sempre visível, mesmo com um só. */
  dias: string[]
  diaEscolhido: string
  /** Hoje em Brasília — para o seletor marcar "(hoje)". */
  hoje: string
  /** Presentes agora · Entradas no dia · Saídas no dia · Pendências. */
  numeros: { presentes: number; entradas: number; saidas: number; pendencias: number }
  linhas: LinhaPresenca[]
  /** Rótulo da coluna de horário — muda com a visão ("Entrou às", "Registrou às"). */
  colunaHora: string
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
  /** Só o suporte tem — opcional. Passada a data, o acesso para sozinho. */
  expiraEm: string | null
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

/**
 * A função de quem está sendo criado — decide o vínculo que a tela pede.
 *
 * Trazido do site em 11/09/2026, do formulário `NovoUsuarioForm`: eram só
 * "supervisor" antes. Fica fora `admin` e `produtor` de propósito — admin é
 * criado pela plataforma, noutro lugar; produtor é do módulo Gastos, que o
 * app não tem (Epic 19).
 */
export type FuncaoDeAcesso = 'supervisor' | 'operador_portao' | 'suporte'

export type NovoAcesso = {
  funcao: FuncaoDeAcesso
  nome: string
  cpf: string
  telefone: string
  eventoId: string
  /** Só o supervisor tem: os outros dois são do evento inteiro, sem setor. */
  setorId?: string
  /** Só o suporte tem — opcional. Passada a data, o acesso para sozinho. */
  expiraEm?: string | null
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

/**
 * O que "Novo evento" pede.
 *
 * Batida livre e dias de preparação ficam de fora de propósito — são de
 * EDITAR, não de criar: o sistema web só deixa marcar os dias depois que o
 * evento existe, porque a grade de dias depende da data de início já salva.
 */
export type DadosDeNovoEvento = {
  /**
   * Obrigatório só para o master, que não pertence a organização nenhuma.
   * Sem dono, o evento não aparece pra nenhum admin — por isso o admin nem
   * vê este campo: o evento dele é sempre da própria organização.
   */
  organizacaoId?: string | null
  nome: string
  descricao?: string | null
  local?: string | null
  dataInicio: string
  dataFim: string
  janelaEntradaInicio?: string | null
  janelaEntradaFim?: string | null
  janelaFimInicio?: string | null
  janelaFimFim?: string | null
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


// ─── A ficha de uma pessoa da equipe ────────────────────────────────────────
//
// O que se abre ao tocar no nome de alguém na lista do setor. Junta o que está
// espalhado em quatro consultas — quem é, onde está, o que bateu hoje, quanto
// tem a receber e o histórico inteiro — porque quem abre está com uma pergunta
// só na cabeça e não deveria ter que navegar para respondê-la.

export type FichaDaPessoa = {
  participacaoId: string
  nome: string
  cpf: string
  telefone: string | null
  fotoUrl: string | null
  empresa: string | null
  funcao: string | null
  eventoNome: string
  setorId: string
  setorNome: string
  ativo: boolean

  valorReceber: number
  pago: boolean
  pagoEm: string | null
  chavePix: string | null

  /** As três etapas de hoje. `null` é "ainda não". */
  presencaHoje: { entrada: string | null; meio: string | null; fim: string | null }

  /** Todos os dias escalados, com o que foi registrado em cada um. */
  dias: DiaDaParticipacao[]

  /**
   * Para onde dá para mover esta pessoa.
   *
   * Vem pronto do servidor, e já sem o setor atual: uma lista que oferece o
   * lugar onde a pessoa já está convida ao clique que não faz nada.
   */
  outrosSetores: SetorDoEvento[]

  /**
   * Mover é decisão de quem enxerga o evento inteiro, não de um supervisor —
   * mover gente de setor mexe na equipe de OUTRO supervisor sem ele estar
   * envolvido na decisão.
   */
  podeMover: boolean
  /** A mesma permissão que criar acesso já exige. */
  podeTornarSupervisor: boolean
}


// ─── Plataforma ─────────────────────────────────────────────────────────────
//
// O que só o dono da plataforma enxerga. Não é operação de um evento: é o
// negócio por trás dele — quem são os clientes, quem já passou por todos eles,
// e o canal que fala com todo mundo.

/** Um cliente da plataforma. Cada um com o próprio painel, equipe e limite. */
export type Organizacao = {
  organizacaoId: string
  nome: string
  documento: string | null
  /**
   * Suspensa é bloqueada, não apagada.
   *
   * O cliente que parou de pagar perde o acesso e mantém o histórico — que é
   * dele, e que ele vai querer de volta se voltar.
   */
  ativa: boolean
  adminNome: string | null
  adminIdentificador: string | null
  eventos: number
  limiteEventos: number
  valorCobrado: number | null
  periodo: 'mensal' | 'anual' | 'por_evento' | null
  criadaEm: string
}

export type ListaDeOrganizacoes = {
  itens: Organizacao[]
  total: number
  ativas: number
}

/**
 * O que "Nova organização" pede: o cliente, o admin dono dela e — se vier
 * preenchido — o primeiro evento.
 *
 * A foto de perfil e a pasta no Drive existem no sistema web e não estão
 * aqui: são passos do servidor, não do formulário, e entram junto quando este
 * método ligar na API de verdade.
 */
export type DadosDeNovaOrganizacao = {
  nome: string
  documento?: string | null
  responsavelNome?: string | null
  limiteEventos: number
  valorCobrado?: number | null
  valorCobradoPeriodo?: 'mensal' | 'anual' | 'por_evento'
  adminNome: string
  email: string
  senha: string
  /**
   * Opcional: o master pode já cadastrar o primeiro evento, ou deixar o
   * admin criar depois, dentro do limite de eventos definido acima.
   */
  primeiroEvento?: {
    nome: string
    dataInicio: string
    dataFim: string
    local?: string | null
  } | null
}

/**
 * Alguém da base de funcionários.
 *
 * A base é por CPF, e não por cadastro: a mesma pessoa credenciada em cinco
 * eventos de três clientes é UMA linha. É isso que responde "esta pessoa já
 * trabalhou com a gente?" — a pergunta que a base existe para responder.
 */
export type PessoaDaBase = {
  cpf: string
  nome: string
  telefone: string | null
  funcao: string | null
  eventos: number
  organizacoes: number
  ultimoCadastro: string
}

export type BaseDeFuncionarios = {
  /** Pessoas na base · Cadastros feitos · Organizações · Já em 2+ eventos. */
  indicadores: IndicadorDoPainel[]
  pessoas: PessoaDaBase[]
  /** Quantas existem no total, mesmo quando a busca recorta. */
  total: number
}

/**
 * Alguém da base regional.
 *
 * Serviço vendido à parte: quem consulta e monta equipe para o evento de um
 * cliente é o dono da plataforma, não o cliente. Por isso a cidade importa
 * aqui e não importa na base comum — a pergunta é "quem tem em Vitória?".
 */
export type PessoaRegional = {
  cpf: string
  nome: string
  telefone: string | null
  funcao: string | null
  cidade: string | null
  /**
   * Em quantos eventos ela de fato TRABALHOU — não em quantos se cadastrou.
   *
   * Cadastro sem presença não diz nada sobre a pessoa; presença diz. É a
   * diferença entre "está na lista" e "apareceu".
   */
  eventosTrabalhados: number
  organizacoes: number
  ultimo: string
}

export type BuscaRegional = {
  indicadores: IndicadorDoPainel[]
  pessoas: PessoaRegional[]
  /** As cidades que existem na base, para o filtro não ser um campo em branco. */
  cidades: string[]
}

/** Uma linha do histórico de trabalho: um evento em que a pessoa esteve escalada. */
export type TrabalhoDaPessoa = {
  funcionarioId: string
  eventoId: string
  evento: string
  organizacaoId: string | null
  organizacao: string
  setor: string
  setorId: string
  cargo: string
  data: string
  dataFim: string | null
  /** Bloqueada não é apagada: fica no histórico, marcada. */
  ativo: boolean
  etapas: ('entrada' | 'meio' | 'fim')[]
  /** Bateu entrada — é o que decide "compareceu" ou "chamada e não apareceu". */
  compareceu: boolean
  /** Só quem enxerga aquela organização pode abrir o evento a partir daqui. */
  podeAbrirEvento: boolean
}

export type EventoParaAtribuir = { id: string; nome: string; ativo: boolean; data: string }
export type SetorParaAtribuir = { id: string; nome: string; eventoId: string }

/**
 * A ficha completa de uma pessoa da base, identificada por CPF.
 *
 * Junta todo evento em que ela já trabalhou, em QUALQUER organização — é o
 * que responde "posso chamar essa pessoa?" antes de convidar alguém para um
 * evento novo. Por isso é só do master: um admin não pode ver o histórico
 * de outra organização.
 *
 * Não carrega valor pago: o que outra organização pagou é preço de
 * concorrente. Quem contrata precisa saber SE ela aparece, não quanto
 * custou antes.
 */
export type FichaDaPessoaNaBase = {
  cpf: string
  nome: string
  telefone: string | null
  cidade: string | null
  chavePix: string | null
  cargoMaisComum: string
  /** Autorizou aparecer na busca regional — uma vez só, não por evento. */
  autorizouBaseRegional: boolean
  autorizouEm: string | null
  /** Eventos trabalhados · Organizações · Taxa de presença · Último trabalho. */
  indicadores: IndicadorDoPainel[]
  /** Do evento mais recente para o mais antigo. */
  trabalhos: TrabalhoDaPessoa[]
  eventosParaAtribuir: EventoParaAtribuir[]
  setoresParaAtribuir: SetorParaAtribuir[]
  /** Eventos em que ela já está — não dá para atribuir de novo. */
  jaNosEventos: string[]
}

export type ResultadoDeAtribuicao = {
  evento: string
  setor: string
  /** Falso quando o setor bateu o teto: ela entra, mas bloqueada. */
  ativo: boolean
  semTelefone: boolean
}

// ─── Avisos (push) ──────────────────────────────────────────────────────────
//
// O canal muda — hoje é WhatsApp, aqui é notificação nativa —, mas as
// REGRAS são as mesmas de `lib/mensagens.ts` do sistema web: mesmos
// gatilhos, mesma condição de "ainda não registrou" reconferida na hora do
// envio, mesma ideia de não repetir aviso do mesmo tipo no mesmo dia.
//
// Uma diferença de propósito: lá o alerta de pendência vai só para UM
// supervisor por setor — limitação do WhatsApp (risco de banimento por
// volume). Push não tem esse custo, então aqui vai para todos os
// supervisores ativos do setor.

/**
 * Cada linha é um tipo de aviso que ESTE papel pode receber — nem todo papel
 * vê os mesmos. Master e admin não têm nenhum hoje: o sistema web também não
 * manda nada automático para eles, só o painel de acompanhar.
 */
export type TipoDeAviso =
  | 'dia_evento' | 'montagem' | 'desmontagem'
  | 'lembrete_entrada' | 'lembrete_meio' | 'lembrete_fim' | 'reforco'
  | 'pagamento_marcado'
  | 'realocacao' | 'alerta_pendencia'

export type Notificacao = {
  id: string
  tipo: TipoDeAviso
  titulo: string
  corpo: string
  criadaEm: string
  lida: boolean
  /** Pra onde o toque leva — a mesma tela que o push abriria no aparelho. */
  destino: string | null
}

export type PreferenciaDeAviso = {
  tipo: TipoDeAviso
  rotulo: string
  descricao: string
  ativo: boolean
}

export type CentralDeAvisos = {
  naoLidas: number
  notificacoes: Notificacao[]
  preferencias: PreferenciaDeAviso[]
}

export type TemplateDoWhatsApp = {
  nome: string
  situacao: 'aprovado' | 'em_analise' | 'rejeitado'
  categoria: 'AUTHENTICATION' | 'MARKETING' | 'UTILITY'
}

export type PainelDoWhatsApp = {
  /**
   * A fila está parada de propósito?
   *
   * Vem antes dos números na tela: número bonito com a fila pausada engana.
   */
  pausado: boolean
  canal: {
    conectada: boolean
    /** O que está acontecendo, em uma frase que a pessoa lê. */
    estado: string
    provedor: 'meta' | 'evolution'
  }
  /** Enviadas hoje · Falhas hoje · Na fila · Templates aprovados. */
  indicadores: IndicadorDoPainel[]
  /** Tudo que já saiu pelo canal, no histórico inteiro. */
  disparadas: number
  custoEstimado: number
  templates: TemplateDoWhatsApp[]
}

// ─── Veículos ───────────────────────────────────────────────────────────────
//
// Quem entra de caminhão ou van, e com qual placa — trazido do site em
// 11/09/2026. SÓ CADASTRO E CONSULTA, por decisão de lá: o veículo não bate
// ponto, não tem QR e não passa pelo scanner. A portaria consulta a placa
// aqui e confere; o condutor precisa estar credenciado no evento, porque é
// ele que responde pelo veículo.

/** Achado ao buscar o condutor por CPF — é o que preenche o resto sozinho. */
export type CondutorEncontrado = {
  participacaoId: string
  nome: string
  cpf: string
  funcao: string | null
  setorNome: string
  empresa: string | null
}

export type Veiculo = {
  id: string
  placa: string
  modelo: string
  cor: string | null
  tipo: string | null
  empresa: string | null
  observacoes: string | null
  condutorNome: string | null
  condutorCpf: string | null
  /** Dias em que o veículo pode entrar. Vazio = todos os dias do evento. */
  dias: string[]
  temFoto: boolean
}

export type VeiculosDoEvento = {
  /** Os dias de operação do evento — o que o seletor de dias oferece. */
  dias: { data: string; tipo: string }[]
  veiculos: Veiculo[]
}

export type DadosDeVeiculo = {
  cpf: string
  placa: string
  modelo: string
  tipo?: string | null
  cor?: string | null
  empresa?: string | null
  observacoes?: string | null
  /** Vazio = autorizado todos os dias — é o caso comum. */
  dias?: string[]
  fotoBase64?: string | null
}

// ─── Bloquear CPF ───────────────────────────────────────────────────────────
//
// Quem não pode se cadastrar NESTE evento — trazido do site em 11/09/2026.
// Caso real: alguém tenta entrar sem estar escalado; tirar da equipe resolve
// o vínculo de hoje, mas a pessoa se cadastra de novo pelo mesmo link cinco
// minutos depois. O bloqueio fecha essa porta.
//
// Vale para o EVENTO INTEIRO, não um setor: barrar só num setor deixaria a
// pessoa se cadastrar no setor ao lado. E vale SÓ deste evento — ela segue
// livre para trabalhar em qualquer outro da plataforma; isto é uma decisão
// operacional de um evento, não um veto permanente ao trabalho de alguém.
// Bloquear não apaga quem já está cadastrado nem o histórico de batidas.

export type CpfBloqueado = {
  id: string
  cpf: string
  motivo: string | null
  criadoEm: string
  bloqueadoPor: string | null
}

// ─── Conferência de equipe ──────────────────────────────────────────────────
//
// A tela que o supervisor usa 1 dia antes do evento: vê a equipe, tira quem
// não é dele, e confirma que aquela lista está certa. Trazido do site em
// 11/09/2026.
//
// Abre 24h antes do início e não fecha mais — confirmar tarde ainda é melhor
// que não confirmar. `packages/dominio` tem a régua da janela
// (`conferenciaAberta`, `abreEm`), a mesma que o servidor aplica.

export type MembroDaConferencia = {
  id: string
  nome: string
  cpf: string
  telefone: string | null
  cargo: string | null
}

export type ConferenciaDoSetor = {
  setorId: string
  setorNome: string
  eventoId: string
  eventoNome: string
  dataInicio: string
  aberta: boolean
  abreEm: string
  status: 'pendente' | 'confirmada'
  confirmadaEm: string | null
  confirmadaPorNome: string | null
  totalMantidos: number | null
  totalRemovidos: number | null
  equipe: MembroDaConferencia[]
}
