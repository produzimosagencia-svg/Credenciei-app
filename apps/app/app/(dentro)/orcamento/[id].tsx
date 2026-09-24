// Um orçamento: a proposta pronta, e o formulário pra mexer nela.
//
// ─── O TOTAL AQUI É O RECALCULADO ───────────────────────────────────────────
//
// A API refaz a conta a cada abertura, em vez de devolver a coluna
// `valor_total`. Um orçamento salvo por uma versão antiga do código deixa a
// coluna mentindo, e o número errado iria direto pro cliente.
//
// ─── POR QUE COMPARTILHAR TEXTO, E NÃO UM PDF ───────────────────────────────
//
// O site gera PDF com jsPDF, que é biblioteca de navegador e não roda em
// React Native. Enquanto não existir um gerador aqui, o caminho honesto é o
// que a agência já usa na prática: mandar a proposta escrita pelo WhatsApp. A
// folha de compartilhar do celular entrega isso sem nenhuma dependência nova,
// e o PDF continua saindo pelo site quando for preciso.

import { useLocalSearchParams, useRouter } from 'expo-router'
import { useState } from 'react'
import { Share, View } from 'react-native'
import { numeroDoOrcamento } from '@credenciei/dominio'
import type { OrcamentoDetalhado } from '@credenciei/contrato'
import { mensagemDoErro, usePedido } from '../../../src/dados/pedido'
import { useSessao } from '../../../src/sessao/contexto'
import {
  ContaDoOrcamento, emDataBR, FormularioDeOrcamento, SeloDeOrcamento,
} from '../../../src/telas/orcamentos'
import {
  Aviso, Botao, Carregando, Cartao, Corpo, Legenda, Respiro, Separador, Tela, TituloDaTela,
  TituloDeCartao,
} from '../../../src/ui/componentes'
import { emReais } from '../../../src/ui/dinheiro'
import { espaco } from '../../../src/ui/tema'

export default function UmOrcamento() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const { cliente } = useSessao()

  const [editando, setEditando] = useState(false)
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const { pedido, recarregar } = usePedido(
    () => cliente.orcamentoPorId(String(id)),
    [cliente, id],
  )

  const orcamento = pedido.estado === 'pronto' ? pedido.dados : null

  async function duplicar() {
    setErro(null)
    setOcupado(true)
    try {
      const r = await cliente.duplicarOrcamento(String(id))
      if (r.erro) return setErro(r.erro)
      router.replace(`/orcamento/${r.id}` as never)
    } catch (err) {
      setErro(mensagemDoErro(err))
    } finally {
      setOcupado(false)
    }
  }

  async function excluir() {
    setErro(null)
    setOcupado(true)
    try {
      const r = await cliente.excluirOrcamento(String(id))
      if (r.erro) return setErro(r.erro)
      router.replace('/orcamentos')
    } catch (err) {
      setErro(mensagemDoErro(err))
    } finally {
      setOcupado(false)
    }
  }

  return (
    <Tela>
      {pedido.estado === 'carregando' ? <Carregando /> : null}

      {pedido.estado === 'falhou' ? (
        <>
          <Aviso tipo="erro">{pedido.mensagem}</Aviso>
          <Botao titulo="Tentar de novo" onPress={recarregar} tipo="secundario" />
        </>
      ) : null}

      {pedido.estado === 'pronto' && !orcamento ? (
        <>
          <Aviso tipo="aviso">Este orçamento não existe mais.</Aviso>
          <Respiro altura={espaco.s} />
          <Botao titulo="Voltar pra lista" tipo="secundario" onPress={() => router.replace('/orcamentos')} />
        </>
      ) : null}

      {orcamento ? (
        <>
          <TituloDaTela>{orcamento.nomeEvento}</TituloDaTela>
          <Respiro altura={espaco.xs} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: espaco.s }}>
            <Legenda>{numeroDoOrcamento(orcamento.numero)}</Legenda>
            <SeloDeOrcamento status={orcamento.status} />
          </View>
          <Respiro />

          {erro ? (
            <>
              <Aviso tipo="erro">{erro}</Aviso>
              <Respiro altura={espaco.s} />
            </>
          ) : null}

          {editando ? (
            <FormularioDeOrcamento
              inicial={orcamento}
              rotuloSalvar="Salvar alterações"
              aoSalvar={async dados => {
                const r = await cliente.editarOrcamento(orcamento.id, dados)
                if (r.erro) return { erro: r.erro }
                setEditando(false)
                recarregar()
                return {}
              }}
            />
          ) : (
            <>
              <PropostaPronta orcamento={orcamento} />

              <Botao titulo="Editar" onPress={() => setEditando(true)} />
              <Respiro altura={espaco.s} />
              <Botao
                titulo="Enviar proposta"
                tipo="secundario"
                onPress={() => { void Share.share({ message: propostaEmTexto(orcamento) }) }}
              />
              <Respiro altura={espaco.s} />
              <Botao
                titulo="Duplicar"
                tipo="secundario"
                ocupado={ocupado}
                onPress={() => { void duplicar() }}
              />

              <Respiro altura={espaco.g} />
              <Separador />
              <Respiro altura={espaco.s} />

              {!confirmandoExclusao ? (
                <Botao
                  titulo="Excluir orçamento"
                  tipo="fantasma"
                  onPress={() => setConfirmandoExclusao(true)}
                />
              ) : (
                <>
                  <Aviso tipo="erro">
                    O orçamento e os itens somem para sempre — não tem como desfazer.
                  </Aviso>
                  <Respiro altura={espaco.s} />
                  <Botao
                    titulo="Confirmar exclusão"
                    ocupado={ocupado}
                    onPress={() => { void excluir() }}
                  />
                  <Respiro altura={espaco.s} />
                  <Botao titulo="Cancelar" tipo="fantasma" onPress={() => setConfirmandoExclusao(false)} />
                </>
              )}
            </>
          )}

          {editando ? (
            <Botao titulo="Cancelar edição" tipo="fantasma" onPress={() => setEditando(false)} />
          ) : null}
          <Respiro />
        </>
      ) : null}
    </Tela>
  )
}

