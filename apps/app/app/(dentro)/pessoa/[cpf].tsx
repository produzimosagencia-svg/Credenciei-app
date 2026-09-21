// A ficha de uma pessoa da base — entre organizações.
//
// Junta todo evento em que ela já trabalhou, em QUALQUER organização da
// plataforma. É a tela que responde "posso chamar essa pessoa?" antes de
// convidar alguém da base para um evento novo — por isso só o master vê, e
// por isso não mostra valor pago: o que outra organização pagou é preço de
// concorrente.
//
// ─── O CICLO QUE ESTA TELA FECHA ────────────────────────────────────────────
//
// Base de funcionários e Encontre colaborador só ACHAM gente. "Atribuir a um
// evento", aqui embaixo, é o "CHAMEI" — o passo que faltava entre encontrar
// alguém e ela aparecer na equipe de um setor de verdade.

import { useMemo, useState } from 'react'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Linking, StyleSheet, Text, View } from 'react-native'
import { formatCpf, formatTelefone, formatarBR } from '@credenciei/dominio'
import type { FichaDaPessoaNaBase } from '@credenciei/contrato'
import type { TrabalhoDaPessoa } from '@credenciei/contrato'
import { mensagemDoErro, usePedido } from '../../../src/dados/pedido'
import { useSessao } from '../../../src/sessao/contexto'
import {
  Aviso, Botao, Carregando, Cartao, Corpo, Escolha, Indicador, Legenda,
  Respiro, Selo, Separador, Tela, TituloDaTela, TituloDeCartao,
} from '../../../src/ui/componentes'
import { Icone } from '../../../src/ui/icone'
import { espaco, texto, tipo } from '../../../src/ui/tema'
import { useTema, type Tokens } from '../../../src/ui/tema-contexto'

const ICONE: Record<string, string> = {
  eventos: 'CalendarDays',
  organizacoes: 'Building2',
  taxa: 'ShieldCheck',
  ultimo: 'Clock',
}

const ROTULO_DA_ETAPA: Record<string, string> = { entrada: 'Entrada', meio: 'Meio', fim: 'Saída' }

