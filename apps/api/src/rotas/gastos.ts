// Gastos — produto do Produtor. Isolado do credenciamento de propósito: só
// `produtor` (só os eventos vinculados a ele) e `master` (dando suporte, vê
// tudo) entram. MESMA tabela que o site já usa (`gastos_evento`/
// `produtor_eventos`) — ao contrário de pessoas/funcionarios, este módulo
// nasceu depois da migração 001 e não carrega tradução de schema legado
// nenhuma. Trazido do site em 22/09/2026.

import { categoriaValida, dadosDosGraficosDeGastos, diaBRT, EVENTO_INTERNO, ehMaster, kpisDeGastos, podeRegistrarGastos } from '@credenciei/dominio'
import type {
  DadosDoGasto, EventoParaGasto, FiltroGastos, Gasto, GastoExtraido, PainelDeGastos,
} from '@credenciei/contrato'
import type { Arquivos } from '../arquivos.js'
import { gerarXlsx } from '../planilha.js'
import type { FiltroDeGastosNoRepositorio, GastoNoRepositorio, Perfil, Repositorio } from '../dados/repositorio.js'

/** Injetado (ver `gastos-ia.ts`) pelo mesmo motivo que `EnviarPush` é: o teste não pode depender de chave de API de verdade. */
export type InterpretarAudioDeGasto = (
  audio: Buffer, mime: string, ctx: { eventoNome: string; hoje: string },
) => Promise<GastoExtraido>

const SEM_ACESSO = 'Você não tem acesso ao módulo de Gastos. Fale com o administrador.'

async function exigirAcessoAGastos(repo: Repositorio, pessoaId: string): Promise<Perfil> {
  const perfil = await repo.perfilPorId(pessoaId)
  if (!perfil || !podeRegistrarGastos(perfil)) throw new Error(SEM_ACESSO)
  return perfil
}

/** Os ids de evento (de verdade, sem contar `EVENTO_INTERNO`) que este perfil enxerga em Gastos. */
async function idsDosEventosDoPerfil(repo: Repositorio, perfil: Perfil): Promise<string[]> {
  if (ehMaster(perfil.papel)) {
    const eventos = await repo.eventosComContagens({})
    return eventos.map(e => e.id)
  }
  return repo.eventosDoProdutor(perfil.id)
}

function paraGasto(g: GastoNoRepositorio): Gasto {
  return { ...g }
}

export async function eventosParaGastos(repo: Repositorio, pessoaId: string): Promise<EventoParaGasto[]> {
  const perfil = await exigirAcessoAGastos(repo, pessoaId)
  const ids = await idsDosEventosDoPerfil(repo, perfil)

  const eventos: EventoParaGasto[] = []
  for (const id of ids) {
    const evento = await repo.eventoPorId(id)
    if (evento) eventos.push({ id: evento.id, nome: evento.nome, ativo: evento.ativo })
  }

  // "Interno" sempre por último, sempre disponível — nem todo gasto é de um evento.
  return [...eventos, { id: EVENTO_INTERNO, nome: 'Interno — despesas da empresa', ativo: true }]
}

/**
 * Confere que `eventoId` está no escopo deste perfil — evento de verdade
 * vinculado a ele, ou `EVENTO_INTERNO`, que está sempre disponível.
 */
async function exigirEventoNoEscopo(repo: Repositorio, perfil: Perfil, eventoId: string): Promise<void> {
  if (eventoId === EVENTO_INTERNO) return
  const ids = await idsDosEventosDoPerfil(repo, perfil)
  if (!ids.includes(eventoId)) throw new Error('Esse evento não está disponível pra você.')
}

/**
 * Sem `filtro.eventoId`, devolve todos os eventos que o perfil enxerga, um
 * de cada vez — a mesma limitação que o site NÃO tem (lá é uma consulta só,
 * sem escopo por evento), mas aqui a tabela não guarda "visível pra quem",
 * então o jeito seguro é perguntar evento por evento.
 */
