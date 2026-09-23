// A tela inicial — e ela depende de quem entrou.
//
// Duas populações usam o mesmo app, e "início" quer dizer coisas diferentes
// para cada uma:
//
//   conta de painel   o Painel: os números do dia, os eventos ao vivo, a
//                     atividade recente. É a mesma tela do sistema web.
//
//   colaborador       os eventos DELA. Não existe painel para quem foi
//                     contratado por um dia — e o servidor recusa `painel()`
//                     para esse papel, então nem adiantaria tentar.
//
// A escolha é feita aqui, num arquivo só, e não espalhada em condicional
// dentro de cada tela.

import { ehProdutor } from '@credenciei/dominio'
import { useSessao } from '../../src/sessao/contexto'
import { Painel } from '../../src/telas/painel'
import { MeusEventos } from '../../src/telas/meus-eventos'
import { Gastos } from '../../src/telas/gastos'

export default function Inicio() {
  const { sessao } = useSessao()
  if (sessao?.papel === 'colaborador') return <MeusEventos />
  /*
   * O Produtor não conhece o painel — o produto dele é Gastos, e só. No site
   * ele tem um shell próprio pelo mesmo motivo, e `painel()` recusaria o
   * papel dele de qualquer jeito. Ver o comentário em `navegacao/menu.ts`.
   */
  if (ehProdutor(sessao?.papel)) return <Gastos />
  return <Painel />
}
