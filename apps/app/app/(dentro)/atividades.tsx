// Atividades do evento — as sete visões de um dia.
//
// ─── NÃO É O PAINEL ─────────────────────────────────────────────────────────
//
// O Painel responde "como está". Esta tela responde "quem, NESTE dia, cumpriu
// ou está devendo cada etapa" — a mesma pergunta que `/admin/atividades`
// responde no site, com o mesmo seletor de dia sempre visível e as mesmas
// sete visões. Reescrita em 11/09/2026: antes esta tela tinha a própria linha
// do tempo e os próprios números, calculados de outro jeito — e por isso
// dizia coisas diferentes da tela de Presença sobre o mesmo dia. Uma régua
// só, agora — `cliente.atividades(eventoId, { visao, dia })`.
//
// "Ainda não chegaram" (a pendência) só existe como uma das sete visões, não
// mais como lista solta: contar a equipe inteira menos quem bateu, sem olhar
// se já passou a hora, é o que fazia esta tela dizer "587 não chegaram" num
// dia em que a maioria nem estava escalada.

import { useEffect, useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { formatCpf, formatarBR } from '@credenciei/dominio'
import type { AtividadesDoEvento, EventoEscaneavel, VisaoDeAtividade } from '@credenciei/contrato'
import { VISOES_DE_ATIVIDADE } from '@credenciei/contrato'
import { usePedido } from '../../src/dados/pedido'
import { mensagemDoErro } from '../../src/dados/pedido'
import { useSessao } from '../../src/sessao/contexto'
import {
  Aviso, Botao, Carregando, Cartao, Corpo, Etiqueta, Indicador, Legenda,
  Respiro, Selo, Tela, TituloDaTela,
} from '../../src/ui/componentes'
import { Icone } from '../../src/ui/icone'
import { espaco, raio, texto, tipo } from '../../src/ui/tema'
import { useTema, type Tokens } from '../../src/ui/tema-contexto'

const ICONE_DO_NUMERO: Record<string, string> = {
  presentes: 'UserCheck',
  entradas: 'LogIn',
  saidas: 'LogOut',
  pendencias: 'AlertTriangle',
}

const ROTULO_DO_NUMERO: Record<string, string> = {
  presentes: 'Presentes agora',
  entradas: 'Entradas no dia',
  saidas: 'Saídas no dia',
  pendencias: 'Pendências',
}

/** Cada cartão do topo leva direto para a visão que ele conta. */
const VISAO_DO_NUMERO: Record<string, VisaoDeAtividade> = {
  presentes: 'presentes',
  entradas: 'entrada',
  saidas: 'fim',
  pendencias: 'faltam',
}

export default function Atividades() {
  const { cliente } = useSessao()
  const e = useEstilos()

  const [eventos, setEventos] = useState<EventoEscaneavel[]>([])
  const [eventoId, setEventoId] = useState('')
  const [visao, setVisao] = useState<VisaoDeAtividade>('entrada')
  const [dia, setDia] = useState<string | undefined>(undefined)
  const [erroDeCarga, setErroDeCarga] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    cliente.eventosParaAcompanhar()
      .then(lista => {
        if (!vivo) return
        setEventos(lista)
        setEventoId(atual => atual || lista[0]?.eventoId || '')
      })
      .catch(e => { if (vivo) setErroDeCarga(mensagemDoErro(e)) })
    return () => { vivo = false }
  }, [cliente])

  const { pedido, recarregar } = usePedido<AtividadesDoEvento | null>(
    async () => (eventoId ? cliente.atividades(eventoId, { visao, dia }) : null),
    [cliente, eventoId, visao, dia],
  )

  const dados = pedido.estado === 'pronto' ? pedido.dados : null

  /*
   * Trocar de evento esquece o dia escolhido no anterior: o dia 06/09 de um
   * evento raramente existe no próximo, e um dia inválido cairia direto no
   * fallback do servidor — melhor já pedir sem nada e deixar ele escolher.
   */
  function trocarEvento(id: string) {
    setEventoId(id)
    setDia(undefined)
  }

  return (
    <Tela>
      <TituloDaTela>Atividades do evento</TituloDaTela>
      <Legenda>
        {dados
          ? `${dados.eventoNome} · ${rotuloDoDia(dados.diaEscolhido)}${dados.diaEscolhido === dados.hoje ? ' (hoje)' : ''}`
          : 'Quem já registrou cada etapa, e quem ainda não'}
      </Legenda>
      <Respiro />

      {erroDeCarga ? <Aviso tipo="erro">{erroDeCarga}</Aviso> : null}

      {eventos.length > 1 ? (
        <SeletorDeEvento eventos={eventos} escolhido={eventoId} aoEscolher={trocarEvento} />
      ) : null}

      {pedido.estado === 'carregando' ? <Carregando texto="Buscando as atividades…" /> : null}

      {pedido.estado === 'falhou' ? (
        <>
          <Aviso tipo="erro">{pedido.mensagem}</Aviso>
          <Botao titulo="Tentar de novo" onPress={recarregar} tipo="secundario" />
        </>
      ) : null}

      {dados ? (
        <>
          <View style={e.grade}>
            {(Object.keys(ROTULO_DO_NUMERO) as (keyof AtividadesDoEvento['numeros'])[]).map(chave => (
              <View key={chave} style={e.gradeItem}>
                <Pressable onPress={() => setVisao(VISAO_DO_NUMERO[chave]!)}>
                  <Indicador
                    rotulo={ROTULO_DO_NUMERO[chave]!}
                    valor={dados.numeros[chave]}
                    sub={chave === 'pendencias' ? 'já passou da hora' : undefined}
                    tom={chave === 'pendencias' ? 'aviso' : chave === 'presentes' ? 'sucesso' : chave === 'saidas' ? 'info' : 'acento'}
                    icone={ICONE_DO_NUMERO[chave]}
                  />
                </Pressable>
              </View>
            ))}
          </View>

          <Respiro altura={espaco.m} />
          <SeletorDeVisao atual={visao} aoTrocar={setVisao} />

          {dados.dias.length > 1 ? (
            <>
              <Respiro altura={espaco.s} />
              <SeletorDeDia
                dias={dados.dias}
                diaEscolhido={dados.diaEscolhido}
                hoje={dados.hoje}
                aoEscolher={setDia}
              />
            </>
          ) : null}

          <Respiro altura={espaco.m} />
          <Etiqueta>{VISOES_DE_ATIVIDADE[visao].titulo}</Etiqueta>
          <Respiro altura={espaco.s} />

          {dados.linhas.length === 0 ? (
            <Cartao>
              <Corpo>Ninguém nesta visão, neste dia.</Corpo>
            </Cartao>
          ) : (
            <Cartao semPadding>
              {dados.linhas.map((l, i) => (
                <View key={l.id}>
                  {i > 0 ? <View style={e.fio} /> : null}
                  <LinhaDaTabela linha={l} colunaHora={dados.colunaHora} />
                </View>
              ))}
            </Cartao>
          )}
        </>
      ) : null}
    </Tela>
  )
}

