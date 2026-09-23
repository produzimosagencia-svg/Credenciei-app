// Um servidor de mentira que se comporta como o de verdade.
//
// ─── PARA QUE SERVE ─────────────────────────────────────────────────────────
//
// O aplicativo inteiro pode ser construído, usado e demonstrado com isto no
// lugar da API — que ainda não existe. Quando existir, troca-se a
// implementação e nenhuma tela muda.
//
// ─── O QUE ELE PRECISA IMITAR ───────────────────────────────────────────────
//
// Não basta devolver dados bonitos. Um cliente falso que sempre responde
// rápido e sempre diz sim produz um app que só funciona no escritório. Este
// aqui sabe:
//
//   - demorar, porque a rede de evento demora;
//   - falhar por transporte, que é diferente de recusar;
//   - recusar com motivo, quando a regra do domínio diz não;
//   - lembrar do que já recebeu, para a idempotência ser testável de verdade.
//
// As decisões vêm do DOMÍNIO de verdade, não de condições inventadas aqui: é
// `avaliarEntradaSaida` e `janelaMeio` que dizem sim ou não. Assim o app é
// exercitado contra a regra real desde o primeiro dia, e uma divergência entre
// falso e real não passa despercebida.

import {
  avaliarEntradaSaida, CAPACIDADES, categoriaValida, chaveDaPermissao, conferirHorariosDoEvento,
  dadosDosGraficosDeGastos, diaBRT, distanciaEntreCpfs, ehMaster,
  EVENTO_INTERNO, faseAtualDoQR, faseConfere, faseDoDia, formatarBR, formatCpf, gerarCodigoQR,
  inferirMomentoDoScanner, janelaMeio, kpisDeGastos, lerCodigoDeEvento, lerCodigoQR, liberacaoDoQR, PAPEIS_CONFIGURAVEIS,
  podeAcompanhar, podeEscanear, podeGerenciarEventos, podeGerenciarOrganizacoes, podeGerenciarUsuarios,
  podeGerenciarVeiculos, podeBloquearCpf, podeExcluir, podeExcluirDaEquipe, podeRegistrarGastos,
  TOLERANCIA_DE_CPF, abreEm, conferenciaAberta,
  validarCpf,
  type RegistroParaInferencia,
} from '@credenciei/dominio'
import type { ClienteApi } from './cliente.js'
import type {
  Acesso, ArquivoDePlanilha, AtividadeRecente, AtividadesDoEvento, AvisoPendente,
  BatidaAssistida, CandidatoLocalizado, CentralDeAvisos, ConferenciaPorCpf, ConfiguracaoDoEvento,
  ConviteDoEvento, DadosDeNovoEvento, DiaDaParticipacao, EdicaoDoEvento, EnvioDeBatida,
  EquipeDoSetor, Eu, EventoComSetores, EventoDetalhado, EventoEscaneavel,
  FichaDaPessoa, FichaLocalizada, FiltroDeAcessos, FinanceiroDaParticipacao,
  IndicadorDoPainel, LinhaPresenca,
  ListaDeAcessos, Notificacao, NovoAcesso, Painel, PainelDaEquipe,
  PessoaDoSetor, Portaria, ResultadoDaImportacao, LinkCadastroIndividual,
  BaseDeFuncionarios, BuscaRegional, DadosDeNovaOrganizacao, EventoParaAtribuir,
  FichaDaPessoaNaBase, ListaDeOrganizacoes,
  Organizacao, PainelDoWhatsApp, PessoaDaBase, PessoaRegional,
  ResultadoDeAtribuicao, SetorParaAtribuir, TrabalhoDaPessoa,
  ResultadoDaLeitura, ResultadoDosDias, RespostaDeBatida, ResumoParticipacao,
  SetorDetalhado, StatusDaEtapa, Sessao, TipoDeAviso, VisaoDeAtividade,
  CondutorEncontrado, DadosDeVeiculo, Veiculo, VeiculosDoEvento, CpfBloqueado,
  ConferenciaDoSetor, LinhaConferencia, Periodo, QuemNoRelatorio, ResumoDeRelatorios,
  DadosParaLancarPonto, BuscaDeColaboradores,
  DadosDeSuporte, DadosDeNovoSuporte, EdicaoDeSuporte, SuporteAcesso, ConfiguracaoDoMeio,
  ConfiguracoesDePermissao, ExcecaoDePermissao, LinhaDeAuditoria, MinhasPermissoes,
  EventoParaGasto, FiltroGastos, Gasto, DadosDoGasto, GastoExtraido, PainelDeGastos,
  MeuHistorico,
} from './tipos.js'
import { VISOES_DE_ATIVIDADE } from './tipos.js'
import type { FaseDoDia, Papel } from '@credenciei/dominio'
import type { TipoBatida } from './comum.js'

export type ComportamentoFalso = {
  /** Atraso artificial, em ms. Zero nos testes, 600 na demonstração. */
  atrasoMs?: number
  /** Fração de chamadas que morrem por "rede". 0 a 1. */
  falhaDeRede?: number
  /** Relógio injetável — sem ele não dá para testar horário sem esperar. */
  agora?: () => number
  /**
   * A sessão que o aparelho já tinha guardada, de uma abertura anterior.
   *
   * O falso guarda a sessão na memória; um app de verdade guarda no aparelho e
   * continua de onde parou. Sem isto, fechar e reabrir o app pediria login de
   * novo — e o app seria escrito acreditando que isso é normal.
   */
  sessaoInicial?: Sessao
  /**
   * Sobrepõe `EVENTO.checkinAutonomo` para o colaborador de demonstração.
   *
   * Só existe para o teste poder exercitar o interruptor desligado: o evento
   * de demonstração nasce com ele ligado (é o caso que aparece na tela), e
   * não há como um teste "desligar" uma constante do módulo por fora.
   */
  checkinAutonomoDoEvento?: boolean
  /**
   * Sobrepõe se o SETOR do colaborador de demonstração pede o meio — o outro
   * lado do E fica em `DIAS[].exigeMeio`, fixo por dia. Mesmo motivo do
   * `checkinAutonomoDoEvento`: o cenário nasce com um valor, e só um teste
   * precisa do outro.
   */
  meioExigidoNoMeuSetor?: boolean
}

const EVENTO = {
  id: 'ev-1',
  nome: 'Henrique e Juliano — Kleber Andrade',
  organizacao: 'Produzimos',
  local: 'Estádio Kleber Andrade, Cariacica',
  dataInicio: '2026-09-05T18:30:00-03:00',
  dataFim: '2026-09-06T08:00:00-03:00',
  janela_entrada_inicio: '2026-09-05T07:00:00-03:00',
  janela_entrada_fim: '2026-09-05T23:55:00-03:00',
  janela_fim_inicio: '2026-09-06T01:30:00-03:00',
  janela_fim_fim: '2026-09-06T08:00:00-03:00',
  codigo: 'HJK-2026-K7M2',
  // Ligado aqui para o auto-atendimento aparecer na demonstração — em
  // CONFIGURACAO_DE_MENTIRA['ev-1'] (o lado do painel) o valor é o mesmo,
  // são dois modelos separados que representam o mesmo evento.
  checkinAutonomo: true,
}

/**
 * Os dias de trabalho — montagem, o dia, e desmontagem.
 *
 * `exigeMeio` aqui é só o lado do DIA — o outro lado, o do SETOR, é
 * `ClienteFalso.meioExigido` (ver o comentário lá). A desmontagem sai
 * desligada de propósito: é o mesmo dia que `CONFIGURACAO_DE_MENTIRA['ev-1']
 * .diasSemMeio` desliga do lado do painel — os dois lados contam a mesma
 * história, um pra cada modelo de dados deste servidor de mentira.
 */
const DIAS: { data: string; tipo: 'principal' | 'preparacao'; exigeMeio: boolean }[] = [
  { data: '2026-09-03', tipo: 'preparacao', exigeMeio: true },
  { data: '2026-09-04', tipo: 'preparacao', exigeMeio: true },
  { data: '2026-09-05', tipo: 'principal', exigeMeio: true },
  { data: '2026-09-06', tipo: 'preparacao', exigeMeio: false },
]

/**
 * Os três eventos do painel.
 *
 * São os mesmos que aparecem no sistema de verdade hoje — inclusive os números.
 * Não é enfeite: com dados reconhecíveis, o Juan olha a tela e vê na hora se
 * algo está no lugar errado. Com "Evento 1 / Evento 2" ele teria que imaginar.
 */
const EVENTOS_DO_PAINEL = [
  {
    eventoId: 'ev-1',
    nome: 'Henrique e Juliano - Kleber Andrade',
    dataInicio: '2026-09-05T18:30:00-03:00',
    local: 'Kleber Andrade',
    setores: 21,
    equipe: 61,
    presentes: 0,
    aoVivo: true,
    organizacaoId: 'org-1',
  },
  {
    eventoId: 'ev-2',
    nome: 'Manos da Vila',
    dataInicio: '2026-08-29T20:00:00-03:00',
    local: 'Lagun',
    setores: 2,
    equipe: 3,
    presentes: 1,
    aoVivo: true,
    organizacaoId: 'org-1',
  },
  {
    eventoId: 'ev-3',
    nome: 'Fantastico Mundo do Lukao',
    dataInicio: '2026-08-22T19:00:00-03:00',
    local: null,
    setores: 6,
    equipe: 2,
    presentes: 0,
    aoVivo: true,
    organizacaoId: 'org-1',
  },
]

/**
 * De qual organização é a conta de admin/gerente/cliente de demonstração.
 *
 * No servidor de verdade isso viaja na sessão (`organizacao_id` do perfil).
 * Aqui não há sessão real — só um papel —, então este servidor de mentira
 * fixa a resposta em "Produzimos" (`org-1`), a mesma organização das contas
 * de demonstração (Marina, Carlos, Débora). É o suficiente para provar a
 * regra — admin não vê evento de organização que não é a dele — sem
 * inventar um sistema de sessão que a API de verdade é quem vai ter.
 */
const ORGANIZACAO_DO_ADMIN_DE_MENTIRA = 'org-1'

/**
 * As exceções de "Funções ligadas" por organização — camada 2 de
 * `capacidade()`. Nasce vazia: toda capacidade se comporta pelo padrão do
 * código até alguém mexer na tela de Configurações.
 */
const PERMISSOES_ORGANIZACAO_DE_MENTIRA: ExcecaoDePermissao[] = []

/**
 * A trilha de auditoria — cópia do `alteracoes_cadastro` do site. Nasce com
 * algumas linhas de demonstração (pra tela não abrir vazia), e ganha uma
 * nova toda vez que uma das ações auditadas é chamada — mesma régua da API
 * de verdade, ver `registrarAuditoria` nos dois lados.
 */
const AUDITORIA_DE_MENTIRA: LinhaDeAuditoria[] = [
  {
    id: 'aud-seed-1', quando: '2026-09-10T22:07:22-03:00', autorNome: 'Marina Alves',
    acao: 'ALTERACAO_SUPERVISOR', campoAlterado: 'Supervisor do setor Segurança',
    valorAnterior: null, valorNovo: 'Carlos Silva — CPF 111.222.333-44 (acesso novo)',
    motivo: null, eventoId: 'ev-1', eventoNome: 'Henrique e Juliano - Kleber Andrade',
  },
  {
    id: 'aud-seed-2', quando: '2026-09-11T09:15:00-03:00', autorNome: 'Juan Muzy',
    acao: 'ALTERACAO_PERMISSAO', campoAlterado: 'Supervisor · Escanear QR',
    valorAnterior: null, valorNovo: 'Liberado',
    motivo: null, eventoId: null, eventoNome: null,
  },
  {
    id: 'aud-seed-3', quando: '2026-09-12T14:32:00-03:00', autorNome: 'Marina Alves',
    acao: 'BLOQUEIO_CPF', campoAlterado: 'CPF bloqueado',
    valorAnterior: null, valorNovo: '999.888.777-66',
    motivo: 'Tentou se cadastrar sem estar escalado', eventoId: 'ev-1', eventoNome: 'Henrique e Juliano - Kleber Andrade',
  },
]

export type ContaDeDemonstracao = {
  nome: string
  papel: Papel
  email: string
  cpf: string
  /** Uma linha dizendo o que este papel enxerga. Aparece na tela de entrar. */
  oQueVe: string
}

/**
 * As contas de demonstração, uma por papel.
 *
 * Existem para o menu poder ser VISTO mudando: o supervisor não tem "Escanear
 * QR", o master tem o bloco "Plataforma" e o admin não. Sem três contas, essa
 * parte do sistema só seria conferida em produção.
 *
 * Os identificadores são e-mail e CPF de verdade — no formato, não na pessoa —
 * porque é assim que se entra no sistema. Uma demonstração que aceita a palavra
 * "master" no campo de CPF ensina um caminho que não existe.
 *
 * Exportadas porque a tela de entrar as mostra: em demonstração, um toque
 * preenche e entra. Ninguém deveria ter que adivinhar a senha do próprio
 * protótipo.
 */
export const CONTAS_DE_DEMONSTRACAO: ContaDeDemonstracao[] = [
  {
    nome: 'Juan Muzy',
    papel: 'master',
    email: 'juan@produzimos.com.br',
    cpf: '582.914.370-04',
    oQueVe: 'Todas as organizações e o bloco Plataforma',
  },
  {
    nome: 'Marina Alves',
    papel: 'admin',
    email: 'marina@produzimos.com.br',
    cpf: '731.208.945-62',
    oQueVe: 'Só os eventos da própria organização',
  },
  {
    nome: 'Carlos Silva',
    papel: 'supervisor',
    email: 'carlos@produzimos.com.br',
    cpf: '409.663.128-70',
    oQueVe: 'Só o próprio setor, e sem Escanear QR',
  },
]

export const SENHA_DE_DEMONSTRACAO = '123456'

/** Acha a conta por e-mail ou por CPF, com ou sem pontuação. */
function contaPor(identificador: string): ContaDeDemonstracao | undefined {
  const texto = (identificador ?? '').trim().toLowerCase()
  if (!texto) return undefined
  const digitos = texto.replace(/\D/g, '')
  return CONTAS_DE_DEMONSTRACAO.find(c =>
    c.email.toLowerCase() === texto
    || (digitos.length === 11 && c.cpf.replace(/\D/g, '') === digitos))
}

/** O pulso da operação: as últimas batidas que chegaram. */
const ATIVIDADE_DE_MENTIRA: AtividadeRecente[] = [
  { id: 'a-1', nome: 'Juan', setor: 'Produção', tipo: 'meio', em: '2026-08-30T18:04:00-03:00' },
  { id: 'a-2', nome: 'Juan', setor: 'Produção', tipo: 'entrada', em: '2026-08-30T13:47:00-03:00' },
]

/**
 * A equipe do evento, para o scanner e a busca terem em quem trabalhar.
 *
 * Seis pessoas e não uma: a busca por nome precisa poder devolver MAIS DE UM
 * resultado, que é o caso comum de verdade — "Silva" acha quatro. Um falso com
 * uma pessoa só faria a tela de escolha nunca aparecer no desenvolvimento, e
 * ela é justamente onde o operador erra de pessoa.
 */
const EQUIPE_DE_MENTIRA = [
  { id: 'f-1', nome: 'Ana Cláudia Ferreira', cpf: '03748261509', funcao: 'Auxiliar de palco', setor: 'Produção', supervisor: 'Carlos Silva', ativo: true, token: 'qr-ana' },
  { id: 'f-2', nome: 'Rodrigo Menezes Lima', cpf: '21890647355', funcao: 'Controlador de acesso', setor: 'Portaria', supervisor: 'Carlos Silva', ativo: true, token: 'qr-rodrigo' },
  { id: 'f-3', nome: 'Juan Muzy', cpf: '76431520891', funcao: 'Produtor', setor: 'Produção', supervisor: 'Carlos Silva', ativo: true, token: 'qr-juan' },
  { id: 'f-4', nome: 'Patrícia Nogueira Silva', cpf: '49012783644', funcao: 'Camareira', setor: 'Camarim', supervisor: 'Marina Alves', ativo: true, token: 'qr-patricia' },
  { id: 'f-5', nome: 'Wesley dos Santos Silva', cpf: '30561847210', funcao: 'Barman', setor: 'Bar', supervisor: 'Marina Alves', ativo: true, token: 'qr-wesley' },
  // Não ativada: o operador precisa ver esse caso antes de ele aparecer no
  // portão, com a pessoa esperando.
  { id: 'f-6', nome: 'Simone Vasconcelos', cpf: '87204953167', funcao: 'Encarregada de limpeza', setor: 'Limpeza', supervisor: 'Marina Alves', ativo: false, token: 'qr-simone' },
]

/** A ordem em que as etapas do dia acontecem. É ela que define a pendência. */
const ORDEM_DAS_ETAPAS: TipoBatida[] = ['entrada', 'meio', 'fim']

const ROTULO_DA_ETAPA: Record<TipoBatida, string> = {
  entrada: 'Entrada',
  meio: 'Meio',
  fim: 'Saída',
}

/**
 * Quem tem acesso ao sistema.
 *
 * Não é a equipe do evento: quem só trabalha no dia está em `EQUIPE_DE_MENTIRA`
 * e não entra em lugar nenhum. Aqui é quem faz login — e são poucos, sempre.
 *
 * Um deles está inativo de propósito: é o caso de quem saiu da equipe e cujo
 * histórico precisa continuar existindo. Sem ele na lista, a aba "Inativos"
 * nunca seria vista durante o desenvolvimento.
 */
const ACESSOS_DE_MENTIRA: {
  id: string
  nome: string
  identificador: string
  papel: Papel
  ativo: boolean
  setorNome: string | null
  telefone: string | null
  eventos: number
  criadoEm: string
  expiraEm: string | null
  /** O override da aba "Funções ligadas" — ver `Acesso.permissoesUsuario`. */
  permissoesUsuario: Record<string, boolean>
}[] = [
  { id: 'u-1', nome: 'Juan Muzy', identificador: 'juan@produzimos.com.br', papel: 'master', ativo: true, setorNome: null, telefone: null, eventos: 3, criadoEm: '2025-11-04T10:00:00-03:00', expiraEm: null, permissoesUsuario: {} },
  { id: 'u-2', nome: 'Marina Alves', identificador: 'marina@produzimos.com.br', papel: 'admin', ativo: true, setorNome: null, telefone: null, eventos: 3, criadoEm: '2026-02-17T09:30:00-03:00', expiraEm: null, permissoesUsuario: {} },
  { id: 'u-3', nome: 'Carlos Silva', identificador: 'carlos@produzimos.com.br', papel: 'supervisor', ativo: true, setorNome: 'Produção', telefone: '27999990001', eventos: 1, criadoEm: '2026-06-02T14:12:00-03:00', expiraEm: null, permissoesUsuario: {} },
  { id: 'u-4', nome: 'Débora Antunes', identificador: 'debora@produzimos.com.br', papel: 'supervisor', ativo: true, setorNome: 'Camarim', telefone: '27999990002', eventos: 1, criadoEm: '2026-07-21T11:45:00-03:00', expiraEm: null, permissoesUsuario: {} },
  { id: 'u-5', nome: 'Fábio Queiroz', identificador: 'fabio@produzimos.com.br', papel: 'supervisor', ativo: false, setorNome: 'Portaria', telefone: '27999990003', eventos: 2, criadoEm: '2025-12-09T16:20:00-03:00', expiraEm: null, permissoesUsuario: {} },
  {
    id: 'u-6', nome: 'Rogério Batista', identificador: 'rogerio@produzimos.com.br', papel: 'operador_portao',
    ativo: true, setorNome: null, telefone: '27999990004', eventos: 1, criadoEm: '2026-08-10T09:00:00-03:00', expiraEm: null, permissoesUsuario: {},
  },
  // Com expiração de propósito: é o caso que a tela precisa saber mostrar.
  {
    id: 'u-7', nome: 'Renata Souza', identificador: 'renata@produzimos.com.br', papel: 'suporte',
    ativo: true, setorNome: null, telefone: '27999990005', eventos: 1, criadoEm: '2026-09-01T10:00:00-03:00', expiraEm: '2026-09-30', permissoesUsuario: {},
  },
]

/**
 * Os setores de cada evento. Todo supervisor nasce preso a um deles.
 *
 * Os números são desiguais de propósito: um setor cheio, um pela metade e um
 * vazio. Com todos iguais, o estado vazio nunca apareceria durante o
 * desenvolvimento.
 */
const SETORES_DE_MENTIRA: Record<string, {
  setorId: string
  nome: string
  pessoas: number
  valorPorPessoa: number | null
  token: string
  supervisores: {
    id: string; nome: string; ativo: boolean; telefone: string | null
    permissoesUsuario?: Record<string, boolean>
  }[]
  /**
   * Pede a confirmação do meio? Nasce desligado — ver `ConfiguracaoDoMeio` e
   * `lib/meio.ts` no site: só faz sentido em equipe paga por pessoa.
   */
  exigeMeio: boolean
  /** Falso = setor não aceita cadastro novo. Nasce ligado, como no site. */
  linkAtivo: boolean
}[]> = {
  'ev-1': [
    { setorId: 's-1', nome: 'Produção', pessoas: 18, valorPorPessoa: 150, token: 'f-prod-1', supervisores: [{ id: 'u-3', nome: 'Carlos Silva', ativo: true, telefone: '27999990001' }], exigeMeio: true, linkAtivo: true },
    { setorId: 's-2', nome: 'Portaria', pessoas: 12, valorPorPessoa: 140, token: 'f-port-1', supervisores: [], exigeMeio: false, linkAtivo: true },
    { setorId: 's-3', nome: 'Bar', pessoas: 7, valorPorPessoa: 160, token: 'f-bar-1', supervisores: [], exigeMeio: true, linkAtivo: true },
    { setorId: 's-4', nome: 'Camarim', pessoas: 4, valorPorPessoa: 180, token: 'f-cam-1', supervisores: [{ id: 'u-4', nome: 'Débora Antunes', ativo: true, telefone: '27999990002' }], exigeMeio: false, linkAtivo: true },
    { setorId: 's-5', nome: 'Limpeza', pessoas: 0, valorPorPessoa: null, token: 'f-limp-1', supervisores: [], exigeMeio: false, linkAtivo: true },
  ],
  'ev-2': [
    { setorId: 's-6', nome: 'Produção', pessoas: 2, valorPorPessoa: 150, token: 'f-prod-2', supervisores: [{ id: 'u-3', nome: 'Carlos Silva', ativo: true, telefone: '27999990001' }], exigeMeio: false, linkAtivo: true },
    { setorId: 's-7', nome: 'Portaria', pessoas: 1, valorPorPessoa: 140, token: 'f-port-2', supervisores: [], exigeMeio: false, linkAtivo: true },
  ],
  'ev-3': [
    { setorId: 's-8', nome: 'Produção', pessoas: 2, valorPorPessoa: 150, token: 'f-prod-3', supervisores: [], exigeMeio: false, linkAtivo: true },
  ],
}

/**
 * Os registros do dia 30/08, para as sete visões terem o que mostrar.
 *
 * `manual: true` é registro assistido — outra pessoa bateu pelo colaborador.
 * Sem um caso desses a coluna "manual" da tabela nunca seria exercitada.
 */
const REGISTROS_DE_MENTIRA: {
  id: string; nome: string; cpf: string; setor: string
  etapa: TipoBatida; em: string; manual: boolean
}[] = [
  { id: 'r-1', nome: 'Juan Muzy', cpf: '76431520891', setor: 'Produção', etapa: 'meio', em: '2026-08-30T18:04:00-03:00', manual: false },
  { id: 'r-2', nome: 'Ana Cláudia Ferreira', cpf: '03748261509', setor: 'Produção', etapa: 'entrada', em: '2026-08-30T14:12:00-03:00', manual: false },
  {
    id: 'r-3', nome: 'Rodrigo Menezes Lima', cpf: '21890647355', setor: 'Portaria',
    etapa: 'entrada', em: '2026-08-30T13:58:00-03:00', manual: true,
  },
  { id: 'r-4', nome: 'Juan Muzy', cpf: '76431520891', setor: 'Produção', etapa: 'entrada', em: '2026-08-30T13:47:00-03:00', manual: false },
  { id: 'r-5', nome: 'Patrícia Nogueira Silva', cpf: '49012783644', setor: 'Camarim', etapa: 'fim', em: '2026-08-29T23:40:00-03:00', manual: false },
  // A entrada dela, do dia anterior: sem ela, o dia 29 teria uma saída sem
  // entrada — a incoerência que a visão "Presentes" existe pra revelar, não
  // pra produzir sozinha.
  { id: 'r-6', nome: 'Patrícia Nogueira Silva', cpf: '49012783644', setor: 'Camarim', etapa: 'entrada', em: '2026-08-29T15:10:00-03:00', manual: false },
]

/** Os dias de operação de cada evento — o que o seletor de dia mostra. */
const DIAS_DE_ATIVIDADE_DE_MENTIRA: Record<string, string[]> = {
  'ev-1': ['2026-08-29', '2026-08-30'],
  'ev-2': ['2026-08-29'],
  'ev-3': ['2026-08-22'],
}

/**
 * O estado da portaria de cada evento, e o quanto ela já rendeu.
 *
 * Fica fora de `EVENTOS_DO_PAINEL` porque MUDA: a tela liga, desliga e troca o
 * endereço. Guardar junto do resto faria a constante virar estado mutável sem
 * ninguém perceber.
 */
const PORTARIA_DE_MENTIRA: Record<string, { aberta: boolean; token: string | null; cadastrados: number }> = {
  'ev-1': { aberta: true, token: '33f53f644bc44d9d4d86d28a197dd141', cadastrados: 0 },
  'ev-2': { aberta: false, token: null, cadastrados: 0 },
  'ev-3': { aberta: false, token: '9b1c74e2a05f4e0b8d3a6f21c7e40a55', cadastrados: 4 },
}

/**
 * O interruptor de "Cadastro por link" do evento inteiro — separado da
 * portaria e dos setores de propósito, mesmo raciocínio do comentário
 * acima: mexe em coisas que sobrevivem à sessão de quem testa.
 */
const CADASTRO_SUSPENSO_DE_MENTIRA = new Set<string>()

/** Onde o cartaz da portaria aponta. É o endereço que vai impresso. */
const ENDERECO_DA_PORTARIA = 'https://credenciei.vercel.app/portaria'

/** Onde a equipe se cadastra sozinha, um por setor. */
const ENDERECO_DO_FORMULARIO = 'https://credenciei.vercel.app/form'

/**
 * Os veículos autorizados de cada evento.
 *
 * Um com dia restrito e um livre em todos os dias — pra tela mostrar as duas
 * situações ("dias autorizados" vs. "Todos") sem precisar cadastrar nada.
 */
const VEICULOS_DE_MENTIRA: Record<string, Veiculo[]> = {
  'ev-1': [
    {
      id: 'vec-1', placa: 'RFM3G11', modelo: 'Mercedes Sprinter', cor: 'Branco', tipo: 'Van',
      empresa: 'Produzimos', observacoes: null,
      condutorNome: 'Ana Cláudia Ferreira', condutorCpf: '03748261509',
      dias: [], temFoto: false,
    },
    {
      id: 'vec-2', placa: 'ABC1D23', modelo: 'Volkswagen Delivery', cor: 'Azul', tipo: 'Caminhão',
      empresa: 'Estrutura Palco Ltda', observacoes: 'Carga pesada — entra só pela doca',
      condutorNome: 'Rodrigo Menezes Lima', condutorCpf: '21890647355',
      dias: ['2026-09-03', '2026-09-04'], temFoto: true,
    },
  ],
  'ev-2': [],
  'ev-3': [],
}

/**
 * Os CPFs bloqueados de cada evento — quem não pode se cadastrar nele.
 *
 * Um já bloqueado em ev-1, pra tela nascer com a lista não-vazia (o motivo
 * fica registrado, quem bloqueou também).
 */
const BLOQUEIOS_DE_MENTIRA: Record<string, CpfBloqueado[]> = {
  'ev-1': [
    {
      id: 'bloq-1', cpf: '11144477735', motivo: 'Tentou entrar sem estar escalado',
      criadoEm: '2026-09-04T22:10:00-03:00', bloqueadoPor: 'Marina Alves',
    },
  ],
  'ev-2': [],
  'ev-3': [],
}

/**
 * Os acessos de Suporte de Sistema — gente contratada pro dia do evento.
 *
 * Um com data de expiração, outro sem — a tela precisa saber mostrar as
 * duas situações. O escopo é próprio (organização inteira e/ou eventos
 * avulsos), separado de `ACESSOS_DE_MENTIRA`: aquele é só "quem loga e com
 * que papel", este é "onde essa pessoa pode atuar".
 */
