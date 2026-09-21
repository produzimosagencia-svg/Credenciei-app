// Relatórios — presença/ponto da equipe em planilha. Não é financeiro,
// apesar do nome parecer: quem entrou, quem saiu, quando, em qual setor.
//
// ─── A PLANILHA É GERADA AQUI, NÃO NO CELULAR ───────────────────────────────
//
// O app só recebe `{ nome, url }` e compartilha. O arquivo em si sobe para
// o Storage (ver `Arquivos`, em `arquivos.ts`/`arquivos-supabase.ts`) e o
// link volta pronto para compartilhar — o app nunca vê os bytes.

import { diaBRT, ehMaster, podeGerenciarEventos } from '@credenciei/dominio'
import type {
  ArquivoDePlanilha, EventoEscaneavel, Periodo, QuemNoRelatorio, ResumoDeRelatorios,
} from '@credenciei/contrato'
import JSZip from 'jszip'
import type { Arquivos } from '../arquivos.js'
import { gerarXlsx } from '../planilha.js'
import type { LinhaDoDia, Perfil, Repositorio } from '../dados/repositorio.js'

async function exigirAcessoAoRelatorio(
  repo: Repositorio, pessoaId: string, eventoId: string,
): Promise<{ perfil: Perfil; setoresPermitidos: string[] | null }> {
  const perfil = await repo.perfilPorId(pessoaId)
  if (!perfil) throw new Error('Sem permissão para gerar relatórios.')

  if (perfil.papel === 'supervisor') {
    const equipe = await repo.equipeDoSupervisor(pessoaId)
    if (!equipe || equipe.eventoId !== eventoId) throw new Error('Sem permissão sobre este evento.')
    return { perfil, setoresPermitidos: [equipe.id] }
  }

  if (!podeGerenciarEventos(perfil.papel)) throw new Error('Sem permissão para gerar relatórios.')
  const evento = await repo.eventoPorId(eventoId)
  if (!evento || (!ehMaster(perfil.papel) && evento.organizacaoId !== perfil.organizacaoId)) {
    throw new Error('Evento não encontrado.')
  }
  return { perfil, setoresPermitidos: null }
}

export async function eventosParaRelatorios(repo: Repositorio, pessoaId: string): Promise<EventoEscaneavel[]> {
  const perfil = await repo.perfilPorId(pessoaId)
  if (!perfil) throw new Error('Sem permissão para gerar relatórios.')

  if (perfil.papel === 'supervisor') {
    const equipe = await repo.equipeDoSupervisor(pessoaId)
    if (!equipe) return []
    const evento = await repo.eventoPorId(equipe.eventoId)
    return evento?.ativo ? [{ eventoId: evento.id, nome: evento.nome }] : []
  }

  if (!podeGerenciarEventos(perfil.papel)) throw new Error('Sem permissão para gerar relatórios.')
  const eventos = await repo.eventosComContagens(ehMaster(perfil.papel) ? {} : { organizacaoId: perfil.organizacaoId })
  return eventos.filter(e => e.ativo).map(e => ({ eventoId: e.id, nome: e.nome }))
}

export async function resumoDeRelatorios(
  repo: Repositorio, pessoaId: string, eventoId: string,
): Promise<ResumoDeRelatorios> {
  const { setoresPermitidos } = await exigirAcessoAoRelatorio(repo, pessoaId, eventoId)
  const evento = await repo.eventoPorId(eventoId)
  if (!evento) throw new Error('Evento não encontrado.')

  const todos = await repo.equipesDoEvento(eventoId)
  const visiveis = setoresPermitidos ? todos.filter(s => setoresPermitidos.includes(s.setorId)) : todos

  const dias = (await repo.diasDoEvento(eventoId)).map(d => d.data).sort()
  const de = dias[0] ?? (evento.dataInicio ? diaBRT(evento.dataInicio) : diaBRT())
  const ate = dias[dias.length - 1] ?? de

  let totalFuncionarios = 0
  for (const s of visiveis) totalFuncionarios += (await repo.participacoesDaEquipe(s.setorId)).length

  return {
    eventoNome: evento.nome,
    periodoCompleto: { de, ate },
    setores: visiveis.map(s => ({ setorId: s.setorId, nome: s.nome })),
    totalFuncionarios,
  }
}

// ─── Montar as linhas ───────────────────────────────────────────────────────

type LinhaComDia = LinhaDoDia & { dia: string }

async function linhasDoPeriodo(
  repo: Repositorio, eventoId: string, periodo: Periodo, setorId?: string,
): Promise<LinhaComDia[]> {
  const dias = (await repo.diasDoEvento(eventoId))
    .map(d => d.data)
    .filter(d => d >= periodo.de && d <= periodo.ate)
    .sort()

  const linhas: LinhaComDia[] = []
  for (const dia of dias) {
    const doDia = await repo.linhasDoEventoNoDia(eventoId, dia, setorId)
    for (const l of doDia) linhas.push({ ...l, dia })
  }
  return linhas
}

/**
 * "Ausentes" é o AVESSO de "credenciados": uma linha por pessoa que nunca
 * bateu entrada em NENHUM dia do período — não uma linha por dia. Quem
 * nunca apareceu não tem "dia da falta", tem a falta inteira.
 */
function paraQuem(linhas: LinhaComDia[], quem: QuemNoRelatorio): LinhaComDia[] {
  if (quem === 'credenciados') return linhas

  const porPessoa = new Map<string, LinhaComDia>()
  const teveEntrada = new Set<string>()
  for (const l of linhas) {
    if (!porPessoa.has(l.participacaoId)) porPessoa.set(l.participacaoId, l)
    if (l.entrada) teveEntrada.add(l.participacaoId)
  }
  return [...porPessoa.values()].filter(l => !teveEntrada.has(l.participacaoId))
}

