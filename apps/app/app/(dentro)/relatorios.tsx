// Relatórios — presença/ponto da equipe em planilha. Não é financeiro,
// apesar do nome parecer.
//
// Trazido do site em 11/09/2026. Oito perguntas só: quem entrou, quem saiu,
// quando, em qual setor, em qual função, quantos entraram, quantos saíram,
// qual período. O resto foi cortado a pedido do Juan — um gestor
// administrativo precisa responder rápido, não vasculhar abas extras.
//
// ─── A PLANILHA É GERADA DO OUTRO LADO ──────────────────────────────────────
//
// Mesmo padrão de `BotaoDePlanilha` (a exportação da equipe de um setor): o
// app não monta .xlsx nem .zip no celular — pede `{ nome, url }` e
// compartilha. É assim que a planilha chega no WhatsApp do cliente sem
// passar por um computador.

import { useEffect, useMemo, useState } from 'react'
import { Pressable, Share, StyleSheet, Text, View } from 'react-native'
import { formatarBR } from '@credenciei/dominio'
import type { EventoEscaneavel, Periodo, QuemNoRelatorio, ResumoDeRelatorios } from '@credenciei/contrato'
import { mascararData } from '../../src/campos'
import { usePedido, mensagemDoErro } from '../../src/dados/pedido'
import { useSessao } from '../../src/sessao/contexto'
import {
  Aviso, Botao, Campo, Carregando, Cartao, Corpo, Escolha, Legenda, Respiro,
  Separador, Tela, TituloDaTela, TituloDeCartao,
} from '../../src/ui/componentes'
import { Icone } from '../../src/ui/icone'
import { espaco, texto, tipo } from '../../src/ui/tema'
import { useTema, type Tokens } from '../../src/ui/tema-contexto'

const CREDENCIADOS = 'Quem credenciou'
const AUSENTES = 'Quem NÃO credenciou'

/** "2026-08-30" → "30/08/2026". */
function paraExibicao(iso: string): string {
  const [aaaa, mm, dd] = iso.split('-')
  return `${dd}/${mm}/${aaaa}`
}

/** "30/08/2026" completo → "2026-08-30"; incompleto → null. */
function paraISO(dataDigitada: string): string | null {
  const [dd, mm, aaaa] = dataDigitada.split('/')
  if (!dd || !mm || aaaa?.length !== 4) return null
  return `${aaaa}-${mm}-${dd}`
}

