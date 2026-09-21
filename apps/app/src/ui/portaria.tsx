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

import { useMemo, useState } from 'react'
import { Modal, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import QRCode from 'react-native-qrcode-svg'
import * as Clipboard from 'expo-clipboard'
import type { LinkCadastroIndividual, Portaria } from '@credenciei/contrato'
import {
  Aviso, Botao, Cartao, Corpo, Legenda, Respiro, TituloDeCartao,
} from './componentes'
import { Icone } from './icone'
import { ALVO_MINIMO, espaco, gradienteMarca, raio, texto, tipo } from './tema'
import { useTema, type Tokens } from './tema-contexto'

function criarEstilos(cor: Tokens['cor'], uso: Tokens['uso']) {
  return StyleSheet.create({
    topo: { flexDirection: 'row', alignItems: 'flex-start', gap: espaco.m },
    topoTexto: { flex: 1, minWidth: 0 },
    titulo: { flexDirection: 'row', alignItems: 'center', gap: 6 },

    chave: { alignItems: 'center', gap: 4 },
    trilho: {
      width: 40,
      height: 24,
      borderRadius: 999,
      backgroundColor: uso.bordaForte,
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
    endereco: { ...texto.xs, fontFamily: tipo.regular, color: uso.tintaMedia, marginTop: 2 },

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

    /*
     * O botão que abre o cartaz — pedido do Juan, 13/09/2026: o QR, o
     * endereço e os dois botões de ação ficavam sempre abertos na tela,
     * ocupando espaço mesmo pra quem só quer conferir se a portaria está
     * ligada. Agora moram num modal; o botão na cor de ação do sistema.
     */
    verCartazBotao: {
      minHeight: ALVO_MINIMO,
      borderRadius: raio.campo,
      flexDirection: 'row',
      alignItems: 'center',
      gap: espaco.s,
      paddingHorizontal: espaco.g,
    },
    verCartazTexto: { ...texto.corpoForte, color: '#ffffff', flex: 1, minWidth: 0 },
    verCartazContagem: {
      backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: raio.pilula, paddingHorizontal: espaco.s, paddingVertical: 2,
    },
    verCartazContagemTexto: { ...texto.xs, fontFamily: tipo.forte, color: '#ffffff' },

    modalFundo: {
      flex: 1, backgroundColor: 'rgba(17,17,19,0.45)', alignItems: 'center', justifyContent: 'center', padding: espaco.g,
    },
    modalCaixa: {
      width: '100%', maxWidth: 420, maxHeight: '86%', backgroundColor: uso.superficie, borderRadius: raio.folha, overflow: 'hidden',
    },
    modalCabecalho: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: espaco.m,
      paddingHorizontal: espaco.g, paddingTop: espaco.g, paddingBottom: espaco.m,
      borderBottomWidth: 1, borderBottomColor: uso.borda,
    },
    modalConteudo: { padding: espaco.g },

    cadastroLink: {
      backgroundColor: uso.superficie,
      borderWidth: 1,
      borderColor: uso.borda,
      borderRadius: raio.cartao,
      padding: espaco.g,
      marginBottom: espaco.m,
    },
    cadastroLinkSuspenso: { backgroundColor: cor.aviso50, borderColor: cor.aviso200 },
    cadastroLinkTopo: { flexDirection: 'row', alignItems: 'flex-start', gap: espaco.m },
    cadastroLinkIcone: {
      width: 32, height: 32, borderRadius: raio.campo, alignItems: 'center', justifyContent: 'center',
    },

    linkIndividualAbrir: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' },
    linkIndividualTexto: { ...texto.xs, fontFamily: tipo.forte, color: cor.acento600 },
    linkIndividualPainel: {
      backgroundColor: cor.fundo, borderRadius: raio.campo, borderWidth: 1, borderColor: uso.borda, padding: espaco.m,
    },
    linkIndividualSetorBotao: {
      flexDirection: 'row', alignItems: 'center', gap: espaco.s,
      borderWidth: 1, borderColor: uso.borda, borderRadius: raio.campo,
      paddingHorizontal: espaco.m, paddingVertical: espaco.s,
      backgroundColor: uso.superficie,
    },
    linkIndividualSetorTexto: { ...texto.corpo, fontFamily: tipo.regular, color: uso.tinta, flex: 1 },
    linkIndividualResultado: {
      backgroundColor: cor.sucesso50, borderWidth: 1, borderColor: cor.sucesso200,
      borderRadius: raio.campo, padding: espaco.m, gap: 4,
    },
    linkIndividualLinhaDeSetor: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: espaco.s,
      paddingVertical: espaco.s, borderBottomWidth: 1, borderBottomColor: uso.borda,
    },
  })
}

