// A Central de Avisos — o que já foi avisado, e o que a pessoa quer receber.
//
// ─── POR QUE UM HISTÓRICO, E NÃO SÓ O PUSH ──────────────────────────────────
//
// Push some. Quem estava com o celular no bolso, sem bateria, ou limpou a
// barra de notificação sem ler, perdeu o aviso para sempre — e alguns deles
// são o motivo de a pessoa estar (ou não) no lugar certo na hora certa. Aqui
// eles ficam.
//
// ─── E POR QUE AS PREFERÊNCIAS FICAM NA MESMA TELA ──────────────────────────
//
// O momento em que alguém quer desligar um tipo de aviso é logo depois de
// receber um que não queria. Ter que caçar a chave em outro lugar é o que faz
// a pessoa desligar a notificação do app inteiro no sistema operacional — e aí
// perde também o lembrete de entrada, que é o que mais importa.
//
// ─── DESLIGAR AQUI NÃO DESLIGA TUDO ─────────────────────────────────────────
//
// Cada tipo é uma chave separada, de propósito: o objetivo é justamente
// evitar o desligamento no atacado. A tela diz isso em uma linha, senão
// ninguém sabe que a escolha é fina.

import { useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { formatarBR } from '@credenciei/dominio'
import type { Notificacao, PreferenciaDeAviso, TipoDeAviso } from '@credenciei/contrato'
import { mensagemDoErro, usePedido } from '../../src/dados/pedido'
import { useSessao } from '../../src/sessao/contexto'
import {
  Aviso, Botao, Carregando, Cartao, Corpo, Etiqueta, Legenda, Respiro, Selo,
  Separador, Tela, TituloDaTela, TituloDeCartao,
} from '../../src/ui/componentes'
import { Icone } from '../../src/ui/icone'
import { espaco, raio, texto, tipo } from '../../src/ui/tema'
import { useTema, type Tokens } from '../../src/ui/tema-contexto'

export default function Avisos() {
  const { cliente } = useSessao()
  const router = useRouter()
  const e = useEstilos()

  const { pedido, recarregar, atualizarSemPiscar } = usePedido(
    () => cliente.minhasNotificacoes(),
    [cliente],
  )
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState<TipoDeAviso | 'todas' | null>(null)

  const dados = pedido.estado === 'pronto' ? pedido.dados : null

  async function marcarTodas() {
    setErro(null)
    setSalvando('todas')
    try {
      await cliente.marcarTodasComoLidas()
      await atualizarSemPiscar()
    } catch (err) {
      setErro(mensagemDoErro(err))
    } finally {
      setSalvando(null)
    }
  }

  /**
   * Tocar num aviso o marca como lido E leva ao destino, quando ele tem um —
   * é o mesmo destino que o push abriria. Marcar sem ir a lugar nenhum faria
   * a pessoa ler duas vezes para chegar onde o aviso mandava.
   */
  async function abrir(n: Notificacao) {
    if (!n.lida) {
      try {
        await cliente.marcarNotificacaoComoLida(n.id)
        await atualizarSemPiscar()
      } catch {
        // Não impede a navegação: ela já leu. O contador se acerta no
        // próximo carregamento.
      }
    }
    if (n.destino) router.push(n.destino as never)
  }

  async function alternar(pref: PreferenciaDeAviso) {
    if (!dados) return
    setErro(null)
    setSalvando(pref.tipo)
    const ligados = dados.preferencias
      .filter(p => (p.tipo === pref.tipo ? !p.ativo : p.ativo))
      .map(p => p.tipo)
    try {
      await cliente.salvarPreferenciasDeAvisos(ligados)
      await atualizarSemPiscar()
    } catch (err) {
      setErro(mensagemDoErro(err))
    } finally {
      setSalvando(null)
    }
  }

  return (
    <Tela>
      <TituloDaTela>Avisos</TituloDaTela>
      <Legenda>
        {dados
          ? dados.naoLidas === 0
            ? 'Nenhum aviso novo.'
            : dados.naoLidas === 1 ? '1 aviso novo.' : `${dados.naoLidas} avisos novos.`
          : 'Tudo que a produção já avisou.'}
      </Legenda>
      <Respiro />

      {pedido.estado === 'carregando' ? <Carregando /> : null}

      {pedido.estado === 'falhou' ? (
        <>
          <Aviso tipo="erro">{pedido.mensagem}</Aviso>
          <Botao titulo="Tentar de novo" onPress={recarregar} tipo="secundario" />
        </>
      ) : null}

      {erro ? (
        <>
          <Aviso tipo="erro">{erro}</Aviso>
          <Respiro altura={espaco.s} />
        </>
      ) : null}

      {dados ? (
        <>
          {dados.naoLidas > 0 ? (
            <>
              <Botao
                titulo="Marcar todos como lidos"
                tipo="secundario"
                ocupado={salvando === 'todas'}
                onPress={() => { void marcarTodas() }}
              />
              <Respiro altura={espaco.s} />
            </>
          ) : null}

          {dados.notificacoes.length === 0 ? (
            <Cartao>
              <Corpo>
                Nenhum aviso ainda. Quando a produção mandar um lembrete de
                entrada, de meio ou um recado do evento, ele fica guardado
                aqui.
              </Corpo>
            </Cartao>
          ) : (
            <Cartao>
              {dados.notificacoes.map((n, i) => (
                <View key={n.id}>
                  {i > 0 ? <Separador /> : null}
                  <LinhaDoAviso aviso={n} aoTocar={() => { void abrir(n) }} />
                </View>
              ))}
            </Cartao>
          )}

          <Respiro altura={espaco.g} />
          <Etiqueta>O QUE EU QUERO RECEBER</Etiqueta>
          <Respiro altura={espaco.s} />

          <Cartao>
            <TituloDeCartao>Preferências</TituloDeCartao>
            <Respiro altura={espaco.xs} />
            <Legenda>
              Cada tipo é uma chave separada — desligar um não desliga os
              outros. O lembrete de entrada é o que mais gente usa.
            </Legenda>
            <Separador />

            {dados.preferencias.map((pref, i) => (
              <View key={pref.tipo}>
                {i > 0 ? <View style={e.fio} /> : null}
                <View style={e.linhaPreferencia}>
                  <View style={e.preferenciaTexto}>
                    <Text style={e.preferenciaRotulo}>{pref.rotulo}</Text>
                    <Legenda>{pref.descricao}</Legenda>
                  </View>
                  <Interruptor
                    ligado={pref.ativo}
                    ocupado={salvando === pref.tipo}
                    rotulo={pref.rotulo}
                    aoTocar={() => { void alternar(pref) }}
                  />
                </View>
              </View>
            ))}
          </Cartao>
        </>
      ) : null}
    </Tela>
  )
}

function LinhaDoAviso({ aviso, aoTocar }: { aviso: Notificacao; aoTocar: () => void }) {
  const { cor, uso } = useTema()
  const e = useEstilos()

  return (
    <Pressable
      onPress={aoTocar}
      accessibilityRole={aviso.destino ? 'link' : 'button'}
      style={({ pressed }) => [e.linhaAviso, pressed && e.linhaTocada]}
    >
      {/* O ponto é o que diferencia não-lido de lido sem pintar a linha
          inteira — a lista fica legível mesmo com tudo novo. */}
      <View style={[e.ponto, { backgroundColor: aviso.lida ? 'transparent' : cor.acento500 }]} />

      <View style={e.avisoTexto}>
        <Text style={aviso.lida ? e.tituloLido : e.titulo} numberOfLines={2}>{aviso.titulo}</Text>
        <Text style={e.corpo} numberOfLines={3}>{aviso.corpo}</Text>
        <Legenda>{formatarBR(aviso.criadaEm, 'completo')}</Legenda>
      </View>

      {aviso.destino ? (
        <Icone nome="ChevronRight" tamanho={16} tom={uso.tintaFraca} />
      ) : null}
    </Pressable>
  )
}

/** Mesma régua do interruptor de `configuracoes.tsx`, que copia o do site. */
function Interruptor({
  ligado, ocupado, rotulo, aoTocar,
}: {
  ligado: boolean
  ocupado: boolean
  rotulo: string
  aoTocar: () => void
}) {
  const { cor, uso } = useTema()
  return (
    <Pressable
      onPress={aoTocar}
      disabled={ocupado}
      accessibilityRole="switch"
      accessibilityState={{ checked: ligado }}
      accessibilityLabel={rotulo}
      style={[
        estilosDoInterruptor.base,
        { backgroundColor: ligado ? cor.acento500 : uso.borda, opacity: ocupado ? 0.5 : 1 },
      ]}
    >
      <View style={[estilosDoInterruptor.bola, { transform: [{ translateX: ligado ? 18 : 2 }] }]} />
    </Pressable>
  )
}

const estilosDoInterruptor = StyleSheet.create({
  base: { width: 40, height: 22, borderRadius: raio.pilula, justifyContent: 'center' },
  bola: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#ffffff' },
})

function criarEstilos(cor: Tokens['cor'], uso: Tokens['uso']) {
  return StyleSheet.create({
    linhaAviso: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: espaco.s,
      paddingVertical: espaco.s,
    },
    linhaTocada: { opacity: 0.6 },
    ponto: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
    avisoTexto: { flex: 1, minWidth: 0 },
    titulo: { ...texto.corpoForte, color: uso.tinta },
    tituloLido: { ...texto.corpo, color: uso.tintaMedia },
    corpo: { ...texto.corpo, color: uso.tintaMedia, marginTop: 2 },

    linhaPreferencia: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: espaco.m,
      paddingVertical: espaco.s,
    },
    preferenciaTexto: { flex: 1, minWidth: 0 },
    preferenciaRotulo: { ...texto.corpoForte, color: uso.tinta },
    fio: { height: 1, backgroundColor: uso.borda },
  })
}

function useEstilos() {
  const { cor, uso } = useTema()
  return useMemo(() => criarEstilos(cor, uso), [cor, uso])
}
