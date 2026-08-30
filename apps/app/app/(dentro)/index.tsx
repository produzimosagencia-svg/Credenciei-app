// A primeira tela de quem está logado: os eventos da pessoa.
//
// Uma conta permanente participa de vários eventos ao longo do ano — foi essa a
// decisão do Juan quando escolheu incluir o colaborador no app. Por isso a tela
// inicial é uma LISTA, e não o crachá de um evento só: no dia seguinte ao
// Henrique e Juliano, esta mesma conta pode estar num evento diferente.

import { useRouter } from 'expo-router'
import { View, StyleSheet } from 'react-native'
import { formatarBR } from '@credenciei/dominio'
import type { ResumoParticipacao } from '@credenciei/contrato'
import { usePedido } from '../../src/dados/pedido'
import { useSessao } from '../../src/sessao/contexto'
import {
  Aviso, Botao, Carregando, Cartao, Corpo, Legenda, Respiro, Selo, Tela, Titulo,
} from '../../src/ui/componentes'
import { espaco } from '../../src/ui/tema'

export default function MeusEventos() {
  const router = useRouter()
  const { cliente, sair, semRede } = useSessao()
  const { pedido, recarregar } = usePedido(() => cliente.minhasParticipacoes(), [cliente])

  return (
    <Tela>
      {semRede ? (
        <Aviso tipo="atencao">
          Você está sem internet. Dá para ver o que já estava aqui, mas nada
          novo chega até o sinal voltar.
        </Aviso>
      ) : null}

      {pedido.estado === 'carregando' ? <Carregando texto="Buscando seus eventos…" /> : null}

      {pedido.estado === 'falhou' ? (
        <>
          <Aviso tipo="erro">{pedido.mensagem}</Aviso>
          <Botao titulo="Tentar de novo" onPress={recarregar} tipo="secundario" />
        </>
      ) : null}

      {pedido.estado === 'pronto' && pedido.dados.length === 0 ? (
        <View style={e.vazio}>
          <Titulo>Você ainda não está em nenhum evento</Titulo>
          <Respiro altura={espaco.s} />
          <Corpo>
            Quem te contratou mandou um código parecido com HJK-2026-K7M2, por
            WhatsApp ou no grupo da equipe. É com ele que você entra.
          </Corpo>
          <Respiro />
          <Botao
            titulo="Tenho um código de evento"
            onPress={() => router.push('/novo-evento')}
          />
        </View>
      ) : null}

      {pedido.estado === 'pronto' && pedido.dados.length > 0 ? (
        <>
          {pedido.dados.map(p => <CartaoDoEvento key={p.participacaoId} participacao={p} />)}
          <Respiro altura={espaco.s} />
          <Botao
            titulo="Entrar em outro evento"
            onPress={() => router.push('/novo-evento')}
            tipo="secundario"
          />
        </>
      ) : null}

      <Respiro altura={espaco.ggg} />
      <Botao titulo="Sair da conta" onPress={() => { void sair() }} tipo="texto" />
    </Tela>
  )
}

function CartaoDoEvento({ participacao }: { participacao: ResumoParticipacao }) {
  const p = participacao
  const situacao = {
    aguardando_aprovacao: { texto: 'Aguardando aprovação', tipo: 'atencao' as const },
    credenciado: { texto: 'Credenciado', tipo: 'ok' as const },
    descredenciado: { texto: 'Descredenciado', tipo: 'erro' as const },
  }[p.situacao]

  return (
    <Cartao>
      {p.emAndamento ? (
        <>
          <Selo texto="É agora" tipo="informacao" />
          <Respiro altura={espaco.s} />
        </>
      ) : null}

      <Titulo>{p.eventoNome}</Titulo>
      <Respiro altura={espaco.xs} />
      <Legenda>{formatarBR(p.dataInicio, 'data')}{p.local ? ` · ${p.local}` : ''}</Legenda>

      <Respiro altura={espaco.m} />
      <View style={e.linha}>
        <Corpo forte>{[p.equipe, p.funcao].filter(Boolean).join(' · ') || 'Sem função definida'}</Corpo>
      </View>
      {p.supervisor ? <Legenda>Supervisor: {p.supervisor}</Legenda> : null}

      <Respiro altura={espaco.m} />
      <Selo texto={situacao.texto} tipo={situacao.tipo} />
    </Cartao>
  )
}

const e = StyleSheet.create({
  vazio: { paddingVertical: espaco.gg },
  linha: { flexDirection: 'row', alignItems: 'center', gap: espaco.s },
})
