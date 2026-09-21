// A configuração de um evento.
//
// É a tela de quem ORGANIZA — diferente do Painel, que responde "como está", e
// das Atividades, que respondem "o que aconteceu". Aqui se monta o evento:
// os setores, quem cuida de cada um, e a porta por onde entra quem não estava
// na lista.
//
// ─── AS PLANILHAS FICAM ATRÁS DE UM BOTÃO SÓ ────────────────────────────────
//
// Importar, baixar o modelo e exportar são três operações da mesma ideia — a
// equipe entrando ou saindo por arquivo. No computador elas cabem lado a lado;
// num celular, três botões na fileira quebram a linha e empurram para baixo o
// que se usa o tempo todo. Um botão, e as três dentro. Ver `src/ui/planilha.tsx`.

import { useEffect, useMemo, useState } from 'react'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import * as Clipboard from 'expo-clipboard'
import {
  abreEm, capacidadesDoPapel, conferenciaAberta, diaBRT, diasAteEvento, ehMaster, formatCpf, formatTelefone,
  formatarBR, podeExcluir, podeGerenciarUsuarios, type Papel,
} from '@credenciei/dominio'
import type { Acesso, LinhaConferencia, SetorDetalhado, SupervisorDoSetor } from '@credenciei/contrato'
import { usePedido } from '../../../../src/dados/pedido'
import { mensagemDoErro } from '../../../../src/dados/pedido'
import { useSessao } from '../../../../src/sessao/contexto'
import {
  Aviso, Botao, Campo, Carregando, Cartao, Corpo, Etiqueta, Indicador, Legenda,
  Respiro, Selo, Separador, Tela, TituloDaTela, TituloDeCartao,
} from '../../../../src/ui/componentes'
import { Icone } from '../../../../src/ui/icone'
import { BotaoDePlanilha } from '../../../../src/ui/planilha'
import { CartaoDaPortaria, CartaoDeCadastroPorLink } from '../../../../src/ui/portaria'
import { ALVO_MINIMO, espaco, gradienteMarca, raio, texto, tipo } from '../../../../src/ui/tema'
import { useTema, type Tokens } from '../../../../src/ui/tema-contexto'

/*
 * As cinco chaves de `eventoDetalhado` (API) / `app/admin/eventos/[id]/page.tsx`
 * (site) — reconferido byte a byte em 13/09/2026. Faturamento/custos/lucro
 * (as outras três do site, só pro master) ficam de fora por ora: dependem de
 * um módulo Financeiro que este app ainda não tem — ver `docs/backlog.md`.
 */
const ICONE_DO_INDICADOR: Record<string, string> = {
  funcionarios_do_evento: 'UserCheck',
  presentes_no_momento: 'Clock',
  entradas_hoje: 'LogIn',
  batida_do_meio_hoje: 'Camera',
  saidas_hoje: 'LogOut',
}

export default function ConfiguracaoDoEvento() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const { cliente, sessao } = useSessao()
  const { cor, uso } = useTema()
  const e = useMemo(() => criarEstilos(cor, uso), [cor, uso])

  const [versao, setVersao] = useState(0)
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [criando, setCriando] = useState(false)
  const [copiarLinksAberto, setCopiarLinksAberto] = useState(false)
  const [avisoCopia, setAvisoCopia] = useState<string | null>(null)
  /** `undefined` até o primeiro pedido voltar — o servidor decide o padrão. */
  const [dia, setDia] = useState<string | undefined>(undefined)

  const { pedido, recarregar } = usePedido(
    () => cliente.evento(String(id), dia),
    [cliente, id, versao, dia],
  )

  const dados = pedido.estado === 'pronto' ? pedido.dados : null

  /*
   * Um pedido à parte, e não dentro de `cliente.evento` — a visão geral da
   * conferência não muda com o dia escolhido no seletor acima, então não
   * tem por que refazer a chamada toda vez que ele troca.
   */
  const { pedido: pedidoDeConferencias } = usePedido(
    () => cliente.conferenciasDoEvento(String(id)),
    [cliente, id, versao],
  )
  const conferencias = pedidoDeConferencias.estado === 'pronto' ? pedidoDeConferencias.dados : null

  /*
   * Só pede quem gerencia usuários — os outros nem veem o widget, e pedir
   * mesmo assim só geraria um erro de permissão sem utilidade nenhuma.
   */
  const { pedido: pedidoDeOperadores } = usePedido(
    () => (podeGerenciarUsuarios(sessao?.papel) ? cliente.operadoresDoEvento(String(id)) : Promise.resolve([])),
    [cliente, id, versao, sessao?.papel],
  )
  const operadores = pedidoDeOperadores.estado === 'pronto' ? pedidoDeOperadores.dados : null

  /** Toda ação que muda algo do evento passa por aqui e recarrega a tela. */
  async function agir(acao: () => Promise<{ erro?: string }>) {
    setErro(null)
    setOcupado(true)
    try {
      const r = await acao()
      if (r.erro) return setErro(r.erro)
      setVersao(v => v + 1)
    } catch (e) {
      setErro(mensagemDoErro(e))
    } finally {
      setOcupado(false)
    }
  }

  const setores = dados
    ? dados.setores.filter(s => semAcento(s.nome).includes(semAcento(busca.trim())))
    : []

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
          <View style={e.cabecalho}>
            <TituloDaTela>{dados.nome}</TituloDaTela>
            <Selo
              texto={dados.ativo ? 'Ativo' : 'Encerrado'}
              tipo={dados.ativo ? 'sucesso' : 'info'}
            />
          </View>

          <Respiro altura={espaco.s} />
          <View style={e.meta}>
            <Metadado icone="CalendarDays" texto={
              dados.dataFim
                ? `${formatarBR(dados.dataInicio)} → ${formatarBR(dados.dataFim)}`
                : formatarBR(dados.dataInicio)
            } />
            {dados.local ? <Metadado icone="MapPin" texto={dados.local} /> : null}
          </View>

          <Respiro />

          <Botao
            titulo="Editar evento"
            onPress={() => router.push(`/evento/${id}/editar` as never)}
            tipo="secundario"
          />
          <Respiro />

          {erro ? <Aviso tipo="erro">{erro}</Aviso> : null}

          {/*
            As duas regras que convivem no evento, ditas numa linha só — é a
            dúvida que mais aparece: por que fulano bateu ponto às três da manhã
            num dia e no outro não conseguiu às dez.
          */}
          {dados.diasDePreparacao > 0 ? (
            <Aviso tipo="info">
              <Corpo forte>{dados.diasDePreparacao} dia(s) de preparação</Corpo> além
              do dia do evento. Neles a entrada e a saída são livres e o meio abre
              4h depois da entrada de cada pessoa; no dia do evento valem os
              horários configurados.
            </Aviso>
          ) : null}

          {/*
            O seletor governa os cinco cartões abaixo, não a lista de setores
            — por isso fica colado neles, e não no cabeçalho da tela.
          */}
          {dados.diasDaOperacao.length > 1 ? (
            <>
              <SeletorDeDia
                dias={dados.diasDaOperacao}
                diaEscolhido={dados.diaEscolhido}
                aoEscolher={setDia}
              />
              <Respiro altura={espaco.s} />
            </>
          ) : null}

          <View style={e.grade}>
            {dados.indicadores.map(i => (
              <View key={i.chave} style={e.gradeItem}>
                <Indicador
                  rotulo={i.rotulo}
                  valor={i.valor}
                  sub={i.sub}
                  tom={i.tom}
                  icone={ICONE_DO_INDICADOR[i.chave] ?? 'Users'}
                />
              </View>
            ))}
          </View>

          {conferencias ? (
            <PainelDeConferencias
              linhas={conferencias}
              dataInicio={dados.dataInicio}
              aoAbrir={setorId => router.push(`/conferencia/${setorId}` as never)}
            />
          ) : null}

          <Respiro altura={espaco.s} />
          <Etiqueta>Fornecedores e setores</Etiqueta>
          <Legenda>Cada setor gera um link próprio de cadastro para a equipe</Legenda>
          <Respiro altura={espaco.m} />

          <CartaoDeCadastroPorLink
            suspenso={dados.cadastroSuspenso}
            ocupado={ocupado}
            aoAlternar={suspenso => agir(() => cliente.alternarCadastroPorLink(String(id), suspenso))}
            podeReabrirIndividual={ehMaster(sessao?.papel)}
            setores={dados.setores.map(s => ({ setorId: s.setorId, nome: s.nome }))}
            aoGerarLinkIndividual={setorId => cliente.criarLinkCadastroIndividual(String(id), setorId)}
          />

          <CartaoDaPortaria
            portaria={dados.portaria}
            ocupado={ocupado}
            aoAlternar={aberta => agir(() => cliente.alternarPortaria(String(id), aberta))}
            aoTrocarQr={() => agir(() => cliente.trocarTokenDaPortaria(String(id)))}
          />

          {operadores && podeGerenciarUsuarios(sessao?.papel) ? (
            <PainelDeOperadores
              eventoId={String(id)}
              operadores={operadores}
              aoMudar={() => setVersao(v => v + 1)}
            />
          ) : null}

          <Respiro />
          <Legenda>
            {dados.setores.length} {dados.setores.length === 1 ? 'setor' : 'setores'} ·{' '}
            {dados.totalPessoas} na equipe
          </Legenda>
          <Respiro altura={espaco.s} />

          {dados.setores.length > 3 ? (
            <Campo
              value={busca}
              onChangeText={setBusca}
              placeholder="Buscar setor ou supervisor…"
              autoCapitalize="none"
              autoCorrect={false}
            />
          ) : null}

          <Respiro altura={espaco.s} />
          {/*
            * Minimizado, abaixo da busca — pedido do Juan, 13/09/2026: o
            * botão cheio de "Novo fornecedor/setor" competia em peso com o
            * resto da tela, sendo uma ação rara (uma vez por setor, não por
            * visita). Vira uma pílula pequena, na cor de ação do sistema.
            */}
          {criando ? (
            <FormularioDeSetor
              ocupado={ocupado}
              aoCancelar={() => setCriando(false)}
              aoCriar={async dadosDoSetor => {
                await agir(async () => {
                  const r = await cliente.criarSetor(String(id), dadosDoSetor)
                  if (!r.erro) setCriando(false)
                  return r
                })
              }}
            />
          ) : (
            <View style={e.acoesDaListaDeSetores}>
              {dados.setores.length > 0 ? (
                <Pressable
                  onPress={() => setCopiarLinksAberto(true)}
                  accessibilityRole="button"
                  style={({ pressed }) => [e.copiarLinksBotao, pressed && e.setorIconeBotaoTocado]}
                >
                  <Icone nome="ClipboardList" tamanho={14} tom={uso.tintaMedia} />
                  <Text style={e.copiarLinksTexto}>Copiar links</Text>
                </Pressable>
              ) : <View />}

              <Pressable onPress={() => setCriando(true)} accessibilityRole="button">
                <LinearGradient
                  colors={[...gradienteMarca.cores] as [string, string, string]}
                  locations={[...gradienteMarca.posicoes] as [number, number, number]}
                  start={gradienteMarca.inicio}
                  end={gradienteMarca.fim}
                  style={[e.novoSetorBotao, gradienteMarca.sombra]}
                >
                  <Icone nome="Plus" tamanho={14} tom="#ffffff" />
                  <Text style={e.novoSetorTexto}>Novo Setor</Text>
                </LinearGradient>
              </Pressable>
            </View>
          )}
          <Respiro altura={espaco.m} />

          {avisoCopia ? (
            <>
              <Aviso tipo="sucesso">{avisoCopia}</Aviso>
              <Respiro altura={espaco.m} />
            </>
          ) : null}

          <ModalDeCopiarLinks
            visivel={copiarLinksAberto}
            setores={dados.setores}
            aoFechar={() => setCopiarLinksAberto(false)}
            aoCopiado={mensagem => { setCopiarLinksAberto(false); setAvisoCopia(mensagem); setTimeout(() => setAvisoCopia(null), 3000) }}
          />

          {dados.setores.length === 0 ? (
            <Cartao>
              <Corpo>
                Nenhum fornecedor ainda. Crie o primeiro setor para a equipe
                começar a se cadastrar.
              </Corpo>
            </Cartao>
          ) : setores.length === 0 ? (
            <Cartao><Corpo>Nenhum setor com esse nome.</Corpo></Cartao>
          ) : (
            <View style={e.setorGrade}>
              {setores.map(s => (
                <View key={s.setorId} style={e.setorGradeItem}>
                  <CartaoDoSetor
                    setor={s}
                    aoVerEquipe={() => router.push(`/setor/${s.setorId}` as never)}
                    aoImportar={() => setVersao(v => v + 1)}
                    aoMudar={() => setVersao(v => v + 1)}
                  />
                </View>
              ))}
            </View>
          )}

        </>
      ) : null}
    </Tela>
  )
}

