// O painel do supervisor — quem está no posto, quem falta, o que travou.
//
// ─── O QUE ESTA TELA PRECISA RESPONDER ──────────────────────────────────────
//
// O supervisor está andando pelo evento com o celular na mão. Ele não vai ler
// uma tabela: ele quer saber quantos faltam e quem são. Por isso a resposta já
// vem com a pendência de cada pessoa calculada — não uma lista de batidas para
// a tela interpretar.
//
// ─── O ESCOPO É A EQUIPE, E SÓ ELA ──────────────────────────────────────────
//
// O supervisor vê a equipe dele. Não o evento, não as outras equipes. É a mesma
// regra do sistema atual, e ela vale aqui pelo mesmo motivo: cada setor tem o
// seu responsável, e ver a equipe alheia não ajuda a operação de ninguém.

import { diaBRT, faseDoDia, janelaMeio } from '@credenciei/dominio'
import type { PainelDaEquipe, PessoaNaEquipe } from '@credenciei/contrato'
import type { Repositorio } from '../dados/repositorio.js'

export async function painelDaEquipe(
  repo: Repositorio,
  pessoaId: string,
  agora = new Date(),
): Promise<PainelDaEquipe> {
  const equipe = await repo.equipeDoSupervisor(pessoaId)
  if (!equipe) throw new Error('Você não é supervisor de nenhuma equipe.')

  const evento = await repo.eventoPorId(equipe.eventoId)
  if (!evento) throw new Error('Evento não encontrado.')

  const dias = await repo.diasDoEvento(equipe.eventoId)
  const diaPrincipal = dias.find(d => d.tipo === 'principal')?.data
    ?? (evento.dataInicio ? diaBRT(evento.dataInicio) : '')
  const hoje = diaBRT(agora)

  const membros = await repo.participacoesDaEquipe(equipe.id)
  const pessoas: PessoaNaEquipe[] = []

  for (const m of membros) {
    /*
     * Quem foi descredenciado sai da lista do dia.
     *
     * O vínculo dela com o evento acabou — deixá-la ali como "faltando" faria
     * o supervisor procurar alguém que já foi embora, e inflaria o número de
     * ausentes justamente no fechamento.
     *
     * O histórico dela continua inteiro; o que mudou foi o presente.
     */
    if (m.descredenciadoEm) continue

    const doDia = await repo.registrosDoDia(m.id, hoje)
    const pega = (t: string) => doDia.find(r => r.tipo === t)?.registradoEm ?? null
    const entrada = pega('entrada')
    const meio = pega('meio')
    const saida = pega('fim')

    pessoas.push({
      participacaoId: m.id,
      nome: m.pessoa.nome,
      funcao: m.funcao,
      fotoUrl: m.pessoa.fotoPath,
      entrada, meio, saida,
      pendencia: calcularPendencia(entrada, meio, saida, agora),
    })
  }

  /*
   * Quem tem pendência primeiro.
   *
   * A tela de quem está andando pelo evento precisa começar pelo que exige
   * ação. Ordem alfabética faria o supervisor rolar a lista atrás dos
   * problemas, com o celular numa mão.
   */
  const peso = (p: PessoaNaEquipe) =>
    p.pendencia === 'entrada' ? 0 : p.pendencia === 'meio' ? 1 : p.pendencia === 'saida' ? 2 : 3

  pessoas.sort((a, b) => peso(a) - peso(b) || a.nome.localeCompare(b.nome, 'pt-BR'))

  return {
    eventoNome: evento.nome,
    equipeNome: equipe.nome,
    data: hoje,
    etapa: faseDoDia(hoje, diaPrincipal),
    total: pessoas.length,
    presentes: pessoas.filter(p => p.entrada).length,
    pessoas,
  }
}

/**
 * O que falta AGORA para esta pessoa.
 *
 * Uma pendência de cada vez, na ordem do ciclo: não adianta cobrar o meio de
 * quem nem entrou. Mostrar todas de uma vez daria uma lista de três problemas
 * onde há um.
 */
export function calcularPendencia(
  entrada: string | null,
  meio: string | null,
  saida: string | null,
  agora: Date,
): PessoaNaEquipe['pendencia'] {
  if (!entrada) return 'entrada'

  /*
   * O meio só vira pendência depois de a janela ABRIR.
   *
   * Antes disso a pessoa não tem o que fazer — o botão dela nem apareceu.
   * Marcar como pendente faria o supervisor cobrar uma etapa que ainda não
   * existe, e a lista encheria de falso alarme logo depois da entrada.
   */
  if (!meio) {
    return agora.getTime() >= Date.parse(janelaMeio(entrada).inicio) ? 'meio' : null
  }

  if (!saida) return 'saida'
  return null
}