function nomeDoArquivo(base: string, periodo: Periodo, quem: QuemNoRelatorio, extensao: string): string {
  const sufixo = quem === 'ausentes' ? '-ausentes' : ''
  return `relatorio-${base}-${periodo.de}-a-${periodo.ate}${sufixo}.${extensao}`
}

async function planilhaDasLinhas(nomeDaAba: string, linhas: LinhaComDia[], quem: QuemNoRelatorio): Promise<Buffer> {
  if (quem === 'credenciados') {
    return gerarXlsx(
      nomeDaAba,
      [
        { header: 'Nome', key: 'nome', width: 28 },
        { header: 'CPF', key: 'cpf', width: 16 },
        { header: 'Setor', key: 'setor', width: 20 },
        { header: 'Dia', key: 'dia', width: 12 },
        { header: 'Entrada', key: 'entrada', width: 20 },
        { header: 'Meio', key: 'meio', width: 20 },
        { header: 'Saída', key: 'saida', width: 20 },
      ],
      linhas.map(l => ({
        nome: l.nome, cpf: l.cpf, setor: l.setorNome, dia: l.dia,
        entrada: l.entrada?.em ?? '', meio: l.meio?.em ?? '', saida: l.fim?.em ?? '',
      })),
    )
  }

  return gerarXlsx(
    nomeDaAba,
    [
      { header: 'Nome', key: 'nome', width: 28 },
      { header: 'CPF', key: 'cpf', width: 16 },
      { header: 'Setor', key: 'setor', width: 20 },
    ],
    linhas.map(l => ({ nome: l.nome, cpf: l.cpf, setor: l.setorNome })),
  )
}

/*
 * O caminho no Storage leva o EVENTO na frente — `nome` sozinho (ver
 * `nomeDoArquivo`) não é único entre eventos diferentes quando a base é o
 * nome do setor ("Produção" existe em vários eventos). Sem o evento na
 * frente, o relatório de um pisaria no do outro.
 */
async function paraArquivo(
  arquivos: Arquivos, eventoId: string, nome: string, tipo: string, bytes: Buffer,
): Promise<ArquivoDePlanilha> {
  const url = await arquivos.guardar(`${eventoId}/${nome}`, tipo, bytes)
  return { nome, url }
}

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

export async function relatorioDoEvento(
  repo: Repositorio, pessoaId: string, eventoId: string, periodo: Periodo, quem: QuemNoRelatorio, arquivos: Arquivos,
): Promise<ArquivoDePlanilha> {
  const { setoresPermitidos } = await exigirAcessoAoRelatorio(repo, pessoaId, eventoId)
  if (setoresPermitidos) throw new Error('O relatório completo é só para quem gerencia o evento inteiro.')

  const linhas = paraQuem(await linhasDoPeriodo(repo, eventoId, periodo), quem)
  const bytes = await planilhaDasLinhas('Relatório', linhas, quem)
  return paraArquivo(arquivos, eventoId, nomeDoArquivo(eventoId, periodo, quem, 'xlsx'), XLSX_MIME, bytes)
}

export async function relatorioDoSetor(
  repo: Repositorio, pessoaId: string, eventoId: string, setorId: string, periodo: Periodo, quem: QuemNoRelatorio,
  arquivos: Arquivos,
): Promise<ArquivoDePlanilha> {
  const { setoresPermitidos } = await exigirAcessoAoRelatorio(repo, pessoaId, eventoId)
  if (setoresPermitidos && !setoresPermitidos.includes(setorId)) throw new Error('Sem permissão sobre este setor.')

  const setores = await repo.equipesDoEvento(eventoId)
  const setor = setores.find(s => s.setorId === setorId)
  if (!setor) throw new Error('Setor não encontrado.')

  const linhas = paraQuem(await linhasDoPeriodo(repo, eventoId, periodo, setorId), quem)
  const bytes = await planilhaDasLinhas(setor.nome, linhas, quem)
  return paraArquivo(arquivos, eventoId, nomeDoArquivo(setor.nome, periodo, quem, 'xlsx'), XLSX_MIME, bytes)
}

/** Todos os setores, um arquivo por setor, num .zip — mesmo alcance do relatório completo. */
export async function relatoriosPorSetorZip(
  repo: Repositorio, pessoaId: string, eventoId: string, periodo: Periodo, quem: QuemNoRelatorio, arquivos: Arquivos,
): Promise<ArquivoDePlanilha> {
  const { setoresPermitidos } = await exigirAcessoAoRelatorio(repo, pessoaId, eventoId)
  if (setoresPermitidos) throw new Error('O relatório completo é só para quem gerencia o evento inteiro.')

  const setores = await repo.equipesDoEvento(eventoId)
  const zip = new JSZip()
  const usados = new Set<string>()

  for (const setor of setores) {
    const linhas = paraQuem(await linhasDoPeriodo(repo, eventoId, periodo, setor.setorId), quem)
    const bytes = await planilhaDasLinhas(setor.nome, linhas, quem)
    // Dois setores podem ter o mesmo nome no cadastro — desempata para o
    // zip não perder um arquivo por cima do outro.
    let nomeNoZip = `${setor.nome}.xlsx`
    let n = 2
    while (usados.has(nomeNoZip)) { nomeNoZip = `${setor.nome} (${n}).xlsx`; n += 1 }
    usados.add(nomeNoZip)
    zip.file(nomeNoZip, bytes)
  }

  const bytesDoZip = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
  return paraArquivo(arquivos, eventoId, nomeDoArquivo(eventoId, periodo, quem, 'zip'), 'application/zip', bytesDoZip)
}