/** A proposta como o cliente a veria — a mesma quebra do PDF do site. */
function PropostaPronta({ orcamento: o }: { orcamento: OrcamentoDetalhado }) {
  return (
    <>
      <Cartao>
        <TituloDeCartao>O cliente</TituloDeCartao>
        <Respiro altura={espaco.s} />
        <Corpo forte>{o.responsavel}</Corpo>
        <Legenda>
          {o.telefone ?? 'sem telefone'}
          {o.dataEvento ? ` · ${emDataBR(o.dataEvento)}` : ''}
        </Legenda>
      </Cartao>

      <Cartao>
        <TituloDeCartao>As diárias · {o.dias} {o.dias === 1 ? 'dia' : 'dias'}</TituloDeCartao>
        <Respiro altura={espaco.s} />
        <Corpo>Valor do dia: {emReais(o.valorDia)}</Corpo>
        <Corpo>Por funcionário: {emReais(o.valorFuncionario)}</Corpo>
        <Corpo>Técnico: {emReais(o.valorTecnico)}</Corpo>
      </Cartao>

      {o.itens.length ? (
        <Cartao>
          <TituloDeCartao>Itens adicionais</TituloDeCartao>
          <Respiro altura={espaco.s} />
          {o.itens.map(i => (
            <Corpo key={i.id}>{i.descricao}: {emReais(i.valor)}</Corpo>
          ))}
        </Cartao>
      ) : null}

      {o.observacoes ? (
        <Cartao>
          <TituloDeCartao>Observações</TituloDeCartao>
          <Respiro altura={espaco.s} />
          <Corpo>{o.observacoes}</Corpo>
        </Cartao>
      ) : null}

      <ContaDoOrcamento
        subtotal={o.total + o.desconto}
        desconto={o.desconto}
        total={o.total}
      />
    </>
  )
}

/**
 * A proposta escrita, pronta pra colar no WhatsApp.
 *
 * Sem emoji e sem moldura de caracteres: o que o cliente recebe é uma
 * proposta comercial, e enfeite de terminal num orçamento de dez mil reais
 * passa a impressão errada.
 */
function propostaEmTexto(o: OrcamentoDetalhado): string {
  const linhas = [
    `Orçamento ${numeroDoOrcamento(o.numero)} — ${o.nomeEvento}`,
    o.dataEvento ? `Data: ${emDataBR(o.dataEvento)}` : null,
    `Responsável: ${o.responsavel}`,
    '',
    `Valor do dia: ${emReais(o.valorDia)}`,
    `Por funcionário: ${emReais(o.valorFuncionario)}`,
    `Técnico: ${emReais(o.valorTecnico)}`,
    `Dias: ${o.dias}`,
  ]

  if (o.itens.length) {
    linhas.push('', 'Itens adicionais:')
    for (const i of o.itens) linhas.push(`- ${i.descricao}: ${emReais(i.valor)}`)
  }

  if (o.desconto > 0) linhas.push('', `Desconto: ${emReais(o.desconto)}`)
  linhas.push('', `Total: ${emReais(o.total)}`)
  if (o.observacoes) linhas.push('', o.observacoes)

  return linhas.filter(l => l !== null).join('\n')
}
