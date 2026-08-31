// Atividades do evento — o log da operação.
//
// ─── NÃO É O PAINEL ─────────────────────────────────────────────────────────
//
// O Painel responde "como está". Esta tela responde "o que aconteceu, na ordem,
// e por quem". É a que se abre quando alguém contesta uma batida — e a que
// mostra NOME POR NOME quem ainda não chegou, em vez de só o número.
//
// Daí as três partes:
//
//   os números       os mesmos quatro do painel, mas deste evento e deste dia;
//   a linha do tempo cada batida, da mais recente para a mais antiga, dizendo
//                    COMO ela entrou — QR, foto ou registro assistido;
//   as duas listas   quem não chegou (com telefone, que é de onde sai a
//                    ligação) e quem está dentro do evento agora.

import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { formatCpf, formatarBR } from '@credenciei/dominio'
import type {
  AtividadesDoEvento, EventoEscaneavel, LinhaDaAtividade, PessoaDaLista,
  TipoBatida,
} from '@credenciei/contrato'
import { usePedido } from '../../src/dados/pedido'
import { mensagemDoErro } from '../../src/dados/pedido'
import { useSessao } from '../../src/sessao/contexto'
import {
  Aviso, Botao, Carregando, Cartao, Corpo, Etiqueta, Indicador, Legenda,
  Respiro, Selo, Tela, TituloDaTela, TituloDeCartao,
} from '../../src/ui/componentes'
import { Icone } from '../../src/ui/icone'
import { cor, corDaEtapa, espaco, raio, texto, tipo, uso } from '../../src/ui/tema'

const ETAPAS: TipoBatida[] = ['entrada', 'meio', 'fim']
const ROTULO: Record<TipoBatida, string> = { entrada: 'Entrada', meio: 'Meio', fim: 'Saída' }

const ICONE_DO_INDICADOR: Record<string, string> = {
  batidas_hoje: 'Activity',
  presentes: 'UserCheck',
  nao_chegaram: 'Clock',
  sairam: 'ShieldCheck',
}

/** Como a batida entrou. É a primeira coisa que se olha numa contestação. */
const COMO: Record<string, { rotulo: string; icone: string; tom: 'aviso' | 'info' }> = {
  qr: { rotulo: 'QR Code', icone: 'QrCode', tom: 'info' },
  foto: { rotulo: 'Foto', icone: 'Camera', tom: 'info' },
  assistido: { rotulo: 'Registro assistido', icone: 'ShieldCheck', tom: 'aviso' },
}

export default function Atividades() {
  const { cliente } = useSessao()

  const [eventos, setEventos] = useState<EventoEscaneavel[]>([])
  const [eventoId, setEventoId] = useState('')
  const [filtro, setFiltro] = useState<TipoBatida | null>(null)
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
    async () => (eventoId ? cliente.atividades(eventoId) : null),
    [cliente, eventoId],
  )

  const dados = pedido.estado === 'pronto' ? pedido.dados : null
  const linhas = dados
    ? (filtro ? dados.linhas.filter(l => l.etapa === filtro) : dados.linhas)
    : []

  return (
    <Tela>
      <TituloDaTela>Atividades do evento</TituloDaTela>
      <Legenda>
        {dados ? dados.eventoNome : 'Cada batida registrada, na ordem em que aconteceu'}
      </Legenda>
      <Respiro />

      {erroDeCarga ? <Aviso tipo="erro">{erroDeCarga}</Aviso> : null}

      {eventos.length > 1 ? (
        <SeletorDeEvento eventos={eventos} escolhido={eventoId} aoEscolher={setEventoId} />
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
            {dados.indicadores.map(i => (
              <View key={i.chave} style={e.gradeItem}>
                <Indicador
                  rotulo={i.rotulo}
                  valor={i.valor}
                  sub={i.sub}
                  tom={i.tom}
                  icone={
                    <Icone
                      nome={ICONE_DO_INDICADOR[i.chave] ?? 'Activity'}
                      tamanho={16}
                      tom="#ffffff"
                    />
                  }
                />
              </View>
            ))}
          </View>

          <Respiro altura={espaco.s} />
          <FiltroDeEtapa
            atual={filtro}
            aoTrocar={setFiltro}
            total={dados.linhas.length}
            porEtapa={dados.porEtapa}
          />

          <Respiro altura={espaco.m} />
          <Etiqueta>Linha do tempo</Etiqueta>
          <Legenda>
            {dados.noTeto
              ? 'Mostrando as batidas mais recentes deste evento'
              : 'Da mais recente para a mais antiga'}
          </Legenda>
          <Respiro altura={espaco.s} />

          {linhas.length === 0 ? (
            <Cartao>
              <Corpo>
                {filtro
                  ? `Nenhuma batida de ${ROTULO[filtro].toLowerCase()} ainda.`
                  : 'Nenhuma batida registrada ainda.'}
              </Corpo>
              <Respiro altura={espaco.xs} />
              <Legenda>
                Assim que a equipe começar a passar pelo QR ou pelo check-in por
                foto, aparece aqui.
              </Legenda>
            </Cartao>
          ) : (
            <Cartao semPadding>
              {linhas.map((l, i) => (
                <View key={l.id}>
                  {i > 0 ? <View style={e.fio} /> : null}
                  <LinhaDoLog linha={l} />
                </View>
              ))}
            </Cartao>
          )}

          <Respiro altura={espaco.s} />
          <ListaDePessoas
            titulo="Ainda não chegaram"
            descricao="Equipe ativa sem registro de entrada"
            vazio="Todo mundo já bateu a entrada"
            pessoas={dados.naoChegaram}
            tom="aviso"
            comTelefone
          />

          <ListaDePessoas
            titulo="Ainda no evento"
            descricao="Bateram entrada e não bateram saída"
            vazio="Ninguém dentro do evento agora"
            pessoas={dados.aindaNoEvento}
            tom="sucesso"
          />
        </>
      ) : null}
    </Tela>
  )
}

