// Organizações — os clientes da plataforma.
//
// Não é operação de evento: é o negócio por trás dele. Cada organização tem o
// próprio painel, a própria equipe e um limite de eventos contratado.
//
// ─── SUSPENDER NÃO É EXCLUIR ────────────────────────────────────────────────
//
// O cliente que parou de pagar perde o acesso e MANTÉM o histórico — que é
// dele, e que ele vai querer de volta se voltar. Por isso a lista continua
// mostrando quem está suspenso, e a ação é reversível com um toque.

import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { formatarBR } from '@credenciei/dominio'
import type { Organizacao } from '@credenciei/contrato'
import { mensagemDoErro, usePedido } from '../../src/dados/pedido'
import { useSessao } from '../../src/sessao/contexto'
import {
  Aviso, Botao, Carregando, Cartao, Corpo, Legenda, Respiro, Selo, Tela,
  TituloDaTela, TituloDeCartao,
} from '../../src/ui/componentes'
import { Icone } from '../../src/ui/icone'
import { cor, espaco, raio, texto, tipo, uso } from '../../src/ui/tema'

const PERIODO: Record<string, string> = {
  mensal: '/mês',
  anual: '/ano',
  por_evento: ' por evento',
}

export default function Organizacoes() {
  const { cliente } = useSessao()
  const [versao, setVersao] = useState(0)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const { pedido, recarregar } = usePedido(() => cliente.organizacoes(), [cliente, versao])
  const dados = pedido.estado === 'pronto' ? pedido.dados : null

  async function alternar(org: Organizacao) {
    setErro(null)
    setOcupado(org.organizacaoId)
    try {
      const r = await cliente.alternarOrganizacao(org.organizacaoId, !org.ativa)
      if (r.erro) return setErro(r.erro)
      setVersao(v => v + 1)
    } catch (e) {
      setErro(mensagemDoErro(e))
    } finally {
      setOcupado(null)
    }
  }

  return (
    <Tela>
      <TituloDaTela>Organizações</TituloDaTela>
      <Legenda>
        Os clientes da plataforma — cada um com o próprio painel, equipe e
        limite de eventos
      </Legenda>
      <Respiro />

      {erro ? <Aviso tipo="erro">{erro}</Aviso> : null}
      {pedido.estado === 'carregando' ? <Carregando /> : null}

      {pedido.estado === 'falhou' ? (
        <>
          <Aviso tipo="erro">{pedido.mensagem}</Aviso>
          <Botao titulo="Tentar de novo" onPress={recarregar} tipo="secundario" />
        </>
      ) : null}

      {dados ? (
        dados.itens.length === 0 ? (
          <Cartao>
            <Corpo>
              Nenhuma organização cadastrada. Crie a primeira e o admin dela.
            </Corpo>
          </Cartao>
        ) : (
          <>
            <Legenda>
              {dados.total} cadastrada{dados.total === 1 ? '' : 's'} · {dados.ativas} ativa
              {dados.ativas === 1 ? '' : 's'}
            </Legenda>
            <Respiro altura={espaco.s} />

            {dados.itens.map(org => (
              <CartaoDaOrganizacao
                key={org.organizacaoId}
                org={org}
                ocupado={ocupado === org.organizacaoId}
                aoAlternar={() => alternar(org)}
              />
            ))}
          </>
        )
      ) : null}
    </Tela>
  )
}

