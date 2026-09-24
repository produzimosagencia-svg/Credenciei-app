// Orçamentos — a proposta comercial que a agência manda pro cliente.
//
// MESMAS tabelas do site (`orcamentos`/`orcamento_itens`), já em produção.
// Trazido do site em 23/09/2026; ver `lib/orcamentos.ts` e
// `lib/actions-orcamentos.ts` lá, e `docs/decisoes/007`.
//
// SÓ MASTER. Não é zelo exagerado: aqui aparecem o valor da diária, a margem
// e o desconto que a agência dá — dado comercial da própria empresa, não do
// evento. `podeGerenciarOrcamentos` é a mesma capacidade do site, copiada por
// valor em `@credenciei/dominio`.

import {
  descontoQuePodeSerGravado, podeGerenciarOrcamentos, statusDeOrcamentoValido,
  subtotalDoOrcamento, totalDoOrcamento,
} from '@credenciei/dominio'
import type { DadosDoOrcamento, OrcamentoDetalhado, ResumoDoOrcamento } from '@credenciei/contrato'
import type { Arquivos } from '../arquivos.js'
import { montarPdfDoOrcamento, nomeDoPdfDoOrcamento, PDF_MIME } from '../orcamento-pdf.js'
import type {
  NovoOrcamentoNoRepositorio, OrcamentoComItensNoRepositorio, OrcamentoNoRepositorio,
  Perfil, Repositorio,
} from '../dados/repositorio.js'

const SEM_ACESSO = 'Você não tem acesso a Orçamentos. Fale com o master.'

async function exigirOrcamentos(repo: Repositorio, pessoaId: string): Promise<Perfil> {
  const perfil = await repo.perfilPorId(pessoaId)
  if (!perfil || !podeGerenciarOrcamentos(perfil)) throw new Error(SEM_ACESSO)
  return perfil
}

function paraResumo(o: OrcamentoNoRepositorio): ResumoDoOrcamento {
  return {
    id: o.id,
    numero: o.numero,
    nomeEvento: o.nomeEvento,
    responsavel: o.responsavel,
    dataEvento: o.dataEvento,
    status: statusDeOrcamentoValido(o.status),
    valorTotal: o.valorTotal,
    criadoEm: o.criadoEm,
  }
}

/**
 * O total vai RECALCULADO, nunca a coluna `valor_total` gravada.
 *
 * Um orçamento editado por fora do sistema, ou salvo por uma versão antiga do
 * código, deixa a coluna mentindo — e o número errado iria direto pro PDF que
 * chega ao cliente. A listagem usa a coluna porque buscar item de todos sairia
 * caro; quem ABRE um orçamento recebe a conta refeita.
 */
function paraDetalhe(o: OrcamentoComItensNoRepositorio): OrcamentoDetalhado {
  return {
    id: o.id,
    numero: o.numero,
    nomeEvento: o.nomeEvento,
    responsavel: o.responsavel,
    telefone: o.telefone,
    dataEvento: o.dataEvento,
    valorDia: o.valorDia,
    valorFuncionario: o.valorFuncionario,
    valorTecnico: o.valorTecnico,
    dias: o.dias,
    desconto: o.desconto,
    observacoes: o.observacoes,
    status: statusDeOrcamentoValido(o.status),
    itens: o.itens,
    total: totalDoOrcamento(o),
    criadoEm: o.criadoEm,
  }
}

/**
 * Valida e apara o que veio da tela — mesma régua do `validar()` do site.
 *
 * Os quatro campos obrigatórios são os que vão no cabeçalho da proposta: sem
 * eles o PDF sai com buraco no lugar do nome do cliente.
 */
function conferir(dados: DadosDoOrcamento): NovoOrcamentoNoRepositorio {
  const nomeEvento = (dados.nomeEvento ?? '').trim()
  if (!nomeEvento) throw new Error('Informe o nome do evento.')
  const responsavel = (dados.responsavel ?? '').trim()
  if (!responsavel) throw new Error('Informe o responsável.')
  const telefone = (dados.telefone ?? '').trim()
  if (!telefone) throw new Error('Informe o telefone.')
  const dataEvento = (dados.dataEvento ?? '').trim()
  if (!dataEvento) throw new Error('Informe a data do evento.')

  const valorDia = Number(dados.valorDia) || 0
  const valorFuncionario = Number(dados.valorFuncionario) || 0
  const valorTecnico = Number(dados.valorTecnico) || 0
  if (valorDia < 0 || valorFuncionario < 0 || valorTecnico < 0) {
    throw new Error('Os valores não podem ser negativos.')
  }
  const dias = Math.max(1, Math.round(Number(dados.dias) || 1))

  // Linha em branco na tela não vira item: quem adicionou e não preencheu
  // sai fora, em vez de aparecer como "— R$ 0,00" na proposta.
  const itens = (dados.itens ?? [])
    .map(i => ({ descricao: (i.descricao ?? '').trim(), valor: Number(i.valor) || 0 }))
    .filter(i => i.descricao && i.valor > 0)

  const base = { valorDia, valorFuncionario, valorTecnico, dias, desconto: 0, itens }
  const subtotal = subtotalDoOrcamento(base)
  const desconto = descontoQuePodeSerGravado(Number(dados.desconto) || 0, subtotal)

  return {
    nomeEvento, responsavel, telefone, dataEvento,
    valorDia, valorFuncionario, valorTecnico, dias, desconto,
    valorTotal: subtotal - desconto,
    observacoes: (dados.observacoes ?? '').trim() || null,
    status: statusDeOrcamentoValido(dados.status),
    itens,
  }
}