export default function TelaDaFichaDaPessoa() {
  const { cpf } = useLocalSearchParams<{ cpf: string }>()
  const router = useRouter()
  const { cliente } = useSessao()
  const { cor } = useTema()
  const e = useEstilos()
  const [versao, setVersao] = useState(0)

  const { pedido, recarregar } = usePedido(() => cliente.fichaDaPessoaNaBase(cpf), [cliente, cpf, versao])
  const dados = pedido.estado === 'pronto' ? pedido.dados : null

  async function chamar(telefone: string) {
    const numero = `55${telefone.replace(/\D/g, '')}`
    try {
      await Linking.openURL(`https://wa.me/${numero}`)
    } catch {
      // Sem WhatsApp instalado, nada acontece — o número segue na tela.
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

      {dados ? (
        <>
          <TituloDaTela>{dados.nome}</TituloDaTela>
          <Legenda>
            {[dados.cargoMaisComum, dados.cidade].filter(Boolean).join(' · ') || 'Sem função registrada'}
          </Legenda>
          <Respiro altura={espaco.m} />

          {dados.telefone ? (
            <>
              <Botao
                titulo={`Chamar no WhatsApp · ${formatTelefone(dados.telefone)}`}
                onPress={() => chamar(dados.telefone!)}
                tipo="acento"
              />
              <Respiro altura={espaco.m} />
            </>
          ) : null}

          <View style={e.grade}>
            {dados.indicadores.map(i => (
              <View key={i.chave} style={e.gradeItem}>
                <Indicador
                  rotulo={i.rotulo}
                  valor={i.valor}
                  sub={i.sub}
                  tom={i.tom}
                  icone={ICONE[i.chave] ?? 'User'}
                />
              </View>
            ))}
          </View>

          <Respiro altura={espaco.m} />

          <AtribuirAEvento dados={dados} cpf={cpf} aoAtribuir={() => setVersao(v => v + 1)} />

          <Cartao>
            <TituloDeCartao>Dados de contato</TituloDeCartao>
            <Respiro altura={espaco.m} />
            <Dado rotulo="CPF" valor={formatCpf(dados.cpf)} />
            <Dado rotulo="Telefone" valor={dados.telefone ? formatTelefone(dados.telefone) : '—'} />
            <Dado rotulo="Cidade" valor={dados.cidade || 'não informada'} />
            <Dado rotulo="Chave PIX" valor={dados.chavePix || '—'} />

            <Separador />
            {dados.autorizouBaseRegional ? (
              <View style={e.linhaComIcone}>
                <Icone nome="ShieldCheck" tamanho={13} tom={cor.sucesso600} />
                <Corpo>
                  Autorizou aparecer na base regional
                  {dados.autorizouEm ? ` em ${formatarBR(dados.autorizouEm, 'curto')}` : ''}.
                </Corpo>
              </View>
            ) : (
              <View style={e.linhaComIcone}>
                <Icone nome="AlertTriangle" tamanho={13} tom={cor.aviso600} />
                <Corpo>
                  Não aparece na busca regional: cadastrou-se antes da autorização
                  existir no formulário.
                </Corpo>
              </View>
            )}
          </Cartao>

          <Cartao semPadding>
            <View style={e.tituloDoHistorico}>
              <TituloDeCartao>Histórico de trabalho</TituloDeCartao>
              <Selo texto={String(dados.trabalhos.length)} tipo="info" />
            </View>
            <Legenda>Do evento mais recente para o mais antigo</Legenda>
            <Separador />

            {dados.trabalhos.length === 0 ? (
              <View style={e.pessoa}>
                <Corpo>Nenhum evento no histórico.</Corpo>
              </View>
            ) : (
              dados.trabalhos.map((t, i) => (
                <View key={t.funcionarioId}>
                  {i > 0 ? <View style={e.fio} /> : null}
                  <LinhaDoTrabalho
                    trabalho={t}
                    aoAbrir={t.podeAbrirEvento ? () => router.push(`/evento/${t.eventoId}` as never) : undefined}
                  />
                </View>
              ))
            )}
          </Cartao>
        </>
      ) : null}
    </Tela>
  )
}

type DadosParaAtribuir = Pick<
  FichaDaPessoaNaBase, 'nome' | 'eventosParaAtribuir' | 'setoresParaAtribuir' | 'jaNosEventos'
>

function AtribuirAEvento({
  dados, cpf, aoAtribuir,
}: {
  dados: DadosParaAtribuir
  cpf: string
  aoAtribuir: () => void
}) {
  const { cliente } = useSessao()
  const { cor } = useTema()
  const e = useEstilos()
  const [eventoId, setEventoId] = useState('')
  const [setorId, setSetorId] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [feito, setFeito] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  const setoresDoEvento = useMemo(
    () => dados.setoresParaAtribuir.filter(s => s.eventoId === eventoId),
    [dados.setoresParaAtribuir, eventoId],
  )
  const jaEsta = eventoId !== '' && dados.jaNosEventos.includes(eventoId)

  async function atribuir() {
    setErro(null)
    setFeito(null)
    setOcupado(true)
    try {
      const r = await cliente.atribuirPessoaAoEvento(cpf, setorId)
      if (r.erro) { setErro(r.erro); return }
      setFeito(
        `${dados.nome} entrou em ${r.resultado?.evento}, no setor ${r.resultado?.setor}.`
        + (r.resultado?.ativo === false ? ' Entrou BLOQUEADA porque o setor bateu o teto — ative na tela do setor.' : '')
        + (r.resultado?.semTelefone ? ' Sem telefone cadastrado: ela não recebe o link da credencial.' : ''),
      )
      setEventoId('')
      setSetorId('')
      aoAtribuir()
    } catch (e) {
      setErro(mensagemDoErro(e))
    } finally {
      setOcupado(false)
    }
  }

  return (
    <Cartao>
      <View style={e.tituloComIcone}>
        <Icone nome="CalendarDays" tamanho={16} tom={cor.acento600} />
        <TituloDeCartao>Atribuir a um evento</TituloDeCartao>
      </View>
      <Legenda>
        Coloca esta pessoa na equipe de um setor. O cliente passa a vê-la na
        tela do setor e fala com ela direto.
      </Legenda>
      <Respiro altura={espaco.m} />

      {erro ? <Aviso tipo="erro">{erro}</Aviso> : null}
      {feito ? <Aviso tipo="sucesso">{feito}</Aviso> : null}

      <Text style={e.rotulo}>EVENTO</Text>
      <Respiro altura={espaco.s} />
      {dados.eventosParaAtribuir.length === 0 ? (
        <Corpo>Nenhum evento cadastrado ainda.</Corpo>
      ) : (
        <Escolha
          opcoes={dados.eventosParaAtribuir.map(ev => ev.nome)}
          valor={dados.eventosParaAtribuir.find(ev => ev.id === eventoId)?.nome ?? null}
          aoEscolher={nome => {
            const achado = dados.eventosParaAtribuir.find(ev => ev.nome === nome)
            setEventoId(achado?.id ?? '')
            setSetorId('')
            setErro(null)
            setFeito(null)
          }}
        />
      )}

      {jaEsta ? (
        <>
          <Respiro altura={espaco.s} />
          <Aviso tipo="aviso">
            {dados.nome} já está neste evento. Uma pessoa só entra uma vez por evento.
          </Aviso>
        </>
      ) : null}

      {eventoId && !jaEsta ? (
        <>
          <Respiro altura={espaco.m} />
          <Text style={e.rotulo}>SETOR</Text>
          <Respiro altura={espaco.s} />
          {setoresDoEvento.length === 0 ? (
            <Corpo>Este evento não tem setores.</Corpo>
          ) : (
            <Escolha
              opcoes={setoresDoEvento.map(s => s.nome)}
              valor={setoresDoEvento.find(s => s.id === setorId)?.nome ?? null}
              aoEscolher={nome => {
                const achado = setoresDoEvento.find(s => s.nome === nome)
                setSetorId(achado?.id ?? '')
              }}
            />
          )}
        </>
      ) : null}

      <Respiro altura={espaco.m} />
      <Botao
        titulo="Atribuir"
        onPress={atribuir}
        ocupado={ocupado}
        desabilitado={!setorId || jaEsta}
      />
    </Cartao>
  )
}

function LinhaDoTrabalho({ trabalho: t, aoAbrir }: { trabalho: TrabalhoDaPessoa; aoAbrir?: () => void }) {
  const e = useEstilos()
  return (
    <View style={e.pessoa}>
      <View style={e.linhaDoNome}>
        {aoAbrir ? (
          <Botao titulo={t.evento} onPress={aoAbrir} tipo="fantasma" />
        ) : (
          <Text style={e.eventoTexto} numberOfLines={1}>{t.evento}</Text>
        )}
      </View>
      <View style={e.selos}>
        <Selo texto={t.compareceu ? 'Compareceu' : 'Não bateu entrada'} tipo={t.compareceu ? 'sucesso' : 'aviso'} />
        {!t.ativo ? <Selo texto="Inativa" tipo="info" /> : null}
      </View>
      <Respiro altura={espaco.xs} />
      <Text style={e.metaTexto}>
        {formatarBR(t.data, 'data')} · {t.organizacao} · {t.setor}{t.cargo ? ` · ${t.cargo}` : ''}
      </Text>
      {t.etapas.length > 0 ? (
        <Text style={e.metaTexto}>{t.etapas.map(et => ROTULO_DA_ETAPA[et]).join(' · ')}</Text>
      ) : null}
    </View>
  )
}

function Dado({ rotulo, valor }: { rotulo: string; valor: string }) {
  const e = useEstilos()
  return (
    <View style={e.dado}>
      <Text style={e.dadoRotulo}>{rotulo}</Text>
      <Text style={e.dadoValor}>{valor}</Text>
    </View>
  )
}

function criarEstilos(uso: Tokens['uso']) {
  return StyleSheet.create({
    grade: { flexDirection: 'row', flexWrap: 'wrap', gap: espaco.m },
    gradeItem: { width: '48%', flexGrow: 1 },

    tituloComIcone: { flexDirection: 'row', alignItems: 'center', gap: espaco.s },
    tituloDoHistorico: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: espaco.g, paddingTop: espaco.g,
    },

    rotulo: { ...texto.etiqueta, color: uso.tintaFraca },

    linhaComIcone: { flexDirection: 'row', alignItems: 'flex-start', gap: espaco.s },

    dado: { paddingVertical: espaco.xs },
    dadoRotulo: { ...texto.xxs, fontFamily: tipo.regular, color: uso.tintaFraca },
    dadoValor: { ...texto.corpo, fontFamily: tipo.media, color: uso.tinta, marginTop: 2 },

    fio: { height: 1, backgroundColor: uso.borda },
    pessoa: { padding: espaco.g },
    linhaDoNome: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
    eventoTexto: { ...texto.corpoForte, fontFamily: tipo.media, color: uso.tinta, flexShrink: 1 },
    selos: { flexDirection: 'row', flexWrap: 'wrap', gap: espaco.s, marginTop: espaco.xs },
    metaTexto: { ...texto.xs, fontFamily: tipo.regular, color: uso.tintaFraca, marginTop: 2 },
  })
}

function useEstilos() {
  const { uso } = useTema()
  return useMemo(() => criarEstilos(uso), [uso])
}