function useEstilos() {
  const { cor, uso } = useTema()
  return { e: useMemo(() => criarEstilos(cor, uso), [cor, uso]), cor, uso }
}

export function CartaoDaPortaria({
  portaria, ocupado, aoAlternar, aoTrocarQr,
}: {
  portaria: Portaria
  ocupado: boolean
  aoAlternar: (aberta: boolean) => void
  aoTrocarQr: () => void
}) {
  const { e, cor, uso } = useEstilos()
  const [copiado, setCopiado] = useState(false)
  const [confirmandoTroca, setConfirmandoTroca] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [modalAberto, setModalAberto] = useState(false)

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

          {/*
            * O QR, o endereço e as ações moram no modal — pedido do Juan,
            * 13/09/2026: ficavam sempre abertos no card, mesmo pra quem só
            * queria conferir se a portaria estava ligada. O botão mostra
            * quantos já entraram por aqui, na cor de ação do sistema.
            */}
          <Pressable onPress={() => setModalAberto(true)} accessibilityRole="button">
            <LinearGradient
              colors={[...gradienteMarca.cores] as [string, string, string]}
              locations={[...gradienteMarca.posicoes] as [number, number, number]}
              start={gradienteMarca.inicio}
              end={gradienteMarca.fim}
              style={[e.verCartazBotao, gradienteMarca.sombra]}
            >
              <Icone nome="QrCode" tamanho={16} tom="#ffffff" />
              <Text style={e.verCartazTexto} numberOfLines={1}>Ver cartaz da portaria</Text>
              <View style={e.verCartazContagem}>
                <Text style={e.verCartazContagemTexto}>{portaria.cadastrados}</Text>
              </View>
            </LinearGradient>
          </Pressable>

          <Modal visible={modalAberto} transparent animationType="fade" onRequestClose={() => setModalAberto(false)}>
            <Pressable style={e.modalFundo} onPress={() => setModalAberto(false)}>
              <Pressable style={e.modalCaixa} onPress={() => {}}>
                <View style={e.modalCabecalho}>
                  <TituloDeCartao>Cartaz da portaria</TituloDeCartao>
                  <Pressable onPress={() => setModalAberto(false)} hitSlop={8} accessibilityLabel="Fechar">
                    <Icone nome="X" tamanho={20} tom={uso.tintaMedia} />
                  </Pressable>
                </View>

                <ScrollView contentContainerStyle={e.modalConteudo}>
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
                    Trocar o QR fica separado e discreto: é raro, e é
                    destrutivo para todo cartaz já impresso.
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
                          Todo cartaz já impresso para de funcionar. Quem já se
                          cadastrou não é afetado.
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
                </ScrollView>
              </Pressable>
            </Pressable>
          </Modal>
        </>
      ) : null}
    </Cartao>
  )
}

/**
 * O interruptor do cadastro por link — cópia do site's `CadastroPorLinkCard`,
 * 13/09/2026. Os links dos setores circulam em grupo de WhatsApp e não têm
 * como ser "recolhidos"; suspender aqui faz TODOS os formulários do evento e
 * o cartaz da portaria recusarem cadastro novo de uma vez, sem trocar link
 * nenhum e sem mexer em quem já está dentro. Reabrir é o mesmo botão.
 *
 * Simplificação conhecida: o site também deixa o master reabrir um cadastro
 * individual por 48h enquanto o geral segue fechado — este cartão ainda não
 * tem esse caminho.
 */
