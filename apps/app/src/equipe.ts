// A busca e os filtros da equipe de um setor.
//
// Fora da tela porque é REGRA: o que conta como "presente", como "ausente" e
// como "com pendência". São as perguntas que o supervisor faz no meio do
// evento, e errar uma delas manda ele procurar a pessoa errada.

import type { PessoaDoSetor } from '@credenciei/contrato'

export type FiltroDaEquipe =
  | 'todos'
  | 'pendencias'
  | 'presentes'
  | 'ausentes'
  | 'nao_ativados'

export const NOME_DO_FILTRO: Record<FiltroDaEquipe, string> = {
  todos: 'Todos',
  pendencias: 'Com pendências',
  presentes: 'Presentes',
  ausentes: 'Ausentes',
  nao_ativados: 'Não ativados',
}

/** Ignora acento e maiúscula: quem digita com pressa não põe acento. */
function semAcento(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/**
 * A pessoa está DENTRO do evento agora?
 *
 * Entrou e ainda não saiu. Contar só "tem entrada" incluiria quem já foi
 * embora, e é justamente essa a pergunta do rádio: quantos estão aqui.
 */
export function estaPresente(p: PessoaDoSetor): boolean {
  return !!p.entrada && !p.fim
}

/**
 * Alguma etapa passou do prazo sem registro?
 *
 * `fechado` é o único status que vira pendência: `aberto` ainda dá tempo e
 * `indefinido` nem abriu. Tratar os três como falta encheria a lista de gente
 * que não deve nada.
 */
export function temPendencia(p: PessoaDoSetor): boolean {
  return p.statusEntrada === 'fechado'
    || p.statusMeio === 'fechado'
    || p.statusFim === 'fechado'
}

export function passaNoFiltro(p: PessoaDoSetor, filtro: FiltroDaEquipe): boolean {
  switch (filtro) {
    case 'presentes': return estaPresente(p)
    case 'ausentes': return !p.entrada
    case 'pendencias': return temPendencia(p)
    case 'nao_ativados': return !p.ativo
    default: return true
  }
}

/**
 * A busca.
 *
 * Aceita nome, empresa, função e CPF — e o CPF com ou sem pontuação. No sistema
 * web a comparação é literal, então quem digita "189.051.077-70" não acha
 * ninguém, porque o banco guarda só os dígitos. Aqui os dois lados são
 * reduzidos a dígitos quando o que foi digitado parece um CPF.
 */
export function combinaComBusca(p: PessoaDoSetor, busca: string): boolean {
  const termo = busca.trim()
  if (!termo) return true

  const digitos = termo.replace(/\D/g, '')
  // Três dígitos já bastam para valer como busca por CPF; menos que isso é
  // mais provavelmente um pedaço de nome com número.
  if (digitos.length >= 3 && /^[\d.\-\s]+$/.test(termo)) {
    return p.cpf.replace(/\D/g, '').includes(digitos)
  }

  const alvo = semAcento(termo)
  return semAcento(p.nome).includes(alvo)
    || semAcento(p.empresa ?? '').includes(alvo)
    || semAcento(p.funcao ?? '').includes(alvo)
}

export function filtrarEquipe(
  pessoas: PessoaDoSetor[],
  op: { busca?: string; filtro?: FiltroDaEquipe } = {},
): PessoaDoSetor[] {
  const filtro = op.filtro ?? 'todos'
  const busca = op.busca ?? ''
  return pessoas.filter(p => passaNoFiltro(p, filtro) && combinaComBusca(p, busca))
}

/**
 * Quantos em cada filtro.
 *
 * Contam sobre a lista INTEIRA, e não sobre o que a busca deixou passar: o
 * número na aba responde "quantos existem", e recalculá-lo a cada letra
 * digitada faria as abas dançarem enquanto a pessoa procura alguém.
 */
export function contarPorFiltro(pessoas: PessoaDoSetor[]): Record<FiltroDaEquipe, number> {
  return {
    todos: pessoas.length,
    pendencias: pessoas.filter(temPendencia).length,
    presentes: pessoas.filter(estaPresente).length,
    ausentes: pessoas.filter(p => !p.entrada).length,
    nao_ativados: pessoas.filter(p => !p.ativo).length,
  }
}
