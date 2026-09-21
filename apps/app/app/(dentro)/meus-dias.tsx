// Meus dias — o histórico que a pessoa confere contra o próprio pagamento.
//
// É a mesma tabela do sistema web (`HistoricoBatidas`), em formato de app: no
// computador ela é uma tabela larga; num celular de 360px, cada dia vira um
// cartão. O que não muda é o que ela diz.
//
// ─── O AVISO QUE SÓ GRITA QUANDO PRECISA ────────────────────────────────────
//
// "Não realizada" é vermelho e forte porque marca uma ANOMALIA: a pessoa esteve
// no posto e pulou uma etapa. Num dia em que ela nem apareceu, repetir isso nas
// três etapas diz três vezes o que o selo "Ausente" já disse uma — e onze dias
// assim viram uma parede vermelha sem informação nenhuma.
//
// A regra está em `src/historico.ts`, com teste, porque é regra e não desenho.

import { useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { formatarBR, NOME_DA_FASE } from '@credenciei/dominio'
import type { DiaDaParticipacao, TipoBatida } from '@credenciei/contrato'
import { mensagemDoErro, usePedido } from '../../src/dados/pedido'
import { escolherParticipacao, useParticipacaoSelecionada } from '../../src/participacao-selecionada'
import { useSessao } from '../../src/sessao/contexto'
import {
  celulaSilenciosa, NOME_DO_STATUS, resumoDoHistorico, statusDoDia,
} from '../../src/historico'
import {
  Aviso, Botao, Campo, Carregando, Cartao, Corpo, Legenda, Respiro, Selo, Separador,
  Tela, TituloDaTela, TituloDeCartao,
} from '../../src/ui/componentes'
import { corDaEtapa, espaco, raio, texto, tipo } from '../../src/ui/tema'
import { useTema, type Tokens } from '../../src/ui/tema-contexto'

const ROTULO_DA_ETAPA: Record<TipoBatida, string> = { entrada: 'Entrada', meio: 'Meio', fim: 'Saída' }

export default function MeusDias() {
  const { cliente } = useSessao()
  const { participacaoId: selecionada } = useParticipacaoSelecionada()
  const e = useEstilos()

  const { pedido, recarregar } = usePedido(async () => {
    const participacoes = await cliente.minhasParticipacoes()
    const p = escolherParticipacao(participacoes, selecionada)
    if (!p) return null
    return { participacao: p, dias: await cliente.meusDias(p.participacaoId) }
  }, [cliente, selecionada])

  const dados = pedido.estado === 'pronto' ? pedido.dados : null
  const resumo = dados ? resumoDoHistorico(dados.dias) : null

  return (
    <Tela>
      <TituloDaTela>Meus dias</TituloDaTela>
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
            Você ainda não está em nenhum evento. Seus dias aparecem aqui quando
            entrar em um.
          </Corpo>
        </Cartao>
      ) : null}

      {dados && resumo ? (
        <>
          <Cartao>
            <TituloDeCartao>Resumo</TituloDeCartao>
            <Respiro altura={espaco.m} />

            <View style={e.numeros}>
              <Numero valor={resumo.diasEscalados} rotulo="dias escalados" />
              <Numero valor={resumo.diasTrabalhados} rotulo="dias trabalhados" destaque />
              <Numero valor={resumo.diasFaltados} rotulo="faltados" />
              <Numero valor={resumo.diasIncompletos} rotulo="incompletos" />
              <Numero valor={`${resumo.horasTotais}h`} rotulo="horas somadas" />
            </View>

            <Separador />

            {/*
              As batidas contadas à parte: "dias trabalhados" já diz quantos
              dias tiveram entrada, e esconde quantos ficaram sem o meio.
            */}
            <Legenda>Batidas registradas</Legenda>
            <Respiro altura={espaco.s} />
            <View style={e.batidas}>
              <Contagem tipo="entrada" quantas={resumo.batidas.entrada} />
              <Contagem tipo="meio" quantas={resumo.batidas.meio} />
              <Contagem tipo="fim" quantas={resumo.batidas.fim} />
            </View>
          </Cartao>

          <Respiro altura={espaco.s} />
          {dados.dias.map(d => (
            <CartaoDoDia key={d.data} dia={d} participacaoId={dados.participacao.participacaoId} />
          ))}
        </>
      ) : null}
    </Tela>
  )
}

