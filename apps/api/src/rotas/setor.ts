// A equipe de UM setor — a tela que o admin abre para ver, buscar e filtrar
// quem está ali, com o estado de cada etapa AGORA.
//
// ─── DIFERENTE DO PAINEL DO SUPERVISOR ──────────────────────────────────────
//
// `equipe.ts` (`painelDaEquipe`) é a visão de UM supervisor sobre A PRÓPRIA
// equipe, sempre a mesma pessoa logada, com uma única pendência por vez.
// Esta aqui é a visão do ADMIN sobre QUALQUER setor por id, com os QUATRO
// estados de cada etapa (`StatusDaEtapa`) — o admin decide o que fazer com
// quem está "fechado"; o supervisor só precisa saber o que falta AGORA.

import { diaBRT, ehMaster, formatCpf, janelaMeio, podeAcompanhar, podeGerenciarEventos, validarCpf } from '@credenciei/dominio'
import type { EquipeDoSetor, PessoaDoSetor, ResultadoDaImportacao, StatusDaEtapa } from '@credenciei/contrato'
import type { Arquivos } from '../arquivos.js'
import { gerarXlsx, lerXlsxDeEquipe } from '../planilha.js'
import type { Evento, Perfil, Repositorio } from '../dados/repositorio.js'

/**
 * Leitura da equipe: master vê tudo; quem acompanha fica preso à
 * organização; supervisor só o PRÓPRIO setor — `equipeDoSupervisor` resolve
 * qual é. "Não encontramos este setor" serve pra id inexistente e pra id
 * fora do alcance, de propósito.
 */
async function exigirAcessoAoSetor(
  repo: Repositorio, pessoaId: string, setorId: string,
): Promise<{ perfil: Perfil; setor: { setorId: string; nome: string; eventoId: string }; evento: Evento }> {
  const perfil = await repo.perfilPorId(pessoaId)
  if (!perfil || !podeAcompanhar(perfil)) throw new Error('Você não tem permissão para ver esta equipe.')

  const setor = await repo.setorPorId(setorId)
  if (!setor) throw new Error('Não encontramos este setor.')
  const evento = await repo.eventoPorId(setor.eventoId)
  if (!evento) throw new Error('Não encontramos este setor.')

  if (perfil.papel === 'supervisor') {
    const equipe = await repo.equipeDoSupervisor(pessoaId)
    if (!equipe || equipe.id !== setorId) throw new Error('Não encontramos este setor.')
  } else if (!ehMaster(perfil.papel) && evento.organizacaoId !== perfil.organizacaoId) {
    throw new Error('Não encontramos este setor.')
  }

  return { perfil, setor, evento }
}

