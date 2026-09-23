// Minha credencial — o crachá e o ponto do colaborador.
//
// É a tela que a pessoa abre no portão. No sistema web ela chega por um link no
// WhatsApp (`/credential/[token]`); aqui é uma tela do app, com a mesma lógica.
//
// ─── QUEM REGISTRA O QUÊ ────────────────────────────────────────────────────
//
//   entrada           pelo QR, no portão — sempre. Fora do dia principal, OU
//                     no dia principal com o auto-atendimento ligado, a
//                     própria pessoa também pode registrar pelo celular, sem
//                     operador. Os dois caminhos coexistem.
//
//   saída             só pelo QR, no portão. Nunca sem operador — decisão do
//                     Juan, não esquecimento: ver `registrarEntradaLivre` no
//                     contrato.
//
//   o meio            a própria pessoa, com selfie, aqui. É a etapa que prova
//                     que ela continuou no evento, e não faria sentido outra
//                     pessoa registrar por ela no portão.
//
// ─── O MEIO PASSA PELA FILA, E O AUTO-ATENDIMENTO NÃO ───────────────────────
//
// O meio acontece com mil pessoas no mesmo sinal, então é gravado no aparelho
// na hora e sobe quando der. Já o auto-atendimento é uma chamada direta à
// rede: a pessoa está parada esperando a confirmação, igual ao site — sem
// fila, sem reenvio tardio para proteger.

