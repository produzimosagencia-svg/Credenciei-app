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

import { useState } from 'react'
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { formatCpf, formatTelefone, formatarBR, NOME_DA_FASE } from '@credenciei/dominio'
import type { FichaDaPessoa, TipoBatida } from '@credenciei/contrato'
import { mensagemDoErro, usePedido } from '../dados/pedido'
import { useSessao } from '../sessao/contexto'
import { celulaSilenciosa, NOME_DO_STATUS, resumoDoHistorico, statusDoDia } from '../historico'
import {
  Aviso, Botao, Campo, Carregando, Corpo, Indicador, Legenda, Respiro, Selo,
  Separador, TituloDeCartao,
} from './componentes'
import { Icone } from './icone'
import { cor, corDaEtapa, espaco, raio, texto, tipo, uso } from './tema'

const ROTULO: Record<TipoBatida, string> = { entrada: 'Entrada', meio: 'Meio', fim: 'Fim' }

export function FichaDaPessoaModal({
  participacaoId, aoFechar, aoMudar,
}: {
  participacaoId: string
  aoFechar: () => void
  /** Avisado quando algo mudou, para a lista atrás se atualizar. */
  aoMudar: () => void
}) {
  const { cliente } = useSessao()
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

function AbaDeDados({ ficha, aoMudar }: { ficha: FichaDaPessoa; aoMudar: () => void }) {
  const { cliente } = useSessao()
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [destino, setDestino] = useState<string | null>(null)
  const [confirmandoMover, setConfirmandoMover] = useState(false)
  const [telefoneDoConvite, setTelefoneDoConvite] = useState(ficha.telefone ?? '')
  const [convidando, setConvidando] = useState(false)
  const [valor, setValor] = useState(String(ficha.valorReceber || ''))

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
              <View style={e.opcoes}>
                {ficha.outrosSetores.map(s => (
                  <Pressable
                    key={s.setorId}
                    onPress={() => setDestino(s.setorId)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: destino === s.setorId }}
                    style={[e.opcao, destino === s.setorId && e.opcaoMarcada]}
                  >
                    <Text style={[e.opcaoTexto, destino === s.setorId && e.opcaoTextoMarcado]}>
                      {s.nome}
                    </Text>
                  </Pressable>
                ))}
              </View>
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

      <Separador />
      <Text style={e.secao}>PRESENÇA HOJE</Text>
      <Respiro altura={espaco.s} />
      {(['entrada', 'meio', 'fim'] as const).map(etapa => (
        <View key={etapa} style={e.presenca}>
          <View style={e.presencaNome}>
            <View style={[e.ponto, { backgroundColor: corDaEtapa[etapa] }]} />
            <Corpo>{ROTULO[etapa]}</Corpo>
          </View>
          <Corpo forte>
            {ficha.presencaHoje[etapa] ? formatarBR(ficha.presencaHoje[etapa]!, 'hora') : '—'}
          </Corpo>
        </View>
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
    </>
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
  const resumo = resumoDoHistorico(ficha.dias)

  return (
    <>
      <View style={e.grade}>
        <View style={e.gradeItem}>
          <Indicador
            rotulo="Dias escalados"
            valor={ficha.dias.length}
            tom="acento"
            icone={<Icone nome="CalendarDays" tamanho={16} tom="#ffffff" />}
          />
        </View>
        <View style={e.gradeItem}>
          <Indicador
            rotulo="Dias trabalhados"
            valor={resumo.diasTrabalhados}
            tom="sucesso"
            icone={<Icone nome="UserCheck" tamanho={16} tom="#ffffff" />}
          />
        </View>
        <View style={e.gradeItem}>
          <Indicador
            rotulo="Faltas"
            valor={resumo.diasFaltados}
            tom="erro"
            icone={<Icone nome="X" tamanho={16} tom="#ffffff" />}
          />
        </View>
        <View style={e.gradeItem}>
          <Indicador
            rotulo="Horas registradas"
            valor={resumo.horasTotais}
            tom="info"
            icone={<Icone nome="Clock" tamanho={16} tom="#ffffff" />}
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
        const tom = { presente: 'sucesso', incompleto: 'aviso', ausente: 'erro' } as const

        return (
          <View key={dia.data} style={e.diaDoHistorico}>
            <View style={e.diaTopo}>
              <View style={e.diaTexto}>
                <Corpo forte>{formatarBR(`${dia.data}T12:00:00-03:00`, 'data')}</Corpo>
                <Legenda>{NOME_DA_FASE[dia.etapa]}</Legenda>
              </View>
              <Selo texto={NOME_DO_STATUS[status]} tipo={tom[status]} />
            </View>

            <View style={e.diaEtapas}>
              <CelulaDoDia etapa="entrada" em={dia.entrada} silencioso={silencioso} />
              <CelulaDoDia etapa="meio" em={dia.meio} silencioso={silencioso} />
              <CelulaDoDia etapa="fim" em={dia.saida} silencioso={silencioso} />
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
  etapa, em, silencioso,
}: { etapa: TipoBatida; em: string | null; silencioso: boolean }) {
  return (
    <View style={e.celula}>
      <Text style={e.celulaRotulo}>{ROTULO[etapa].toUpperCase()}</Text>
      {em ? (
        <Text style={e.celulaValor}>{formatarBR(em, 'hora')}</Text>
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
  return (
    <View style={e.contagem}>
      <View style={[e.ponto, { backgroundColor: corDaEtapa[etapa] }]} />
      <Text style={e.contagemTexto}>
        <Text style={e.contagemNumero}>{quantas}</Text> {rotulo}
      </Text>
    </View>
  )
}

function Dado({ rotulo, valor }: { rotulo: string; valor: string }) {
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

const e = StyleSheet.create({
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
  iniciais: { ...texto.corpoForte, color: cor.neutro600 },
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

  opcoes: { flexDirection: 'row', flexWrap: 'wrap', gap: espaco.s },
  opcao: {
    minHeight: 44,
    paddingHorizontal: espaco.g,
    borderRadius: raio.campo,
    borderWidth: 1,
    borderColor: uso.borda,
    backgroundColor: uso.superficie,
    alignItems: 'center',
    justifyContent: 'center',
  },
  opcaoMarcada: { borderColor: cor.acento500, backgroundColor: cor.acento50 },
  opcaoTexto: { ...texto.corpo, color: uso.tintaMedia },
  opcaoTextoMarcado: { color: cor.acento700, fontFamily: tipo.semi },

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
  ponto: { width: 7, height: 7, borderRadius: 999 },

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
})