function CartaoDaOrganizacao({
  org, ocupado, aoAlternar,
}: { org: Organizacao; ocupado: boolean; aoAlternar: () => void }) {
  /*
   * O limite é o número que interessa ao dono da plataforma: é dele que sai a
   * conversa de renovação. Quando está cheio, ele precisa saltar aos olhos.
   */
  const noLimite = org.eventos >= org.limiteEventos

  return (
    <Cartao>
      <View style={[e.topo, !org.ativa && e.suspensa]}>
        <View style={e.marca}>
          <Text style={e.iniciais}>{iniciaisDe(org.nome)}</Text>
        </View>
        <View style={e.topoTexto}>
          <View style={e.linhaDoNome}>
            <TituloDeCartao>{org.nome}</TituloDeCartao>
            <Selo texto={org.ativa ? 'Ativa' : 'Suspensa'} tipo={org.ativa ? 'sucesso' : 'aviso'} />
          </View>
          {org.documento ? <Legenda>{org.documento}</Legenda> : null}
        </View>
      </View>

      {org.adminNome ? (
        <>
          <Respiro altura={espaco.m} />
          <View style={e.linha}>
            <Icone nome="User" tamanho={12} tom={uso.tintaFraca} />
            <Text style={e.meta} numberOfLines={1}>
              {org.adminNome}{org.adminIdentificador ? ` · ${org.adminIdentificador}` : ''}
            </Text>
          </View>
        </>
      ) : null}

      <Respiro altura={espaco.s} />
      <View style={e.linhas}>
        <View style={e.linha}>
          <Icone nome="CalendarDays" tamanho={12} tom={noLimite ? cor.aviso600 : uso.tintaFraca} />
          <Text style={[e.meta, noLimite && e.metaAlerta]}>
            {org.eventos} / {org.limiteEventos} evento{org.limiteEventos === 1 ? '' : 's'}
            {noLimite ? ' · no limite' : ''}
          </Text>
        </View>
        {org.valorCobrado !== null ? (
          <View style={e.linha}>
            <Icone nome="Wallet" tamanho={12} tom={uso.tintaFraca} />
            <Text style={e.meta}>
              {emReais(org.valorCobrado)}{PERIODO[org.periodo ?? ''] ?? ''}
            </Text>
          </View>
        ) : null}
        <View style={e.linha}>
          <Icone nome="Clock" tamanho={12} tom={uso.tintaFraca} />
          <Text style={e.meta}>desde {formatarBR(org.criadaEm, 'data')}</Text>
        </View>
      </View>

      <Respiro altura={espaco.m} />
      <Botao
        titulo={org.ativa ? 'Suspender acesso' : 'Reativar acesso'}
        onPress={aoAlternar}
        ocupado={ocupado}
        tipo={org.ativa ? 'secundario' : 'acento'}
      />
      {org.ativa ? (
        <>
          <Respiro altura={espaco.s} />
          <Legenda>
            Suspender bloqueia o login e mantém todo o histórico. Dá para
            reativar a qualquer momento.
          </Legenda>
        </>
      ) : null}
    </Cartao>
  )
}

function iniciaisDe(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return '?'
  const letras = partes.length > 1
    ? (partes[0]?.[0] ?? '') + (partes[1]?.[0] ?? '')
    : (partes[0] ?? '').slice(0, 2)
  return letras.toUpperCase()
}

/** Reais à mão: `toLocaleString` depende de dados que o celular pode não ter. */
function emReais(valor: number): string {
  const inteiros = String(Math.floor(valor))
  let comPontos = ''
  for (let i = 0; i < inteiros.length; i++) {
    const faltam = inteiros.length - i
    comPontos += inteiros[i]
    if (faltam > 1 && (faltam - 1) % 3 === 0) comPontos += '.'
  }
  return `R$ ${comPontos}`
}

const e = StyleSheet.create({
  topo: { flexDirection: 'row', alignItems: 'center', gap: espaco.m },
  suspensa: { opacity: 0.7 },
  marca: {
    width: 40,
    height: 40,
    borderRadius: raio.peca,
    backgroundColor: cor.acento50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iniciais: { ...texto.corpoForte, color: cor.acento700 },
  topoTexto: { flex: 1, minWidth: 0 },
  linhaDoNome: { flexDirection: 'row', alignItems: 'center', gap: espaco.s, flexWrap: 'wrap' },

  linhas: { gap: espaco.xs },
  linha: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  meta: { ...texto.xs, fontFamily: tipo.regular, color: uso.tintaFraca, flexShrink: 1 },
  metaAlerta: { color: cor.aviso700, fontFamily: tipo.semi },
})
