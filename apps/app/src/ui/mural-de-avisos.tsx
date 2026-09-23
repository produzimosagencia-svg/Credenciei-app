// O mural — o aviso do evento que aparece por cima da tela ao entrar.
//
// Cópia do `components/AvisoExibicaoModal.tsx` do sistema web, e as escolhas
// de lá vieram junto porque cada uma nasceu de um problema:
//
// ─── CARA DE COMUNICADO, NÃO DE ERRO ────────────────────────────────────────
//
// Ícone de megafone e o laranja da marca, não vermelho, e um único botão
// "Entendi". É recado da produção, não algo que deu errado — vermelho faria
// quem abre o app no portão achar que perdeu o crachá.
//
// ─── UM DE CADA VEZ, COM CONTADOR ───────────────────────────────────────────
//
// Havendo mais de um, mostra "1 de 2" e avança a cada confirmação. Empilhar
// todos faria a pessoa rolar um muro de texto e tocar "Entendi" sem ler.
//
// ─── O BOTÃO NUNCA SAI DA TELA ──────────────────────────────────────────────
//
// Cabeçalho e rodapé ficam presos; só o TEXTO rola. No site o modal não tinha
// teto de altura, e com aviso longo — e os avisos do evento são longos, passo
// a passo de credenciamento — o "Entendi" era empurrado para fora. Quem
// estava na recepção ficou com a tela tampada e sem como fechar (relato do
// Juan, 03/09/2026). No celular o problema seria pior: a tela é menor.
//
// ─── FALHAR AO MARCAR "VISTO" NÃO TRANCA NINGUÉM ────────────────────────────
//
// Se a chamada de "visualizei" falhar, a pessoa avança do mesmo jeito: ela já
// LEU, que é o que importa. Na pior das hipóteses o aviso aparece de novo no
// próximo acesso — melhor do que prender alguém atrás de um modal por causa
// da rede do evento.

import { useEffect, useMemo, useState } from 'react'
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native'
import type { AvisoPendente } from '@credenciei/contrato'
import { useSessao } from '../sessao/contexto'
import { Icone } from './icone'
import { Botao } from './componentes'
import { espaco, raio, texto, tipo } from './tema'
import { useTema, type Tokens } from './tema-contexto'

export function MuralDeAvisos({ eventoId }: { eventoId: string }) {
  const { cliente } = useSessao()
  const { cor } = useTema()
  const e = useEstilos()

  const [avisos, setAvisos] = useState<AvisoPendente[]>([])
  const [indice, setIndice] = useState(0)
  const [confirmando, setConfirmando] = useState(false)

  /*
   * Buscado aqui e não por `usePedido`: um aviso que não carrega não é erro
   * de tela — é um recado que não veio. A credencial atrás dele continua
   * servindo, e ela é o motivo de a pessoa ter aberto o app.
   */
  useEffect(() => {
    let vivo = true
    setAvisos([])
    setIndice(0)
    cliente.avisosPendentes(eventoId)
      .then(lista => { if (vivo) setAvisos(lista) })
      .catch(() => {})
    return () => { vivo = false }
  }, [cliente, eventoId])

  const aviso = avisos[indice]
  if (!aviso) return null

  async function confirmar() {
    if (!aviso) return
    setConfirmando(true)
    try {
      await cliente.marcarAvisoVisto(aviso.id)
    } catch {
      // Ver o cabeçalho: ela já leu. Não trancar por causa disto.
    } finally {
      setConfirmando(false)
      setIndice(i => i + 1)
    }
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => setIndice(i => i + 1)}>
      <View style={e.fundo}>
        <View style={e.caixa}>
          <View style={e.cabecalho}>
            <Icone nome="Megaphone" tamanho={16} tom={cor.sobreEscuro} />
            <Text style={e.cabecalhoTexto}>AVISO IMPORTANTE</Text>
            {avisos.length > 1 ? (
              <Text style={e.contador}>{indice + 1} de {avisos.length}</Text>
            ) : null}
          </View>

          <ScrollView style={e.rolagem} contentContainerStyle={e.rolagemConteudo}>
            <Text style={e.titulo}>{aviso.titulo}</Text>
            <Text style={e.mensagem}>{aviso.mensagem}</Text>
          </ScrollView>

          <View style={e.rodape}>
            <Botao
              titulo={confirmando ? 'Um instante…' : 'Entendi'}
              ocupado={confirmando}
              onPress={() => { void confirmar() }}
            />
          </View>
        </View>
      </View>
    </Modal>
  )
}

function criarEstilos(cor: Tokens['cor'], uso: Tokens['uso']) {
  return StyleSheet.create({
    fundo: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: espaco.m,
    },
    caixa: {
      width: '100%',
      maxWidth: 420,
      // Teto de altura é o que mantém o rodapé na tela — ver o cabeçalho.
      maxHeight: '85%',
      borderRadius: raio.cartao,
      backgroundColor: uso.superficie,
      overflow: 'hidden',
    },

    cabecalho: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: espaco.s,
      paddingHorizontal: espaco.m,
      paddingVertical: espaco.s,
      backgroundColor: cor.acento600,
    },
    cabecalhoTexto: {
      ...texto.xs,
      fontFamily: tipo.forte,
      color: cor.sobreEscuro,
      letterSpacing: 1,
    },
    contador: { ...texto.xs, fontFamily: tipo.regular, color: cor.sobreEscuro, marginLeft: 'auto' },

    rolagem: { flexGrow: 0 },
    rolagemConteudo: { paddingHorizontal: espaco.m, paddingVertical: espaco.m },
    titulo: { ...texto.corpoForte, color: uso.tinta },
    mensagem: { ...texto.corpo, color: uso.tintaMedia, marginTop: espaco.xs },

    rodape: {
      paddingHorizontal: espaco.m,
      paddingVertical: espaco.s,
      borderTopWidth: 1,
      borderTopColor: uso.borda,
    },
  })
}

function useEstilos() {
  const { cor, uso } = useTema()
  return useMemo(() => criarEstilos(cor, uso), [cor, uso])
}
