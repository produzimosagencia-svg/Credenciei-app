// Entrar num evento pelo código, e ver o que é meu.
//
// ─── A REGRA QUE ATRAVESSA ESTE ARQUIVO ─────────────────────────────────────
//
// Nenhuma função aqui recebe id de pessoa vindo de fora. Todas recebem o
// `pessoaId` que o servidor já sabe pela sessão, e filtram por ele.
//
// A diferença parece pequena e é a falha mais comum em APIs: um endpoint que
// aceita `/participacoes/{id}` convida a trocar o número e ver a de outra
// pessoa. Com vinte mil contas, alguém vai testar.

import {
  diaBRT, faseAtualDoQR, faseDoDia, gerarCodigoQR, janelaMeio, lerCodigoDeEvento,
} from '@credenciei/dominio'
import type {
  ConviteDoEvento, DiaDaParticipacao, FinanceiroDaParticipacao, ResumoParticipacao,
} from '@credenciei/contrato'
import { podePassar } from '../limite.js'
import type { Participacao, Repositorio } from '../dados/repositorio.js'

/** Os campos que este evento pede além do que a conta já sabe. */
export type CampoExtra = ConviteDoEvento['camposExtras'][number]

export type FonteDeCampos = (eventoId: string) => Promise<CampoExtra[]>

// ─── Consultar o código ─────────────────────────────────────────────────────

export async function consultarConvite(
  repo: Repositorio,
  campos: FonteDeCampos,
  pessoaId: string,
  codigoDigitado: string,
  agora = Date.now(),
): Promise<{ convite?: ConviteDoEvento; erro?: string }> {
  /*
   * Limite por PESSOA, e apertado.
   *
   * O código tem quatro caracteres — mais de um milhão de combinações, o que
   * resiste a um curioso e não resiste a um script. Vinte tentativas por hora
   * transformam "minutos" em "anos" sem atrapalhar quem digitou errado.
   */
  if (!podePassar(`convite:${pessoaId}`, 20, 60 * 60_000, agora)) {
    return { erro: 'Muitas tentativas com códigos diferentes. Espere um pouco e tente de novo.' }
  }

  const lido = lerCodigoDeEvento(codigoDigitado)
  if (!lido.ok) return { erro: lido.erro }

  const evento = await repo.eventoPorCodigo(lido.codigo)
  if (!evento) {
    return { erro: 'Não encontramos um evento com este código. Confira com quem te enviou.' }
  }

  // Já está dentro: em vez de recusar, a tela precisa saber para levar a pessoa
  // ao evento em vez de pedir o formulário de novo.
  const minhas = await repo.participacoesDaPessoa(pessoaId)
  if (minhas.some(p => p.eventoId === evento.id && !p.descredenciadoEm)) {
    return { erro: 'Você já está neste evento. Ele aparece na sua tela inicial.' }
  }

  return {
    convite: {
      eventoId: evento.id,
      eventoNome: evento.nome,
      organizacaoNome: evento.organizacaoNome ?? '',
      local: evento.local,
      dataInicio: evento.dataInicio ?? '',
      exigeAprovacao: evento.exigeAprovacao,
      camposExtras: await campos(evento.id),
    },
  }
}

// ─── Entrar ─────────────────────────────────────────────────────────────────

