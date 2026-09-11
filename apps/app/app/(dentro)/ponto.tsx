// Registrar ponto — a batida de quem perdeu o horário.
//
// É a cópia da tela "Registrar ponto" do sistema web (`/admin/localizar`), com
// as quatro regras que ela carrega:
//
//   1. BUSCA por CPF ou nome, tolerando até 2 dígitos errados no CPF, e só
//      dentro do alcance de quem procura. O supervisor não encontra gente de
//      outro setor.
//
//   2. ESCOLHA quando o nome bate com mais de uma pessoa — que é o caso comum.
//      Quem escolhe é quem está olhando para a pessoa, nunca o sistema.
//
//   3. FOTO obrigatória. É a única prova de que o colaborador estava na frente
//      de quem registrou. Sem ela, registrar por terceiro seria só digitar um
//      nome — e uma batida que ninguém consegue contestar é uma porta aberta.
//
//   4. A ETAPA O OPERADOR ESCOLHE — pré-marcada com a recomendação do sistema
//      (a primeira pendente), mas livre para trocar. Trazido do site em
//      11/09/2026: existia uma trava aqui ("o sistema decide sozinho"),
//      pensada contra erro; na operação real virou o problema oposto — sem QR
//      na hora, o que falta pode não ser a "próxima" que o sistema calcula, e
//      o operador não tinha como corrigir. Escolher uma etapa que já tem
//      registro SOBRESCREVE o horário — é correção, não duplicata.
//
// Junto com a batida ficam o nome de quem registrou, o horário, a localização e
// o aparelho. Nada disso pode ser alterado depois.

import { useState } from 'react'
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import * as Location from 'expo-location'
import { formatCpf, formatarBR } from '@credenciei/dominio'
import type { CandidatoLocalizado, FichaLocalizada, TipoBatida } from '@credenciei/contrato'
import { mascararIdentificador } from '../../src/campos'
import { mensagemDoErro } from '../../src/dados/pedido'
import { useSessao } from '../../src/sessao/contexto'
import { CameraDeRosto } from '../../src/ui/camera-de-rosto'
import {
  Aviso, Botao, Campo, Cartao, Corpo, Legenda, Respiro, Selo, Separador, Tela,
  TituloDaTela, TituloDeCartao,
} from '../../src/ui/componentes'
import { Icone } from '../../src/ui/icone'
import { cor, espaco, raio, texto, tipo, uso } from '../../src/ui/tema'

type Sucesso = { nome: string; etapa: string }

