// O "alvo" que o menu usa pra decidir o que mostrar — papel + as duas
// camadas de override (usuário e organização), não só o papel puro.
//
// `sessao.papel` (guardado no aparelho) nunca carrega os overrides — eles
// vêm de `cliente.minhasPermissoes()`, buscado aqui. Isso é DIFERENTE do que
// protege de verdade: toda rota da API recarrega o perfil (com os overrides
// frescos) a cada chamada, direto do banco — o que muda aqui é só o menu,
// pra pessoa não tocar num botão e levar um "não".

import { useMemo } from 'react'
import type { AlvoPermissao } from '@credenciei/dominio'
import { usePedido } from '../dados/pedido'
import { useSessao } from '../sessao/contexto'

const SEM_OVERRIDE = { permissoesUsuario: {}, permissoesOrganizacao: {} }

export function useAlvoDePermissao(): AlvoPermissao {
  const { sessao, cliente } = useSessao()
  const { pedido } = usePedido(
    () => (sessao ? cliente.minhasPermissoes() : Promise.resolve(SEM_OVERRIDE)),
    [cliente, sessao?.papel],
  )

  return useMemo(() => {
    if (!sessao) return null
    const extra = pedido.estado === 'pronto' ? pedido.dados : SEM_OVERRIDE
    return {
      papel: sessao.papel,
      permissoesUsuario: extra.permissoesUsuario,
      permissoesOrganizacao: extra.permissoesOrganizacao,
    }
  }, [sessao, pedido])
}
