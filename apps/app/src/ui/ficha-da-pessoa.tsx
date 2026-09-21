// A ficha de uma pessoa da equipe.
//
// Abre ao tocar no nome de alguém na lista do setor. Junta o que está espalhado
// em quatro consultas — quem é, onde está, o que bateu hoje, quanto tem a
// receber e o histórico inteiro — porque quem abre está com uma pergunta só na
// cabeça e não deveria ter que navegar para respondê-la.
//
// ─── DUAS ABAS, E "DADOS" PRIMEIRO ──────────────────────────────────────────
//
// É o que se vem consultar mais: quem é a pessoa, e o que fazer com ela agora.
// O histórico é a segunda pergunta — aparece quando alguém contesta um dia ou
// confere o fechamento.

import { useMemo, useState } from 'react'
import { Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { formatCpf, formatTelefone, formatarBR, NOME_DA_FASE } from '@credenciei/dominio'
import type { Contestacao, FichaDaPessoa, RegistroDePresenca, TipoBatida } from '@credenciei/contrato'
import { mensagemDoErro, usePedido } from '../dados/pedido'
import { useSessao } from '../sessao/contexto'
import { celulaSilenciosa, NOME_DO_STATUS, resumoDoHistorico, statusDoDia } from '../historico'
import {
  Aviso, Botao, Campo, Carregando, Corpo, Indicador, Legenda, Respiro, Selo,
  Separador, TituloDeCartao,
} from './componentes'
import { Icone } from './icone'
import { ALVO_MINIMO, corDaEtapa, espaco, gradienteMarca, raio, texto, tipo } from './tema'
import { useTema, type Tokens } from './tema-contexto'

const ROTULO: Record<TipoBatida, string> = { entrada: 'Entrada', meio: 'Meio', fim: 'Fim' }

function criarEstilos(cor: Tokens['cor'], uso: Tokens['uso']) {
  return StyleSheet.create({
    fora: { flex: 1, backgroundColor: cor.fundo },

    topo: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: espaco.m,
      padding: espaco.g,
      paddingTop: espaco.ggg,
      backgroundColor: uso.superficie,
      borderBottomWidth: 1,
      borderBottomColor: uso.borda,
    },
    identidade: { flexDirection: 'row', alignItems: 'center', gap: espaco.m, flex: 1, minWidth: 0 },
    retrato: {
      width: 44,
      height: 44,
      borderRadius: 999,
      backgroundColor: cor.neutro100,
      borderWidth: 1,
      borderColor: uso.borda,
      alignItems: 'center',
      justifyContent: 'center',
    },
    iniciais: { ...texto.corpoForte, color: uso.tintaMedia },
    identidadeTexto: { flex: 1, minWidth: 0 },
    fechar: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },

    abas: {
      flexDirection: 'row',
      backgroundColor: uso.superficie,
      borderBottomWidth: 1,
      borderBottomColor: uso.borda,
      paddingHorizontal: espaco.g,
    },
    aba: { paddingVertical: espaco.m, marginRight: espaco.g, borderBottomWidth: 2, borderBottomColor: 'transparent' },
    abaAtiva: { borderBottomColor: cor.acento500 },
    abaTexto: { ...texto.corpoForte, color: uso.tintaFraca },
    abaTextoAtivo: { color: cor.acento700 },

    conteudo: { padding: espaco.g, paddingBottom: espaco.gggg },

    parDeDados: { flexDirection: 'row', gap: espaco.g },
    dado: { flex: 1, minWidth: 0 },
    dadoRotulo: { ...texto.xs, color: uso.tintaFraca },

    secao: { ...texto.etiqueta, color: uso.tintaFraca },
    linhaDoTitulo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: espaco.m },

    /*
     * O botão que abre o seletor de setor — cópia do padrão de
     * `ModalDeSetores` em `evento/[id]/editar.tsx`: com trinta ou quarenta
     * setores (comum em evento grande), a parede de chips passava da altura
     * da tela inteira. Um botão só, na cor de ação do sistema — é uma
     * escolha que muda de verdade onde a pessoa trabalha.
     */
    setorSeletorBotao: {
      minHeight: ALVO_MINIMO,
      borderRadius: raio.campo,
      flexDirection: 'row',
      alignItems: 'center',
      gap: espaco.s,
      paddingHorizontal: espaco.g,
    },
    setorSeletorTexto: { ...texto.corpoForte, color: '#ffffff', flex: 1, minWidth: 0 },

    setorModalFora: { flex: 1, backgroundColor: uso.superficie, paddingTop: espaco.gg },
    setorModalTopo: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: espaco.s,
      paddingHorizontal: espaco.g,
      paddingBottom: espaco.g,
      borderBottomWidth: 1,
      borderBottomColor: uso.borda,
    },
    setorModalBusca: { paddingHorizontal: espaco.g, paddingTop: espaco.m },
    setorModalLista: { padding: espaco.g },
    setorModalLinha: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      minHeight: ALVO_MINIMO,
      paddingHorizontal: espaco.m,
      borderRadius: raio.campo,
    },
    setorModalLinhaMarcada: { backgroundColor: cor.acento50 },
    setorModalLinhaTexto: { ...texto.base, fontFamily: tipo.regular, color: uso.tinta },
    setorModalLinhaTextoMarcado: { fontFamily: tipo.semi, color: cor.acento700 },

    presenca: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: uso.superficie,
      borderWidth: 1,
      borderColor: uso.borda,
      borderRadius: raio.campo,
      paddingHorizontal: espaco.m,
      paddingVertical: espaco.m,
      marginBottom: espaco.s,
    },
    presencaNome: { flexDirection: 'row', alignItems: 'center', gap: espaco.s },
    presencaDireita: { flexDirection: 'row', alignItems: 'center', gap: espaco.s },
    ponto: { width: 7, height: 7, borderRadius: 999 },

    contestacao: {
      backgroundColor: uso.superficie,
      borderWidth: 1,
      borderColor: uso.borda,
      borderRadius: raio.campo,
      padding: espaco.m,
      marginBottom: espaco.s,
    },
    contestacaoTopo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: espaco.m },

    grade: { flexDirection: 'row', flexWrap: 'wrap', gap: espaco.m },
    gradeItem: { width: '48%', flexGrow: 1 },

    contagens: { flexDirection: 'row', flexWrap: 'wrap', gap: espaco.g },
    contagem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    contagemTexto: { ...texto.corpo, color: uso.tintaMedia },
    contagemNumero: { fontFamily: tipo.semi, color: uso.tinta },

    diaDoHistorico: {
      backgroundColor: uso.superficie,
      borderWidth: 1,
      borderColor: uso.borda,
      borderRadius: raio.cartao,
      padding: espaco.g,
      marginBottom: espaco.s,
    },
    diaTopo: { flexDirection: 'row', alignItems: 'center', gap: espaco.m },
    diaTexto: { flex: 1, minWidth: 0 },
    diaEtapas: { flexDirection: 'row', gap: espaco.s, marginTop: espaco.m },
    celula: {
      flex: 1,
      borderRadius: raio.campoPequeno,
      backgroundColor: cor.neutro25,
      borderWidth: 1,
      borderColor: uso.borda,
      paddingVertical: espaco.s,
      alignItems: 'center',
      gap: 2,
    },
    celulaRotulo: { ...texto.xxs, fontSize: 9, color: uso.tintaFraca },
    celulaValor: { ...texto.corpoForte, color: uso.tinta },
    celulaQuieta: { ...texto.corpoForte, color: cor.neutro300 },
    celulaFalta: { ...texto.xxs, fontFamily: tipo.semi, color: cor.erro600 },
    celulaAssistida: { ...texto.xxs, color: cor.aviso600 },
  })
}

