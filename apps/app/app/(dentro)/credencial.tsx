// Minha credencial — o crachá e o ponto do colaborador.
//
// É a tela que a pessoa abre no portão. No sistema web ela chega por um link no
// WhatsApp (`/credential/[token]`); aqui é uma tela do app, com a mesma lógica.
//
// ─── QUEM REGISTRA O QUÊ ────────────────────────────────────────────────────
//
//   entrada e saída   pelo QR, no portão. Quem credencia lê o código e vê NOME,
//                     setor e função na tela — é essa conferência humana que
//                     impede o crachá emprestado.
//
//   o meio            a própria pessoa, com selfie, aqui. É a etapa que prova
//                     que ela continuou no evento, e não faria sentido outra
//                     pessoa registrar por ela no portão.
//
// ─── O MEIO PASSA PELA FILA, E NÃO DIRETO PELA REDE ─────────────────────────
//
// Porque ele acontece no meio do evento, com mil pessoas no mesmo sinal. A
// batida é gravada no aparelho na hora, com o horário do aparelho, e sobe
// quando der. O que a pessoa vê é "registrado" imediatamente — porque foi.

import { useEffect, useState } from 'react'
import { AppState, Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import QRCode from 'react-native-qrcode-svg'
import * as Location from 'expo-location'
import { diaBRT, formatarBR, janelaMeio, NOME_DA_FASE } from '@credenciei/dominio'
import type { DiaDaParticipacao, ResumoParticipacao, TipoBatida } from '@credenciei/contrato'
import type { BatidaPendente } from '@credenciei/offline'
import { usePedido } from '../../src/dados/pedido'
import { useFila } from '../../src/fila/contexto'
import { useSessao } from '../../src/sessao/contexto'
import { CameraDeRosto } from '../../src/ui/camera-de-rosto'
import {
  Aviso, Botao, Carregando, Cartao, Corpo, Legenda, Respiro, Selo, Tela,
  TituloDaTela, TituloDeCartao,
} from '../../src/ui/componentes'
import { Icone } from '../../src/ui/icone'
import { cor, corDaEtapa, espaco, raio, texto, tipo, uso } from '../../src/ui/tema'

const ROTULO: Record<TipoBatida, string> = { entrada: 'Entrada', meio: 'Meio', fim: 'Saída' }

export default function Credencial() {
  const { cliente } = useSessao()
  const fila = useFila()
  const [camera, setCamera] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const { pedido, recarregar } = usePedido(async () => {
    const participacoes = await cliente.minhasParticipacoes()
    // A que está acontecendo. Sem ela, a primeira — a pessoa que só tem evento
    // futuro ainda quer ver a credencial dele.
    const p = participacoes.find(x => x.emAndamento) ?? participacoes[0]
    if (!p) return null

    const [qr, dias] = await Promise.all([
      cliente.meuQr(p.participacaoId),
      cliente.meusDias(p.participacaoId),
    ])
    return { participacao: p, qr, dias }
  }, [cliente])

  const dados = pedido.estado === 'pronto' ? pedido.dados : null
  const hoje = diaBRT(new Date())
  const diaDeHoje = dados?.dias.find(d => d.data === hoje) ?? null

  /** O que a fila tem para esta participação e ainda não subiu. */
  const naFila = dados
    ? fila.itens.filter(
        i => i.participacaoId === dados.participacao.participacaoId && i.estado !== 'enviada',
      )
    : []

  async function registrarMeio(foto: string) {
    setErro(null)
    if (!dados) return
    const onde = await ondeEstamos()
    await fila.bater({
      participacaoId: dados.participacao.participacaoId,
      tipo: 'meio',
      foto,
      ...(onde ? { lat: onde.lat, lng: onde.lng } : {}),
    })
  }

  return (
    <Tela>
      <TituloDaTela>Minha credencial</TituloDaTela>

      {pedido.estado === 'carregando' ? <Carregando /> : null}

      {pedido.estado === 'falhou' ? (
        <>
          <Respiro />
          <Aviso tipo="erro">{pedido.mensagem}</Aviso>
          <Botao titulo="Tentar de novo" onPress={recarregar} tipo="secundario" />
        </>
      ) : null}

      {pedido.estado === 'pronto' && !dados ? (
        <>
          <Respiro />
          <Cartao>
            <Corpo>
              Você ainda não está em nenhum evento. Quando entrar em um, a sua
              credencial aparece aqui.
            </Corpo>
          </Cartao>
        </>
      ) : null}

      {dados ? (
        <>
          <Legenda>{dados.participacao.eventoNome}</Legenda>
          <Respiro />

          <CartaoDoQr codigo={dados.qr.codigo} etapa={dados.qr.etapa} />

          <Respiro altura={espaco.s} />
          <TituloDeCartao>Hoje</TituloDeCartao>
          <Legenda>
            {diaDeHoje
              ? `${formatarBR(`${hoje}T12:00:00-03:00`, 'data')} · ${NOME_DA_FASE[diaDeHoje.etapa]}`
              : 'Hoje não é dia de trabalho neste evento'}
          </Legenda>
          <Respiro altura={espaco.s} />

          {erro ? <Aviso tipo="erro">{erro}</Aviso> : null}

          {diaDeHoje ? (
            <>
              <EtapaDoDia
                tipo="entrada"
                feitoEm={diaDeHoje.entrada}
                naFila={naFila.find(i => i.tipo === 'entrada')}
                instrucao="Mostre o QR acima no credenciamento."
              />

              <EtapaDoMeio
                dia={diaDeHoje}
                naFila={naFila.find(i => i.tipo === 'meio')}
                aoRegistrar={() => setCamera(true)}
                aoDescartar={id => { void fila.descartar(id) }}
              />

              <EtapaDoDia
                tipo="fim"
                feitoEm={diaDeHoje.saida}
                naFila={naFila.find(i => i.tipo === 'fim')}
                instrucao="Mostre o QR acima na saída."
              />
            </>
          ) : (
            <Cartao>
              <Corpo>
                Este evento não tem trabalho marcado para hoje. O QR acima
                continua sendo o seu — ele muda quando muda a etapa do evento.
              </Corpo>
            </Cartao>
          )}
        </>
      ) : null}

      <CameraDeRosto
        aberta={camera}
        aoFechar={() => setCamera(false)}
        aoTirar={foto => { setCamera(false); void registrarMeio(foto) }}
      />
    </Tela>
  )
}

// ─── O QR ───────────────────────────────────────────────────────────────────

/**
 * O crachá.
 *
 * ─── SOBRE O QUE ESCONDER PROTEGE, E O QUE NÃO ─────────────────────────────
 *
 * O QR some quando o app sai do primeiro plano. Isso atrapalha gravação de tela
 * e cobre o caso de passar o aparelho desbloqueado para outra pessoa — mas não
 * impede nada: ninguém é avisado de um print, e dá para fotografar a tela com
 * um segundo celular.
 *
 * Quem protege de verdade é o CÓDIGO: ele vale só na etapa em que foi gerado.
 * Um crachá da montagem não passa no dia do evento. Dentro da mesma etapa, a
 * defesa é humana e já existe — o scanner mostra nome, setor e função de quem
 * está sendo lido, e quem credencia vê na hora se confere com a pessoa à frente.
 */
function CartaoDoQr({ codigo, etapa }: { codigo: string; etapa: string }) {
  const [oculto, setOculto] = useState(false)

  useEffect(() => {
    const assinatura = AppState.addEventListener('change', estado => {
      if (estado !== 'active') setOculto(true)
    })
    return () => assinatura.remove()
  }, [])

  return (
    <Cartao>
      <View style={e.qrFora}>
        <View style={e.qrMoldura}>
          <QRCode value={codigo} size={196} backgroundColor="#ffffff" color={cor.neutro900} />
          {oculto ? (
            <Pressable onPress={() => setOculto(false)} style={e.qrTampa}>
              <Icone nome="EyeOff" tamanho={24} tom="#ffffff" />
              <Text style={e.qrTampaTitulo}>QR ocultado por segurança</Text>
              <Text style={e.qrTampaTexto}>Toque para mostrar de novo</Text>
            </Pressable>
          ) : null}
        </View>

        <Respiro altura={espaco.m} />
        <Text style={e.qrInstrucao}>
          Apresente este QR na <Text style={e.forte}>entrada</Text> e na{' '}
          <Text style={e.forte}>saída</Text> do evento
        </Text>
        <Text style={e.qrAviso}>
          Este é o seu QR da {NOME_DA_FASE[etapa as keyof typeof NOME_DA_FASE] ?? etapa}. A
          credencial é pessoal — emprestar é uso indevido.
        </Text>
      </View>
    </Cartao>
  )
}

// ─── As etapas ──────────────────────────────────────────────────────────────

/** Entrada e saída: quem registra é o portão. Aqui é só o estado. */
function EtapaDoDia({
  tipo, feitoEm, naFila, instrucao,
}: {
  tipo: TipoBatida
  feitoEm: string | null
  naFila?: BatidaPendente
  instrucao: string
}) {
  return (
    <Cartao>
      <Cabecalho tipo={tipo} feitoEm={feitoEm} naFila={naFila} />
      {!feitoEm && !naFila ? (
        <>
          <Respiro altura={espaco.s} />
          <Legenda>{instrucao}</Legenda>
        </>
      ) : null}
      {naFila ? <EstadoNaFila batida={naFila} /> : null}
    </Cartao>
  )
}

/**
 * O meio — a única etapa que a pessoa registra sozinha.
 *
 * Ele abre quatro horas depois da ENTRADA de cada pessoa, e não num horário
 * fixo do evento: quem chegou às 14h e quem chegou às 19h têm janelas
 * diferentes. Por isso o horário sai da entrada dela, e não do relógio do
 * evento.
 *
 * A janela FECHA para efeito de atraso, mas o registro continua aceito depois:
 * fechar de vez prenderia quem se atrasou sem nenhuma forma de resolver. O
 * atraso é medido e aparece em vermelho no histórico — ele conta, mas não
 * impede.
 */
function EtapaDoMeio({
  dia, naFila, aoRegistrar, aoDescartar,
}: {
  dia: DiaDaParticipacao
  naFila?: BatidaPendente
  aoRegistrar: () => void
  aoDescartar: (id: string) => void
}) {
  const agora = Date.now()
  const janela = dia.entrada ? janelaMeio(dia.entrada) : null
  const abriu = !!janela && agora >= Date.parse(janela.inicio)
  const atrasado = !!janela && agora > Date.parse(janela.fim)

  return (
    <Cartao>
      <Cabecalho tipo="meio" feitoEm={dia.meio} naFila={naFila} />

      {dia.meio ? (
        dia.meioAtrasoMin ? (
          <>
            <Respiro altura={espaco.s} />
            <Legenda>Registrado {dia.meioAtrasoMin} min depois do prazo.</Legenda>
          </>
        ) : null
      ) : naFila ? (
        <EstadoNaFila batida={naFila} aoDescartar={aoDescartar} />
      ) : !dia.entrada ? (
        <>
          <Respiro altura={espaco.s} />
          <Legenda>
            O meio abre quatro horas depois da sua entrada. Registre a entrada
            primeiro, no credenciamento.
          </Legenda>
        </>
      ) : !abriu ? (
        <>
          <Respiro altura={espaco.s} />
          <Legenda>
            Abre às {formatarBR(janela!.inicio, 'hora')}. Você vai ser avisado
            no WhatsApp quando chegar a hora.
          </Legenda>
        </>
      ) : (
        <>
          <Respiro altura={espaco.s} />
          <Legenda>
            {atrasado
              ? 'O prazo passou, mas você ainda pode registrar — o atraso fica marcado.'
              : `Você tem até ${formatarBR(janela!.fim, 'hora')}.`}
          </Legenda>
          <Respiro />
          <Botao titulo="Registrar o meio com selfie" onPress={aoRegistrar} />
          <Respiro altura={espaco.s} />
          <Legenda>
            A foto comprova que você estava no evento. Ela é apagada em 90 dias.
          </Legenda>
        </>
      )}
    </Cartao>
  )
}

function Cabecalho({
  tipo, feitoEm, naFila,
}: { tipo: TipoBatida; feitoEm: string | null; naFila?: BatidaPendente }) {
  return (
    <View style={e.cabecalho}>
      <View style={[e.pontoDaEtapa, { backgroundColor: corDaEtapa[tipo] }]} />
      <Text style={e.nomeDaEtapa}>{ROTULO[tipo]}</Text>
      {feitoEm ? (
        <Selo texto={formatarBR(feitoEm, 'hora')} tipo="sucesso" />
      ) : naFila ? (
        <Selo
          texto={naFila.estado === 'recusada' ? 'Recusada' : 'No aparelho'}
          tipo={naFila.estado === 'recusada' ? 'erro' : 'aviso'}
        />
      ) : (
        <Selo texto="Pendente" tipo="info" />
      )}
    </View>
  )
}

/**
 * O que a fila está fazendo com aquela batida.
 *
 * Dizer "guardada no aparelho" e não "erro" é a diferença entre a pessoa ficar
 * tranquila e ela tentar de novo cinco vezes. A batida já está gravada, com o
 * horário em que ela tocou o botão — o que falta é só a subida.
 */
function EstadoNaFila({
  batida, aoDescartar,
}: { batida: BatidaPendente; aoDescartar?: (id: string) => void }) {
  if (batida.estado === 'recusada') {
    return (
      <>
        <Respiro altura={espaco.s} />
        <Aviso tipo="erro">{batida.motivo ?? 'O servidor não aceitou este registro.'}</Aviso>
        {aoDescartar ? (
          <Botao titulo="Entendi, tirar da lista" onPress={() => aoDescartar(batida.id)} tipo="secundario" />
        ) : null}
      </>
    )
  }

  return (
    <>
      <Respiro altura={espaco.s} />
      <View style={e.naFila}>
        <Icone nome="Clock" tamanho={14} tom={cor.aviso700} />
        <Text style={e.naFilaTexto}>
          Registrado às {formatarBR(batida.registradoEm, 'hora')} e guardado no
          aparelho. Sobe sozinho quando a internet voltar.
        </Text>
      </View>
    </>
  )
}

/** Onde estamos, se o aparelho deixar. Negado ou lento, a batida vai sem. */
async function ondeEstamos(): Promise<{ lat: number; lng: number } | null> {
  try {
    const permissao = await Location.requestForegroundPermissionsAsync()
    if (!permissao.granted) return null
    const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
    return { lat: p.coords.latitude, lng: p.coords.longitude }
  } catch {
    return null
  }
}

const e = StyleSheet.create({
  qrFora: { alignItems: 'center' },
  qrMoldura: {
    width: 196 + espaco.g * 2,
    padding: espaco.g,
    borderRadius: raio.cartao,
    borderWidth: 1,
    borderColor: uso.borda,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    // Na web, impede o menu de "salvar imagem" e a seleção do desenho.
    ...(Platform.OS === 'web' ? ({ userSelect: 'none' } as object) : null),
  },
  qrTampa: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(17,17,19,0.88)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: espaco.m,
  },
  qrTampaTitulo: { ...texto.corpoForte, color: '#ffffff', textAlign: 'center' },
  qrTampaTexto: { ...texto.xs, fontFamily: tipo.regular, color: 'rgba(255,255,255,0.7)' },

  qrInstrucao: { ...texto.corpo, color: uso.tintaMedia, textAlign: 'center' },
  forte: { fontFamily: tipo.semi, color: uso.tinta },
  qrAviso: {
    ...texto.xs,
    fontFamily: tipo.regular,
    color: uso.tintaFraca,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },

  cabecalho: { flexDirection: 'row', alignItems: 'center', gap: espaco.s },
  pontoDaEtapa: { width: 8, height: 8, borderRadius: 999 },
  nomeDaEtapa: { ...texto.tituloCartao, color: uso.tinta, flex: 1 },

  naFila: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: espaco.s,
    backgroundColor: cor.aviso50,
    borderWidth: 1,
    borderColor: cor.aviso200,
    borderRadius: raio.campo,
    padding: espaco.m,
  },
  naFilaTexto: { ...texto.corpo, color: cor.aviso700, flex: 1 },
})
