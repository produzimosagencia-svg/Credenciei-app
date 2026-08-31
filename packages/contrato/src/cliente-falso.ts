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
  avaliarEntradaSaida, diaBRT, faseDoDia, gerarCodigoQR, janelaMeio,
  lerCodigoDeEvento,
} from '@credenciei/dominio'
import type { ClienteApi } from './cliente.js'
import type {
  AtividadeRecente, ConviteDoEvento, DiaDaParticipacao, EnvioDeBatida, Eu,
  FinanceiroDaParticipacao, Painel, PainelDaEquipe, RespostaDeBatida,
  ResumoParticipacao, Sessao,
} from './tipos.js'
import type { Papel } from '@credenciei/dominio'

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

const SEGREDO_DE_MENTIRA = 'segredo-do-cliente-falso'

type BatidaGravada = { id: string; tipo: string; em: string; data: string }

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
