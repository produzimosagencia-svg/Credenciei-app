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
  avaliarEntradaSaida, conferirHorariosDoEvento, diaBRT, ehMaster, faseConfere,
  faseDoDia, formatCpf, gerarCodigoQR, janelaMeio, lerCodigoDeEvento,
  lerCodigoQR, podeAcompanhar, podeEscanear, podeGerenciarEventos,
  podeGerenciarOrganizacoes, podeGerenciarUsuarios,
} from '@credenciei/dominio'
import type { ClienteApi } from './cliente.js'
import type {
  Acesso, ArquivoDePlanilha, AtividadeRecente, AtividadesDoEvento,
  BatidaAssistida, CandidatoLocalizado, ConferenciaPorCpf, ConfiguracaoDoEvento,
  ConviteDoEvento, DiaDaParticipacao, EdicaoDoEvento, EnvioDeBatida,
  EquipeDoSetor, Eu, EventoComSetores, EventoDetalhado, EventoEscaneavel,
  FichaDaPessoa, FichaLocalizada, FiltroDeAcessos, FinanceiroDaParticipacao,
  LinhaDaAtividade,
  ListaDeAcessos, MomentoDaLeitura, NovoAcesso, Painel, PainelDaEquipe,
  PessoaDaLista, PessoaDoSetor, Portaria, ResultadoDaImportacao,
  BaseDeFuncionarios, BuscaRegional, DadosDeNovaOrganizacao, ListaDeOrganizacoes,
  Organizacao, PainelDoWhatsApp, PessoaDaBase, PessoaRegional,
  ResultadoDaLeitura, ResultadoDosDias, RespostaDeBatida, ResumoParticipacao,
  SetorDetalhado, StatusDaEtapa, Sessao,
} from './tipos.js'
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
}

/** Os dias de trabalho — montagem, o dia, e desmontagem. */
const DIAS: { data: string; tipo: 'principal' | 'preparacao' }[] = [
  { data: '2026-09-03', tipo: 'preparacao' },
  { data: '2026-09-04', tipo: 'preparacao' },
  { data: '2026-09-05', tipo: 'principal' },
  { data: '2026-09-06', tipo: 'preparacao' },
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

/**
 * Teto do log de atividades.
 *
 * Acima disso a tela fica pesada e ninguém rola até o fim. Quando corta, a tela
 * DIZ que está mostrando só as mais recentes — senão quem procura uma batida
 * antiga conclui que ela não existe.
 */
const TETO_DO_LOG = 200

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
  eventos: number
  criadoEm: string
}[] = [
  { id: 'u-1', nome: 'Juan Muzy', identificador: 'juan@produzimos.com.br', papel: 'master', ativo: true, setorNome: null, eventos: 3, criadoEm: '2025-11-04T10:00:00-03:00' },
  { id: 'u-2', nome: 'Marina Alves', identificador: 'marina@produzimos.com.br', papel: 'admin', ativo: true, setorNome: null, eventos: 3, criadoEm: '2026-02-17T09:30:00-03:00' },
  { id: 'u-3', nome: 'Carlos Silva', identificador: 'carlos@produzimos.com.br', papel: 'supervisor', ativo: true, setorNome: 'Produção', eventos: 1, criadoEm: '2026-06-02T14:12:00-03:00' },
  { id: 'u-4', nome: 'Débora Antunes', identificador: 'debora@produzimos.com.br', papel: 'supervisor', ativo: true, setorNome: 'Camarim', eventos: 1, criadoEm: '2026-07-21T11:45:00-03:00' },
  { id: 'u-5', nome: 'Fábio Queiroz', identificador: 'fabio@produzimos.com.br', papel: 'supervisor', ativo: false, setorNome: 'Portaria', eventos: 2, criadoEm: '2025-12-09T16:20:00-03:00' },
]

/**
 * Os setores de cada evento. Todo supervisor nasce preso a um deles.
 *
 * Os números são desiguais de propósito: um setor cheio, um pela metade, um
 * vazio e um sem teto definido. Com todos iguais, a barra de progresso e o
 * estado vazio nunca apareceriam durante o desenvolvimento.
 */
