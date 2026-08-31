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

import { StyleSheet, Text, View } from 'react-native'
import { formatarBR, NOME_DA_FASE } from '@credenciei/dominio'
import type { DiaDaParticipacao, TipoBatida } from '@credenciei/contrato'
import { usePedido } from '../../src/dados/pedido'
import { useSessao } from '../../src/sessao/contexto'
import {
  celulaSilenciosa, NOME_DO_STATUS, resumoDoHistorico, statusDoDia,
} from '../../src/historico'
import {
  Aviso, Botao, Carregando, Cartao, Corpo, Legenda, Respiro, Selo, Separador,
  Tela, TituloDaTela, TituloDeCartao,
} from '../../src/ui/componentes'
import { cor, corDaEtapa, espaco, raio, texto, tipo, uso } from '../../src/ui/tema'

export default function MeusDias() {
  const { cliente } = useSessao()

  const { pedido, recarregar } = usePedido(async () => {
    const participacoes = await cliente.minhasParticipacoes()
    const p = participacoes.find(x => x.emAndamento) ?? participacoes[0]
    if (!p) return null
    return { participacao: p, dias: await cliente.meusDias(p.participacaoId) }
  }, [cliente])

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
          {dados.dias.map(d => <CartaoDoDia key={d.data} dia={d} />)}
        </>
      ) : null}
    </Tela>
  )
}

function CartaoDoDia({ dia }: { dia: DiaDaParticipacao }) {
  const status = statusDoDia(dia)
  const silencioso = celulaSilenciosa(dia)
  const tom = { presente: 'sucesso', incompleto: 'aviso', ausente: 'erro' } as const

  return (
    <Cartao>
      <View style={e.cabecalho}>
        <View style={e.cabecalhoTexto}>
          <TituloDeCartao>{formatarBR(`${dia.data}T12:00:00-03:00`, 'data')}</TituloDeCartao>
          <Legenda>{NOME_DA_FASE[dia.etapa]}</Legenda>
        </View>
        <Selo texto={NOME_DO_STATUS[status]} tipo={tom[status]} />
      </View>

      <Respiro altura={espaco.m} />

      <View style={e.etapas}>
        <Celula tipo="entrada" em={dia.entrada} silencioso={silencioso} />
        <Celula tipo="meio" em={dia.meio} silencioso={silencioso} atrasoMin={dia.meioAtrasoMin} />
        <Celula tipo="fim" em={dia.saida} silencioso={silencioso} />
      </View>

      {dia.horas !== null ? (
        <>
          <Respiro altura={espaco.m} />
          <Legenda>{dia.horas}h no evento</Legenda>
        </>
      ) : null}
    </Cartao>
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
  tipo, em, silencioso, atrasoMin,
}: {
  tipo: TipoBatida
  em: string | null
  silencioso: boolean
  atrasoMin?: number | null
}) {
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
  return (
    <View style={e.numero}>
      <Text style={[e.numeroValor, destaque && e.numeroValorDestaque]}>{valor}</Text>
      <Text style={e.numeroRotulo}>{rotulo}</Text>
    </View>
  )
}

function Contagem({ tipo, quantas }: { tipo: TipoBatida; quantas: number }) {
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

const e = StyleSheet.create({
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
  /* O traço quieto do dia inteiro ausente. */
  celulaQuieta: { ...texto.corpoForte, color: cor.neutro300 },
  celulaFalta: { ...texto.xxs, fontFamily: tipo.semi, color: cor.erro600, letterSpacing: 0.4 },
})
