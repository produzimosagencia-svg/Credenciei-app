// Conferência de equipe — a tela que o supervisor usa 1 dia antes do evento.
//
// Trazido do site em 11/09/2026. Vê a equipe, tira quem não é dele, confirma
// que aquela lista está certa. Boa experiência = uma lista, um botão por
// pessoa, um botão pra fechar. Sem passo escondido.
//
// ─── ABRE 1 DIA ANTES, E NÃO FECHA MAIS ─────────────────────────────────────
//
// A partir de 24h antes do início do evento. Antes disso a tela mostra "abre
// em…"; depois, continua aberta — confirmar tarde ainda é melhor que não
// confirmar.

import { useMemo, useState } from 'react'
import { useLocalSearchParams } from 'expo-router'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { formatCpf, formatarBR } from '@credenciei/dominio'
import { usePedido, mensagemDoErro } from '../../../src/dados/pedido'
import { useSessao } from '../../../src/sessao/contexto'
import {
  Aviso, Botao, Carregando, Cartao, Corpo, Legenda, Respiro, Separador, Tela,
  TituloDaTela, TituloDeCartao,
} from '../../../src/ui/componentes'
import { Icone } from '../../../src/ui/icone'
import { espaco, texto, tipo } from '../../../src/ui/tema'
import { useTema, type Tokens } from '../../../src/ui/tema-contexto'

export default function ConferenciaDeEquipe() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { cliente } = useSessao()
  const { cor, uso } = useTema()
  const e = useEstilos()

  const [versao, setVersao] = useState(0)
  const [erro, setErro] = useState<string | null>(null)
  const [confirmandoFinal, setConfirmandoFinal] = useState(false)
  const [ocupado, setOcupado] = useState(false)

  const { pedido, recarregar } = usePedido(
    () => cliente.conferenciaDoSetor(String(id)),
    [cliente, id, versao],
  )

  const dados = pedido.estado === 'pronto' ? pedido.dados : null

  async function remover(funcionarioId: string) {
    setErro(null)
    setOcupado(true)
    try {
      const r = await cliente.removerDaConferencia(funcionarioId, String(id))
      if (r.erro) return setErro(r.erro)
      setVersao(v => v + 1)
    } catch (e) {
      setErro(mensagemDoErro(e))
    } finally {
      setOcupado(false)
    }
  }

  async function confirmar() {
    setErro(null)
    setOcupado(true)
    try {
      const r = await cliente.confirmarConferencia(String(id))
      if (r.erro) return setErro(r.erro)
      setConfirmandoFinal(false)
      setVersao(v => v + 1)
    } catch (e) {
      setErro(mensagemDoErro(e))
    } finally {
      setOcupado(false)
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
          <TituloDaTela>Conferência de equipe</TituloDaTela>
          <Legenda>{dados.setorNome} · {dados.eventoNome}</Legenda>
          <Respiro />

          {!dados.aberta ? (
            <Cartao>
              <View style={e.aindaFechada}>
                <Icone nome="CalendarDays" tamanho={32} tom={cor.neutro300} />
                <Respiro altura={espaco.s} />
                <Corpo forte>A conferência abre 1 dia antes do evento</Corpo>
                <Respiro altura={espaco.xs} />
                <Legenda>
                  Disponível a partir de {formatarBR(dados.abreEm, 'completo')}. Volte
                  nessa data para conferir e confirmar a equipe do setor {dados.setorNome}.
                </Legenda>
              </View>
            </Cartao>
          ) : (
            <>
              {dados.status === 'confirmada' ? (
                <Aviso tipo="sucesso">
                  Equipe já confirmada — {dados.confirmadaPorNome ?? 'alguém'} confirmou em{' '}
                  {dados.confirmadaEm ? formatarBR(dados.confirmadaEm, 'completo') : '—'}
                  {dados.totalRemovidos != null
                    ? ` · ${dados.totalMantidos} mantidos, ${dados.totalRemovidos} removidos`
                    : ''}. Você pode ajustar e confirmar de novo — cada confirmação fica registrada.
                </Aviso>
              ) : null}

              <Cartao semPadding>
                <View style={e.cabecalhoLista}>
                  <Icone nome="Users" tamanho={14} tom={uso.tintaFraca} />
                  <Text style={e.cabecalhoTexto}>
                    {dados.equipe.length} {dados.equipe.length === 1 ? 'pessoa' : 'pessoas'} na equipe
                  </Text>
                </View>

                {dados.equipe.length === 0 ? (
                  <View style={e.vazio}>
                    <Corpo>Ninguém na equipe deste setor.</Corpo>
                  </View>
                ) : (
                  dados.equipe.map((m, i) => (
                    <View key={m.id}>
                      {i > 0 ? <View style={e.fio} /> : null}
                      <LinhaDoMembro membro={m} ocupado={ocupado} onRemover={() => remover(m.id)} />
                    </View>
                  ))
                )}
              </Cartao>

              {erro ? <Aviso tipo="erro">{erro}</Aviso> : null}

              {confirmandoFinal ? (
                <Cartao>
                  <Corpo>
                    Confirmar que estas {dados.equipe.length}{' '}
                    {dados.equipe.length === 1 ? 'pessoa é' : 'pessoas são'} a equipe do
                    setor {dados.setorNome} para o evento {dados.eventoNome}?
                  </Corpo>
                  <Respiro altura={espaco.m} />
                  <Botao titulo="Sim, confirmar" onPress={confirmar} ocupado={ocupado} />
                  <Respiro altura={espaco.s} />
                  <Botao titulo="Cancelar" onPress={() => setConfirmandoFinal(false)} tipo="fantasma" />
                </Cartao>
              ) : (
                <>
                  <Botao
                    titulo={`Confirmar equipe (${dados.equipe.length} ${dados.equipe.length === 1 ? 'pessoa' : 'pessoas'})`}
                    onPress={() => setConfirmandoFinal(true)}
                    ocupado={ocupado}
                  />
                  <Respiro altura={espaco.s} />
                  <Legenda>
                    Ao confirmar, fica registrado que você conferiu esta equipe, com data e
                    hora.
                  </Legenda>
                </>
              )}
            </>
          )}
        </>
      ) : null}
    </Tela>
  )
}

