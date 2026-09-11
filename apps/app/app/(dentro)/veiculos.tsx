// Veículos do evento — quem entra de caminhão ou van, e com qual placa.
//
// Trazido do site em 11/09/2026. SÓ CADASTRO E CONSULTA, por decisão de lá: o
// veículo não bate ponto, não tem QR e não passa pelo scanner — a portaria
// consulta a placa aqui e confere.
//
// ─── O CONDUTOR VEM PRIMEIRO ─────────────────────────────────────────────────
//
// É a regra virada em tela: todo veículo é vinculado ao CPF de alguém já
// credenciado no evento. Deixar os campos da placa disponíveis antes de achar
// o condutor convidaria a preencher tudo pra descobrir no fim que a pessoa
// não está na equipe — é o erro que mais custa tempo em cadastro, e ele fica
// impossível aqui: o formulário do veículo só abre depois que o condutor é
// encontrado.

import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { formatCpf, formatarBR } from '@credenciei/dominio'
import type {
  CondutorEncontrado, EventoEscaneavel, Veiculo, VeiculosDoEvento,
} from '@credenciei/contrato'
import { usePedido, mensagemDoErro } from '../../src/dados/pedido'
import { useSessao } from '../../src/sessao/contexto'
import {
  Aviso, Botao, Campo, Carregando, Cartao, Corpo, Escolha, Legenda, Respiro,
  Selo, Separador, Tela, TituloDaTela, TituloDeCartao,
} from '../../src/ui/componentes'
import { Icone } from '../../src/ui/icone'
import { cor, espaco, raio, texto, tipo, uso } from '../../src/ui/tema'

const TIPOS = ['Caminhão', 'Van', 'Carro', 'Moto', 'Outro']