// ─── Peças ──────────────────────────────────────────────────────────────────

function SeletorDeEvento({
  eventos, escolhido, aoEscolher,
}: {
  eventos: EventoEscaneavel[]
  escolhido: string
  aoEscolher: (id: string) => void
}) {
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
 * O filtro por etapa.
 *
 * O log inteiro é longo, e quase sempre a pergunta é sobre uma etapa só — "quem
 * bateu a saída?". O contador ao lado de cada aba vem da MESMA lista que a tela
 * mostra: se viesse de outra conta, a aba diria 4 e a lista mostraria 3.
 */
function FiltroDeEtapa({
  atual, aoTrocar, total, porEtapa,
}: {
  atual: TipoBatida | null
  aoTrocar: (e: TipoBatida | null) => void
  total: number
  porEtapa: Record<TipoBatida, number>
}) {
  const abas: { chave: TipoBatida | null; rotulo: string; contador: number }[] = [
    { chave: null, rotulo: 'Tudo', contador: total },
    ...ETAPAS.map(t => ({ chave: t, rotulo: ROTULO[t], contador: porEtapa[t] })),
  ]

  return (
    <View style={e.abas}>
      {abas.map(aba => {
        const ativa = aba.chave === atual
        return (
          <Pressable
            key={aba.rotulo}
            onPress={() => aoTrocar(aba.chave)}
            accessibilityRole="tab"
            accessibilityState={{ selected: ativa }}
            style={[e.aba, ativa && e.abaAtiva]}
          >
            <Text style={[e.abaTexto, ativa && e.abaTextoAtivo]}>{aba.rotulo}</Text>
            <View style={[e.abaContador, ativa && e.abaContadorAtivo]}>
              <Text style={[e.abaContadorTexto, ativa && e.abaContadorTextoAtivo]}>
                {aba.contador}
              </Text>
            </View>
          </Pressable>
        )
      })}
    </View>
  )
}

function LinhaDoLog({ linha }: { linha: LinhaDaAtividade }) {
  const como = COMO[linha.como] ?? COMO.qr!

  return (
    <View style={e.linha}>
      <View style={[e.pontoDaEtapa, { backgroundColor: corDaEtapa[linha.etapa] }]} />

      <View style={e.linhaTexto}>
        <View style={e.linhaTopo}>
          <Text style={e.linhaNome} numberOfLines={1}>{linha.nome}</Text>
          <Selo texto={ROTULO[linha.etapa]} tipo={linha.etapa === 'entrada' ? 'sucesso' : 'info'} />
          <View style={e.comoSelo}>
            <Icone nome={como.icone} tamanho={11} tom={como.tom === 'aviso' ? cor.aviso700 : cor.neutro500} />
            <Text style={[e.comoTexto, como.tom === 'aviso' && e.comoTextoAviso]}>{como.rotulo}</Text>
          </View>
        </View>

        <View style={e.linhaMeta}>
          <Text style={e.meta}>{formatarBR(linha.em)}</Text>
          <Text style={e.meta}>{linha.setor}</Text>
          <Text style={e.meta}>{formatCpf(linha.cpf)}</Text>
          {linha.registradoPor ? <Text style={e.meta}>por {linha.registradoPor}</Text> : null}
        </View>

        {linha.local ? (
          <View style={e.local}>
            <Icone nome="MapPin" tamanho={11} tom={uso.tintaFraca} />
            <Text style={e.meta} numberOfLines={1}>{linha.local}</Text>
          </View>
        ) : null}

        {linha.justificativa ? (
          <Text style={e.justificativa}>Justificativa: {linha.justificativa}</Text>
        ) : null}
      </View>
    </View>
  )
}

function ListaDePessoas({
  titulo, descricao, vazio, pessoas, tom, comTelefone,
}: {
  titulo: string
  descricao: string
  vazio: string
  pessoas: PessoaDaLista[]
  tom: 'aviso' | 'sucesso'
  comTelefone?: boolean
}) {
  return (
    <>
      <View style={e.cabecalhoDaSecao}>
        <View style={e.cabecalhoTexto}>
          <TituloDeCartao>{titulo}</TituloDeCartao>
          <Legenda>{descricao}</Legenda>
        </View>
        <Selo texto={String(pessoas.length)} tipo={pessoas.length ? tom : 'sucesso'} />
      </View>
      <Respiro altura={espaco.s} />

      {pessoas.length === 0 ? (
        <Cartao><Corpo>{vazio}</Corpo></Cartao>
      ) : (
        <Cartao semPadding>
          {pessoas.map((p, i) => (
            <View key={p.id}>
              {i > 0 ? <View style={e.fio} /> : null}
              <View style={e.pessoa}>
                <Corpo forte>{p.nome}</Corpo>
                <Legenda>
                  {p.setor}
                  {comTelefone && p.telefone ? ` · ${p.telefone}` : ''}
                </Legenda>
              </View>
            </View>
          ))}
        </Cartao>
      )}
    </>
  )
}

const e = StyleSheet.create({
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

  abas: { flexDirection: 'row', flexWrap: 'wrap', gap: espaco.s },
  aba: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 38,
    paddingHorizontal: espaco.m,
    borderRadius: raio.pilula,
    borderWidth: 1,
    borderColor: uso.borda,
    backgroundColor: uso.superficie,
  },
  abaAtiva: { backgroundColor: cor.acento500, borderColor: cor.acento600 },
  abaTexto: { ...texto.corpoForte, color: uso.tintaMedia },
  abaTextoAtivo: { color: '#ffffff' },
  abaContador: {
    minWidth: 20,
    paddingHorizontal: 5,
    borderRadius: 999,
    backgroundColor: cor.neutro100,
    alignItems: 'center',
  },
  abaContadorAtivo: { backgroundColor: 'rgba(255,255,255,0.25)' },
  abaContadorTexto: { ...texto.xxs, fontFamily: tipo.semi, color: uso.tintaMedia },
  abaContadorTextoAtivo: { color: '#ffffff' },

  linha: { flexDirection: 'row', gap: espaco.m, paddingHorizontal: espaco.g, paddingVertical: espaco.m },
  pontoDaEtapa: { width: 8, height: 8, borderRadius: 999, marginTop: 6 },
  linhaTexto: { flex: 1, minWidth: 0, gap: 4 },
  linhaTopo: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  linhaNome: { ...texto.corpoForte, color: uso.tinta, flexShrink: 1 },
  comoSelo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderRadius: raio.selo,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: cor.neutro100,
  },
  comoTexto: { ...texto.xxs, color: cor.neutro500 },
  comoTextoAviso: { color: cor.aviso700 },

  linhaMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: espaco.m },
  meta: { ...texto.xs, fontFamily: tipo.regular, color: uso.tintaFraca },
  local: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  justificativa: { ...texto.xs, fontFamily: tipo.regular, color: uso.tintaMedia, fontStyle: 'italic' },

  cabecalhoDaSecao: { flexDirection: 'row', alignItems: 'center', gap: espaco.m },
  cabecalhoTexto: { flex: 1, minWidth: 0 },
  pessoa: { paddingHorizontal: espaco.g, paddingVertical: espaco.m },
})