function CartaoDoDia({ dia, participacaoId }: { dia: DiaDaParticipacao; participacaoId: string }) {
  const e = useEstilos()
  const status = statusDoDia(dia)
  const silencioso = celulaSilenciosa(dia)
  const tom = { presente: 'sucesso', incompleto: 'aviso', ausente: 'erro', cancelado: 'info' } as const

  return (
    <Cartao>
      <View style={e.cabecalho}>
        <View style={e.cabecalhoTexto}>
          <TituloDeCartao>{formatarBR(`${dia.data}T12:00:00-03:00`, 'data')}</TituloDeCartao>
          <Legenda>{dia.cancelado ? '—' : NOME_DA_FASE[dia.etapa]}</Legenda>
        </View>
        <Selo texto={NOME_DO_STATUS[status]} tipo={tom[status]} />
      </View>

      <Respiro altura={espaco.m} />

      <View style={e.etapas}>
        <Celula tipo="entrada" em={dia.entrada} silencioso={silencioso} assistida={dia.entradaAssistida} />
        <Celula tipo="meio" em={dia.meio} silencioso={silencioso} atrasoMin={dia.meioAtrasoMin} assistida={dia.meioAssistido} />
        <Celula tipo="fim" em={dia.saida} silencioso={silencioso} assistida={dia.saidaAssistida} />
      </View>

      {dia.horas !== null ? (
        <>
          <Respiro altura={espaco.m} />
          <Legenda>{dia.horas}h no evento</Legenda>
        </>
      ) : null}

      {!dia.cancelado ? (
        <ContestarBatida dia={dia} participacaoId={participacaoId} />
      ) : null}
    </Cartao>
  )
}

/**
 * "Uma batida errada ou que faltou" — o colaborador é quem primeiro percebe,
 * e antes disso não tinha como avisar (site é admin-only, ele não tem conta
 * lá). Escopo decidido com o Juan em 18/09/2026: vira pendência na equipe do
 * setor, resolvida por quem já mexe na equipe — não manda notificação
 * (Epic 11/Push ainda não está pronto pra isso).
 */
function ContestarBatida({ dia, participacaoId }: { dia: DiaDaParticipacao; participacaoId: string }) {
  const { cliente } = useSessao()
  const e = useEstilos()
  const [aberto, setAberto] = useState(false)
  const [tipoEscolhido, setTipoEscolhido] = useState<TipoBatida>('entrada')
  const [motivo, setMotivo] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [enviada, setEnviada] = useState(false)

  if (enviada) {
    return (
      <>
        <Respiro altura={espaco.m} />
        <Aviso tipo="sucesso">
          Contestação enviada. A supervisão do setor vai revisar.
        </Aviso>
      </>
    )
  }

  if (!aberto) {
    return (
      <>
        <Respiro altura={espaco.s} />
        <Botao
          titulo="Uma batida está errada ou faltando?"
          tipo="fantasma"
          onPress={() => setAberto(true)}
        />
      </>
    )
  }

  return (
    <>
      <Respiro altura={espaco.m} />
      <Separador />
      <Respiro altura={espaco.m} />
      {erro ? <Aviso tipo="erro">{erro}</Aviso> : null}

      <Legenda>Qual etapa?</Legenda>
      <Respiro altura={espaco.s} />
      <View style={e.contestarEtapas}>
        {(['entrada', 'meio', 'fim'] as const).map(t => {
          const marcada = tipoEscolhido === t
          return (
            <Pressable
              key={t}
              onPress={() => setTipoEscolhido(t)}
              accessibilityRole="radio"
              accessibilityState={{ selected: marcada }}
              style={[e.contestarEtapaBotao, marcada && e.contestarEtapaBotaoMarcada]}
            >
              <Text style={[e.contestarEtapaTexto, marcada && e.contestarEtapaTextoMarcado]}>
                {ROTULO_DA_ETAPA[t]}
              </Text>
            </Pressable>
          )
        })}
      </View>

      <Respiro altura={espaco.m} />
      <Campo
        rotulo="O que aconteceu?"
        value={motivo}
        onChangeText={setMotivo}
        placeholder="Ex.: bati o meio e não gravou"
        multiline
      />

      <Respiro altura={espaco.m} />
      <Botao
        titulo="Enviar contestação"
        ocupado={ocupado}
        onPress={async () => {
          setErro(null)
          setOcupado(true)
          try {
            const r = await cliente.contestarBatida(participacaoId, tipoEscolhido, dia.data, motivo)
            if (r.erro) return setErro(r.erro)
            setEnviada(true)
          } catch (err) {
            setErro(mensagemDoErro(err))
          } finally {
            setOcupado(false)
          }
        }}
      />
      <Respiro altura={espaco.s} />
      <Botao titulo="Cancelar" tipo="fantasma" onPress={() => setAberto(false)} />
    </>
  )
}

/**
 * Uma etapa do dia.
 *
 * `atrasoMin` marca a batida feita FORA do prazo. Ela existe e vale — o meio
 * pode ser registrado depois da hora de propósito, senão quem se atrasou
 * ficaria sem registro nenhum. Mas precisa ser visível no fechamento, porque é
 * uma ausência do posto que ainda vai ser conversada.
 */
