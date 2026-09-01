// Criar um evento novo.
//
// ─── QUEM ESCOLHE O DONO, E QUEM NÃO ────────────────────────────────────────
//
// O master não pertence a organização nenhuma — precisa DIZER de quem é o
// evento, senão ele nasceria órfão: invisível para todo admin, sem
// supervisor conseguindo se vincular. Por isso só ele vê o seletor de
// organização.
//
// O admin não escolhe. O evento dele é sempre da própria organização, e é o
// SERVIDOR quem garante isso — nunca a tela. É a mesma regra que faz o
// admin não enxergar, depois, o evento de outra organização no Painel: a
// pessoa que cria só pode criar onde já enxerga.
//
// ─── O QUE FICA PARA "EDITAR EVENTO" ────────────────────────────────────────
//
// Batida livre e os dias de montagem/desmontagem não estão aqui — dependem
// do evento já existir (a grade de dias usa a data de início já salva). O
// evento nasce travado por horário, do jeito mais seguro, e quem quiser
// mudar isso abre a edição logo em seguida.

import { useState } from 'react'
import { useRouter } from 'expo-router'
import { Modal, View, StyleSheet } from 'react-native'
import { conferirHorariosDoEvento, podeGerenciarEventos, type ProblemaDeJanela } from '@credenciei/dominio'
import type { DadosDeNovoEvento, Organizacao } from '@credenciei/contrato'
import { mensagemDoErro, usePedido } from '../../src/dados/pedido'
import { useSessao } from '../../src/sessao/contexto'
import {
  Aviso, Botao, Campo, Carregando, Cartao, Corpo, Escolha, Etiqueta, Legenda,
  Respiro, Tela, TituloDaTela, TituloDeCartao,
} from '../../src/ui/componentes'
import { CampoDeDataHora } from '../../src/ui/data-hora'
import { Icone } from '../../src/ui/icone'
import { cor, espaco, raio, texto, tipo, uso } from '../../src/ui/tema'

/** Suspensa aparece na lista, marcada — nunca escondida sem explicação. */
function rotuloDaOrganizacao(o: Organizacao): string {
  return o.ativa ? o.nome : `${o.nome} (suspensa)`
}

export default function CriarEvento() {
  const router = useRouter()
  const { cliente, sessao } = useSessao()
  const souMaster = sessao?.papel === 'master'

  /*
   * O seletor de organização só aparece pra quem precisa dele. Buscar a
   * lista mesmo assim, para o admin, seria uma chamada — e uma permissão —
   * que a tela dele nunca ia usar.
   */
  const { pedido } = usePedido(
    () => (souMaster ? cliente.organizacoes() : Promise.resolve(null)),
    [cliente, souMaster],
  )

  if (!podeGerenciarEventos(sessao?.papel)) {
    return (
      <Tela>
        <Aviso tipo="erro">Você não tem permissão para criar eventos.</Aviso>
      </Tela>
    )
  }

  if (souMaster && pedido.estado === 'carregando') {
    return <Tela><Carregando /></Tela>
  }
  if (souMaster && pedido.estado === 'falhou') {
    return <Tela><Aviso tipo="erro">{pedido.mensagem}</Aviso></Tela>
  }

  const organizacoes = souMaster && pedido.estado === 'pronto' ? pedido.dados?.itens ?? [] : []

  return (
    <Tela>
      <TituloDaTela>Novo evento</TituloDaTela>
      <Legenda>Preencha os dados do evento</Legenda>
      <Respiro />

      <Formulario
        souMaster={souMaster}
        organizacoes={organizacoes}
        aoCriar={dados => cliente.criarEvento(dados)}
        aoTerminar={eventoId => router.replace(`/evento/${eventoId}` as never)}
        aoCancelar={() => router.back()}
      />
    </Tela>
  )
}