export function CartaoDeCadastroPorLink({
  suspenso, ocupado, aoAlternar, podeReabrirIndividual = false, setores = [], aoGerarLinkIndividual,
}: {
  suspenso: boolean
  ocupado: boolean
  aoAlternar: (suspenso: boolean) => void
  /** Só o master reabre um cadastro individual — ver `criarLinkCadastroIndividual`. */
  podeReabrirIndividual?: boolean
  setores?: { setorId: string; nome: string }[]
  aoGerarLinkIndividual?: (setorId: string) => Promise<{ resultado?: LinkCadastroIndividual; erro?: string }>
}) {
  const { e, cor, uso } = useEstilos()
  const [confirmando, setConfirmando] = useState(false)
  const [mostrandoIndividual, setMostrandoIndividual] = useState(false)
  const [modalSetorAberto, setModalSetorAberto] = useState(false)
  const [setorEscolhido, setSetorEscolhido] = useState<{ setorId: string; nome: string } | null>(null)
  const [gerando, setGerando] = useState(false)
  const [erroIndividual, setErroIndividual] = useState<string | null>(null)
  const [resultado, setResultado] = useState<LinkCadastroIndividual | null>(null)
  const [copiado, setCopiado] = useState(false)

  async function gerar() {
    if (!setorEscolhido || !aoGerarLinkIndividual) return
    setErroIndividual(null)
    setGerando(true)
    try {
      const r = await aoGerarLinkIndividual(setorEscolhido.setorId)
      if (r.erro) return setErroIndividual(r.erro)
      setResultado(r.resultado ?? null)
    } finally {
      setGerando(false)
    }
  }

  async function copiarLinkIndividual() {
    if (!resultado) return
    try {
      await Clipboard.setStringAsync(resultado.link)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 4000)
    } catch {
      // O link continua na tela — dá pra copiar à mão.
    }
  }

  return (
    <View style={[e.cadastroLink, suspenso && e.cadastroLinkSuspenso]}>
      <View style={e.cadastroLinkTopo}>
        <View style={[e.cadastroLinkIcone, { backgroundColor: suspenso ? cor.aviso50 : cor.acento50 }]}>
          <Icone nome={suspenso ? 'PowerOff' : 'Power'} tamanho={16} tom={suspenso ? cor.aviso600 : cor.acento500} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Corpo forte>Cadastro por link {suspenso ? 'suspenso' : 'aberto'}</Corpo>
          <Legenda>
            {suspenso
              ? 'Os links dos setores e o cartaz da portaria estão recusando cadastro novo. Quem já está na equipe continua normal.'
              : 'Suspenda quando a lista fechar — os links dos setores e o cartaz da portaria continuam os mesmos.'}
          </Legenda>
        </View>
      </View>

      <Respiro altura={espaco.s} />

      {!confirmando ? (
        <Botao
          titulo={suspenso ? 'Reabrir cadastro' : 'Suspender cadastro'}
          onPress={() => (suspenso ? aoAlternar(false) : setConfirmando(true))}
          tipo={suspenso ? 'primario' : 'secundario'}
          ocupado={ocupado}
        />
      ) : (
        <>
          <Aviso tipo="aviso">Ninguém mais consegue se cadastrar por link neste evento.</Aviso>
          <Respiro altura={espaco.s} />
          <Botao
            titulo="Suspender cadastro"
            tipo="perigo"
            ocupado={ocupado}
            onPress={() => { aoAlternar(true); setConfirmando(false) }}
          />
          <Respiro altura={espaco.s} />
          <Botao titulo="Cancelar" tipo="fantasma" onPress={() => setConfirmando(false)} desabilitado={ocupado} />
        </>
      )}

      {/*
        * Exceção do master: reabre UM setor por 48h sem religar o link
        * geral — o caso de alguém precisar entrar depois de a lista já ter
        * fechado. Cópia do site's "Reabrir para uma pessoa".
        */}
      {podeReabrirIndividual ? (
        <>
          <Respiro altura={espaco.s} />
          {!mostrandoIndividual ? (
            <Pressable onPress={() => setMostrandoIndividual(true)} style={e.linkIndividualAbrir}>
              <Icone nome="UserCheck" tamanho={12} tom={cor.acento600} />
              <Text style={e.linkIndividualTexto}>Reabrir para uma pessoa</Text>
            </Pressable>
          ) : (
            <View style={e.linkIndividualPainel}>
              <Corpo forte>Reabrir um cadastro individual</Corpo>
              <Legenda>
                Escolha o setor. O link geral continua fechado e o novo endereço aceita cadastros por 48 horas.
              </Legenda>
              <Respiro altura={espaco.s} />

              <Pressable onPress={() => setModalSetorAberto(true)} accessibilityRole="button" style={e.linkIndividualSetorBotao}>
                <Icone nome="Building2" tamanho={14} tom={uso.tintaMedia} />
                <Text style={e.linkIndividualSetorTexto} numberOfLines={1}>
                  {setorEscolhido?.nome ?? 'Selecionar setor'}
                </Text>
                <Icone nome="ChevronRight" tamanho={14} tom={uso.tintaFraca} />
              </Pressable>

              <Respiro altura={espaco.s} />
              {erroIndividual ? <Aviso tipo="erro">{erroIndividual}</Aviso> : null}

              {resultado ? (
                <>
                  <View style={e.linkIndividualResultado}>
                    <Legenda>{resultado.setorNome} · expira em 48h</Legenda>
                    <Text style={e.endereco} selectable>{resultado.link}</Text>
                  </View>
                  <Respiro altura={espaco.s} />
                  <Botao
                    titulo={copiado ? 'Link copiado' : 'Copiar link'}
                    onPress={copiarLinkIndividual}
                    tipo="secundario"
                  />
                </>
              ) : (
                <Botao
                  titulo="Gerar link individual"
                  onPress={gerar}
                  ocupado={gerando}
                  desabilitado={!setorEscolhido}
                  tipo="secundario"
                />
              )}

              <Respiro altura={espaco.s} />
              <Botao
                titulo="Fechar"
                tipo="fantasma"
                onPress={() => {
                  setMostrandoIndividual(false); setSetorEscolhido(null); setResultado(null); setErroIndividual(null)
                }}
              />
            </View>
          )}

          <Modal visible={modalSetorAberto} transparent animationType="fade" onRequestClose={() => setModalSetorAberto(false)}>
            <Pressable style={e.modalFundo} onPress={() => setModalSetorAberto(false)}>
              <Pressable style={e.modalCaixa} onPress={() => {}}>
                <View style={e.modalCabecalho}>
                  <TituloDeCartao>Selecionar setor</TituloDeCartao>
                  <Pressable onPress={() => setModalSetorAberto(false)} hitSlop={8} accessibilityLabel="Fechar">
                    <Icone nome="X" tamanho={20} tom={uso.tintaMedia} />
                  </Pressable>
                </View>
                <ScrollView contentContainerStyle={e.modalConteudo}>
                  {setores.map(s => (
                    <Pressable
                      key={s.setorId}
                      onPress={() => { setSetorEscolhido(s); setResultado(null); setModalSetorAberto(false) }}
                      style={e.linkIndividualLinhaDeSetor}
                    >
                      <Text style={e.linkIndividualSetorTexto} numberOfLines={1}>{s.nome}</Text>
                      {s.setorId === setorEscolhido?.setorId ? <Icone nome="Check" tamanho={16} tom={cor.acento600} /> : null}
                    </Pressable>
                  ))}
                </ScrollView>
              </Pressable>
            </Pressable>
          </Modal>
        </>
      ) : null}
    </View>
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
  const { e } = useEstilos()
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