function useEstilos() {
  const { cor, uso } = useTema()
  return useMemo(() => criarEstilos(cor, uso), [cor, uso])
}

export function FichaDaPessoaModal({
  participacaoId, aoFechar, aoMudar,
}: {
  participacaoId: string
  aoFechar: () => void
  /** Avisado quando algo mudou, para a lista atrás se atualizar. */
  aoMudar: () => void
}) {
  const { cliente } = useSessao()
  const { uso } = useTema()
  const e = useEstilos()
  const [aba, setAba] = useState<'dados' | 'historico'>('dados')
  const [versao, setVersao] = useState(0)

  const { pedido } = usePedido(
    () => cliente.fichaDaPessoa(participacaoId),
    [cliente, participacaoId, versao],
  )

  const ficha = pedido.estado === 'pronto' ? pedido.dados : null

  return (
    <Modal visible animationType="slide" onRequestClose={aoFechar}>
      <View style={e.fora}>
        <View style={e.topo}>
          <View style={e.identidade}>
            <View style={e.retrato}>
              <Text style={e.iniciais}>{ficha ? iniciaisDe(ficha.nome) : '··'}</Text>
            </View>
            <View style={e.identidadeTexto}>
              <TituloDeCartao>{ficha?.nome ?? 'Carregando…'}</TituloDeCartao>
              {ficha ? (
                <Legenda>{ficha.eventoNome} · {ficha.setorNome}</Legenda>
              ) : null}
            </View>
          </View>
          <Pressable onPress={aoFechar} hitSlop={8} accessibilityLabel="Fechar" style={e.fechar}>
            <Icone nome="X" tamanho={20} tom={uso.tintaMedia} />
          </Pressable>
        </View>

        <View style={e.abas}>
          {(['dados', 'historico'] as const).map(a => (
            <Pressable
              key={a}
              onPress={() => setAba(a)}
              accessibilityRole="tab"
              accessibilityState={{ selected: aba === a }}
              style={[e.aba, aba === a && e.abaAtiva]}
            >
              <Text style={[e.abaTexto, aba === a && e.abaTextoAtivo]}>
                {a === 'dados' ? 'Dados' : 'Histórico de batidas'}
              </Text>
            </Pressable>
          ))}
        </View>

        <ScrollView contentContainerStyle={e.conteudo} keyboardShouldPersistTaps="handled">
          {pedido.estado === 'carregando' ? <Carregando /> : null}
          {pedido.estado === 'falhou' ? <Aviso tipo="erro">{pedido.mensagem}</Aviso> : null}

          {ficha ? (
            aba === 'dados' ? (
              <AbaDeDados
                ficha={ficha}
                aoMudar={() => { setVersao(v => v + 1); aoMudar() }}
                aoExcluir={() => { aoMudar(); aoFechar() }}
              />
            ) : (
              <AbaDeHistorico ficha={ficha} />
            )
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  )
}

// ─── Dados ──────────────────────────────────────────────────────────────────

function AbaDeDados({
  ficha, aoMudar, aoExcluir,
}: {
  ficha: FichaDaPessoa
  aoMudar: () => void
  /** Avisado quando a exclusão de vez é confirmada — a ficha deixa de existir. */
  aoExcluir: () => void
}) {
  const { cliente } = useSessao()
  const e = useEstilos()
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [destino, setDestino] = useState<string | null>(null)
  const [confirmandoMover, setConfirmandoMover] = useState(false)
  const [modalSetorAberto, setModalSetorAberto] = useState(false)
  const [telefoneDoConvite, setTelefoneDoConvite] = useState(ficha.telefone ?? '')
  const [convidando, setConvidando] = useState(false)
  const [valor, setValor] = useState(String(ficha.valorReceber || ''))
  const [confirmandoExcluir, setConfirmandoExcluir] = useState(false)
  const [motivoExclusao, setMotivoExclusao] = useState('')
  const [corrigindoTelefone, setCorrigindoTelefone] = useState(false)
  const [novoTelefone, setNovoTelefone] = useState(ficha.telefone ?? '')
  const [corrigindoFuncao, setCorrigindoFuncao] = useState(false)
  const [novaFuncao, setNovaFuncao] = useState(ficha.funcao ?? '')
  const [corrigindoCpf, setCorrigindoCpf] = useState(false)
  const [novoCpf, setNovoCpf] = useState(ficha.cpf)

  async function agir(acao: () => Promise<{ erro?: string }>) {
    setErro(null)
    setOcupado(true)
    try {
      const r = await acao()
      if (r.erro) return setErro(r.erro)
      aoMudar()
    } catch (e) {
      setErro(mensagemDoErro(e))
    } finally {
      setOcupado(false)
    }
  }

  return (
    <>
      {erro ? <Aviso tipo="erro">{erro}</Aviso> : null}

      <View style={e.parDeDados}>
        <Dado rotulo="CPF" valor={formatCpf(ficha.cpf)} />
        <Dado rotulo="Telefone" valor={ficha.telefone ? formatTelefone(ficha.telefone) : '—'} />
      </View>

      {/*
        É por este número que a credencial, o aviso do dia e o lembrete de
        ponto chegam pelo WhatsApp — um dígito errado tira a pessoa da
        comunicação do evento inteira. Por isso fica logo junto do dado,
        não escondido numa seção separada.
      */}
      {/*
        Contestações abertas — o colaborador marcou uma batida como errada
        ou faltando. Mesma régua de quem mexe na equipe (decisão do Juan,
        18/09/2026), por isso reusa `podeCorrigirTelefone`: é a mesma conta
        de `podeMexerNaEquipe` na API, ver `ficha-da-pessoa.ts`.
      */}
      {ficha.contestacoesAbertas.length > 0 ? (
        <>
          <Separador />
          <Text style={e.secao}>CONTESTAÇÕES</Text>
          <Respiro altura={espaco.s} />
          {ficha.contestacoesAbertas.map(c => (
            <ContestacaoAberta
              key={c.id}
              contestacao={c}
              podeResolver={ficha.podeCorrigirTelefone}
              aoResolver={aoMudar}
            />
          ))}
        </>
      ) : null}

      {ficha.podeCorrigirTelefone ? (
        corrigindoTelefone ? (
          <>
            <Respiro altura={espaco.s} />
            <Campo
              rotulo="Novo telefone"
              value={novoTelefone}
              onChangeText={setNovoTelefone}
              keyboardType="phone-pad"
              placeholder="(27) 99999-9999"
            />
            <Respiro altura={espaco.s} />
            <Botao
              titulo="Salvar telefone"
              ocupado={ocupado}
              onPress={() => agir(async () => {
                const r = await cliente.corrigirTelefone(ficha.participacaoId, novoTelefone)
                if (!r.erro) setCorrigindoTelefone(false)
                return r
              })}
            />
            <Respiro altura={espaco.s} />
            <Botao titulo="Cancelar" onPress={() => setCorrigindoTelefone(false)} tipo="fantasma" />
          </>
        ) : (
          <>
            <Respiro altura={espaco.s} />
            <Botao titulo="Corrigir telefone" onPress={() => setCorrigindoTelefone(true)} tipo="fantasma" />
          </>
        )
      ) : null}

      {/*
        Corrigir função/cargo (texto livre) — achado comparando com o site
        (21/09/2026, `editarCargoFuncionario`). Mesma régua de mexer na
        equipe, por isso reusa `podeCorrigirTelefone`.
      */}
      {ficha.podeCorrigirTelefone ? (
        corrigindoFuncao ? (
          <>
            <Respiro altura={espaco.s} />
            <Campo
              rotulo="Nova função"
              value={novaFuncao}
              onChangeText={setNovaFuncao}
              placeholder="Ex.: Auxiliar de palco"
            />
            <Respiro altura={espaco.s} />
            <Botao
              titulo="Salvar função"
              ocupado={ocupado}
              onPress={() => agir(async () => {
                const r = await cliente.corrigirFuncao(ficha.participacaoId, novaFuncao)
                if (!r.erro) setCorrigindoFuncao(false)
                return r
              })}
            />
            <Respiro altura={espaco.s} />
            <Botao titulo="Cancelar" onPress={() => setCorrigindoFuncao(false)} tipo="fantasma" />
          </>
        ) : (
          <>
            <Respiro altura={espaco.s} />
            <Botao titulo="Corrigir função" onPress={() => setCorrigindoFuncao(true)} tipo="fantasma" />
          </>
        )
      ) : null}

      {/*
        Corrigir CPF — achado comparando com o site (21/09/2026,
        `editarCpfFuncionario`). Só master aqui: o site também deixa
        suporte, dentro do escopo dele, que o app não modela.
      */}
      {ficha.podeCorrigirCpf ? (
        corrigindoCpf ? (
          <>
            <Respiro altura={espaco.s} />
            <Aviso tipo="aviso">
              Corrigir o CPF muda a identidade do cadastro — confira com
              cuidado antes de salvar.
            </Aviso>
            <Respiro altura={espaco.s} />
            <Campo
              rotulo="Novo CPF"
              value={novoCpf}
              onChangeText={setNovoCpf}
              keyboardType="number-pad"
              placeholder="000.000.000-00"
            />
            <Respiro altura={espaco.s} />
            <Botao
              titulo="Salvar CPF"
              ocupado={ocupado}
              onPress={() => agir(async () => {
                const r = await cliente.corrigirCpf(ficha.participacaoId, novoCpf)
                if (!r.erro) setCorrigindoCpf(false)
                return r
              })}
            />
            <Respiro altura={espaco.s} />
            <Botao titulo="Cancelar" onPress={() => setCorrigindoCpf(false)} tipo="fantasma" />
          </>
        ) : (
          <>
            <Respiro altura={espaco.s} />
            <Botao titulo="Corrigir CPF" onPress={() => setCorrigindoCpf(true)} tipo="fantasma" />
          </>
        )
      ) : null}

      {!ficha.ativo ? (
        <>
          <Respiro altura={espaco.m} />
          <Aviso tipo="aviso">
            Ainda não ativada no evento. Enquanto isso, ela não consegue
            registrar presença.
          </Aviso>
        </>
      ) : null}

      {/*
        Ativar/desativar SEM tirar da equipe — achado comparando com o
        site (21/09/2026): a pessoa continua na lista e no setor, só pára
        de receber lembrete de WhatsApp e sai da conta do fechamento.
        Diferente de "Tirar da equipe" (abaixo), que é outra ação, com
        outro efeito.
      */}
      {ficha.podeAtivarDesativar ? (
        <>
          <Respiro altura={espaco.s} />
          <Botao
            titulo={ficha.ativo ? 'Desativar (sem tirar da equipe)' : 'Ativar de novo'}
            tipo="fantasma"
            ocupado={ocupado}
            onPress={() => agir(() => cliente.alternarAtivacao(ficha.participacaoId, !ficha.ativo))}
          />
        </>
      ) : null}

      {/*
        Mover para outro setor — só quem enxerga o evento inteiro. Existe para
        o admin resolver cadastro no setor errado sozinho, sem precisar mexer
        no banco.
      */}
      {ficha.podeMover && ficha.outrosSetores.length > 0 ? (
        <>
          <Separador />
          <Text style={e.secao}>SETOR</Text>
          <Respiro altura={espaco.s} />
          <Corpo>Atualmente em <Corpo forte>{ficha.setorNome}</Corpo></Corpo>
          <Respiro altura={espaco.m} />

          {!confirmandoMover ? (
            <>
              <Pressable onPress={() => setModalSetorAberto(true)} accessibilityRole="button">
                <LinearGradient
                  colors={[...gradienteMarca.cores] as [string, string, string]}
                  locations={[...gradienteMarca.posicoes] as [number, number, number]}
                  start={gradienteMarca.inicio}
                  end={gradienteMarca.fim}
                  style={[e.setorSeletorBotao, gradienteMarca.sombra]}
                >
                  <Icone nome="ArrowLeftRight" tamanho={16} tom="#ffffff" />
                  <Text style={e.setorSeletorTexto} numberOfLines={1}>Trocar Funcionário de setor</Text>
                  <Icone nome="ChevronRight" tamanho={16} tom="#ffffff" />
                </LinearGradient>
              </Pressable>

              {destino ? (
                <>
                  <Respiro altura={espaco.s} />
                  <Legenda>
                    Novo setor: <Corpo forte>{ficha.outrosSetores.find(s => s.setorId === destino)?.nome}</Corpo>
                  </Legenda>
                </>
              ) : null}

              <ModalDeSelecaoDeSetor
                visivel={modalSetorAberto}
                setores={ficha.outrosSetores}
                selecionado={destino}
                aoEscolher={id => { setDestino(id); setModalSetorAberto(false) }}
                aoFechar={() => setModalSetorAberto(false)}
              />

              <Respiro altura={espaco.m} />
              <Botao
                titulo="Mover para o setor escolhido"
                onPress={() => destino && setConfirmandoMover(true)}
                tipo="secundario"
                desabilitado={!destino || ocupado}
              />
            </>
          ) : (
            <>
              <Aviso tipo="aviso">
                {ficha.nome} passa a ser da equipe de{' '}
                {ficha.outrosSetores.find(s => s.setorId === destino)?.nome}. As batidas já
                registradas continuam como estão.
              </Aviso>
              <Botao
                titulo="Confirmar"
                ocupado={ocupado}
                onPress={() => agir(async () => {
                  const r = await cliente.moverDeSetor(ficha.participacaoId, destino!)
                  if (!r.erro) setConfirmandoMover(false)
                  return r
                })}
              />
              <Respiro altura={espaco.s} />
              <Botao titulo="Cancelar" onPress={() => setConfirmandoMover(false)} tipo="fantasma" />
            </>
          )}
        </>
      ) : null}

      {/*
        Promover reaproveita nome e CPF de quem já está credenciado: a pessoa
        promovida quase sempre já está na equipe, e digitar tudo de novo só
        multiplica a chance de erro.
      */}
      {ficha.podeTornarSupervisor ? (
        <>
          <Separador />
          <Text style={e.secao}>SUPERVISOR</Text>
          <Respiro altura={espaco.s} />

          {!convidando ? (
            <Botao
              titulo={`Tornar ${primeiroNome(ficha.nome)} supervisor(a) de ${ficha.setorNome}`}
              onPress={() => setConvidando(true)}
              tipo="acento"
            />
          ) : (
            <>
              <Campo
                rotulo="Telefone para o convite"
                value={telefoneDoConvite}
                onChangeText={setTelefoneDoConvite}
                keyboardType="phone-pad"
                ajuda="É por ele que o link para criar a senha vai."
              />
              <Botao
                titulo="Confirmar"
                ocupado={ocupado}
                onPress={() => agir(async () => {
                  const r = await cliente.tornarSupervisor(ficha.participacaoId, telefoneDoConvite)
                  if (!r.erro) setConvidando(false)
                  return r
                })}
              />
              <Respiro altura={espaco.s} />
              <Botao titulo="Cancelar" onPress={() => setConvidando(false)} tipo="fantasma" />
            </>
          )}
        </>
      ) : null}

      {/*
        Tirar da equipe descredencia sem apagar nada — reversível por "trazer
        de volta". É a ação do dia a dia para quem saiu do evento; excluir de
        vez fica separado, lá embaixo, como zona de risco.
      */}
      <Separador />
      <Text style={e.secao}>VÍNCULO COM O EVENTO</Text>
      <Respiro altura={espaco.s} />
      {ficha.descredenciadoEm ? (
        <>
          <Aviso tipo="aviso">
            Fora da equipe desde {formatarBR(ficha.descredenciadoEm, 'curto')}. Enquanto isso,
            não registra presença nem aparece nos relatórios.
          </Aviso>
          <Respiro altura={espaco.m} />
          <Botao
            titulo="Trazer de volta"
            ocupado={ocupado}
            tipo="secundario"
            onPress={() => agir(() => cliente.trazerDeVolta(ficha.participacaoId))}
          />
        </>
      ) : (
        <Botao
          titulo="Tirar da equipe"
          ocupado={ocupado}
          tipo="fantasma"
          onPress={() => agir(() => cliente.tirarDaEquipe(ficha.participacaoId))}
        />
      )}

      <Separador />
      <Text style={e.secao}>PRESENÇA HOJE</Text>
      <Respiro altura={espaco.s} />
      {(['entrada', 'meio', 'fim'] as const).map(etapa => (
        <LinhaDePresenca key={etapa} etapa={etapa} registro={ficha.presencaHoje[etapa]} />
      ))}

      <Separador />
      <View style={e.linhaDoTitulo}>
        <Text style={e.secao}>FINANCEIRO</Text>
        <Botao
          titulo={ficha.pago ? 'PAGO' : 'Marcar como pago'}
          onPress={() => agir(() => cliente.marcarPagamento(ficha.participacaoId, !ficha.pago))}
          tipo={ficha.pago ? 'acento' : 'secundario'}
          desabilitado={ocupado}
        />
      </View>
      {ficha.pago && ficha.pagoEm ? (
        <>
          <Respiro altura={espaco.s} />
          <Legenda>Pago em {formatarBR(ficha.pagoEm, 'curto')} — toque de novo para desfazer.</Legenda>
        </>
      ) : null}

      <Respiro altura={espaco.m} />
      <View style={e.presenca}>
        <Corpo>Chave PIX</Corpo>
        <Corpo forte>{ficha.chavePix ?? '—'}</Corpo>
      </View>

      <Respiro altura={espaco.g} />
      <Text style={e.secao}>VALOR A RECEBER DO SETOR</Text>
      <Respiro altura={espaco.xs} />
      <Legenda>
        Quanto esta pessoa deve receber — pode ser diferente do valor combinado
        com {ficha.empresa || 'o setor'}.
      </Legenda>
      <Respiro altura={espaco.s} />
      <Campo
        value={valor}
        onChangeText={t => setValor(t.replace(/\D/g, ''))}
        placeholder="R$ 0"
        keyboardType="number-pad"
      />
      <Botao
        titulo="Salvar valor"
        ocupado={ocupado}
        onPress={() => agir(() => cliente.salvarValorAReceber(
          ficha.participacaoId,
          Number(valor || 0),
        ))}
      />

      {/*
        Zona de risco, separada do resto por design: excluir apaga o
        cadastro e as batidas, sem volta — diferente de "tirar da equipe",
        que preserva tudo. Por isso pede motivo e uma segunda confirmação.
      */}
      {ficha.podeExcluirDaEquipe ? (
        <>
          <Separador />
          <Text style={e.secao}>EXCLUIR DE VEZ</Text>
          <Respiro altura={espaco.s} />
          <Legenda>
            Apaga o cadastro e o histórico de batidas desta pessoa neste evento —
            sem volta. Para só afastar da equipe, use "Tirar da equipe" acima.
          </Legenda>
          <Respiro altura={espaco.m} />

          {!confirmandoExcluir ? (
            <Botao
              titulo="Excluir de vez"
              tipo="fantasma"
              onPress={() => setConfirmandoExcluir(true)}
            />
          ) : (
            <>
              <Aviso tipo="erro">
                {ficha.nome} e todas as batidas dela neste evento serão apagadas
                para sempre. Não tem como desfazer.
              </Aviso>
              <Respiro altura={espaco.s} />
              <Campo
                rotulo="Motivo (opcional)"
                value={motivoExclusao}
                onChangeText={setMotivoExclusao}
                placeholder="Ex.: cadastro duplicado"
              />
              <Botao
                titulo="Confirmar exclusão"
                ocupado={ocupado}
                onPress={async () => {
                  setErro(null)
                  setOcupado(true)
                  try {
                    const r = await cliente.excluirDaEquipe(ficha.participacaoId, motivoExclusao)
                    if (r.erro) return setErro(r.erro)
                    aoExcluir()
                  } catch (err) {
                    setErro(mensagemDoErro(err))
                  } finally {
                    setOcupado(false)
                  }
                }}
              />
              <Respiro altura={espaco.s} />
              <Botao titulo="Cancelar" onPress={() => setConfirmandoExcluir(false)} tipo="fantasma" />
            </>
          )}
        </>
      ) : null}
    </>
  )
}

/** A partir de quantos setores a lista ganha campo de busca. */
const MINIMO_PARA_BUSCAR_SETOR = 8

function semAcentoSetor(t: string): string {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/**
 * O modal de escolher o setor de destino — cópia do padrão de
 * `ModalDeSetores` em `evento/[id]/editar.tsx`. Toque na linha já escolhe E
 * fecha: é uma escolha única (pra onde a pessoa vai), não uma lista de
 * marcar vários, então não precisa de "Aplicar" separado.
 */
function ModalDeSelecaoDeSetor({
  visivel, setores, selecionado, aoEscolher, aoFechar,
}: {
  visivel: boolean
  setores: { setorId: string; nome: string }[]
  selecionado: string | null
  aoEscolher: (setorId: string) => void
  aoFechar: () => void
}) {
  const { cor, uso } = useTema()
  const e = useEstilos()
  const [busca, setBusca] = useState('')

  const filtrados = busca.trim()
    ? setores.filter(s => semAcentoSetor(s.nome).includes(semAcentoSetor(busca.trim())))
    : setores

  return (
    <Modal visible={visivel} animationType="slide" onRequestClose={aoFechar}>
      <View style={e.setorModalFora}>
        <View style={e.setorModalTopo}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <TituloDeCartao>Mover para qual setor?</TituloDeCartao>
          </View>
          <Pressable onPress={() => { setBusca(''); aoFechar() }} hitSlop={8} accessibilityLabel="Fechar">
            <Icone nome="X" tamanho={20} tom={uso.tintaMedia} />
          </Pressable>
        </View>

        {setores.length >= MINIMO_PARA_BUSCAR_SETOR ? (
          <View style={e.setorModalBusca}>
            <Campo
              value={busca}
              onChangeText={setBusca}
              placeholder="Buscar setor…"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
        ) : null}

        <ScrollView contentContainerStyle={e.setorModalLista}>
          {filtrados.length === 0 ? (
            <Legenda>Nenhum setor encontrado com “{busca}”.</Legenda>
          ) : filtrados.map(s => {
            const marcado = s.setorId === selecionado
            return (
              <Pressable
                key={s.setorId}
                onPress={() => aoEscolher(s.setorId)}
                accessibilityRole="radio"
                accessibilityState={{ selected: marcado }}
                style={[e.setorModalLinha, marcado && e.setorModalLinhaMarcada]}
              >
                <Text style={[e.setorModalLinhaTexto, marcado && e.setorModalLinhaTextoMarcado]} numberOfLines={1}>
                  {s.nome}
                </Text>
                {marcado ? <Icone nome="Check" tamanho={16} tom={cor.acento600} /> : null}
              </Pressable>
            )
          })}
        </ScrollView>
      </View>
    </Modal>
  )
}

// ─── Histórico ──────────────────────────────────────────────────────────────

/**
 * O histórico de batidas.
 *
 * Os quatro números primeiro, porque respondem sozinhos a pergunta do
 * fechamento — "estava escalado para 11 dias e veio em quantos?". A tabela
 * embaixo é para quando a resposta não basta e alguém quer ver dia a dia.
 */
function AbaDeHistorico({ ficha }: { ficha: FichaDaPessoa }) {
  const e = useEstilos()
  const resumo = resumoDoHistorico(ficha.dias)

  return (
    <>
      <View style={e.grade}>
        <View style={e.gradeItem}>
          <Indicador
            rotulo="Dias escalados"
            valor={resumo.diasEscalados}
            tom="acento"
            icone="CalendarDays"
          />
        </View>
        <View style={e.gradeItem}>
          <Indicador
            rotulo="Dias trabalhados"
            valor={resumo.diasTrabalhados}
            tom="sucesso"
            icone="UserCheck"
          />
        </View>
        <View style={e.gradeItem}>
          <Indicador
            rotulo="Faltas"
            valor={resumo.diasFaltados}
            tom="erro"
            icone="X"
          />
        </View>
        <View style={e.gradeItem}>
          <Indicador
            rotulo="Horas registradas"
            valor={resumo.horasTotais}
            tom="info"
            icone="Clock"
          />
        </View>
      </View>

      <Respiro altura={espaco.m} />
      {/*
        As batidas contadas à parte: "dias trabalhados" já diz quantos dias
        tiveram entrada, e esconde quantos ficaram sem o meio ou sem a saída.
      */}
      <View style={e.contagens}>
        <Contagem etapa="entrada" quantas={resumo.batidas.entrada} rotulo="entradas" />
        <Contagem etapa="meio" quantas={resumo.batidas.meio} rotulo="meios" />
        <Contagem etapa="fim" quantas={resumo.batidas.fim} rotulo="saídas" />
      </View>

      <Respiro altura={espaco.g} />

      {ficha.dias.map(dia => {
        const status = statusDoDia(dia)
        const silencioso = celulaSilenciosa(dia)
        const tom = { presente: 'sucesso', incompleto: 'aviso', ausente: 'erro', cancelado: 'info' } as const

        return (
          <View key={dia.data} style={e.diaDoHistorico}>
            <View style={e.diaTopo}>
              <View style={e.diaTexto}>
                <Corpo forte>{formatarBR(`${dia.data}T12:00:00-03:00`, 'data')}</Corpo>
                <Legenda>{dia.cancelado ? '—' : NOME_DA_FASE[dia.etapa]}</Legenda>
              </View>
              <Selo texto={NOME_DO_STATUS[status]} tipo={tom[status]} />
            </View>

            <View style={e.diaEtapas}>
              <CelulaDoDia etapa="entrada" em={dia.entrada} silencioso={silencioso} assistida={dia.entradaAssistida} />
              <CelulaDoDia etapa="meio" em={dia.meio} silencioso={silencioso} assistida={dia.meioAssistido} />
              <CelulaDoDia etapa="fim" em={dia.saida} silencioso={silencioso} assistida={dia.saidaAssistida} />
              <View style={e.celula}>
                <Text style={e.celulaRotulo}>HORAS</Text>
                <Text style={e.celulaValor}>{dia.horas !== null ? `${dia.horas}h` : '—'}</Text>
              </View>
            </View>
          </View>
        )
      })}
    </>
  )
}

/**
 * Uma etapa do dia no histórico.
 *
 * "Não realizada" só grita quando é anomalia — a pessoa esteve no posto e pulou
 * a etapa. Num dia inteiro ausente, o selo do dia já contou a história uma vez;
 * repetir nas três colunas viraria uma parede vermelha sem informação nova.
 */
function CelulaDoDia({
  etapa, em, silencioso, assistida,
}: { etapa: TipoBatida; em: string | null; silencioso: boolean; assistida?: boolean }) {
  const e = useEstilos()
  return (
    <View style={e.celula}>
      <Text style={e.celulaRotulo}>{ROTULO[etapa].toUpperCase()}</Text>
      {em ? (
        <>
          <Text style={e.celulaValor}>{formatarBR(em, 'hora')}</Text>
          {assistida ? <Text style={e.celulaAssistida}>assistida</Text> : null}
        </>
      ) : silencioso ? (
        <Text style={e.celulaQuieta}>—</Text>
      ) : (
        <Text style={e.celulaFalta}>NÃO</Text>
      )}
    </View>
  )
}

function Contagem({
  etapa, quantas, rotulo,
}: { etapa: TipoBatida; quantas: number; rotulo: string }) {
  const e = useEstilos()
  return (
    <View style={e.contagem}>
      <View style={[e.ponto, { backgroundColor: corDaEtapa[etapa] }]} />
      <Text style={e.contagemTexto}>
        <Text style={e.contagemNumero}>{quantas}</Text> {rotulo}
      </Text>
    </View>
  )
}

/** Uma contestação aberta, com o botão de resolver pra quem pode mexer na equipe. */
function ContestacaoAberta({
  contestacao, podeResolver, aoResolver,
}: {
  contestacao: Contestacao
  podeResolver: boolean
  /** Avisado quando a contestação é marcada como resolvida, pra ficha recarregar. */
  aoResolver: () => void
}) {
  const { cliente } = useSessao()
  const e = useEstilos()
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  return (
    <View style={e.contestacao}>
      <View style={e.contestacaoTopo}>
        <Selo texto={ROTULO[contestacao.tipo]} tipo="aviso" />
        <Legenda>{formatarBR(`${contestacao.dataRef}T12:00:00-03:00`, 'data')}</Legenda>
      </View>
      <Respiro altura={espaco.s} />
      <Corpo>{contestacao.motivo}</Corpo>
      {erro ? (
        <>
          <Respiro altura={espaco.s} />
          <Aviso tipo="erro">{erro}</Aviso>
        </>
      ) : null}
      {podeResolver ? (
        <>
          <Respiro altura={espaco.s} />
          <Botao
            titulo="Marcar como resolvida"
            tipo="secundario"
            ocupado={ocupado}
            onPress={async () => {
              setErro(null)
              setOcupado(true)
              try {
                const r = await cliente.resolverContestacao(contestacao.id)
                if (r.erro) return setErro(r.erro)
                aoResolver()
              } catch (err) {
                setErro(mensagemDoErro(err))
              } finally {
                setOcupado(false)
              }
            }}
          />
        </>
      ) : null}
    </View>
  )
}

/**
 * Uma etapa da presença de hoje, com atalho pra foto e localização —
 * achado comparando com a ficha da pessoa do site (21/09/2026): lá o
 * ícone de câmera abre a foto da batida, e o de mapa abre onde foi
 * registrada. Útil pra conferir sem precisar de outra ferramenta.
 */
function LinhaDePresenca({
  etapa, registro,
}: { etapa: TipoBatida; registro: RegistroDePresenca | null }) {
  const { cor } = useTema()
  const e = useEstilos()
  return (
    <View style={e.presenca}>
      <View style={e.presencaNome}>
        <View style={[e.ponto, { backgroundColor: corDaEtapa[etapa] }]} />
        <Corpo>{ROTULO[etapa]}</Corpo>
      </View>
      <View style={e.presencaDireita}>
        <Corpo forte>{registro ? formatarBR(registro.registradoEm, 'hora') : '—'}</Corpo>
        {registro?.fotoUrl ? (
          <Pressable
            onPress={() => Linking.openURL(registro.fotoUrl!)}
            hitSlop={8}
            accessibilityRole="link"
            accessibilityLabel="Ver foto da batida"
          >
            <Icone nome="Camera" tamanho={16} tom={cor.neutro500} />
          </Pressable>
        ) : null}
        {registro?.lat != null && registro.lng != null ? (
          <Pressable
            onPress={() => Linking.openURL(`https://maps.google.com/?q=${registro.lat},${registro.lng}`)}
            hitSlop={8}
            accessibilityRole="link"
            accessibilityLabel="Ver localização da batida"
          >
            <Icone nome="MapPin" tamanho={16} tom={cor.neutro500} />
          </Pressable>
        ) : null}
      </View>
    </View>
  )
}

function Dado({ rotulo, valor }: { rotulo: string; valor: string }) {
  const e = useEstilos()
  return (
    <View style={e.dado}>
      <Text style={e.dadoRotulo}>{rotulo}</Text>
      <Corpo forte>{valor}</Corpo>
    </View>
  )
}

function iniciaisDe(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return '?'
  const letras = partes.length > 1
    ? (partes[0]?.[0] ?? '') + (partes[partes.length - 1]?.[0] ?? '')
    : (partes[0] ?? '').slice(0, 2)
  return letras.toUpperCase()
}

const primeiroNome = (nome: string) => nome.trim().split(/\s+/)[0] ?? nome