const SUPORTES_DE_MENTIRA: {
  id: string
  nome: string
  cpf: string
  telefone: string | null
  ativo: boolean
  /** 'AAAA-MM-DD', ou null. */
  acessoExpiraEm: string | null
  criadoEm: string
  escopoOrganizacaoIds: string[]
  escopoEventoIds: string[]
}[] = [
  {
    id: 'sup-1', nome: 'Bruno Tavares', cpf: '55566677788', telefone: '27998887766',
    ativo: true, acessoExpiraEm: '2026-09-30', criadoEm: '2026-09-01T10:00:00-03:00',
    escopoOrganizacaoIds: ['org-1'], escopoEventoIds: [],
  },
  {
    id: 'sup-2', nome: 'Fernanda Lacerda', cpf: '99988877766', telefone: '27997776655',
    ativo: true, acessoExpiraEm: null, criadoEm: '2026-08-20T14:30:00-03:00',
    escopoOrganizacaoIds: [], escopoEventoIds: ['ev-2'],
  },
]

/**
 * Os eventos que o produtor de mentira pode lançar gasto — cópia de
 * `produtor_eventos`. Só ev-1 e ev-2: ev-3 prova que "Interno" continua
 * disponível mesmo quando o produtor não tem NENHUM evento vinculado a ele,
 * e que ev-3 fica de fora da lista dele.
 */
const EVENTOS_DO_PRODUTOR_DE_MENTIRA = ['ev-1', 'ev-2']

/** Os lançamentos de Gastos de mentira — mutável, mesmo padrão de `SUPORTES_DE_MENTIRA`. */
const GASTOS_DE_MENTIRA: Gasto[] = [
  {
    id: 'gasto-1', eventoId: 'ev-1', eventoNome: 'Henrique e Juliano - Kleber Andrade',
    descricao: 'Aluguel de estrutura de palco', valor: 8500, fornecedor: 'Estrutura ES',
    formaPagamento: 'Pix', pagador: null, pago: true, categoria: 'Estrutura',
    dataGasto: '2026-09-03', registradoEm: '2026-09-03T14:00:00-03:00', origem: 'manual',
    status: 'confirmado', observacao: null, transcricao: null, temComprovante: true,
    comprovanteNome: 'nota-estrutura.pdf', criadoPorNome: 'Marina Alves',
  },
  {
    id: 'gasto-2', eventoId: 'ev-1', eventoNome: 'Henrique e Juliano - Kleber Andrade',
    descricao: 'Almoço da equipe no dia da montagem', valor: 420, fornecedor: 'Restaurante Sabor',
    formaPagamento: 'Cartão de débito', pagador: 'Marina Alves', pago: true, categoria: 'Alimentação',
    dataGasto: '2026-09-04', registradoEm: '2026-09-04T12:30:00-03:00', origem: 'audio',
    status: 'confirmado', observacao: null, transcricao: 'gastei 420 reais no almoço da equipe hoje',
    temComprovante: false, comprovanteNome: null, criadoPorNome: 'Marina Alves',
  },
  {
    id: 'gasto-3', eventoId: 'ev-2', eventoNome: 'Manos da Vila',
    descricao: 'Combustível da van de equipamento', valor: 250, fornecedor: 'Posto Vila',
    formaPagamento: 'Dinheiro', pagador: null, pago: false, categoria: 'Transporte',
    dataGasto: '2026-08-28', registradoEm: '2026-08-28T09:00:00-03:00', origem: 'manual',
    status: 'confirmado', observacao: 'Nota fica com o motorista', transcricao: null,
    temComprovante: false, comprovanteNome: null, criadoPorNome: 'Marina Alves',
  },
  {
    id: 'gasto-4', eventoId: EVENTO_INTERNO, eventoNome: 'Interno — despesas da empresa',
    descricao: 'Assinatura de ferramenta de design', valor: 89.9, fornecedor: 'Figma',
    formaPagamento: 'Cartão de crédito', pagador: null, pago: true, categoria: 'Comunicação',
    dataGasto: '2026-09-01', registradoEm: '2026-09-01T08:00:00-03:00', origem: 'manual',
    status: 'confirmado', observacao: null, transcricao: null, temComprovante: false,
    comprovanteNome: null, criadoPorNome: 'Marina Alves',
  },
]

/**
 * O poço de nomes da equipe de mentira.
 *
 * Nomes brasileiros comuns, e vários com sobrenome repetido de propósito — é
 * assim que a busca por "Silva" devolve seis pessoas, que é o caso real. Uma
 * lista de nomes todos diferentes faria a tela de escolha nunca aparecer.
 */
const NOMES_DA_EQUIPE = [
  'Alice Araujo Mendonça', 'Alice Paiva Marchesi', 'Aline Raquel Reis de Oliveira',
  'Ana Luiza Caiado Richa', 'Ana Tereza Martins Fialho', 'Anderson Luiz Costa',
  'André Luiz Zambom', 'Andressa Silva Sousa', 'Bruno Cardoso Silva',
  'Camila Ferreira Nunes', 'Carlos Eduardo Prado', 'Daniela Rocha Silva',
  'Diego Martins de Araujo', 'Eduardo Bittencourt', 'Fernanda Alves Pires',
  'Gabriel Santos Silva', 'Helena Moraes Duarte', 'Igor Nascimento Lima',
  'Juliana Campos Freire', 'Leandro Oliveira Silva', 'Mariana Teixeira Gomes',
  'Nathalia Barros Peixoto', 'Otávio Ramos Vieira', 'Patrícia Lopes Machado',
  'Rafael Andrade Silva', 'Stelvian Cardoso Gatti', 'Tatiane Moreira Braga',
  'Vinícius Prado Coelho',
]

const EMPRESAS_DE_MENTIRA = ['Time Kiki', 'Credenciamento', 'Eletricista', null]

/**
 * Uma etapa registrada, com foto (só quando `comFoto`) e localização —
 * achado comparando com a ficha da pessoa do site (21/09/2026). Coordenada
 * fixa do Kleber Andrade, o estádio do evento de mentira.
 */
function presencaDeMentira(
  registradoEm: string | null, comFoto = false,
): { registradoEm: string; fotoUrl: string | null; lat: number; lng: number } | null {
  if (!registradoEm) return null
  return {
    registradoEm,
    fotoUrl: comFoto ? 'https://storage.falso.local/presencas/demo-meio.jpg' : null,
    lat: -20.3222,
    lng: -40.3381,
  }
}

/**
 * A equipe de cada setor, montada a partir do poço.
 *
 * Determinística: o mesmo setor gera sempre as mesmas pessoas, com os mesmos
 * CPFs e telefones. Sem isso, cada recarga da tela trocaria a equipe inteira e
 * nada do que se visse duas vezes seria comparável.
 */
function equipeDoSetorDeMentira(setorId: string, quantas: number): PessoaDoSetor[] {
  // Uma semente estável tirada do id do setor: setores diferentes começam em
  // pontos diferentes do poço, e o mesmo setor sempre no mesmo ponto.
  let semente = 0
  for (const c of setorId) semente = (semente * 31 + c.charCodeAt(0)) % 997

  return Array.from({ length: quantas }, (_, i) => {
    const n = (semente + i * 7) % NOMES_DA_EQUIPE.length
    const nome = NOMES_DA_EQUIPE[n]!
    const digitos = String((semente * 1000 + i * 137) % 100000000000).padStart(11, '0')
    const empresa = EMPRESAS_DE_MENTIRA[(semente + i) % EMPRESAS_DE_MENTIRA.length] ?? null

    // Uma em cada nove ainda não foi ativada: é o caso que a tela precisa saber
    // mostrar, e que some se todo mundo estiver ativo.
    const ativo = (semente + i) % 9 !== 0

    return {
      participacaoId: `${setorId}-p${i}`,
      nome,
      cpf: digitos,
      telefone: `27${String(900000000 + ((semente * 31 + i * 517) % 99999999))}`,
      empresa,
      funcao: empresa === 'Eletricista' ? 'Eletricista' : null,
      fotoUrl: null,
      ativo,
      valorReceber: 0,
      pago: false,
      entrada: null,
      meio: null,
      fim: null,
      statusEntrada: 'aberto' as StatusDaEtapa,
      statusMeio: 'aberto' as StatusDaEtapa,
      statusFim: 'aberto' as StatusDaEtapa,
      // O padrão de mentira nasce sem contestação — `equipeDoSetor` sobrepõe
      // com o estado de verdade da sessão (`this.contestacoes`), do mesmo
      // jeito que já faz com telefone/pagamento/valor.
      temContestacaoAberta: false,
    }
  })
}

/** O modelo de importação e as exportações apontam para o sistema web. */
const ENDERECO_DE_ARQUIVOS = 'https://credenciei.vercel.app'

/**
 * A configuração de cada evento, que a tela de edição grava.
 *
 * Fica fora de `EVENTOS_DO_PAINEL` pelo mesmo motivo da portaria: isto MUDA. O
 * ev-1 nasce com a batida livre ligada, que é o caso do Henrique e Juliano.
 */
const CONFIGURACAO_DE_MENTIRA: Record<string, {
  descricao: string | null
  batidaLivre: boolean
  checkinAutonomo: boolean
  janelaEntradaInicio: string | null
  janelaEntradaFim: string | null
  janelaFimInicio: string | null
  janelaFimFim: string | null
  /** Os dias de preparação marcados, sem o dia do evento. */
  preparacao: string[]
  /** Os que já têm batida e por isso não podem ser desmarcados. */
  comBatidas: string[]
  /**
   * Os dias em que o meio está DESLIGADO. Nasce vazio: todo dia pede o meio,
   * que é o padrão de `jornada_dias.exige_meio` no site (nasce ligado) — só o
   * SETOR nasce desligado.
   */
  diasSemMeio: string[]
}> = {
  'ev-1': {
    descricao: null,
    batidaLivre: true,
    checkinAutonomo: true,
    janelaEntradaInicio: '2026-09-05T07:00:00-03:00',
    janelaEntradaFim: '2026-09-05T23:55:00-03:00',
    janelaFimInicio: '2026-09-06T01:30:00-03:00',
    janelaFimFim: '2026-09-06T08:00:00-03:00',
    preparacao: [
      '2026-08-28', '2026-08-31', '2026-09-01', '2026-09-02', '2026-09-03',
      '2026-09-04', '2026-09-06', '2026-09-07', '2026-09-08', '2026-09-09',
    ],
    // Um dia que já tem batida: é o que a grade mostra com cadeado, e o que o
    // servidor preserva mesmo se vier desmarcado. Sem ele no cenário, esse
    // caminho nunca seria exercitado.
    comBatidas: ['2026-08-31'],
    // A desmontagem sem meio: é o caso que prova que o desligamento é por
    // DIA, e não só por setor.
    diasSemMeio: ['2026-09-06'],
  },
  'ev-2': {
    descricao: null,
    batidaLivre: false,
    checkinAutonomo: false,
    janelaEntradaInicio: '2026-08-29T16:00:00-03:00',
    janelaEntradaFim: '2026-08-29T22:00:00-03:00',
    janelaFimInicio: '2026-08-30T01:00:00-03:00',
    janelaFimFim: '2026-08-30T06:00:00-03:00',
    preparacao: ['2026-08-28'],
    comBatidas: [],
    diasSemMeio: [],
  },
  'ev-3': {
    descricao: null,
    batidaLivre: false,
    checkinAutonomo: false,
    janelaEntradaInicio: null,
    janelaEntradaFim: null,
    janelaFimInicio: null,
    janelaFimFim: null,
    preparacao: [],
    comBatidas: [],
    diasSemMeio: [],
  },
}

/**
 * Os clientes da plataforma.
 *
 * Um suspenso de propósito: é o caso que a tela precisa saber mostrar, e que
 * some se todos estiverem ativos. E um no limite de eventos, que é a conversa
 * de renovação — o número que interessa ao dono da plataforma.
 */
const ORGANIZACOES_DE_MENTIRA: Organizacao[] = [
  {
    organizacaoId: 'org-1', nome: 'Produzimos', documento: '18.472.905/0001-33',
    ativa: true, adminNome: 'Marina Alves', adminIdentificador: 'marina@produzimos.com.br',
    eventos: 3, limiteEventos: 10, valorCobrado: 1200, periodo: 'mensal',
    criadaEm: '2025-11-04T10:00:00-03:00',
  },
  {
    organizacaoId: 'org-2', nome: 'Vibe Produções', documento: '30.918.244/0001-07',
    ativa: true, adminNome: 'Renato Bianchi', adminIdentificador: 'renato@vibeproducoes.com.br',
    eventos: 8, limiteEventos: 8, valorCobrado: 890, periodo: 'mensal',
    criadaEm: '2026-01-22T14:30:00-03:00',
  },
  {
    organizacaoId: 'org-3', nome: 'Casa Rosada Eventos', documento: null,
    ativa: false, adminNome: 'Letícia Prado', adminIdentificador: 'leticia@casarosada.com.br',
    eventos: 2, limiteEventos: 5, valorCobrado: 600, periodo: 'por_evento',
    criadaEm: '2025-08-15T09:10:00-03:00',
  },
]

/**
 * A base de funcionários — por CPF, não por cadastro.
 *
 * A mesma pessoa credenciada em cinco eventos de três clientes é UMA linha. É
 * isso que responde "esta pessoa já trabalhou com a gente?", que é a pergunta
 * que a base existe para responder.
 */
const BASE_DE_MENTIRA: (PessoaDaBase & { cidade: string | null; trabalhou: number })[] = [
  { cpf: '03748261509', nome: 'Ana Cláudia Ferreira', telefone: '27999255959', funcao: 'Auxiliar de palco', eventos: 7, organizacoes: 3, ultimoCadastro: '2026-08-30T10:00:00-03:00', cidade: 'Vitória', trabalhou: 6 },
  { cpf: '21890647355', nome: 'Rodrigo Menezes Lima', telefone: '27988774411', funcao: 'Controlador de acesso', eventos: 4, organizacoes: 2, ultimoCadastro: '2026-08-29T18:20:00-03:00', cidade: 'Vila Velha', trabalhou: 4 },
  { cpf: '76431520891', nome: 'Juan Muzy', telefone: '27999255959', funcao: 'Produtor', eventos: 12, organizacoes: 1, ultimoCadastro: '2026-08-30T13:47:00-03:00', cidade: 'Vitória', trabalhou: 12 },
  { cpf: '49012783644', nome: 'Patrícia Nogueira Silva', telefone: '27997733221', funcao: 'Camareira', eventos: 3, organizacoes: 2, ultimoCadastro: '2026-08-22T08:00:00-03:00', cidade: 'Serra', trabalhou: 2 },
  { cpf: '30561847210', nome: 'Wesley dos Santos Silva', telefone: null, funcao: 'Barman', eventos: 2, organizacoes: 1, ultimoCadastro: '2026-07-19T22:00:00-03:00', cidade: 'Cariacica', trabalhou: 1 },
  { cpf: '87204953167', nome: 'Simone Vasconcelos', telefone: '27996655443', funcao: 'Encarregada de limpeza', eventos: 1, organizacoes: 1, ultimoCadastro: '2026-08-30T09:00:00-03:00', cidade: 'Vitória', trabalhou: 0 },
  { cpf: '65498732100', nome: 'Larissa Prado Coelho', telefone: '27994433221', funcao: 'Recepcionista', eventos: 5, organizacoes: 2, ultimoCadastro: '2026-06-11T16:00:00-03:00', cidade: 'Vila Velha', trabalhou: 5 },
]

/**
 * O histórico de trabalho de quem está na base — por CPF, os eventos em que
 * já esteve escalada, em QUALQUER organização.
 *
 * Só duas pessoas ganham histórico escrito à mão: uma com etapas completas
 * num evento e incompleta noutro — para a tela precisar mostrar as duas
 * bandeiras —, outra com uma linha `ativo: false`, porque o setor bateu o
 * teto. O resto da base ganha uma linha sintética em
 * `trabalhoSinteticoDaBase()`: o bastante para a ficha nunca aparecer vazia,
 * sem inventar uma história rica para quem a tela não está testando.
 */
const TRABALHOS_DA_BASE: Record<string, TrabalhoDaPessoa[]> = {
  '03748261509': [ // Ana Cláudia Ferreira
    {
      funcionarioId: 'f-ana-1', eventoId: 'ev-1', evento: 'Henrique e Juliano - Kleber Andrade',
      organizacaoId: 'org-1', organizacao: 'Produzimos', setor: 'Bar', setorId: 's-3',
      cargo: 'Auxiliar de palco', data: '2026-09-05T18:30:00-03:00', dataFim: '2026-09-05T18:30:00-03:00',
      ativo: true, etapas: ['entrada', 'meio', 'fim'], compareceu: true, podeAbrirEvento: true,
    },
    {
      funcionarioId: 'f-ana-2', eventoId: 'ev-3', evento: 'Fantastico Mundo do Lukao',
      organizacaoId: 'org-2', organizacao: 'Vibe Produções', setor: 'Produção', setorId: 's-8',
      cargo: 'Auxiliar de palco', data: '2026-08-22T19:00:00-03:00', dataFim: '2026-08-22T19:00:00-03:00',
      ativo: true, etapas: ['entrada'], compareceu: true, podeAbrirEvento: false,
    },
  ],
  '76431520891': [ // Juan Muzy
    {
      funcionarioId: 'f-juan-1', eventoId: 'ev-1', evento: 'Henrique e Juliano - Kleber Andrade',
      organizacaoId: 'org-1', organizacao: 'Produzimos', setor: 'Produção', setorId: 's-1',
      cargo: 'Produtor', data: '2026-09-05T18:30:00-03:00', dataFim: '2026-09-05T18:30:00-03:00',
      ativo: true, etapas: ['entrada', 'meio', 'fim'], compareceu: true, podeAbrirEvento: true,
    },
    {
      // O setor bateu o teto quando ela entrou: fica no histórico, bloqueada.
      funcionarioId: 'f-juan-2', eventoId: 'ev-2', evento: 'Manos da Vila',
      organizacaoId: 'org-1', organizacao: 'Produzimos', setor: 'Produção', setorId: 's-6',
      cargo: 'Produtor', data: '2026-08-29T20:00:00-03:00', dataFim: '2026-08-29T20:00:00-03:00',
      ativo: false, etapas: [], compareceu: false, podeAbrirEvento: true,
    },
  ],
}

/**
 * Para quem não tem histórico escrito à mão: gera linhas plausíveis a partir
 * dos números agregados que a base já tem — determinístico, sem `Math.random`,
 * para o mesmo CPF sempre voltar com o mesmo histórico.
 */
function trabalhoSinteticoDaBase(
  p: PessoaDaBase & { cidade: string | null; trabalhou: number },
): TrabalhoDaPessoa[] {
  const total = Math.max(p.eventos, p.trabalhou)
  const linhas: TrabalhoDaPessoa[] = []
  for (let i = 0; i < total; i++) {
    const evento = EVENTOS_DO_PAINEL[i % EVENTOS_DO_PAINEL.length]!
    const setores = SETORES_DE_MENTIRA[evento.eventoId] ?? []
    const setor = setores[i % Math.max(setores.length, 1)] ?? null
    const org = ORGANIZACOES_DE_MENTIRA[i % ORGANIZACOES_DE_MENTIRA.length]!
    const compareceu = i < p.trabalhou
    linhas.push({
      funcionarioId: `f-sint-${p.cpf}-${i}`,
      eventoId: evento.eventoId,
      evento: evento.nome,
      organizacaoId: org.organizacaoId,
      organizacao: org.nome,
      setor: setor?.nome ?? 'Equipe',
      setorId: setor?.setorId ?? evento.eventoId,
      cargo: p.funcao ?? '',
      data: evento.dataInicio,
      dataFim: evento.dataInicio,
      ativo: true,
      etapas: compareceu ? ['entrada'] : [],
      compareceu,
      podeAbrirEvento: true,
    })
  }
  return linhas
}

/** Os templates aprovados pela Meta, do jeito que a leitura devolve. */
const TEMPLATES_DE_MENTIRA: PainelDoWhatsApp['templates'] = [
  { nome: 'codigo_de_acesso', situacao: 'aprovado', categoria: 'AUTHENTICATION' },
  { nome: 'boas_vindas_evento', situacao: 'aprovado', categoria: 'UTILITY' },
  { nome: 'aviso_do_dia', situacao: 'aprovado', categoria: 'UTILITY' },
  { nome: 'lembrete_do_meio', situacao: 'aprovado', categoria: 'UTILITY' },
  { nome: 'convite_supervisor', situacao: 'em_analise', categoria: 'UTILITY' },
  { nome: 'promocao_evento', situacao: 'rejeitado', categoria: 'MARKETING' },
]

/**
 * Os avisos — mesmas regras de `lib/mensagens.ts` do sistema web, canal
 * trocado de WhatsApp para push nativo. Rótulo e descrição usados tanto na
 * lista de preferências quanto, futuramente, na tela de configurar avisos.
 *
 * Master e admin não têm nenhum tipo aqui de propósito: o sistema web também
 * não manda nada automático pra eles, só o painel de acompanhar.
 */
const ROTULO_DO_AVISO: Record<TipoDeAviso, { rotulo: string; descricao: string }> = {
  dia_evento: { rotulo: 'Dia do evento', descricao: 'Aviso na manhã do dia, com os horários de entrada e saída' },
  montagem: { rotulo: 'Dias de montagem', descricao: 'Aviso às 7h de cada dia de preparação antes do evento' },
  desmontagem: { rotulo: 'Dias de desmontagem', descricao: 'Aviso às 7h de cada dia depois do evento' },
  lembrete_entrada: { rotulo: 'Hora da entrada', descricao: 'Quando a janela de entrada abrir' },
  lembrete_meio: { rotulo: 'Hora da selfie', descricao: '4 horas depois da sua entrada' },
  lembrete_fim: { rotulo: 'Hora da saída', descricao: 'Quando a janela de saída abrir' },
  reforco: { rotulo: 'Reforço de prazo', descricao: 'Perto do fim do prazo, só se você ainda não registrou' },
  pagamento_marcado: { rotulo: 'Pagamento marcado', descricao: 'Quando seu pagamento for confirmado pelo organizador' },
  realocacao: { rotulo: 'Nova escala', descricao: 'Quando você for movido para outro setor' },
  alerta_pendencia: { rotulo: 'Pendência da equipe', descricao: 'Quando alguém do seu setor passar do prazo de uma etapa' },
}

const TIPOS_DO_COLABORADOR: TipoDeAviso[] = [
  'dia_evento', 'montagem', 'desmontagem', 'lembrete_entrada', 'lembrete_meio',
  'lembrete_fim', 'reforco', 'pagamento_marcado',
]
const TIPOS_DO_SUPERVISOR: TipoDeAviso[] = ['realocacao', 'alerta_pendencia']

/** Um histórico plausível por papel — pensado pra tela nunca ficar vazia. */
const NOTIFICACOES_DO_COLABORADOR: Notificacao[] = [
  {
    id: 'not-1', tipo: 'lembrete_meio',
    titulo: '🔔 Hora da sua selfie', corpo: 'Confirme que você continua no posto.',
    criadaEm: '2026-08-30T18:00:00-03:00', lida: false, destino: '/ponto',
  },
  {
    id: 'not-2', tipo: 'dia_evento',
    titulo: '🎉 Hoje é o grande dia!',
    corpo: 'Henrique e Juliano - Kleber Andrade — entrada 18:30 · saída 08:00. Toque para ver sua credencial.',
    criadaEm: '2026-08-30T09:00:00-03:00', lida: true, destino: '/credencial',
  },
  {
    id: 'not-3', tipo: 'pagamento_marcado',
    titulo: 'Pagamento marcado', corpo: 'Seu pagamento de R$ 150 foi confirmado pelo organizador.',
    criadaEm: '2026-08-29T16:00:00-03:00', lida: true, destino: '/meu-pagamento',
  },
  {
    id: 'not-4', tipo: 'reforco',
    titulo: '⚠️ Ainda não registrado!', corpo: 'Corre lá, o prazo da saída está terminando.',
    criadaEm: '2026-08-22T07:58:00-03:00', lida: true, destino: '/ponto',
  },
]
/**
 * Quais tipos de aviso estão desligados. Vazio no começo — sem preferência
 * salva, tudo fica ligado, do mesmo jeito que `/admin/whatsapp/fluxos` faz
 * no sistema web.
 */
const PREFERENCIAS_DESLIGADAS = new Set<TipoDeAviso>()

const NOTIFICACOES_DO_SUPERVISOR: Notificacao[] = [
  {
    id: 'not-5', tipo: 'alerta_pendencia',
    titulo: '🚨 3 pendências em Produção', corpo: 'Ana Cláudia, Rodrigo e mais 1 ainda não bateram a entrada.',
    criadaEm: '2026-08-30T19:15:00-03:00', lida: false, destino: '/atividades',
  },
  {
    id: 'not-6', tipo: 'realocacao',
    titulo: 'Nova escala', corpo: 'Você foi escalado para Camarim em Manos da Vila.',
    criadaEm: '2026-08-28T10:00:00-03:00', lida: true, destino: '/evento/ev-2',
  },
]

const SEGREDO_DE_MENTIRA = 'segredo-do-cliente-falso'

type BatidaGravada = { id: string; tipo: string; em: string; data: string }

/**
 * Compara nome ignorando acento e maiúscula.
 *
 * Quem digita "patricia" com pressa precisa achar "Patrícia". Exigir o acento
 * faria a busca falhar justamente para quem está com a pessoa na frente.
 */
/**
 * Bate com o que foi digitado — nome ou CPF, com ou sem pontuação.
 *
 * O CPF é a chave da base, e é o que se tem em mãos quando alguém liga
 * perguntando "essa pessoa já trabalhou aqui?". Exigir a forma sem pontuação
 * faria a busca falhar para quem copiou de um documento.
 */
function combina(p: { nome: string; cpf: string }, busca: string): boolean {
  const termo = (busca ?? '').trim()
  if (!termo) return true
  const digitos = termo.replace(/\D/g, '')
  if (digitos.length >= 3 && /^[\d.\-\s]+$/.test(termo)) {
    return p.cpf.replace(/\D/g, '').includes(digitos)
  }
  return semAcento(p.nome).includes(semAcento(termo))
}

