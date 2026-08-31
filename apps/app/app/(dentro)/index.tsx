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

import { useSessao } from '../../src/sessao/contexto'
import { Painel } from '../../src/telas/painel'
import { MeusEventos } from '../../src/telas/meus-eventos'

export default function Inicio() {
  const { sessao } = useSessao()
  return sessao?.papel === 'colaborador' ? <MeusEventos /> : <Painel />
}