export async function listarOrcamentos(repo: Repositorio, pessoaId: string): Promise<ResumoDoOrcamento[]> {
  await exigirOrcamentos(repo, pessoaId)
  return (await repo.listarOrcamentos()).map(paraResumo)
}

export async function orcamentoPorId(
  repo: Repositorio, pessoaId: string, id: string,
): Promise<OrcamentoDetalhado | null> {
  await exigirOrcamentos(repo, pessoaId)
  const o = await repo.orcamentoPorId(id)
  return o ? paraDetalhe(o) : null
}

export async function criarOrcamento(
  repo: Repositorio, pessoaId: string, dados: DadosDoOrcamento,
): Promise<{ id?: string; erro?: string }> {
  const perfil = await exigirOrcamentos(repo, pessoaId)
  try {
    const { id } = await repo.criarOrcamento(conferir(dados), perfil.id)
    return { id }
  } catch (e) {
    return { erro: e instanceof Error ? e.message : 'Não consegui salvar este orçamento.' }
  }
}

export async function editarOrcamento(
  repo: Repositorio, pessoaId: string, id: string, dados: DadosDoOrcamento,
): Promise<{ erro?: string }> {
  await exigirOrcamentos(repo, pessoaId)
  try {
    return await repo.editarOrcamento(id, conferir(dados))
  } catch (e) {
    return { erro: e instanceof Error ? e.message : 'Não consegui salvar este orçamento.' }
  }
}

export async function excluirOrcamento(
  repo: Repositorio, pessoaId: string, id: string,
): Promise<{ erro?: string }> {
  await exigirOrcamentos(repo, pessoaId)
  return repo.excluirOrcamento(id)
}

/**
 * O PDF da proposta, pronto pra mandar pro cliente.
 *
 * Devolve `{ nome, url }` em vez dos bytes — mesmo padrão da planilha de
 * relatórios e pelo mesmo motivo: o celular não tem onde pôr um arquivo que
 * chega no corpo de uma resposta JSON, e o que a pessoa quer é o LINK, que
 * ela repassa pelo WhatsApp. O link é opaco e expira em 15 minutos.
 */
export async function pdfDoOrcamento(
  repo: Repositorio, pessoaId: string, id: string, arquivos: Arquivos,
): Promise<{ nome: string; url: string } | { erro: string }> {
  await exigirOrcamentos(repo, pessoaId)

  const guardado = await repo.orcamentoPorId(id)
  if (!guardado) return { erro: 'Este orçamento não existe mais.' }

  try {
    const orcamento = paraDetalhe(guardado)
    const nome = nomeDoPdfDoOrcamento(orcamento.numero)
    const url = await arquivos.guardar(
      `orcamentos/${orcamento.id}/${nome}`, PDF_MIME, montarPdfDoOrcamento(orcamento),
    )
    return { nome, url }
  } catch (e) {
    // O PDF é o produto final: falhar calado aqui é pior que em qualquer
    // outro lugar — a pessoa acharia que mandou a proposta e não mandou.
    return { erro: e instanceof Error ? e.message : 'Não consegui montar o PDF.' }
  }
}

/**
 * Copia um orçamento inteiro como RASCUNHO, com numeração nova.
 *
 * É o caminho normal de trabalho da agência: a proposta do ano passado vira a
 * deste ano com dois valores trocados. Volta a rascunho de propósito — uma
 * cópia nasce não-enviada, mesmo que o original já esteja aprovado.
 */
export async function duplicarOrcamento(
  repo: Repositorio, pessoaId: string, id: string,
): Promise<{ id?: string; erro?: string }> {
  const perfil = await exigirOrcamentos(repo, pessoaId)
  const original = await repo.orcamentoPorId(id)
  if (!original) return { erro: 'Este orçamento não existe mais.' }

  try {
    const novo = await repo.criarOrcamento({
      nomeEvento: original.nomeEvento,
      responsavel: original.responsavel,
      // O banco aceita telefone/data nulos em linha antiga; a cópia precisa
      // dos dois preenchidos pra passar pela mesma régua de quem cria à mão.
      telefone: original.telefone ?? '',
      dataEvento: original.dataEvento ?? '',
      valorDia: original.valorDia,
      valorFuncionario: original.valorFuncionario,
      valorTecnico: original.valorTecnico,
      dias: original.dias,
      desconto: original.desconto,
      valorTotal: totalDoOrcamento(original),
      observacoes: original.observacoes,
      status: 'rascunho',
      itens: original.itens.map(i => ({ descricao: i.descricao, valor: i.valor })),
    }, perfil.id)
    return { id: novo.id }
  } catch (e) {
    return { erro: e instanceof Error ? e.message : 'Não consegui duplicar este orçamento.' }
  }
}