export async function equipeDoSetor(
  repo: Repositorio, pessoaId: string, setorId: string, agora: Date = new Date(),
): Promise<EquipeDoSetor> {
  const { perfil, setor, evento } = await exigirAcessoAoSetor(repo, pessoaId, setorId)

  const membros = await repo.participacoesDaEquipe(setorId)
  const hoje = diaBRT(agora)

  /*
   * Fora do dia PRINCIPAL, entrada e saída são livres (dia de montagem ou
   * desmontagem) — sem janela para comparar, a etapa fica sempre "aberto".
   * Olha o TIPO gravado para hoje, não uma comparação com `dataInicio`: um
   * evento que atravessa a meia-noite tem a janela de saída carimbada no dia
   * SEGUINTE, e esse dia pode estar marcado como preparação — comparar com
   * `dataInicio` sozinho classificaria a madrugada errado.
   *
   * LIMITE CONHECIDO: mesmo assim, a virada da meia-noite pode marcar "fora
   * do principal" um instante em que a saída ainda devia valer — o site
   * resolve isto com um cálculo de "turno" próprio (`TETO_TURNO_H`) que esta
   * tela ainda não replica. Ver `docs/backlog.md`.
   */
  const diaDeHoje = (await repo.diasDoEvento(evento.id)).find(d => d.data === hoje)
  const diaPrincipal = diaDeHoje?.tipo === 'principal'
  const janelaEntrada = diaPrincipal
    ? { inicio: evento.janela_entrada_inicio, fim: evento.janela_entrada_fim }
    : null
  const janelaSaida = diaPrincipal
    ? { inicio: evento.janela_fim_inicio, fim: evento.janela_fim_fim }
    : null

  const pessoas: PessoaDoSetor[] = []
  for (const m of membros) {
    const [doDia, contestacoes] = await Promise.all([
      repo.registrosDoDia(m.id, hoje),
      repo.contestacoesAbertas(m.id),
    ])
    const pega = (t: 'entrada' | 'meio' | 'fim') => doDia.find(r => r.tipo === t)?.registradoEm ?? null
    const entrada = pega('entrada')
    const meio = pega('meio')
    const fim = pega('fim')

    // A janela do meio é SEMPRE a entrada + 4h — não existe horário
    // configurado para ela em lugar nenhum, nem no dia principal.
    const janelaDoMeio = entrada ? janelaMeio(entrada) : null

    pessoas.push({
      participacaoId: m.id,
      nome: m.pessoa.nome,
      cpf: m.pessoa.cpf,
      telefone: m.pessoa.telefone,
      empresa: m.empresa ?? null,
      funcao: m.funcao,
      fotoUrl: m.pessoa.fotoPath,
      ativo: m.ativo,
      valorReceber: m.valorReceber ?? 0,
      pago: m.pago,
      entrada,
      meio,
      fim,
      statusEntrada: statusDaEtapa(entrada, janelaEntrada?.inicio, janelaEntrada?.fim, agora),
      statusMeio: statusDaEtapa(meio, janelaDoMeio?.inicio, janelaDoMeio?.fim, agora),
      statusFim: statusDaEtapa(fim, janelaSaida?.inicio, janelaSaida?.fim, agora),
      // Batida que a própria pessoa contestou como errada ou faltando — vira
      // pendência aqui até alguém marcar como resolvida na ficha dela.
      temContestacaoAberta: contestacoes.length > 0,
    })
  }

  pessoas.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))

  const contar = (campo: 'entrada' | 'meio' | 'fim') => pessoas.filter(p => p[campo]).length
  const comPendencia = pessoas.filter(
    p => p.statusEntrada === 'fechado' || p.statusMeio === 'fechado' || p.statusFim === 'fechado'
      || p.temContestacaoAberta,
  ).length

  return {
    setorId,
    setorNome: setor.nome,
    eventoId: evento.id,
    eventoNome: evento.nome,
    indicadores: [
      { chave: 'total', rotulo: 'Total', valor: pessoas.length, tom: 'info' },
      { chave: 'pendencias', rotulo: 'Com pendências', valor: comPendencia, tom: 'aviso' },
      /*
       * Escondido do supervisor — mesma regra do site: quanto a produção
       * paga pela equipe não é informação dele, só de quem gerencia.
       */
      ...(perfil.papel === 'supervisor'
        ? []
        : [{
            chave: 'a_receber', rotulo: 'A receber (equipe)',
            valor: pessoas.reduce((a, p) => a + p.valorReceber, 0), tom: 'acento' as const,
          }]),
    ],
    progresso: [
      { etapa: 'entrada' as const, feitos: contar('entrada'), total: pessoas.length },
      { etapa: 'meio' as const, feitos: contar('meio'), total: pessoas.length },
      { etapa: 'fim' as const, feitos: contar('fim'), total: pessoas.length },
    ],
    pessoas,
  }
}

/**
 * O estado de UMA etapa, AGORA — ver `StatusDaEtapa` no contrato.
 *
 *   já registrou             → 'feito'
 *   sem janela para comparar → 'aberto' (livre, ou a etapa nem se aplica)
 *   antes da janela abrir    → 'indefinido'
 *   depois da janela fechar  → 'fechado' — a pendência
 *   dentro da janela         → 'aberto'
 */
function statusDaEtapa(
  feito: string | null,
  inicio: string | null | undefined,
  fim: string | null | undefined,
  agora: Date,
): StatusDaEtapa {
  if (feito) return 'feito'
  if (!inicio || !fim) return 'aberto'
  const t = agora.getTime()
  if (t < new Date(inicio).getTime()) return 'indefinido'
  if (t > new Date(fim).getTime()) return 'fechado'
  return 'aberto'
}

// ── Planilhas ────────────────────────────────────────────────────────────

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

const COLUNAS_DO_MODELO = [
  { header: 'Nome', key: 'Nome', width: 28 },
  { header: 'CPF', key: 'CPF', width: 16 },
  { header: 'Telefone', key: 'Telefone', width: 16 },
  { header: 'Cargo', key: 'Cargo', width: 18 },
  { header: 'Cidade', key: 'Cidade', width: 20 },
  { header: 'Valor a receber', key: 'Valor a receber', width: 16 },
]

/** O modelo em branco — só o cabeçalho, com as colunas que a importação espera. */
export async function baixarModelo(
  repo: Repositorio, pessoaId: string, arquivos: Arquivos,
): Promise<{ nome: string; url: string } | { erro: string }> {
  const perfil = await repo.perfilPorId(pessoaId)
  if (!perfil || !podeGerenciarEventos(perfil.papel)) return { erro: 'Você não tem permissão para baixar o modelo.' }

  const bytes = await gerarXlsx('Modelo', COLUNAS_DO_MODELO, [])
  const nome = 'modelo-importacao.xlsx'
  const url = await arquivos.guardar(`modelos/${nome}`, XLSX_MIME, bytes)
  return { nome, url }
}

/**
 * A equipe do setor em planilha — cópia do site's `exportarPlanilhaDeEquipe`,
 * gerada no servidor (o app segue o mesmo padrão dos relatórios: só recebe
 * `{ nome, url }` e compartilha, nunca os bytes).
 */