export async function listarGastos(repo: Repositorio, pessoaId: string, filtro: FiltroGastos = {}): Promise<Gasto[]> {
  const perfil = await exigirAcessoAGastos(repo, pessoaId)
  const pago = filtro.pago === undefined ? undefined : filtro.pago === 'true'
  const comuns = { categoria: filtro.categoria, fornecedor: filtro.fornecedor, pago, de: filtro.de, ate: filtro.ate }

  if (filtro.eventoId) {
    await exigirEventoNoEscopo(repo, perfil, filtro.eventoId)
    const f: FiltroDeGastosNoRepositorio = filtro.eventoId === EVENTO_INTERNO
      ? { eventoId: EVENTO_INTERNO, organizacaoIdSeInterno: perfil.organizacaoId, ...comuns }
      : { eventoId: filtro.eventoId, ...comuns }
    return (await repo.listarGastos(f)).map(paraGasto)
  }

  const ids = await idsDosEventosDoPerfil(repo, perfil)
  const listas = await Promise.all([
    ...ids.map(id => repo.listarGastos({ eventoId: id, ...comuns })),
    repo.listarGastos({ eventoId: EVENTO_INTERNO, organizacaoIdSeInterno: perfil.organizacaoId, ...comuns }),
  ])
  const todos = listas.flat()
  todos.sort((a, b) => b.dataGasto.localeCompare(a.dataGasto) || b.registradoEm.localeCompare(a.registradoEm))
  return todos.map(paraGasto)
}

function camposValidados(dados: DadosDoGasto): { erro: string } | { descricao: string; valor: number; categoria: string; dataGasto: string } {
  const descricao = (dados.descricao ?? '').trim()
  if (!descricao) return { erro: 'Diga o que foi o gasto.' }

  if (!Number.isFinite(dados.valor) || dados.valor <= 0) {
    return { erro: 'Informe um valor válido, maior que zero.' }
  }

  const categoria = categoriaValida(dados.categoria) ?? 'Outros'
  const dataGasto = /^\d{4}-\d{2}-\d{2}$/.test(dados.dataGasto ?? '') ? dados.dataGasto : diaBRT()

  return { descricao, valor: dados.valor, categoria, dataGasto }
}

export async function criarGasto(
  repo: Repositorio, pessoaId: string, dados: DadosDoGasto,
): Promise<{ id?: string; erro?: string }> {
  const perfil = await exigirAcessoAGastos(repo, pessoaId)
  try {
    await exigirEventoNoEscopo(repo, perfil, dados.eventoId)
  } catch (e) {
    return { erro: e instanceof Error ? e.message : String(e) }
  }

  const campos = camposValidados(dados)
  if ('erro' in campos) return campos

  const interno = dados.eventoId === EVENTO_INTERNO
  const { id } = await repo.criarGasto({
    eventoId: dados.eventoId,
    organizacaoIdSeInterno: interno ? perfil.organizacaoId : null,
    descricao: campos.descricao,
    valor: campos.valor,
    categoria: campos.categoria,
    dataGasto: campos.dataGasto,
    fornecedor: dados.fornecedor?.trim() || null,
    formaPagamento: dados.formaPagamento?.trim() || null,
    pagador: dados.pagador?.trim() || null,
    pago: dados.pago,
    observacao: dados.observacao?.trim() || null,
    origem: dados.origem,
    transcricao: dados.origem === 'audio' ? dados.transcricao : null,
    comprovanteBase64: dados.comprovanteBase64,
  }, perfil.id)
  return { id }
}

export async function editarGasto(
  repo: Repositorio, pessoaId: string, id: string, dados: DadosDoGasto,
): Promise<{ erro?: string }> {
  const perfil = await exigirAcessoAGastos(repo, pessoaId)
  const atual = await repo.gastoPorId(id)
  if (!atual) return { erro: 'Este gasto não existe mais.' }
  try {
    await exigirEventoNoEscopo(repo, perfil, atual.eventoId)
  } catch (e) {
    return { erro: e instanceof Error ? e.message : String(e) }
  }

  const campos = camposValidados(dados)
  if ('erro' in campos) return campos

  return repo.editarGasto(id, {
    eventoId: atual.eventoId,
    organizacaoIdSeInterno: atual.eventoId === EVENTO_INTERNO ? perfil.organizacaoId : null,
    descricao: campos.descricao,
    valor: campos.valor,
    categoria: campos.categoria,
    dataGasto: campos.dataGasto,
    fornecedor: dados.fornecedor?.trim() || null,
    formaPagamento: dados.formaPagamento?.trim() || null,
    pagador: dados.pagador?.trim() || null,
    pago: dados.pago,
    observacao: dados.observacao?.trim() || null,
    origem: atual.origem,
    transcricao: atual.transcricao,
    comprovanteBase64: dados.comprovanteBase64,
  })
}

