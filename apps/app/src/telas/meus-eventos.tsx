// A primeira tela de quem está logado: os eventos da pessoa.
//
// É o "Painel" do sistema web em formato de app — mesma ideia, mesmo desenho:
// o título com a data por baixo, e a lista do que está acontecendo. A diferença
// é o recorte: no painel do computador o admin vê os eventos da organização
// inteira; aqui a pessoa vê os DELA. O servidor decide isso pelo token, e não a
// tela — nenhuma rota do app aceita id de pessoa vindo de fora.
//
// A lista existe porque a conta é permanente: no dia seguinte ao Henrique e
// Juliano, esta mesma conta pode estar num evento diferente.

import { useRouter } from 'expo-router'
import { View, StyleSheet } from 'react-native'
import { formatarBR } from '@credenciei/dominio'
import type { ResumoParticipacao } from '@credenciei/contrato'
import { usePedido } from '../dados/pedido'
import { useSessao } from '../sessao/contexto'
import {
  Aviso, Botao, Carregando, Cartao, Corpo, Etiqueta, Legenda, PontoAoVivo,
  Respiro, Selo, Tela, TituloDaTela, TituloDeCartao,
} from '../ui/componentes'
import { espaco } from '../ui/tema'

export function MeusEventos() {
  const router = useRouter()
  const { cliente, sair, semRede } = useSessao()
  const { pedido, recarregar } = usePedido(() => cliente.minhasParticipacoes(), [cliente])

  const emAndamento = pedido.estado === 'pronto'
    ? pedido.dados.filter(p => p.emAndamento).length
    : 0

  return (
    <Tela>
      <TituloDaTela>Meus eventos</TituloDaTela>
      <Legenda>{formatarBR(new Date().toISOString(), 'data')}</Legenda>
      <Respiro />

      {semRede ? (
        <Aviso tipo="aviso">
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
        <Cartao>
          <TituloDeCartao>Você ainda não está em nenhum evento</TituloDeCartao>
          <Respiro altura={espaco.s} />
          <Corpo>
            Quem te contratou mandou um código parecido com HJK-2026-K7M2, por
            WhatsApp ou no grupo da equipe. É com ele que você entra.
          </Corpo>
          <Respiro />
          <Botao titulo="Tenho um código de evento" onPress={() => router.push('/novo-evento')} />
        </Cartao>
      ) : null}

      {pedido.estado === 'pronto' && pedido.dados.length > 0 ? (
        <>
          <View style={e.tituloDaLista}>
            <Etiqueta>Acontecendo agora</Etiqueta>
            {emAndamento > 0 ? <Selo texto={String(emAndamento)} tipo="sucesso" /> : null}
          </View>
          <Respiro altura={espaco.s} />

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
      <Botao titulo="Sair da conta" onPress={() => { void sair() }} tipo="fantasma" />
    </Tela>
  )
}

/**
 * O cartão de um evento.
 *
 * Segue o do painel web: o "AO VIVO" com o ponto verde no topo, o nome, e os
 * metadados numa linha só embaixo. O que está em andamento é o único que ganha
 * a marca — se todos ganhassem, ela deixaria de significar alguma coisa.
 */
function CartaoDoEvento({ participacao }: { participacao: ResumoParticipacao }) {
  const p = participacao
  const situacao = {
    aguardando_aprovacao: { texto: 'Aguardando aprovação', tipo: 'aviso' as const },
    credenciado: { texto: 'Credenciado', tipo: 'sucesso' as const },
    descredenciado: { texto: 'Descredenciado', tipo: 'erro' as const },
  }[p.situacao]

  return (
    <Cartao>
      {p.emAndamento ? (
        <View style={e.aoVivo}>
          <PontoAoVivo />
          <Legenda>AO VIVO</Legenda>
        </View>
      ) : null}

      <TituloDeCartao>{p.eventoNome}</TituloDeCartao>
      <Respiro altura={espaco.xs} />
      <Legenda>
        {formatarBR(p.dataInicio, 'data')}
        {p.local ? `  ·  ${p.local}` : ''}
      </Legenda>

      <View style={e.linhaDoVinculo}>
        <Corpo forte>
          {[p.equipe, p.funcao].filter(Boolean).join('  ·  ') || 'Sem função definida'}
        </Corpo>
        <Selo texto={situacao.texto} tipo={situacao.tipo} />
      </View>

      {p.supervisor ? <Legenda>Supervisor: {p.supervisor}</Legenda> : null}
    </Cartao>
  )
}

const e = StyleSheet.create({
  tituloDaLista: { flexDirection: 'row', alignItems: 'center', gap: espaco.s },
  aoVivo: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: espaco.s },
  linhaDoVinculo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: espaco.s,
    marginTop: espaco.m,
    marginBottom: espaco.xs,
  },
})