function Formulario({
  souMaster, organizacoes, aoCriar, aoTerminar, aoCancelar,
}: {
  souMaster: boolean
  organizacoes: Organizacao[]
  aoCriar: (dados: DadosDeNovoEvento) => Promise<{ eventoId?: string; erro?: string }>
  aoTerminar: (eventoId: string) => void
  aoCancelar: () => void
}) {
  const [organizacaoId, setOrganizacaoId] = useState('')
  const [nome, setNome] = useState('')
  const [descricao, setDescricao] = useState('')
  const [local, setLocal] = useState('')
  const [dataInicio, setDataInicio] = useState<string | null>(null)
  const [dataFim, setDataFim] = useState<string | null>(null)
  const [entradaInicio, setEntradaInicio] = useState<string | null>(null)
  const [entradaFim, setEntradaFim] = useState<string | null>(null)
  const [saidaInicio, setSaidaInicio] = useState<string | null>(null)
  const [saidaFim, setSaidaFim] = useState<string | null>(null)

  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [bloqueio, setBloqueio] = useState<ProblemaDeJanela[] | null>(null)

  /** Sempre sobre o estado ATUAL — nunca sobre um veredito guardado. */
  function conferir(): ProblemaDeJanela[] {
    return conferirHorariosDoEvento({
      data_inicio: dataInicio,
      data_fim: dataFim,
      janela_entrada_inicio: entradaInicio,
      janela_entrada_fim: entradaFim,
      janela_fim_inicio: saidaInicio,
      janela_fim_fim: saidaFim,
    })
  }

  const alertas = conferir().filter(p => !p.bloqueia)
  const organizacaoEscolhida = organizacoes.find(o => o.organizacaoId === organizacaoId) ?? null

  async function criar() {
    setErro(null)

    if (!nome.trim()) return setErro('O nome do evento é obrigatório.')
    if (!dataInicio || !dataFim) return setErro('Data de início e data de fim são obrigatórias.')
    if (souMaster && !organizacaoId) return setErro('Escolha a organização dona deste evento.')

    const agora = conferir()
    const impedem = agora.filter(p => p.bloqueia)
    if (impedem.length > 0) return setBloqueio(impedem)

    setSalvando(true)
    try {
      const r = await aoCriar({
        organizacaoId: souMaster ? organizacaoId : undefined,
        nome,
        descricao: descricao.trim() || null,
        local: local.trim() || null,
        dataInicio,
        dataFim,
        janelaEntradaInicio: entradaInicio,
        janelaEntradaFim: entradaFim,
        janelaFimInicio: saidaInicio,
        janelaFimFim: saidaFim,
      })
      if (r.erro || !r.eventoId) return setErro(r.erro ?? 'Não foi possível criar o evento.')
      aoTerminar(r.eventoId)
    } catch (e) {
      setErro(mensagemDoErro(e))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <>
      {erro ? <Aviso tipo="erro">{erro}</Aviso> : null}

      {souMaster ? (
        <Cartao>
          <TituloDeCartao>Organização dona do evento</TituloDeCartao>
          <Legenda>
            É quem vai enxergar e operar este evento. Sem dono, o evento não
            aparece pra nenhum administrador.
          </Legenda>
          <Respiro altura={espaco.m} />
          {organizacoes.length === 0 ? (
            <Corpo>Nenhuma organização cadastrada ainda.</Corpo>
          ) : (
            <Escolha
              opcoes={organizacoes.map(rotuloDaOrganizacao)}
              valor={organizacaoEscolhida ? rotuloDaOrganizacao(organizacaoEscolhida) : null}
              aoEscolher={rotulo => {
                const achada = organizacoes.find(o => rotuloDaOrganizacao(o) === rotulo)
                setOrganizacaoId(achada?.organizacaoId ?? '')
              }}
            />
          )}
        </Cartao>
      ) : null}

      <Cartao>
        <TituloDeCartao>Informações gerais</TituloDeCartao>
        <Legenda>Nome, descrição e local do evento</Legenda>
        <Respiro altura={espaco.m} />
        <Campo rotulo="Nome do evento *" value={nome} onChangeText={setNome} autoCapitalize="words" />
        <Campo
          rotulo="Descrição"
          value={descricao}
          onChangeText={setDescricao}
          multiline
          style={e.multiplasLinhas}
        />
        <Campo rotulo="Local" value={local} onChangeText={setLocal} autoCapitalize="words" />
      </Cartao>

      <Cartao>
        <TituloDeCartao>Duração</TituloDeCartao>
        <Legenda>Quando o evento começa e termina</Legenda>
        <Respiro altura={espaco.m} />
        <CampoDeDataHora rotulo="DATA DE INÍCIO *" valor={dataInicio} aoMudar={setDataInicio} />
        <CampoDeDataHora rotulo="DATA DE FIM *" valor={dataFim} aoMudar={setDataFim} />
      </Cartao>

      <Etiqueta>Horários do dia principal</Etiqueta>
      <Legenda>
        Quando a equipe pode bater entrada e saída no dia do evento. O meio
        não entra aqui: o sistema pede a batida por foto 4 horas depois da
        entrada de cada pessoa.
      </Legenda>
      <Respiro altura={espaco.m} />

      <Cartao>
        <View style={e.tituloComIcone}>
          <View style={[e.blocoDoIcone, { backgroundColor: cor.sucesso50 }]}>
            <Icone nome="LogIn" tamanho={14} tom={cor.sucesso600} />
          </View>
          <TituloDeCartao>Entrada</TituloDeCartao>
        </View>
        <Respiro altura={espaco.m} />
        <CampoDeDataHora rotulo="INÍCIO" valor={entradaInicio} aoMudar={setEntradaInicio} />
        <CampoDeDataHora rotulo="FIM" valor={entradaFim} aoMudar={setEntradaFim} />
      </Cartao>

      <Cartao>
        <View style={e.tituloComIcone}>
          <View style={[e.blocoDoIcone, { backgroundColor: cor.acento50 }]}>
            <Icone nome="LogOut" tamanho={14} tom={cor.acento500} />
          </View>
          <TituloDeCartao>Saída</TituloDeCartao>
        </View>
        <Respiro altura={espaco.m} />
        <CampoDeDataHora rotulo="INÍCIO" valor={saidaInicio} aoMudar={setSaidaInicio} />
        <CampoDeDataHora rotulo="FIM" valor={saidaFim} aoMudar={setSaidaFim} />
      </Cartao>

      {alertas.length > 0 ? (
        <>
          {alertas.map(a => <Aviso key={a.mensagem} tipo="aviso">{a.mensagem}</Aviso>)}
        </>
      ) : null}

      <Respiro altura={espaco.m} />
      <Botao titulo="Criar evento" onPress={criar} ocupado={salvando} />
      <Respiro altura={espaco.s} />
      <Botao titulo="Cancelar" onPress={aoCancelar} tipo="fantasma" desabilitado={salvando} />

      {bloqueio ? (
        <Modal visible transparent animationType="fade" onRequestClose={() => setBloqueio(null)}>
          <View style={e.fundoDoAviso}>
            <View style={e.caixaDoAviso}>
              <View style={e.tituloComIcone}>
                <View style={[e.blocoDoIcone, { backgroundColor: cor.erro50 }]}>
                  <Icone nome="AlertTriangle" tamanho={16} tom={cor.erro600} />
                </View>
                <TituloDeCartao>Não dá para criar assim</TituloDeCartao>
              </View>
              <Respiro altura={espaco.m} />
              {bloqueio.map(p => (
                <View key={p.mensagem} style={e.problema}>
                  <Corpo>{p.mensagem}</Corpo>
                </View>
              ))}
              <Respiro altura={espaco.m} />
              <Legenda>Nada foi criado. Corrija os horários acima e toque em criar de novo.</Legenda>
              <Respiro />
              <Botao titulo="Entendi" onPress={() => setBloqueio(null)} />
            </View>
          </View>
        </Modal>
      ) : null}
    </>
  )
}

const e = StyleSheet.create({
  multiplasLinhas: { minHeight: 88, paddingTop: espaco.m, textAlignVertical: 'top' },

  tituloComIcone: { flexDirection: 'row', alignItems: 'center', gap: espaco.s },
  blocoDoIcone: {
    width: 28,
    height: 28,
    borderRadius: raio.campo,
    alignItems: 'center',
    justifyContent: 'center',
  },

  fundoDoAviso: {
    flex: 1,
    backgroundColor: 'rgba(17,17,19,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: espaco.gg,
  },
  caixaDoAviso: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: uso.superficie,
    borderRadius: raio.folha,
    padding: espaco.gg,
  },
  problema: {
    backgroundColor: cor.erro50,
    borderWidth: 1,
    borderColor: cor.erro200,
    borderRadius: raio.campo,
    padding: espaco.m,
    marginBottom: espaco.s,
  },
})
