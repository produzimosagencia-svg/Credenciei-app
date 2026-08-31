// O cartaz da portaria.
//
// Um QR impresso e colado na entrada. Quem chega sem estar na lista aponta a
// câmera, escolhe o setor e se cadastra sozinho.
//
// ─── POR QUE ELE VIVE JUNTO DOS SETORES ─────────────────────────────────────
//
// Porque é deles que ele se alimenta: o cartaz manda para uma lista dos setores
// DESTE evento, e um setor criado depois aparece lá sozinho. Numa tela
// separada, seria fácil imprimir o cartaz antes de cadastrar os setores e não
// entender por que a página abre vazia.
//
// ─── O QUE MUDA NO CELULAR ──────────────────────────────────────────────────
//
// Imprimir é do computador. Aqui o que resolve é COMPARTILHAR: manda o endereço
// para quem está com a impressora, ou para o grupo da produção. O QR aparece na
// tela para conferência — e, no aperto, dá para apontar a câmera de outro
// aparelho direto para ele.

import { useState } from 'react'
import { Pressable, Share, StyleSheet, Text, View } from 'react-native'
import QRCode from 'react-native-qrcode-svg'
import * as Clipboard from 'expo-clipboard'
import type { Portaria } from '@credenciei/contrato'
import {
  Aviso, Botao, Cartao, Corpo, Legenda, Respiro, TituloDeCartao,
} from './componentes'
import { Icone } from './icone'
import { cor, espaco, raio, texto, tipo, uso } from './tema'

export function CartaoDaPortaria({
  portaria, ocupado, aoAlternar, aoTrocarQr,
}: {
  portaria: Portaria
  ocupado: boolean
  aoAlternar: (aberta: boolean) => void
  aoTrocarQr: () => void
}) {
  const [copiado, setCopiado] = useState(false)
  const [confirmandoTroca, setConfirmandoTroca] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function copiar() {
    if (!portaria.endereco) return
    try {
      await Clipboard.setStringAsync(portaria.endereco)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      setErro('Não conseguimos copiar. O endereço está na tela.')
    }
  }

  async function compartilhar() {
    if (!portaria.endereco) return
    try {
      await Share.share({
        message: `Cadastro na portaria do evento: ${portaria.endereco}`,
        url: portaria.endereco,
      })
    } catch {
      // A pessoa fechou a folha de compartilhamento. Não é erro.
    }
  }

  return (
    <Cartao>
      <View style={e.topo}>
        <View style={e.topoTexto}>
          <View style={e.titulo}>
            <Icone nome="QrCode" tamanho={16} tom={cor.acento500} />
            <TituloDeCartao>Cadastro na portaria</TituloDeCartao>
          </View>
          <Respiro altura={espaco.xs} />
          <Legenda>
            Um QR impresso na entrada. Quem chega sem estar na lista escaneia,
            escolhe o setor e se cadastra sozinho.
          </Legenda>
        </View>

        <Chave aberta={portaria.aberta} ocupado={ocupado} aoAlternar={aoAlternar} />
      </View>

      {erro ? (
        <>
          <Respiro altura={espaco.m} />
          <Aviso tipo="erro">{erro}</Aviso>
        </>
      ) : null}

      {!portaria.aberta ? (
        <>
          <Respiro altura={espaco.m} />
          <Legenda>
            {portaria.endereco
              // Já existiu: o cartaz impresso continua válido e volta a
              // funcionar ao religar. Dizer isso evita reimpressão à toa.
              ? 'Fechado. Os cartazes já impressos voltam a funcionar quando você abrir de novo.'
              : 'Ligue para gerar o QR Code e imprimir.'}
          </Legenda>
        </>
      ) : portaria.endereco ? (
        <>
          <Respiro altura={espaco.m} />

          <View style={e.cracha}>
            <View style={e.qr}>
              <QRCode value={portaria.endereco} size={96} backgroundColor="#ffffff" color={cor.neutro900} />
            </View>
            <View style={e.enderecoTexto}>
              <Text style={e.rotulo}>ENDEREÇO DO CARTAZ</Text>
              <Text style={e.endereco} selectable>{portaria.endereco}</Text>
            </View>
          </View>

          <Respiro altura={espaco.m} />
          <Botao titulo={copiado ? 'Copiado' : 'Copiar endereço'} onPress={copiar} tipo="secundario" />
          <Respiro altura={espaco.s} />
          <Botao titulo="Compartilhar para imprimir" onPress={compartilhar} tipo="acento" />

          <Respiro altura={espaco.m} />
          <View style={e.contagem}>
            <Icone nome="Users" tamanho={14} tom={uso.tintaFraca} />
            <Text style={e.contagemTexto}>
              <Text style={e.contagemNumero}>{portaria.cadastrados}</Text>
              {portaria.cadastrados === 1 ? ' pessoa entrou' : ' pessoas entraram'} por aqui
            </Text>
          </View>

          {/*
            Trocar o QR fica separado e discreto: é raro, e é destrutivo para
            todo cartaz já impresso.
          */}
          <View style={e.rodape}>
            {!confirmandoTroca ? (
              <Pressable onPress={() => setConfirmandoTroca(true)} style={e.linkDiscreto}>
                <Icone nome="RefreshCw" tamanho={12} tom={uso.tintaFraca} />
                <Text style={e.linkDiscretoTexto}>O QR vazou? Gerar um novo</Text>
              </Pressable>
            ) : (
              <>
                <Aviso tipo="aviso">
                  Todo cartaz já impresso para de funcionar. Quem já se cadastrou
                  não é afetado.
                </Aviso>
                <Botao
                  titulo="Gerar novo e reimprimir"
                  onPress={() => { setConfirmandoTroca(false); aoTrocarQr() }}
                  tipo="secundario"
                  desabilitado={ocupado}
                />
                <Respiro altura={espaco.s} />
                <Botao
                  titulo="Cancelar"
                  onPress={() => setConfirmandoTroca(false)}
                  tipo="fantasma"
                />
              </>
            )}
          </View>
        </>
      ) : null}
    </Cartao>
  )
}