export default function RegistrarPonto() {
  const { cliente } = useSessao()

  const [termo, setTermo] = useState('')
  const [candidatos, setCandidatos] = useState<CandidatoLocalizado[] | null>(null)
  const [ficha, setFicha] = useState<FichaLocalizada | null>(null)
  // A etapa que o operador escolhe — pré-marcada com a recomendação do
  // sistema (proximaPendente), mas livre para trocar. Some quando a pessoa
  // já tem tudo registrado, e aí o operador escolhe manualmente qual corrigir.
  const [etapa, setEtapa] = useState<TipoBatida | null>(null)
  const [foto, setFoto] = useState<string | null>(null)
  const [camera, setCamera] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [buscando, setBuscando] = useState(false)
  const [registrando, setRegistrando] = useState(false)
  const [sucesso, setSucesso] = useState<Sucesso | null>(null)

  function abrirFicha(f: FichaLocalizada) {
    setFicha(f)
    setEtapa(f.proximaPendente?.tipo ?? null)
    setFoto(null)
  }

  function recomecar() {
    setTermo('')
    setCandidatos(null)
    setFicha(null)
    setEtapa(null)
    setFoto(null)
    setErro(null)
    setSucesso(null)
  }

  async function buscar() {
    setErro(null)
    setCandidatos(null)
    setFicha(null)
    setEtapa(null)
    setFoto(null)
    setBuscando(true)
    try {
      const r = await cliente.localizarPessoa(termo)
      if (r.erro) return setErro(r.erro)
      if (r.candidatos) return setCandidatos(r.candidatos)
      if (r.ficha) return abrirFicha(r.ficha)
    } catch (e) {
      setErro(mensagemDoErro(e))
    } finally {
      setBuscando(false)
    }
  }

  async function escolher(participacaoId: string) {
    setErro(null)
    setBuscando(true)
    try {
      const r = await cliente.abrirFicha(participacaoId)
      if (r.erro) return setErro(r.erro)
      setCandidatos(null)
      if (r.ficha) abrirFicha(r.ficha)
    } catch (e) {
      setErro(mensagemDoErro(e))
    } finally {
      setBuscando(false)
    }
  }

  async function registrar() {
    if (!ficha || !etapa || !foto) return
    setErro(null)
    setRegistrando(true)
    try {
      const onde = await ondeEstamos()
      const r = await cliente.registrarPresencaAssistida(ficha.participacaoId, {
        tipo: etapa,
        fotoBase64: foto,
        lat: onde?.lat,
        lng: onde?.lng,
        dispositivo: `${Platform.OS} ${Platform.Version}`,
      })
      if (r.erro) return setErro(r.erro)
      setSucesso({ nome: r.nome ?? ficha.nome, etapa: r.etapa ?? '' })
    } catch (e) {
      setErro(mensagemDoErro(e))
    } finally {
      setRegistrando(false)
    }
  }

  if (sucesso) {
    return (
      <Tela>
        <Cartao>
          <View style={e.sucesso}>
            <Icone nome="CheckCircle" tamanho={44} tom={cor.sucesso600} espessura={1.8} />
            <TituloDeCartao>Presença registrada</TituloDeCartao>
            <Corpo>
              <Corpo forte>{sucesso.nome}</Corpo> — {sucesso.etapa.toLowerCase()}
            </Corpo>
            <Legenda>
              O registro ficou marcado como feito por você, com a foto, o horário
              e a localização.
            </Legenda>
          </View>
          <Respiro />
          <Botao titulo="Registrar de outra pessoa" onPress={recomecar} />
        </Cartao>
      </Tela>
    )
  }

  return (
    <Tela>
      <TituloDaTela>Registrar ponto</TituloDaTela>
      <Legenda>
        A batida de quem perdeu o horário — busca por CPF ou nome, com foto na hora
      </Legenda>
      <Respiro />

      <Cartao>
        <Campo
          rotulo="CPF ou nome"
          value={termo}
          onChangeText={t => { setTermo(mascararIdentificador(t)); setErro(null) }}
          placeholder="000.000.000-00 ou Maria Silva"
          autoCorrect={false}
          autoCapitalize="words"
          onSubmitEditing={buscar}
          returnKeyType="search"
          ajuda="Você só localiza pessoas dos setores sob sua responsabilidade."
        />
        <Botao
          titulo="Buscar"
          onPress={buscar}
          ocupado={buscando}
          desabilitado={termo.trim().length < 3}
        />
      </Cartao>

      {erro ? <Aviso tipo="erro">{erro}</Aviso> : null}

      {candidatos ? (
        <>
          {candidatos[0]?.cpfAproximado ? (
            <Aviso tipo="aviso">
              Nenhum cadastro bate exatamente com esse CPF. Estas são as pessoas
              com CPF parecido (até 2 números diferentes) — confira o nome e o
              CPF salvo antes de escolher.
            </Aviso>
          ) : null}
          <Cartao semPadding>
            <Text style={e.cabecalhoDaLista}>
              {candidatos.length === 1 && !candidatos[0]?.cpfAproximado
                ? '1 pessoa encontrada'
                : `${candidatos.length} pessoas encontradas`} — toque em quem você está atendendo
            </Text>
            {candidatos.map((c, i) => (
              <View key={c.participacaoId}>
                {i > 0 ? <View style={e.fio} /> : null}
                <Pressable
                  onPress={() => escolher(c.participacaoId)}
                  disabled={buscando}
                  style={({ pressed }) => [e.candidato, pressed && e.candidatoTocado]}
                >
                  <Iniciais nome={c.nome} />
                  <View style={e.candidatoTexto}>
                    <View style={e.candidatoTopo}>
                      <Corpo forte>{c.nome}</Corpo>
                      {c.cpfAproximado ? <Selo texto="CPF parecido" tipo="aviso" /> : null}
                    </View>
                    <Legenda>{formatCpf(c.cpf)}{c.funcao ? ` · ${c.funcao}` : ''}</Legenda>
                    <Legenda>{c.setorNome} · {c.eventoNome}</Legenda>
                  </View>
                  <Icone nome="ChevronRight" tamanho={16} tom={cor.neutro400} />
                </Pressable>
              </View>
            ))}
          </Cartao>
        </>
      ) : null}

      {ficha ? (
        <>
          <FichaDaPessoa ficha={ficha} />

          {ficha.ativo ? (
            <>
              {/*
                Seletor de etapa — o operador escolhe, o sistema só sugere.
                Ver o comentário no topo do arquivo.
              */}
              <Cartao>
                <TituloDeCartao>Que batida é esta?</TituloDeCartao>
                <Respiro altura={espaco.m} />
                <View style={e.etapas}>
                  {ficha.etapas.map(et => {
                    const feita = !!et.quandoISO
                    const ativa = etapa === et.tipo
                    return (
                      <Pressable
                        key={et.tipo}
                        onPress={() => setEtapa(et.tipo)}
                        style={[e.etapa, ativa && e.etapaAtiva]}
                      >
                        <View style={e.etapaTopo}>
                          {feita ? <Icone nome="Check" tamanho={12} tom={cor.sucesso600} /> : null}
                          <Text style={e.etapaRotulo} numberOfLines={1}>{et.rotulo}</Text>
                        </View>
                        <Text style={e.etapaEstado}>
                          {feita ? formatarBR(et.quandoISO!, 'curto') : 'pendente'}
                        </Text>
                      </Pressable>
                    )
                  })}
                </View>
                {etapa && ficha.etapas.find(et => et.tipo === etapa)?.quandoISO ? (
                  <>
                    <Respiro altura={espaco.s} />
                    <Aviso tipo="aviso">
                      Esta etapa já tem registro — confirmar substitui o horário
                      anterior por agora.
                    </Aviso>
                  </>
                ) : null}
              </Cartao>

              <Cartao>
                <TituloDeCartao>Validar colaborador</TituloDeCartao>
                <Respiro altura={espaco.xs} />
                <Legenda>
                  Tire uma foto do rosto da pessoa agora. É ela que comprova que
                  o colaborador estava na sua frente.
                </Legenda>
                <Respiro />

                {foto ? (
                  <View style={e.fotoTirada}>
                    <View style={e.fotoMarca}>
                      <Icone nome="Check" tamanho={20} tom={cor.sucesso600} espessura={3} />
                    </View>
                    <View style={e.fotoTexto}>
                      <Corpo forte>Foto tirada</Corpo>
                      <Legenda>Ela vai junto com a batida, para sempre.</Legenda>
                    </View>
                    <Pressable onPress={() => setFoto(null)} style={e.tirarDeNovo}>
                      <Text style={e.tirarDeNovoTexto}>Tirar de novo</Text>
                    </Pressable>
                  </View>
                ) : (
                  <Pressable
                    onPress={() => setCamera(true)}
                    style={({ pressed }) => [e.abrirCamera, pressed && e.abrirCameraTocado]}
                  >
                    <Icone nome="Camera" tamanho={18} tom={cor.acento500} />
                    <Text style={e.abrirCameraTexto}>Abrir câmera</Text>
                  </Pressable>
                )}
              </Cartao>

              <Botao
                titulo={
                  etapa
                    ? `Registrar batida — ${ficha.etapas.find(et => et.tipo === etapa)?.rotulo}`
                    : 'Escolha a etapa acima'
                }
                onPress={registrar}
                ocupado={registrando}
                desabilitado={!etapa || !foto}
              />
              {etapa && !foto ? (
                <>
                  <Respiro altura={espaco.s} />
                  <Legenda>Tire a foto para liberar o registro.</Legenda>
                </>
              ) : null}
            </>
          ) : null}

          {!ficha.ativo ? (
            <Aviso tipo="erro">
              {ficha.nome} ainda não foi ativada no evento. Ative no painel do
              setor antes de registrar a presença.
            </Aviso>
          ) : null}

          <Separador />
          <Botao titulo="Buscar outra pessoa" onPress={recomecar} tipo="fantasma" />
        </>
      ) : null}

      <CameraDeRosto
        aberta={camera}
        aoFechar={() => setCamera(false)}
        aoTirar={base64 => { setFoto(base64); setCamera(false); setErro(null) }}
      />
    </Tela>
  )
}

