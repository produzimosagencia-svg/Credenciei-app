// As planilhas: importar, baixar o modelo e exportar.
//
// ─── UM BOTÃO, TRÊS OPÇÕES ──────────────────────────────────────────────────
//
// São três operações da MESMA ideia — a equipe entrando ou saindo por arquivo.
// No computador elas cabem lado a lado; num celular, três botões na fileira já
// quebram a linha e empurram para baixo o que se usa o tempo todo.
//
// Um botão só, e as três opções dentro. Quem precisa de planilha abre e
// escolhe; quem não precisa nem vê.
//
// ─── O QUE ACONTECE EM CADA UMA, NO CELULAR ─────────────────────────────────
//
//   baixar o modelo   abre o arquivo no navegador do aparelho, que salva ou
//                     manda para o aplicativo de planilha instalado;
//   exportar          o servidor gera e devolve um endereço; o app oferece
//                     compartilhar — é assim que a planilha chega no WhatsApp
//                     do cliente sem passar por um computador;
//   importar          escolhe o arquivo pelo seletor do aparelho (incluindo o
//                     que veio anexado numa conversa) e manda para o servidor.

import { useState } from 'react'
import { Linking, Modal, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native'
import * as DocumentPicker from 'expo-document-picker'
import * as FileSystem from 'expo-file-system'
import type { ResultadoDaImportacao } from '@credenciei/contrato'
import { mensagemDoErro } from '../dados/pedido'
import { useSessao } from '../sessao/contexto'
import {
  Aviso, Botao, Cartao, Corpo, Legenda, Respiro, Tela, TituloDaTela,
  TituloDeCartao,
} from './componentes'
import { Icone } from './icone'
import { cor, espaco, raio, texto, tipo, uso } from './tema'

/** O verde do Excel. É o que faz o botão ser reconhecido sem escrever nada. */
const VERDE_DA_PLANILHA = '#217346'

export function BotaoDePlanilha({ setorId, aoImportar }: { setorId: string; aoImportar?: () => void }) {
  const [aberto, setAberto] = useState(false)

  return (
    <>
      <Pressable
        onPress={() => setAberto(true)}
        accessibilityRole="button"
        accessibilityLabel="Planilhas"
        style={({ pressed }) => [e.botao, pressed && e.botaoTocado]}
      >
        <Icone nome="FileSpreadsheet" tamanho={18} tom={VERDE_DA_PLANILHA} />
        <Text style={e.botaoTexto}>Planilha</Text>
      </Pressable>

      {aberto ? (
        <ModalDePlanilha
          setorId={setorId}
          aoFechar={() => setAberto(false)}
          aoImportar={aoImportar}
        />
      ) : null}
    </>
  )
}

function ModalDePlanilha({
  setorId, aoFechar, aoImportar,
}: {
  setorId: string
  aoFechar: () => void
  aoImportar?: () => void
}) {
  const { cliente } = useSessao()
  const [ocupado, setOcupado] = useState<'modelo' | 'exportar' | 'importar' | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [importacao, setImportacao] = useState<ResultadoDaImportacao | null>(null)

  async function baixarModelo() {
    setErro(null)
    setOcupado('modelo')
    try {
      const arquivo = await cliente.baixarModelo()
      await Linking.openURL(arquivo.url)
    } catch (e) {
      setErro(mensagemDoErro(e))
    } finally {
      setOcupado(null)
    }
  }

  async function exportar() {
    setErro(null)
    setOcupado('exportar')
    try {
      const arquivo = await cliente.exportarEquipe(setorId)
      /*
       * Compartilhar, e não baixar.
       *
       * No celular, "baixar" some numa pasta que ninguém acha. Compartilhar
       * abre a folha do sistema e a planilha vai direto para o WhatsApp do
       * cliente — que é o que se faz com ela no fechamento.
       */
      await Share.share({ message: `Equipe do setor — ${arquivo.nome}\n${arquivo.url}`, url: arquivo.url })
    } catch (e) {
      setErro(mensagemDoErro(e))
    } finally {
      setOcupado(null)
    }
  }

  async function importar() {
    setErro(null)
    setImportacao(null)
    setOcupado('importar')
    try {
      const escolha = await DocumentPicker.getDocumentAsync({
        // Aceita os três formatos que a importação entende. Sem o filtro, a
        // pessoa escolhe uma foto e só descobre o erro depois do envio.
        type: [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
          'text/csv',
        ],
        copyToCacheDirectory: true,
      })
      if (escolha.canceled) return

      const arquivo = escolha.assets[0]
      if (!arquivo) return

      const base64 = await FileSystem.readAsStringAsync(arquivo.uri, {
        encoding: FileSystem.EncodingType.Base64,
      })

      const r = await cliente.importarPlanilha(setorId, { nome: arquivo.name, base64 })
      if (r.erro) return setErro(r.erro)
      setImportacao(r.resultado ?? null)
      aoImportar?.()
    } catch (e) {
      setErro(mensagemDoErro(e))
    } finally {
      setOcupado(null)
    }
  }

  return (
    <Modal visible animationType="slide" onRequestClose={aoFechar}>
      <ScrollView style={e.fora} contentContainerStyle={e.conteudo}>
        <TituloDaTela>Planilha</TituloDaTela>
        <Legenda>A equipe deste setor entrando ou saindo por arquivo</Legenda>
        <Respiro />

        {erro ? <Aviso tipo="erro">{erro}</Aviso> : null}

        {importacao ? (
          <Cartao>
            <TituloDeCartao>Importação concluída</TituloDeCartao>
            <Respiro altura={espaco.m} />

            <Linha rotulo="Cadastrados" valor={importacao.criados} />
            <Linha rotulo="Atualizados" valor={importacao.atualizados} />
            <Linha rotulo="Ignorados" valor={importacao.ignorados} />

            {importacao.erros.length > 0 ? (
              <>
                <Respiro altura={espaco.m} />
                {/*
                  O que ficou de fora é a parte mais importante da tela. Uma
                  planilha com trinta linhas e duas erradas precisa importar as
                  vinte e oito e DIZER quais duas não entraram — recusar tudo
                  obriga a pessoa a caçar o erro sem pista nenhuma.
                */}
                <Aviso tipo="aviso">
                  {importacao.erros.length === 1
                    ? 'Uma linha ficou de fora:'
                    : `${importacao.erros.length} linhas ficaram de fora:`}
                </Aviso>
                {importacao.erros.map(m => (
                  <Text key={m} style={e.erroDeLinha}>· {m}</Text>
                ))}
              </>
            ) : null}
          </Cartao>
        ) : null}

        <Opcao
          icone="FileUp"
          titulo="Importar planilha"
          descricao="Cadastra a equipe de uma vez, a partir de um arquivo."
          ocupado={ocupado === 'importar'}
          desabilitado={ocupado !== null}
          aoTocar={importar}
        />

        <Opcao
          icone="Download"
          titulo="Baixar modelo"
          descricao="A planilha em branco, com as colunas que a importação espera."
          ocupado={ocupado === 'modelo'}
          desabilitado={ocupado !== null}
          aoTocar={baixarModelo}
        />

        <Opcao
          icone="FileDown"
          titulo="Exportar planilha"
          descricao="A equipe do setor em arquivo, pronta para mandar no WhatsApp."
          ocupado={ocupado === 'exportar'}
          desabilitado={ocupado !== null}
          aoTocar={exportar}
        />

        <Respiro />
        <Botao titulo="Fechar" onPress={aoFechar} tipo="secundario" />
      </ScrollView>
    </Modal>
  )
}

function Opcao({
  icone, titulo, descricao, ocupado, desabilitado, aoTocar,
}: {
  icone: string
  titulo: string
  descricao: string
  ocupado: boolean
  desabilitado: boolean
  aoTocar: () => void
}) {
  return (
    <Pressable
      onPress={aoTocar}
      disabled={desabilitado}
      accessibilityRole="button"
      style={({ pressed }) => [
        e.opcao,
        pressed && e.opcaoTocada,
        desabilitado && !ocupado && e.opcaoTravada,
      ]}
    >
      <View style={e.opcaoIcone}>
        <Icone nome={icone} tamanho={20} tom={VERDE_DA_PLANILHA} />
      </View>
      <View style={e.opcaoTexto}>
        <TituloDeCartao>{titulo}</TituloDeCartao>
        <Legenda>{ocupado ? 'Um instante…' : descricao}</Legenda>
      </View>
      <Icone nome="ChevronRight" tamanho={16} tom={uso.tintaFraca} />
    </Pressable>
  )
}

function Linha({ rotulo, valor }: { rotulo: string; valor: number }) {
  return (
    <View style={e.linha}>
      <Corpo>{rotulo}</Corpo>
      <Corpo forte>{valor}</Corpo>
    </View>
  )
}

const e = StyleSheet.create({
  botao: {
    minHeight: 44,
    paddingHorizontal: espaco.m,
    borderRadius: raio.campo,
    borderWidth: 1,
    borderColor: uso.borda,
    backgroundColor: uso.superficie,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  botaoTocado: { backgroundColor: cor.neutro50, borderColor: cor.neutro300 },
  botaoTexto: { ...texto.corpoForte, color: cor.neutro700 },

  fora: { flex: 1, backgroundColor: cor.fundo },
  conteudo: { padding: espaco.g, paddingTop: espaco.ggg, paddingBottom: espaco.gggg },

  opcao: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaco.m,
    backgroundColor: uso.superficie,
    borderWidth: 1,
    borderColor: uso.borda,
    borderRadius: raio.cartao,
    padding: espaco.g,
    marginBottom: espaco.m,
  },
  opcaoTocada: { backgroundColor: cor.neutro50 },
  opcaoTravada: { opacity: 0.45 },
  opcaoIcone: {
    width: 40,
    height: 40,
    borderRadius: raio.campo,
    backgroundColor: '#E8F3ED',
    alignItems: 'center',
    justifyContent: 'center',
  },
  opcaoTexto: { flex: 1, minWidth: 0 },

  linha: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: espaco.xs,
  },
  erroDeLinha: { ...texto.xs, fontFamily: tipo.regular, color: uso.tintaMedia, marginTop: 4 },
})