export default function Relatorios() {
  const { cliente } = useSessao()
  const { cor, uso } = useTema()
  const e = useEstilos()

  const [eventos, setEventos] = useState<EventoEscaneavel[] | null>(null)
  const [eventoId, setEventoId] = useState('')
  const [erroDeCarga, setErroDeCarga] = useState<string | null>(null)

  const [de, setDe] = useState('')
  const [ate, setAte] = useState('')
  const [quem, setQuem] = useState<QuemNoRelatorio>('credenciados')
  const [setorId, setSetorId] = useState('')

  const [erro, setErro] = useState<{ completo?: string; setor?: string; zip?: string }>({})
  const [gerando, setGerando] = useState<'completo' | 'setor' | 'zip' | null>(null)

  useEffect(() => {
    let vivo = true
    cliente.eventosParaRelatorios()
      .then(lista => { if (vivo) setEventos(lista) })
      .catch(e => { if (vivo) setErroDeCarga(mensagemDoErro(e)) })
    return () => { vivo = false }
  }, [cliente])

  const { pedido, recarregar } = usePedido<ResumoDeRelatorios | null>(
    async () => (eventoId ? cliente.resumoDeRelatorios(eventoId) : null),
    [cliente, eventoId],
  )
  const resumo = pedido.estado === 'pronto' ? pedido.dados : null

  // O período nasce preenchido com o período INTEIRO do evento — abrir a
  // tela e exportar sem tocar em nada continua funcionando.
  useEffect(() => {
    if (resumo) {
      setDe(paraExibicao(resumo.periodoCompleto.de))
      setAte(paraExibicao(resumo.periodoCompleto.ate))
    }
  }, [resumo])

  useEffect(() => {
    if (resumo && !setorId) setSetorId(resumo.setores[0]?.setorId ?? '')
  }, [resumo, setorId])

  const periodo: Periodo | null = (() => {
    const deISO = paraISO(de)
    const ateISO = paraISO(ate)
    if (!deISO || !ateISO) return null
    return { de: deISO, ate: ateISO }
  })()
  const periodoValido = !!periodo && periodo.de <= periodo.ate

  async function compartilhar(arquivo: { nome: string; url: string }) {
    await Share.share({ message: `${arquivo.nome}\n${arquivo.url}`, url: arquivo.url })
  }

  async function exportarCompleto() {
    if (!periodo) return
    setErro(e => ({ ...e, completo: undefined }))
    setGerando('completo')
    try {
      const arquivo = await cliente.relatorioDoEvento(eventoId, periodo, quem)
      await compartilhar(arquivo)
    } catch (e) {
      setErro(erros => ({ ...erros, completo: mensagemDoErro(e) }))
    } finally {
      setGerando(null)
    }
  }

  async function exportarSetor() {
    if (!periodo || !setorId) return
    setErro(e => ({ ...e, setor: undefined }))
    setGerando('setor')
    try {
      const arquivo = await cliente.relatorioDoSetor(eventoId, setorId, periodo, quem)
      await compartilhar(arquivo)
    } catch (e) {
      setErro(erros => ({ ...erros, setor: mensagemDoErro(e) }))
    } finally {
      setGerando(null)
    }
  }

  async function exportarZip() {
    if (!periodo) return
    setErro(e => ({ ...e, zip: undefined }))
    setGerando('zip')
    try {
      const arquivo = await cliente.relatoriosPorSetorZip(eventoId, periodo, quem)
      await compartilhar(arquivo)
    } catch (e) {
      setErro(erros => ({ ...erros, zip: mensagemDoErro(e) }))
    } finally {
      setGerando(null)
    }
  }

  if (!eventos) {
    return <Tela>{erroDeCarga ? <Aviso tipo="erro">{erroDeCarga}</Aviso> : <Carregando />}</Tela>
  }

  if (!eventoId) {
    return (
      <Tela>
        <TituloDaTela>Relatórios</TituloDaTela>
        <Legenda>Escolha o evento do qual quer exportar a planilha</Legenda>
        <Respiro />
        {eventos.length === 0 ? (
          <Cartao>
            <Corpo>Crie um evento no Painel para poder exportar o relatório dele.</Corpo>
          </Cartao>
        ) : (
          <Cartao semPadding>
            {eventos.map((ev, i) => (
              <View key={ev.eventoId}>
                {i > 0 ? <View style={e.fio} /> : null}
                <Pressable
                  onPress={() => setEventoId(ev.eventoId)}
                  style={({ pressed }) => [e.opcao, pressed && e.opcaoTocada]}
                >
                  <Icone nome="FileSpreadsheet" tamanho={16} tom={uso.tintaFraca} />
                  <Text style={e.opcaoTexto} numberOfLines={1}>{ev.nome}</Text>
                  <Icone nome="ChevronRight" tamanho={16} tom={cor.neutro400} />
                </Pressable>
              </View>
            ))}
          </Cartao>
        )}
      </Tela>
    )
  }

  return (
    <Tela>
      <TituloDaTela>Relatórios do evento</TituloDaTela>
      <Legenda>{resumo?.eventoNome ?? '…'} — entrada e saída da equipe, por setor e função</Legenda>
      <Respiro altura={espaco.s} />
      <Botao titulo="Trocar de evento" onPress={() => { setEventoId(''); setSetorId('') }} tipo="fantasma" />
      <Respiro />

      {pedido.estado === 'carregando' ? <Carregando /> : null}
      {pedido.estado === 'falhou' ? (
        <>
          <Aviso tipo="erro">{pedido.mensagem}</Aviso>
          <Botao titulo="Tentar de novo" onPress={recarregar} tipo="secundario" />
        </>
      ) : null}

      {resumo ? (
        <>
          <Cartao>
            <TituloDeCartao>Período e quem entra</TituloDeCartao>
            <Respiro altura={espaco.m} />

            <View style={e.periodo}>
              <View style={e.periodoCampo}>
                <Campo rotulo="De" value={de} onChangeText={t => setDe(mascararData(t))} placeholder="dd/mm/aaaa" keyboardType="number-pad" maxLength={10} />
              </View>
              <View style={e.periodoCampo}>
                <Campo rotulo="Até" value={ate} onChangeText={t => setAte(mascararData(t))} placeholder="dd/mm/aaaa" keyboardType="number-pad" maxLength={10} />
              </View>
            </View>
            {!periodoValido ? (
              <Legenda>A data inicial precisa vir antes (ou no mesmo dia) da data final.</Legenda>
            ) : null}

            <Respiro altura={espaco.s} />
            <Text style={e.rotulo}>QUEM ENTRA NA PLANILHA</Text>
            <Respiro altura={espaco.s} />
            <Escolha
              opcoes={[CREDENCIADOS, AUSENTES]}
              valor={quem === 'credenciados' ? CREDENCIADOS : AUSENTES}
              aoEscolher={v => setQuem(v === CREDENCIADOS ? 'credenciados' : 'ausentes')}
            />
            <Respiro altura={espaco.s} />
            <Legenda>
              {quem === 'ausentes'
                ? 'A planilha lista quem está na equipe e não bateu nenhuma batida no período — sem data, entrada ou saída, porque não existem.'
                : 'A planilha lista quem bateu ponto no período, dia a dia, com entrada e saída.'}
            </Legenda>
          </Cartao>

          {resumo.setores.length > 1 ? (
            <Cartao>
              <TituloDeCartao>Relatório completo</TituloDeCartao>
              <Legenda>Todos os setores, numa planilha só — uma aba por setor</Legenda>
              <Respiro altura={espaco.m} />

              <View style={e.stats}>
                <Metadado icone="Building2" texto={`${resumo.setores.length} setores`} />
                <Metadado icone="Users" texto={`${resumo.totalFuncionarios.toLocaleString('pt-BR')} funcionários`} />
              </View>
              <Respiro altura={espaco.m} />

              {erro.completo ? <Aviso tipo="erro">{erro.completo}</Aviso> : null}
              <Botao
                titulo={quem === 'ausentes' ? 'Exportar quem NÃO credenciou' : 'Exportar relatório completo'}
                onPress={exportarCompleto}
                ocupado={gerando === 'completo'}
                desabilitado={!periodoValido}
              />
            </Cartao>
          ) : null}

          {resumo.setores.length > 0 ? (
            <Cartao>
              <TituloDeCartao>Relatório por setor</TituloDeCartao>
              <Legenda>Uma planilha só com a equipe do setor escolhido</Legenda>
              <Respiro altura={espaco.m} />

              <Text style={e.rotulo}>SETOR</Text>
              <Respiro altura={espaco.s} />
              <Escolha
                opcoes={resumo.setores.map(s => s.nome)}
                valor={resumo.setores.find(s => s.setorId === setorId)?.nome ?? null}
                aoEscolher={nome => {
                  const achado = resumo.setores.find(s => s.nome === nome)
                  if (achado) setSetorId(achado.setorId)
                }}
              />
              <Respiro altura={espaco.m} />

              {erro.setor ? <Aviso tipo="erro">{erro.setor}</Aviso> : null}
              <Botao
                titulo={quem === 'ausentes' ? 'Exportar quem NÃO credenciou' : 'Exportar setor'}
                onPress={exportarSetor}
                tipo="secundario"
                ocupado={gerando === 'setor'}
                desabilitado={!periodoValido || !setorId}
              />

              {resumo.setores.length > 1 ? (
                <>
                  <Separador />
                  <Legenda>
                    Ou baixe todos os {resumo.setores.length} setores de uma vez, um arquivo
                    por setor, num .zip — pronto pra mandar cada planilha pro seu fornecedor.
                  </Legenda>
                  <Respiro altura={espaco.s} />
                  {erro.zip ? <Aviso tipo="erro">{erro.zip}</Aviso> : null}
                  <Botao
                    titulo="Exportar todos os setores em arquivos separados"
                    onPress={exportarZip}
                    tipo="secundario"
                    ocupado={gerando === 'zip'}
                    desabilitado={!periodoValido}
                  />
                </>
              ) : null}
            </Cartao>
          ) : (
            <Cartao>
              <Corpo>Ainda não há setores com equipe cadastrada neste evento para gerar relatório.</Corpo>
            </Cartao>
          )}
        </>
      ) : null}
    </Tela>
  )
}