// ─── A ficha ────────────────────────────────────────────────────────────────

/**
 * Quem é a pessoa, e o que falta bater.
 *
 * O quadro do fim é o que decide o que vai ser gravado — e ele é informativo,
 * não uma escolha. Quem opera confere que é a pessoa certa; o sistema decide a
 * etapa.
 */
function FichaDaPessoa({ ficha }: { ficha: FichaLocalizada }) {
  return (
    <Cartao>
      <View style={e.identidade}>
        <Iniciais nome={ficha.nome} grande />
        <View style={e.identidadeTexto}>
          <TituloDeCartao>{ficha.nome}</TituloDeCartao>
          <Legenda>{formatCpf(ficha.cpf)}</Legenda>
          <Respiro altura={espaco.xs} />
          <Selo
            texto={ficha.ativo ? 'Ativo' : 'Não ativado'}
            tipo={ficha.ativo ? 'sucesso' : 'erro'}
          />
        </View>
      </View>

      <Separador />

      <View style={e.grade}>
        <Dado icone="IdCard" rotulo="Função" valor={ficha.funcao || '—'} />
        <Dado icone="Building2" rotulo="Setor" valor={ficha.setorNome} />
        <Dado icone="ShieldCheck" rotulo="Supervisor" valor={ficha.supervisorNome || '—'} />
        <Dado
          icone="Clock"
          rotulo="Última batida"
          valor={ficha.ultimaBatida
            ? `${ficha.ultimaBatida.rotulo} · ${formatarBR(ficha.ultimaBatida.quandoISO, 'curto')}`
            : 'Nenhuma ainda'}
        />
        <Dado icone="MapPin" rotulo="Evento" valor={ficha.eventoNome} />
      </View>

      <Respiro altura={espaco.m} />

      <View style={[e.pendencia, ficha.proximaPendente ? e.pendenciaAberta : e.pendenciaFechada]}>
        <Text style={[e.pendenciaRotulo, ficha.proximaPendente ? e.tomAviso : e.tomOk]}>
          BATIDA PENDENTE
        </Text>
        <Text style={[e.pendenciaValor, ficha.proximaPendente ? e.tomAvisoForte : e.tomOkForte]}>
          {ficha.proximaPendente ? ficha.proximaPendente.rotulo : 'Nenhuma — tudo registrado'}
        </Text>
      </View>
    </Cartao>
  )
}

