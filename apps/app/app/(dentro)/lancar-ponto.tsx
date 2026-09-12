// Lançar ponto manual — a batida de quem já foi embora.
//
// Trazido do site em 11/09/2026. Diferente do "Registrar ponto" (que exige a
// foto da pessoa e grava na hora atual): aqui a pessoa já foi embora, a foto
// é impossível, e a hora certa é no passado. A prova é a trilha — autor,
// motivo escrito por ele, e a marca de que não foi a própria pessoa.
//
// ─── O DIA E A HORA SÃO CAMPOS SEPARADOS, DE PROPÓSITO ──────────────────────
//
// Numa saída de madrugada a pessoa trabalhou no dia 05 e bateu às 02:00 do
// dia 06: o dia de trabalho é 05 (é o que conta no fechamento), e a hora
// real é 06 às 02:00. Por isso o seletor de dia e o campo de data da batida
// são dois controles diferentes — trocar o dia move a data da batida junto,
// mas ela continua livre pra apontar pro dia seguinte.

import { useEffect, useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { formatCpf, formatarBR } from '@credenciei/dominio'
import type { DadosParaLancarPonto, EventoEscaneavel, PessoaParaLancamento, TipoBatida } from '@credenciei/contrato'
import { mascararData, mascararHora } from '../../src/campos'
import { mensagemDoErro } from '../../src/dados/pedido'
import { useSessao } from '../../src/sessao/contexto'
import {
  Aviso, Botao, Campo, Carregando, Cartao, Corpo, Legenda, Respiro, Selo,
  Tela, TituloDaTela, TituloDeCartao,
} from '../../src/ui/componentes'
import { Icone } from '../../src/ui/icone'
import { espaco, raio, texto, tipo } from '../../src/ui/tema'
import { useTema, type Tokens } from '../../src/ui/tema-contexto'

const MINIMO_PARA_BUSCAR = 2

const ETAPAS: { tipo: TipoBatida; rotulo: string; icone: string }[] = [
  { tipo: 'entrada', rotulo: 'Entrada', icone: 'LogIn' },
  { tipo: 'meio', rotulo: 'Meio', icone: 'Camera' },
  { tipo: 'fim', rotulo: 'Saída', icone: 'LogOut' },
]

/** "2026-08-30" → "30/08". */
function rotuloDoDia(d: string): string {
  const [, m, dd] = d.split('-')
  return `${dd}/${m}`
}

/** "2026-08-30" → "30/08/2026". */
function paraExibicao(iso: string): string {
  const [aaaa, mm, dd] = iso.split('-')
  return `${dd}/${mm}/${aaaa}`
}

function paraISODeData(dataDigitada: string): string | null {
  const [dd, mm, aaaa] = dataDigitada.split('/')
  if (!dd || !mm || aaaa?.length !== 4) return null
  return `${aaaa}-${mm}-${dd}`
}

export default function LancarPonto() {
  const { cliente } = useSessao()
  const { cor, uso } = useTema()
  const e = useMemo(() => criarEstilos(cor, uso), [cor, uso])

  const [eventos, setEventos] = useState<EventoEscaneavel[] | null>(null)
  const [eventoId, setEventoId] = useState('')
  const [dados, setDados] = useState<DadosParaLancarPonto | null>(null)
  const [erroDeCarga, setErroDeCarga] = useState<string | null>(null)

  const [busca, setBusca] = useState('')
  const [pessoa, setPessoa] = useState<PessoaParaLancamento | null>(null)
  const [dia, setDia] = useState('')
  const [etapa, setEtapa] = useState<TipoBatida>('entrada')
  const [dataDaBatida, setDataDaBatida] = useState('')
  const [horaDaBatida, setHoraDaBatida] = useState('')
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [feito, setFeito] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    let vivo = true
    cliente.eventosParaLancarPonto()
      .then(lista => { if (vivo) setEventos(lista) })
      .catch(e => { if (vivo) setErroDeCarga(mensagemDoErro(e)) })
    return () => { vivo = false }
  }, [cliente])

  async function abrirEvento(id: string) {
    setEventoId(id)
    setErroDeCarga(null)
    try {
      const r = await cliente.dadosParaLancarPonto(id)
      setDados(r)
      setDia(r.diaPadrao)
      setDataDaBatida(paraExibicao(r.diaPadrao))
      setHoraDaBatida('08:00')
    } catch (e) {
      setErroDeCarga(mensagemDoErro(e))
    }
  }

  function trocarDia(novoDia: string) {
    setDia(novoDia)
    setDataDaBatida(paraExibicao(novoDia))
    setFeito(null)
  }

  function escolher(p: PessoaParaLancamento) {
    setPessoa(p)
    setErro(null)
    setFeito(null)
  }

  const jaTem = pessoa?.batidas[`${dia}:${etapa}`] ?? null

  async function salvar() {
    if (!pessoa) return
    const dataISO = paraISODeData(dataDaBatida)
    if (!dataISO || !/^\d{2}:\d{2}$/.test(horaDaBatida)) {
      setErro('Informe a data e a hora da batida.')
      return
    }
    setErro(null)
    setFeito(null)
    setSalvando(true)
    try {
      const quandoISO = `${dataISO}T${horaDaBatida}:00-03:00`
      const r = await cliente.lancarPontoManual(pessoa.id, etapa, dia, quandoISO, motivo)
      if (r.erro) return setErro(r.erro)
      setFeito(`${r.etapa} de ${r.nome} lançada em ${rotuloDoDia(dia)}, às ${horaDaBatida}.`)
      setMotivo('')
      if (dados) {
        setDados({
          ...dados,
          pessoas: dados.pessoas.map(p =>
            p.id === pessoa.id
              ? { ...p, batidas: { ...p.batidas, [`${dia}:${etapa}`]: quandoISO } }
              : p,
          ),
        })
      }
    } catch (e) {
      setErro(mensagemDoErro(e))
    } finally {
      setSalvando(false)
    }
  }

  if (!eventos) {
    return <Tela>{erroDeCarga ? <Aviso tipo="erro">{erroDeCarga}</Aviso> : <Carregando />}</Tela>
  }

  if (!eventoId) {
    return (
      <Tela>
        <TituloDaTela>Lançamento manual</TituloDaTela>
        <Legenda>Registrar uma batida que a pessoa não fez, com a hora certa</Legenda>
        <Respiro />
        {eventos.length === 0 ? (
          <Cartao>
            <Corpo>Crie um evento no Painel para poder lançar ponto nele.</Corpo>
          </Cartao>
        ) : (
          <Cartao semPadding>
            {eventos.map((ev, i) => (
              <View key={ev.eventoId}>
                {i > 0 ? <View style={e.fio} /> : null}
                <Pressable
                  onPress={() => abrirEvento(ev.eventoId)}
                  style={({ pressed }) => [e.opcao, pressed && e.opcaoTocada]}
                >
                  <Icone nome="ClipboardPen" tamanho={16} tom={uso.tintaFraca} />
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

  if (!dados) {
    return <Tela>{erroDeCarga ? <Aviso tipo="erro">{erroDeCarga}</Aviso> : <Carregando />}</Tela>
  }

  if (dados.dias.length === 0) {
    return (
      <Tela>
        <TituloDaTela>Lançamento manual</TituloDaTela>
        <Legenda>{dados.eventoNome}</Legenda>
        <Respiro />
        <Aviso tipo="aviso">
          Este evento ainda não tem dias de trabalho marcados. Marque-os em Editar evento
          antes de lançar ponto — sem dia, a batida não apareceria em nenhuma lista nem no
          relatório.
        </Aviso>
      </Tela>
    )
  }

  const termo = busca.trim().toLowerCase()
  const digitos = busca.replace(/\D/g, '')
  const encontrados = termo.length < MINIMO_PARA_BUSCAR ? [] : dados.pessoas.filter(p =>
    p.nome.toLowerCase().includes(termo)
    || (digitos.length >= 3 && p.cpf.includes(digitos))
    || p.setorNome.toLowerCase().includes(termo),
  ).slice(0, 30)

  // ── Passo 1: achar a pessoa ────────────────────────────────────────────
  if (!pessoa) {
    return (
      <Tela>
        <TituloDaTela>Lançamento manual</TituloDaTela>
        <Legenda>{dados.eventoNome}</Legenda>
        <Respiro altura={espaco.s} />
        <Botao titulo="Trocar de evento" onPress={() => { setEventoId(''); setDados(null) }} tipo="fantasma" />
        <Respiro />

        <Cartao>
          <TituloDeCartao>Quem perdeu a batida?</TituloDeCartao>
          <Legenda>{dados.pessoas.length.toLocaleString('pt-BR')} pessoas neste evento — busque por nome, CPF ou setor</Legenda>
          <Respiro altura={espaco.m} />
          <Campo
            value={busca}
            onChangeText={setBusca}
            placeholder="Nome, CPF ou setor…"
            autoCapitalize="none"
            autoCorrect={false}
          />
        </Cartao>

        {termo.length < MINIMO_PARA_BUSCAR ? null : encontrados.length === 0 ? (
          <Cartao><Corpo>Ninguém com &quot;{busca}&quot;.</Corpo></Cartao>
        ) : (
          <Cartao semPadding>
            {encontrados.map((p, i) => (
              <View key={p.id}>
                {i > 0 ? <View style={e.fio} /> : null}
                <Pressable
                  onPress={() => escolher(p)}
                  style={({ pressed }) => [e.pessoaLinha, pressed && e.opcaoTocada]}
                >
                  <View style={e.pessoaTexto}>
                    <View style={e.pessoaTopo}>
                      <Corpo forte>{p.nome}</Corpo>
                      {!p.ativo ? <Selo texto="Não ativado" tipo="aviso" /> : null}
                    </View>
                    <Legenda>
                      {p.setorNome}{p.cargo ? ` · ${p.cargo}` : ''} · {formatCpf(p.cpf)}
                    </Legenda>
                  </View>
                </Pressable>
              </View>
            ))}
          </Cartao>
        )}
      </Tela>
    )
  }

  // ── Passo 2: o lançamento ───────────────────────────────────────────────
  return (
    <Tela>
      <TituloDaTela>{pessoa.nome}</TituloDaTela>
      <Legenda>{pessoa.setorNome}{pessoa.cargo ? ` · ${pessoa.cargo}` : ''}</Legenda>
      <Respiro altura={espaco.s} />
      <Botao titulo="Outra pessoa" onPress={() => { setPessoa(null); setFeito(null); setErro(null) }} tipo="fantasma" />
      <Respiro />

      <Cartao>
        <TituloDeCartao>Dia de trabalho</TituloDeCartao>
        <Respiro altura={espaco.s} />
        <View style={e.dias}>
          {dados.dias.map(d => {
            const marcado = d.data === dia
            return (
              <Pressable
                key={d.data}
                onPress={() => trocarDia(d.data)}
                style={[e.diaBotao, marcado && e.diaBotaoMarcado]}
              >
                <Text style={[e.diaTipo, marcado && e.diaTextoMarcado]}>
                  {d.tipo === 'principal' ? 'evento' : 'prep.'}
                </Text>
                <Text style={[e.diaData, marcado && e.diaTextoMarcado]}>{rotuloDoDia(d.data)}</Text>
              </Pressable>
            )
          })}
        </View>
        <Respiro altura={espaco.s} />
        <Legenda>
          É o dia a que a batida pertence — o que conta no fechamento, mesmo que a hora
          caia na madrugada seguinte.
        </Legenda>
      </Cartao>

      <Cartao>
        <TituloDeCartao>Etapa</TituloDeCartao>
        <Respiro altura={espaco.s} />
        <View style={e.etapas}>
          {ETAPAS.map(et => {
            const marcada = etapa === et.tipo
            const existente = pessoa.batidas[`${dia}:${et.tipo}`]
            return (
              <Pressable
                key={et.tipo}
                onPress={() => { setEtapa(et.tipo); setFeito(null) }}
                style={[e.etapaBotao, marcada && e.etapaBotaoMarcada]}
              >
                <Icone nome={et.icone} tamanho={16} tom={marcada ? cor.acento600 : uso.tintaMedia} />
                <Text style={[e.etapaTexto, marcada && e.etapaTextoMarcado]}>{et.rotulo}</Text>
                {existente ? <Text style={e.etapaHora}>{formatarBR(existente, 'hora')}</Text> : null}
              </Pressable>
            )
          })}
        </View>
      </Cartao>

      {jaTem ? (
        <Aviso tipo="aviso">
          Já existe {ETAPAS.find(et => et.tipo === etapa)?.rotulo.toLowerCase()} em {rotuloDoDia(dia)},
          às {formatarBR(jaTem, 'hora')}. Salvar aqui substitui esse horário — o anterior
          não fica guardado.
        </Aviso>
      ) : null}

      <Cartao>
        <TituloDeCartao>Data e hora da batida</TituloDeCartao>
        <Respiro altura={espaco.m} />
        <View style={e.dataHora}>
          <View style={e.dataCampo}>
            <Campo
              rotulo="Data"
              value={dataDaBatida}
              onChangeText={t => { setDataDaBatida(mascararData(t)); setFeito(null) }}
              placeholder="dd/mm/aaaa"
              keyboardType="number-pad"
              maxLength={10}
            />
          </View>
          <View style={e.horaCampo}>
            <Campo
              rotulo="Hora"
              value={horaDaBatida}
              onChangeText={t => { setHoraDaBatida(mascararHora(t)); setFeito(null) }}
              placeholder="hh:mm"
              keyboardType="number-pad"
              maxLength={5}
            />
          </View>
        </View>
      </Cartao>

      <Cartao>
        <TituloDeCartao>Motivo do lançamento manual *</TituloDeCartao>
        <Respiro altura={espaco.s} />
        <Campo
          value={motivo}
          onChangeText={t => { setMotivo(t); setFeito(null) }}
          placeholder="Ex.: saiu depois do fechamento da portaria, sem ninguém para ler o QR"
          multiline
          numberOfLines={2}
        />
        <Legenda>
          Fica gravado junto com o seu nome e aparece no histórico da pessoa. É o que
          sustenta a batida numa conferência — aqui não há foto nem QR.
        </Legenda>
      </Cartao>

      {erro ? <Aviso tipo="erro">{erro}</Aviso> : null}
      {feito ? <Aviso tipo="sucesso">{feito}</Aviso> : null}

      <Botao
        titulo="Lançar ponto"
        onPress={salvar}
        ocupado={salvando}
        desabilitado={motivo.trim().length < 5}
      />
    </Tela>
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

  pessoaLinha: { paddingHorizontal: espaco.g, paddingVertical: espaco.m },
  pessoaTexto: { gap: 2 },
  pessoaTopo: { flexDirection: 'row', alignItems: 'center', gap: espaco.s, flexWrap: 'wrap' },

  dias: { flexDirection: 'row', flexWrap: 'wrap', gap: espaco.s },
  diaBotao: {
    width: 68,
    paddingVertical: espaco.s,
    borderRadius: raio.campo,
    borderWidth: 1,
    borderColor: uso.borda,
    alignItems: 'center',
  },
  diaBotaoMarcado: { backgroundColor: cor.acento500, borderColor: cor.acento600 },
  diaTipo: { ...texto.xxs, color: uso.tintaFraca, textTransform: 'uppercase' },
  diaData: { ...texto.xs, fontFamily: tipo.semi, color: uso.tinta, marginTop: 2 },
  diaTextoMarcado: { color: '#ffffff' },

  etapas: { flexDirection: 'row', gap: espaco.s },
  etapaBotao: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: espaco.m,
    borderRadius: raio.campo,
    borderWidth: 1,
    borderColor: uso.borda,
  },
  etapaBotaoMarcada: { borderColor: cor.acento200, backgroundColor: cor.acento50 },
  etapaTexto: { ...texto.xs, fontFamily: tipo.semi, color: uso.tintaMedia },
  etapaTextoMarcado: { color: cor.acento700 },
  etapaHora: { ...texto.xxs, color: uso.tintaFraca },

  dataHora: { flexDirection: 'row', gap: espaco.m },
  dataCampo: { flex: 2 },
  horaCampo: { flex: 1 },
  })
}