export async function entrarNoEvento(
  repo: Repositorio,
  campos: FonteDeCampos,
  pessoaId: string,
  codigoDigitado: string,
  respostas: Record<string, string>,
  novoToken: () => string,
  agora = Date.now(),
): Promise<{ participacao?: ResumoParticipacao; erro?: string }> {
  const c = await consultarConvite(repo, campos, pessoaId, codigoDigitado, agora)
  if (c.erro || !c.convite) return { erro: c.erro ?? 'Código inválido.' }

  const faltando = c.convite.camposExtras.filter(
    x => x.obrigatorio && !(respostas[x.chave] ?? '').trim(),
  )
  if (faltando.length) {
    return { erro: `Preencha: ${faltando.map(f => f.rotulo).join(', ')}.` }
  }

  const criada = await repo.criarParticipacao({
    pessoaId,
    eventoId: c.convite.eventoId,
    equipeId: '',
    equipeNome: '',
    funcao: respostas.funcao ?? null,
    supervisorNome: null,
    /*
     * Quando o evento exige aprovação, a pessoa entra INATIVA.
     *
     * `ativo: false` já é o que impede bater ponto em toda a API — não precisa
     * de um estado novo, e usar o que já existe evita que uma verificação
     * esqueça de considerar o caso.
     */
    ativo: !c.convite.exigeAprovacao,
    descredenciadoEm: null,
    valorReceber: null,
    pago: false,
    pagoEm: null,
    qrToken: novoToken(),
  })

  const evento = await repo.eventoPorId(c.convite.eventoId)
  return { participacao: paraResumo(criada, c.convite, agora, evento?.checkin_autonomo === true) }
}

function paraResumo(
  p: Participacao,
  convite: Pick<ConviteDoEvento, 'eventoNome' | 'local' | 'dataInicio'>,
  agora: number,
  checkinAutonomo: boolean,
): ResumoParticipacao {
  return {
    participacaoId: p.id,
    eventoId: p.eventoId,
    eventoNome: convite.eventoNome,
    local: convite.local,
    dataInicio: convite.dataInicio,
    equipe: p.equipeNome || null,
    funcao: p.funcao,
    supervisor: p.supervisorNome,
    situacao: p.descredenciadoEm ? 'descredenciado' : p.ativo ? 'credenciado' : 'aguardando_aprovacao',
    emAndamento: !p.descredenciadoEm && !!convite.dataInicio
      && diaBRT(new Date(agora)) <= diaBRT(convite.dataInicio),
    checkinAutonomo,
  }
}

// ─── O que é meu ────────────────────────────────────────────────────────────

export async function minhasParticipacoes(
  repo: Repositorio,
  pessoaId: string,
  agora = Date.now(),
): Promise<ResumoParticipacao[]> {
  const minhas = await repo.participacoesDaPessoa(pessoaId)
  const resumos: ResumoParticipacao[] = []

  for (const p of minhas) {
    const e = await repo.eventoPorId(p.eventoId)
    if (!e) continue
    resumos.push(paraResumo(p, {
      eventoNome: e.nome, local: e.local, dataInicio: e.dataInicio ?? '',
    }, agora, e.checkin_autonomo === true))
  }

  // O evento em andamento primeiro, depois do mais recente para o mais antigo:
  // a tela abre no que a pessoa precisa agora.
  return resumos.sort((a, b) =>
    Number(b.emAndamento) - Number(a.emAndamento) || b.dataInicio.localeCompare(a.dataInicio))
}

/**
 * Confere que a participação é de quem está pedindo, e devolve.
 *
 * Uma função só, usada por todo endpoint que recebe `participacaoId`. Espalhar
 * essa verificação seria confiar em ninguém esquecer dela nunca.
 */
async function minhaParticipacao(
  repo: Repositorio,
  pessoaId: string,
  participacaoId: string,
): Promise<Participacao> {
  const p = await repo.participacaoPorId(participacaoId)
  // Mesma resposta para "não existe" e "não é sua": diferenciar entregaria um
  // jeito de varrer ids e descobrir quais existem.
  if (!p || p.pessoaId !== pessoaId) throw new Error('Participação não encontrada.')
  return p
}