function LinhaDoMembro({
  membro: m, ocupado, onRemover,
}: { membro: { id: string; nome: string; cpf: string; cargo: string | null }; ocupado: boolean; onRemover: () => void }) {
  const { cor } = useTema()
  const e = useEstilos()
  const [confirmando, setConfirmando] = useState(false)

  return (
    <View style={e.linha}>
      <View style={e.linhaTexto}>
        <Corpo forte>{m.nome}</Corpo>
        <Legenda>{formatCpf(m.cpf)}{m.cargo ? ` · ${m.cargo}` : ''}</Legenda>
      </View>

      {confirmando ? (
        <View style={e.confirmacao}>
          <Botao titulo="Tirar" tipo="perigo" ocupado={ocupado} onPress={onRemover} />
          <Botao titulo="Cancelar" tipo="fantasma" onPress={() => setConfirmando(false)} />
        </View>
      ) : (
        <Pressable
          onPress={() => setConfirmando(true)}
          disabled={ocupado}
          style={({ pressed }) => [e.tirar, pressed && e.tirarTocado]}
        >
          <Icone nome="UserX" tamanho={13} tom={cor.erro600} />
          <Text style={e.tirarTexto}>Tirar</Text>
        </Pressable>
      )}
    </View>
  )
}

function criarEstilos(cor: Tokens['cor'], uso: Tokens['uso']) {
  return StyleSheet.create({
    aindaFechada: { alignItems: 'center', paddingVertical: espaco.g },

    cabecalhoLista: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: espaco.g,
      paddingVertical: espaco.m,
      borderBottomWidth: 1,
      borderBottomColor: uso.borda,
      backgroundColor: cor.neutro50,
    },
    cabecalhoTexto: { ...texto.xs, fontFamily: tipo.semi, color: uso.tintaMedia },
    vazio: { paddingVertical: espaco.g, alignItems: 'center' },

    fio: { height: 1, backgroundColor: uso.borda },
    linha: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: espaco.s,
      paddingHorizontal: espaco.g,
      paddingVertical: espaco.m,
    },
    linhaTexto: { flex: 1, minWidth: 0 },

    tirar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      minHeight: 36,
      paddingHorizontal: espaco.m,
      borderRadius: 999,
      backgroundColor: cor.erro50,
    },
    tirarTocado: { backgroundColor: cor.erro200 },
    tirarTexto: { ...texto.xs, fontFamily: tipo.semi, color: cor.erro600 },

    confirmacao: { flexDirection: 'row', gap: espaco.s },
  })
}

function useEstilos() {
  const { cor, uso } = useTema()
  return useMemo(() => criarEstilos(cor, uso), [cor, uso])
}