function Metadado({ icone, texto: valor }: { icone: string; texto: string }) {
  const { uso } = useTema()
  const e = useEstilos()
  return (
    <View style={e.metaItem}>
      <Icone nome={icone} tamanho={14} tom={uso.tintaFraca} />
      <Text style={e.metaTexto}>{valor}</Text>
    </View>
  )
}

function criarEstilos(cor: Tokens['cor'], uso: Tokens['uso']) {
  return StyleSheet.create({
    fio: { height: 1, backgroundColor: uso.borda },
    opcao: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: espaco.m,
      paddingHorizontal: espaco.g,
      minHeight: 52,
    },
    opcaoTocada: { backgroundColor: cor.neutro50 },
    opcaoTexto: { ...texto.corpo, color: uso.tinta, flex: 1 },

    periodo: { flexDirection: 'row', gap: espaco.m },
    periodoCampo: { flex: 1 },

    rotulo: { ...texto.etiqueta, color: uso.tintaFraca },

    stats: { flexDirection: 'row', gap: espaco.m },
    metaItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    metaTexto: { ...texto.corpo, fontFamily: tipo.regular, color: uso.tintaMedia },
  })
}

function useEstilos() {
  const { cor, uso } = useTema()
  return useMemo(() => criarEstilos(cor, uso), [cor, uso])
}