// ─── Peças ──────────────────────────────────────────────────────────────────

function Metadado({ icone, texto: valor }: { icone: string; texto: string }) {
  const { cor, uso } = useTema()
  const e = useMemo(() => criarEstilos(cor, uso), [cor, uso])
  return (
    <View style={e.metaItem}>
      <Icone nome={icone} tamanho={12} tom={uso.tintaFraca} />
      <Text style={e.metaTexto} numberOfLines={1}>{valor}</Text>
    </View>
  )
}

/**
 * O seletor "Dia" — governa os cinco cartões de indicador. Cópia do
 * `SeletorDeDia` do site (`components/SeletorDeDia.tsx`) numa versão mais
 * simples: uma lista dos dias válidos em vez de um calendário de mês inteiro
 * — a operação raramente passa de uma ou duas semanas, e um calendário com a
 * maioria dos dias apagados (fora da operação) não ganha nada no celular.
 */
function SeletorDeDia({
  dias, diaEscolhido, aoEscolher,
}: { dias: string[]; diaEscolhido: string; aoEscolher: (dia: string) => void }) {
  const { cor, uso } = useTema()
  const e = useMemo(() => criarEstilos(cor, uso), [cor, uso])
  const [aberto, setAberto] = useState(false)
  const hoje = diaBRT()

  const rotuloDoDia = (d: string) =>
    `${formatarBR(`${d}T12:00:00-03:00`, 'data')}${d === hoje ? ' · hoje' : ''}`

  return (
    <>
      <Pressable
        onPress={() => setAberto(true)}
        accessibilityRole="button"
        accessibilityLabel="Escolher o dia"
        style={e.diaBotao}
      >
        <Etiqueta>Dia</Etiqueta>
        <View style={e.diaBotaoPilula}>
          <Icone nome="CalendarDays" tamanho={14} tom={uso.tintaFraca} />
          <Text style={e.diaBotaoTexto}>{rotuloDoDia(diaEscolhido)}</Text>
        </View>
      </Pressable>

      <Modal visible={aberto} animationType="slide" onRequestClose={() => setAberto(false)}>
        <View style={e.diaModalFora}>
          <View style={e.diaModalTopo}>
            <TituloDeCartao>Escolher o dia</TituloDeCartao>
            <Pressable onPress={() => setAberto(false)} hitSlop={8} accessibilityLabel="Fechar">
              <Icone nome="X" tamanho={20} tom={uso.tintaMedia} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={e.diaModalLista}>
            {dias.map(d => {
              const ativo = d === diaEscolhido
              return (
                <Pressable
                  key={d}
                  onPress={() => { aoEscolher(d); setAberto(false) }}
                  accessibilityRole="button"
                  style={[e.diaLinha, ativo && e.diaLinhaAtiva]}
                >
                  <Text style={[e.diaLinhaTexto, ativo && e.diaLinhaTextoAtivo]}>{rotuloDoDia(d)}</Text>
                  {ativo ? <Icone nome="Check" tamanho={16} tom={cor.acento600} /> : null}
                </Pressable>
              )
            })}
          </ScrollView>
        </View>
      </Modal>
    </>
  )
}

/**
 * A visão geral do organizador: setor a setor, quem já conferiu a equipe
 * (D-1) e quem ainda não. Cópia do `PainelConferencias` do site
 * (`app/admin/eventos/[id]/PainelConferencias.tsx`), 13/09/2026 — inclusive
 * a régua de quando aparece: só a partir de 3 dias antes do evento, ou se
 * alguém já tiver confirmado (senão é ruído numa tela que já é grande).
 */