function Dado({ icone, rotulo, valor }: { icone: string; rotulo: string; valor: string }) {
  return (
    <View style={e.dado}>
      <View style={e.dadoRotulo}>
        <Icone nome={icone} tamanho={12} tom={uso.tintaFraca} />
        <Text style={e.dadoRotuloTexto}>{rotulo}</Text>
      </View>
      <Text style={e.dadoValor} numberOfLines={1}>{valor}</Text>
    </View>
  )
}

/** As iniciais, no lugar da foto que a maioria dos cadastros não tem. */
function Iniciais({ nome, grande }: { nome: string; grande?: boolean }) {
  const partes = nome.trim().split(/\s+/).filter(Boolean)
  const letras = partes.length > 1
    ? (partes[0]?.[0] ?? '') + (partes[partes.length - 1]?.[0] ?? '')
    : (partes[0] ?? '').slice(0, 2)

  return (
    <View style={[e.iniciais, grande && e.iniciaisGrande]}>
      <Text style={[e.iniciaisTexto, grande && e.iniciaisTextoGrande]}>
        {letras.toUpperCase() || '··'}
      </Text>
    </View>
  )
}

/**
 * Onde estamos, se o aparelho deixar.
 *
 * A localização é prova de auditoria, não requisito: se o GPS estiver negado ou
 * demorar, o registro segue sem ela. Barrar aqui deixaria alguém sem ponto por
 * causa de uma permissão de celular — e o problema que esta tela existe para
 * resolver é justamente o de quem já ficou sem registro.
 */