const SETORES_DE_MENTIRA: Record<string, {
  setorId: string
  nome: string
  pessoas: number
  estimado: number | null
  valorPorPessoa: number | null
  token: string
  supervisores: { id: string; nome: string; ativo: boolean }[]
}[]> = {
  'ev-1': [
    { setorId: 's-1', nome: 'Produção', pessoas: 18, estimado: 20, valorPorPessoa: 150, token: 'f-prod-1', supervisores: [{ id: 'u-3', nome: 'Carlos Silva', ativo: true }] },
    { setorId: 's-2', nome: 'Portaria', pessoas: 12, estimado: 12, valorPorPessoa: 140, token: 'f-port-1', supervisores: [] },
    { setorId: 's-3', nome: 'Bar', pessoas: 7, estimado: 15, valorPorPessoa: 160, token: 'f-bar-1', supervisores: [] },
    { setorId: 's-4', nome: 'Camarim', pessoas: 4, estimado: null, valorPorPessoa: 180, token: 'f-cam-1', supervisores: [{ id: 'u-4', nome: 'Débora Antunes', ativo: true }] },
    { setorId: 's-5', nome: 'Limpeza', pessoas: 0, estimado: 8, valorPorPessoa: null, token: 'f-limp-1', supervisores: [] },
  ],
  'ev-2': [
    { setorId: 's-6', nome: 'Produção', pessoas: 2, estimado: 2, valorPorPessoa: 150, token: 'f-prod-2', supervisores: [{ id: 'u-3', nome: 'Carlos Silva', ativo: true }] },
    { setorId: 's-7', nome: 'Portaria', pessoas: 1, estimado: 1, valorPorPessoa: 140, token: 'f-port-2', supervisores: [] },
  ],
  'ev-3': [
    { setorId: 's-8', nome: 'Produção', pessoas: 2, estimado: 2, valorPorPessoa: 150, token: 'f-prod-3', supervisores: [] },
  ],
}

/**
 * O log de atividades, já com casos que a tela precisa saber desenhar.
 *
 * Tem batida por QR, batida com foto do próprio colaborador e batida assistida
 * — que é a que outra pessoa registrou. Se todas fossem iguais, a distinção
 * mais importante da tela (como a batida entrou) nunca seria exercitada.
 */
const ATIVIDADES_DE_MENTIRA: LinhaDaAtividade[] = [
  {
    id: 'r-1', nome: 'Juan Muzy', cpf: '76431520891', setor: 'Produção',
    etapa: 'meio', em: '2026-08-30T18:04:00-03:00', como: 'foto',
    local: 'Av. Fernando Ferrari, Goiabeiras', registradoPor: null, justificativa: null,
  },
  {
    id: 'r-2', nome: 'Ana Cláudia Ferreira', cpf: '03748261509', setor: 'Produção',
    etapa: 'entrada', em: '2026-08-30T14:12:00-03:00', como: 'qr',
    local: null, registradoPor: null, justificativa: null,
  },
  {
    id: 'r-3', nome: 'Rodrigo Menezes Lima', cpf: '21890647355', setor: 'Portaria',
    etapa: 'entrada', em: '2026-08-30T13:58:00-03:00', como: 'assistido',
    local: 'Estádio Kleber Andrade, Cariacica', registradoPor: 'Marina Alves',
    justificativa: 'Chegou sem celular',
  },
  {
    id: 'r-4', nome: 'Juan Muzy', cpf: '76431520891', setor: 'Produção',
    etapa: 'entrada', em: '2026-08-30T13:47:00-03:00', como: 'qr',
    local: null, registradoPor: null, justificativa: null,
  },
  {
    id: 'r-5', nome: 'Patrícia Nogueira Silva', cpf: '49012783644', setor: 'Camarim',
    etapa: 'fim', em: '2026-08-29T23:40:00-03:00', como: 'qr',
    local: null, registradoPor: null, justificativa: null,
  },
  // A entrada dela, de ontem: sem ela, o log teria uma saída sem entrada — que
  // é justamente o tipo de incoerência que esta tela existe para revelar, e não
  // para produzir sozinha.
  {
    id: 'r-6', nome: 'Patrícia Nogueira Silva', cpf: '49012783644', setor: 'Camarim',
    etapa: 'entrada', em: '2026-08-29T15:10:00-03:00', como: 'qr',
    local: null, registradoPor: null, justificativa: null,
  },
]

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

