// Trilha de auditoria — quem alterou o quê. Cópia (reduzida) do site's
// `admin/auditoria`: aqui é "visualização simples", como o próprio backlog
// descreve — período e evento, sem o filtro em cascata nem a exportação
// .xlsx da tela de lá. O escopo (o que cada papel enxerga) mora inteiro no
// servidor: master vê tudo, os demais gestores só a própria organização,
// suporte só o que ele mesmo fez.

import { useMemo, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { formatarBR } from '@credenciei/dominio'
import type { LinhaDeAuditoria } from '@credenciei/contrato'
import { usePedido } from '../../src/dados/pedido'
import { ACAO_LABELS, tomDaAcao } from '../../src/dados/auditoria-rotulos'
import { useSessao } from '../../src/sessao/contexto'
import {
  Aviso, Botao, Carregando, Cartao, Corpo, Legenda, Respiro, Selo, Tela, TituloDaTela,
} from '../../src/ui/componentes'
import { espaco, raio, texto, tipo } from '../../src/ui/tema'
import { useTema, type Tokens } from '../../src/ui/tema-contexto'

const PERIODOS = [
  { rotulo: 'Hoje', dias: 1 },
  { rotulo: '7 dias', dias: 7 },
  { rotulo: '30 dias', dias: 30 },
  { rotulo: 'Tudo', dias: undefined },
] as const

export default function Auditoria() {
  const { cliente } = useSessao()
  const [dias, setDias] = useState<number | undefined>(7)
  const e = useEstilos()

  const { pedido, recarregar } = usePedido(() => cliente.auditoria({ dias }), [cliente, dias])

  return (
    <Tela>
      <TituloDaTela>Trilha de auditoria</TituloDaTela>
      <Legenda>Quem alterou o quê, e quando.</Legenda>
      <Respiro />

      <View style={e.periodos}>
        {PERIODOS.map(p => (
          <ChipDePeriodo
            key={p.rotulo}
            rotulo={p.rotulo}
            selecionado={dias === p.dias}
            aoTocar={() => setDias(p.dias)}
          />
        ))}
      </View>
      <Respiro />

      {pedido.estado === 'carregando' ? <Carregando /> : null}
      {pedido.estado === 'falhou' ? (
        <>
          <Aviso tipo="erro">{pedido.mensagem}</Aviso>
          <Respiro altura={espaco.s} />
          <Botao titulo="Tentar de novo" onPress={recarregar} tipo="secundario" />
        </>
      ) : null}

      {pedido.estado === 'pronto' ? (
        pedido.dados.length === 0 ? (
          <Cartao>
            <Corpo>Nenhuma alteração registrada neste período.</Corpo>
          </Cartao>
        ) : (
          <>
            <Legenda>{pedido.dados.length} registro{pedido.dados.length === 1 ? '' : 's'}</Legenda>
            <Respiro altura={espaco.s} />
            {pedido.dados.map(linha => <LinhaDaTrilha key={linha.id} linha={linha} />)}
          </>
        )
      ) : null}
    </Tela>
  )
}

function ChipDePeriodo({
  rotulo, selecionado, aoTocar,
}: {
  rotulo: string
  selecionado: boolean
  aoTocar: () => void
}) {
  const { cor, uso } = useTema()
  return (
    <Text
      onPress={aoTocar}
      style={[
        estilosDoChip.base,
        {
          backgroundColor: selecionado ? cor.acento500 : uso.superficie,
          borderColor: selecionado ? cor.acento500 : uso.borda,
          color: selecionado ? '#ffffff' : uso.tinta,
        },
      ]}
    >
      {rotulo}
    </Text>
  )
}

function LinhaDaTrilha({ linha }: { linha: LinhaDeAuditoria }) {
  const e = useEstilos()
  return (
    <Cartao>
      <View style={e.cabecalho}>
        <Selo texto={ACAO_LABELS[linha.acao] ?? linha.acao} tipo={tomDaAcao(linha.acao)} />
        <Legenda>{formatarBR(linha.quando, 'completo')}</Legenda>
      </View>
      {linha.campoAlterado ? (
        <>
          <Respiro altura={espaco.xs} />
          <Corpo forte>{linha.campoAlterado}</Corpo>
        </>
      ) : null}
      {linha.valorAnterior || linha.valorNovo ? (
        <>
          <Respiro altura={espaco.xs} />
          <Corpo>
            {linha.valorAnterior ? <Text style={e.riscado}>{linha.valorAnterior}</Text> : null}
            {linha.valorAnterior && linha.valorNovo ? ' → ' : ''}
            {linha.valorNovo ?? ''}
          </Corpo>
        </>
      ) : null}
      {linha.motivo ? (
        <>
          <Respiro altura={espaco.xs} />
          <Legenda>Motivo: {linha.motivo}</Legenda>
        </>
      ) : null}
      <Respiro altura={espaco.xs} />
      <Legenda>
        {linha.autorNome}
        {linha.eventoNome ? ` · ${linha.eventoNome}` : ''}
      </Legenda>
    </Cartao>
  )
}

function criarEstilos(_cor: Tokens['cor'], uso: Tokens['uso']) {
  return StyleSheet.create({
    periodos: { flexDirection: 'row', flexWrap: 'wrap', gap: espaco.s },
    cabecalho: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: espaco.s },
    riscado: { textDecorationLine: 'line-through', color: uso.tintaFraca },
  })
}

const estilosDoChip = StyleSheet.create({
  base: {
    borderWidth: 1, borderRadius: raio.pilula, paddingHorizontal: espaco.m, paddingVertical: espaco.s,
    ...texto.xs, fontFamily: tipo.forte, overflow: 'hidden',
  },
})

function useEstilos() {
  const { cor, uso } = useTema()
  return useMemo(() => criarEstilos(cor, uso), [cor, uso])
}