function PainelDeConferencias({
  linhas, dataInicio, aoAbrir,
}: { linhas: LinhaConferencia[]; dataInicio: string; aoAbrir: (setorId: string) => void }) {
  const { cor, uso } = useTema()
  const e = useEstilos()
  const [listaAberta, setListaAberta] = useState(false)

  const dias = diasAteEvento(dataInicio)
  const jaConfirmou = linhas.some(l => l.status === 'confirmada')
  if (dias > 3 && !jaConfirmou) return null
  if (!linhas.length) return null

  const aberta = conferenciaAberta(dataInicio)
  const feitas = linhas.filter(l => l.status === 'confirmada').length
  const tomFeito = feitas === linhas.length

  return (
    <>
      <Respiro altura={espaco.s} />
      <Cartao semPadding>
        <View style={e.confTitulo}>
          <View style={[e.confIcone, { backgroundColor: tomFeito ? cor.sucesso50 : cor.aviso50 }]}>
            <Icone nome="ClipboardCheck" tamanho={14} tom={tomFeito ? cor.sucesso600 : cor.aviso600} />
          </View>
          <View style={e.confTextoTitulo}>
            <TituloDeCartao>Conferência de equipe (1 dia antes)</TituloDeCartao>
            <Legenda>
              {aberta
                ? `${feitas} de ${linhas.length} setores confirmaram a equipe`
                : `Abre ${formatarBR(abreEm(dataInicio).toISOString(), 'completo')}`}
            </Legenda>
          </View>
        </View>

        {/*
          * Um botão só, não os 23 setores soltos na tela — pedido do Juan,
          * 13/09/2026: com muitos setores a lista inteira empurrava tudo que
          * vinha depois (fornecedores, criar setor) pra bem mais longe da
          * tela. Agora é um card por evento (não por setor), e a lista mora
          * num modal — mesmo padrão de `ModalDeSetores`, em `editar.tsx`.
          */}
        <View style={e.confBotaoArea}>
          <Pressable onPress={() => setListaAberta(true)} accessibilityRole="button">
            <LinearGradient
              colors={[...gradienteMarca.cores] as [string, string, string]}
              locations={[...gradienteMarca.posicoes] as [number, number, number]}
              start={gradienteMarca.inicio}
              end={gradienteMarca.fim}
              style={[e.confBotaoGrande, gradienteMarca.sombra]}
            >
              <Icone nome="ClipboardCheck" tamanho={16} tom="#ffffff" />
              <Text style={e.confBotaoGrandeTexto}>Conferir setores</Text>
              <View style={e.confBotaoGrandeContagem}>
                <Text style={e.confBotaoGrandeContagemTexto}>{feitas}/{linhas.length}</Text>
              </View>
            </LinearGradient>
          </Pressable>
        </View>
      </Cartao>

      {/*
        * Popup centralizado, não tela cheia — mesmo padrão de "Editar
        * fornecedor/setor" e "Planilhas" (fundo escurecido + caixa no meio).
        * Pedido do Juan, 13/09/2026: preferiu o modal ao invés da tela cheia
        * que a lista longa tinha antes.
        */}
      <Modal visible={listaAberta} transparent animationType="fade" onRequestClose={() => setListaAberta(false)}>
        <Pressable style={e.modalFundo} onPress={() => setListaAberta(false)}>
          <Pressable style={e.modalCaixa} onPress={() => {}}>
            <View style={e.modalCabecalho}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <TituloDeCartao>Conferência de equipe</TituloDeCartao>
                <Legenda>{feitas} de {linhas.length} setores confirmaram a equipe</Legenda>
              </View>
              <Pressable onPress={() => setListaAberta(false)} hitSlop={8} accessibilityLabel="Fechar">
                <Icone nome="X" tamanho={20} tom={uso.tintaMedia} />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={e.modalConteudo}>
              {linhas.map((l, i) => (
                <View key={l.setorId}>
                  {i > 0 ? <View style={e.confFio} /> : null}
                  <View style={e.confLinha}>
                    <Icone
                      nome={l.status === 'confirmada' ? 'CheckCircle' : 'Clock'}
                      tamanho={16}
                      tom={l.status === 'confirmada' ? cor.sucesso600 : cor.aviso600}
                    />
                    <View style={e.confLinhaTexto}>
                      <Corpo forte>{l.setorNome}</Corpo>
                      <Legenda>{l.supervisorNome}</Legenda>
                    </View>
                    <Pressable onPress={() => { setListaAberta(false); aoAbrir(l.setorId) }} style={e.confBotao}>
                      <Text style={e.confBotaoTexto}>{l.status === 'confirmada' ? 'Ver' : 'Abrir'}</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  )
}

/**
 * O cartão de um setor — cópia do `FornecedorCard.tsx` do site, 13/09/2026:
 * nome+números na mesma linha, planilha/editar no cabeçalho, "Ver equipe" em
 * destaque (gradiente, é pra onde se vai o tempo todo) e o link do formulário
 * como apoio, com o interruptor de ligar/desligar ao lado dele.
 */
function CartaoDoSetor({
  setor, aoVerEquipe, aoImportar, aoMudar,
}: {
  setor: SetorDetalhado
  aoVerEquipe: () => void
  aoImportar: () => void
  /** Setor editado ou link ligado/desligado — a lista inteira precisa recarregar. */
  aoMudar: () => void
}) {
  const { cor, uso } = useTema()
  const e = useMemo(() => criarEstilos(cor, uso), [cor, uso])
  const { cliente, sessao } = useSessao()
  const [copiado, setCopiado] = useState(false)
  const [editando, setEditando] = useState(false)
  const [confirmandoLink, setConfirmandoLink] = useState(false)
  const [mudandoLink, setMudandoLink] = useState(false)
  const [erroLink, setErroLink] = useState<string | null>(null)
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false)
  const [excluindo, setExcluindo] = useState(false)
  const [erroExclusao, setErroExclusao] = useState<string | null>(null)
  const [supervisorEmEdicao, setSupervisorEmEdicao] = useState<SupervisorDoSetor | null>(null)
  const [adicionandoSupervisor, setAdicionandoSupervisor] = useState(false)

  async function copiarLink() {
    try {
      await Clipboard.setStringAsync(setor.linkDoFormulario)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      // Sem área de transferência: o link continua na tela para copiar à mão.
    }
  }

  async function alternarLink(ativo: boolean) {
    setErroLink(null)
    setMudandoLink(true)
    try {
      const r = await cliente.alternarLinkDoSetor(setor.setorId, ativo)
      if (r.erro) setErroLink(r.erro)
      else aoMudar()
    } finally {
      setMudandoLink(false)
      setConfirmandoLink(false)
    }
  }

  /*
   * Só DESLIGAR pede confirmação — é o que fecha o cadastro pro setor, a
   * pedido do Juan (13/09/2026). Ligar de novo é sempre reversível na hora,
   * sem risco: não precisa do mesmo freio.
   */
  function aoTocarLink() {
    if (setor.linkAtivo) setConfirmandoLink(true)
    else void alternarLink(true)
  }

  async function excluir() {
    setErroExclusao(null)
    setExcluindo(true)
    try {
      const r = await cliente.excluirSetor(setor.setorId)
      if (r.erro) return setErroExclusao(r.erro)
      setConfirmandoExclusao(false)
      aoMudar()
    } finally {
      setExcluindo(false)
    }
  }

  return (
    // `View` própria, e não o `Cartao` compartilhado: este precisa de
    // `flex: 1` para esticar até a altura do vizinho mais alto na mesma
    // linha do grid (ver `setorGrade`) — o `Cartao` do resto do app não tem
    // esse esticamento, porque nenhum outro lugar empilha cards lado a lado.
    <View style={e.setorCartaoCompacto}>
      {/*
        * Compacto, 2 por linha — pedido do Juan, 13/09/2026: um setor por
        * linha inteira (com "Ver equipe" e "Link do formulário" em botões
        * grandes) obrigava rolar demais em evento com muitos setores. O
        * cartão inteiro (menos os ícones) abre a equipe ao tocar — os dois
        * botões somem, e "copiar link" vira um ícone a mais no cabeçalho.
        */}
      <Pressable onPress={aoVerEquipe} accessibilityRole="button">
        <Text style={e.setorNomeCompacto} numberOfLines={1}>{setor.nome}</Text>
      </Pressable>

      <View style={e.setorIcones}>
        <BotaoDePlanilha setorId={setor.setorId} setorNome={setor.nome} aoImportar={aoImportar} icone />
        <Pressable
          onPress={() => setEditando(true)}
          accessibilityRole="button"
          accessibilityLabel={`Editar setor ${setor.nome}`}
          style={({ pressed }) => [e.setorIconeBotao, pressed && e.setorIconeBotaoTocado]}
        >
          <Icone nome="Pencil" tamanho={14} tom={uso.tintaFraca} />
        </Pressable>
        <Pressable
          onPress={copiarLink}
          accessibilityRole="button"
          accessibilityLabel={copiado ? 'Link copiado' : `Copiar link do formulário de ${setor.nome}`}
          style={({ pressed }) => [e.setorIconeBotao, pressed && e.setorIconeBotaoTocado]}
        >
          <Icone nome={copiado ? 'Check' : 'Link2'} tamanho={14} tom={copiado ? cor.sucesso600 : uso.tintaFraca} />
        </Pressable>
        {/* Ícone de "power" — liga/desliga o cadastro deste setor. Trocado
            do ícone de corrente (13/09/2026, a pedido do Juan): "power" é
            mais reconhecível como interruptor do que um elo de corrente. */}
        <Pressable
          onPress={aoTocarLink}
          disabled={mudandoLink}
          accessibilityRole="button"
          accessibilityLabel={setor.linkAtivo ? `Desligar link de ${setor.nome}` : `Ligar link de ${setor.nome}`}
          style={({ pressed }) => [e.setorIconeBotao, pressed && e.setorIconeBotaoTocado]}
        >
          <Icone
            nome={setor.linkAtivo ? 'Power' : 'PowerOff'}
            tamanho={14}
            tom={setor.linkAtivo ? uso.tintaFraca : cor.aviso600}
          />
        </Pressable>
        {podeExcluir(sessao?.papel) ? (
          <Pressable
            onPress={() => setConfirmandoExclusao(true)}
            accessibilityRole="button"
            accessibilityLabel={`Excluir setor ${setor.nome}`}
            style={({ pressed }) => [e.setorIconeBotao, pressed && e.setorIconeBotaoTocado]}
          >
            <Icone nome="Trash2" tamanho={14} tom={cor.erro600} />
          </Pressable>
        ) : null}
      </View>

      <Pressable onPress={aoVerEquipe} accessibilityRole="button" style={e.setorMetaArea}>
        <View style={e.setorMeta}>
          <Metadado
            icone="Users"
            texto={`${setor.pessoas} ${setor.pessoas === 1 ? 'pessoa' : 'pessoas'}`}
          />
          {setor.valorPorPessoa !== null ? (
            <Metadado icone="Wallet" texto={`${emReais(setor.valorPorPessoa)}/pessoa`} />
          ) : null}
        </View>
      </Pressable>

      {erroLink ? (
        <>
          <Respiro altura={espaco.xs} />
          <Aviso tipo="erro">{erroLink}</Aviso>
        </>
      ) : null}

      <Respiro altura={espaco.s} />

      <Separador />

      <View style={e.supervisores}>
        <View style={e.supervisoresTitulo}>
          <Icone nome="ShieldCheck" tamanho={12} tom={uso.tintaFraca} />
          <Text style={e.rotuloPequeno}>SUPERVISORES</Text>
        </View>
        {setor.supervisores.length === 0 ? (
          // Curto de propósito: a frase inteira ("Nenhum supervisor
          // vinculado a este setor") quebrava em 2 linhas no card estreito
          // e deixava "Adicionar supervisor" mais baixo do que no card
          // vizinho, que só tem uma linha de nome — a mesma altura extra
          // que o Juan apontou como "torto" comparando os dois lado a lado.
          <Legenda>Nenhum supervisor</Legenda>
        ) : (
          setor.supervisores.map(s => (
            <Pressable
              key={s.id}
              onPress={() => setSupervisorEmEdicao(s)}
              accessibilityRole="button"
              style={({ pressed }) => [e.supervisor, pressed && e.setorIconeBotaoTocado]}
            >
              <Corpo forte>{s.nome}</Corpo>
              {!s.ativo ? <Selo texto="Inativo" tipo="aviso" /> : null}
              <View style={{ flex: 1 }} />
              <Icone nome="Pencil" tamanho={12} tom={uso.tintaFraca} />
            </Pressable>
          ))
        )}

        {/*
          * Sempre o mesmo link discreto — nunca o botão cheio que o site usa
          * no setor vazio (variante "vazio" do `SupervisorModal`). Lado a
          * lado no grid de 2 colunas, um card com botão grande e o vizinho
          * com um link pequeno pareciam dois padrões diferentes na mesma
          * tela (relato do Juan, 13/09/2026) — aqui o peso visual é sempre
          * igual, tenha o setor zero ou vários supervisores.
          */}
        {/*
          * O espaçador flexível é o que faltava: sem ele, "Adicionar
          * supervisor" ficava logo depois da lista — num setor sem
          * supervisor (lista curta) ele sobrava lá no meio do card, bem
          * acima do card vizinho, mais alto, cheio de nomes (relato do
          * Juan, 13/09/2026: "tá torto"). Com o espaçador absorvendo a
          * sobra, o botão sempre encosta no rodapé do card, alinhado com
          * o do vizinho.
          */}
        <View style={{ flex: 1 }} />
        <Pressable
          onPress={() => setAdicionandoSupervisor(true)}
          accessibilityRole="button"
          style={e.adicionarSupervisor}
        >
          <Icone nome="UserPlus" tamanho={12} tom={cor.acento600} />
          <Text style={e.adicionarSupervisorTexto}>Adicionar supervisor</Text>
        </Pressable>
      </View>

      {editando ? (
        <ModalDeEditarSetor
          setor={setor}
          aoFechar={() => setEditando(false)}
          aoSalvo={() => { setEditando(false); aoMudar() }}
        />
      ) : null}

      {confirmandoLink ? (
        <ModalDeConfirmacao
          titulo="Desligar o link de cadastro?"
          mensagem={`${setor.nome} vai parar de aceitar cadastro novo até alguém ligar de novo.`}
          textoBotao="Desligar link"
          ocupado={mudandoLink}
          aoConfirmar={() => alternarLink(false)}
          aoFechar={() => setConfirmandoLink(false)}
        />
      ) : null}

      {confirmandoExclusao ? (
        <ModalDeConfirmacao
          titulo={`Excluir "${setor.nome}"?`}
          mensagem="Apaga o setor e todos os funcionários cadastrados nele. Não dá para desfazer."
          textoBotao="Excluir setor"
          erro={erroExclusao}
          ocupado={excluindo}
          aoConfirmar={excluir}
          aoFechar={() => setConfirmandoExclusao(false)}
        />
      ) : null}

      {adicionandoSupervisor ? (
        <ModalDeAdicionarSupervisor
          setorNome={setor.nome}
          aoFechar={() => setAdicionandoSupervisor(false)}
          aoSalvo={() => { setAdicionandoSupervisor(false); aoMudar() }}
          aoAdicionar={dados => cliente.adicionarSupervisor(setor.setorId, dados)}
        />
      ) : null}

      {supervisorEmEdicao ? (
        <ModalDeEditarSupervisor
          supervisor={supervisorEmEdicao}
          papel="supervisor"
          aoFechar={() => setSupervisorEmEdicao(null)}
          aoSalvo={() => { setSupervisorEmEdicao(null); aoMudar() }}
        />
      ) : null}
    </View>
  )
}

/**
 * Um popup de "tem certeza?" — cópia do site's `ConfirmModal`. Usado para as
 * duas ações que não têm volta fácil neste cartão: desligar o link e excluir
 * o setor.
 */
function ModalDeConfirmacao({
  titulo, mensagem, textoBotao, erro, ocupado, aoConfirmar, aoFechar,
}: {
  titulo: string
  mensagem: string
  textoBotao: string
  erro?: string | null
  ocupado: boolean
  aoConfirmar: () => void
  aoFechar: () => void
}) {
  const e = useEstilos()
  return (
    <Modal visible transparent animationType="fade" onRequestClose={aoFechar}>
      <Pressable style={e.modalFundo} onPress={aoFechar}>
        <Pressable style={e.modalCaixa} onPress={() => {}}>
          <View style={e.modalConteudo}>
            <TituloDeCartao>{titulo}</TituloDeCartao>
            <Legenda>{mensagem}</Legenda>
            {erro ? <Aviso tipo="erro">{erro}</Aviso> : null}
            <Botao titulo={textoBotao} tipo="perigo" ocupado={ocupado} onPress={aoConfirmar} />
            <Botao titulo="Cancelar" tipo="fantasma" desabilitado={ocupado} onPress={aoFechar} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

/**
 * Editar nome, valor por pessoa e o pedido do meio — cópia do site's
 * `FornecedorModal` (modo "editar"). O supervisor não entra aqui: trocar quem
 * responde por uma equipe é outra decisão, que mora em Acessos.
 */
function ModalDeEditarSetor({
  setor, aoFechar, aoSalvo,
}: {
  setor: SetorDetalhado
  aoFechar: () => void
  aoSalvo: () => void
}) {
  const { uso } = useTema()
  const e = useEstilos()
  const { cliente } = useSessao()
  const [nome, setNome] = useState(setor.nome)
  const [valor, setValor] = useState(setor.valorPorPessoa != null ? String(setor.valorPorPessoa) : '')
  const [exigeMeio, setExigeMeio] = useState(setor.exigeMeio)
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function salvar() {
    setErro(null)
    setOcupado(true)
    try {
      const r = await cliente.editarSetor(setor.setorId, {
        nome,
        valorPorPessoa: valor ? Number(valor) : null,
        exigeMeio,
      })
      if (r.erro) return setErro(r.erro)
      aoSalvo()
    } finally {
      setOcupado(false)
    }
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={aoFechar}>
      <Pressable style={e.modalFundo} onPress={aoFechar}>
        <Pressable style={e.modalCaixa} onPress={() => {}}>
          <View style={e.modalCabecalho}>
            <TituloDeCartao>Editar fornecedor/setor</TituloDeCartao>
            <Pressable onPress={aoFechar} hitSlop={8} accessibilityLabel="Fechar" style={e.setorIconeBotao}>
              <Icone nome="X" tamanho={18} tom={uso.tintaMedia} />
            </Pressable>
          </View>

          <View style={e.modalConteudo}>
            {erro ? <Aviso tipo="erro">{erro}</Aviso> : null}

            <Campo
              rotulo="Nome da empresa / Setor"
              value={nome}
              onChangeText={setNome}
              autoCapitalize="words"
            />
            <Campo
              rotulo="Valor combinado por funcionário"
              value={valor}
              onChangeText={t => setValor(t.replace(/\D/g, ''))}
              placeholder="opcional"
              keyboardType="number-pad"
            />

            <Pressable onPress={() => setExigeMeio(v => !v)} accessibilityRole="checkbox"
              accessibilityState={{ checked: exigeMeio }}>
              <View style={e.linhaDaChave}>
                <View style={[e.caixaDaChave, exigeMeio && e.caixaDaChaveMarcada]}>
                  {exigeMeio ? <Icone nome="Check" tamanho={12} tom="#ffffff" espessura={3} /> : null}
                </View>
                <View style={e.textoDaChave}>
                  <Corpo forte>Pedir confirmação no meio do turno</Corpo>
                  <Respiro altura={espaco.xs} />
                  <Legenda>
                    A selfie que comprova que a pessoa ficou no posto. Ligue só em
                    equipe paga por pessoa (segurança, limpeza, carregadores, bar…).
                  </Legenda>
                </View>
              </View>
            </Pressable>

            <Respiro altura={espaco.s} />
            <Botao titulo="Salvar alterações" onPress={salvar} ocupado={ocupado} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

/**
 * Adiciona um supervisor a um setor que JÁ EXISTE — cópia do site's
 * `SupervisorModal` (modo "criar"), sem o passo de "escolher entre quem já é
 * funcionário": esta tela ainda não tem a lista de funcionários do evento
 * inteiro para oferecer (só a do PRÓPRIO setor, em `equipeDoSetor`), então o
 * formulário é sempre manual — nome, CPF e WhatsApp de quem vai supervisionar.
 */
function ModalDeAdicionarSupervisor({
  setorNome, aoFechar, aoSalvo, aoAdicionar,
  titulo = 'Novo supervisor', textoBotao = 'Criar supervisor',
  ajudaCpf = 'O CPF identifica o cadastro e é usado no login. Se a pessoa já for supervisora aqui, este setor entra nos dela, sem criar login novo.',
}: {
  /** `null` esconde a linha "Setor: X" — usado pelo operador de portão, que não tem setor. */
  setorNome: string | null
  aoFechar: () => void
  aoSalvo: () => void
  aoAdicionar: (dados: { nome: string; cpf: string; telefone: string }) => Promise<{ erro?: string }>
  /** "Novo supervisor" por padrão — o mesmo modal serve pra Operadores de portão. */
  titulo?: string
  textoBotao?: string
  ajudaCpf?: string
}) {
  const { uso } = useTema()
  const e = useEstilos()
  const [nome, setNome] = useState('')
  const [cpf, setCpf] = useState('')
  const [telefone, setTelefone] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function salvar() {
    setErro(null)
    setOcupado(true)
    try {
      const r = await aoAdicionar({ nome, cpf, telefone })
      if (r.erro) return setErro(r.erro)
      aoSalvo()
    } finally {
      setOcupado(false)
    }
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={aoFechar}>
      <Pressable style={e.modalFundo} onPress={aoFechar}>
        <Pressable style={e.modalCaixa} onPress={() => {}}>
          <View style={e.modalCabecalho}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <TituloDeCartao>{titulo}</TituloDeCartao>
              {setorNome ? <Legenda>Setor: {setorNome}</Legenda> : null}
            </View>
            <Pressable onPress={aoFechar} hitSlop={8} accessibilityLabel="Fechar" style={e.setorIconeBotao}>
              <Icone nome="X" tamanho={18} tom={uso.tintaMedia} />
            </Pressable>
          </View>

          <View style={e.modalConteudo}>
            {erro ? <Aviso tipo="erro">{erro}</Aviso> : null}

            <Campo rotulo="Nome completo" value={nome} onChangeText={setNome} autoCapitalize="words" placeholder="Nome da pessoa" />
            <Campo
              rotulo="CPF"
              value={cpf}
              onChangeText={t => setCpf(formatCpf(t))}
              placeholder="000.000.000-00"
              keyboardType="number-pad"
              ajuda={ajudaCpf}
            />
            <Campo
              rotulo="WhatsApp"
              value={telefone}
              onChangeText={t => setTelefone(formatTelefone(t))}
              placeholder="(11) 99999-9999"
              keyboardType="phone-pad"
            />

            <Respiro altura={espaco.s} />
            <Botao titulo={textoBotao} onPress={salvar} ocupado={ocupado} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

/**
 * Editar um supervisor já vinculado — cópia do site's `SupervisorModal`
 * (modo "editar"), sem CPF (não muda) nem senha (caminho próprio, em
 * Acessos). Excluir é só master, com o mesmo popup de confirmação do resto
 * do cartão.
 */
function ModalDeEditarSupervisor({
  supervisor, papel, aoFechar, aoSalvo, titulo = 'Editar supervisor',
}: {
  supervisor: SupervisorDoSetor & { permissoesUsuario?: Record<string, boolean> }
  /** De que papel são as "Funções ligadas" oferecidas — supervisor ou operador de portão. */
  papel: Papel
  aoFechar: () => void
  aoSalvo: () => void
  /** "Editar supervisor" por padrão — o mesmo modal serve pra Operadores de portão, só muda o rótulo. */
  titulo?: string
}) {
  const { uso } = useTema()
  const e = useEstilos()
  const { cliente, sessao } = useSessao()
  const [nome, setNome] = useState(supervisor.nome)
  const [telefone, setTelefone] = useState(formatTelefone(supervisor.telefone ?? ''))
  const [ativo, setAtivo] = useState(supervisor.ativo)
  const [ligadas, setLigadas] = useState<Record<string, boolean>>({})
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false)
  const [excluindo, setExcluindo] = useState(false)

  const capacidades = capacidadesDoPapel(papel)
  const ligada = (chave: string, padraoAtual: boolean): boolean => {
    if (chave in ligadas) return ligadas[chave] ?? padraoAtual
    const gravado = supervisor.permissoesUsuario?.[chave]
    return typeof gravado === 'boolean' ? gravado : padraoAtual
  }

  async function salvar() {
    setErro(null)
    setOcupado(true)
    try {
      const permissoesUsuario: Record<string, boolean> = {}
      for (const c of capacidades) {
        const v = ligada(c.chave, c.padraoAtual)
        if (v !== c.padraoAtual) permissoesUsuario[c.chave] = v
      }
      const r = await cliente.editarSupervisor(supervisor.id, { nome, telefone, ativo, permissoesUsuario })
      if (r.erro) return setErro(r.erro)
      aoSalvo()
    } finally {
      setOcupado(false)
    }
  }

  async function excluir() {
    setErro(null)
    setExcluindo(true)
    try {
      const r = await cliente.excluirAcesso(supervisor.id)
      if (r.erro) { setErro(r.erro); setConfirmandoExclusao(false); return }
      aoSalvo()
    } finally {
      setExcluindo(false)
    }
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={aoFechar}>
      <Pressable style={e.modalFundo} onPress={aoFechar}>
        <Pressable style={e.modalCaixa} onPress={() => {}}>
          <View style={e.modalCabecalho}>
            <TituloDeCartao>{titulo}</TituloDeCartao>
            <Pressable onPress={aoFechar} hitSlop={8} accessibilityLabel="Fechar" style={e.setorIconeBotao}>
              <Icone nome="X" tamanho={18} tom={uso.tintaMedia} />
            </Pressable>
          </View>

          <View style={e.modalConteudo}>
            {erro ? <Aviso tipo="erro">{erro}</Aviso> : null}

            <Campo rotulo="Nome completo" value={nome} onChangeText={setNome} autoCapitalize="words" />
            <Campo
              rotulo="WhatsApp"
              value={telefone}
              onChangeText={t => setTelefone(formatTelefone(t))}
              placeholder="(11) 99999-9999"
              keyboardType="phone-pad"
            />

            <Pressable onPress={() => setAtivo(v => !v)} accessibilityRole="checkbox" accessibilityState={{ checked: ativo }}>
              <View style={e.linhaDaChave}>
                <View style={[e.caixaDaChave, ativo && e.caixaDaChaveMarcada]}>
                  {ativo ? <Icone nome="Check" tamanho={12} tom="#ffffff" espessura={3} /> : null}
                </View>
                <View style={e.textoDaChave}>
                  <Corpo forte>Ativo</Corpo>
                  <Legenda>Desligado, ele perde o acesso — sem apagar o histórico.</Legenda>
                </View>
              </View>
            </Pressable>

            {capacidades.length > 0 ? (
              <>
                <Respiro altura={espaco.m} />
                <TituloDeCartao>Funções ligadas</TituloDeCartao>
                <Respiro altura={espaco.s} />
                {capacidades.map(c => {
                  const on = ligada(c.chave, c.padraoAtual)
                  return (
                    <Pressable
                      key={c.chave}
                      onPress={() => setLigadas(m => ({ ...m, [c.chave]: !on }))}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: on }}
                    >
                      <View style={e.linhaDaChave}>
                        <View style={[e.caixaDaChave, on && e.caixaDaChaveMarcada]}>
                          {on ? <Icone nome="Check" tamanho={12} tom="#ffffff" espessura={3} /> : null}
                        </View>
                        <View style={e.textoDaChave}>
                          <Corpo forte>{c.nome}</Corpo>
                          <Legenda>{c.descricao}</Legenda>
                        </View>
                      </View>
                    </Pressable>
                  )
                })}
              </>
            ) : null}

            <Respiro altura={espaco.s} />
            <Botao titulo="Salvar alterações" onPress={salvar} ocupado={ocupado} />

            {podeExcluir(sessao?.papel) ? (
              <>
                <Respiro altura={espaco.s} />
                <Botao
                  titulo={`Excluir ${titulo.replace(/^Editar /i, '').toLowerCase()}`}
                  tipo="perigo"
                  desabilitado={ocupado}
                  onPress={() => setConfirmandoExclusao(true)}
                />
              </>
            ) : null}
          </View>
        </Pressable>
      </Pressable>

      {confirmandoExclusao ? (
        <ModalDeConfirmacao
          titulo={`Excluir "${supervisor.nome}"?`}
          mensagem="Apaga o acesso dele por completo. Não dá para desfazer."
          textoBotao={`Excluir ${titulo.replace(/^Editar /i, '').toLowerCase()}`}
          ocupado={excluindo}
          aoConfirmar={excluir}
          aoFechar={() => setConfirmandoExclusao(false)}
        />
      ) : null}
    </Modal>
  )
}

/**
 * Operadores de portão — quem lê o QR e registra ponto no portão, sem
 * acesso a editar evento, equipe ou usuários. Cópia do site's
 * `OperadorPortariaCard.tsx`, 13/09/2026. São da ORGANIZAÇÃO, não deste
 * evento sozinho — não há como prender um perfil sem setor a um evento; a
 * consulta já filtra pela organização deste evento (`operadoresDoEvento`).
 *
 * Reaproveita os MESMOS modais de adicionar/editar do supervisor: criar e
 * editar um acesso são a mesma operação (`criarAcesso`/`editarSupervisor`),
 * só o papel muda — daí os dois modais aceitarem um título por fora.
 */
function PainelDeOperadores({
  eventoId, operadores, aoMudar,
}: { eventoId: string; operadores: Acesso[]; aoMudar: () => void }) {
  const { cor, uso } = useTema()
  const e = useEstilos()
  const { cliente } = useSessao()
  const [adicionando, setAdicionando] = useState(false)
  const [editando, setEditando] = useState<Acesso | null>(null)

  return (
    <Cartao>
      <View style={e.supervisoresTitulo}>
        <Icone nome="ShieldCheck" tamanho={14} tom={uso.tintaMedia} />
        <TituloDeCartao>Operadores de portão</TituloDeCartao>
      </View>
      <Legenda>
        Lê o QR e registra ponto no portão — sem acesso a editar evento, equipe ou usuários.
      </Legenda>
      <Respiro altura={espaco.m} />

      {operadores.length === 0 ? (
        <Legenda>Nenhum operador cadastrado nesta organização.</Legenda>
      ) : (
        operadores.map(o => (
          <Pressable
            key={o.id}
            onPress={() => setEditando(o)}
            accessibilityRole="button"
            style={({ pressed }) => [e.supervisor, pressed && e.setorIconeBotaoTocado]}
          >
            <Corpo forte>{o.nome}</Corpo>
            {!o.ativo ? <Selo texto="Inativo" tipo="aviso" /> : null}
            <View style={{ flex: 1 }} />
            <Icone nome="Pencil" tamanho={12} tom={uso.tintaFraca} />
          </Pressable>
        ))
      )}

      <Respiro altura={espaco.s} />
      <Pressable onPress={() => setAdicionando(true)} accessibilityRole="button" style={e.adicionarSupervisor}>
        <Icone nome="UserPlus" tamanho={12} tom={cor.acento600} />
        <Text style={e.adicionarSupervisorTexto}>Adicionar operador</Text>
      </Pressable>

      {adicionando ? (
        <ModalDeAdicionarSupervisor
          setorNome={null}
          titulo="Novo operador de portão"
          textoBotao="Criar operador"
          ajudaCpf="O CPF identifica o cadastro e é usado no login."
          aoFechar={() => setAdicionando(false)}
          aoSalvo={() => { setAdicionando(false); aoMudar() }}
          aoAdicionar={dados => cliente.criarAcesso({
            funcao: 'operador_portao', nome: dados.nome, cpf: dados.cpf, telefone: dados.telefone,
            eventoId, ativo: true,
          })}
        />
      ) : null}

      {editando ? (
        <ModalDeEditarSupervisor
          supervisor={editando}
          papel="operador_portao"
          titulo="Editar operador"
          aoFechar={() => setEditando(null)}
          aoSalvo={() => { setEditando(null); aoMudar() }}
        />
      ) : null}
    </Cartao>
  )
}

function FormularioDeSetor({
  ocupado, aoCriar, aoCancelar,
}: {
  ocupado: boolean
  aoCriar: (dados: {
    nome: string
    valorPorPessoa?: number | null
    supervisor: { nome: string; cpf: string; telefone: string }
    exigeMeio?: boolean
  }) => void
  aoCancelar: () => void
}) {
  const e = useEstilos()
  const [nome, setNome] = useState('')
  const [valor, setValor] = useState('')
  const [exigeMeio, setExigeMeio] = useState(false)
  const [supNome, setSupNome] = useState('')
  const [supCpf, setSupCpf] = useState('')
  const [supTelefone, setSupTelefone] = useState('')

  return (
    <Cartao>
      <TituloDeCartao>Novo fornecedor / setor</TituloDeCartao>
      <Respiro altura={espaco.m} />

      <Campo
        rotulo="Nome do setor"
        value={nome}
        onChangeText={setNome}
        placeholder="Bar, Portaria, Camarim…"
        autoCapitalize="words"
        autoFocus
        ajuda="É este nome que a pessoa vê no cartaz da portaria."
      />
      <Campo
        rotulo="Valor por pessoa"
        value={valor}
        onChangeText={t => setValor(t.replace(/\D/g, ''))}
        placeholder="opcional"
        keyboardType="number-pad"
      />

      {/*
        Confirmação do meio — só faz sentido em equipe paga POR PESSOA. Vem
        desligada: pacote fechado não muda pagamento, só gasta WhatsApp.
      */}
      <Pressable onPress={() => setExigeMeio(v => !v)} accessibilityRole="checkbox"
        accessibilityState={{ checked: exigeMeio }}>
        <View style={e.linhaDaChave}>
          <View style={[e.caixaDaChave, exigeMeio && e.caixaDaChaveMarcada]}>
            {exigeMeio ? <Icone nome="Check" tamanho={12} tom="#ffffff" espessura={3} /> : null}
          </View>
          <View style={e.textoDaChave}>
            <Corpo forte>Pedir confirmação no meio do turno</Corpo>
            <Respiro altura={espaco.xs} />
            <Legenda>
              A selfie que comprova que a pessoa ficou no posto. Ligue só em
              equipe paga por pessoa (segurança, limpeza, carregadores, bar…).
              Em fornecedor de pacote fechado não muda pagamento e só gasta
              WhatsApp.
            </Legenda>
          </View>
        </View>
      </Pressable>
      <Respiro altura={espaco.s} />

      {/*
        O supervisor vem junto, não depois — do jeito que o site fez em
        11/09: um setor só existe com alguém respondendo por ele, senão
        nasce com o link de cadastro aberto e ninguém pra conferir quem
        entra.
      */}
      <Separador />
      <Etiqueta>Supervisor responsável</Etiqueta>
      <Legenda>
        Ele recebe o acesso por WhatsApp e passa a cuidar desta equipe. Se a
        pessoa já for supervisora aqui, digite o mesmo CPF — este setor entra
        nos dela, sem criar login novo.
      </Legenda>
      <Respiro altura={espaco.s} />
      <Campo
        rotulo="Nome"
        value={supNome}
        onChangeText={setSupNome}
        placeholder="Nome da pessoa"
        autoCapitalize="words"
      />
      <Campo
        rotulo="CPF"
        value={supCpf}
        onChangeText={t => setSupCpf(formatCpf(t))}
        placeholder="000.000.000-00"
        keyboardType="number-pad"
        ajuda="É com ele que o supervisor entra no sistema."
      />
      <Campo
        rotulo="WhatsApp"
        value={supTelefone}
        onChangeText={t => setSupTelefone(formatTelefone(t))}
        placeholder="(11) 99999-9999"
        keyboardType="phone-pad"
      />

      <Botao
        titulo="Cadastrar fornecedor/setor"
        ocupado={ocupado}
        onPress={() => aoCriar({
          nome,
          valorPorPessoa: valor ? Number(valor) : null,
          supervisor: { nome: supNome, cpf: supCpf, telefone: supTelefone },
          exigeMeio,
        })}
      />
      <Respiro altura={espaco.s} />
      <Botao titulo="Cancelar" onPress={aoCancelar} tipo="fantasma" />
    </Cartao>
  )
}

/** A partir de quantos setores a lista ganha campo de busca. */
const MINIMO_PARA_BUSCAR_SETOR_COPIA = 6

/**
 * Monta o texto pronto pra colar no WhatsApp — cópia do site's
 * `montarTexto` (`CopiarLinks.tsx`), 13/09/2026: nome em negrito, o link
 * embaixo, uma divisória entre setores. Sem a divisória, uma lista de vinte
 * setores vira um paredão — o WhatsApp quebra cada URL em duas ou três
 * linhas, e sem respiro entre os itens não dá pra saber onde um termina e o
 * outro começa.
 */
function montarTextoDeLinks(setores: { nome: string; linkDoFormulario: string }[]): string {
  const DIVISORIA = '──────────────'
  return setores
    .filter(s => s.linkDoFormulario)
    .map(s => `*${s.nome.trim()}*\n${s.linkDoFormulario}`)
    .join(`\n${DIVISORIA}\n`)
}

/**
 * Copiar os links de cadastro de vários setores de uma vez — cópia do
 * site's `CopiarLinks.tsx`. O caminho de antes era abrir setor por setor e
 * tocar em "Copiar link" em cada um; num evento com muitos setores, isso é
 * ida e volta demais antes de montar a mensagem pro grupo de WhatsApp.
 */
function ModalDeCopiarLinks({
  visivel, setores, aoFechar, aoCopiado,
}: {
  visivel: boolean
  setores: SetorDetalhado[]
  aoFechar: () => void
  aoCopiado: (mensagem: string) => void
}) {
  const { uso } = useTema()
  const e = useEstilos()
  const [busca, setBusca] = useState('')
  const [marcados, setMarcados] = useState<Set<string>>(new Set())

  const comLink = useMemo(() => setores.filter(s => s.linkDoFormulario), [setores])
  const semLink = setores.length - comLink.length

  // Abre com todos marcados: copiar tudo é o caso comum, e desmarcar dois é
  // menos trabalho do que marcar cinco — mesmo comentário do site.
  useEffect(() => {
    if (visivel) {
      setMarcados(new Set(comLink.map(s => s.setorId)))
      setBusca('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visivel])

  const visiveis = busca.trim()
    ? setores.filter(s => semAcento(s.nome).includes(semAcento(busca.trim())))
    : setores

  const alternar = (setorId: string) => setMarcados(atual => {
    const proximo = new Set(atual)
    if (proximo.has(setorId)) proximo.delete(setorId)
    else proximo.add(setorId)
    return proximo
  })

  const selecionados = comLink.filter(s => marcados.has(s.setorId))
  const todosMarcados = selecionados.length === comLink.length && comLink.length > 0

  async function copiar(quais: SetorDetalhado[]) {
    const texto = montarTextoDeLinks(quais)
    if (!texto) return
    try {
      await Clipboard.setStringAsync(texto)
    } catch {
      // Segue mesmo sem a área de transferência — o importante é a contagem certa.
    }
    const n = quais.filter(s => s.linkDoFormulario).length
    aoCopiado(`${n} link${n === 1 ? '' : 's'} copiado${n === 1 ? '' : 's'}.`)
  }

  return (
    <Modal visible={visivel} animationType="slide" onRequestClose={aoFechar}>
      <View style={e.diaModalFora}>
        <View style={e.diaModalTopo}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <TituloDeCartao>Copiar links</TituloDeCartao>
            <Legenda>Nome do setor em negrito, link embaixo, um bloco por setor</Legenda>
          </View>
          <Pressable onPress={aoFechar} hitSlop={8} accessibilityLabel="Fechar">
            <Icone nome="X" tamanho={20} tom={uso.tintaMedia} />
          </Pressable>
        </View>

        {setores.length >= MINIMO_PARA_BUSCAR_SETOR_COPIA ? (
          <View style={{ paddingHorizontal: espaco.g, paddingTop: espaco.m }}>
            <Campo
              value={busca}
              onChangeText={setBusca}
              placeholder="Filtrar setores…"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
        ) : null}

        <ScrollView contentContainerStyle={e.diaModalLista}>
          <Pressable
            onPress={() => setMarcados(todosMarcados ? new Set() : new Set(comLink.map(s => s.setorId)))}
            hitSlop={8}
            style={{ paddingVertical: espaco.s }}
          >
            <Text style={e.adicionarSupervisorTexto}>{todosMarcados ? 'Desmarcar todos' : 'Selecionar todos'}</Text>
          </Pressable>

          {visiveis.length === 0 ? (
            <Legenda>Nenhum setor encontrado com “{busca}”.</Legenda>
          ) : visiveis.map(s => {
            const temLink = !!s.linkDoFormulario
            const marcado = marcados.has(s.setorId)
            return (
              <Pressable
                key={s.setorId}
                onPress={() => temLink && alternar(s.setorId)}
                disabled={!temLink}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: marcado, disabled: !temLink }}
                style={[e.diaLinha, marcado && e.diaLinhaAtiva, !temLink && { opacity: 0.5 }]}
              >
                <View style={[e.caixaDaChave, marcado && e.caixaDaChaveMarcada]}>
                  {marcado ? <Icone nome="Check" tamanho={12} tom="#ffffff" espessura={3} /> : null}
                </View>
                <Text style={[e.diaLinhaTexto, marcado && e.diaLinhaTextoAtivo, { flex: 1, marginLeft: espaco.s }]} numberOfLines={1}>
                  {s.nome}
                </Text>
                {!temLink ? <Legenda>sem link</Legenda> : null}
              </Pressable>
            )
          })}
        </ScrollView>

        <View style={{ padding: espaco.g, borderTopWidth: 1, borderTopColor: uso.borda }}>
          {semLink > 0 ? (
            <>
              <Legenda>
                {semLink} {semLink === 1 ? 'setor sem link de formulário fica' : 'setores sem link de formulário ficam'} de fora.
              </Legenda>
              <Respiro altura={espaco.s} />
            </>
          ) : null}
          <Botao
            titulo={`Copiar ${selecionados.length} selecionado${selecionados.length === 1 ? '' : 's'}`}
            onPress={() => { copiar(selecionados); aoFechar() }}
            desabilitado={!selecionados.length}
          />
          <Respiro altura={espaco.s} />
          <Botao
            titulo={`Copiar todos (${comLink.length})`}
            onPress={() => { copiar(comLink); aoFechar() }}
            tipo="secundario"
            desabilitado={!comLink.length}
          />
        </View>
      </View>
    </Modal>
  )
}

// ─── Auxiliares ─────────────────────────────────────────────────────────────

function semAcento(t: string): string {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/** Reais escritos à mão — `toLocaleString` depende de dados que o celular pode não ter. */
function emReais(valor: number): string {
  const inteiros = String(Math.floor(valor))
  let comPontos = ''
  for (let i = 0; i < inteiros.length; i++) {
    const faltam = inteiros.length - i
    comPontos += inteiros[i]
    if (faltam > 1 && (faltam - 1) % 3 === 0) comPontos += '.'
  }
  return `R$ ${comPontos}`
}

function criarEstilos(cor: Tokens['cor'], uso: Tokens['uso']) {
  return StyleSheet.create({
  linhaDaChave: { flexDirection: 'row', gap: espaco.m },
  textoDaChave: { flex: 1, minWidth: 0 },
  caixaDaChave: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: cor.neutro300,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  caixaDaChaveMarcada: { backgroundColor: cor.acento500, borderColor: cor.acento600 },

  cabecalho: { flexDirection: 'row', alignItems: 'center', gap: espaco.s, flexWrap: 'wrap' },
  novoSetorBotao: {
    minHeight: 32,
    borderRadius: raio.pilula,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: espaco.m,
  },
  novoSetorTexto: { ...texto.xs, fontFamily: tipo.forte, color: '#ffffff' },
  acoesDaListaDeSetores: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: espaco.s },
  copiarLinksBotao: {
    minHeight: 32,
    borderRadius: raio.pilula,
    borderWidth: 1,
    borderColor: uso.borda,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: espaco.m,
  },
  copiarLinksTexto: { ...texto.xs, fontFamily: tipo.semi, color: uso.tintaMedia },
  meta: { flexDirection: 'row', flexWrap: 'wrap', gap: espaco.m },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: '100%' },
  metaTexto: { ...texto.xs, fontFamily: tipo.regular, color: uso.tintaFraca, flexShrink: 1 },

  grade: { flexDirection: 'row', flexWrap: 'wrap', gap: espaco.m },
  gradeItem: { width: '48%', flexGrow: 1 },

  /*
   * Os cards de setor em 2 colunas — pedido do Juan, 13/09/2026. Sem
   * `alignItems: 'stretch'` (o padrão do flexbox, mas deixado explícito
   * aqui) os dois cards da MESMA linha terminavam em alturas diferentes
   * quando um setor tinha mais supervisores que o vizinho — bordas
   * desalinhadas, parecendo dois padrões de card na mesma tela (relato do
   * Juan, 13/09/2026). Esticado, os dois da linha sempre terminam juntos.
   */
  setorGrade: { flexDirection: 'row', flexWrap: 'wrap', gap: espaco.s, alignItems: 'stretch' },
  setorGradeItem: { width: '48.5%' },

  confTitulo: {
    flexDirection: 'row', alignItems: 'center', gap: espaco.s,
    padding: espaco.g, borderBottomWidth: 1, borderBottomColor: uso.borda,
  },
  confIcone: { width: 28, height: 28, borderRadius: raio.campo, alignItems: 'center', justifyContent: 'center' },
  confTextoTitulo: { flex: 1, minWidth: 0 },
  confFio: { height: 1, backgroundColor: uso.borda },
  confLinha: {
    flexDirection: 'row', alignItems: 'center', gap: espaco.s, paddingHorizontal: espaco.g, paddingVertical: espaco.m,
  },
  confLinhaTexto: { flex: 1, minWidth: 0 },
  confBotao: {
    minHeight: 32,
    paddingHorizontal: espaco.m,
    borderRadius: raio.campo,
    borderWidth: 1,
    borderColor: uso.borda,
    backgroundColor: uso.superficie,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confBotaoTexto: { ...texto.xs, fontFamily: tipo.semi, color: uso.tinta },

  confBotaoArea: { padding: espaco.g },
  confBotaoGrande: {
    minHeight: ALVO_MINIMO,
    borderRadius: raio.campo,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: espaco.s,
    paddingHorizontal: espaco.g,
  },
  confBotaoGrandeTexto: { ...texto.corpoForte, color: '#ffffff' },
  confBotaoGrandeContagem: {
    backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: raio.pilula, paddingHorizontal: espaco.s, paddingVertical: 2,
  },
  confBotaoGrandeContagemTexto: { ...texto.xs, fontFamily: tipo.forte, color: '#ffffff' },

  diaBotao: { flexDirection: 'row', alignItems: 'center', gap: espaco.s, alignSelf: 'flex-start' },
  diaBotaoPilula: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 36,
    paddingHorizontal: espaco.m,
    borderRadius: raio.pilula,
    borderWidth: 1,
    borderColor: uso.borda,
    backgroundColor: uso.superficie,
  },
  diaBotaoTexto: { ...texto.xs, fontFamily: tipo.semi, color: uso.tinta },

  diaModalFora: { flex: 1, backgroundColor: uso.superficie, paddingTop: espaco.gg },
  diaModalTopo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: espaco.g,
    paddingBottom: espaco.g,
    borderBottomWidth: 1,
    borderBottomColor: uso.borda,
  },
  diaModalLista: { padding: espaco.g },
  diaLinha: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: ALVO_MINIMO,
    paddingHorizontal: espaco.m,
    borderRadius: raio.campo,
  },
  diaLinhaAtiva: { backgroundColor: cor.acento50 },
  diaLinhaTexto: { ...texto.base, fontFamily: tipo.regular, color: uso.tinta },
  diaLinhaTextoAtivo: { fontFamily: tipo.semi, color: cor.acento700 },

  /*
   * A mesma aparência do `Cartao` compartilhado (fio, canto, fundo, sombra
   * quase invisível), com `flex: 1` a mais — é só isso que falta pra esticar
   * até a altura do vizinho na mesma linha do grid. Não dá para passar isso
   * por prop no `Cartao` de `componentes.tsx`: ele não tem `style`, e mudar
   * o componente mudaria TODO card do app, não só este par lado a lado.
   */
  setorCartaoCompacto: {
    flex: 1,
    backgroundColor: uso.superficie,
    borderWidth: 1,
    borderColor: uso.borda,
    borderRadius: raio.cartao,
    padding: espaco.g,
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.35)',
  },

  /*
   * Compacto — nome truncado numa linha (o card estreito não tem onde um
   * nome comprido quebrar sem empurrar os ícones pra baixo do vizinho, e
   * desalinhar as duas colunas da mesma linha do grid).
   */
  setorNomeCompacto: { ...texto.tituloCartao, color: uso.tinta },
  setorIcones: { flexDirection: 'row', flexWrap: 'wrap', gap: 0 },
  setorIconeBotao: {
    width: 28, height: 28, borderRadius: raio.campo, alignItems: 'center', justifyContent: 'center',
  },
  setorIconeBotaoTocado: { backgroundColor: cor.neutro100 },
  setorMetaArea: { alignSelf: 'flex-start' },
  setorMeta: { gap: 2 },
  supervisores: { flex: 1, gap: espaco.s },
  supervisoresTitulo: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  rotuloPequeno: { ...texto.etiqueta, color: uso.tintaFraca },
  supervisor: {
    flexDirection: 'row', alignItems: 'center', gap: espaco.s, minHeight: ALVO_MINIMO, borderRadius: raio.campo,
  },
  adicionarSupervisor: {
    flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', minHeight: ALVO_MINIMO, paddingVertical: espaco.xs,
  },
  adicionarSupervisorTexto: { ...texto.xs, fontFamily: tipo.semi, color: cor.acento600 },

  /** Popup centralizado do "Editar fornecedor/setor" — mesmo fundo/caixa do
      seletor de data e do modal de planilhas. */
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
  modalConteudo: { padding: espaco.g, gap: espaco.m },

  })
}

function useEstilos() {
  const { cor, uso } = useTema()
  return useMemo(() => criarEstilos(cor, uso), [cor, uso])
}