function Celula({
  tipo, em, silencioso, atrasoMin, assistida,
}: {
  tipo: TipoBatida
  em: string | null
  silencioso: boolean
  atrasoMin?: number | null
  /** Batida feita por outra pessoa (registro assistido) — precisa ficar visível, é a que alguém pode contestar. */
  assistida?: boolean
}) {
  const e = useEstilos()
  const rotulo = { entrada: 'Entrada', meio: 'Meio', fim: 'Saída' }[tipo]

  return (
    <View style={e.celula}>
      <View style={e.celulaTopo}>
        <View style={[e.ponto, { backgroundColor: corDaEtapa[tipo] }]} />
        <Text style={e.celulaRotulo}>{rotulo}</Text>
      </View>

      {em ? (
        <>
          <Text style={e.celulaHora}>{formatarBR(em, 'hora')}</Text>
          {atrasoMin ? <Text style={e.celulaAtraso}>{atrasoMin} min tarde</Text> : null}
          {assistida ? <Text style={e.celulaAssistida}>assistida</Text> : null}
        </>
      ) : silencioso ? (
        // O dia inteiro foi ausência: o selo lá em cima já contou a história.
        <Text style={e.celulaQuieta}>—</Text>
      ) : (
        <Text style={e.celulaFalta}>NÃO REALIZADA</Text>
      )}
    </View>
  )
}

function Numero({
  valor, rotulo, destaque,
}: { valor: string | number; rotulo: string; destaque?: boolean }) {
  const e = useEstilos()
  return (
    <View style={e.numero}>
      <Text style={[e.numeroValor, destaque && e.numeroValorDestaque]}>{valor}</Text>
      <Text style={e.numeroRotulo}>{rotulo}</Text>
    </View>
  )
}

function Contagem({ tipo, quantas }: { tipo: TipoBatida; quantas: number }) {
  const e = useEstilos()
  const rotulo = { entrada: 'entradas', meio: 'meios', fim: 'saídas' }[tipo]
  return (
    <View style={e.contagem}>
      <View style={[e.ponto, { backgroundColor: corDaEtapa[tipo] }]} />
      <Text style={e.contagemTexto}>
        <Text style={e.contagemNumero}>{quantas}</Text> {rotulo}
      </Text>
    </View>
  )
}

function criarEstilos(cor: Tokens['cor'], uso: Tokens['uso']) {
  return StyleSheet.create({
  numeros: { flexDirection: 'row', flexWrap: 'wrap', gap: espaco.g },
  numero: { minWidth: '44%', flexGrow: 1 },
  numeroValor: { ...texto.metrica, fontSize: 22, lineHeight: 26, color: uso.tinta },
  numeroValorDestaque: { color: cor.acento700 },
  numeroRotulo: { ...texto.xs, fontFamily: tipo.regular, color: uso.tintaFraca },

  batidas: { flexDirection: 'row', flexWrap: 'wrap', gap: espaco.g },
  contagem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  contagemTexto: { ...texto.corpo, color: uso.tintaMedia },
  contagemNumero: { fontFamily: tipo.semi, color: uso.tinta },

  cabecalho: { flexDirection: 'row', alignItems: 'center', gap: espaco.m },
  cabecalhoTexto: { flex: 1, minWidth: 0 },

  contestarEtapas: { flexDirection: 'row', gap: espaco.s },
  contestarEtapaBotao: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: espaco.m,
    borderRadius: raio.campo,
    borderWidth: 1,
    borderColor: uso.borda,
  },
  contestarEtapaBotaoMarcada: { borderColor: cor.acento200, backgroundColor: cor.acento50 },
  contestarEtapaTexto: { ...texto.xs, fontFamily: tipo.semi, color: uso.tintaMedia },
  contestarEtapaTextoMarcado: { color: cor.acento700 },

  etapas: { flexDirection: 'row', gap: espaco.s },
  celula: {
    flex: 1,
    borderRadius: raio.campo,
    borderWidth: 1,
    borderColor: uso.borda,
    backgroundColor: cor.neutro25,
    padding: espaco.m,
    gap: 4,
  },
  celulaTopo: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  ponto: { width: 7, height: 7, borderRadius: 999 },
  celulaRotulo: { ...texto.xxs, color: uso.tintaFraca },
  celulaHora: { ...texto.corpoForte, color: uso.tinta },
  celulaAtraso: { ...texto.xxs, color: cor.aviso700 },
  celulaAssistida: { ...texto.xxs, color: cor.aviso600 },
  /* O traço quieto do dia inteiro ausente. */
  celulaQuieta: { ...texto.corpoForte, color: cor.neutro300 },
  celulaFalta: { ...texto.xxs, fontFamily: tipo.semi, color: cor.erro600, letterSpacing: 0.4 },
  })
}

function useEstilos() {
  const { cor, uso } = useTema()
  return useMemo(() => criarEstilos(cor, uso), [cor, uso])
}
