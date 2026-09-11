// Redirecionamento — esta tela virou o modo "Toda a base" de `/encontrar`.
//
// Ver o comentário no topo daquele arquivo: eram duas telas com a mesma
// pergunta, diferindo só no filtro de autorização. O site fundiu as duas
// em 11/09/2026 (app/admin/base-funcionarios/page.tsx virou este mesmo
// redirect); aqui é o espelho.
//
// O redirect existe para quem tinha o item de menu ou o link salvo não cair
// numa rota morta depois da fusão — `menu.ts` continua com as duas entradas.

import { Redirect } from 'expo-router'

export default function BaseDeFuncionariosRedirect() {
  return <Redirect href={'/encontrar?ver=todos' as never} />
}
