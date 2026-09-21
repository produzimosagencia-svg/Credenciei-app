// Meu pagamento — o que a pessoa vai receber, e por quantos dias.
//
// ─── SÓ O DELA, POR CONSTRUÇÃO ──────────────────────────────────────────────
//
// Não existe rota que devolva o financeiro de outra pessoa para o papel
// `colaborador`: o servidor sabe quem está perguntando pelo token e responde
// sobre ela. A restrição está no formato do contrato, não numa verificação que
// alguém possa esquecer de fazer.
//
// ─── O NÚMERO É PREVISÃO, E A TELA DIZ ISSO ─────────────────────────────────
//
// O valor sai dos dias com entrada registrada. Se ele aparecesse como "você vai
// receber R$ 600", uma batida que ficou faltando viraria uma discussão no dia
// do acerto — a pessoa lembraria do número, não da condição. Dizer "previsto"
// e mostrar de onde ele vem é o que transforma a surpresa em conferência.

import { useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { formatarBR } from '@credenciei/dominio'
import type { FinanceiroDaParticipacao } from '@credenciei/contrato'
import { usePedido } from '../../src/dados/pedido'
import { escolherParticipacao, useParticipacaoSelecionada } from '../../src/participacao-selecionada'
import { useSessao } from '../../src/sessao/contexto'
import { resumoDoHistorico } from '../../src/historico'
import {
  Aviso, Botao, Carregando, Cartao, Corpo, Legenda, Respiro, Selo, Separador,
  Tela, TituloDaTela, TituloDeCartao,
} from '../../src/ui/componentes'
import { Icone } from '../../src/ui/icone'
import { espaco, raio, texto, tipo } from '../../src/ui/tema'
import { useTema, type Tokens } from '../../src/ui/tema-contexto'

const SITUACAO: Record<
  FinanceiroDaParticipacao['situacao'],
  { rotulo: string; tom: 'aviso' | 'info' | 'sucesso'; explica: string }
> = {
  pendente: {
    rotulo: 'A receber',
    tom: 'aviso',
    explica: 'O acerto ainda não foi processado pela produção.',
  },
  em_processamento: {
    rotulo: 'Em processamento',
    tom: 'info',
    explica: 'A produção já está processando o pagamento.',
  },
  pago: {
    rotulo: 'Pago',
    tom: 'sucesso',
    explica: 'O pagamento foi registrado como feito.',
  },
}

export default function MeuPagamento() {
  const { cliente } = useSessao()
  const { participacaoId: selecionada } = useParticipacaoSelecionada()
  const { uso } = useTema()
  const e = useEstilos()

  const { pedido, recarregar } = usePedido(async () => {
    const participacoes = await cliente.minhasParticipacoes()
    const p = escolherParticipacao(participacoes, selecionada)
    if (!p) return null

    const [financeiro, dias] = await Promise.all([
      cliente.meuFinanceiro(p.participacaoId),
      cliente.meusDias(p.participacaoId),
    ])
    return { participacao: p, financeiro, dias }
  }, [cliente, selecionada])

  const dados = pedido.estado === 'pronto' ? pedido.dados : null
  const resumo = dados ? resumoDoHistorico(dados.dias) : null
  const situacao = dados ? SITUACAO[dados.financeiro.situacao] : null

  return (
    <Tela>
      <TituloDaTela>Meu pagamento</TituloDaTela>
      {dados ? <Legenda>{dados.participacao.eventoNome}</Legenda> : null}
      <Respiro />

      {pedido.estado === 'carregando' ? <Carregando /> : null}

      {pedido.estado === 'falhou' ? (
        <>
          <Aviso tipo="erro">{pedido.mensagem}</Aviso>
          <Botao titulo="Tentar de novo" onPress={recarregar} tipo="secundario" />
        </>
      ) : null}

      {pedido.estado === 'pronto' && !dados ? (
        <Cartao>
          <Corpo>
            Você ainda não está em nenhum evento. O acerto aparece aqui quando
            entrar em um.
          </Corpo>
        </Cartao>
      ) : null}

      {dados && resumo && situacao ? (
        <>
          <Cartao>
            <View style={e.topo}>
              <View style={e.topoTexto}>
                <Legenda>Valor previsto</Legenda>
                <Text style={e.valor}>
                  {dados.financeiro.valorPrevisto === null
                    ? 'A combinar'
                    : emReais(dados.financeiro.valorPrevisto)}
                </Text>
              </View>
              <Selo texto={situacao.rotulo} tipo={situacao.tom} />
            </View>

            <Respiro altura={espaco.s} />
            <Legenda>{situacao.explica}</Legenda>

            {dados.financeiro.pagoEm ? (
              <>
                <Respiro altura={espaco.s} />
                <Legenda>Pago em {formatarBR(dados.financeiro.pagoEm, 'data')}.</Legenda>
              </>
            ) : null}
          </Cartao>

          <Cartao>
            <TituloDeCartao>De onde vem esse número</TituloDeCartao>
            <Respiro altura={espaco.s} />
            <Legenda>
              O valor é calculado pelos dias em que você registrou entrada. Se
              algum dia estiver faltando aqui, fale com a produção antes do
              acerto.
            </Legenda>

            <Separador />

            <Linha rotulo="Dias com entrada registrada" valor={String(dados.financeiro.diasTrabalhados)} />
            <Linha rotulo="Dias faltados" valor={String(resumo.diasFaltados)} />
            <Linha rotulo="Horas somadas" valor={`${resumo.horasTotais}h`} />

            {resumo.diasIncompletos > 0 ? (
              <>
                <Respiro altura={espaco.m} />
                {/*
                  Dia incompleto conta como trabalhado — a pessoa esteve lá.
                  Mas ele aparece com nome, porque é o que costuma virar
                  conversa no acerto, e é melhor que a conversa comece aqui.
                */}
                <Aviso tipo="aviso">
                  {resumo.diasIncompletos === 1
                    ? 'Um dia ficou sem alguma batida.'
                    : `${resumo.diasIncompletos} dias ficaram sem alguma batida.`}{' '}
                  Eles contam como trabalhados, mas confira em "Meus dias" antes
                  do acerto.
                </Aviso>
              </>
            ) : null}
          </Cartao>

          <Cartao>
            <TituloDeCartao>Chave PIX</TituloDeCartao>
            <Respiro altura={espaco.s} />
            {dados.financeiro.chavePix ? (
              <Text style={e.chave} selectable>{dados.financeiro.chavePix}</Text>
            ) : (
              <Legenda>
                Nenhuma chave PIX cadastrada. Foi a que você escreveu no
                formulário de cadastro do evento — se estiver errada ou
                faltando, fale com a produção antes do acerto.
              </Legenda>
            )}
          </Cartao>

          <View style={e.rodape}>
            <Icone nome="ShieldCheck" tamanho={14} tom={uso.tintaFraca} />
            <Text style={e.rodapeTexto}>
              Estes números são só seus. Ninguém mais vê o seu acerto pelo app.
            </Text>
          </View>
        </>
      ) : null}
    </Tela>
  )
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  const e = useEstilos()
  return (
    <View style={e.linha}>
      <Text style={e.linhaRotulo}>{rotulo}</Text>
      <Text style={e.linhaValor}>{valor}</Text>
    </View>
  )
}

/**
 * O valor em reais, escrito à mão.
 *
 * `toLocaleString('pt-BR')` depende de dados de idioma que o motor JavaScript
 * do celular pode não trazer — e o resultado silencioso seria "R$ 600.00", com
 * ponto, na tela do pagamento de alguém.
 */
function emReais(valor: number): string {
  const centavos = Math.round(valor * 100)
  const inteiros = String(Math.floor(centavos / 100))
  const resto = String(centavos % 100).padStart(2, '0')

  let comPontos = ''
  for (let i = 0; i < inteiros.length; i++) {
    const faltam = inteiros.length - i
    comPontos += inteiros[i]
    if (faltam > 1 && (faltam - 1) % 3 === 0) comPontos += '.'
  }

  return `R$ ${comPontos},${resto}`
}

function criarEstilos(cor: Tokens['cor'], uso: Tokens['uso']) {
  return StyleSheet.create({
    topo: { flexDirection: 'row', alignItems: 'flex-start', gap: espaco.m },
    topoTexto: { flex: 1, minWidth: 0 },
    valor: { ...texto.metrica, color: uso.tinta, marginTop: 2 },

    linha: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: espaco.m,
      paddingVertical: espaco.s,
    },
    linhaRotulo: { ...texto.corpo, color: uso.tintaMedia, flex: 1 },
    linhaValor: { ...texto.corpoForte, color: uso.tinta },
    chave: { ...texto.corpoForte, color: uso.tinta },

    rodape: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: espaco.xs,
      paddingVertical: espaco.m,
      borderRadius: raio.campo,
      backgroundColor: cor.neutro100,
      paddingLeft: espaco.m,
    },
    rodapeTexto: { ...texto.xs, fontFamily: tipo.regular, color: uso.tintaMedia, flex: 1 },
  })
}

function useEstilos() {
  const { cor, uso } = useTema()
  return useMemo(() => criarEstilos(cor, uso), [cor, uso])
}