function semAcento(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

export type CredencialDeDemonstracao = {
  nome: string
  funcao: string
  setor: string
  codigo: string
  /** O crachá serve para a etapa de hoje? O falso oferece um de cada. */
  serveHoje: boolean
}

/**
 * Os crachás da equipe, prontos para a demonstração ler.
 *
 * Sem isto, experimentar o scanner exigiria DOIS aparelhos: um mostrando a
 * credencial e outro lendo. Aqui os códigos aparecem na própria tela, e um
 * toque simula a leitura.
 *
 * Um deles é de propósito da etapa errada — é o caso que tem uma decisão a
 * tomar com a pessoa parada na frente, e é o que mais precisa ser visto antes
 * de acontecer no portão.
 */
export function credenciaisDeDemonstracao(agora: number = Date.now()): CredencialDeDemonstracao[] {
  const hoje = diaBRT(new Date(agora))
  // `faseAtualDoQR`, não `faseDoDia`: mesmo evento atravessa a meia-noite.
  const faseDeHoje = faseAtualDoQR(new Date(agora), EVENTO.dataInicio, EVENTO.dataFim)
  const outraFase: FaseDoDia = faseDeHoje === 'evento' ? 'montagem' : 'evento'

  return EQUIPE_DE_MENTIRA.map((p, i) => {
    // O último da lista carrega o crachá da outra etapa.
    const serveHoje = i < EQUIPE_DE_MENTIRA.length - 1
    const fase = serveHoje ? faseDeHoje : outraFase
    return {
      nome: p.nome,
      funcao: p.funcao,
      setor: p.setor,
      codigo: gerarCodigoQR(SEGREDO_DE_MENTIRA, p.token, fase).codigo,
      serveHoje,
    }
  })
}

export class ClienteFalso implements ClienteApi {
  private atrasoMs: number
  private falhaDeRede: number
  private agora: () => number
  private checkinAutonomo: boolean
  private meioExigido: boolean

  private sessao: Sessao | null = null
  private participacao: ResumoParticipacao | null = null
  private batidas: BatidaGravada[] = []
  /** Os ids já recebidos — é isto que faz a idempotência ser real. */
  private idsRecebidos = new Set<string>()
  private codigoPedido: string | null = null
  /**
   * Só ESTE token de renovação vale. Ele MUDA a cada renovação — o de antes
   * para de funcionar na hora.
   *
   * O falso gira porque o servidor de verdade gira (há teste na API sobre
   * isso). Um falso que aceitasse sempre o mesmo deixaria o app ser escrito
   * sem guardar o token novo, e a pessoa cairia para fora na segunda renovação
   * — no evento, não aqui.
   */
  private renovacaoValida = 'renovacao-de-mentira'
  private renovacoesFeitas = 0
  /** Quem está logado. Muda `eu()` e o que o painel devolve. */
  private quemEntrou: { nome: string; papel: Papel } = { nome: 'João da Silva', papel: 'colaborador' }
  /** Quem foi tirado da equipe durante a conferência, por setor. */
  private removidosDaConferencia = new Map<string, Set<string>>()
  /** O estado de cada conferência já confirmada, por setor. */
  private conferenciasConfirmadas = new Map<string, {
    confirmadaEm: string
    confirmadaPorNome: string
    totalMantidos: number
    totalRemovidos: number
  }>()
  /**
   * As batidas lançadas manualmente, por pessoa — `${dataRef}:${etapa}` → a
   * hora escolhida. Separado de `batidasDaEquipe`: aquele guarda só "hoje";
   * este guarda o DIA DE TRABALHO explícito, porque o lançamento manual
   * grava no passado (a saída de madrugada pertence ao dia anterior).
   */
  private lancamentosManuais = new Map<string, Map<string, string>>()
  /**
   * As etapas que cada pessoa da equipe já registrou hoje, com o horário.
   *
   * Separado de `batidas`, que é a fila do colaborador logado: aqui é o que o
   * operador vê e grava sobre OUTRAS pessoas. Guarda o horário (e não só
   * "já fez") porque o registro assistido pode ESCOLHER uma etapa que já
   * tem registro — é uma correção deliberada, que sobrescreve o horário —
   * e a ficha precisa mostrar "pendente" ou a hora de cada etapa.
   */
  private batidasDaEquipe = new Map<string, Map<TipoBatida, string>>()
  /**
   * O log de entrada/saída de cada pessoa da equipe, na ORDEM em que
   * aconteceu — é o que alimenta `inferirMomentoDoScanner`. `batidasDaEquipe`
   * guarda só o horário mais recente de cada etapa (o que a ficha mostra);
   * esta guarda a sequência inteira, porque reabrir o turno depende de saber
   * QUAL registro foi a última saída, não só quando.
   */
  private logDeRegistros = new Map<string, RegistroParaInferencia[]>()
  /** O que a ficha de cada pessoa mudou nesta sessão. */
  private pagamentos = new Map<string, string>()
  private valores = new Map<string, number>()
  private movidos = new Map<string, string>()
  /** participacaoId → quando foi tirada da equipe ("descredenciada"). Ausente = credenciada. */
  private descredenciados = new Map<string, string>()
  /** participacaoId excluído de vez — nunca mais aparece em `acharNoSetor`. */
  private excluidosDeVez = new Set<string>()
  /** Telefone corrigido nesta sessão — ausente usa o de mentira original. */
  private telefones = new Map<string, string>()
  /** participacaoId → ativação mudada nesta sessão. Ausente usa a de mentira original. */
  private ativacoes = new Map<string, boolean>()
  /** participacaoId → função/cargo corrigido nesta sessão. Ausente usa o de mentira original. */
  private funcoes = new Map<string, string>()
  /** participacaoId → CPF corrigido nesta sessão. Ausente usa o de mentira original. */
  private cpfsCorrigidos = new Map<string, string>()
  /** participacaoId → contestações desta sessão, mais recente primeiro. */
  private contestacoes = new Map<string, {
    id: string; tipo: TipoBatida; dataRef: string; motivo: string; criadoEm: string; resolvida: boolean
  }[]>()

  constructor(c: ComportamentoFalso = {}) {
    this.atrasoMs = c.atrasoMs ?? 0
    this.falhaDeRede = c.falhaDeRede ?? 0
    this.agora = c.agora ?? (() => Date.now())
    this.checkinAutonomo = c.checkinAutonomoDoEvento ?? EVENTO.checkinAutonomo
    // `true` por padrão: o colaborador de demonstração é da Produção — mesmo
    // setor que `SETORES_DE_MENTIRA['ev-1']` marca com `exigeMeio: true`.
    this.meioExigido = c.meioExigidoNoMeuSetor ?? true
    if (c.sessaoInicial) {
      this.sessao = c.sessaoInicial
      this.renovacaoValida = c.sessaoInicial.renovacao
    }
  }

  /** Toda chamada passa por aqui: é onde a rede ruim é simulada. */
  private async rede(): Promise<void> {
    if (this.atrasoMs) await new Promise(r => setTimeout(r, this.atrasoMs))
    if (this.falhaDeRede && Math.random() < this.falhaDeRede) {
      // Exceção, e não resposta de erro: falha de transporte não é decisão do
      // servidor, e a fila offline precisa saber a diferença.
      throw new Error('Sem conexão')
    }
  }

  // ── Identidade ────────────────────────────────────────────────────────────

  async entrarComSenha(identificador: string, senha: string) {
    await this.rede()

    const conta = contaPor(identificador)

    /*
     * A MESMA recusa para os dois casos: conta que não existe e senha errada.
     *
     * Se a resposta fosse diferente, alguém descobriria quais CPFs têm conta no
     * sistema tentando um por um — e essa lista é justamente a de quem tem
     * acesso ao painel. É a mesma regra que a API já segue nas participações.
     */
    if (!conta || senha !== SENHA_DE_DEMONSTRACAO) {
      return { erro: 'CPF ou senha incorretos.' }
    }

    this.quemEntrou = { nome: conta.nome, papel: conta.papel }
    return { sessao: this.abrirSessao(conta.papel) }
  }

  async pedirCodigo(telefone: string) {
    await this.rede()
    const digitos = (telefone ?? '').replace(/\D/g, '')
    if (digitos.length < 10) return { enviado: false, erro: 'Digite o número com DDD.' }
    this.codigoPedido = '123456'
    return { enviado: true }
  }

  async entrar(telefone: string, codigo: string) {
    await this.rede()
    if (!this.codigoPedido) return { erro: 'Peça o código antes de entrar.' }
    if (codigo.replace(/\D/g, '') !== this.codigoPedido) {
      return { erro: 'Código incorreto. Confira a mensagem que chegou no WhatsApp.' }
    }
    this.quemEntrou = { nome: 'João da Silva', papel: 'colaborador' }
    void telefone
    return { sessao: this.abrirSessao('colaborador') }
  }

  async renovar(renovacao: string) {
    await this.rede()
    if (renovacao !== this.renovacaoValida) return { erro: 'Sessão expirada. Entre de novo.' }

    // A sessão é montada inteira, e não remendada sobre a que existia: quando o
    // app reabre depois de fechado, não existe sessão anterior aqui dentro — e
    // um objeto pela metade viraria um token `undefined` viajando nas chamadas.
    this.renovacoesFeitas += 1
    this.renovacaoValida = `renovacao-de-mentira-${this.renovacoesFeitas}`
    this.sessao = {
      token: 'token-de-mentira',
      expiraEm: new Date(this.agora() + 3600e3).toISOString(),
      renovacao: this.renovacaoValida,
      papel: this.sessao?.papel ?? 'colaborador',
    }
    return { sessao: this.sessao }
  }

  async eu(): Promise<Eu> {
    await this.rede()
    this.exigirSessao()
    return {
      pessoaId: 'p-1',
      nome: this.quemEntrou.nome,
      cpfFinal: '**94',
      telefone: '27999255959',
      fotoUrl: null,
      papel: this.quemEntrou.papel,
    }
  }

  /** A da organização mescla POR CIMA da da plataforma — mesma regra do site e da API. */
  private mapaDeExcecoes(organizacaoId: string | null): Record<string, boolean> {
    const mapa: Record<string, boolean> = {}
    for (const e of PERMISSOES_ORGANIZACAO_DE_MENTIRA) {
      if (e.organizacaoId === null) mapa[chaveDaPermissao(e.papel, e.chave)] = e.permitido
    }
    if (organizacaoId) {
      for (const e of PERMISSOES_ORGANIZACAO_DE_MENTIRA) {
        if (e.organizacaoId === organizacaoId) mapa[chaveDaPermissao(e.papel, e.chave)] = e.permitido
      }
    }
    return mapa
  }

  async minhasPermissoes(): Promise<MinhasPermissoes> {
    await this.rede()
    this.exigirSessao()
    const meuAcesso = ACESSOS_DE_MENTIRA.find(a => a.nome === this.quemEntrou.nome)
    return {
      permissoesUsuario: meuAcesso?.permissoesUsuario ?? {},
      permissoesOrganizacao: this.mapaDeExcecoes(ehMaster(this.quemEntrou.papel) ? null : ORGANIZACAO_DO_ADMIN_DE_MENTIRA),
    }
  }

  /** Cópia do site's `registrarAuditoria` — chamado por toda ação sensível já wireada. */
  private registrarAuditoria(entrada: {
    acao: string
    campoAlterado?: string | null
    valorAnterior?: string | null
    valorNovo?: string | null
    motivo?: string | null
    eventoId?: string | null
  }) {
    AUDITORIA_DE_MENTIRA.unshift({
      id: `aud-${AUDITORIA_DE_MENTIRA.length + 1}`,
      quando: new Date(this.agora()).toISOString(),
      autorNome: this.quemEntrou.nome,
      acao: entrada.acao,
      campoAlterado: entrada.campoAlterado ?? null,
      valorAnterior: entrada.valorAnterior ?? null,
      valorNovo: entrada.valorNovo ?? null,
      motivo: entrada.motivo ?? null,
      eventoId: entrada.eventoId ?? null,
      eventoNome: entrada.eventoId
        ? (EVENTOS_DO_PAINEL.find(e => e.eventoId === entrada.eventoId)?.nome ?? null)
        : null,
    })
  }

  async auditoria(filtro?: { eventoId?: string; dias?: number }): Promise<LinhaDeAuditoria[]> {
    await this.rede()
    this.exigirSessao()
    if (!(podeGerenciarUsuarios(this.quemEntrou.papel) || this.quemEntrou.papel === 'suporte')) {
      throw new Error('Você não tem permissão para ver a trilha de auditoria.')
    }

    // Mesmo escopo do site: suporte só vê o que ele mesmo fez. O fake não
    // modela organização por acesso individual (ver `ORGANIZACAO_DO_ADMIN_DE_MENTIRA`),
    // então master/admin veem a mesma trilha inteira — a régua de organização
    // é a mesma simplificação já assumida no resto deste cliente.
    let linhas = this.quemEntrou.papel === 'suporte'
      ? AUDITORIA_DE_MENTIRA.filter(a => a.autorNome === this.quemEntrou.nome)
      : AUDITORIA_DE_MENTIRA

    if (filtro?.eventoId) linhas = linhas.filter(a => a.eventoId === filtro.eventoId)
    if (filtro?.dias !== undefined) {
      const desde = new Date(this.agora() - filtro.dias * 24 * 60 * 60_000).toISOString()
      linhas = linhas.filter(a => a.quando >= desde)
    }
    return linhas.slice(0, 200)
  }

  async permissoesDaOrganizacao(organizacaoId: string | null): Promise<ConfiguracoesDePermissao> {
    await this.rede()
    this.exigirSessao()
    if (!ehMaster(this.quemEntrou.papel)) throw new Error('Só o master configura permissões.')
    return {
      organizacoes: ORGANIZACOES_DE_MENTIRA.map(o => ({ organizacaoId: o.organizacaoId, nome: o.nome })),
      salvas: PERMISSOES_ORGANIZACAO_DE_MENTIRA.filter(e => e.organizacaoId === organizacaoId),
    }
  }

  async salvarPermissaoDaOrganizacao(
    organizacaoId: string | null, papel: Papel, chave: string, permitido: boolean | null,
  ): Promise<{ erro?: string }> {
    await this.rede()
    this.exigirSessao()
    if (!ehMaster(this.quemEntrou.papel)) return { erro: 'Só o master configura permissões.' }

    if (!PAPEIS_CONFIGURAVEIS.includes(papel)) return { erro: 'Este tipo de acesso não é configurável.' }
    if (!CAPACIDADES.some(c => c.chave === chave)) return { erro: 'Permissão desconhecida.' }
    if (organizacaoId && !ORGANIZACOES_DE_MENTIRA.some(o => o.organizacaoId === organizacaoId)) {
      return { erro: 'Organização não encontrada.' }
    }

    const i = PERMISSOES_ORGANIZACAO_DE_MENTIRA.findIndex(
      e => e.organizacaoId === organizacaoId && e.papel === papel && e.chave === chave,
    )
    if (i >= 0) PERMISSOES_ORGANIZACAO_DE_MENTIRA.splice(i, 1)
    if (permitido !== null) PERMISSOES_ORGANIZACAO_DE_MENTIRA.push({ organizacaoId, papel, chave, permitido })

    const capacidade = CAPACIDADES.find(c => c.chave === chave)
    this.registrarAuditoria({
      acao: 'ALTERACAO_PERMISSAO',
      campoAlterado: `${papel} · ${capacidade?.nome ?? chave}`,
      valorNovo: permitido === null ? 'Voltou ao padrão do sistema' : permitido ? 'Liberado' : 'Bloqueado',
    })
    return {}
  }

  // ── Entrar num evento ─────────────────────────────────────────────────────

  async consultarConvite(codigo: string) {
    await this.rede()
    this.exigirSessao()

    const lido = lerCodigoDeEvento(codigo)
    if (!lido.ok) return { erro: lido.erro }
    if (lido.codigo !== EVENTO.codigo) {
      return { erro: 'Não encontramos um evento com este código. Confira com quem te enviou.' }
    }

    /*
     * Já está dentro: a API recusa aqui, e o falso passa a recusar também.
     *
     * A divergência foi encontrada pelo teste que roda o mesmo roteiro nos dois
     * clientes. O falso deixava consultar e reentrar; a API não. Um falso mais
     * permissivo que o servidor ensina o app a fazer coisa errada — a tela
     * seria escrita acreditando que dá, e a falha só apareceria contra a API.
     */
    if (this.participacao && this.participacao.eventoId === EVENTO.id) {
      return { erro: 'Você já está neste evento. Ele aparece na sua tela inicial.' }
    }

    const convite: ConviteDoEvento = {
      eventoId: EVENTO.id,
      eventoNome: EVENTO.nome,
      organizacaoNome: EVENTO.organizacao,
      local: EVENTO.local,
      dataInicio: EVENTO.dataInicio,
      exigeAprovacao: false,
      // Só o que a conta ainda não sabe. Nome, CPF e telefone não voltam a ser
      // pedidos — é a promessa central da conta permanente.
      camposExtras: [
        { chave: 'funcao', rotulo: 'Sua função no evento', tipo: 'texto', obrigatorio: true },
        {
          chave: 'uniforme', rotulo: 'Tamanho do uniforme', tipo: 'escolha',
          obrigatorio: true, opcoes: ['P', 'M', 'G', 'GG'],
        },
      ],
    }
    return { convite }
  }

  async entrarNoEvento(codigo: string, respostas: Record<string, string>) {
    await this.rede()
    const c = await this.consultarConvite(codigo)
    if (c.erro || !c.convite) return { erro: c.erro ?? 'Código inválido.' }

    const faltando = c.convite.camposExtras.filter(x => x.obrigatorio && !respostas[x.chave]?.trim())
    if (faltando.length) return { erro: `Preencha: ${faltando.map(f => f.rotulo).join(', ')}.` }

    this.participacao = {
      participacaoId: 'part-1',
      eventoId: EVENTO.id,
      eventoNome: EVENTO.nome,
      local: EVENTO.local,
      dataInicio: EVENTO.dataInicio,
      equipe: 'Produção',
      funcao: respostas.funcao ?? null,
      supervisor: 'Carlos Silva',
      situacao: 'credenciado',
      emAndamento: true,
      checkinAutonomo: this.checkinAutonomo,
    }
    return { participacao: this.participacao }
  }

  // ── O que é meu ───────────────────────────────────────────────────────────

  async minhasParticipacoes(): Promise<ResumoParticipacao[]> {
    await this.rede()
    this.exigirSessao()
    return this.participacao ? [this.participacao] : []
  }

  async meusDias(participacaoId: string): Promise<DiaDaParticipacao[]> {
    await this.rede()
    this.exigirParticipacao(participacaoId)

    return DIAS.map(d => {
      const doDia = this.batidas.filter(b => b.data === d.data)
      const pega = (t: string) => doDia.find(b => b.tipo === t)?.em ?? null
      const entrada = pega('entrada')
      const meio = pega('meio')
      const janela = entrada ? janelaMeio(entrada) : null

      return {
        data: d.data,
        etapa: faseDoDia(d.data, diaBRT(EVENTO.dataInicio)),
        // Nenhum dia de mentira nasce cancelado — o cenário fixo não modela isso.
        cancelado: false,
        entrada,
        // O cenário de mentira não distingue batida assistida da própria — sempre falso.
        entradaAssistida: false,
        meioEsperado: janela?.inicio ?? null,
        meio,
        meioAssistido: false,
        meioAtrasoMin:
          meio && janela && new Date(meio) > new Date(janela.fim)
            ? Math.round((Date.parse(meio) - Date.parse(janela.fim)) / 60_000)
            : null,
        saida: pega('fim'),
        saidaAssistida: false,
        compareceu: !!entrada,
        horas: entrada && pega('fim')
          ? Math.round(((Date.parse(pega('fim')!) - Date.parse(entrada)) / 3600e3) * 100) / 100
          : null,
        // O E entre setor e dia — ver o comentário de `meioExigido` e de `DIAS`.
        meioExigido: this.meioExigido && d.exigeMeio,
      }
    })
  }

  async meuFinanceiro(participacaoId: string): Promise<FinanceiroDaParticipacao> {
    await this.rede()
    this.exigirParticipacao(participacaoId)
    const dias = await this.meusDias(participacaoId)
    const trabalhados = dias.filter(d => d.compareceu).length
    return {
      diasTrabalhados: trabalhados,
      // Total combinado pra participação inteira, não uma diária — mesma
      // correção da API real, 21/09/2026.
      valorPrevisto: 450,
      situacao: 'pendente',
      pagoEm: null,
      chavePix: null,
    }
  }

  async meuHistorico(): Promise<MeuHistorico> {
    await this.rede()
    this.exigirSessao()
    // O cenário de mentira só modela UMA participação por vez — o histórico
    // aqui é essa única, ou vazio, nunca vários eventos passados de verdade.
    if (!this.participacao) return { totalEventos: 0, totalGanho: 0, eventos: [] }

    const financeiro = await this.meuFinanceiro(this.participacao.participacaoId)
    const evento = {
      participacaoId: this.participacao.participacaoId,
      eventoId: this.participacao.eventoId,
      eventoNome: this.participacao.eventoNome,
      local: this.participacao.local,
      dataInicio: this.participacao.dataInicio,
      situacao: this.participacao.situacao,
      diasTrabalhados: financeiro.diasTrabalhados,
      valorPrevisto: financeiro.valorPrevisto,
      pagamentoSituacao: financeiro.situacao,
    }
    return { totalEventos: 1, totalGanho: evento.valorPrevisto ?? 0, eventos: [evento] }
  }

  async excluirMinhaConta(): Promise<{ erro?: string }> {
    await this.rede()
    this.exigirSessao()
    if (this.quemEntrou.papel !== 'colaborador') {
      return { erro: 'Esta ação é só para conta de colaborador.' }
    }
    this.quemEntrou = { nome: 'Pessoa excluída', papel: 'colaborador' }
    this.sessao = null
    return {}
  }

  async meusDados(): Promise<ArquivoDePlanilha> {
    await this.rede()
    this.exigirSessao()
    if (this.quemEntrou.papel !== 'colaborador') {
      throw new Error('Esta ação é só para conta de colaborador.')
    }
    const hoje = diaBRT(new Date(this.agora()))
    return { nome: `meus-dados-${hoje}.json`, url: `${ENDERECO_DE_ARQUIVOS}/meus-dados` }
  }

  async revogarConsentimentoDeBase(): Promise<{ erro?: string }> {
    await this.rede()
    this.exigirSessao()
    // O cenário de mentira não modela consentimento_base — nada a desfazer,
    // mas a chamada precisa continuar segura de fazer (idempotente).
    return {}
  }

  async meuQr(participacaoId: string) {
    await this.rede()
    this.exigirParticipacao(participacaoId)
    const agora = new Date(this.agora())
    // `faseAtualDoQR`, não `faseDoDia` — mesmo motivo do `meuQr` da API real.
    const etapa = faseAtualDoQR(agora, EVENTO.dataInicio, EVENTO.dataFim)
    const { codigo } = gerarCodigoQR(SEGREDO_DE_MENTIRA, 'token-do-qr', etapa)

    // Mesma régua da API real — ver o comentário em `rotas/eventos.ts`.
    const dia = DIAS.find(d => d.data === diaBRT(agora)) ?? null
    const { liberado, liberaEm } = !dia
      ? { liberado: true, liberaEm: null }
      : liberacaoDoQR(EVENTO, { tipo: dia.tipo, cancelado: false }, agora)

    return { codigo, etapa, liberado, liberaEm }
  }

  /** Um aviso de demonstração, sempre o mesmo — só pra tela não ficar vazia. */
  private avisoDeMentira = { id: 'aviso-demo', titulo: 'Bem-vindo à demonstração', mensagem: 'Este é um aviso de exemplo do mural do admin.' }
  private avisosVistosDeMentira = new Set<string>()

  async avisosPendentes(_eventoId: string): Promise<AvisoPendente[]> {
    await this.rede()
    this.exigirSessao()
    void _eventoId
    return this.avisosVistosDeMentira.has(this.avisoDeMentira.id) ? [] : [this.avisoDeMentira]
  }

  async marcarAvisoVisto(avisoId: string): Promise<{ erro?: string }> {
    await this.rede()
    this.exigirSessao()
    this.avisosVistosDeMentira.add(avisoId)
    return {}
  }

  // ── Bater ponto ───────────────────────────────────────────────────────────

  async registrarBatida(envio: EnvioDeBatida): Promise<RespostaDeBatida> {
    await this.rede()

    // Idempotência de verdade: o mesmo id volta como duplicado, não gera linha.
    if (this.idsRecebidos.has(envio.id)) {
      const ja = this.batidas.find(b => b.id === envio.id)
      return { situacao: 'duplicado', em: ja?.em ?? envio.registradoEm }
    }

    const data = diaBRT(envio.registradoEm)
    const dia = DIAS.find(d => d.data === data) ?? null
    const doDia = this.batidas.filter(b => b.data === data)

    if (envio.tipo === 'meio') {
      const entrada = doDia.find(b => b.tipo === 'entrada')
      if (!entrada) {
        return { situacao: 'recusado', motivo: 'Registre primeiro a sua entrada. O horário do meio é contado a partir dela.' }
      }
      if (Date.parse(envio.registradoEm) < Date.parse(janelaMeio(entrada.em).inicio)) {
        return { situacao: 'recusado', motivo: 'O registro do meio ainda não abriu. Você será avisado no WhatsApp quando chegar a hora.' }
      }
    } else {
      // A mesma função que o sistema web usa — não uma regra reescrita aqui.
      const v = avaliarEntradaSaida(
        EVENTO,
        dia ? { tipo: dia.tipo, cancelado: false } : null,
        envio.tipo,
        data,
        new Date(envio.registradoEm),
      )
      if (!v.ok) return { situacao: 'recusado', motivo: v.erro }

      if (envio.tipo === 'fim' && !doDia.some(b => b.tipo === 'meio')) {
        return { situacao: 'recusado', motivo: 'Registre o meio antes de sair. Abra sua credencial, tire a selfie do meio e volte aqui.' }
      }
    }

    if (doDia.some(b => b.tipo === envio.tipo)) {
      const ja = doDia.find(b => b.tipo === envio.tipo)!
      return { situacao: 'duplicado', em: ja.em }
    }

    this.idsRecebidos.add(envio.id)
    this.batidas.push({ id: envio.id, tipo: envio.tipo, em: envio.registradoEm, data })
    return { situacao: 'registrado', em: envio.registradoEm }
  }

  /**
   * Entrada sem operador — o auto-atendimento.
   *
   * Só entrada: por isso o método nem recebe a etapa como parâmetro. A saída
   * segue sempre pelo QR mostrado no credenciamento — decisão do Juan, ver o
   * comentário em `cliente.ts`.
   *
   * O horário é o do RELÓGIO DO SERVIDOR, não o do aparelho: ao contrário da
   * batida assistida, esta chamada não passa pela fila offline — a pessoa
   * espera a confirmação na hora, e sem fila não há reenvio tardio para
   * proteger.
   */
  async registrarEntradaLivre(
    participacaoId: string,
    dados: { lat?: number; lng?: number },
  ): Promise<RespostaDeBatida> {
    await this.rede()
    this.exigirParticipacao(participacaoId)
    void dados // o falso não confere geolocalização — só a repassaria adiante

    const agora = new Date(this.agora())
    const data = diaBRT(agora.toISOString())
    const dia = DIAS.find(d => d.data === data) ?? null

    // O interruptor só entra na conta no dia principal. Fora dele, a entrada
    // sem operador já é sempre permitida — mesma regra da montagem/desmontagem.
    if (dia?.tipo === 'principal' && !this.checkinAutonomo) {
      return { situacao: 'recusado', motivo: 'No dia do evento, a entrada é pelo QR Code no credenciamento.' }
    }

    // A mesma função que avalia a entrada assistida: dia não marcado recusa,
    // preparação é livre, e o dia principal respeita a batida livre/janela.
    const v = avaliarEntradaSaida(
      EVENTO,
      dia ? { tipo: dia.tipo, cancelado: false } : null,
      'entrada',
      data,
      agora,
    )
    if (!v.ok) return { situacao: 'recusado', motivo: v.erro }

    const doDia = this.batidas.filter(b => b.data === data)
    if (doDia.some(b => b.tipo === 'entrada')) {
      const ja = doDia.find(b => b.tipo === 'entrada')!
      return { situacao: 'duplicado', em: ja.em }
    }

    const registradoEm = agora.toISOString()
    const id = `livre-${participacaoId}-${data}`
    this.idsRecebidos.add(id)
    this.batidas.push({ id, tipo: 'entrada', em: registradoEm, data })
    return { situacao: 'registrado', em: registradoEm }
  }

  async contestarBatida(
    participacaoId: string, tipo: TipoBatida, dataRef: string, motivo: string,
  ): Promise<{ erro?: string }> {
    await this.rede()
    this.exigirParticipacao(participacaoId)

    if (!(motivo ?? '').trim()) return { erro: 'Escreva o que está errado — sem isso, quem for resolver não sabe por onde começar.' }

    const lista = this.contestacoes.get(participacaoId) ?? []
    lista.unshift({
      id: `cont-${participacaoId}-${lista.length}`,
      tipo, dataRef, motivo: motivo.trim(),
      criadoEm: new Date(this.agora()).toISOString(),
      resolvida: false,
    })
    this.contestacoes.set(participacaoId, lista)
    return {}
  }

  /** Monta a sessão inteira e reinicia o giro do token longo. */
  private abrirSessao(papel: Papel): Sessao {
    this.renovacaoValida = 'renovacao-de-mentira'
    this.renovacoesFeitas = 0
    this.sessao = {
      token: 'token-de-mentira',
      expiraEm: new Date(this.agora() + 3600e3).toISOString(),
      renovacao: this.renovacaoValida,
      papel,
    }
    return this.sessao
  }

  // ── Painel ────────────────────────────────────────────────────────────────

  async painel(): Promise<Painel> {
    await this.rede()
    this.exigirSessao()

    /*
     * O colaborador não tem painel, e a recusa é do SERVIDOR.
     *
     * O app já não mostra o menu para ele — mas menu escondido não é
     * segurança, é arrumação. Quem decide é quem tem os dados.
     */
    if (this.sessao!.papel === 'colaborador') {
      throw new Error('Você não tem acesso ao painel.')
    }

    /*
     * O supervisor cuida de UM setor. Ele vê o próprio evento e a própria
     * equipe, e não a operação inteira — o recorte é feito aqui, no servidor,
     * e não na tela: se a tela filtrasse, bastaria adulterar o pedido.
     *
     * O master vê a plataforma inteira — não pertence a organização
     * nenhuma. Todo outro papel de painel (admin, gerente, cliente) vê só os
     * eventos da PRÓPRIA organização: o mesmo isolamento que já existe entre
     * setores, um nível acima.
     */
    const papel = this.sessao!.papel
    const meus = papel === 'supervisor'
      ? EVENTOS_DO_PAINEL.filter(e => e.eventoId === 'ev-2')
      : ehMaster(papel)
        ? EVENTOS_DO_PAINEL
        : EVENTOS_DO_PAINEL.filter(e => e.organizacaoId === ORGANIZACAO_DO_ADMIN_DE_MENTIRA)

    const equipe = meus.reduce((a, e) => a + e.equipe, 0)
    const presentes = meus.reduce((a, e) => a + e.presentes, 0)

    /*
     * O master vê OUTRA pergunta — "como vai o negócio", não "como está o
     * evento agora". Mesma régua da API de verdade, ver `rotas/painel.ts`.
     */
    const indicadores: IndicadorDoPainel[] = ehMaster(papel)
      ? [
          {
            chave: 'eventos_ativos',
            rotulo: 'Eventos ativos',
            valor: meus.length,
            sub: `de ${meus.length} no total`,
            tom: 'acento',
          },
          {
            chave: 'funcionarios_na_base',
            rotulo: 'Funcionários na base',
            valor: BASE_DE_MENTIRA.length,
            sub: 'pessoas distintas, por CPF',
            tom: 'sucesso',
          },
          {
            chave: 'valor_cobrado',
            rotulo: 'Valor cobrado nos eventos',
            valor: 'R$ 3.150,00',
            sub: 'combinado com a equipe, nos eventos ativos',
            tom: 'aviso',
          },
          {
            chave: 'custo_whatsapp',
            rotulo: 'Custo de disparo (WhatsApp)',
            valor: 'R$ 168,07',
            sub: 'últimos 30 dias',
            tom: 'info',
          },
        ]
      : [
          {
            chave: 'eventos_ativos',
            rotulo: 'Eventos ativos',
            valor: meus.length,
            sub: `de ${meus.length} no total`,
            tom: 'acento',
          },
          {
            chave: 'presentes',
            rotulo: 'Presentes agora',
            valor: presentes,
            sub: equipe ? `de ${equipe} na equipe` : 'equipe não cadastrada',
            tom: 'sucesso',
          },
          {
            chave: 'nao_chegaram',
            rotulo: 'Ainda não chegaram',
            valor: Math.max(0, equipe - presentes),
            tom: 'aviso',
          },
          {
            chave: 'batidas',
            rotulo: 'Batidas na janela',
            valor: this.batidas.length,
            sub: 'entrada, meio e saída',
            tom: 'info',
          },
        ]

    return {
      data: new Date(this.agora()).toISOString(),
      indicadores,
      eventos: meus,
      atividade: ATIVIDADE_DE_MENTIRA,
      legendaDaJanela:
        'Henrique e Juliano - Kleber Andrade · das 07:00 de 05/09/2026 às 08:00 de 06/09/2026',
      batidasNaJanela: this.batidas.length,
    }
  }

  // ── Escanear QR ───────────────────────────────────────────────────────────

  async eventosParaEscanear(): Promise<EventoEscaneavel[]> {
    await this.rede()
    this.exigirSessao()
    this.exigirPoder(podeEscanear, 'escanear crachá')
    return EVENTOS_DO_PAINEL.map(e => ({ eventoId: e.eventoId, nome: e.nome }))
  }

  /**
   * Lê o crachá e decide sozinho se é entrada ou saída.
   *
   * O operador não escolhe mais a etapa (era um botão Entrada/Saída — o
   * sistema web tirou em 03/09/2026: esquecer de trocar na hora de liberar a
   * equipe fazia a noite inteira sair gravada errada). Quem decide é
   * `inferirMomentoDoScanner`, com o histórico de quando essa pessoa entrou
   * e saiu — a mesma regra do site, ver `packages/dominio/src/janelas.ts`.
   */
  async registrarPorQr(eventoId: string, codigoLido: string): Promise<ResultadoDaLeitura> {
    await this.rede()
    this.exigirSessao()
    this.exigirPoder(podeEscanear, 'escanear crachá')
    void eventoId

    const agora = new Date(this.agora())
    const hoje = diaBRT(agora)
    // `faseAtualDoQR`, não `faseDoDia`: este evento também atravessa a
    // meia-noite (18:30 → 08:00) — ver o mesmo comentário em `meuQr`.
    const faseDeHoje = faseAtualDoQR(agora, EVENTO.dataInicio, EVENTO.dataFim)

    // A leitura é a do domínio: confere a ASSINATURA do código. É a mesma
    // função que o sistema web usa, então um crachá que passa lá passa aqui.
    const lido = lerCodigoQR(SEGREDO_DE_MENTIRA, codigoLido, hoje)
    if (!lido.ok) return { situacao: 'recusado', mensagem: lido.erro }

    const pessoa = EQUIPE_DE_MENTIRA.find(p => p.token === lido.token)
    if (!pessoa) {
      return {
        situacao: 'recusado',
        mensagem: 'Esta credencial não é deste evento. Confira com a produção.',
      }
    }

    /*
     * Etapa errada é resposta PRÓPRIA, e não "QR inválido".
     *
     * "Inválido" faria o operador pensar em falsificação e chamar a segurança,
     * quando o que houve foi a pessoa mostrar o crachá da montagem no dia do
     * evento — coisa que acontece, e que se resolve pedindo para ela recarregar
     * a tela.
     */
    const confere = faseConfere(lido.fase, faseDeHoje)
    if (!confere.ok) {
      return {
        situacao: 'etapa_errada',
        doQr: lido.fase ?? '',
        deHoje: faseDeHoje,
        mensagem: confere.erro,
      }
    }

    if (!pessoa.ativo) {
      return {
        situacao: 'recusado',
        mensagem: `${pessoa.nome} ainda não foi ativada neste evento. Ative no painel do setor antes de registrar.`,
      }
    }

    const resumo = { nome: pessoa.nome, funcao: pessoa.funcao }
    const decisao = inferirMomentoDoScanner(this.registrosDe(pessoa.id), hoje, agora)

    // Carência: leitura em sequência da mesma pessoa, logo após entrada ou
    // saída — recusa em vez de gravar o contrário do que acabou de acontecer.
    if ('erro' in decisao) {
      return { situacao: 'recusado', mensagem: decisao.erro }
    }

    if ('reabrir' in decisao) {
      /*
       * Sai no almoço, volta à tarde. Apaga a saída anterior (o turno fica
       * aberto de novo, com a entrada original preservada) e devolve um
       * aviso PRÓPRIO — "reaberto" não é a mesma coisa que "entrada
       * registrada", e o operador precisa entender por que o crachá que
       * parecia fechado voltou a valer.
       */
      const lista = this.registrosDe(pessoa.id)
      const i = lista.findIndex(r => r.id === decisao.reabrir.registroId)
      if (i >= 0) lista.splice(i, 1)
      this.etapasDe(pessoa.id).delete('fim')
      this.registrarAuditoria({
        acao: 'REABERTURA_TURNO', campoAlterado: `Turno de ${pessoa.nome}`,
        valorAnterior: `Saída às ${formatarBR(decisao.reabrir.em, 'hora')}`, valorNovo: 'Desfeita — turno reaberto',
        eventoId,
      })
      return {
        situacao: 'reaberto',
        pessoa: resumo,
        mensagem: `Bem-vindo de volta! Turno reaberto — a saída das ${formatarBR(decisao.reabrir.em, 'hora')} foi desfeita.`,
      }
    }

    const momento = decisao.momento

    /*
     * A saída NÃO exige mais o meio — mudou no site, trazido em 11/09/2026.
     *
     * Chegou a existir essa trava, a pedido explícito — mas travava
     * justamente quem mais precisava sair: quem perdeu o meio de verdade
     * ficava preso no evento até um supervisor destravar pelo registro
     * assistido, e num show grande isso virava fila. A ausência do meio
     * continua visível no histórico e na tela de pendências, para o
     * organizador cobrar depois — só deixou de IMPEDIR a saída.
     */

    this.registrosDe(pessoa.id).push({
      id: `reg-${pessoa.id}-${this.registrosDe(pessoa.id).length + 1}`,
      tipo: momento, em: agora.toISOString(), dataRef: hoje,
    })
    this.etapasDe(pessoa.id).set(momento, agora.toISOString())

    return {
      situacao: 'registrado',
      momento,
      pessoa: resumo,
      mensagem: momento === 'entrada' ? 'Entrada registrada' : 'Saída registrada',
    }
  }

  async conferirPorCpf(eventoId: string, cpf: string): Promise<ConferenciaPorCpf> {
    await this.rede()
    this.exigirSessao()
    this.exigirPoder(podeEscanear, 'conferir credenciamento')
    void eventoId

    const digitos = (cpf ?? '').replace(/\D/g, '')
    const pessoa = EQUIPE_DE_MENTIRA.find(p => p.cpf === digitos)

    if (!pessoa) {
      return {
        encontrada: false,
        mensagem: 'Não encontramos este CPF na equipe deste evento.',
      }
    }

    return {
      encontrada: true,
      nome: pessoa.nome,
      funcao: pessoa.funcao,
      setorNome: pessoa.setor,
      ativo: pessoa.ativo,
      etapasFeitas: [...this.etapasDe(pessoa.id).keys()],
      mensagem: pessoa.ativo
        ? `${pessoa.nome} está credenciada em ${pessoa.setor}.`
        : `${pessoa.nome} está na lista, mas ainda não foi ativada no evento.`,
    }
  }

  // ── Registrar ponto por outra pessoa ──────────────────────────────────────

  async localizarPessoa(termo: string) {
    await this.rede()
    this.exigirSessao()
    this.exigirPoder(podeAcompanhar, 'localizar pessoa')

    const busca = (termo ?? '').trim()
    if (busca.length < 3) {
      return { erro: 'Digite pelo menos três letras do nome, ou o CPF completo.' }
    }

    const digitos = busca.replace(/\D/g, '')
    const porCpf = digitos.length === 11
      ? EQUIPE_DE_MENTIRA.filter(p => p.cpf === digitos)
      : []

    const achados = porCpf.length > 0
      ? porCpf
      : EQUIPE_DE_MENTIRA.filter(p => semAcento(p.nome).includes(semAcento(busca)))

    /*
     * Rede de segurança para CPF digitado errado NO CADASTRO.
     *
     * O documento na mão do operador está certo — a consulta exata é que não
     * acha uma linha gravada com um algarismo trocado. Só entra quando a
     * busca exata por CPF completo não achou nada: nunca troca uma resposta
     * exata por uma aproximada.
     */
    if (achados.length === 0 && digitos.length === 11) {
      const aproximados = EQUIPE_DE_MENTIRA.filter(p => distanciaEntreCpfs(p.cpf, digitos) <= TOLERANCIA_DE_CPF)
      if (aproximados.length > 0) {
        // Nunca escolhe sozinho, mesmo com um candidato só: a tela mostra
        // nome, CPF salvo e setor para o operador confirmar quem está na
        // frente dele — o CPF aproximado pode ser de outra pessoa.
        return { candidatos: aproximados.map(p => this.candidato(p, true)) }
      }
    }

    if (achados.length === 0) {
      return { erro: 'Ninguém encontrado. Confira o CPF, ou tente parte do nome.' }
    }

    // Uma só: abre direto. Mais de uma: quem escolhe é quem está olhando para a
    // pessoa — nome quase nunca é único, e errar de pessoa aqui grava a
    // presença de quem não veio.
    if (achados.length === 1) return { ficha: this.ficha(achados[0]!) }
    return { candidatos: achados.map(p => this.candidato(p)) }
  }

  async abrirFicha(participacaoId: string) {
    await this.rede()
    this.exigirSessao()
    this.exigirPoder(podeAcompanhar, 'abrir ficha')

    const pessoa = EQUIPE_DE_MENTIRA.find(p => p.id === participacaoId)
    // Fora do alcance responde igual a inexistente — senão, trocar o id vira
    // uma forma de descobrir quem está cadastrado.
    if (!pessoa) return { erro: 'Não encontramos esta pessoa.' }
    return { ficha: this.ficha(pessoa) }
  }

  async registrarPresencaAssistida(participacaoId: string, dados: BatidaAssistida) {
    await this.rede()
    this.exigirSessao()
    this.exigirPoder(podeAcompanhar, 'registrar presença')

    const pessoa = EQUIPE_DE_MENTIRA.find(p => p.id === participacaoId)
    if (!pessoa) return { erro: 'Não encontramos esta pessoa.' }
    if (!pessoa.ativo) {
      return { erro: `${pessoa.nome} ainda não foi ativada neste evento.` }
    }

    // Etapa inválida — nunca confia cegamente no que a tela mandou, mesmo
    // aqui, onde é o operador que escolhe.
    if (!ORDEM_DAS_ETAPAS.includes(dados.tipo)) return { erro: 'Etapa inválida.' }

    /*
     * Sem foto, não registra.
     *
     * É a única prova de que o colaborador estava na frente de quem registrou.
     * Sem ela, registrar por terceiro seria só digitar um nome — e uma batida
     * que ninguém consegue contestar é uma porta aberta.
     */
    if (!dados.fotoBase64) {
      return { erro: 'A foto do rosto é obrigatória para registrar por outra pessoa.' }
    }

    /*
     * QUEM ESCOLHE A ETAPA É O OPERADOR, não o servidor — trazido do site em
     * 11/09/2026. Existia uma trava aqui ("grava só a pendente") pensada
     * contra erro; na operação real virou o problema oposto: sem QR na hora,
     * pode faltar entrada, meio OU saída, e a "próxima" calculada nem sempre
     * é a que aconteceu de verdade. Por isso, ao contrário do scanner
     * (`registrarPorQr`), aqui NÃO se exige o meio antes da saída: é uma
     * correção deliberada e auditada, não uma leitura no portão.
     *
     * Escolher uma etapa que já tem registro sobrescreve o horário — é
     * correção, não duplicata.
     */
    this.etapasDe(pessoa.id).set(dados.tipo, new Date(this.agora()).toISOString())

    // Entrada/saída ganham ação própria; "meio" reaproveita CORRECAO_PONTO —
    // mesma régua da API de verdade.
    const ACAO_POR_ETAPA: Record<TipoBatida, string> = {
      entrada: 'REGISTRO_ENTRADA_ASSISTIDA', fim: 'REGISTRO_SAIDA_ASSISTIDA', meio: 'CORRECAO_PONTO',
    }
    this.registrarAuditoria({
      acao: ACAO_POR_ETAPA[dados.tipo], campoAlterado: `${ROTULO_DA_ETAPA[dados.tipo]} de ${pessoa.nome}`,
      valorNovo: new Date(this.agora()).toISOString(),
    })
    return { nome: pessoa.nome, etapa: ROTULO_DA_ETAPA[dados.tipo] }
  }

  /** As etapas que aquela pessoa já registrou hoje, com o horário de cada uma. */
  private etapasDe(id: string): Map<TipoBatida, string> {
    let feitas = this.batidasDaEquipe.get(id)
    if (!feitas) {
      feitas = new Map()
      this.batidasDaEquipe.set(id, feitas)
    }
    return feitas
  }

  /** O log de entrada/saída daquela pessoa, para `inferirMomentoDoScanner`. */
  private registrosDe(id: string): RegistroParaInferencia[] {
    let lista = this.logDeRegistros.get(id)
    if (!lista) {
      lista = []
      this.logDeRegistros.set(id, lista)
    }
    return lista
  }

  /** A próxima etapa na ordem do dia. Quem decide é aqui, nunca a tela. */
  private pendenteDe(id: string): TipoBatida | null {
    const feitas = this.etapasDe(id)
    return ORDEM_DAS_ETAPAS.find(e => !feitas.has(e)) ?? null
  }

  private candidato(p: (typeof EQUIPE_DE_MENTIRA)[number], aproximado = false): CandidatoLocalizado {
    return {
      participacaoId: p.id,
      nome: p.nome,
      cpf: p.cpf,
      funcao: p.funcao,
      setorNome: p.setor,
      eventoNome: EVENTO.nome,
      ...(aproximado ? { cpfAproximado: true } : {}),
    }
  }

  private ficha(p: (typeof EQUIPE_DE_MENTIRA)[number]): FichaLocalizada {
    const feitas = this.etapasDe(p.id)
    const pendente = this.pendenteDe(p.id)

    // A última = a mais recente no relógio, não a última da ordem das etapas:
    // alguém pode ter batido o meio sem ter batido a entrada (registro
    // assistido de correção).
    const ultima = [...feitas.entries()].sort((a, b) => b[1].localeCompare(a[1]))[0] ?? null

    return {
      participacaoId: p.id,
      nome: p.nome,
      cpf: p.cpf,
      funcao: p.funcao,
      fotoUrl: null,
      ativo: p.ativo,
      setorNome: p.setor,
      eventoNome: EVENTO.nome,
      supervisorNome: p.supervisor,
      ultimaBatida: ultima ? { rotulo: ROTULO_DA_ETAPA[ultima[0]], quandoISO: ultima[1] } : null,
      etapas: ORDEM_DAS_ETAPAS.map(tipo => ({
        tipo, rotulo: ROTULO_DA_ETAPA[tipo], quandoISO: feitas.get(tipo) ?? null,
      })),
      proximaPendente: pendente ? { tipo: pendente, rotulo: ROTULO_DA_ETAPA[pendente] } : null,
    }
  }

  /** Recusa como o servidor recusaria: quem não pode, não passa. */
  private exigirPoder(poder: (papel?: string) => boolean, oQue: string): void {
    if (!poder(this.sessao?.papel)) {
      throw new Error(`Você não tem permissão para ${oQue}.`)
    }
  }

  /**
   * Mutações do financeiro/situação da equipe — mesma régua da API de
   * verdade (`podeMexerNaEquipe`, em `rotas/ficha-da-pessoa.ts`): supervisor
   * do próprio setor, ou quem gerencia eventos da organização. Diferente de
   * `moverDeSetor`, que fica só em `podeGerenciarEventos` de propósito (ver
   * "Limitações conhecidas" no CLAUDE.md).
   */
  private podeMexerNaEquipe = (papel?: string) => podeGerenciarEventos(papel) || papel === 'supervisor'

  // ── Atividades do evento ──────────────────────────────────────────────────

  async eventosParaAcompanhar(): Promise<EventoEscaneavel[]> {
    await this.rede()
    this.exigirSessao()
    this.exigirPoder(podeAcompanhar, 'acompanhar o evento')

    // O supervisor acompanha só o evento do próprio setor.
    const meus = this.sessao!.papel === 'supervisor'
      ? EVENTOS_DO_PAINEL.filter(e => e.eventoId === 'ev-2')
      : EVENTOS_DO_PAINEL
    return meus.map(e => ({ eventoId: e.eventoId, nome: e.nome }))
  }

  async atividades(
    eventoId: string,
    opcoes: { visao?: VisaoDeAtividade; dia?: string } = {},
  ): Promise<AtividadesDoEvento> {
    await this.rede()
    this.exigirSessao()
    this.exigirPoder(podeAcompanhar, 'acompanhar o evento')

    const evento = EVENTOS_DO_PAINEL.find(e => e.eventoId === eventoId)
      ?? EVENTOS_DO_PAINEL[0]!
    const visao: VisaoDeAtividade =
      opcoes.visao && opcoes.visao in VISOES_DE_ATIVIDADE ? opcoes.visao : 'entrada'

    // ─── O dia ─────────────────────────────────────────────────────────────
    // Mesma régua de fallback do site: o dia pedido se existir, senão hoje se
    // for dia de operação, senão o último dia já passado, senão o primeiro.
    const dias = DIAS_DE_ATIVIDADE_DE_MENTIRA[evento.eventoId] ?? [diaBRT(evento.dataInicio)]
    const hoje = diaBRT(new Date(this.agora()))
    const diaEscolhido =
      (opcoes.dia && dias.includes(opcoes.dia) ? opcoes.dia : null)
      ?? (dias.includes(hoje) ? hoje : null)
      ?? [...dias].reverse().find(d => d <= hoje)
      ?? dias[0]
      ?? hoje

    /*
     * O log junta o que já estava gravado com o que foi registrado nesta
     * sessão — pelo scanner ou pela tela de registrar ponto. Sem isso, quem
     * acabou de bater uma entrada não a veria aparecer aqui, e concluiria que
     * ela não gravou. O que vem desta sessão é sempre de HOJE — é quando a
     * batida de verdade aconteceu.
     */
    const desteUso: typeof REGISTROS_DE_MENTIRA = []
    if (diaEscolhido === hoje) {
      for (const [id, etapas] of this.batidasDaEquipe) {
        const pessoa = EQUIPE_DE_MENTIRA.find(p => p.id === id)
        if (!pessoa) continue
        for (const [etapa, em] of etapas) {
          desteUso.push({
            id: `${id}-${etapa}`,
            nome: pessoa.nome,
            cpf: pessoa.cpf,
            setor: pessoa.setor,
            etapa,
            em,
            manual: false,
          })
        }
      }
    }

    const registrosDoDia = [...desteUso, ...REGISTROS_DE_MENTIRA]
      .filter(r => diaBRT(r.em) === diaEscolhido)

    const porPessoa = new Map<string, Partial<Record<TipoBatida, { em: string; manual: boolean }>>>()
    for (const r of registrosDoDia) {
      const atual = porPessoa.get(r.cpf) ?? {}
      atual[r.etapa] = { em: r.em, manual: r.manual }
      porPessoa.set(r.cpf, atual)
    }

    // O supervisor só acompanha a própria equipe — mesma régua de `eventosParaAcompanhar`.
    const equipe = this.sessao!.papel === 'supervisor'
      ? EQUIPE_DE_MENTIRA.filter(p => p.ativo && p.supervisor === 'Carlos Silva')
      : EQUIPE_DE_MENTIRA.filter(p => p.ativo)

    const linhasDe = (v: VisaoDeAtividade): LinhaPresenca[] => {
      if (v === 'presentes') {
        return equipe.flatMap(p => {
          const feito = porPessoa.get(p.cpf) ?? {}
          return feito.entrada && !feito.fim
            ? [{ id: p.id, nome: p.nome, cpf: p.cpf, setor: p.setor, em: feito.entrada.em, manual: feito.entrada.manual }]
            : []
        })
      }
      if (v === 'entrada' || v === 'meio' || v === 'fim') {
        return equipe.flatMap(p => {
          const r = (porPessoa.get(p.cpf) ?? {})[v]
          return r ? [{ id: p.id, nome: p.nome, cpf: p.cpf, setor: p.setor, em: r.em, manual: r.manual }] : []
        })
      }
      /*
       * As três pendências — "ainda não chegaram / não fizeram o meio / não
       * fizeram a saída". O site só cobra depois que o horário esperado já
       * passou (`pendenciasDoDia`, ligado à janela do evento); aqui, sem uma
       * janela por dia para cada evento de demonstração, a régua fica mais
       * simples: falta a etapa, e — pra meio/fim — a pessoa já entrou.
       */
      const etapa: TipoBatida = v === 'faltam' ? 'entrada' : v === 'sem_meio' ? 'meio' : 'fim'
      return equipe.flatMap(p => {
        const feito = porPessoa.get(p.cpf) ?? {}
        if (etapa !== 'entrada' && !feito.entrada) return []
        if (feito[etapa]) return []
        return [{ id: p.id, nome: p.nome, cpf: p.cpf, setor: p.setor, em: null, manual: false }]
      })
    }

    const linhas = linhasDe(visao)
      .sort((a, b) => (a.em && b.em ? a.em.localeCompare(b.em) : a.nome.localeCompare(b.nome, 'pt-BR')))

    const numeros = {
      presentes: linhasDe('presentes').length,
      entradas: linhasDe('entrada').length,
      saidas: linhasDe('fim').length,
      pendencias: linhasDe('faltam').length + linhasDe('sem_meio').length + linhasDe('sem_saida').length,
    }

    const colunaHora = visao === 'presentes'
      ? 'Entrou às'
      : visao === 'faltam' ? '' : visao === 'sem_meio' || visao === 'sem_saida' ? 'Entrou às' : 'Registrou às'

    return {
      eventoId: evento.eventoId,
      eventoNome: evento.nome,
      dias,
      diaEscolhido,
      hoje,
      numeros,
      linhas,
      colunaHora,
    }
  }

  /**
   * Cria um evento novo.
   *
   * O master não pertence a organização nenhuma — precisa DIZER de quem é o
   * evento, senão ele nasceria órfão: invisível para todo admin, e com
   * supervisores criados sem vínculo. O admin não escolhe: o evento dele é
   * sempre da própria organização, por construção, e não por confiar que ele
   * vai escolher certo.
   */
  async criarEvento(dados: DadosDeNovoEvento): Promise<{ eventoId?: string; erro?: string }> {
    await this.rede()
    this.exigirSessao()
    this.exigirPoder(podeGerenciarEventos, 'criar eventos')

    const nome = (dados.nome ?? '').trim()
    if (!nome) return { erro: 'O nome do evento é obrigatório.' }
    if (!dados.dataInicio || !dados.dataFim) {
      return { erro: 'Data de início e data de fim são obrigatórias.' }
    }

    const papel = this.sessao!.papel
    let organizacaoId: string

    if (ehMaster(papel)) {
      const escolhida = (dados.organizacaoId ?? '').trim()
      if (!escolhida) return { erro: 'Escolha a organização dona deste evento.' }
      const org = ORGANIZACOES_DE_MENTIRA.find(o => o.organizacaoId === escolhida)
      if (!org) return { erro: 'Organização não encontrada.' }
      if (!org.ativa) return { erro: 'Esta organização está suspensa. Reative-a antes de criar eventos.' }
      organizacaoId = escolhida
    } else {
      // Sempre a própria — o campo nem chega a existir na tela do admin.
      organizacaoId = ORGANIZACAO_DO_ADMIN_DE_MENTIRA
      const org = ORGANIZACOES_DE_MENTIRA.find(o => o.organizacaoId === organizacaoId)
      if (org && !org.ativa) {
        return { erro: 'Sua organização está suspensa. Fale com o administrador da plataforma.' }
      }
      if (org && org.eventos >= org.limiteEventos) {
        return {
          erro: `Limite de eventos atingido (${org.limiteEventos}). `
            + 'Fale com o administrador da plataforma para liberar mais.',
        }
      }
    }

    const eventoId = `ev-${EVENTOS_DO_PAINEL.length + 1}`
    EVENTOS_DO_PAINEL.push({
      eventoId,
      nome,
      dataInicio: dados.dataInicio,
      local: dados.local?.trim() || null,
      setores: 0,
      equipe: 0,
      presentes: 0,
      aoVivo: true,
      organizacaoId,
    })

    const org = ORGANIZACOES_DE_MENTIRA.find(o => o.organizacaoId === organizacaoId)
    if (org) org.eventos += 1

    // Sem isto, "Editar evento" logo depois de criar bateria em "não
    // encontramos este evento": `configuracaoDoEvento` lê os dois lugares —
    // o card do painel E esta configuração — e um evento novo só tinha o
    // primeiro.
    CONFIGURACAO_DE_MENTIRA[eventoId] = {
      descricao: dados.descricao?.trim() || null,
      // Nasce travado por horário, igual ao sistema web: batida livre é
      // coisa para o produtor ligar deliberadamente depois, na Edição — não
      // um padrão silencioso que ninguém escolheu.
      batidaLivre: false,
      // Mesmo raciocínio: auto-atendimento é opt-in, na Edição.
      checkinAutonomo: false,
      janelaEntradaInicio: dados.janelaEntradaInicio ?? null,
      janelaEntradaFim: dados.janelaEntradaFim ?? null,
      janelaFimInicio: dados.janelaFimInicio ?? null,
      janelaFimFim: dados.janelaFimFim ?? null,
      preparacao: [],
      comBatidas: [],
      // Todo dia nasce pedindo o meio — o padrão da coluna no site.
      diasSemMeio: [],
    }
    // Mesmo motivo: sem isto, ligar a portaria de um evento recém-criado
    // bateria em "não encontramos este evento" — ela nasce fechada e sem QR,
    // que é o próprio estado inicial de um evento no sistema web.
    PORTARIA_DE_MENTIRA[eventoId] = { aberta: false, token: null, cadastrados: 0 }

    return { eventoId }
  }

  // ── O evento por dentro ───────────────────────────────────────────────────

  async evento(eventoId: string, dia?: string): Promise<EventoDetalhado> {
    await this.rede()
    this.exigirSessao()
    this.exigirPoder(podeGerenciarEventos, 'abrir a configuração do evento')

    const base = EVENTOS_DO_PAINEL.find(e => e.eventoId === eventoId)
    if (!base) throw new Error('Não encontramos este evento.')

    const setores = (SETORES_DE_MENTIRA[eventoId] ?? []).map(s => this.paraSetor(s))
    const totalPessoas = setores.reduce((a, s) => a + s.pessoas, 0)

    /*
     * O servidor de mentira não guarda batida por DIA (`batidasDaEquipe` é um
     * total só, sem data) — os números abaixo não mudam ao trocar de dia,
     * diferente da API de verdade. Suficiente pra navegar a tela; a conta
     * certa é testada contra `RepositorioEmMemoria`, não aqui.
     */
    const diasDaOperacao = eventoId === 'ev-1' ? DIAS.map(d => d.data) : [base.dataInicio]
    const diaEscolhido = dia && diasDaOperacao.includes(dia) ? dia : diasDaOperacao[diasDaOperacao.length - 1]!

    const porEtapa = (etapa: TipoBatida) =>
      [...this.batidasDaEquipe.values()].filter(e => e.has(etapa)).length

    const entraram = porEtapa('entrada')
    const sairam = porEtapa('fim')
    const meio = porEtapa('meio')
    const pct = (v: number) => (totalPessoas > 0 ? Math.round((v / totalPessoas) * 100) : 0)

    return {
      eventoId: base.eventoId,
      nome: base.nome,
      ativo: base.aoVivo,
      local: base.local,
      dataInicio: base.dataInicio,
      dataFim: null,
      diasDePreparacao: eventoId === 'ev-1' ? DIAS.filter(d => d.tipo === 'preparacao').length : 0,
      diasDaOperacao,
      diaEscolhido,
      indicadores: [
        { chave: 'funcionarios_do_evento', rotulo: 'Funcionários do evento', valor: totalPessoas, tom: 'acento' },
        { chave: 'presentes_no_momento', rotulo: 'Presentes no momento', valor: Math.max(0, entraram - sairam), tom: 'sucesso' },
        {
          chave: 'entradas_hoje', rotulo: 'Entradas hoje', valor: `${entraram}/${totalPessoas}`,
          sub: `${pct(entraram)}% da equipe`, tom: 'acento',
        },
        {
          chave: 'batida_do_meio_hoje', rotulo: 'Batida do meio hoje', valor: `${meio}/${totalPessoas}`,
          sub: `${pct(meio)}% da equipe`, tom: 'info',
        },
        {
          chave: 'saidas_hoje', rotulo: 'Saídas hoje', valor: `${sairam}/${totalPessoas}`,
          sub: `${pct(sairam)}% da equipe`, tom: 'aviso',
        },
      ],
      portaria: this.portariaDe(eventoId),
      cadastroSuspenso: CADASTRO_SUSPENSO_DE_MENTIRA.has(eventoId),
      setores,
      totalPessoas,
    }
  }

  async alternarCadastroPorLink(eventoId: string, suspenso: boolean): Promise<{ erro?: string }> {
    await this.rede()
    this.exigirSessao()
    this.exigirPoder(podeGerenciarEventos, 'suspender o cadastro por link')

    const base = EVENTOS_DO_PAINEL.find(e => e.eventoId === eventoId)
    if (!base) return { erro: 'Não encontramos este evento.' }

    if (suspenso) CADASTRO_SUSPENSO_DE_MENTIRA.add(eventoId)
    else CADASTRO_SUSPENSO_DE_MENTIRA.delete(eventoId)
    return {}
  }

  async criarLinkCadastroIndividual(
    eventoId: string, setorId: string,
  ): Promise<{ resultado?: LinkCadastroIndividual; erro?: string }> {
    await this.rede()
    this.exigirSessao()
    if (!ehMaster(this.sessao?.papel)) {
      throw new Error('Só o acesso master pode reabrir um cadastro individual.')
    }

    const base = EVENTOS_DO_PAINEL.find(e => e.eventoId === eventoId)
    if (!base) throw new Error('Não encontramos este evento.')

    const setor = (SETORES_DE_MENTIRA[eventoId] ?? []).find(s => s.setorId === setorId)
    if (!setor) return { erro: 'Setor não encontrado neste evento.' }

    const token = Math.random().toString(36).slice(2)
    const expiraEm = new Date(this.agora() + 48 * 60 * 60 * 1000).toISOString()

    this.registrarAuditoria({
      acao: 'REABERTURA_CADASTRO_INDIVIDUAL', campoAlterado: `Cadastro individual — ${setor.nome}`,
      valorNovo: 'Reaberto por 48h', eventoId,
    })

    return {
      resultado: {
        link: `${ENDERECO_DO_FORMULARIO}/${setor.token}?individual=${encodeURIComponent(token)}`,
        expiraEm,
        setorNome: setor.nome,
        eventoNome: base.nome,
      },
    }
  }

  async alternarPortaria(eventoId: string, aberta: boolean) {
    await this.rede()
    this.exigirSessao()
    this.exigirPoder(podeGerenciarEventos, 'mexer na portaria')

    const p = PORTARIA_DE_MENTIRA[eventoId]
    if (!p) return { erro: 'Não encontramos este evento.' }

    p.aberta = aberta
    /*
     * Abrir pela primeira vez gera o endereço; fechar NÃO o apaga.
     *
     * Apagar faria os cartazes já impressos morrerem a cada fechamento — e
     * fechar é operação de rotina (fecha-se a portaria quando a fila acaba).
     * Quem quer matar os cartazes usa "gerar um novo", que avisa antes.
     */
    if (aberta && !p.token) p.token = `tok-${Math.random().toString(16).slice(2, 10)}`

    return { portaria: this.portariaDe(eventoId) }
  }

  async trocarTokenDaPortaria(eventoId: string) {
    await this.rede()
    this.exigirSessao()
    this.exigirPoder(podeGerenciarEventos, 'trocar o QR da portaria')

    const p = PORTARIA_DE_MENTIRA[eventoId]
    if (!p) return { erro: 'Não encontramos este evento.' }

    p.token = `tok-${Math.random().toString(16).slice(2, 10)}`
    return { portaria: this.portariaDe(eventoId) }
  }

  async criarSetor(
    eventoId: string,
    dados: {
      nome: string
      valorPorPessoa?: number | null
      supervisor: { nome: string; cpf: string; telefone: string }
      exigeMeio?: boolean
    },
  ) {
    await this.rede()
    this.exigirSessao()
    this.exigirPoder(podeGerenciarEventos, 'criar setor')

    const nome = (dados.nome ?? '').trim()
    if (nome.length < 2) return { erro: 'Dê um nome ao setor.' }

    const lista = SETORES_DE_MENTIRA[eventoId]
    if (!lista) return { erro: 'Não encontramos este evento.' }

    // Dois setores com o mesmo nome fariam a equipe escolher errado no cartaz
    // da portaria, onde só o nome aparece.
    if (lista.some(s => semAcento(s.nome) === semAcento(nome))) {
      return { erro: `Já existe um setor chamado "${nome}" neste evento.` }
    }

    const supNome = (dados.supervisor?.nome ?? '').trim()
    const supCpf = (dados.supervisor?.cpf ?? '').replace(/\D/g, '')
    const supTelefone = (dados.supervisor?.telefone ?? '').replace(/\D/g, '')
    if (supNome.length < 3) return { erro: 'Digite o nome completo do supervisor.' }
    if (supCpf.length !== 11) return { erro: 'O CPF do supervisor precisa ter 11 dígitos.' }
    if (supTelefone.length < 10) return { erro: 'Digite o WhatsApp do supervisor, com DDD.' }

    /*
     * Se a pessoa já for supervisora aqui, este setor entra nos dela — sem
     * criar login novo. É o mesmo CPF que decide, porque é ele que abre a
     * sessão: dois acessos para a mesma pessoa a deixariam sem saber qual
     * usar no WhatsApp.
     */
    const existente = ACESSOS_DE_MENTIRA.find(
      a => a.papel === 'supervisor' && a.identificador.replace(/\D/g, '') === supCpf,
    )
    const supervisor = existente ?? {
      id: `u-${ACESSOS_DE_MENTIRA.length + 1}`,
      nome: supNome,
      identificador: formatCpf(supCpf),
      papel: 'supervisor' as const,
      ativo: true,
      setorNome: nome,
      telefone: supTelefone,
      eventos: 1,
      criadoEm: new Date(this.agora()).toISOString(),
      expiraEm: null,
      souEu: false,
      permissoesUsuario: {},
    }
    if (!existente) ACESSOS_DE_MENTIRA.push({ ...supervisor })

    const novo = {
      setorId: `s-${Math.random().toString(16).slice(2, 8)}`,
      nome,
      pessoas: 0,
      valorPorPessoa: dados.valorPorPessoa ?? null,
      token: `f-${Math.random().toString(16).slice(2, 8)}`,
      supervisores: [{ id: supervisor.id, nome: supervisor.nome, ativo: supervisor.ativo, telefone: supTelefone }],
      exigeMeio: dados.exigeMeio === true,
      linkAtivo: true,
    }
    lista.push(novo)
    return { setor: this.paraSetor(novo) }
  }

  private acharSetor(setorId: string): (typeof SETORES_DE_MENTIRA)[string][number] | null {
    for (const setores of Object.values(SETORES_DE_MENTIRA)) {
      const setor = setores.find(x => x.setorId === setorId)
      if (setor) return setor
    }
    return null
  }

  async editarSetor(
    setorId: string,
    dados: { nome: string; valorPorPessoa?: number | null; exigeMeio?: boolean },
  ): Promise<{ setor?: SetorDetalhado; erro?: string }> {
    await this.rede()
    this.exigirSessao()
    this.exigirPoder(podeGerenciarEventos, 'editar setor')

    const nome = (dados.nome ?? '').trim()
    if (nome.length < 2) return { erro: 'Dê um nome ao setor.' }

    const setor = this.acharSetor(setorId)
    if (!setor) return { erro: 'Não encontramos este setor.' }

    setor.nome = nome
    setor.valorPorPessoa = dados.valorPorPessoa ?? null
    setor.exigeMeio = dados.exigeMeio === true
    return { setor: this.paraSetor(setor) }
  }

  async alternarLinkDoSetor(setorId: string, ativo: boolean): Promise<{ erro?: string }> {
    await this.rede()
    this.exigirSessao()
    this.exigirPoder(podeGerenciarEventos, 'ligar/desligar o link deste setor')

    const setor = this.acharSetor(setorId)
    if (!setor) return { erro: 'Não encontramos este setor.' }
    setor.linkAtivo = ativo
    return {}
  }

  async excluirSetor(setorId: string): Promise<{ erro?: string }> {
    await this.rede()
    this.exigirSessao()
    this.exigirPoder(podeGerenciarEventos, 'excluir setor')
    if (!podeExcluir(this.quemEntrou.papel)) {
      return { erro: 'Apenas o master pode excluir. Você pode desativar, que é reversível.' }
    }

    const setor = this.acharSetor(setorId)
    if (!setor) return { erro: 'Não encontramos este setor.' }
    if (setor.supervisores.length > 0) {
      return { erro: 'Este setor tem supervisores vinculados. Exclua ou realoque os supervisores antes de excluir o setor.' }
    }

    for (const lista of Object.values(SETORES_DE_MENTIRA)) {
      const indice = lista.findIndex(x => x.setorId === setorId)
      if (indice !== -1) { lista.splice(indice, 1); break }
    }
    return {}
  }

  /**
   * Adiciona um supervisor a um setor que já existe — mesma regra de CPF do
   * `criarSetor` (reaproveita login se a pessoa já supervisiona algo em
   * outro lugar), sem criar setor nenhum.
   */
  async adicionarSupervisor(
    setorId: string, dados: { nome: string; cpf: string; telefone: string },
  ): Promise<{ erro?: string }> {
    await this.rede()
    this.exigirSessao()
    this.exigirPoder(podeGerenciarEventos, 'adicionar supervisor')

    const setor = this.acharSetor(setorId)
    if (!setor) return { erro: 'Não encontramos este setor.' }

    const nome = (dados.nome ?? '').trim()
    const cpf = (dados.cpf ?? '').replace(/\D/g, '')
    const telefone = (dados.telefone ?? '').replace(/\D/g, '')
    if (nome.length < 3) return { erro: 'Digite o nome completo do supervisor.' }
    if (cpf.length !== 11) return { erro: 'O CPF do supervisor precisa ter 11 dígitos.' }
    if (telefone.length < 10) return { erro: 'Digite o WhatsApp do supervisor, com DDD.' }

    const existente = ACESSOS_DE_MENTIRA.find(
      a => a.papel === 'supervisor' && a.identificador.replace(/\D/g, '') === cpf,
    )
    if (existente) {
      existente.setorNome = setor.nome
      if (!setor.supervisores.some(s => s.id === existente.id)) {
        setor.supervisores.push({ id: existente.id, nome: existente.nome, ativo: existente.ativo, telefone })
      }
      // Sem `eventoId` aqui — `acharSetor` não devolve de qual evento é o
      // setor, e o fake não tem uma busca reversa pronta pra isto.
      this.registrarAuditoria({
        acao: 'ALTERACAO_SUPERVISOR', campoAlterado: `Supervisor do setor ${setor.nome}`,
        valorNovo: `${nome} — CPF ${formatCpf(cpf)} (já era supervisor, ganhou mais este setor)`,
      })
      return {}
    }

    const novo = {
      id: `u-${ACESSOS_DE_MENTIRA.length + 1}`,
      nome,
      identificador: formatCpf(cpf),
      papel: 'supervisor' as const,
      ativo: true,
      setorNome: setor.nome,
      telefone,
      eventos: 1,
      criadoEm: new Date(this.agora()).toISOString(),
      expiraEm: null,
      souEu: false,
      permissoesUsuario: {},
    }
    ACESSOS_DE_MENTIRA.push(novo)
    setor.supervisores.push({ id: novo.id, nome, ativo: true, telefone })
    this.registrarAuditoria({
      acao: 'ALTERACAO_SUPERVISOR', campoAlterado: `Supervisor do setor ${setor.nome}`,
      valorNovo: `${nome} — CPF ${formatCpf(cpf)} (acesso novo)`,
    })
    return {}
  }

  /**
   * O que a tela de "Batida do meio" mostra: os setores do evento e os dias
   * da operação, cada um com o próprio interruptor. Trazido do site em
   * 11/09/2026.
   */
  async configuracaoDoMeio(eventoId: string): Promise<ConfiguracaoDoMeio> {
    await this.rede()
    this.exigirSessao()
    this.exigirPoder(podeGerenciarEventos, 'configurar a batida do meio')

    const setores = SETORES_DE_MENTIRA[eventoId]
    const base = EVENTOS_DO_PAINEL.find(e => e.eventoId === eventoId)
    const cfg = CONFIGURACAO_DE_MENTIRA[eventoId]
    if (!setores || !base || !cfg) throw new Error('Não encontramos este evento.')

    const diaPrincipal = diaBRT(base.dataInicio)
    const dias = [
      { data: diaPrincipal, tipo: 'principal' as const },
      ...cfg.preparacao.map(d => ({ data: d, tipo: 'preparacao' as const })),
    ].sort((a, b) => a.data.localeCompare(b.data))
    const semMeio = new Set(cfg.diasSemMeio)

    return {
      setores: setores.map(s => ({ setorId: s.setorId, nome: s.nome, exigeMeio: s.exigeMeio })),
      dias: dias.map(d => ({ ...d, exigeMeio: !semMeio.has(d.data) })),
    }
  }

  /**
   * Liga/desliga a batida do meio: quais SETORES pedem, e em quais DIAS.
   *
   * Grava explicitamente o que foi DESMARCADO, e não só o marcado — sem
   * isso, desligar não desligaria nada, só deixaria de ligar de novo.
   */
  async salvarConfiguracaoDoMeio(
    eventoId: string, setoresLigados: string[], diasLigados: string[],
  ) {
    await this.rede()
    this.exigirSessao()
    this.exigirPoder(podeGerenciarEventos, 'configurar a batida do meio')

    const setores = SETORES_DE_MENTIRA[eventoId]
    const base = EVENTOS_DO_PAINEL.find(e => e.eventoId === eventoId)
    const cfg = CONFIGURACAO_DE_MENTIRA[eventoId]
    if (!setores || !base || !cfg) return { erro: 'Não encontramos este evento.' }

    const ligados = new Set(setoresLigados)
    for (const s of setores) s.exigeMeio = ligados.has(s.setorId)

    const diaPrincipal = diaBRT(base.dataInicio)
    const todasAsDatas = [diaPrincipal, ...cfg.preparacao]
    const diasLigadosSet = new Set(diasLigados)
    cfg.diasSemMeio = todasAsDatas.filter(d => !diasLigadosSet.has(d))

    return { setores: setoresLigados.length, dias: diasLigados.length }
  }

  async configuracaoDoEvento(eventoId: string): Promise<ConfiguracaoDoEvento> {
    await this.rede()
    this.exigirSessao()
    this.exigirPoder(podeGerenciarEventos, 'editar o evento')

    const base = EVENTOS_DO_PAINEL.find(e => e.eventoId === eventoId)
    const cfg = CONFIGURACAO_DE_MENTIRA[eventoId]
    if (!base || !cfg) throw new Error('Não encontramos este evento.')

    const diaPrincipal = diaBRT(base.dataInicio)
    const comBatidas = new Set(cfg.comBatidas)

    const dias = [
      { data: diaPrincipal, tipo: 'principal' as const, temBatidas: true },
      ...cfg.preparacao.map(d => ({
        data: d,
        tipo: 'preparacao' as const,
        temBatidas: comBatidas.has(d),
      })),
    ].sort((a, b) => a.data.localeCompare(b.data))

    return {
      eventoId,
      nome: base.nome,
      descricao: cfg.descricao,
      local: base.local,
      dataInicio: base.dataInicio,
      dataFim: eventoId === 'ev-1' ? '2026-09-06T08:00:00-03:00' : null,
      batidaLivre: cfg.batidaLivre,
      checkinAutonomo: cfg.checkinAutonomo,
      janelaEntradaInicio: cfg.janelaEntradaInicio,
      janelaEntradaFim: cfg.janelaEntradaFim,
      janelaFimInicio: cfg.janelaFimInicio,
      janelaFimFim: cfg.janelaFimFim,
      diaPrincipal,
      dias,
    }
  }

  async salvarEvento(eventoId: string, dados: EdicaoDoEvento) {
    await this.rede()
    this.exigirSessao()
    this.exigirPoder(podeGerenciarEventos, 'editar o evento')

    const base = EVENTOS_DO_PAINEL.find(e => e.eventoId === eventoId)
    const cfg = CONFIGURACAO_DE_MENTIRA[eventoId]
    if (!base || !cfg) return { erro: 'Não encontramos este evento.' }

    if (!dados.nome?.trim()) return { erro: 'O evento precisa de um nome.' }
    if (!dados.dataInicio) return { erro: 'Defina quando o evento começa.' }

    /*
     * O servidor confere os horários DE NOVO.
     *
     * A tela já conferiu, e vai continuar conferindo — mas a tela é
     * conveniência e o servidor é a garantia. Uma configuração impossível
     * gravada aqui só apareceria na madrugada do evento, com mil pessoas
     * tentando bater a saída ao mesmo tempo. Foi assim que a saída do Kleber
     * Andrade ficou marcada para o dia errado.
     */
    const problemas = conferirHorariosDoEvento({
      data_inicio: dados.dataInicio,
      data_fim: dados.dataFim,
      janela_entrada_inicio: dados.janelaEntradaInicio,
      janela_entrada_fim: dados.janelaEntradaFim,
      janela_fim_inicio: dados.janelaFimInicio,
      janela_fim_fim: dados.janelaFimFim,
    })
    const bloqueio = problemas.find(p => p.bloqueia)
    if (bloqueio) return { erro: bloqueio.mensagem }

    base.nome = dados.nome.trim()
    base.local = dados.local
    base.dataInicio = dados.dataInicio
    cfg.descricao = dados.descricao
    cfg.batidaLivre = dados.batidaLivre
    cfg.checkinAutonomo = dados.checkinAutonomo
    cfg.janelaEntradaInicio = dados.janelaEntradaInicio
    cfg.janelaEntradaFim = dados.janelaEntradaFim
    cfg.janelaFimInicio = dados.janelaFimInicio
    cfg.janelaFimFim = dados.janelaFimFim
    return {}
  }

  async salvarDiasDeTrabalho(eventoId: string, dias: string[]) {
    await this.rede()
    this.exigirSessao()
    this.exigirPoder(podeGerenciarEventos, 'marcar os dias de trabalho')

    const base = EVENTOS_DO_PAINEL.find(e => e.eventoId === eventoId)
    const cfg = CONFIGURACAO_DE_MENTIRA[eventoId]
    if (!base || !cfg) return { erro: 'Não encontramos este evento.' }

    const diaPrincipal = diaBRT(base.dataInicio)
    const pedidos = new Set(dias.filter(d => d !== diaPrincipal))
    const requisitados = pedidos.size

    /*
     * Dia com batida é PRESERVADO mesmo vindo desmarcado.
     *
     * Apagá-lo tiraria do sistema presenças que já aconteceram — e é delas que
     * sai o pagamento. O servidor não obedece cegamente aqui, e a resposta diz
     * quantos foram mantidos, para a tela poder explicar em vez de parecer que
     * o botão não funcionou.
     */
    const preservados = cfg.preparacao.filter(d => !pedidos.has(d) && cfg.comBatidas.includes(d))
    for (const d of preservados) pedidos.add(d)

    cfg.preparacao = [...pedidos].sort()
    // "dias" é só o que foi PEDIDO, nunca a contagem final (que já inclui os
    // preservados) — mesma régua da API real, ver `configurar-evento.ts`.
    const resultado: ResultadoDosDias = {
      dias: requisitados,
      preservados: preservados.length,
    }
    return { resultado }
  }

  private portariaDe(eventoId: string): Portaria {
    const p = PORTARIA_DE_MENTIRA[eventoId] ?? { aberta: false, token: null, cadastrados: 0 }
    return {
      aberta: p.aberta,
      endereco: p.token ? `${ENDERECO_DA_PORTARIA}/${p.token}` : null,
      cadastrados: p.cadastrados,
    }
  }

  private paraSetor(s: (typeof SETORES_DE_MENTIRA)[string][number]): SetorDetalhado {
    return {
      setorId: s.setorId,
      nome: s.nome,
      pessoas: s.pessoas,
      valorPorPessoa: s.valorPorPessoa,
      linkDoFormulario: `${ENDERECO_DO_FORMULARIO}/${s.token}`,
      linkAtivo: s.linkAtivo,
      exigeMeio: s.exigeMeio,
      supervisores: s.supervisores,
    }
  }

  async equipeDoSetor(setorId: string): Promise<EquipeDoSetor> {
    await this.rede()
    this.exigirSessao()
    this.exigirPoder(podeAcompanhar, 'ver a equipe do setor')

    let achado: { eventoId: string; setor: (typeof SETORES_DE_MENTIRA)[string][number] } | null = null
    for (const [eventoId, setores] of Object.entries(SETORES_DE_MENTIRA)) {
      const setor = setores.find(x => x.setorId === setorId)
      if (setor) { achado = { eventoId, setor }; break }
    }
    if (!achado) throw new Error('Não encontramos este setor.')

    const evento = EVENTOS_DO_PAINEL.find(e => e.eventoId === achado.eventoId)!
    const pessoas = equipeDoSetorDeMentira(setorId, achado.setor.pessoas).map(p => ({
      ...p,
      ativo: this.ativacoes.get(p.participacaoId) ?? p.ativo,
      funcao: this.funcoes.get(p.participacaoId) ?? p.funcao,
      cpf: this.cpfsCorrigidos.get(p.participacaoId) ?? p.cpf,
      valorReceber: achado.setor.valorPorPessoa ?? 0,
      temContestacaoAberta: (this.contestacoes.get(p.participacaoId) ?? []).some(c => !c.resolvida),
    }))

    const contar = (campo: 'entrada' | 'meio' | 'fim') => pessoas.filter(p => p[campo]).length
    const comPendencia = pessoas.filter(
      p => p.statusEntrada === 'fechado' || p.statusMeio === 'fechado' || p.statusFim === 'fechado'
        || p.temContestacaoAberta,
    ).length
    const aReceber = pessoas.reduce((a, p) => a + p.valorReceber, 0)

    return {
      setorId,
      setorNome: achado.setor.nome,
      eventoId: achado.eventoId,
      eventoNome: evento.nome,
      indicadores: [
        { chave: 'total', rotulo: 'Total', valor: pessoas.length, tom: 'info' },
        { chave: 'pendencias', rotulo: 'Com pendências', valor: comPendencia, tom: 'aviso' },
        { chave: 'a_receber', rotulo: 'A receber (equipe)', valor: aReceber, tom: 'acento' },
      ],
      progresso: [
        { etapa: 'entrada', feitos: contar('entrada'), total: pessoas.length },
        { etapa: 'meio', feitos: contar('meio'), total: pessoas.length },
        { etapa: 'fim', feitos: contar('fim'), total: pessoas.length },
      ],
      pessoas,
    }
  }

  // ── A ficha de uma pessoa ─────────────────────────────────────────────────

  async fichaDaPessoa(participacaoId: string): Promise<FichaDaPessoa> {
    await this.rede()
    this.exigirSessao()
    this.exigirPoder(podeAcompanhar, 'abrir a ficha')

    const achado = this.acharNoSetor(participacaoId)
    if (!achado) throw new Error('Não encontramos esta pessoa.')
    const { eventoId, setor, pessoa } = achado

    const evento = EVENTOS_DO_PAINEL.find(e => e.eventoId === eventoId)!
    const cfg = CONFIGURACAO_DE_MENTIRA[eventoId]
    const diaPrincipal = diaBRT(evento.dataInicio)

    /*
     * Os dias escalados saem da configuração do evento, e não de uma lista
     * própria da pessoa: quem decide quais dias existem é o evento. Uma lista
     * separada por pessoa divergiria na primeira vez que alguém mexesse na
     * grade de dias.
     */
    const datas = [...new Set([...(cfg?.preparacao ?? []), diaPrincipal])].sort()
    const semMeio = new Set(cfg?.diasSemMeio ?? [])
    const dias: DiaDaParticipacao[] = datas.map(data => ({
      data,
      etapa: faseDoDia(data, diaPrincipal),
      cancelado: false,
      entrada: null,
      entradaAssistida: false,
      meioEsperado: null,
      meio: null,
      meioAssistido: false,
      meioAtrasoMin: null,
      saida: null,
      saidaAssistida: false,
      compareceu: false,
      horas: null,
      meioExigido: setor.exigeMeio && !semMeio.has(data),
    }))

    return {
      participacaoId,
      nome: pessoa.nome,
      cpf: this.cpfsCorrigidos.get(participacaoId) ?? pessoa.cpf,
      telefone: this.telefones.get(participacaoId) ?? pessoa.telefone,
      fotoUrl: pessoa.fotoUrl,
      empresa: pessoa.empresa,
      funcao: this.funcoes.get(participacaoId) ?? pessoa.funcao,
      eventoNome: evento.nome,
      setorId: setor.setorId,
      setorNome: setor.nome,
      ativo: this.ativacoes.get(participacaoId) ?? pessoa.ativo,
      descredenciadoEm: this.descredenciados.get(participacaoId) ?? null,
      valorReceber: this.valores.get(participacaoId) ?? pessoa.valorReceber,
      pago: this.pagamentos.has(participacaoId),
      pagoEm: this.pagamentos.get(participacaoId) ?? null,
      chavePix: pessoa.telefone,
      presencaHoje: {
        entrada: presencaDeMentira(pessoa.entrada),
        // Só o "meio" tem foto, igual na API de verdade — é a única etapa com selfie.
        meio: presencaDeMentira(pessoa.meio, true),
        fim: presencaDeMentira(pessoa.fim),
      },
      dias,
      outrosSetores: (SETORES_DE_MENTIRA[eventoId] ?? [])
        .filter(x => x.setorId !== setor.setorId)
        .map(x => ({ setorId: x.setorId, nome: x.nome })),
      podeMover: podeGerenciarEventos(this.sessao?.papel),
      podeTornarSupervisor: podeGerenciarUsuarios(this.sessao?.papel),
      podeExcluirDaEquipe: podeExcluirDaEquipe(this.sessao?.papel),
      podeCorrigirTelefone: this.podeMexerNaEquipe(this.sessao?.papel),
      podeAtivarDesativar: this.podeMexerNaEquipe(this.sessao?.papel),
      podeCorrigirCpf: ehMaster(this.sessao?.papel),
      contestacoesAbertas: (this.contestacoes.get(participacaoId) ?? [])
        .filter(c => !c.resolvida)
        .map(({ id, tipo, dataRef, motivo, criadoEm }) => ({ id, tipo, dataRef, motivo, criadoEm })),
    }
  }

  /** "Tirar da equipe" — descredencia, sem apagar nada. Reversível por `trazerDeVolta`. */
  async tirarDaEquipe(participacaoId: string): Promise<{ erro?: string }> {
    await this.rede()
    this.exigirSessao()
    this.exigirPoder(this.podeMexerNaEquipe, 'mexer na equipe')

    if (!this.acharNoSetor(participacaoId)) return { erro: 'Não encontramos esta pessoa.' }
    if (!this.descredenciados.has(participacaoId)) {
      this.descredenciados.set(participacaoId, new Date(this.agora()).toISOString())
    }
    return {}
  }

  /** Desfaz um "tirar da equipe". */
  async trazerDeVolta(participacaoId: string): Promise<{ erro?: string }> {
    await this.rede()
    this.exigirSessao()
    this.exigirPoder(this.podeMexerNaEquipe, 'mexer na equipe')

    if (!this.acharNoSetor(participacaoId)) return { erro: 'Não encontramos esta pessoa.' }
    this.descredenciados.delete(participacaoId)
    return {}
  }

  /** Exclui de vez — cadastro e batidas, sem volta. */
  async excluirDaEquipe(participacaoId: string, _motivo?: string): Promise<{ erro?: string }> {
    void _motivo
    await this.rede()
    this.exigirSessao()
    if (!podeExcluirDaEquipe(this.sessao?.papel)) {
      return { erro: 'Você não pode excluir. Use "Tirar da equipe", que preserva o histórico.' }
    }

    const achado = this.acharNoSetor(participacaoId)
    if (!achado) return { erro: 'Não encontramos esta pessoa.' }
    achado.setor.pessoas = Math.max(0, achado.setor.pessoas - 1)
    this.excluidosDeVez.add(participacaoId)
    return {}
  }

  /** Corrige o telefone vinculado a esta participação. */
  async corrigirTelefone(participacaoId: string, telefone: string, _motivo?: string): Promise<{ erro?: string }> {
    void _motivo
    await this.rede()
    this.exigirSessao()
    this.exigirPoder(this.podeMexerNaEquipe, 'mexer na equipe')

    if (!this.acharNoSetor(participacaoId)) return { erro: 'Não encontramos esta pessoa.' }
    const novo = (telefone ?? '').replace(/\D/g, '')
    if (novo.length < 10 || novo.length > 13) {
      return { erro: 'Telefone inválido. Informe com DDD — ex.: (27) 99999-9999.' }
    }
    this.telefones.set(participacaoId, novo)
    return {}
  }

  async alternarAtivacao(participacaoId: string, ativo: boolean): Promise<{ erro?: string }> {
    await this.rede()
    this.exigirSessao()
    this.exigirPoder(this.podeMexerNaEquipe, 'mexer na equipe')

    if (!this.acharNoSetor(participacaoId)) return { erro: 'Não encontramos esta pessoa.' }
    this.ativacoes.set(participacaoId, ativo)
    return {}
  }

  async corrigirFuncao(participacaoId: string, funcao: string): Promise<{ erro?: string }> {
    await this.rede()
    this.exigirSessao()
    this.exigirPoder(this.podeMexerNaEquipe, 'mexer na equipe')

    if (!this.acharNoSetor(participacaoId)) return { erro: 'Não encontramos esta pessoa.' }
    const nova = (funcao ?? '').trim().replace(/\s+/g, ' ')
    if (!nova) return { erro: 'A função não pode ficar em branco.' }
    if (nova.length > 60) return { erro: 'Função muito longa. Encurte.' }
    this.funcoes.set(participacaoId, nova)
    return {}
  }

  /**
   * Sem a checagem de "outro cadastro já usa este CPF neste evento" que a
   * API real faz — o poço de mentira já gera CPF único por pessoa, então
   * esse conflito nunca acontece aqui de propósito. A régua já é coberta a
   * fundo do lado da API real (`ficha-da-pessoa.teste.ts`).
   */
  async corrigirCpf(participacaoId: string, cpf: string): Promise<{ erro?: string }> {
    await this.rede()
    this.exigirSessao()
    if (!ehMaster(this.sessao?.papel)) return { erro: 'Só o master corrige CPF.' }

    if (!this.acharNoSetor(participacaoId)) return { erro: 'Não encontramos esta pessoa.' }
    const novo = (cpf ?? '').replace(/\D/g, '')
    if (!validarCpf(novo)) return { erro: 'CPF inválido. Confira os 11 dígitos.' }
    this.cpfsCorrigidos.set(participacaoId, novo)
    return {}
  }

  async crachaDaPessoa(participacaoId: string): Promise<{ codigo: string; etapa: string }> {
    await this.rede()
    this.exigirSessao()
    this.exigirPoder(podeAcompanhar, 'ver o crachá')

    const achado = this.acharNoSetor(participacaoId)
    if (!achado) throw new Error('Não encontramos esta pessoa.')
    const evento = EVENTOS_DO_PAINEL.find(e => e.eventoId === achado.eventoId)!

    // `faseAtualDoQR`, não `faseDoDia` — mesmo motivo do `meuQr` da API real.
    const agora = new Date(this.agora())
    const dataFim = (evento as { dataFim?: string }).dataFim ?? null
    const etapa = faseAtualDoQR(agora, evento.dataInicio, dataFim)
    const { codigo } = gerarCodigoQR(SEGREDO_DE_MENTIRA, participacaoId, etapa)
    return { codigo, etapa }
  }

  async resolverContestacao(id: string): Promise<{ erro?: string }> {
    await this.rede()
    this.exigirSessao()
    /*
     * Sem `exigirPoder` (que lança) de propósito: a API de verdade devolve
     * `{ erro }` pra permissão negada aqui — quem busca a contestação
     * primeiro (`contestacaoPorId`) já sabe o dono antes de checar
     * `podeMexerNaEquipe`, então nunca precisa de uma exceção pra isso. Ver
     * `resolverContestacao` em `apps/api/src/rotas/ficha-da-pessoa.ts`.
     */
    if (!this.podeMexerNaEquipe(this.sessao?.papel)) {
      return { erro: 'Você não tem permissão para resolver esta contestação.' }
    }

    for (const lista of this.contestacoes.values()) {
      const alvo = lista.find(c => c.id === id)
      if (alvo) { alvo.resolvida = true; return {} }
    }
    return { erro: 'Não encontramos esta contestação.' }
  }

  async moverDeSetor(participacaoId: string, setorId: string) {
    await this.rede()
    this.exigirSessao()
    this.exigirPoder(podeGerenciarEventos, 'mover de setor')

    const achado = this.acharNoSetor(participacaoId)
    if (!achado) return { erro: 'Não encontramos esta pessoa.' }
    if (achado.setor.setorId === setorId) {
      return { erro: 'Ela já está neste setor.' }
    }

    const destino = (SETORES_DE_MENTIRA[achado.eventoId] ?? []).find(x => x.setorId === setorId)
    if (!destino) return { erro: 'Setor de destino não encontrado neste evento.' }

    // A contagem dos dois setores muda junto: mover é tirar de um e pôr no
    // outro, e deixar só o destino crescer inflaria o total do evento.
    achado.setor.pessoas = Math.max(0, achado.setor.pessoas - 1)
    destino.pessoas += 1
    this.movidos.set(participacaoId, destino.setorId)
    return {}
  }

  async tornarSupervisor(participacaoId: string, telefone: string) {
    await this.rede()
    this.exigirSessao()
    this.exigirPoder(podeGerenciarUsuarios, 'criar supervisor')

    const achado = this.acharNoSetor(participacaoId)
    if (!achado) return { erro: 'Não encontramos esta pessoa.' }
    if ((telefone ?? '').replace(/\D/g, '').length < 10) {
      return { erro: 'Precisamos do telefone com DDD para mandar o convite.' }
    }

    achado.setor.supervisores.push({
      id: `u-${achado.pessoa.participacaoId}`,
      nome: achado.pessoa.nome,
      ativo: true,
      telefone: telefone.replace(/\D/g, ''),
    })
    return {}
  }

  async marcarPagamento(participacaoId: string, pago: boolean) {
    await this.rede()
    this.exigirSessao()
    this.exigirPoder(this.podeMexerNaEquipe, 'mexer no pagamento')

    if (!this.acharNoSetor(participacaoId)) return { erro: 'Não encontramos esta pessoa.' }
    // Desfazer é tão necessário quanto marcar: marcar errado acontece, e sem o
    // caminho de volta alguém corrigiria direto no banco.
    if (pago) this.pagamentos.set(participacaoId, new Date(this.agora()).toISOString())
    else this.pagamentos.delete(participacaoId)
    return {}
  }

  async salvarValorAReceber(participacaoId: string, valor: number) {
    await this.rede()
    this.exigirSessao()
    this.exigirPoder(this.podeMexerNaEquipe, 'mexer no valor')

    if (!this.acharNoSetor(participacaoId)) return { erro: 'Não encontramos esta pessoa.' }
    if (!Number.isFinite(valor) || valor < 0) return { erro: 'O valor precisa ser zero ou mais.' }

    this.valores.set(participacaoId, valor)
    return {}
  }

  /** Acha a pessoa em qualquer setor de qualquer evento — nunca quem já foi excluído de vez. */
  private acharNoSetor(participacaoId: string) {
    if (this.excluidosDeVez.has(participacaoId)) return null
    for (const [eventoId, setores] of Object.entries(SETORES_DE_MENTIRA)) {
      for (const setor of setores) {
        const equipe = equipeDoSetorDeMentira(setor.setorId, setor.pessoas)
        const pessoa = equipe.find(p => p.participacaoId === participacaoId)
        if (pessoa) return { eventoId, setor, pessoa }
      }
    }
    return null
  }

  // ── Planilhas ─────────────────────────────────────────────────────────────

  async baixarModelo(): Promise<ArquivoDePlanilha> {
    await this.rede()
    this.exigirSessao()
    this.exigirPoder(podeGerenciarEventos, 'baixar o modelo')
    return {
      nome: 'modelo-importacao.xlsx',
      url: `${ENDERECO_DE_ARQUIVOS}/modelo-importacao.xlsx`,
    }
  }

  async exportarEquipe(setorId: string, op: { dia?: string } = {}): Promise<ArquivoDePlanilha> {
    await this.rede()
    this.exigirSessao()
    this.exigirPoder(podeAcompanhar, 'exportar a equipe')

    const nome = op.dia ? `equipe-${setorId}-${op.dia}.xlsx` : `equipe-${setorId}.xlsx`
    return { nome, url: `${ENDERECO_DE_ARQUIVOS}/exportar/${setorId}${op.dia ? `?dia=${op.dia}` : ''}` }
  }

  async importarPlanilha(setorId: string, arquivo: { nome: string; base64: string }) {
    await this.rede()
    this.exigirSessao()
    this.exigirPoder(podeGerenciarEventos, 'importar planilha')

    if (!arquivo.base64) return { erro: 'O arquivo veio vazio. Escolha de novo.' }
    if (!/\.(xlsx|xls|csv)$/i.test(arquivo.nome)) {
      return { erro: 'Só aceitamos planilha: .xlsx, .xls ou .csv.' }
    }

    const lista = Object.values(SETORES_DE_MENTIRA).flat().find(x => x.setorId === setorId)
    if (!lista) return { erro: 'Não encontramos este setor.' }

    /*
     * A importação de mentira sempre deixa uma linha de fora.
     *
     * É de propósito: o caminho em que TUDO entra esconde a parte que mais
     * importa da tela — dizer o que ficou de fora e por quê. Com trinta linhas
     * e duas erradas, recusar o arquivo inteiro obrigaria a pessoa a caçar o
     * erro sem nenhuma pista.
     */
    const criados = 8
    lista.pessoas += criados

    const resultado: ResultadoDaImportacao = {
      criados,
      atualizados: 2,
      ignorados: 1,
      erros: ['Linha 7: CPF com 10 dígitos — confira se falta um número.'],
    }
    return { resultado }
  }

  // ── Acessos ───────────────────────────────────────────────────────────────

  async acessos(filtro: FiltroDeAcessos = {}): Promise<ListaDeAcessos> {
    await this.rede()
    this.exigirSessao()
    this.exigirPoder(podeGerenciarUsuarios, 'ver quem tem acesso')

    const eu = ACESSOS_DE_MENTIRA.find(a => a.nome === this.quemEntrou.nome)
    const todos: Acesso[] = ACESSOS_DE_MENTIRA
      .filter(a => this.acessosNoAlcance(a))
      .map(a => ({ ...a, souEu: a.id === eu?.id }))

    const ativos = todos.filter(a => a.ativo).length

    const busca = semAcento((filtro.busca ?? '').trim())
    const situacao = filtro.situacao ?? 'todos'

    const itens = todos.filter(a => {
      if (situacao === 'ativos' && !a.ativo) return false
      if (situacao === 'inativos' && a.ativo) return false
      if (!busca) return true
      return semAcento(a.nome).includes(busca) || semAcento(a.identificador).includes(busca)
    })

    return { itens, total: todos.length, ativos, inativos: todos.length - ativos }
  }

  async mudarSituacaoDoAcesso(id: string, ativo: boolean) {
    await this.rede()
    this.exigirSessao()
    this.exigirPoder(podeGerenciarUsuarios, 'mudar acessos')

    const alvo = ACESSOS_DE_MENTIRA.find(a => a.id === id)
    if (!alvo || !this.acessosNoAlcance(alvo)) return { erro: 'Não encontramos este acesso.' }

    /*
     * Ninguém se tranca para fora.
     *
     * Desativar a própria conta deixaria a pessoa sem como voltar — e num
     * sistema onde só o master cria admins, isso vira uma ligação para a
     * plataforma no meio do evento.
     */
    const eu = ACESSOS_DE_MENTIRA.find(a => a.nome === this.quemEntrou.nome)
    if (alvo.id === eu?.id) {
      return { erro: 'Você não pode desativar o próprio acesso.' }
    }

    alvo.ativo = ativo
    this.registrarAuditoria({
      acao: 'ALTERACAO_SUPERVISOR', campoAlterado: `Status do acesso de ${alvo.nome}`,
      valorNovo: ativo ? 'Ativo' : 'Inativo',
    })
    return {}
  }

  async trocarSenhaDoAcesso(id: string, novaSenha: string): Promise<{ erro?: string }> {
    await this.rede()
    this.exigirSessao()
    this.exigirPoder(podeGerenciarUsuarios, 'trocar senhas')

    const eu = ACESSOS_DE_MENTIRA.find(a => a.nome === this.quemEntrou.nome)
    if (id === eu?.id) return { erro: 'Para trocar a própria senha, use as configurações da conta.' }
    if (!novaSenha || novaSenha.length < 6) return { erro: 'A senha precisa ter ao menos 6 caracteres.' }

    const alvo = ACESSOS_DE_MENTIRA.find(a => a.id === id)
    if (!alvo || !this.acessosNoAlcance(alvo) || (!ehMaster(this.quemEntrou.papel) && alvo.papel === 'master')) {
      return { erro: 'Não encontramos este acesso.' }
    }

    this.registrarAuditoria({ acao: 'RESET_SENHA', campoAlterado: `Senha de ${alvo.nome}` })
    return {}
  }

  /**
   * Muda nome, telefone e situação de um acesso já existente — sem CPF nem
   * senha, que têm caminho próprio (`trocarSenhaDoAcesso`; o CPF não muda).
   */
  async editarSupervisor(
    id: string,
    dados: { nome: string; telefone: string; ativo: boolean; permissoesUsuario?: Record<string, boolean> },
  ): Promise<{ erro?: string }> {
    await this.rede()
    this.exigirSessao()
    this.exigirPoder(podeGerenciarUsuarios, 'editar supervisor')

    const alvo = ACESSOS_DE_MENTIRA.find(a => a.id === id)
    if (!alvo || !this.acessosNoAlcance(alvo)) return { erro: 'Não encontramos este acesso.' }

    const nome = (dados.nome ?? '').trim()
    const telefone = (dados.telefone ?? '').replace(/\D/g, '')
    if (nome.length < 3) return { erro: 'Digite o nome completo da pessoa.' }
    if (telefone.length < 10 || telefone.length > 13) {
      return { erro: 'Informe um telefone válido para enviar o acesso pelo WhatsApp.' }
    }

    alvo.nome = nome
    alvo.ativo = dados.ativo === true
    alvo.telefone = telefone
    // Omitir mantém o que já estava — outra tela pode ter decidido antes.
    if (dados.permissoesUsuario !== undefined) alvo.permissoesUsuario = dados.permissoesUsuario

    for (const setores of Object.values(SETORES_DE_MENTIRA)) {
      for (const s of setores) {
        const sup = s.supervisores.find(x => x.id === id)
        if (sup) {
          sup.nome = nome
          sup.ativo = dados.ativo === true
          sup.telefone = telefone
          if (dados.permissoesUsuario !== undefined) sup.permissoesUsuario = dados.permissoesUsuario
        }
      }
    }
    this.registrarAuditoria({ acao: 'ALTERACAO_SUPERVISOR', campoAlterado: `Dados de ${alvo.nome}`, valorNovo: nome })
    return {}
  }

  async excluirAcesso(id: string): Promise<{ erro?: string }> {
    await this.rede()
    this.exigirSessao()
    // Quem não gerencia usuários (supervisor, colaborador) nem abre esta
    // tela — isso é permissão de verdade, e lança. Quem gerencia mas não é
    // master (admin) PODE estar aqui, só não pode apagar — por isso é
    // resposta, não exceção, igual à API de verdade.
    this.exigirPoder(podeGerenciarUsuarios, 'excluir acessos')
    if (!podeExcluir(this.quemEntrou.papel)) {
      return { erro: 'Só o master exclui acessos. Você pode desativar, que bloqueia o login sem perder o histórico.' }
    }

    const eu = ACESSOS_DE_MENTIRA.find(a => a.nome === this.quemEntrou.nome)
    if (id === eu?.id) return { erro: 'Você não pode excluir o próprio acesso.' }

    const indice = ACESSOS_DE_MENTIRA.findIndex(a => a.id === id)
    if (indice === -1) return { erro: 'Não encontramos este acesso.' }

    ACESSOS_DE_MENTIRA.splice(indice, 1)
    return {}
  }

  async eventosComSetores(): Promise<EventoComSetores[]> {
    await this.rede()
    this.exigirSessao()
    this.exigirPoder(podeGerenciarUsuarios, 'criar acessos')

    return EVENTOS_DO_PAINEL.map(e => ({
      eventoId: e.eventoId,
      nome: e.nome,
      setores: (SETORES_DE_MENTIRA[e.eventoId] ?? []).map(s => ({
        setorId: s.setorId,
        nome: s.nome,
      })),
    }))
  }

  async operadoresDoEvento(eventoId: string): Promise<Acesso[]> {
    await this.rede()
    this.exigirSessao()
    this.exigirPoder(podeGerenciarUsuarios, 'ver os operadores de portão')

    const base = EVENTOS_DO_PAINEL.find(e => e.eventoId === eventoId)
    if (!base) throw new Error('Não encontramos este evento.')

    const eu = ACESSOS_DE_MENTIRA.find(a => a.nome === this.quemEntrou.nome)
    return ACESSOS_DE_MENTIRA
      .filter(a => a.papel === 'operador_portao')
      .map(a => ({ ...a, souEu: a.id === eu?.id }))
  }

  async criarAcesso(dados: NovoAcesso) {
    await this.rede()
    this.exigirSessao()
    this.exigirPoder(podeGerenciarUsuarios, 'criar acessos')

    const funcao = dados.funcao ?? 'supervisor'

    /*
     * Admin é preso à ORGANIZAÇÃO, não a um evento — entra por e-mail e
     * senha, nunca por CPF. Master escolhe a organização; o admin só
     * adiciona outro admin na própria (mesma régua de `adicionarAdmin` no
     * site — trazido em 12/09/2026).
     */
    if (funcao === 'admin') {
      const nomeAdmin = (dados.nome ?? '').trim()
      const email = (dados.email ?? '').trim().toLowerCase()
      const senha = (dados.senha ?? '').trim()

      if (nomeAdmin.length < 3) return { erro: 'Digite o nome completo da pessoa.' }
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        return { erro: 'Informe um e-mail válido — é por ele que o admin entra.' }
      }
      if (senha.length < 6) return { erro: 'A senha precisa ter ao menos 6 caracteres.' }

      // Uma organização só, no cenário de mentira — quem não é master cai
      // sempre nela, igual a `acessosNoAlcance`.
      const organizacaoId = ehMaster(this.sessao?.papel)
        ? (dados.organizacaoId ?? '')
        : ORGANIZACOES_DE_MENTIRA[0]?.organizacaoId ?? ''
      if (!organizacaoId) return { erro: 'Escolha a organização deste admin.' }
      if (!ORGANIZACOES_DE_MENTIRA.some(o => o.organizacaoId === organizacaoId)) {
        return { erro: 'Organização não encontrada.' }
      }
      if (ACESSOS_DE_MENTIRA.some(a => a.identificador.toLowerCase() === email)) {
        return { erro: 'Já existe um acesso com este e-mail.' }
      }

      const novo: Acesso = {
        id: `u-${ACESSOS_DE_MENTIRA.length + 1}`,
        nome: nomeAdmin,
        identificador: email,
        papel: 'admin',
        ativo: dados.ativo,
        setorNome: null,
        telefone: null,
        eventos: 1,
        criadoEm: new Date(this.agora()).toISOString(),
        expiraEm: null,
        souEu: false,
        permissoesUsuario: dados.permissoesUsuario ?? {},
      }
      ACESSOS_DE_MENTIRA.push({ ...novo })
      this.registrarAuditoria({
        acao: 'ALTERACAO_SUPERVISOR', campoAlterado: `Admin da organização ${ORGANIZACOES_DE_MENTIRA.find(o => o.organizacaoId === organizacaoId)?.nome ?? ''}`,
        valorNovo: `${nomeAdmin} — ${email} (acesso novo)`,
      })
      return { acesso: novo }
    }

    const nome = (dados.nome ?? '').trim()
    const cpf = (dados.cpf ?? '').replace(/\D/g, '')

    if (nome.length < 3) return { erro: 'Digite o nome completo da pessoa.' }
    if (cpf.length !== 11) return { erro: 'O CPF precisa ter 11 dígitos.' }
    /*
     * Só o master cria suporte — trazido do site em 11/09/2026 (achado ao
     * portar `criarAcesso` para a API de verdade). Suporte atravessa
     * organizações, é gente contratada pela PLATAFORMA para apoiar vários
     * clientes; conceder isso não é decisão de um admin de cliente
     * específico. Mesma régua de quem cria organização.
     */
    if (funcao === 'suporte' && !ehMaster(this.sessao?.papel)) {
      return { erro: 'Só o master cria acesso de suporte.' }
    }
    if (!dados.eventoId) return { erro: 'Escolha o evento.' }
    // Só o supervisor pede setor — operador de portão e suporte são do
    // evento inteiro, sem setor: prender os dois num setor faria o
    // credenciamento parar quando o supervisor daquele setor não está.
    if (funcao === 'supervisor' && !dados.setorId) {
      return { erro: 'Escolha o setor do supervisor.' }
    }

    // O CPF é a chave de identidade: dois acessos com o mesmo CPF fariam duas
    // pessoas diferentes entrarem na mesma conta.
    if (ACESSOS_DE_MENTIRA.some(a => a.identificador.replace(/\D/g, '') === cpf)) {
      return { erro: 'Já existe um acesso com este CPF.' }
    }

    const setor = funcao === 'supervisor'
      ? Object.values(SETORES_DE_MENTIRA).flat().find(x => x.setorId === dados.setorId)
      : undefined

    const novo: Acesso = {
      id: `u-${ACESSOS_DE_MENTIRA.length + 1}`,
      nome,
      identificador: formatCpf(cpf),
      papel: funcao,
      ativo: dados.ativo,
      setorNome: setor?.nome ?? null,
      telefone: (dados.telefone ?? '').replace(/\D/g, '') || null,
      eventos: 1,
      criadoEm: new Date(this.agora()).toISOString(),
      expiraEm: funcao === 'suporte' ? (dados.expiraEm ?? null) : null,
      souEu: false,
      permissoesUsuario: dados.permissoesUsuario ?? {},
    }

    ACESSOS_DE_MENTIRA.push({ ...novo })
    this.registrarAuditoria({
      acao: 'ALTERACAO_SUPERVISOR',
      campoAlterado: setor ? `Supervisor do setor ${setor.nome}` : `Acesso de ${funcao}`,
      valorNovo: `${nome} — CPF ${formatCpf(cpf)} (acesso novo)`,
    })
    return { acesso: novo }
  }

  /**
   * O alcance de quem está olhando.
   *
   * O master vê todos os acessos da plataforma; o admin, só a própria
   * organização — que aqui é tudo menos o master, já que existe uma
   * organização só. É a mesma régua do resto do sistema.
   */
  private acessosNoAlcance(a: { papel: Papel }): boolean {
    if (ehMaster(this.sessao?.papel)) return true
    return a.papel !== 'master'
  }

  // ── Plataforma ────────────────────────────────────────────────────────────

  async organizacoes(): Promise<ListaDeOrganizacoes> {
    await this.rede()
    this.exigirSessao()
    this.exigirPoder(podeGerenciarOrganizacoes, 'ver as organizações')

    return {
      itens: [...ORGANIZACOES_DE_MENTIRA],
      total: ORGANIZACOES_DE_MENTIRA.length,
      ativas: ORGANIZACOES_DE_MENTIRA.filter(o => o.ativa).length,
    }
  }

  /**
   * Cria o cliente, o admin dono dele e — se vier preenchido — o primeiro
   * evento.
   *
   * O sistema web também cria a pasta no Drive e sobe a foto de perfil; são
   * passos de servidor, e este servidor é de mentira. O que a tela precisa
   * conferir — nome, e-mail único, senha com tamanho mínimo — está aqui.
   */
  async criarOrganizacao(dados: DadosDeNovaOrganizacao): Promise<{ organizacao?: Organizacao; erro?: string }> {
    await this.rede()
    this.exigirSessao()
    this.exigirPoder(podeGerenciarOrganizacoes, 'criar organizações')

    const nome = dados.nome.trim()
    if (!nome) return { erro: 'O nome da organização é obrigatório.' }

    const email = dados.email.trim().toLowerCase()
    if (!email) return { erro: 'O e-mail do admin é obrigatório.' }

    const emEmUso = ORGANIZACOES_DE_MENTIRA.some(o => o.adminIdentificador?.toLowerCase() === email)
      || CONTAS_DE_DEMONSTRACAO.some(c => c.email.toLowerCase() === email)
    if (emEmUso) return { erro: 'Já existe uma conta com este e-mail.' }

    if (dados.senha.length < 6) return { erro: 'A senha precisa ter pelo menos 6 caracteres.' }

    const novo: Organizacao = {
      organizacaoId: `org-${ORGANIZACOES_DE_MENTIRA.length + 1}`,
      nome,
      documento: dados.documento?.trim() || null,
      ativa: true,
      adminNome: dados.adminNome.trim(),
      adminIdentificador: email,
      // O primeiro evento, se veio preenchido, já conta na contagem: é para
      // isso que ele serve — poupar o admin de criar o próprio evento no
      // primeiro acesso.
      eventos: dados.primeiroEvento ? 1 : 0,
      limiteEventos: dados.limiteEventos,
      valorCobrado: dados.valorCobrado ?? null,
      periodo: dados.valorCobrado ? (dados.valorCobradoPeriodo ?? 'mensal') : null,
      criadaEm: new Date(this.agora()).toISOString(),
    }
    ORGANIZACOES_DE_MENTIRA.push(novo)
    return { organizacao: novo }
  }

  async alternarOrganizacao(organizacaoId: string, ativa: boolean) {
    await this.rede()
    this.exigirSessao()
    this.exigirPoder(podeGerenciarOrganizacoes, 'suspender ou reativar')

    const org = ORGANIZACOES_DE_MENTIRA.find(o => o.organizacaoId === organizacaoId)
    if (!org) return { erro: 'Não encontramos esta organização.' }

    // Suspender bloqueia sem apagar: o histórico é do cliente, e ele vai
    // querer de volta se voltar.
    org.ativa = ativa
    return {}
  }

  async baseDeFuncionarios(busca = ''): Promise<BaseDeFuncionarios> {
    await this.rede()
    this.exigirSessao()
    this.exigirPoder(podeGerenciarOrganizacoes, 'ver a base de funcionários')

    const pessoas = BASE_DE_MENTIRA.filter(p => combina(p, busca))
    const cadastros = BASE_DE_MENTIRA.reduce((a, p) => a + p.eventos, 0)
    const organizacoes = new Set(ORGANIZACOES_DE_MENTIRA.map(o => o.organizacaoId)).size

    return {
      indicadores: [
        { chave: 'pessoas', rotulo: 'Pessoas na base', valor: BASE_DE_MENTIRA.length, tom: 'acento' },
        { chave: 'cadastros', rotulo: 'Cadastros feitos', valor: cadastros, tom: 'info' },
        { chave: 'organizacoes', rotulo: 'Organizações', valor: organizacoes, tom: 'neutro' },
        {
          chave: 'recorrentes',
          rotulo: 'Já em 2+ eventos',
          valor: BASE_DE_MENTIRA.filter(p => p.eventos >= 2).length,
          // É o número que diz se a base tem VALOR: gente que volta é gente
          // que já se sabe que aparece.
          tom: 'sucesso',
        },
      ],
      pessoas: pessoas.map(({ cidade, trabalhou, ...p }) => { void cidade; void trabalhou; return p }),
      encontrados: pessoas.length,
      total: BASE_DE_MENTIRA.length,
    }
  }

  async encontrarColaborador(filtro: { busca?: string; cidade?: string } = {}): Promise<BuscaRegional> {
    await this.rede()
    this.exigirSessao()
    this.exigirPoder(podeGerenciarOrganizacoes, 'usar a base regional')

    const cidade = semAcento((filtro.cidade ?? '').trim())
    const achados = BASE_DE_MENTIRA.filter(p =>
      combina(p, filtro.busca ?? '')
      && (!cidade || semAcento(p.cidade ?? '').includes(cidade)))

    const pessoas: PessoaRegional[] = achados.map(p => ({
      cpf: p.cpf,
      nome: p.nome,
      telefone: p.telefone,
      funcao: p.funcao,
      cidade: p.cidade,
      eventosTrabalhados: p.trabalhou,
      organizacoes: p.organizacoes,
      ultimo: p.ultimoCadastro,
    }))

    return {
      indicadores: [
        { chave: 'encontradas', rotulo: 'Pessoas encontradas', valor: pessoas.length, tom: 'acento' },
        {
          chave: 'com_historico',
          rotulo: 'Com histórico de presença',
          valor: pessoas.filter(p => p.eventosTrabalhados > 0).length,
          tom: 'sucesso',
        },
        {
          chave: 'cidades',
          rotulo: 'Cidades',
          valor: new Set(BASE_DE_MENTIRA.map(p => p.cidade).filter(Boolean)).size,
          tom: 'info',
        },
        {
          chave: 'com_telefone',
          rotulo: 'Com telefone',
          valor: pessoas.filter(p => p.telefone).length,
          // Sem telefone não dá para chamar — e chamar é o que esta tela existe
          // para fazer.
          tom: 'aviso',
        },
      ],
      pessoas,
      cidades: [...new Set(BASE_DE_MENTIRA.map(p => p.cidade).filter((c): c is string => !!c))].sort(),
    }
  }

  /**
   * A ficha completa: todo evento em que a pessoa já trabalhou, em qualquer
   * organização. Responde "posso chamar essa pessoa?" — por isso é só do
   * master, e por isso não carrega valor pago (preço de concorrente).
   */
  async fichaDaPessoaNaBase(cpf: string): Promise<FichaDaPessoaNaBase> {
    await this.rede()
    this.exigirSessao()
    this.exigirPoder(podeGerenciarOrganizacoes, 'ver a ficha da pessoa')

    const digitos = (cpf ?? '').replace(/\D/g, '')
    const pessoa = BASE_DE_MENTIRA.find(p => p.cpf === digitos)
    if (!pessoa) throw new Error('Não encontramos ninguém com este CPF na base.')

    const trabalhos = TRABALHOS_DA_BASE[digitos] ?? trabalhoSinteticoDaBase(pessoa)
    const compareceram = trabalhos.filter(t => t.compareceu).length
    const organizacoes = new Set(trabalhos.map(t => t.organizacao))
    const taxa = trabalhos.length ? Math.round((compareceram / trabalhos.length) * 100) : 0
    const ultimoTrabalho = trabalhos[0]?.data ?? null

    const eventosParaAtribuir: EventoParaAtribuir[] = EVENTOS_DO_PAINEL.map(e => ({
      id: e.eventoId, nome: e.nome, ativo: e.aoVivo, data: e.dataInicio,
    }))
    const setoresParaAtribuir: SetorParaAtribuir[] = Object.entries(SETORES_DE_MENTIRA)
      .flatMap(([eventoId, setores]) => setores.map(s => ({ id: s.setorId, nome: s.nome, eventoId })))

    return {
      cpf: digitos,
      nome: pessoa.nome,
      telefone: pessoa.telefone,
      cidade: pessoa.cidade,
      chavePix: null,
      cargoMaisComum: pessoa.funcao ?? '',
      autorizouBaseRegional: true,
      autorizouEm: pessoa.ultimoCadastro,
      indicadores: [
        { chave: 'eventos', rotulo: 'Eventos trabalhados', valor: trabalhos.length, tom: 'acento' },
        { chave: 'organizacoes', rotulo: 'Organizações', valor: organizacoes.size, tom: 'info' },
        {
          chave: 'taxa', rotulo: 'Taxa de presença', valor: `${taxa}%`,
          sub: trabalhos.length ? `compareceu em ${compareceram}` : undefined, tom: 'sucesso',
        },
        {
          chave: 'ultimo', rotulo: 'Último trabalho',
          valor: ultimoTrabalho ? formatarBR(ultimoTrabalho, 'data') : '—', tom: 'aviso',
        },
      ],
      trabalhos,
      eventosParaAtribuir,
      setoresParaAtribuir,
      jaNosEventos: [...new Set(trabalhos.map(t => t.eventoId))],
    }
  }

  /**
   * Coloca a pessoa na equipe de um setor — o passo que fecha "achei" em
   * "chamei". Dois passos no formulário (evento, depois setor) porque o
   * segundo depende do primeiro; aqui só confere o resultado.
   */
  async atribuirPessoaAoEvento(
    cpf: string, setorId: string,
  ): Promise<{ resultado?: ResultadoDeAtribuicao; erro?: string }> {
    await this.rede()
    this.exigirSessao()
    this.exigirPoder(podeGerenciarOrganizacoes, 'atribuir alguém a um evento')

    const digitos = (cpf ?? '').replace(/\D/g, '')
    const pessoa = BASE_DE_MENTIRA.find(p => p.cpf === digitos)
    if (!pessoa) return { erro: 'Não encontramos ninguém com este CPF na base.' }

    const entrada = Object.entries(SETORES_DE_MENTIRA)
      .flatMap(([eventoId, setores]) => setores.map(s => ({ eventoId, setor: s })))
      .find(x => x.setor.setorId === setorId)
    if (!entrada) return { erro: 'Não encontramos este setor.' }

    const evento = EVENTOS_DO_PAINEL.find(e => e.eventoId === entrada.eventoId)
    if (!evento) return { erro: 'Não encontramos o evento deste setor.' }

    // Uma pessoa só entra uma vez por evento — a mesma regra do formulário de
    // convite, só que do outro lado: quem atribui, não quem se cadastra.
    const trabalhos = TRABALHOS_DA_BASE[digitos] ?? trabalhoSinteticoDaBase(pessoa)
    if (trabalhos.some(t => t.eventoId === entrada.eventoId)) {
      return { erro: `${pessoa.nome} já está neste evento. Uma pessoa só entra uma vez por evento.` }
    }

    // Sem teto de vaga por setor: a produção removeu esse limite do sistema
    // web, então a pessoa sempre entra ATIVA (mesma regra em
    // `apps/api/src/rotas/base-de-funcionarios.ts`).
    entrada.setor.pessoas += 1

    const nova: TrabalhoDaPessoa = {
      funcionarioId: `f-atrib-${digitos}-${entrada.setor.setorId}`,
      eventoId: entrada.eventoId,
      evento: evento.nome,
      organizacaoId: null,
      organizacao: 'Produzimos',
      setor: entrada.setor.nome,
      setorId: entrada.setor.setorId,
      cargo: pessoa.funcao ?? '',
      data: evento.dataInicio,
      dataFim: evento.dataInicio,
      ativo: true,
      etapas: [],
      compareceu: false,
      podeAbrirEvento: true,
    }
    TRABALHOS_DA_BASE[digitos] = [nova, ...trabalhos]

    return {
      resultado: {
        evento: evento.nome,
        setor: entrada.setor.nome,
        ativo: true,
        semTelefone: !pessoa.telefone,
      },
    }
  }

  async painelDoWhatsApp(): Promise<PainelDoWhatsApp> {
    await this.rede()
    this.exigirSessao()
    this.exigirPoder(podeGerenciarOrganizacoes, 'ver o canal de WhatsApp')

    const aprovados = TEMPLATES_DE_MENTIRA.filter(t => t.situacao === 'aprovado').length

    return {
      pausado: false,
      canal: {
        conectada: true,
        estado: 'Conectado à API oficial da Meta. Última mensagem entregue há 4 minutos.',
        provedor: 'meta',
      },
      indicadores: [
        { chave: 'enviadas', rotulo: 'Enviadas hoje', valor: 142, tom: 'sucesso' },
        { chave: 'falhas', rotulo: 'Falhas hoje', valor: 3, tom: 'erro' },
        { chave: 'fila', rotulo: 'Na fila', valor: 0, tom: 'info' },
        { chave: 'templates', rotulo: 'Templates aprovados', valor: aprovados, tom: 'acento' },
      ],
      disparadas: 8412,
      custoEstimado: 214.5,
      templates: TEMPLATES_DE_MENTIRA,
    }
  }

  // ── Avisos ─────────────────────────────────────────────────────────────────

  async minhasNotificacoes(): Promise<CentralDeAvisos> {
    await this.rede()
    this.exigirSessao()

    const papel = this.sessao!.papel
    const tipos = papel === 'supervisor' ? TIPOS_DO_SUPERVISOR
      : papel === 'colaborador' ? TIPOS_DO_COLABORADOR
      : [] // master, admin, gerente, cliente: nenhum aviso automático hoje.
    const notificacoes = papel === 'supervisor' ? NOTIFICACOES_DO_SUPERVISOR
      : papel === 'colaborador' ? NOTIFICACOES_DO_COLABORADOR
      : []

    return {
      naoLidas: notificacoes.filter(n => !n.lida).length,
      notificacoes: [...notificacoes].sort((a, b) => b.criadaEm.localeCompare(a.criadaEm)),
      preferencias: tipos.map(tipo => ({
        tipo,
        rotulo: ROTULO_DO_AVISO[tipo].rotulo,
        descricao: ROTULO_DO_AVISO[tipo].descricao,
        ativo: !PREFERENCIAS_DESLIGADAS.has(tipo),
      })),
    }
  }

  async marcarNotificacaoComoLida(id: string): Promise<{ erro?: string }> {
    await this.rede()
    this.exigirSessao()
    const n = [...NOTIFICACOES_DO_COLABORADOR, ...NOTIFICACOES_DO_SUPERVISOR].find(x => x.id === id)
    if (!n) return { erro: 'Não encontramos este aviso.' }
    n.lida = true
    return {}
  }

  async marcarTodasComoLidas(): Promise<{ erro?: string }> {
    await this.rede()
    this.exigirSessao()
    const papel = this.sessao!.papel
    const minhas = papel === 'supervisor' ? NOTIFICACOES_DO_SUPERVISOR
      : papel === 'colaborador' ? NOTIFICACOES_DO_COLABORADOR
      : []
    for (const n of minhas) n.lida = true
    return {}
  }

  async salvarPreferenciasDeAvisos(tiposLigados: TipoDeAviso[]): Promise<{ erro?: string }> {
    await this.rede()
    this.exigirSessao()
    const ligados = new Set(tiposLigados)
    for (const tipo of [...TIPOS_DO_COLABORADOR, ...TIPOS_DO_SUPERVISOR]) {
      if (ligados.has(tipo)) PREFERENCIAS_DESLIGADAS.delete(tipo)
      else PREFERENCIAS_DESLIGADAS.add(tipo)
    }
    return {}
  }

  // (registrarTokenDeAviso, duplicado de registrarTokenDePush, removido em
  // 21/09/2026 — ver o comentário em cliente.ts.)

  // ── Supervisor ────────────────────────────────────────────────────────────

  async painelDaEquipe(eventoId: string): Promise<PainelDaEquipe> {
    await this.rede()
    void eventoId
    const hoje = diaBRT(new Date(this.agora()))
    const doDia = this.batidas.filter(b => b.data === hoje)
    const pega = (t: string) => doDia.find(b => b.tipo === t)?.em ?? null
    const entrada = pega('entrada')

    return {
      eventoNome: EVENTO.nome,
      equipeNome: 'Produção',
      data: hoje,
      // `faseAtualDoQR`, não `faseDoDia` — mesmo motivo do `painelDaEquipe` da API real.
      etapa: faseAtualDoQR(new Date(this.agora()), EVENTO.dataInicio, EVENTO.dataFim),
      total: 1,
      presentes: entrada ? 1 : 0,
      pessoas: [{
        participacaoId: 'part-1',
        nome: 'João da Silva',
        funcao: 'Auxiliar',
        fotoUrl: null,
        entrada,
        meio: pega('meio'),
        saida: pega('fim'),
        pendencia: !entrada ? 'entrada' : !pega('meio') ? 'meio' : !pega('fim') ? 'saida' : null,
      }],
    }
  }

  // ── Veículos ─────────────────────────────────────────────────────────────
  //
  // Só cadastro e consulta: o veículo não bate ponto, não tem QR e não passa
  // pelo scanner. Trazido do site em 11/09/2026.

  async eventosParaVeiculos(): Promise<EventoEscaneavel[]> {
    await this.rede()
    this.exigirSessao()
    this.exigirPoder(podeGerenciarVeiculos, 'cadastrar veículos')

    const meus = ehMaster(this.sessao!.papel)
      ? EVENTOS_DO_PAINEL
      : EVENTOS_DO_PAINEL.filter(e => e.organizacaoId === ORGANIZACAO_DO_ADMIN_DE_MENTIRA)
    return meus.map(e => ({ eventoId: e.eventoId, nome: e.nome }))
  }

  async veiculosDoEvento(eventoId: string): Promise<VeiculosDoEvento> {
    await this.rede()
    this.exigirSessao()
    this.exigirPoder(podeGerenciarVeiculos, 'ver os veículos do evento')

    // Cópia, não a referência: quem chama não pode enxergar um cadastro feito
    // DEPOIS desta consulta só porque guardou a lista antes e o array mutou
    // por baixo.
    return {
      dias: eventoId === 'ev-1' ? DIAS : [],
      veiculos: [...(VEICULOS_DE_MENTIRA[eventoId] ?? [])],
    }
  }

  async buscarCondutorPorCpf(
    eventoId: string, cpfDigitado: string,
  ): Promise<{ condutor?: CondutorEncontrado; erro?: string }> {
    await this.rede()
    this.exigirSessao()
    this.exigirPoder(podeGerenciarVeiculos, 'cadastrar veículos')
    void eventoId

    const cpf = (cpfDigitado ?? '').replace(/\D/g, '')
    if (cpf.length !== 11) return { erro: 'O CPF precisa ter 11 dígitos.' }

    // Restrito ao evento, como no site: o veículo é autorizado a entrar
    // NESTE evento, então o condutor precisa estar credenciado nele.
    const pessoa = EQUIPE_DE_MENTIRA.find(p => p.cpf === cpf)
    if (!pessoa) {
      return {
        erro: 'Este CPF não está credenciado neste evento. Cadastre a pessoa na equipe antes de vincular o veículo a ela.',
      }
    }

    return {
      condutor: {
        participacaoId: pessoa.id,
        nome: pessoa.nome,
        cpf: pessoa.cpf,
        funcao: pessoa.funcao,
        setorNome: pessoa.setor,
        empresa: null,
      },
    }
  }

  async cadastrarVeiculo(
    eventoId: string, dados: DadosDeVeiculo,
  ): Promise<{ placa?: string; condutor?: string; erro?: string }> {
    await this.rede()
    this.exigirSessao()
    this.exigirPoder(podeGerenciarVeiculos, 'cadastrar veículos')

    const placa = (dados.placa ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
    const modelo = (dados.modelo ?? '').trim()

    /*
     * Placa brasileira: 7 caracteres nos dois formatos que convivem — o
     * antigo (ABC1234) e o Mercosul (ABC1D23). Valida o formato, não a
     * existência: conferir se a placa existe de verdade exigiria consulta ao
     * Detran, que o sistema não tem.
     */
    if (!/^[A-Z]{3}\d[A-Z0-9]\d{2}$/.test(placa)) {
      return { erro: 'Placa inválida. Use o formato ABC1D23 (Mercosul) ou ABC1234.' }
    }
    if (modelo.length < 2) return { erro: 'Informe o modelo do veículo.' }

    const achado = await this.buscarCondutorPorCpf(eventoId, dados.cpf)
    if (!achado.condutor) return { erro: achado.erro }
    const condutor = achado.condutor

    const lista = VEICULOS_DE_MENTIRA[eventoId]
    if (!lista) return { erro: 'Não encontramos este evento.' }

    // Índice único (evento, placa) — a mesma placa duas vezes no mesmo
    // evento seria dois cadastros para um veículo só.
    if (lista.some(v => v.placa === placa)) {
      return { erro: `A placa ${placa} já está cadastrada neste evento.` }
    }

    lista.push({
      id: `vec-${Math.random().toString(16).slice(2, 8)}`,
      placa,
      modelo,
      cor: dados.cor?.trim() || null,
      tipo: dados.tipo?.trim() || null,
      empresa: dados.empresa?.trim() || null,
      observacoes: dados.observacoes?.trim() || null,
      condutorNome: condutor.nome,
      condutorCpf: condutor.cpf,
      dias: dados.dias ?? [],
      temFoto: !!dados.fotoBase64,
    })

    return { placa, condutor: condutor.nome }
  }

  async excluirVeiculo(veiculoId: string, eventoId: string): Promise<{ erro?: string }> {
    await this.rede()
    this.exigirSessao()
    this.exigirPoder(podeGerenciarVeiculos, 'excluir veículos')

    const lista = VEICULOS_DE_MENTIRA[eventoId]
    const i = lista?.findIndex(v => v.id === veiculoId) ?? -1
    if (!lista || i < 0) return { erro: 'Não encontramos este veículo.' }

    lista.splice(i, 1)
    return {}
  }

  // ── Bloquear CPF ─────────────────────────────────────────────────────────
  //
  // Quem não pode se cadastrar NESTE evento. Vale para o evento inteiro, e só
  // para este evento. Trazido do site em 11/09/2026.

  /**
   * O supervisor só bloqueia nos eventos onde tem setor — mesma régua
   * simplificada de `eventosParaAcompanhar` (só ev-2, no falso).
   */
  private exigirAcessoABloqueio(eventoId: string): void {
    this.exigirSessao()
    this.exigirPoder(podeBloquearCpf, 'bloquear CPF neste evento')
    if (this.sessao!.papel === 'supervisor' && eventoId !== 'ev-2') {
      throw new Error('Você não tem setor neste evento.')
    }
  }

  async eventosParaBloqueio(): Promise<EventoEscaneavel[]> {
    await this.rede()
    this.exigirSessao()
    this.exigirPoder(podeBloquearCpf, 'bloquear CPF')

    const meus = this.sessao!.papel === 'supervisor'
      ? EVENTOS_DO_PAINEL.filter(e => e.eventoId === 'ev-2')
      : ehMaster(this.sessao!.papel)
        ? EVENTOS_DO_PAINEL
        : EVENTOS_DO_PAINEL.filter(e => e.organizacaoId === ORGANIZACAO_DO_ADMIN_DE_MENTIRA)
    return meus.map(e => ({ eventoId: e.eventoId, nome: e.nome }))
  }

  async bloqueiosDoEvento(eventoId: string): Promise<CpfBloqueado[]> {
    await this.rede()
    this.exigirAcessoABloqueio(eventoId)
    // Cópia, não a referência — mesmo motivo de `veiculosDoEvento`.
    return [...(BLOQUEIOS_DE_MENTIRA[eventoId] ?? [])]
  }

  async bloquearCpf(
    eventoId: string, cpfDigitado: string, motivo?: string,
  ): Promise<{ cpf?: string; erro?: string }> {
    await this.rede()
    this.exigirAcessoABloqueio(eventoId)

    const cpf = (cpfDigitado ?? '').replace(/\D/g, '')
    if (cpf.length !== 11) return { erro: 'O CPF precisa ter 11 dígitos.' }

    const lista = BLOQUEIOS_DE_MENTIRA[eventoId]
    if (!lista) return { erro: 'Não encontramos este evento.' }
    if (lista.some(b => b.cpf === cpf)) return { erro: 'Este CPF já está bloqueado neste evento.' }

    lista.push({
      id: `bloq-${Math.random().toString(16).slice(2, 8)}`,
      cpf,
      motivo: (motivo ?? '').trim() || null,
      criadoEm: new Date(this.agora()).toISOString(),
      bloqueadoPor: this.quemEntrou.nome,
    })

    this.registrarAuditoria({
      acao: 'BLOQUEIO_CPF', campoAlterado: 'CPF bloqueado', valorNovo: formatCpf(cpf),
      motivo: (motivo ?? '').trim() || null, eventoId,
    })
    return { cpf }
  }

  /** Mesma régua de quem pode bloquear: quem bloqueia pode liberar. */
  async desbloquearCpf(bloqueioId: string, eventoId: string): Promise<{ erro?: string }> {
    await this.rede()
    this.exigirAcessoABloqueio(eventoId)

    // O bloqueio tem que ser DESTE evento: sem isto, um id colado na chamada
    // liberaria o bloqueio de outro evento.
    const lista = BLOQUEIOS_DE_MENTIRA[eventoId]
    const i = lista?.findIndex(b => b.id === bloqueioId) ?? -1
    if (!lista || i < 0) return { erro: 'Bloqueio não encontrado.' }

    const alvo = lista[i]!
    lista.splice(i, 1)
    this.registrarAuditoria({
      acao: 'DESBLOQUEIO_CPF', campoAlterado: 'CPF desbloqueado', valorNovo: formatCpf(alvo.cpf), eventoId,
    })
    return {}
  }

  // ── Conferência de equipe ───────────────────────────────────────────────
  //
  // A tela que o supervisor usa 1 dia antes: vê a equipe, tira quem não é
  // dele, confirma. Trazido do site em 11/09/2026.

  /**
   * Quem pode conferir/remover na equipe DESTE setor. Master e quem gerencia
   * eventos entram sempre; supervisor e suporte só onde estão vinculados —
   * o supervisor pelo próprio setor (mesmo `supervisores[]` do cartão do
   * setor), o suporte pela régua geral de `podeBloquearCpf` (sem escopo por
   * evento modelado no falso).
   */
  private exigirAcessoAoSetor(setorId: string): {
    eventoId: string
    setor: (typeof SETORES_DE_MENTIRA)[string][number]
  } {
    this.exigirSessao()

    let achado: { eventoId: string; setor: (typeof SETORES_DE_MENTIRA)[string][number] } | null = null
    for (const [eventoId, setores] of Object.entries(SETORES_DE_MENTIRA)) {
      const setor = setores.find(x => x.setorId === setorId)
      if (setor) { achado = { eventoId, setor }; break }
    }
    if (!achado) throw new Error('Não encontramos este setor.')

    const papel = this.sessao!.papel
    if (papel === 'supervisor') {
      const meuAcesso = ACESSOS_DE_MENTIRA.find(a => a.nome === this.quemEntrou.nome)
      const souSupervisorDeste = achado.setor.supervisores.some(s => s.id === meuAcesso?.id)
      if (!souSupervisorDeste) throw new Error('Você não tem acesso a esta equipe.')
      return achado
    }
    if (!podeBloquearCpf(papel)) throw new Error('Você não tem permissão para conferir esta equipe.')
    return achado
  }

  /** A visão geral do organizador: todos os setores, quem já confirmou. */
  async conferenciasDoEvento(eventoId: string): Promise<LinhaConferencia[]> {
    await this.rede()
    this.exigirSessao()
    this.exigirPoder(podeAcompanhar, 'ver as conferências')

    const setores = SETORES_DE_MENTIRA[eventoId]
    if (!setores) throw new Error('Não encontramos este evento.')

    // Setor sem supervisor nem entra — mesma régua do site e da API real.
    return setores
      .filter(s => s.supervisores.length > 0)
      .map(s => {
        const conf = this.conferenciasConfirmadas.get(s.setorId)
        return {
          setorId: s.setorId,
          setorNome: s.nome,
          supervisorNome: s.supervisores[0]?.nome ?? null,
          temSupervisor: true,
          status: (conf ? 'confirmada' : 'pendente') as 'pendente' | 'confirmada',
          confirmadaEm: conf?.confirmadaEm ?? null,
          totalMantidos: conf?.totalMantidos ?? null,
          totalRemovidos: conf?.totalRemovidos ?? null,
        }
      })
  }

  async conferenciaDoSetor(setorId: string): Promise<ConferenciaDoSetor> {
    await this.rede()
    const { eventoId, setor } = this.exigirAcessoAoSetor(setorId)
    const evento = EVENTOS_DO_PAINEL.find(e => e.eventoId === eventoId)!

    const removidos = this.removidosDaConferencia.get(setorId)
    const equipe = equipeDoSetorDeMentira(setorId, setor.pessoas)
      .filter(p => !removidos?.has(p.participacaoId))
      .map(p => ({ id: p.participacaoId, nome: p.nome, cpf: p.cpf, telefone: p.telefone, cargo: p.funcao }))

    const conf = this.conferenciasConfirmadas.get(setorId)
    const agora = new Date(this.agora())

    return {
      setorId,
      setorNome: setor.nome,
      eventoId,
      eventoNome: evento.nome,
      dataInicio: evento.dataInicio,
      aberta: conferenciaAberta(evento.dataInicio, agora),
      abreEm: abreEm(evento.dataInicio).toISOString(),
      status: conf ? 'confirmada' : 'pendente',
      confirmadaEm: conf?.confirmadaEm ?? null,
      confirmadaPorNome: conf?.confirmadaPorNome ?? null,
      totalMantidos: conf?.totalMantidos ?? null,
      totalRemovidos: conf?.totalRemovidos ?? null,
      equipe,
    }
  }

  /** Tira alguém da equipe durante a conferência. O histórico dela fica. */
  async removerDaConferencia(funcionarioId: string, setorId: string): Promise<{ erro?: string }> {
    await this.rede()
    this.exigirAcessoAoSetor(setorId)

    let removidos = this.removidosDaConferencia.get(setorId)
    if (!removidos) {
      removidos = new Set()
      this.removidosDaConferencia.set(setorId, removidos)
    }
    removidos.add(funcionarioId)
    return {}
  }

  /** Fecha a conferência: carimba quem, quando, e os números. */
  async confirmarConferencia(setorId: string): Promise<{ erro?: string }> {
    await this.rede()
    const { eventoId, setor } = this.exigirAcessoAoSetor(setorId)
    const evento = EVENTOS_DO_PAINEL.find(e => e.eventoId === eventoId)!

    if (!conferenciaAberta(evento.dataInicio, new Date(this.agora()))) {
      return { erro: 'A conferência abre 1 dia antes do evento.' }
    }

    const totalRemovidos = this.removidosDaConferencia.get(setorId)?.size ?? 0
    const totalMantidos = setor.pessoas - totalRemovidos
    this.conferenciasConfirmadas.set(setorId, {
      confirmadaEm: new Date(this.agora()).toISOString(),
      confirmadaPorNome: this.quemEntrou.nome,
      totalMantidos,
      totalRemovidos,
    })
    this.registrarAuditoria({
      acao: 'DESCREDENCIAMENTO', campoAlterado: `Conferência de equipe — ${setor.nome}`,
      valorNovo: `${totalMantidos} mantido(s), ${totalRemovidos} removido(s)`, eventoId,
    })
    return {}
  }

  /** O CSV da equipe do setor — pro botão "Baixar planilha" da tela de conferência. */
  async planilhaDaConferencia(setorId: string): Promise<ArquivoDePlanilha> {
    await this.rede()
    const { setor } = this.exigirAcessoAoSetor(setorId)
    return {
      nome: `equipe-${setor.nome}.csv`,
      url: `${ENDERECO_DE_ARQUIVOS}/conferencia/${setorId}/planilha`,
    }
  }

  // ── Relatórios ───────────────────────────────────────────────────────────
  //
  // Presença/ponto da equipe em planilha — não é financeiro. A planilha em
  // si é gerada do outro lado (mesmo padrão de `exportarEquipe`): aqui só se
  // decide QUEM pode pedir, e devolve `{ nome, url }`. Trazido do site em
  // 11/09/2026.

  /**
   * Master e quem gerencia eventos entram sempre (admin/gerente/cliente, na
   * própria organização). Supervisor só nos setores onde está vinculado —
   * `setoresPermitidos: null` no site quer dizer "o evento inteiro"; aqui é
   * o mesmo sinal.
   */
  private exigirAcessoAoRelatorio(eventoId: string): { setoresPermitidos: string[] | null } {
    this.exigirSessao()
    const setores = SETORES_DE_MENTIRA[eventoId]
    if (!setores) throw new Error('Evento não encontrado.')

    const papel = this.sessao!.papel
    if (papel === 'supervisor') {
      const meuAcesso = ACESSOS_DE_MENTIRA.find(a => a.nome === this.quemEntrou.nome)
      const meus = setores
        .filter(s => s.supervisores.some(sup => sup.id === meuAcesso?.id))
        .map(s => s.setorId)
      if (meus.length === 0) throw new Error('Sem permissão sobre este evento.')
      return { setoresPermitidos: meus }
    }
    if (!podeGerenciarEventos(papel)) throw new Error('Sem permissão para gerar relatórios.')
    return { setoresPermitidos: null }
  }

  async eventosParaRelatorios(): Promise<EventoEscaneavel[]> {
    await this.rede()
    this.exigirSessao()
    const papel = this.sessao!.papel

    let meus: typeof EVENTOS_DO_PAINEL
    if (papel === 'supervisor') {
      const meuAcesso = ACESSOS_DE_MENTIRA.find(a => a.nome === this.quemEntrou.nome)
      meus = EVENTOS_DO_PAINEL.filter(ev =>
        (SETORES_DE_MENTIRA[ev.eventoId] ?? []).some(s => s.supervisores.some(sup => sup.id === meuAcesso?.id)),
      )
    } else if (!podeGerenciarEventos(papel)) {
      throw new Error('Você não tem permissão para gerar relatórios.')
    } else {
      meus = ehMaster(papel)
        ? EVENTOS_DO_PAINEL
        : EVENTOS_DO_PAINEL.filter(ev => ev.organizacaoId === ORGANIZACAO_DO_ADMIN_DE_MENTIRA)
    }
    return meus.map(ev => ({ eventoId: ev.eventoId, nome: ev.nome }))
  }

  async resumoDeRelatorios(eventoId: string): Promise<ResumoDeRelatorios> {
    await this.rede()
    const { setoresPermitidos } = this.exigirAcessoAoRelatorio(eventoId)
    const evento = EVENTOS_DO_PAINEL.find(e => e.eventoId === eventoId)
    if (!evento) throw new Error('Evento não encontrado.')

    const todos = SETORES_DE_MENTIRA[eventoId] ?? []
    const visiveis = setoresPermitidos ? todos.filter(s => setoresPermitidos.includes(s.setorId)) : todos

    const dias = DIAS_DE_ATIVIDADE_DE_MENTIRA[eventoId] ?? [diaBRT(evento.dataInicio)]

    return {
      eventoNome: evento.nome,
      periodoCompleto: { de: dias[0]!, ate: dias[dias.length - 1]! },
      setores: visiveis.map(s => ({ setorId: s.setorId, nome: s.nome })),
      totalFuncionarios: visiveis.reduce((a, s) => a + s.pessoas, 0),
    }
  }

  async relatorioDoEvento(
    eventoId: string, periodo: Periodo, quem: QuemNoRelatorio,
  ): Promise<ArquivoDePlanilha> {
    await this.rede()
    const { setoresPermitidos } = this.exigirAcessoAoRelatorio(eventoId)
    if (setoresPermitidos) {
      throw new Error('O relatório completo é só para quem gerencia o evento inteiro.')
    }

    const sufixo = quem === 'ausentes' ? '-ausentes' : ''
    return {
      nome: `relatorio-${eventoId}-${periodo.de}-a-${periodo.ate}${sufixo}.xlsx`,
      url: `${ENDERECO_DE_ARQUIVOS}/relatorios/${eventoId}?de=${periodo.de}&ate=${periodo.ate}&quem=${quem}`,
    }
  }

  async relatorioDoSetor(
    eventoId: string, setorId: string, periodo: Periodo, quem: QuemNoRelatorio,
  ): Promise<ArquivoDePlanilha> {
    await this.rede()
    const { setoresPermitidos } = this.exigirAcessoAoRelatorio(eventoId)
    if (setoresPermitidos && !setoresPermitidos.includes(setorId)) {
      throw new Error('Sem permissão sobre este setor.')
    }
    const setor = (SETORES_DE_MENTIRA[eventoId] ?? []).find(s => s.setorId === setorId)
    if (!setor) throw new Error('Setor não encontrado.')

    const sufixo = quem === 'ausentes' ? '-ausentes' : ''
    return {
      nome: `relatorio-${setor.nome}-${periodo.de}-a-${periodo.ate}${sufixo}.xlsx`,
      url: `${ENDERECO_DE_ARQUIVOS}/relatorios/${eventoId}/setor/${setorId}?de=${periodo.de}&ate=${periodo.ate}&quem=${quem}`,
    }
  }

  /** Todos os setores, um arquivo por setor, num .zip — mesmo alcance do relatório completo. */
  async relatoriosPorSetorZip(
    eventoId: string, periodo: Periodo, quem: QuemNoRelatorio,
  ): Promise<ArquivoDePlanilha> {
    await this.rede()
    const { setoresPermitidos } = this.exigirAcessoAoRelatorio(eventoId)
    if (setoresPermitidos) {
      throw new Error('O relatório completo é só para quem gerencia o evento inteiro.')
    }

    return {
      nome: `relatorios-${eventoId}-${periodo.de}-a-${periodo.ate}.zip`,
      url: `${ENDERECO_DE_ARQUIVOS}/relatorios/${eventoId}/zip?de=${periodo.de}&ate=${periodo.ate}&quem=${quem}`,
    }
  }

  // ── Lançar ponto manual ──────────────────────────────────────────────────
  //
  // A batida de quem já foi embora — retroativa, com motivo. Mais restrito
  // que o registro assistido de propósito: lá o operador registra o que
  // acontece na frente dele; aqui se escreve o passado, com hora arbitrária
  // — ato de gestão. Trazido do site em 11/09/2026.

  /** Mesmo alcance de `podeBloquearCpf`, mais o recorte por setor do supervisor. */
  private exigirAcessoALancamento(eventoId: string): { setoresPermitidos: string[] | null } {
    this.exigirSessao()
    const setores = SETORES_DE_MENTIRA[eventoId]
    if (!setores) throw new Error('Evento não encontrado.')

    const papel = this.sessao!.papel
    if (papel === 'supervisor') {
      const meuAcesso = ACESSOS_DE_MENTIRA.find(a => a.nome === this.quemEntrou.nome)
      const meus = setores
        .filter(s => s.supervisores.some(sup => sup.id === meuAcesso?.id))
        .map(s => s.setorId)
      if (meus.length === 0) throw new Error('Sem permissão sobre este evento.')
      return { setoresPermitidos: meus }
    }
    if (!podeBloquearCpf(papel)) throw new Error('Você não tem permissão para lançar ponto manualmente.')
    return { setoresPermitidos: null }
  }

  async eventosParaLancarPonto(): Promise<EventoEscaneavel[]> {
    await this.rede()
    this.exigirSessao()
    const papel = this.sessao!.papel

    let meus: typeof EVENTOS_DO_PAINEL
    if (papel === 'supervisor') {
      const meuAcesso = ACESSOS_DE_MENTIRA.find(a => a.nome === this.quemEntrou.nome)
      meus = EVENTOS_DO_PAINEL.filter(ev =>
        (SETORES_DE_MENTIRA[ev.eventoId] ?? []).some(s => s.supervisores.some(sup => sup.id === meuAcesso?.id)),
      )
    } else if (!podeBloquearCpf(papel)) {
      throw new Error('Você não tem permissão para lançar ponto manualmente.')
    } else {
      meus = ehMaster(papel)
        ? EVENTOS_DO_PAINEL
        : EVENTOS_DO_PAINEL.filter(ev => ev.organizacaoId === ORGANIZACAO_DO_ADMIN_DE_MENTIRA)
    }
    return meus.map(ev => ({ eventoId: ev.eventoId, nome: ev.nome }))
  }

  async dadosParaLancarPonto(eventoId: string): Promise<DadosParaLancarPonto> {
    await this.rede()
    const { setoresPermitidos } = this.exigirAcessoALancamento(eventoId)
    const evento = EVENTOS_DO_PAINEL.find(e => e.eventoId === eventoId)
    if (!evento) throw new Error('Evento não encontrado.')

    const todos = SETORES_DE_MENTIRA[eventoId] ?? []
    const visiveis = setoresPermitidos ? todos.filter(s => setoresPermitidos.includes(s.setorId)) : todos

    const pessoas = visiveis.flatMap(setor =>
      equipeDoSetorDeMentira(setor.setorId, setor.pessoas).map(p => {
        const lancados = this.lancamentosManuais.get(p.participacaoId)
        const batidas: Record<string, string> = {}
        if (lancados) for (const [chave, hora] of lancados) batidas[chave] = hora
        return {
          id: p.participacaoId,
          nome: p.nome,
          cpf: p.cpf,
          setorNome: setor.nome,
          cargo: p.funcao ?? '',
          ativo: p.ativo,
          batidas,
        }
      }),
    )

    const dias = DIAS_DE_ATIVIDADE_DE_MENTIRA[eventoId] ?? [diaBRT(evento.dataInicio)]
    // O último dia da lista é o mais próximo do evento em si — heurística do
    // falso; o site tem essa informação de verdade em `jornada_dias.tipo`.
    const diasDaOperacao = dias.map((data, i) => ({
      data,
      tipo: (i === dias.length - 1 ? 'principal' : 'preparacao') as 'principal' | 'preparacao',
    }))

    const hoje = diaBRT(new Date(this.agora()))
    const diaPadrao = dias.includes(hoje)
      ? hoje
      : [...dias].reverse().find(d => d <= hoje) ?? dias[0]!

    return { eventoNome: evento.nome, pessoas, dias: diasDaOperacao, diaPadrao }
  }

  async lancarPontoManual(
    funcionarioId: string, tipo: TipoBatida, dataRef: string, quandoISO: string, motivo: string,
  ): Promise<{ nome?: string; etapa?: string; erro?: string }> {
    await this.rede()
    this.exigirSessao()

    const match = /^(.+)-p\d+$/.exec(funcionarioId)
    const setorId = match?.[1]
    let achado: { eventoId: string; setor: (typeof SETORES_DE_MENTIRA)[string][number] } | null = null
    if (setorId) {
      for (const [eventoId, setores] of Object.entries(SETORES_DE_MENTIRA)) {
        const setor = setores.find(s => s.setorId === setorId)
        if (setor) { achado = { eventoId, setor }; break }
      }
    }
    if (!achado) return { erro: 'Funcionário não encontrado.' }

    const { setoresPermitidos } = this.exigirAcessoALancamento(achado.eventoId)
    if (setoresPermitidos && !setoresPermitidos.includes(setorId!)) {
      return { erro: 'Esta pessoa é de outro setor. Você só lança ponto da sua equipe.' }
    }

    if (!ORDEM_DAS_ETAPAS.includes(tipo)) return { erro: 'Etapa inválida.' }

    const justificativa = (motivo ?? '').trim()
    if (justificativa.length < 5) {
      return { erro: 'Escreva o motivo do lançamento manual — é ele que sustenta a batida numa conferência.' }
    }

    const dias = DIAS_DE_ATIVIDADE_DE_MENTIRA[achado.eventoId] ?? []
    if (!dias.includes(dataRef)) {
      return { erro: 'Esse dia não é um dia de trabalho deste evento. Marque-o em Editar evento antes de lançar o ponto.' }
    }

    const quando = new Date(quandoISO)
    if (Number.isNaN(quando.getTime())) return { erro: 'Informe a data e a hora da batida.' }

    // Rede contra o dedo escorregar no ano ou no mês: um turno nunca passa de
    // ~36h do início do dia de trabalho a que pertence.
    const inicioDoDia = new Date(`${dataRef}T00:00:00-03:00`).getTime()
    const distancia = quando.getTime() - inicioDoDia
    if (distancia < -12 * 60 * 60 * 1000 || distancia > 36 * 60 * 60 * 1000) {
      return {
        erro: `A data e hora informadas estão longe demais do dia ${dataRef.split('-').reverse().join('/')}. Confira antes de salvar.`,
      }
    }

    const pessoa = equipeDoSetorDeMentira(setorId!, achado.setor.pessoas)
      .find(p => p.participacaoId === funcionarioId)
    if (!pessoa) return { erro: 'Funcionário não encontrado.' }
    if (!pessoa.ativo) {
      return { erro: 'Esta pessoa não está ativada no evento. Ative no painel do setor antes de lançar o ponto.' }
    }

    let porPessoa = this.lancamentosManuais.get(funcionarioId)
    if (!porPessoa) {
      porPessoa = new Map()
      this.lancamentosManuais.set(funcionarioId, porPessoa)
    }
    porPessoa.set(`${dataRef}:${tipo}`, quando.toISOString())

    return { nome: pessoa.nome, etapa: ROTULO_DA_ETAPA[tipo] }
  }

  // ── Editar colaborador (atalho) ─────────────────────────────────────────
  //
  // Achar a pessoa em TODOS os setores do evento, sem precisar saber em qual
  // ela está. A ficha em si (mover de setor, corrigir CPF, ajustar valor,
  // tornar supervisor) já existe em `fichaDaPessoa` — o que faltava era o
  // caminho até ela. Sem supervisor aqui, de propósito: ele já tem a própria
  // equipe na tela do setor. Trazido do site em 11/09/2026.

  async eventosParaEditarColaborador(): Promise<EventoEscaneavel[]> {
    await this.rede()
    this.exigirSessao()
    const papel = this.sessao!.papel
    if (!podeGerenciarEventos(papel) && papel !== 'suporte') {
      throw new Error('Você não tem permissão para editar colaboradores.')
    }
    const meus = ehMaster(papel)
      ? EVENTOS_DO_PAINEL
      : EVENTOS_DO_PAINEL.filter(ev => ev.organizacaoId === ORGANIZACAO_DO_ADMIN_DE_MENTIRA)
    return meus.map(ev => ({ eventoId: ev.eventoId, nome: ev.nome }))
  }

  async colaboradoresDoEvento(eventoId: string): Promise<BuscaDeColaboradores> {
    await this.rede()
    this.exigirSessao()
    const papel = this.sessao!.papel
    if (!podeGerenciarEventos(papel) && papel !== 'suporte') {
      throw new Error('Você não tem permissão para editar colaboradores.')
    }
    const evento = EVENTOS_DO_PAINEL.find(e => e.eventoId === eventoId)
    if (!evento) throw new Error('Evento não encontrado.')

    const setores = SETORES_DE_MENTIRA[eventoId] ?? []
    const colaboradores = setores.flatMap(setor =>
      equipeDoSetorDeMentira(setor.setorId, setor.pessoas).map(p => ({
        participacaoId: p.participacaoId,
        nome: p.nome,
        cpf: p.cpf,
        setorNome: setor.nome,
        cargo: p.funcao ?? '',
        ativo: p.ativo,
      })),
    )

    return { eventoNome: evento.nome, colaboradores }
  }

  // ── Suporte de Sistema ───────────────────────────────────────────────────
  //
  // Gente contratada pro dia do evento — corrige a operação, nunca
  // administra. Só o master gerencia: o escopo atravessa organizações, quem
  // contrata é a plataforma. Trazido do site em 11/09/2026.

  private paraSuporteAcesso(s: (typeof SUPORTES_DE_MENTIRA)[number]): SuporteAcesso {
    const agora = new Date(this.agora())
    return {
      id: s.id,
      nome: s.nome,
      telefone: s.telefone,
      ativo: s.ativo,
      acessoExpiraEm: s.acessoExpiraEm,
      expirado: !!s.acessoExpiraEm && new Date(`${s.acessoExpiraEm}T23:59:59-03:00`) < agora,
      escopoOrganizacoes: s.escopoOrganizacaoIds.map(id => ({
        id, nome: ORGANIZACOES_DE_MENTIRA.find(o => o.organizacaoId === id)?.nome ?? '—',
      })),
      escopoEventos: s.escopoEventoIds.map(id => {
        const ev = EVENTOS_DO_PAINEL.find(e => e.eventoId === id)
        return {
          id,
          nome: ev?.nome ?? '—',
          organizacaoNome: ORGANIZACOES_DE_MENTIRA.find(o => o.organizacaoId === ev?.organizacaoId)?.nome ?? '—',
        }
      }),
    }
  }

  async dadosDeSuporte(): Promise<DadosDeSuporte> {
    await this.rede()
    this.exigirSessao()
    this.exigirPoder(ehMaster, 'gerenciar acessos de suporte')

    return {
      suportes: SUPORTES_DE_MENTIRA.map(s => this.paraSuporteAcesso(s)),
      organizacoes: ORGANIZACOES_DE_MENTIRA.map(o => ({ id: o.organizacaoId, nome: o.nome })),
      eventos: EVENTOS_DO_PAINEL.map(ev => ({
        id: ev.eventoId,
        nome: ev.nome,
        organizacaoNome: ORGANIZACOES_DE_MENTIRA.find(o => o.organizacaoId === ev.organizacaoId)?.nome ?? '—',
      })),
    }
  }

  async criarSuporte(dados: DadosDeNovoSuporte): Promise<{ id?: string; erro?: string }> {
    await this.rede()
    this.exigirSessao()
    this.exigirPoder(ehMaster, 'criar acesso de suporte')

    const nome = (dados.nome ?? '').trim()
    if (!nome) return { erro: 'Informe o nome.' }

    const telefone = (dados.telefone ?? '').replace(/\D/g, '')
    if (telefone.length < 10 || telefone.length > 13) {
      return { erro: 'Informe um telefone válido para enviar o acesso pelo WhatsApp.' }
    }

    const escopos = [...(dados.escopoOrganizacaoIds ?? []), ...(dados.escopoEventoIds ?? [])]
    if (escopos.length === 0) return { erro: 'Escolha ao menos uma organização ou evento de atendimento.' }

    const cpf = (dados.cpf ?? '').replace(/\D/g, '')
    if (cpf.length !== 11) return { erro: 'Informe o CPF, com 11 dígitos.' }

    // O CPF é a chave de identidade — mesma régua de `criarAcesso`.
    const jaExiste = SUPORTES_DE_MENTIRA.some(s => s.cpf === cpf)
      || ACESSOS_DE_MENTIRA.some(a => a.identificador.replace(/\D/g, '') === cpf)
    if (jaExiste) {
      return { erro: `Já existe um acesso com o CPF ${formatCpf(cpf)}. Edite esse acesso em vez de criar outro.` }
    }

    const novo = {
      id: `sup-${SUPORTES_DE_MENTIRA.length + 1}`,
      nome, cpf, telefone,
      ativo: dados.ativo,
      acessoExpiraEm: dados.acessoExpiraEm || null,
      criadoEm: new Date(this.agora()).toISOString(),
      escopoOrganizacaoIds: dados.escopoOrganizacaoIds ?? [],
      escopoEventoIds: dados.escopoEventoIds ?? [],
    }
    SUPORTES_DE_MENTIRA.push(novo)
    return { id: novo.id }
  }

  async editarSuporte(id: string, dados: EdicaoDeSuporte): Promise<{ erro?: string }> {
    await this.rede()
    this.exigirSessao()
    this.exigirPoder(ehMaster, 'editar acesso de suporte')

    const alvo = SUPORTES_DE_MENTIRA.find(s => s.id === id)
    if (!alvo) return { erro: 'Acesso de suporte não encontrado.' }

    const nome = (dados.nome ?? '').trim()
    if (!nome) return { erro: 'Informe o nome.' }

    const escopos = [...(dados.escopoOrganizacaoIds ?? []), ...(dados.escopoEventoIds ?? [])]
    if (escopos.length === 0) return { erro: 'Escolha ao menos uma organização ou evento de atendimento.' }

    // Sem checagem de tamanho do telefone aqui — mesma assimetria do site:
    // `criarSuporte` valida, `editarSuporte` não.
    alvo.nome = nome
    alvo.telefone = (dados.telefone ?? '').replace(/\D/g, '') || null
    alvo.ativo = dados.ativo
    alvo.acessoExpiraEm = dados.acessoExpiraEm || null
    alvo.escopoOrganizacaoIds = dados.escopoOrganizacaoIds ?? []
    alvo.escopoEventoIds = dados.escopoEventoIds ?? []

    return {}
  }

  /** Diferente de excluir: o histórico do que a pessoa fez continua na Auditoria. */
  async revogarSuporte(id: string): Promise<{ erro?: string }> {
    await this.rede()
    this.exigirSessao()
    this.exigirPoder(ehMaster, 'revogar acesso de suporte')

    const alvo = SUPORTES_DE_MENTIRA.find(s => s.id === id)
    if (!alvo) return { erro: 'Acesso de suporte não encontrado.' }

    // "Imediatamente", não "até o fim de hoje": ontem, não hoje — porque
    // `expirado` conta como válido até as 23:59:59 do dia guardado (o mesmo
    // que a criação/edição fazem ao gravar "válido até").
    alvo.ativo = false
    alvo.acessoExpiraEm = diaBRT(new Date(this.agora() - 24 * 60 * 60 * 1000))
    return {}
  }

  // ── Gastos (produto do Produtor) ─────────────────────────────────────────
  //
  // Produto à parte, isolado do credenciamento — só `produtor` e `master`
  // (dando suporte) entram. Trazido do site em 22/09/2026.

  private eventosDesteProdutor(): string[] {
    const papel = this.sessao?.papel
    if (ehMaster(papel)) return EVENTOS_DO_PAINEL.map(ev => ev.eventoId)
    return EVENTOS_DO_PRODUTOR_DE_MENTIRA
  }

  async eventosParaGastos(): Promise<EventoParaGasto[]> {
    await this.rede()
    this.exigirSessao()
    this.exigirPoder(podeRegistrarGastos, 'usar o módulo Gastos')

    const ids = this.eventosDesteProdutor()
    const eventos = EVENTOS_DO_PAINEL
      .filter(ev => ids.includes(ev.eventoId))
      .map(ev => ({ id: ev.eventoId, nome: ev.nome, ativo: true }))

    // "Interno" sempre por último, sempre disponível.
    return [...eventos, { id: EVENTO_INTERNO, nome: 'Interno — despesas da empresa', ativo: true }]
  }

  private gastosVisiveis(): Gasto[] {
    const ids = new Set(this.eventosDesteProdutor())
    return GASTOS_DE_MENTIRA.filter(g => g.eventoId === EVENTO_INTERNO || ids.has(g.eventoId))
  }

  async listarGastos(filtro: FiltroGastos = {}): Promise<Gasto[]> {
    await this.rede()
    this.exigirSessao()
    this.exigirPoder(podeRegistrarGastos, 'usar o módulo Gastos')

    let gastos = this.gastosVisiveis()
    if (filtro.eventoId) gastos = gastos.filter(g => g.eventoId === filtro.eventoId)
    if (filtro.categoria) gastos = gastos.filter(g => g.categoria === filtro.categoria)
    if (filtro.fornecedor) gastos = gastos.filter(g => g.fornecedor === filtro.fornecedor)
    if (filtro.pago) gastos = gastos.filter(g => g.pago === (filtro.pago === 'true'))
    if (filtro.de) gastos = gastos.filter(g => g.dataGasto >= filtro.de!)
    if (filtro.ate) gastos = gastos.filter(g => g.dataGasto <= filtro.ate!)

    return [...gastos].sort((a, b) =>
      b.dataGasto.localeCompare(a.dataGasto) || b.registradoEm.localeCompare(a.registradoEm))
  }

  async criarGasto(dados: DadosDoGasto): Promise<{ id?: string; erro?: string }> {
    await this.rede()
    this.exigirSessao()
    this.exigirPoder(podeRegistrarGastos, 'usar o módulo Gastos')

    if (!this.eventosDesteProdutor().includes(dados.eventoId) && dados.eventoId !== EVENTO_INTERNO) {
      return { erro: 'Esse evento não está disponível pra você.' }
    }
    const descricao = (dados.descricao ?? '').trim()
    if (!descricao) return { erro: 'Diga o que foi o gasto.' }
    if (!Number.isFinite(dados.valor) || dados.valor <= 0) {
      return { erro: 'Informe um valor válido, maior que zero.' }
    }

    const categoria = categoriaValida(dados.categoria) ?? 'Outros'
    const id = `gasto-${GASTOS_DE_MENTIRA.length + 1}`
    const eventoNome = dados.eventoId === EVENTO_INTERNO
      ? 'Interno — despesas da empresa'
      : EVENTOS_DO_PAINEL.find(ev => ev.eventoId === dados.eventoId)?.nome ?? null

    GASTOS_DE_MENTIRA.push({
      id, eventoId: dados.eventoId, eventoNome, descricao, valor: dados.valor, categoria,
      fornecedor: dados.fornecedor?.trim() || null, formaPagamento: dados.formaPagamento?.trim() || null,
      pagador: dados.pagador?.trim() || null, pago: dados.pago, dataGasto: dados.dataGasto || diaBRT(new Date(this.agora())),
      registradoEm: new Date(this.agora()).toISOString(), origem: dados.origem,
      status: 'confirmado', observacao: dados.observacao?.trim() || null,
      transcricao: dados.origem === 'audio' ? dados.transcricao : null,
      temComprovante: !!dados.comprovanteBase64, comprovanteNome: dados.comprovanteBase64 ? 'comprovante.jpg' : null,
      criadoPorNome: this.quemEntrou.nome,
    })
    return { id }
  }

  async editarGasto(id: string, dados: DadosDoGasto): Promise<{ erro?: string }> {
    await this.rede()
    this.exigirSessao()
    this.exigirPoder(podeRegistrarGastos, 'usar o módulo Gastos')

    const alvo = GASTOS_DE_MENTIRA.find(g => g.id === id)
    if (!alvo) return { erro: 'Este gasto não existe mais.' }

    const descricao = (dados.descricao ?? '').trim()
    if (!descricao) return { erro: 'Diga o que foi o gasto.' }
    if (!Number.isFinite(dados.valor) || dados.valor <= 0) {
      return { erro: 'Informe um valor válido, maior que zero.' }
    }

    alvo.descricao = descricao
    alvo.valor = dados.valor
    alvo.categoria = categoriaValida(dados.categoria) ?? 'Outros'
    alvo.dataGasto = dados.dataGasto || alvo.dataGasto
    alvo.fornecedor = dados.fornecedor?.trim() || null
    alvo.formaPagamento = dados.formaPagamento?.trim() || null
    alvo.pagador = dados.pagador?.trim() || null
    alvo.pago = dados.pago
    alvo.observacao = dados.observacao?.trim() || null
    if (dados.comprovanteBase64) { alvo.temComprovante = true; alvo.comprovanteNome = 'comprovante.jpg' }
    return {}
  }

  async excluirGasto(id: string): Promise<{ erro?: string }> {
    await this.rede()
    this.exigirSessao()
    this.exigirPoder(podeRegistrarGastos, 'usar o módulo Gastos')

    const i = GASTOS_DE_MENTIRA.findIndex(g => g.id === id)
    if (i === -1) return { erro: 'Este gasto já não existe.' }
    GASTOS_DE_MENTIRA.splice(i, 1)
    return {}
  }

  async urlComprovanteGasto(id: string): Promise<{ url: string | null; erro?: string }> {
    await this.rede()
    this.exigirSessao()
    this.exigirPoder(podeRegistrarGastos, 'usar o módulo Gastos')

    const alvo = GASTOS_DE_MENTIRA.find(g => g.id === id)
    if (!alvo) return { url: null, erro: 'Este gasto já não existe.' }
    return { url: alvo.temComprovante ? `https://demonstracao.credenciei.app/comprovantes/${id}.jpg` : null }
  }

  async transcreverAudioDeGasto(
    audioBase64: string, mime: string, eventoId: string,
  ): Promise<GastoExtraido | { erro: string }> {
    await this.rede()
    this.exigirSessao()
    this.exigirPoder(podeRegistrarGastos, 'usar o módulo Gastos')
    void mime

    if (!this.eventosDesteProdutor().includes(eventoId) && eventoId !== EVENTO_INTERNO) {
      return { erro: 'Esse evento não está disponível pra você.' }
    }
    if (!audioBase64) return { erro: 'Áudio não recebido. Grave de novo.' }

    // Sem IA de verdade aqui — a demonstração devolve um resultado fixo, com
    // um campo sempre incerto (fornecedor), pra tela de confirmação também
    // ser exercitada em modo de demonstração.
    return {
      transcricao: '(demonstração) gastei 150 reais com material de escritório',
      valor: 150, descricao: 'Material de escritório', fornecedor: null,
      categoria: 'Outros', dataGasto: diaBRT(new Date(this.agora())),
      precisaConfirmar: ['fornecedor'],
    }
  }

  async painelDeGastos(filtro: FiltroGastos = {}): Promise<PainelDeGastos> {
    await this.rede()
    this.exigirSessao()
    this.exigirPoder(podeRegistrarGastos, 'usar o módulo Gastos')

    const gastos = await this.listarGastos(filtro)
    return {
      kpis: kpisDeGastos(gastos, diaBRT(new Date(this.agora()))),
      graficos: dadosDosGraficosDeGastos(gastos),
    }
  }

  async exportarGastosXlsx(filtro: FiltroGastos): Promise<ArquivoDePlanilha | { erro: string }> {
    await this.rede()
    this.exigirSessao()
    this.exigirPoder(podeRegistrarGastos, 'usar o módulo Gastos')

    if (!filtro.eventoId) return { erro: 'Escolha o evento antes de exportar.' }
    return { nome: `gastos-${filtro.eventoId}.xlsx`, url: 'https://demonstracao.credenciei.app/gastos-demo.xlsx' }
  }

  // ── Push ──────────────────────────────────────────────────────────────────

  async registrarTokenDePush(_token: string, _plataforma: 'ios' | 'android'): Promise<{ erro?: string }> {
    void _token; void _plataforma
    await this.rede()
    this.exigirSessao()
    return {}
  }

  // ── Guardas ───────────────────────────────────────────────────────────────

  private exigirSessao(): void {
    if (!this.sessao) throw new Error('Sessão expirada. Entre de novo.')
  }

  private exigirParticipacao(id: string): void {
    this.exigirSessao()
    /*
     * O falso também recusa id de outra pessoa.
     *
     * Se ele deixasse passar, o app poderia ser escrito assumindo que dá — e a
     * falha só apareceria contra a API real, onde a recusa é de segurança.
     * Um cliente falso permissivo demais ensina o app a fazer coisa errada.
     */
    if (!this.participacao || this.participacao.participacaoId !== id) {
      throw new Error('Você não tem acesso a esta participação.')
    }
  }
}
