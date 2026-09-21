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

import { useMemo, useState } from 'react'
import { Linking, Modal, Platform, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native'
import * as DocumentPicker from 'expo-document-picker'
// `readAsStringAsync` (mesmo pela entrada `/legacy`) não tem implementação
// na web — só funciona em iOS/Android. Achado testando a importação de
// verdade, 14/09/2026: sem isto, o import trava com "not available on web".
// No navegador, o próprio DocumentPicker já devolve o arquivo em base64
// (`asset.base64`, como data URL) — não precisa do FileSystem ali.
import * as FileSystem from 'expo-file-system/legacy'
import type { ResultadoDaImportacao } from '@credenciei/contrato'
import { mensagemDoErro } from '../dados/pedido'
import { useSessao } from '../sessao/contexto'
import { Aviso, Corpo, Legenda, Respiro, TituloDeCartao } from './componentes'
import { Icone } from './icone'
import { espaco, raio, texto, tipo } from './tema'
import { useTema, type Tokens } from './tema-contexto'

function criarEstilos(cor: Tokens['cor'], uso: Tokens['uso']) {
  return StyleSheet.create({
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
    botaoTocado: { backgroundColor: cor.neutro50, borderColor: uso.bordaForte },
    botaoTexto: { ...texto.corpoForte, color: uso.tintaMedia },

    /**
     * O gatilho como ícone sozinho — a mesma "linha-acao" do cabeçalho do
     * cartão do site (`w-8 h-8`, texto só no `aria-label`). Usado quando o
     * botão vem junto de "editar"/"excluir", e não sozinho na fileira de
     * ações — ver `FornecedorCard.tsx`.
     */
    gatilhoIcone: {
      width: 32,
      height: 32,
      borderRadius: raio.campo,
      alignItems: 'center',
      justifyContent: 'center',
    },
    gatilhoIconeTocado: { backgroundColor: cor.neutro100 },

    /*
     * Popup centralizado, não tela cheia — cópia do `fixed inset-0 ...
     * items-center` do site (`PlanilhaModal.tsx`). O mesmo fundo/caixa do
     * seletor de data (`data-hora.tsx`).
     */
    fundo: {
      flex: 1,
      backgroundColor: 'rgba(17,17,19,0.45)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: espaco.g,
    },
    caixa: {
      width: '100%',
      maxWidth: 420,
      maxHeight: '86%',
      backgroundColor: uso.superficie,
      borderRadius: raio.folha,
      overflow: 'hidden',
    },
    cabecalho: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: espaco.m,
      paddingHorizontal: espaco.g,
      paddingTop: espaco.g,
      paddingBottom: espaco.m,
      borderBottomWidth: 1,
      borderBottomColor: uso.borda,
    },
    cabecalhoTitulo: { flex: 1, minWidth: 0 },
    conteudo: { padding: espaco.g },

    opcao: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: espaco.m,
      backgroundColor: uso.superficie,
      borderWidth: 1,
      borderColor: uso.borda,
      borderRadius: raio.cartao,
      padding: espaco.m,
      marginBottom: espaco.s,
    },
    opcaoTocada: { backgroundColor: cor.neutro50 },
    opcaoTravada: { opacity: 0.45 },
    opcaoIcone: {
      width: 36,
      height: 36,
      borderRadius: raio.campo,
      backgroundColor: cor.acento50,
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
}

function useEstilos() {
  const { cor, uso } = useTema()
  return useMemo(() => criarEstilos(cor, uso), [cor, uso])
}

/** O verde do Excel. É o que faz o botão ser reconhecido sem escrever nada. */
const VERDE_DA_PLANILHA = '#217346'

export function BotaoDePlanilha({
  setorId, setorNome, aoImportar, icone,
}: {
  setorId: string
  /** Some no rodapé do popup — sem ele, quem tem vários setores abertos não sabe qual é qual. */
  setorNome?: string
  aoImportar?: () => void
  /**
   * Só o ícone, sem o rótulo "Planilha" — a mesma pílula `w-8 h-8` que o site
   * usa no cabeçalho do cartão do setor, ao lado de "editar". Ver
   * `FornecedorCard.tsx`.
   */
  icone?: boolean
}) {
  const e = useEstilos()
  const { uso } = useTema()
  const [aberto, setAberto] = useState(false)

  return (
    <>
      <Pressable
        onPress={() => setAberto(true)}
        accessibilityRole="button"
        accessibilityLabel={setorNome ? `Planilhas do setor ${setorNome}` : 'Planilhas'}
        style={({ pressed }) => icone
          ? [e.gatilhoIcone, pressed && e.gatilhoIconeTocado]
          : [e.botao, pressed && e.botaoTocado]}
      >
        <Icone nome="FileSpreadsheet" tamanho={icone ? 16 : 18} tom={icone ? uso.tintaFraca : VERDE_DA_PLANILHA} />
        {icone ? null : <Text style={e.botaoTexto}>Planilha</Text>}
      </Pressable>

      {aberto ? (
        <ModalDePlanilha
          setorId={setorId}
          setorNome={setorNome}
          aoFechar={() => setAberto(false)}
          aoImportar={aoImportar}
        />
      ) : null}
    </>
  )
}

function ModalDePlanilha({
  setorId, setorNome, aoFechar, aoImportar,
}: {
  setorId: string
  setorNome?: string
  aoFechar: () => void
  aoImportar?: () => void
}) {
  const { cliente } = useSessao()
  const { uso } = useTema()
  const e = useEstilos()
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
        // Só tem efeito na web (nativo ignora) — é o que evita precisar do
        // FileSystem ali, que não roda no navegador.
        base64: true,
      })
      if (escolha.canceled) return

      const arquivo = escolha.assets[0]
      if (!arquivo) return

      // Na web o DocumentPicker já devolve o conteúdo como data URL
      // ("data:...;base64,XXXX"); no app nativo ele só devolve o caminho do
      // arquivo, e quem lê é o FileSystem.
      const base64 = Platform.OS === 'web' && arquivo.base64
        ? arquivo.base64.split(',').pop()!
        : await FileSystem.readAsStringAsync(arquivo.uri, { encoding: FileSystem.EncodingType.Base64 })

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
    <Modal visible transparent animationType="fade" onRequestClose={aoFechar}>
      <Pressable style={e.fundo} onPress={aoFechar}>
        <Pressable style={e.caixa} onPress={() => {}}>
          {/* Cabeçalho — nome, subtítulo com o setor, X fecha. Cópia do
              `PlanilhaModal.tsx` do site: "Planilhas" + o setor embaixo. */}
          <View style={e.cabecalho}>
            <View style={e.cabecalhoTitulo}>
              <TituloDeCartao>Planilhas</TituloDeCartao>
              {setorNome ? <Legenda>{setorNome}</Legenda> : null}
            </View>
            <Pressable onPress={aoFechar} hitSlop={8} accessibilityLabel="Fechar" style={e.gatilhoIcone}>
              <Icone nome="X" tamanho={18} tom={uso.tintaMedia} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={e.conteudo}>
            {erro ? <Aviso tipo="erro">{erro}</Aviso> : null}

            {importacao ? (
              <View style={e.opcao}>
                <View style={{ flex: 1 }}>
                  <Corpo forte>Importação concluída</Corpo>
                  <Respiro altura={espaco.s} />

                  <Linha rotulo="Cadastrados" valor={importacao.criados} />
                  <Linha rotulo="Atualizados" valor={importacao.atualizados} />
                  <Linha rotulo="Ignorados" valor={importacao.ignorados} />

                  {importacao.erros.length > 0 ? (
                    <>
                      <Respiro altura={espaco.s} />
                      {/*
                        O que ficou de fora é a parte mais importante da tela.
                        Uma planilha com trinta linhas e duas erradas precisa
                        importar as vinte e oito e DIZER quais duas não
                        entraram — recusar tudo obriga a pessoa a caçar o erro
                        sem pista nenhuma.
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
                </View>
              </View>
            ) : null}

            {/*
              Os três rótulos são os do site (`ImportarFuncionarios`/
              `ExportarEquipe`, variante "item"): "Importar lista", "Baixar
              modelo" e "Lista de funcionários" — não os nomes genéricos que
              este app usava antes de comparar tela a tela, 13/09/2026.
            */}
            <Opcao
              icone="Upload"
              titulo={ocupado === 'importar' ? 'Importando…' : 'Importar lista'}
              descricao="Sobe uma planilha e cadastra a equipe de uma vez"
              ocupado={ocupado === 'importar'}
              desabilitado={ocupado !== null}
              aoTocar={importar}
            />

            <Opcao
              icone="Download"
              titulo="Baixar modelo"
              descricao="A planilha em branco, com as colunas certas"
              ocupado={ocupado === 'modelo'}
              desabilitado={ocupado !== null}
              aoTocar={baixarModelo}
            />

            <Opcao
              icone="FileDown"
              titulo="Lista de funcionários"
              descricao="Baixa a equipe deste setor em planilha"
              ocupado={ocupado === 'exportar'}
              desabilitado={ocupado !== null}
              aoTocar={exportar}
            />
          </ScrollView>
        </Pressable>
      </Pressable>
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
  const e = useEstilos()
  const { uso } = useTema()
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
  const e = useEstilos()
  return (
    <View style={e.linha}>
      <Corpo>{rotulo}</Corpo>
      <Corpo forte>{valor}</Corpo>
    </View>
  )
}