export async function meusDias(
  repo: Repositorio,
  pessoaId: string,
  participacaoId: string,
): Promise<DiaDaParticipacao[]> {
  const p = await minhaParticipacao(repo, pessoaId, participacaoId)
  const evento = await repo.eventoPorId(p.eventoId)
  if (!evento) return []

  const dias = await repo.diasDoEvento(p.eventoId)
  const registros = await repo.registrosDaParticipacao(p.id)
  const diaPrincipal = dias.find(d => d.tipo === 'principal')?.data
    ?? (evento.dataInicio ? diaBRT(evento.dataInicio) : '')

  /*
   * Dias com batida que não estão na jornada entram assim mesmo.
   *
   * Acontece quando o produtor desmarca um dia depois de alguém ter trabalhado
   * nele. Esconder a batida seria pior que mostrar um dia fora da escala: o
   * trabalho daquele dia foi feito de qualquer jeito.
   */
  const datas = new Set(dias.map(d => d.data))
  for (const r of registros) datas.add(r.dataRef)

  return [...datas].sort().map(data => {
    const doDia = registros.filter(r => r.dataRef === data)
    const pega = (t: string) => doDia.find(r => r.tipo === t)?.registradoEm ?? null
    const entrada = pega('entrada')
    const meio = pega('meio')
    const saida = pega('fim')
    const janela = entrada ? janelaMeio(entrada) : null

    return {
      data,
      etapa: faseDoDia(data, diaPrincipal),
      entrada,
      meioEsperado: janela?.inicio ?? null,
      meio,
      meioAtrasoMin: meio && janela && Date.parse(meio) > Date.parse(janela.fim)
        ? Math.round((Date.parse(meio) - Date.parse(janela.fim)) / 60_000)
        : null,
      saida,
      compareceu: !!entrada,
      horas: entrada && saida
        ? Math.round(((Date.parse(saida) - Date.parse(entrada)) / 3600e3) * 100) / 100
        : null,
      /*
       * `true` até a Configuração do meio ganhar a mesma leitura defensiva
       * que `batida_livre` já tem (ver `lib/meio.ts` no site e o comentário
       * em `paraEvento`, em supabase.ts). Antes desta coluna existir aqui,
       * `meioExigido` sempre foi `true` — manter o padrão evita esconder o
       * cartão do meio de quem nunca configurou nada.
       */
      meioExigido: true,
    }
  })
}

export async function meuFinanceiro(
  repo: Repositorio,
  pessoaId: string,
  participacaoId: string,
): Promise<FinanceiroDaParticipacao> {
  const p = await minhaParticipacao(repo, pessoaId, participacaoId)
  const dias = await meusDias(repo, pessoaId, participacaoId)
  const trabalhados = dias.filter(d => d.compareceu).length

  return {
    diasTrabalhados: trabalhados,
    /*
     * `null` quando o organizador não definiu valor — e não zero.
     *
     * Zero na tela é uma afirmação: "você não vai receber nada". A tela precisa
     * poder dizer "ainda não definido", que é a verdade.
     */
    valorPrevisto: p.valorReceber === null ? null : p.valorReceber * trabalhados,
    situacao: p.pago ? 'pago' : trabalhados > 0 ? 'em_processamento' : 'pendente',
    pagoEm: p.pagoEm,
  }
}

export async function meuQr(
  repo: Repositorio,
  segredo: string,
  pessoaId: string,
  participacaoId: string,
  agora = new Date(),
): Promise<{ codigo: string; etapa: string }> {
  const p = await minhaParticipacao(repo, pessoaId, participacaoId)
  const evento = await repo.eventoPorId(p.eventoId)
  if (!evento) throw new Error('Evento não encontrado.')

  /*
   * `faseAtualDoQR`, não `faseDoDia`.
   *
   * O crachá tem que continuar válido depois da meia-noite se o evento ainda
   * não terminou de verdade — `faseDoDia` sozinho jogaria a pessoa pra
   * "desmontagem" no instante em que o relógio vira o dia, mesmo com o
   * evento em andamento. Ver `packages/dominio/src/janelas.ts`.
   */
  const etapa = faseAtualDoQR(agora, evento.dataInicio, evento.dataFim)
  const { codigo } = gerarCodigoQR(segredo, p.qrToken, etapa)
  return { codigo, etapa }
}