// ─── Peças ──────────────────────────────────────────────────────────────────

/** "2026-08-30" → "30/08". */
function rotuloDoDia(d: string): string {
  const [, m, dd] = d.split('-')
  return `${dd}/${m}`
}

function SeletorDeEvento({
  eventos, escolhido, aoEscolher,
}: {
  eventos: EventoEscaneavel[]
  escolhido: string
  aoEscolher: (id: string) => void
}) {
  const e = useEstilos()
  return (
    <Cartao semPadding>
      {eventos.map((ev, i) => {
        const ativo = ev.eventoId === escolhido
        return (
          <View key={ev.eventoId}>
            {i > 0 ? <View style={e.fio} /> : null}
            <Pressable
              onPress={() => aoEscolher(ev.eventoId)}
              accessibilityRole="radio"
              accessibilityState={{ selected: ativo }}
              style={({ pressed }) => [e.opcao, pressed && e.opcaoTocada]}
            >
              <View style={[e.marcador, ativo && e.marcadorAtivo]}>
                {ativo ? <Icone nome="Check" tamanho={12} tom="#ffffff" espessura={3} /> : null}
              </View>
              <Text style={[e.opcaoTexto, ativo && e.opcaoTextoAtivo]} numberOfLines={1}>
                {ev.nome}
              </Text>
            </Pressable>
          </View>
        )
      })}
    </Cartao>
  )
}

/**
 * As sete visões, numa faixa com rolagem horizontal.
 *
 * Antes eram pílulas soltas — sete botões perdidos, sem moldura. Aqui vêm
 * dentro de um cartão só, com o ícone reforçando o que cada visão mostra.
 */
function SeletorDeVisao({
  atual, aoTrocar,
}: { atual: VisaoDeAtividade; aoTrocar: (v: VisaoDeAtividade) => void }) {
  const { uso } = useTema()
  const e = useEstilos()
  const visoes = Object.keys(VISOES_DE_ATIVIDADE) as VisaoDeAtividade[]

  return (
    <Cartao semPadding>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={e.visoes}>
        {visoes.map(v => {
          const ativa = v === atual
          return (
            <Pressable
              key={v}
              onPress={() => aoTrocar(v)}
              accessibilityRole="tab"
              accessibilityState={{ selected: ativa }}
              style={[e.visao, ativa && e.visaoAtiva]}
            >
              <Icone
                nome={VISOES_DE_ATIVIDADE[v].icone}
                tamanho={13}
                tom={ativa ? '#ffffff' : uso.tintaFraca}
              />
              <Text style={[e.visaoTexto, ativa && e.visaoTextoAtivo]}>{VISOES_DE_ATIVIDADE[v].titulo}</Text>
            </Pressable>
          )
        })}
      </ScrollView>
    </Cartao>
  )
}