export default function VeiculosDoEventoTela() {
  const { cliente } = useSessao()

  const [eventos, setEventos] = useState<EventoEscaneavel[] | null>(null)
  const [eventoId, setEventoId] = useState('')
  const [busca, setBusca] = useState('')
  const [cadastrando, setCadastrando] = useState(false)
  const [erroDeCarga, setErroDeCarga] = useState<string | null>(null)
  const [versao, setVersao] = useState(0)

  useEffect(() => {
    let vivo = true
    cliente.eventosParaVeiculos()
      .then(lista => { if (vivo) setEventos(lista) })
      .catch(e => { if (vivo) setErroDeCarga(mensagemDoErro(e)) })
    return () => { vivo = false }
  }, [cliente])

  const { pedido, recarregar } = usePedido<VeiculosDoEvento | null>(
    async () => (eventoId ? cliente.veiculosDoEvento(eventoId) : null),
    [cliente, eventoId, versao],
  )

  const dados = pedido.estado === 'pronto' ? pedido.dados : null
  const termo = busca.trim().toLowerCase()
  const filtrados = dados
    ? dados.veiculos.filter(v => {
      if (!termo) return true
      const campos = [v.placa, v.modelo, v.tipo, v.cor, v.empresa, v.condutorNome, v.condutorCpf]
        .filter(Boolean).join(' ').toLowerCase()
      return campos.includes(termo)
    })
    : []

  function recarregarLista() {
    setVersao(v => v + 1)
    setCadastrando(false)
  }

  if (!eventos) {
    return <Tela>{erroDeCarga ? <Aviso tipo="erro">{erroDeCarga}</Aviso> : <Carregando />}</Tela>
  }

  if (!eventoId) {
    return (
      <Tela>
        <TituloDaTela>Veículos</TituloDaTela>
        <Legenda>Para qual evento? O condutor precisa estar credenciado nele.</Legenda>
        <Respiro />
        {eventos.length === 0 ? (
          <Cartao>
            <Corpo>Crie um evento no Painel para cadastrar veículos.</Corpo>
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
                  <Icone nome="Truck" tamanho={16} tom={uso.tintaFraca} />
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
      <View style={e.cabecalho}>
        <View style={e.cabecalhoTexto}>
          <TituloDaTela>Veículos</TituloDaTela>
          <Legenda>{eventos.find(ev => ev.eventoId === eventoId)?.nome}</Legenda>
        </View>
      </View>
      <Respiro altura={espaco.s} />
      <Botao titulo="Trocar de evento" onPress={() => { setEventoId(''); setCadastrando(false) }} tipo="fantasma" />
      <Respiro />

      <Campo
        value={busca}
        onChangeText={setBusca}
        placeholder="Consultar placa, modelo, condutor ou empresa"
        autoCapitalize="none"
        autoCorrect={false}
      />

      {pedido.estado === 'carregando' ? <Carregando /> : null}
      {pedido.estado === 'falhou' ? (
        <>
          <Aviso tipo="erro">{pedido.mensagem}</Aviso>
          <Botao titulo="Tentar de novo" onPress={recarregar} tipo="secundario" />
        </>
      ) : null}

      {dados ? (
        <>
          {cadastrando ? (
            <FormularioDeVeiculo
              eventoId={eventoId}
              dias={dados.dias}
              aoCadastrar={recarregarLista}
              aoCancelar={() => setCadastrando(false)}
            />
          ) : (
            <Botao titulo="Cadastrar veículo" onPress={() => setCadastrando(true)} />
          )}

          <Respiro />
          <Legenda>
            {busca
              ? `${filtrados.length} de ${dados.veiculos.length} veículo${dados.veiculos.length === 1 ? '' : 's'}`
              : `${dados.veiculos.length} veículo${dados.veiculos.length === 1 ? '' : 's'} cadastrado${dados.veiculos.length === 1 ? '' : 's'}`}
          </Legenda>
          <Respiro altura={espaco.s} />

          {dados.veiculos.length === 0 ? (
            <Cartao>
              <Corpo>Nenhum veículo ainda. Cadastre acima, começando pelo CPF de quem vai dirigir.</Corpo>
            </Cartao>
          ) : filtrados.length === 0 ? (
            <Cartao><Corpo>Nada encontrado para &quot;{busca}&quot;.</Corpo></Cartao>
          ) : (
            <Cartao semPadding>
              {filtrados.map((v, i) => (
                <View key={v.id}>
                  {i > 0 ? <View style={e.fio} /> : null}
                  <LinhaDoVeiculo
                    veiculo={v}
                    onExcluir={async () => {
                      await cliente.excluirVeiculo(v.id, eventoId)
                      recarregarLista()
                    }}
                  />
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

function LinhaDoVeiculo({ veiculo: v, onExcluir }: { veiculo: Veiculo; onExcluir: () => void }) {
  const [confirmando, setConfirmando] = useState(false)
  const [excluindo, setExcluindo] = useState(false)

  return (
    <View style={e.linha}>
      <View style={e.linhaTopo}>
        <Text style={e.placa}>{v.placa}</Text>
        {v.temFoto ? <Icone nome="Camera" tamanho={13} tom={uso.tintaFraca} /> : null}
      </View>

      <Corpo forte>{v.modelo}</Corpo>
      <Legenda>{[v.tipo, v.cor].filter(Boolean).join(' · ') || '—'}</Legenda>
      {v.observacoes ? <Text style={e.observacoes}>{v.observacoes}</Text> : null}

      <View style={e.linhaMeta}>
        <View style={e.metaItem}>
          <Icone nome="User" tamanho={11} tom={uso.tintaFraca} />
          <Text style={e.metaTexto} numberOfLines={1}>
            {v.condutorNome ?? '—'}{v.condutorCpf ? ` · ${formatCpf(v.condutorCpf)}` : ''}
          </Text>
        </View>
        {v.empresa ? (
          <View style={e.metaItem}>
            <Icone nome="Building2" tamanho={11} tom={uso.tintaFraca} />
            <Text style={e.metaTexto}>{v.empresa}</Text>
          </View>
        ) : null}
        <View style={e.metaItem}>
          <Icone nome="CalendarDays" tamanho={11} tom={uso.tintaFraca} />
          <Text style={e.metaTexto}>
            {v.dias.length ? v.dias.map(d => formatarBR(`${d}T12:00:00-03:00`, 'data').slice(0, 5)).join(', ') : 'Todos os dias'}
          </Text>
        </View>
      </View>

      {confirmando ? (
        <View style={e.confirmacao}>
          <Legenda>Excluir este veículo?</Legenda>
          <View style={e.confirmacaoAcoes}>
            <Botao
              titulo="Excluir"
              tipo="perigo"
              ocupado={excluindo}
              onPress={async () => { setExcluindo(true); await onExcluir() }}
            />
            <Botao titulo="Cancelar" tipo="fantasma" onPress={() => setConfirmando(false)} />
          </View>
        </View>
      ) : (
        <>
          <Respiro altura={espaco.s} />
          <Botao titulo="Excluir" tipo="fantasma" onPress={() => setConfirmando(true)} />
        </>
      )}
    </View>
  )
}

/**
 * O formulário de dois passos — o condutor primeiro, o resto só depois.
 * Ver o comentário no topo do arquivo.
 */
function FormularioDeVeiculo({
  eventoId, dias, aoCadastrar, aoCancelar,
}: {
  eventoId: string
  dias: { data: string; tipo: string }[]
  aoCadastrar: () => void
  aoCancelar: () => void
}) {
  const { cliente } = useSessao()

  const [cpf, setCpf] = useState('')
  const [condutor, setCondutor] = useState<CondutorEncontrado | null>(null)
  const [buscandoCondutor, setBuscandoCondutor] = useState(false)
  const [erroCondutor, setErroCondutor] = useState<string | null>(null)

  const [placa, setPlaca] = useState('')
  const [modelo, setModelo] = useState('')
  const [tipo, setTipo] = useState<string | null>(null)
  const [corVeiculo, setCorVeiculo] = useState('')
  const [empresa, setEmpresa] = useState('')
  const [observacoes, setObservacoes] = useState('')
  const [diasMarcados, setDiasMarcados] = useState<string[]>([])
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  function alternarDia(d: string) {
    setDiasMarcados(m => m.includes(d) ? m.filter(x => x !== d) : [...m, d])
  }

  async function buscarCondutor() {
    setErroCondutor(null)
    setCondutor(null)
    setBuscandoCondutor(true)
    try {
      const r = await cliente.buscarCondutorPorCpf(eventoId, cpf)
      if (r.erro) return setErroCondutor(r.erro)
      setCondutor(r.condutor ?? null)
    } catch (e) {
      setErroCondutor(mensagemDoErro(e))
    } finally {
      setBuscandoCondutor(false)
    }
  }

  async function salvar() {
    if (!condutor) return
    setErro(null)
    setSalvando(true)
    try {
      const r = await cliente.cadastrarVeiculo(eventoId, {
        cpf: condutor.cpf,
        placa,
        modelo,
        tipo,
        cor: corVeiculo || null,
        empresa: empresa || condutor.empresa || null,
        observacoes: observacoes || null,
        dias: diasMarcados,
      })
      if (r.erro) return setErro(r.erro)
      aoCadastrar()
    } catch (e) {
      setErro(mensagemDoErro(e))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Cartao>
      <TituloDeCartao>1. Quem vai dirigir</TituloDeCartao>
      <Legenda>O condutor precisa estar credenciado neste evento — é ele que responde pelo veículo.</Legenda>
      <Respiro altura={espaco.m} />

      <View style={e.linhaBusca}>
        <View style={e.campoBusca}>
          <Campo
            value={cpf}
            onChangeText={t => { setCpf(formatCpf(t)); setErroCondutor(null) }}
            placeholder="CPF do condutor"
            keyboardType="number-pad"
            maxLength={14}
          />
        </View>
        <Botao titulo="Buscar" onPress={buscarCondutor} ocupado={buscandoCondutor} desabilitado={cpf.replace(/\D/g, '').length !== 11} />
      </View>

      {erroCondutor ? <Aviso tipo="erro">{erroCondutor}</Aviso> : null}

      {condutor ? (
        <View style={e.condutor}>
          <Corpo forte>{condutor.nome}</Corpo>
          <Legenda>
            {formatCpf(condutor.cpf)} · {condutor.setorNome}{condutor.funcao ? ` · ${condutor.funcao}` : ''}
          </Legenda>
        </View>
      ) : null}

      {condutor ? (
        <>
          <Separador />
          <TituloDeCartao>2. O veículo</TituloDeCartao>
          <Legenda>Placa e modelo são obrigatórios.</Legenda>
          <Respiro altura={espaco.m} />

          <Campo
            rotulo="Placa"
            value={placa}
            onChangeText={t => setPlaca(t.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7))}
            placeholder="ABC1D23"
            autoCapitalize="characters"
            maxLength={7}
          />
          <Campo
            rotulo="Modelo"
            value={modelo}
            onChangeText={setModelo}
            placeholder="Ex.: Mercedes Sprinter"
          />

          <Text style={e.rotulo}>TIPO</Text>
          <Respiro altura={espaco.s} />
          <Escolha opcoes={TIPOS} valor={tipo} aoEscolher={setTipo} />
          <Respiro altura={espaco.m} />

          <Campo rotulo="Cor (opcional)" value={corVeiculo} onChangeText={setCorVeiculo} placeholder="Ex.: Branco" />
          <Campo rotulo="Empresa (opcional)" value={empresa} onChangeText={setEmpresa} placeholder="De quem é o veículo" />

          {dias.length > 0 ? (
            <>
              <Text style={e.rotulo}>DIAS AUTORIZADOS (nenhum marcado = todos)</Text>
              <Respiro altura={espaco.s} />
              <View style={e.dias}>
                {dias.map(d => {
                  const marcado = diasMarcados.includes(d.data)
                  return (
                    <Pressable
                      key={d.data}
                      onPress={() => alternarDia(d.data)}
                      style={[e.dia, marcado && e.diaMarcado]}
                    >
                      <Text style={[e.diaTexto, marcado && e.diaTextoMarcado]}>
                        {formatarBR(`${d.data}T12:00:00-03:00`, 'data').slice(0, 5)}
                      </Text>
                    </Pressable>
                  )
                })}
              </View>
              <Respiro altura={espaco.m} />
            </>
          ) : null}

          <Campo
            rotulo="Observações (opcional)"
            value={observacoes}
            onChangeText={setObservacoes}
            placeholder="Ex.: carga frágil, entra só após as 22h"
          />

          {erro ? <Aviso tipo="erro">{erro}</Aviso> : null}

          <Botao
            titulo="Cadastrar veículo"
            onPress={salvar}
            ocupado={salvando}
            desabilitado={placa.length < 7 || modelo.trim().length < 2}
          />
        </>
      ) : null}

      <Respiro altura={espaco.s} />
      <Botao titulo="Cancelar" onPress={aoCancelar} tipo="fantasma" />
    </Cartao>
  )
}

const e = StyleSheet.create({
  cabecalho: { flexDirection: 'row', alignItems: 'center', gap: espaco.s },
  cabecalhoTexto: { flex: 1, minWidth: 0 },

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

  linha: { padding: espaco.g },
  linhaTopo: { flexDirection: 'row', alignItems: 'center', gap: espaco.s, marginBottom: 2 },
  placa: { ...texto.corpoForte, fontFamily: tipo.semi, color: uso.tinta, letterSpacing: 0.5 },
  observacoes: { ...texto.xs, fontFamily: tipo.regular, color: cor.aviso700, marginTop: 4 },
  linhaMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: espaco.m, marginTop: espaco.s },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: '100%' },
  metaTexto: { ...texto.xs, fontFamily: tipo.regular, color: uso.tintaFraca, flexShrink: 1 },

  confirmacao: { marginTop: espaco.m, gap: espaco.s },
  confirmacaoAcoes: { flexDirection: 'row', gap: espaco.s },

  linhaBusca: { flexDirection: 'row', gap: espaco.s, alignItems: 'flex-start' },
  campoBusca: { flex: 1 },
  condutor: {
    backgroundColor: cor.neutro50,
    borderRadius: raio.campo,
    padding: espaco.m,
    marginTop: espaco.s,
  },

  rotulo: { ...texto.etiqueta, color: uso.tintaFraca },
  dias: { flexDirection: 'row', flexWrap: 'wrap', gap: espaco.s },
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
  diaMarcado: { backgroundColor: cor.acento500, borderColor: cor.acento600 },
  diaTexto: { ...texto.xs, fontFamily: tipo.semi, color: uso.tintaMedia },
  diaTextoMarcado: { color: '#ffffff' },
})