export async function exportarEquipe(
  repo: Repositorio, pessoaId: string, setorId: string, arquivos: Arquivos, opcoes: { dia?: string } = {},
): Promise<{ nome: string; url: string }> {
  const { setor, evento } = await exigirAcessoAoSetor(repo, pessoaId, setorId)
  const membros = await repo.participacoesDaEquipe(setorId)

  const colunas = [
    { header: 'Nome', key: 'nome', width: 28 },
    { header: 'CPF', key: 'cpf', width: 16 },
    { header: 'Telefone', key: 'telefone', width: 16 },
    { header: 'Cargo', key: 'cargo', width: 18 },
    { header: 'Valor a receber', key: 'valor', width: 16 },
    { header: 'Pago', key: 'pago', width: 8 },
    { header: 'Ativo', key: 'ativo', width: 8 },
  ]

  const linhas: Record<string, string | number>[] = []
  for (const m of membros) {
    let entrada = ''
    if (opcoes.dia) {
      const registros = await repo.registrosDoDia(m.id, opcoes.dia)
      entrada = registros.find(r => r.tipo === 'entrada')?.registradoEm ?? ''
    }
    linhas.push({
      nome: m.pessoa.nome,
      cpf: formatCpf(m.pessoa.cpf),
      telefone: m.pessoa.telefone ?? '',
      cargo: m.funcao ?? '',
      valor: m.valorReceber ?? '',
      pago: m.pago ? 'Sim' : 'Não',
      ativo: m.ativo ? 'Sim' : 'Não',
      ...(opcoes.dia ? { Entrada: entrada } : {}),
    })
  }
  if (opcoes.dia) colunas.push({ header: 'Entrada', key: 'Entrada', width: 20 })

  const bytes = await gerarXlsx(setor.nome, colunas, linhas)
  const sufixo = opcoes.dia ? `-${opcoes.dia}` : ''
  const nome = `equipe-${setor.nome}${sufixo}.xlsx`.replace(/[\\/:*?"<>|]/g, '')
  const url = await arquivos.guardar(`${evento.id}/${nome}`, XLSX_MIME, bytes)
  return { nome, url }
}

/**
 * Importa a equipe de uma planilha — cópia (reduzida) do site's
 * `importarFuncionarios`: valida CPF, ignora duplicado (na própria planilha
 * e contra quem já está no evento), e diz o que entrou e o que ficou de
 * fora. Fora desta versão, de propósito: sincronizar com Google Sheets e
 * agendar WhatsApp de boas-vindas — o app não manda WhatsApp (ver
 * CLAUDE.md), e não existe planilha espelho aqui.
 */
export async function importarPlanilha(
  repo: Repositorio, pessoaId: string, setorId: string, arquivoBase64: string,
): Promise<{ resultado?: ResultadoDaImportacao; erro?: string }> {
  const { perfil, setor } = await exigirAcessoAoSetor(repo, pessoaId, setorId)
  if (!podeGerenciarEventos(perfil.papel)) return { erro: 'Você não tem permissão para importar planilha.' }

  if (!arquivoBase64) return { erro: 'O arquivo veio vazio. Escolha de novo.' }

  let linhas
  try {
    linhas = await lerXlsxDeEquipe(Buffer.from(arquivoBase64, 'base64'))
  } catch {
    return { erro: 'Não conseguimos ler este arquivo. Confira se é um .xlsx válido.' }
  }
  if (linhas.length === 0) {
    return { erro: 'A planilha enviada está em um formato que o sistema não reconhece. Confira o arquivo e tente de novo.' }
  }

  const erros: string[] = []
  const vistos = new Set<string>()
  let criados = 0
  let ignorados = 0

  for (const [i, linha] of linhas.entries()) {
    const numero = i + 2 // +1 pelo cabeçalho, +1 porque a contagem é de 1
    const cpf = linha.cpf.replace(/\D/g, '')

    if (!validarCpf(cpf)) {
      erros.push(`Linha ${numero}: CPF inválido (${linha.cpf || 'em branco'}).`)
      ignorados++
      continue
    }
    if (vistos.has(cpf)) {
      erros.push(`Linha ${numero}: ${linha.nome} — CPF repetido na própria planilha.`)
      ignorados++
      continue
    }
    vistos.add(cpf)

    const existente = await repo.participacaoPorCpfNoEvento(setor.eventoId, cpf)
    if (existente) {
      erros.push(`Linha ${numero}: ${linha.nome} já está cadastrado no setor ${existente.setorNome}.`)
      ignorados++
      continue
    }

    const valor = Number.parseFloat(linha.valor.replace(',', '.'))
    await repo.criarParticipacaoDaImportacao({
      equipeId: setorId,
      nome: linha.nome,
      cpf,
      telefone: linha.telefone.replace(/\D/g, '') || null,
      funcao: linha.cargo || null,
      cidade: linha.cidade || null,
      valorReceber: Number.isFinite(valor) && valor > 0 ? valor : 0,
    })
    criados++
  }

  return { resultado: { criados, atualizados: 0, ignorados, erros } }
}