/**
 * O seletor de dia — sempre visível quando o evento tem mais de um.
 *
 * Pílulas, e não um calendário: os eventos daqui raramente passam de uns
 * poucos dias de operação (montagem, o dia, desmontagem), e uma fileira que
 * cabe na tela é mais rápida de tocar num celular do que abrir um mês inteiro
 * para escolher entre três datas.
 */
function SeletorDeDia({
  dias, diaEscolhido, hoje, aoEscolher,
}: {
  dias: string[]
  diaEscolhido: string
  hoje: string
  aoEscolher: (d: string) => void
}) {
  const e = useEstilos()
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={e.dias}>
      {dias.map(d => {
        const ativo = d === diaEscolhido
        return (
          <Pressable
            key={d}
            onPress={() => aoEscolher(d)}
            accessibilityRole="tab"
            accessibilityState={{ selected: ativo }}
            style={[e.dia, ativo && e.diaAtivo]}
          >
            <Text style={[e.diaTexto, ativo && e.diaTextoAtivo]}>
              {rotuloDoDia(d)}{d === hoje ? ' · hoje' : ''}
            </Text>
          </Pressable>
        )
      })}
    </ScrollView>
  )
}

function LinhaDaTabela({
  linha, colunaHora,
}: { linha: AtividadesDoEvento['linhas'][number]; colunaHora: string }) {
  const e = useEstilos()
  return (
    <View style={e.linha}>
      <View style={e.linhaTexto}>
        <View style={e.linhaTopo}>
          <Text style={e.linhaNome} numberOfLines={1}>{linha.nome}</Text>
          {linha.manual ? <Selo texto="Manual" tipo="aviso" /> : null}
        </View>
        <View style={e.linhaMeta}>
          <Text style={e.meta}>{linha.setor}</Text>
          <Text style={e.meta}>{formatCpf(linha.cpf)}</Text>
        </View>
      </View>
      {linha.em && colunaHora ? (
        <View style={e.horario}>
          <Text style={e.horarioRotulo}>{colunaHora}</Text>
          <Text style={e.horarioValor}>{formatarBR(linha.em, 'hora')}</Text>
        </View>
      ) : null}
    </View>
  )
}

function criarEstilos(cor: Tokens['cor'], uso: Tokens['uso']) {
  return StyleSheet.create({
  grade: { flexDirection: 'row', flexWrap: 'wrap', gap: espaco.m },
  gradeItem: { width: '48%', flexGrow: 1 },

  fio: { height: 1, backgroundColor: uso.borda, marginLeft: espaco.g },

  opcao: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaco.m,
    paddingHorizontal: espaco.g,
    minHeight: 52,
  },
  opcaoTocada: { backgroundColor: cor.neutro50 },
  opcaoTexto: { ...texto.corpo, color: uso.tintaMedia, flex: 1 },
  opcaoTextoAtivo: { color: uso.tinta, fontFamily: tipo.semi },
  marcador: {
    width: 20,
    height: 20,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: cor.neutro300,
    alignItems: 'center',
    justifyContent: 'center',
  },
  marcadorAtivo: { backgroundColor: cor.acento500, borderColor: cor.acento500 },

  visoes: { flexDirection: 'row', gap: espaco.xs, padding: espaco.xs },
  visao: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 36,
    paddingHorizontal: espaco.m,
    borderRadius: raio.pilula,
  },
  visaoAtiva: { backgroundColor: cor.acento500 },
  visaoTexto: { ...texto.xs, fontFamily: tipo.semi, color: uso.tintaMedia },
  visaoTextoAtivo: { color: '#ffffff' },

  dias: { flexDirection: 'row', gap: espaco.s },
  dia: {
    minHeight: 36,
    paddingHorizontal: espaco.m,
    borderRadius: raio.pilula,
    borderWidth: 1,
    borderColor: uso.borda,
    backgroundColor: uso.superficie,
    alignItems: 'center',
    justifyContent: 'center',
  },
  diaAtivo: { backgroundColor: cor.acento500, borderColor: cor.acento600 },
  diaTexto: { ...texto.xs, fontFamily: tipo.semi, color: uso.tintaMedia },
  diaTextoAtivo: { color: '#ffffff' },

  linha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaco.m,
    paddingHorizontal: espaco.g,
    paddingVertical: espaco.m,
  },
  linhaTexto: { flex: 1, minWidth: 0, gap: 4 },
  linhaTopo: { flexDirection: 'row', alignItems: 'center', gap: espaco.s, flexWrap: 'wrap' },
  linhaNome: { ...texto.corpoForte, color: uso.tinta, flexShrink: 1 },
  linhaMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: espaco.m },
  meta: { ...texto.xs, fontFamily: tipo.regular, color: uso.tintaFraca },

  horario: { alignItems: 'flex-end' },
  horarioRotulo: { ...texto.xxs, color: uso.tintaFraca },
  horarioValor: { ...texto.corpoForte, fontFamily: tipo.semi, color: uso.tinta },
  })
}

function useEstilos() {
  const { cor, uso } = useTema()
  return useMemo(() => criarEstilos(cor, uso), [cor, uso])
}