import { useEffect, useMemo, useState } from 'react'
import { AppState, Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import QRCode from 'react-native-qrcode-svg'
import * as Location from 'expo-location'
import { allowScreenCaptureAsync, preventScreenCaptureAsync } from 'expo-screen-capture'
import { diaBRT, formatarBR, janelaMeio, NOME_DA_FASE } from '@credenciei/dominio'
import type { DiaDaParticipacao, ResumoParticipacao, TipoBatida } from '@credenciei/contrato'
import type { BatidaPendente } from '@credenciei/offline'
import { usePedido } from '../../src/dados/pedido'
import { useFila } from '../../src/fila/contexto'
import { escolherParticipacao, useParticipacaoSelecionada } from '../../src/participacao-selecionada'
import { useSessao } from '../../src/sessao/contexto'
import { CameraDeRosto } from '../../src/ui/camera-de-rosto'
import {
  Aviso, Botao, Carregando, Cartao, Corpo, Legenda, Respiro, Selo, Tela,
  TituloDaTela, TituloDeCartao,
} from '../../src/ui/componentes'
import { Icone } from '../../src/ui/icone'
import { MuralDeAvisos } from '../../src/ui/mural-de-avisos'
import { corDaEtapa, espaco, raio, texto, tipo } from '../../src/ui/tema'
import { useTema, type Tokens } from '../../src/ui/tema-contexto'

const ROTULO: Record<TipoBatida, string> = { entrada: 'Entrada', meio: 'Meio', fim: 'Saída' }

export default function Credencial() {
  const { cliente } = useSessao()
  const fila = useFila()
  const { participacaoId: selecionada } = useParticipacaoSelecionada()
  const [camera, setCamera] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [registrandoLivre, setRegistrandoLivre] = useState(false)

  const { pedido, recarregar, atualizarSemPiscar } = usePedido(async () => {
    const participacoes = await cliente.minhasParticipacoes()
    // A escolhida em "Meus eventos", se ainda existir; senão a que está
    // acontecendo; sem essa, a primeira — quem só tem evento futuro ainda
    // quer ver a credencial dele. Ver `participacao-selecionada.tsx`.
    const p = escolherParticipacao(participacoes, selecionada)
    if (!p) return null

    const [qr, dias] = await Promise.all([
      cliente.meuQr(p.participacaoId),
      cliente.meusDias(p.participacaoId),
    ])
    return { participacao: p, qr, dias }
  }, [cliente, selecionada])

  /*
   * Sem isto, esta tela nunca se atualizava sozinha — cópia de
   * `ManterAtualizado.tsx` no site, que existe por dois incidentes reais:
   * o operador escaneia no portão e o celular continua mostrando "Registrar
   * entrada" (a pessoa acha que não passou); e o meio libera 4h depois da
   * entrada, mas quem deixou a tela aberta desde o credenciamento nunca via
   * o cartão aparecer. `atualizarSemPiscar`, não `recarregar`: um
   * `recarregar` a cada minuto faria o QR sumir e a tela inteira piscar de
   * volta pro "carregando" bem na hora em que alguém pode estar
   * apresentando o crachá no portão.
   *
   * Sem listener de rede (`online`) de propósito — este projeto não usa
   * `NetInfo`, mesma decisão da fila de batidas (Epic 7): tentar e tratar a
   * falha como transporte já basta, não precisa saber se está online antes.
   * E sem agendar a virada exata da meia-noite como o site faz: o
   * intervalo de 60s já corrige sozinho, com no máximo um minuto de atraso,
   * enquanto o app estiver em primeiro plano.
   */
  useEffect(() => {
    const assinatura = AppState.addEventListener('change', estado => {
      if (estado === 'active') atualizarSemPiscar()
    })
    const id = setInterval(atualizarSemPiscar, 60_000)
    return () => { assinatura.remove(); clearInterval(id) }
  }, [atualizarSemPiscar])

  const dados = pedido.estado === 'pronto' ? pedido.dados : null
  const hoje = diaBRT(new Date())
  const diaDeHoje = dados?.dias.find(d => d.data === hoje) ?? null

  /**
   * Sempre disponível fora do dia principal — mesma regra da montagem e da
   * desmontagem. No dia principal, só quando o evento tem o auto-atendimento
   * ligado (ver "Editar evento"); mesmo ligado, o QR acima continua valendo.
   */
  const podeAutoRegistrar = !!diaDeHoje
    && (diaDeHoje.etapa !== 'evento' || !!dados?.participacao.checkinAutonomo)

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

  /**
   * Entrada sem operador. Fora da fila de propósito: a pessoa está na tela
   * esperando a confirmação, igual no site — se a rede falhar, ela sabe na
   * hora e tenta de novo, em vez de confiar numa batida guardada que ainda
   * não foi aceita.
   */
  async function registrarEntradaLivre() {
    if (registrandoLivre || !dados) return
    setErro(null)
    setRegistrandoLivre(true)
    try {
      const onde = await ondeEstamos()
      const r = await cliente.registrarEntradaLivre(dados.participacao.participacaoId, onde ?? {})
      if (r.situacao === 'recusado') setErro(r.motivo)
      else await recarregar()
    } catch {
      setErro('Não foi possível registrar agora. Verifique a internet e tente de novo.')
    } finally {
      setRegistrandoLivre(false)
    }
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
          {/*
            O recado da produção vem por cima de tudo, antes de a pessoa
            mexer na credencial — é para isso que ele existe. Some sozinho
            quando não há nada pendente. Ver `mural-de-avisos.tsx`.
          */}
          <MuralDeAvisos eventoId={dados.participacao.eventoId} />

          <Legenda>{dados.participacao.eventoNome}</Legenda>
          <Respiro />

          {dados.participacao.situacao !== 'credenciado' ? (
            <SituacaoNaoCredenciado situacao={dados.participacao.situacao} />
          ) : (
            <>
              <CartaoDoQr
                codigo={dados.qr.codigo}
                etapa={dados.qr.etapa}
                liberado={dados.qr.liberado}
                liberaEm={dados.qr.liberaEm}
                aoChegarAHora={recarregar}
              />

              <Respiro altura={espaco.s} />
              <TituloDeCartao>Hoje</TituloDeCartao>
              <Legenda>
                {diaDeHoje
                  ? diaDeHoje.cancelado
                    ? `${formatarBR(`${hoje}T12:00:00-03:00`, 'data')} · Cancelado`
                    : `${formatarBR(`${hoje}T12:00:00-03:00`, 'data')} · ${NOME_DA_FASE[diaDeHoje.etapa]}`
                  : 'Hoje não é dia de trabalho neste evento'}
              </Legenda>
              <Respiro altura={espaco.s} />

              {erro ? <Aviso tipo="erro">{erro}</Aviso> : null}

              {diaDeHoje?.cancelado ? (
                <Cartao>
                  <Corpo>
                    A produção cancelou o expediente de hoje. Não é preciso
                    registrar nada — o dia não conta como falta.
                  </Corpo>
                </Cartao>
              ) : diaDeHoje ? (
                <>
                  <EtapaDoDia
                    tipo="entrada"
                    feitoEm={diaDeHoje.entrada}
                    naFila={naFila.find(i => i.tipo === 'entrada')}
                    instrucao="Mostre o QR acima no credenciamento."
                    podeAutoRegistrar={podeAutoRegistrar}
                    registrandoLivre={registrandoLivre}
                    aoRegistrarLivre={registrarEntradaLivre}
                  />

                  {diaDeHoje.meioExigido || diaDeHoje.meio ? (
                    <EtapaDoMeio
                      dia={diaDeHoje}
                      naFila={naFila.find(i => i.tipo === 'meio')}
                      aoRegistrar={() => setCamera(true)}
                      aoDescartar={id => { void fila.descartar(id) }}
                    />
                  ) : null}

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

/**
 * Quando a participação não está credenciada — esconde o QR e as etapas em
 * vez de mostrar um crachá que PARECE funcionar e é recusado no portão. O
 * `meuQr` gera um código válido para qualquer situação (a recusa de
 * verdade acontece na leitura, `registrarPorQr`); sem este aviso, a pessoa
 * só descobre o problema na hora errada, na frente de todo mundo.
 */
function SituacaoNaoCredenciado({
  situacao,
}: { situacao: 'aguardando_aprovacao' | 'descredenciado' }) {
  const textos = {
    aguardando_aprovacao: {
      titulo: 'Aguardando aprovação',
      texto: 'Seu cadastro neste evento ainda não foi liberado pela produção. '
        + 'A credencial aparece aqui assim que for aprovada.',
    },
    descredenciado: {
      titulo: 'Fora da equipe deste evento',
      texto: 'Você não está mais credenciado neste evento, então não é '
        + 'possível registrar presença. Se acha que isto é um engano, fale '
        + 'com a produção.',
    },
  }[situacao]

  return (
    <Cartao>
      <TituloDeCartao>{textos.titulo}</TituloDeCartao>
      <Respiro altura={espaco.s} />
      <Corpo>{textos.texto}</Corpo>
    </Cartao>
  )
}

// ─── O QR ───────────────────────────────────────────────────────────────────

/**
 * O crachá.
 *
 * ─── SOBRE O QUE PROTEGE, E O QUE NÃO ──────────────────────────────────────
 *
 * `preventScreenCaptureAsync` bloqueia print e gravação de tela ENQUANTO
 * esta tela está aberta — no Android de verdade (`FLAG_SECURE`); no iOS só
 * cobre gravação, porque a plataforma não deixa impedir print, só avisar
 * depois (o app ainda não lê esse aviso). Sem efeito na web — não existe o
 * conceito lá, e é onde ninguém credencia de verdade mesmo. Achado
 * testando de verdade num navegador, 18/09/2026: o hook pronto do pacote
 * (`usePreventScreenCapture`) não checa a plataforma sozinho e LANÇA na
 * web ("not available on web"), o que derrubava a tela inteira — daí
 * chamar a função direto, só fora da web.
 *
 * O QR também some quando o app sai do primeiro plano — cobre o caso de
 * passar o aparelho desbloqueado para outra pessoa, e dá uma segunda camada
 * contra gravação. Mesmo com os dois, dá pra fotografar a tela com um
 * segundo celular — nenhuma proteção de tela impede isso.
 *
 * Quem protege de verdade é o CÓDIGO: ele vale só na etapa em que foi gerado.
 * Um crachá da montagem não passa no dia do evento. Dentro da mesma etapa, a
 * defesa é humana e já existe — o scanner mostra nome, setor e função de quem
 * está sendo lido, e quem credencia vê na hora se confere com a pessoa à frente.
 *
 * ─── A LIBERAÇÃO DO QR, PERTO DA HORA DE BATER ──────────────────────────────
 *
 * Decisão do Juan, 18/09/2026: além de sumir com o app em segundo plano, o QR
 * também fica embaçado até pouco antes da janela de entrada/saída abrir —
 * contra o print mandado com antecedência pra alguém entrar no lugar da
 * pessoa (`liberacaoDoQR`, no domínio, decide isso; a API já manda pronto em
 * `liberado`/`liberaEm`). Diferente do embaçado "por segurança" (que a
 * própria pessoa destrava tocando, é só pra quando o app volta do fundo),
 * este NÃO tem toque pra revelar — revelar antes da hora anularia a proteção.
 */
function CartaoDoQr({
  codigo, etapa, liberado, liberaEm, aoChegarAHora,
}: {
  codigo: string
  etapa: string
  liberado: boolean
  liberaEm: string | null
  /** Avisado quando o horário de liberação chega, pra recarregar e destravar sozinho. */
  aoChegarAHora: () => void
}) {
  const { cor, uso } = useTema()
  const e = useMemo(() => criarEstilos(cor, uso), [cor, uso])
  const [oculto, setOculto] = useState(false)

  useEffect(() => {
    if (Platform.OS === 'web') return
    void preventScreenCaptureAsync()
    return () => { void allowScreenCaptureAsync() }
  }, [])

  useEffect(() => {
    const assinatura = AppState.addEventListener('change', estado => {
      if (estado !== 'active') setOculto(true)
    })
    return () => assinatura.remove()
  }, [])

  useEffect(() => {
    if (liberado || !liberaEm) return
    const faltam = Date.parse(liberaEm) - Date.now()
    if (faltam <= 0) { aoChegarAHora(); return }
    const id = setTimeout(aoChegarAHora, faltam + 500)
    return () => clearTimeout(id)
  }, [liberado, liberaEm, aoChegarAHora])

  return (
    <Cartao>
      <View style={e.qrFora}>
        <View style={e.qrMoldura}>
          <QRCode value={codigo} size={196} backgroundColor="#ffffff" color={cor.neutro900} />
          {!liberado ? (
            <View style={e.qrTampa}>
              <Icone nome="Clock" tamanho={24} tom="#ffffff" />
              <Text style={e.qrTampaTitulo}>
                {liberaEm ? `Libera às ${formatarBR(liberaEm, 'hora')}` : 'Fora do horário de hoje'}
              </Text>
              <Text style={e.qrTampaTexto}>
                O QR só aparece perto da hora de bater, contra print mandado
                com antecedência.
              </Text>
            </View>
          ) : oculto ? (
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

/**
 * Entrada e saída: quem registra é o portão — exceto a entrada quando
 * `podeAutoRegistrar`, que também pode ser feita sozinha, sem tirar o QR
 * de cena. A saída nunca ganha este botão: ver o cabeçalho do arquivo.
 */
function EtapaDoDia({
  tipo, feitoEm, naFila, instrucao, podeAutoRegistrar, registrandoLivre, aoRegistrarLivre,
}: {
  tipo: TipoBatida
  feitoEm: string | null
  naFila?: BatidaPendente
  instrucao: string
  podeAutoRegistrar?: boolean
  registrandoLivre?: boolean
  aoRegistrarLivre?: () => void
}) {
  const ehLivre = tipo === 'entrada' && podeAutoRegistrar && !feitoEm && !naFila

  return (
    <Cartao>
      <Cabecalho tipo={tipo} feitoEm={feitoEm} naFila={naFila} />
      {!feitoEm && !naFila ? (
        <>
          <Respiro altura={espaco.s} />
          <Legenda>{instrucao}</Legenda>
        </>
      ) : null}
      {ehLivre ? (
        <>
          <Respiro altura={espaco.s} />
          <Botao
            titulo="Registrar entrada"
            onPress={() => aoRegistrarLivre?.()}
            ocupado={registrandoLivre}
            tipo="secundario"
          />
          <Respiro altura={espaco.xs} />
          <Legenda>Ou mostre o QR acima no credenciamento, do jeito de sempre.</Legenda>
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
  const e = useEstilos()
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
  const { cor, uso } = useTema()
  const e = useMemo(() => criarEstilos(cor, uso), [cor, uso])
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

function criarEstilos(cor: Tokens['cor'], uso: Tokens['uso']) {
  return StyleSheet.create({
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
}

function useEstilos() {
  const { cor, uso } = useTema()
  return useMemo(() => criarEstilos(cor, uso), [cor, uso])
}