/**
 * A chave de abrir e fechar.
 *
 * Diz "aberto" e "fechado" com a palavra, e não só com a posição: uma chave
 * sozinha obriga quem olha a lembrar de que lado é ligado — e no meio do evento
 * ninguém lembra.
 */
function Chave({
  aberta, ocupado, aoAlternar,
}: { aberta: boolean; ocupado: boolean; aoAlternar: (a: boolean) => void }) {
  return (
    <Pressable
      onPress={() => aoAlternar(!aberta)}
      disabled={ocupado}
      accessibilityRole="switch"
      accessibilityState={{ checked: aberta, disabled: ocupado }}
      style={({ pressed }) => [e.chave, pressed && { opacity: 0.7 }, ocupado && { opacity: 0.5 }]}
    >
      <View style={[e.trilho, aberta && e.trilhoAberto]}>
        <View style={[e.bolinha, aberta && e.bolinhaAberta]} />
      </View>
      <Text style={[e.chaveTexto, aberta && e.chaveTextoAberto]}>
        {aberta ? 'aberto' : 'fechado'}
      </Text>
    </Pressable>
  )
}

const e = StyleSheet.create({
  topo: { flexDirection: 'row', alignItems: 'flex-start', gap: espaco.m },
  topoTexto: { flex: 1, minWidth: 0 },
  titulo: { flexDirection: 'row', alignItems: 'center', gap: 6 },

  chave: { alignItems: 'center', gap: 4 },
  trilho: {
    width: 40,
    height: 24,
    borderRadius: 999,
    backgroundColor: cor.neutro300,
    padding: 3,
    justifyContent: 'center',
  },
  trilhoAberto: { backgroundColor: cor.sucesso600 },
  bolinha: { width: 18, height: 18, borderRadius: 999, backgroundColor: '#ffffff' },
  bolinhaAberta: { alignSelf: 'flex-end' },
  chaveTexto: { ...texto.xxs, fontFamily: tipo.semi, color: uso.tintaFraca },
  chaveTextoAberto: { color: cor.sucesso700 },

  cracha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaco.m,
    backgroundColor: cor.neutro50,
    borderWidth: 1,
    borderColor: uso.borda,
    borderRadius: raio.campo,
    padding: espaco.m,
  },
  qr: { backgroundColor: '#ffffff', borderRadius: raio.campoPequeno, padding: 6 },
  enderecoTexto: { flex: 1, minWidth: 0 },
  rotulo: { ...texto.etiqueta, color: uso.tintaFraca },
  endereco: { ...texto.xs, fontFamily: tipo.regular, color: cor.neutro700, marginTop: 2 },

  contagem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  contagemTexto: { ...texto.corpo, color: uso.tintaMedia },
  contagemNumero: { fontFamily: tipo.semi, color: uso.tinta },

  rodape: {
    marginTop: espaco.m,
    paddingTop: espaco.m,
    borderTopWidth: 1,
    borderTopColor: uso.borda,
  },
  linkDiscreto: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: espaco.xs },
  linkDiscretoTexto: { ...texto.xs, fontFamily: tipo.regular, color: uso.tintaFraca },
})