async function ondeEstamos(): Promise<{ lat: number; lng: number } | null> {
  try {
    const permissao = await Location.requestForegroundPermissionsAsync()
    if (!permissao.granted) return null
    const posicao = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    })
    return { lat: posicao.coords.latitude, lng: posicao.coords.longitude }
  } catch {
    return null
  }
}

const e = StyleSheet.create({
  sucesso: { alignItems: 'center', gap: espaco.s, paddingVertical: espaco.g },

  etapas: { flexDirection: 'row', gap: espaco.s },
  etapa: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: espaco.s,
    paddingVertical: espaco.m,
    borderRadius: raio.campo,
    borderWidth: 1,
    borderColor: uso.borda,
  },
  etapaAtiva: { borderColor: cor.acento500, backgroundColor: cor.acento50 },
  etapaTopo: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  etapaRotulo: { ...texto.xs, fontFamily: tipo.semi, color: uso.tinta, flexShrink: 1 },
  etapaEstado: { ...texto.xxs, color: uso.tintaFraca, marginTop: 2 },

  cabecalhoDaLista: {
    ...texto.xs,
    fontFamily: tipo.semi,
    color: uso.tintaMedia,
    backgroundColor: cor.neutro50,
    borderBottomWidth: 1,
    borderBottomColor: uso.borda,
    paddingHorizontal: espaco.g,
    paddingVertical: espaco.m,
  },
  fio: { height: 1, backgroundColor: uso.borda, marginLeft: 64 },
  candidato: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaco.m,
    paddingHorizontal: espaco.g,
    paddingVertical: espaco.m,
    minHeight: 68,
  },
  candidatoTocado: { backgroundColor: cor.neutro50 },
  candidatoTexto: { flex: 1, minWidth: 0 },
  candidatoTopo: { flexDirection: 'row', alignItems: 'center', gap: espaco.s, flexWrap: 'wrap' },

  identidade: { flexDirection: 'row', gap: espaco.m },
  identidadeTexto: { flex: 1, minWidth: 0 },

  iniciais: {
    width: 36,
    height: 36,
    borderRadius: raio.peca,
    backgroundColor: cor.acento50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iniciaisGrande: { width: 56, height: 56, borderRadius: raio.cartao },
  iniciaisTexto: { ...texto.corpoForte, color: cor.acento700 },
  iniciaisTextoGrande: { ...texto.xl, color: cor.acento700 },

  grade: { flexDirection: 'row', flexWrap: 'wrap', gap: espaco.m },
  dado: { width: '47%', flexGrow: 1, minWidth: 0 },
  dadoRotulo: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dadoRotuloTexto: { ...texto.xxs, color: uso.tintaFraca },
  dadoValor: { ...texto.corpoForte, color: cor.neutro700, marginTop: 2 },

  pendencia: { borderRadius: raio.campo, borderWidth: 1, padding: espaco.m },
  pendenciaAberta: { backgroundColor: cor.aviso50, borderColor: cor.aviso200 },
  pendenciaFechada: { backgroundColor: cor.sucesso50, borderColor: cor.sucesso200 },
  pendenciaRotulo: { ...texto.etiqueta },
  pendenciaValor: { ...texto.tituloCartao, marginTop: 2 },
  tomAviso: { color: cor.aviso600 },
  tomAvisoForte: { color: cor.aviso700 },
  tomOk: { color: cor.sucesso600 },
  tomOkForte: { color: cor.sucesso700 },

  abrirCamera: {
    minHeight: 64,
    borderRadius: raio.campo,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: cor.neutro300,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: espaco.s,
  },
  abrirCameraTocado: { borderColor: cor.acento500, backgroundColor: cor.acento50 },
  abrirCameraTexto: { ...texto.base, fontFamily: tipo.semi, color: cor.acento500 },

  fotoTirada: { flexDirection: 'row', alignItems: 'center', gap: espaco.m },
  fotoMarca: {
    width: 44,
    height: 44,
    borderRadius: raio.campo,
    backgroundColor: cor.sucesso50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fotoTexto: { flex: 1, minWidth: 0 },
  tirarDeNovo: { paddingHorizontal: espaco.s, paddingVertical: espaco.s },
  tirarDeNovoTexto: { ...texto.xs, fontFamily: tipo.semi, color: cor.erro600 },
})