export async function excluirGasto(repo: Repositorio, pessoaId: string, id: string): Promise<{ erro?: string }> {
  const perfil = await exigirAcessoAGastos(repo, pessoaId)
  const atual = await repo.gastoPorId(id)
  if (!atual) return { erro: 'Este gasto já não existe.' }
  try {
    await exigirEventoNoEscopo(repo, perfil, atual.eventoId)
  } catch (e) {
    return { erro: e instanceof Error ? e.message : String(e) }
  }
  return repo.excluirGasto(id)
}

export async function urlComprovanteGasto(
  repo: Repositorio, pessoaId: string, id: string,
): Promise<{ url: string | null; erro?: string }> {
  await exigirAcessoAGastos(repo, pessoaId)
  const url = await repo.urlComprovanteGasto(id)
  return { url }
}

/**
 * Manda o áudio pra IA transcrever e extrair os campos. NÃO salva nada — a
 * tela chama `criarGasto` depois que o produtor confirma. `interpretar` é
 * injetado (ver `gastos-ia.ts`) pelo mesmo motivo que `enviarPush` é: o
 * teste não pode depender de uma chave de API de verdade.
 */
export async function transcreverAudioDeGasto(
  repo: Repositorio, pessoaId: string, interpretar: InterpretarAudioDeGasto,
  audioBase64: string, mime: string, eventoId: string,
): Promise<GastoExtraido | { erro: string }> {
  const perfil = await exigirAcessoAGastos(repo, pessoaId)
  try {
    await exigirEventoNoEscopo(repo, perfil, eventoId)
  } catch (e) {
    return { erro: e instanceof Error ? e.message : String(e) }
  }
  if (!audioBase64) return { erro: 'Áudio não recebido. Grave de novo.' }

  const audio = Buffer.from(audioBase64, 'base64')
  // ~15 MB de base64 já é mais de um minuto de áudio.
  if (audio.byteLength > 15 * 1024 * 1024) {
    return { erro: 'O áudio ficou muito longo. Grave um trecho mais curto, só do gasto.' }
  }

  const eventoNome = eventoId === EVENTO_INTERNO
    ? 'Interno — despesas da empresa'
    : (await repo.eventoPorId(eventoId))?.nome ?? 'este evento'

  try {
    return await interpretar(audio, mime, { eventoNome, hoje: diaBRT() })
  } catch (e) {
    return { erro: e instanceof Error ? e.message : 'Não consegui entender o áudio. Tente de novo.' }
  }
}

export async function painelDeGastos(
  repo: Repositorio, pessoaId: string, filtro: FiltroGastos = {},
): Promise<PainelDeGastos> {
  const gastos = await listarGastos(repo, pessoaId, filtro)
  return {
    kpis: kpisDeGastos(gastos, diaBRT()),
    graficos: dadosDosGraficosDeGastos(gastos),
  }
}

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

export async function exportarGastosXlsx(
  repo: Repositorio, pessoaId: string, filtro: FiltroGastos, arquivos: Arquivos,
): Promise<{ nome: string; url: string } | { erro: string }> {
  if (!filtro.eventoId) return { erro: 'Escolha o evento antes de exportar.' }

  let gastos: Gasto[]
  try {
    gastos = await listarGastos(repo, pessoaId, filtro)
  } catch (e) {
    return { erro: e instanceof Error ? e.message : 'Não conseguimos gerar a planilha.' }
  }

  const bytes = await gerarXlsx('Gastos', [
    { header: 'Data', key: 'data', width: 12 },
    { header: 'Descrição', key: 'descricao', width: 36 },
    { header: 'Categoria', key: 'categoria', width: 18 },
    { header: 'Fornecedor', key: 'fornecedor', width: 22 },
    { header: 'Forma de pagamento', key: 'formaPagamento', width: 20 },
    { header: 'Pagador', key: 'pagador', width: 18 },
    { header: 'Valor (R$)', key: 'valor', width: 15 },
    { header: 'Status', key: 'status', width: 14 },
    { header: 'Observação', key: 'observacao', width: 34 },
  ], gastos.map(g => ({
    data: g.dataGasto, descricao: g.descricao, categoria: g.categoria,
    fornecedor: g.fornecedor ?? '', formaPagamento: g.formaPagamento ?? '', pagador: g.pagador ?? '',
    valor: g.valor, status: g.pago ? 'Pago' : 'A pagar', observacao: g.observacao ?? '',
  })))

  const nome = `gastos-${filtro.eventoId}-${diaBRT()}.xlsx`
  const url = await arquivos.guardar(`gastos/${filtro.eventoId}/${nome}`, XLSX_MIME, bytes)
  return { nome, url }
}