/** Onde o cartaz da portaria aponta. É o endereço que vai impresso. */
const ENDERECO_DA_PORTARIA = 'https://credenciei.vercel.app/portaria'

/** Onde a equipe se cadastra sozinha, um por setor. */
const ENDERECO_DO_FORMULARIO = 'https://credenciei.vercel.app/form'

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
  janelaEntradaInicio: string | null
  janelaEntradaFim: string | null
  janelaFimInicio: string | null
  janelaFimFim: string | null
  /** Os dias de preparação marcados, sem o dia do evento. */
  preparacao: string[]
  /** Os que já têm batida e por isso não podem ser desmarcados. */
  comBatidas: string[]
}> = {
  'ev-1': {
    descricao: null,
    batidaLivre: true,
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
  },
  'ev-2': {
    descricao: null,
    batidaLivre: false,
    janelaEntradaInicio: '2026-08-29T16:00:00-03:00',
    janelaEntradaFim: '2026-08-29T22:00:00-03:00',
    janelaFimInicio: '2026-08-30T01:00:00-03:00',
    janelaFimFim: '2026-08-30T06:00:00-03:00',
    preparacao: ['2026-08-28'],
    comBatidas: [],
  },
  'ev-3': {
    descricao: null,
    batidaLivre: false,
    janelaEntradaInicio: null,
    janelaEntradaFim: null,
    janelaFimInicio: null,
    janelaFimFim: null,
    preparacao: [],
    comBatidas: [],
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

/** Os templates aprovados pela Meta, do jeito que a leitura devolve. */
const TEMPLATES_DE_MENTIRA: PainelDoWhatsApp['templates'] = [
  { nome: 'codigo_de_acesso', situacao: 'aprovado', categoria: 'AUTHENTICATION' },
  { nome: 'boas_vindas_evento', situacao: 'aprovado', categoria: 'UTILITY' },
  { nome: 'aviso_do_dia', situacao: 'aprovado', categoria: 'UTILITY' },
  { nome: 'lembrete_do_meio', situacao: 'aprovado', categoria: 'UTILITY' },
  { nome: 'convite_supervisor', situacao: 'em_analise', categoria: 'UTILITY' },
  { nome: 'promocao_evento', situacao: 'rejeitado', categoria: 'MARKETING' },
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
  const faseDeHoje = faseDoDia(hoje, diaBRT(EVENTO.dataInicio))
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
  /**
   * As etapas que cada pessoa da equipe já registrou hoje.
   *
   * Separado de `batidas`, que é a fila do colaborador logado: aqui é o que o
   * operador vê e grava sobre OUTRAS pessoas.
   */
  private batidasDaEquipe = new Map<string, Set<TipoBatida>>()
  /** O que a ficha de cada pessoa mudou nesta sessão. */
  private pagamentos = new Map<string, string>()
  private valores = new Map<string, number>()
  private movidos = new Map<string, string>()

  constructor(c: ComportamentoFalso = {}) {
    this.atrasoMs = c.atrasoMs ?? 0
    this.falhaDeRede = c.falhaDeRede ?? 0
    this.agora = c.agora ?? (() => Date.now())
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
        entrada,
        meioEsperado: janela?.inicio ?? null,
        meio,
        meioAtrasoMin:
          meio && janela && new Date(meio) > new Date(janela.fim)
            ? Math.round((Date.parse(meio) - Date.parse(janela.fim)) / 60_000)
            : null,
        saida: pega('fim'),
        compareceu: !!entrada,
        horas: entrada && pega('fim')
          ? Math.round(((Date.parse(pega('fim')!) - Date.parse(entrada)) / 3600e3) * 100) / 100
          : null,
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
      valorPrevisto: trabalhados * 150,
      situacao: 'pendente',
      pagoEm: null,
    }
  }

  async meuQr(participacaoId: string) {
    await this.rede()
    this.exigirParticipacao(participacaoId)
    const etapa = faseDoDia(diaBRT(new Date(this.agora())), diaBRT(EVENTO.dataInicio))
    const { codigo } = gerarCodigoQR(SEGREDO_DE_MENTIRA, 'token-do-qr', etapa)
    return { codigo, etapa }
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
     */
    const meus = this.sessao!.papel === 'supervisor'
      ? EVENTOS_DO_PAINEL.filter(e => e.eventoId === 'ev-2')
      : EVENTOS_DO_PAINEL

    const equipe = meus.reduce((a, e) => a + e.equipe, 0)
    const presentes = meus.reduce((a, e) => a + e.presentes, 0)

    return {
      data: new Date(this.agora()).toISOString(),
      indicadores: [
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
      ],
      eventos: meus,
      atividade: ATIVIDADE_DE_MENTIRA,
      legendaDaJanela:
        'Henrique e Juliano - Kleber Andrade · das 07:00 de 05/09/2026 às 08:00 de 06/09/2026',
    }
  }

  // ── Escanear QR ───────────────────────────────────────────────────────────

  async eventosParaEscanear(): Promise<EventoEscaneavel[]> {
    await this.rede()
    this.exigirSessao()
    this.exigirPoder(podeEscanear, 'escanear crachá')
    return EVENTOS_DO_PAINEL.map(e => ({ eventoId: e.eventoId, nome: e.nome }))
  }

  async registrarPorQr(
    eventoId: string,
    codigoLido: string,
    momento: MomentoDaLeitura,
  ): Promise<ResultadoDaLeitura> {
    await this.rede()
    this.exigirSessao()
    this.exigirPoder(podeEscanear, 'escanear crachá')
    void eventoId

    const hoje = diaBRT(new Date(this.agora()))
    const faseDeHoje = faseDoDia(hoje, diaBRT(EVENTO.dataInicio))

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

    const feitas = this.etapasDe(pessoa.id)
    const resumo = { nome: pessoa.nome, funcao: pessoa.funcao }

    if (feitas.has(momento)) {
      return {
        situacao: 'duplicado',
        momento,
        pessoa: resumo,
        mensagem: `${ROTULO_DA_ETAPA[momento]} já registrada`,
      }
    }

    // A saída exige o meio, como no domínio: o meio é o que prova que a pessoa
    // ficou no evento, e liberar a saída sem ele apagaria essa prova.
    if (momento === 'fim' && !feitas.has('meio')) {
      return {
        situacao: 'recusado',
        mensagem: `${pessoa.nome} ainda não registrou o meio. Peça para ela abrir a credencial e tirar a selfie do meio.`,
      }
    }

    feitas.add(momento)
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
      etapasFeitas: [...this.etapasDe(pessoa.id)],
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

    const pendente = this.pendenteDe(pessoa.id)
    if (!pendente) return { erro: `${pessoa.nome} já tem todas as batidas de hoje.` }

    this.etapasDe(pessoa.id).add(pendente)
    return { nome: pessoa.nome, etapa: ROTULO_DA_ETAPA[pendente] }
  }

  /** As etapas que aquela pessoa já registrou hoje. */
  private etapasDe(id: string): Set<TipoBatida> {
    let feitas = this.batidasDaEquipe.get(id)
    if (!feitas) {
      feitas = new Set()
      this.batidasDaEquipe.set(id, feitas)
    }
    return feitas
  }

  /** A próxima etapa na ordem do dia. Quem decide é aqui, nunca a tela. */
  private pendenteDe(id: string): TipoBatida | null {
    const feitas = this.etapasDe(id)
    return ORDEM_DAS_ETAPAS.find(e => !feitas.has(e)) ?? null
  }

  private candidato(p: (typeof EQUIPE_DE_MENTIRA)[number]): CandidatoLocalizado {
    return {
      participacaoId: p.id,
      nome: p.nome,
      cpf: p.cpf,
      funcao: p.funcao,
      setorNome: p.setor,
      eventoNome: EVENTO.nome,
    }
  }

  private ficha(p: (typeof EQUIPE_DE_MENTIRA)[number]): FichaLocalizada {
    const feitas = [...this.etapasDe(p.id)]
    const ultima = feitas[feitas.length - 1] ?? null
    const pendente = this.pendenteDe(p.id)

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
      ultimaBatida: ultima
        ? { rotulo: ROTULO_DA_ETAPA[ultima], quandoISO: new Date(this.agora()).toISOString() }
        : null,
      proximaPendente: pendente ? { tipo: pendente, rotulo: ROTULO_DA_ETAPA[pendente] } : null,
    }
  }

  /** Recusa como o servidor recusaria: quem não pode, não passa. */
  private exigirPoder(poder: (papel?: string) => boolean, oQue: string): void {
    if (!poder(this.sessao?.papel)) {
      throw new Error(`Você não tem permissão para ${oQue}.`)
    }
  }

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

  async atividades(eventoId: string): Promise<AtividadesDoEvento> {
    await this.rede()
    this.exigirSessao()
    this.exigirPoder(podeAcompanhar, 'acompanhar o evento')

    const evento = EVENTOS_DO_PAINEL.find(e => e.eventoId === eventoId)
      ?? EVENTOS_DO_PAINEL[0]!

    /*
     * O log junta o que já estava gravado com o que foi registrado nesta
     * sessão — pelo scanner ou pela tela de registrar ponto. Sem isso, quem
     * acabou de bater uma entrada não a veria aparecer aqui, e concluiria que
     * ela não gravou.
     */
    const desteUso: LinhaDaAtividade[] = []
    for (const [id, etapas] of this.batidasDaEquipe) {
      const pessoa = EQUIPE_DE_MENTIRA.find(p => p.id === id)
      if (!pessoa) continue
      for (const etapa of etapas) {
        desteUso.push({
          id: `${id}-${etapa}`,
          nome: pessoa.nome,
          cpf: pessoa.cpf,
          setor: pessoa.setor,
          etapa,
          em: new Date(this.agora()).toISOString(),
          como: 'qr',
          local: null,
          registradoPor: null,
          justificativa: null,
        })
      }
    }

    const linhas = [...desteUso, ...ATIVIDADES_DE_MENTIRA]
      .sort((a, b) => Date.parse(b.em) - Date.parse(a.em))
      .slice(0, TETO_DO_LOG)

    const porEtapa: Record<TipoBatida, number> = { entrada: 0, meio: 0, fim: 0 }
    for (const l of linhas) porEtapa[l.etapa] += 1

    // Quem entrou e ainda não saiu — o número que o produtor pergunta no rádio.
    const entraram = new Set(linhas.filter(l => l.etapa === 'entrada').map(l => l.cpf))
    const sairam = new Set(linhas.filter(l => l.etapa === 'fim').map(l => l.cpf))

    const ativos = EQUIPE_DE_MENTIRA.filter(p => p.ativo)
    const comoLista = (p: (typeof EQUIPE_DE_MENTIRA)[number]): PessoaDaLista => ({
      id: p.id, nome: p.nome, setor: p.setor, telefone: '27999255959',
    })

    const naoChegaram = ativos.filter(p => !entraram.has(p.cpf)).map(comoLista)
    const aindaNoEvento = ativos
      .filter(p => entraram.has(p.cpf) && !sairam.has(p.cpf))
      .map(comoLista)

    const hoje = diaBRT(new Date(this.agora()))
    const batidasHoje = linhas.filter(l => diaBRT(l.em) === hoje).length

    return {
      eventoId: evento.eventoId,
      eventoNome: evento.nome,
      indicadores: [
        { chave: 'batidas_hoje', rotulo: 'Batidas hoje', valor: batidasHoje, tom: 'acento' },
        {
          chave: 'presentes',
          rotulo: 'Presentes agora',
          valor: aindaNoEvento.length,
          sub: `de ${ativos.length} na equipe`,
          tom: 'sucesso',
        },
        { chave: 'nao_chegaram', rotulo: 'Ainda não chegaram', valor: naoChegaram.length, tom: 'aviso' },
        { chave: 'sairam', rotulo: 'Já saíram', valor: sairam.size, tom: 'info' },
      ],
      linhas,
      porEtapa,
      naoChegaram,
      aindaNoEvento,
      noTeto: linhas.length >= TETO_DO_LOG,
    }
  }

  // ── O evento por dentro ───────────────────────────────────────────────────

  async evento(eventoId: string): Promise<EventoDetalhado> {
    await this.rede()
    this.exigirSessao()
    this.exigirPoder(podeGerenciarEventos, 'abrir a configuração do evento')

    const base = EVENTOS_DO_PAINEL.find(e => e.eventoId === eventoId)
    if (!base) throw new Error('Não encontramos este evento.')

    const setores = (SETORES_DE_MENTIRA[eventoId] ?? []).map(s => this.paraSetor(s))
    const totalPessoas = setores.reduce((a, s) => a + s.pessoas, 0)

    /*
     * O progresso conta PESSOAS, não batidas.
     *
     * Quem bateu entrada duas vezes continua sendo uma pessoa que entrou. A
     * pergunta da tela é "quantos dos 109 já passaram por cada etapa", e ela só
     * faz sentido contando gente.
     */
    const porEtapa = (etapa: TipoBatida) =>
      [...this.batidasDaEquipe.values()].filter(e => e.has(etapa)).length

    const entraram = porEtapa('entrada')
    const sairam = porEtapa('fim')

    return {
      eventoId: base.eventoId,
      nome: base.nome,
      ativo: base.aoVivo,
      local: base.local,
      dataInicio: base.dataInicio,
      dataFim: null,
      diasDePreparacao: eventoId === 'ev-1' ? DIAS.filter(d => d.tipo === 'preparacao').length : 0,
      indicadores: [
        { chave: 'setores', rotulo: 'Setores', valor: setores.length, tom: 'acento' },
        { chave: 'funcionarios', rotulo: 'Funcionários', valor: totalPessoas, tom: 'info' },
        {
          chave: 'presentes',
          rotulo: 'Presentes agora',
          valor: Math.max(0, entraram - sairam),
          tom: 'sucesso',
        },
        {
          chave: 'nao_chegaram',
          rotulo: 'Ainda não chegaram',
          valor: Math.max(0, totalPessoas - entraram),
          tom: 'aviso',
        },
      ],
      progresso: [
        { etapa: 'entrada', feitos: entraram, total: totalPessoas },
        { etapa: 'meio', feitos: porEtapa('meio'), total: totalPessoas },
        { etapa: 'fim', feitos: sairam, total: totalPessoas },
      ],
      portaria: this.portariaDe(eventoId),
      setores,
      totalPessoas,
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
    dados: { nome: string; estimado?: number | null; valorPorPessoa?: number | null },
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

    const novo = {
      setorId: `s-${Math.random().toString(16).slice(2, 8)}`,
      nome,
      pessoas: 0,
      estimado: dados.estimado ?? null,
      valorPorPessoa: dados.valorPorPessoa ?? null,
      token: `f-${Math.random().toString(16).slice(2, 8)}`,
      supervisores: [],
    }
    lista.push(novo)
    return { setor: this.paraSetor(novo) }
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
    const resultado: ResultadoDosDias = {
      dias: cfg.preparacao.length,
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
      estimado: s.estimado,
      valorPorPessoa: s.valorPorPessoa,
      linkDoFormulario: `${ENDERECO_DO_FORMULARIO}/${s.token}`,
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
      valorReceber: achado.setor.valorPorPessoa ?? 0,
    }))

    const contar = (campo: 'entrada' | 'meio' | 'fim') => pessoas.filter(p => p[campo]).length
    const comPendencia = pessoas.filter(
      p => p.statusEntrada === 'fechado' || p.statusMeio === 'fechado' || p.statusFim === 'fechado',
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
    const dias: DiaDaParticipacao[] = datas.map(data => ({
      data,
      etapa: faseDoDia(data, diaPrincipal),
      entrada: null,
      meioEsperado: null,
      meio: null,
      meioAtrasoMin: null,
      saida: null,
      compareceu: false,
      horas: null,
    }))

    return {
      participacaoId,
      nome: pessoa.nome,
      cpf: pessoa.cpf,
      telefone: pessoa.telefone,
      fotoUrl: pessoa.fotoUrl,
      empresa: pessoa.empresa,
      funcao: pessoa.funcao,
      eventoNome: evento.nome,
      setorId: setor.setorId,
      setorNome: setor.nome,
      ativo: pessoa.ativo,
      valorReceber: this.valores.get(participacaoId) ?? pessoa.valorReceber,
      pago: this.pagamentos.has(participacaoId),
      pagoEm: this.pagamentos.get(participacaoId) ?? null,
      chavePix: pessoa.telefone,
      presencaHoje: { entrada: pessoa.entrada, meio: pessoa.meio, fim: pessoa.fim },
      dias,
      outrosSetores: (SETORES_DE_MENTIRA[eventoId] ?? [])
        .filter(x => x.setorId !== setor.setorId)
        .map(x => ({ setorId: x.setorId, nome: x.nome })),
      podeMover: podeGerenciarEventos(this.sessao?.papel),
      podeTornarSupervisor: podeGerenciarUsuarios(this.sessao?.papel),
    }
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
    })
    return {}
  }

  async marcarPagamento(participacaoId: string, pago: boolean) {
    await this.rede()
    this.exigirSessao()
    this.exigirPoder(podeGerenciarEventos, 'mexer no pagamento')

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
    this.exigirPoder(podeGerenciarEventos, 'mexer no valor')

    if (!this.acharNoSetor(participacaoId)) return { erro: 'Não encontramos esta pessoa.' }
    if (!Number.isFinite(valor) || valor < 0) return { erro: 'O valor precisa ser zero ou mais.' }

    this.valores.set(participacaoId, valor)
    return {}
  }

  /** Acha a pessoa em qualquer setor de qualquer evento. */
  private acharNoSetor(participacaoId: string) {
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

  async criarAcesso(dados: NovoAcesso) {
    await this.rede()
    this.exigirSessao()
    this.exigirPoder(podeGerenciarUsuarios, 'criar acessos')

    const nome = (dados.nome ?? '').trim()
    const cpf = (dados.cpf ?? '').replace(/\D/g, '')

    if (nome.length < 3) return { erro: 'Digite o nome completo da pessoa.' }
    if (cpf.length !== 11) return { erro: 'O CPF precisa ter 11 dígitos.' }
    if (!dados.setorId) return { erro: 'Escolha o setor do supervisor.' }

    // O CPF é a chave de identidade: dois acessos com o mesmo CPF fariam duas
    // pessoas diferentes entrarem na mesma conta.
    if (ACESSOS_DE_MENTIRA.some(a => a.identificador.replace(/\D/g, '') === cpf)) {
      return { erro: 'Já existe um acesso com este CPF.' }
    }

    const setor = Object.values(SETORES_DE_MENTIRA)
      .flat()
      .find(x => x.setorId === dados.setorId)

    const novo: Acesso = {
      id: `u-${ACESSOS_DE_MENTIRA.length + 1}`,
      nome,
      identificador: formatCpf(cpf),
      papel: 'supervisor',
      ativo: dados.ativo,
      setorNome: setor?.nome ?? null,
      eventos: 1,
      criadoEm: new Date(this.agora()).toISOString(),
      souEu: false,
    }

    ACESSOS_DE_MENTIRA.push({ ...novo })
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
      etapa: faseDoDia(hoje, diaBRT(EVENTO.dataInicio)),
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
