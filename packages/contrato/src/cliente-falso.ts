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
  ConviteDoEvento, DiaDaParticipacao, EnvioDeBatida, Eu,
  FinanceiroDaParticipacao, PainelDaEquipe, RespostaDeBatida,
  ResumoParticipacao, Sessao,
} from './tipos.js'

export type ComportamentoFalso = {
  /** Atraso artificial, em ms. Zero nos testes, 600 na demonstração. */
  atrasoMs?: number
  /** Fração de chamadas que morrem por "rede". 0 a 1. */
  falhaDeRede?: number
  /** Relógio injetável — sem ele não dá para testar horário sem esperar. */
  agora?: () => number
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

  constructor(c: ComportamentoFalso = {}) {
    this.atrasoMs = c.atrasoMs ?? 0
    this.falhaDeRede = c.falhaDeRede ?? 0
    this.agora = c.agora ?? (() => Date.now())
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
    this.sessao = {
      token: 'token-de-mentira',
      expiraEm: new Date(this.agora() + 3600e3).toISOString(),
      renovacao: 'renovacao-de-mentira',
      papel: 'colaborador',
    }
    void telefone
    return { sessao: this.sessao }
  }

  async renovar(renovacao: string) {
    await this.rede()
    if (renovacao !== 'renovacao-de-mentira') return { erro: 'Sessão expirada. Entre de novo.' }
    this.sessao = { ...this.sessao!, expiraEm: new Date(this.agora() + 3600e3).toISOString() }
    return { sessao: this.sessao }
  }

  async eu(): Promise<Eu> {
    await this.rede()
    this.exigirSessao()
    return {
      pessoaId: 'p-1',
      nome: 'João da Silva',
      cpfFinal: '**94',
      telefone: '27999255959',
      fotoUrl: null,
      papel: 'colaborador',
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
