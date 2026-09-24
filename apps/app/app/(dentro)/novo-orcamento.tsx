// Criar um orçamento.
//
// Tela fina de propósito: o formulário inteiro mora em
// `src/telas/orcamentos.tsx`, compartilhado com a tela de editar. O que muda
// entre as duas é só o que fazer ao salvar.

import { useRouter } from 'expo-router'
import { useSessao } from '../../src/sessao/contexto'
import { FormularioDeOrcamento } from '../../src/telas/orcamentos'
import { Respiro, Tela, TituloDaTela } from '../../src/ui/componentes'

export default function NovoOrcamento() {
  const router = useRouter()
  const { cliente } = useSessao()

  return (
    <Tela>
      <TituloDaTela>Novo orçamento</TituloDaTela>
      <Respiro />

      <FormularioDeOrcamento
        rotuloSalvar="Salvar orçamento"
        aoSalvar={async dados => {
          const r = await cliente.criarOrcamento(dados)
          if (r.erro) return { erro: r.erro }
          /*
           * `replace`, não `push`: voltar depois de salvar tem que cair na
           * lista, não no formulário em branco de novo. E vai direto pro
           * orçamento criado, que é onde estão duplicar/excluir e a conta
           * recalculada.
           */
          router.replace(`/orcamento/${r.id}` as never)
          return {}
        }}
      />
    </Tela>
  )
}
