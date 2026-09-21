// Encontre colaborador — e a base inteira, atrás de um toggle.
//
// Até 11/09/2026 esta tela e "Base de funcionários" eram duas telas
// separadas, com fixtures diferentes. O site fundiu as duas em uma só, com
// um toggle (`/admin/encontrar?ver=todos`), porque são a MESMA pergunta —
// "quem eu tenho?" — só que com filtros e ordenação diferentes:
//
//   Prontas pra recrutar   só quem autorizou aparecer na base regional
//                          (consentimento_base), ordenado por quem mais
//                          trabalhou. É a lista pra montar equipe — serviço
//                          vendido à parte, por isso a CIDADE importa aqui.
//   Toda a base            todo mundo já credenciado, sem filtro de
//                          autorização, ordenado por cadastro mais recente.
//                          Responde "esta pessoa já trabalhou com a gente?".
//
// As duas continuam sendo chamadas separadas ao servidor — os dados têm
// formato diferente (`PessoaRegional` tem cidade e eventos TRABALHADOS;
// `PessoaDaBase` tem organizações e data de cadastro) — só a TELA é uma só,
// como no site.
//
// `base-funcionarios.tsx` virou um redirect pra cá, com `?ver=todos`,
// exatamente como o site fez com a rota antiga.

import { useMemo, useState } from 'react'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { formatCpf, formatTelefone, formatarBR } from '@credenciei/dominio'
import type { BaseDeFuncionarios, BuscaRegional, PessoaDaBase, PessoaRegional } from '@credenciei/contrato'
import { usePedido, useValorComAtraso } from '../../src/dados/pedido'
import { useSessao } from '../../src/sessao/contexto'
import {
  Aviso, Botao, Campo, Carregando, Cartao, Corpo, Escolha, Indicador, Legenda,
  Respiro, Selo, Tela, TituloDaTela, TituloDeCartao,
} from '../../src/ui/componentes'
import { Icone } from '../../src/ui/icone'
import { ALVO_MINIMO, espaco, gradienteMarca, raio, texto, tipo } from '../../src/ui/tema'
import { useTema, type Tokens } from '../../src/ui/tema-contexto'

const ICONE: Record<string, string> = {
  encontradas: 'UserSearch',
  com_historico: 'UserCheck',
  cidades: 'MapPin',
  com_telefone: 'MessageCircle',
  pessoas: 'IdCard',
  cadastros: 'Users',
  organizacoes: 'Building2',
  recorrentes: 'UserCheck',
}

const PRONTAS_PRA_RECRUTAR = 'Prontas pra recrutar'
const TODA_A_BASE = 'Toda a base'

export default function EncontrarColaborador() {
  const { ver } = useLocalSearchParams<{ ver?: string }>()
  const { cliente } = useSessao()
  const e = useEstilos()
  const [modo, setModo] = useState<typeof PRONTAS_PRA_RECRUTAR | typeof TODA_A_BASE>(
    ver === 'todos' ? TODA_A_BASE : PRONTAS_PRA_RECRUTAR,
  )
  const [busca, setBusca] = useState('')
  const [cidade, setCidade] = useState('')
  const [modalCidadeAberto, setModalCidadeAberto] = useState(false)

  const todaABase = modo === TODA_A_BASE
  // Só dispara a busca 350ms depois de a pessoa parar de digitar — numa base
  // de milhares, uma chamada por tecla travava a tela (ver `useValorComAtraso`).
  const buscaComAtraso = useValorComAtraso(busca)

  // Uma busca só, para o modo ativo — trocar de aba não deveria custar duas
  // chamadas ao servidor por vez.
  const { pedido, recarregar } = usePedido<BaseDeFuncionarios | BuscaRegional>(
    () => (todaABase
      ? cliente.baseDeFuncionarios(buscaComAtraso)
      : cliente.encontrarColaborador({ busca: buscaComAtraso, cidade })),
    [cliente, buscaComAtraso, cidade, todaABase],
  )
  const dadosBase = todaABase && pedido.estado === 'pronto' ? pedido.dados as BaseDeFuncionarios : null
  const dadosRecrutar = !todaABase && pedido.estado === 'pronto' ? pedido.dados as BuscaRegional : null
  const indicadores = todaABase ? dadosBase?.indicadores : dadosRecrutar?.indicadores

  return (
    <Tela>
      <TituloDaTela>Encontre colaborador</TituloDaTela>
      <Legenda>
        {todaABase
          ? 'Todo mundo que já foi credenciado por qualquer cliente, identificado pelo CPF'
          : 'Base regional da plataforma — para montar equipe para o evento de um cliente que contratou o serviço'}
      </Legenda>
      <Respiro />

      <Escolha
        opcoes={[PRONTAS_PRA_RECRUTAR, TODA_A_BASE]}
        valor={modo}
        aoEscolher={v => setModo(v as typeof modo)}
      />
      <Respiro altura={espaco.m} />

      {indicadores ? (
        <View style={e.grade}>
          {indicadores.map(i => (
            <View key={i.chave} style={e.gradeItem}>
              <Indicador
                rotulo={i.rotulo}
                valor={i.valor}
                sub={i.sub}
                tom={i.tom}
                icone={ICONE[i.chave] ?? 'Users'}
              />
            </View>
          ))}
        </View>
      ) : null}

      <Respiro altura={espaco.m} />

      <Campo
        value={busca}
        onChangeText={setBusca}
        placeholder={todaABase ? 'Buscar por CPF ou nome…' : 'Nome ou CPF…'}
        autoCapitalize="none"
        autoCorrect={false}
      />

      {/*
        A cidade só faz sentido em "Prontas pra recrutar": é o filtro do
        serviço vendido à parte. Em "Toda a base" a pergunta é outra —
        "já trabalhou com a gente?" — e cidade não entra nela.
      */}
      {!todaABase && dadosRecrutar && dadosRecrutar.cidades.length > 0 ? (
        <>
          <Text style={e.rotulo}>CIDADE</Text>
          <Respiro altura={espaco.s} />
          {/*
            * Um botão só, não a parede de chips — pedido do Juan,
            * 13/09/2026: com muitas cidades na base regional, a lista
            * inteira empurrava a busca e os resultados pra bem mais longe
            * da tela. Mesmo padrão de `ModalDeSetores`, em
            * `evento/[id]/editar.tsx`.
            */}
          <Pressable onPress={() => setModalCidadeAberto(true)} accessibilityRole="button">
            <LinearGradient
              colors={[...gradienteMarca.cores] as [string, string, string]}
              locations={[...gradienteMarca.posicoes] as [number, number, number]}
              start={gradienteMarca.inicio}
              end={gradienteMarca.fim}
              style={[e.cidadeSeletorBotao, gradienteMarca.sombra]}
            >
              <Icone nome="MapPin" tamanho={16} tom="#ffffff" />
              <Text style={e.cidadeSeletorTexto} numberOfLines={1}>{cidade || 'Todas as cidades'}</Text>
              <Icone nome="ChevronRight" tamanho={16} tom="#ffffff" />
            </LinearGradient>
          </Pressable>

          <ModalDeSelecaoDeCidade
            visivel={modalCidadeAberto}
            cidades={dadosRecrutar.cidades}
            selecionada={cidade}
            aoEscolher={c => { setCidade(c); setModalCidadeAberto(false) }}
            aoFechar={() => setModalCidadeAberto(false)}
          />

          <Respiro altura={espaco.m} />
        </>
      ) : null}

      {pedido.estado === 'carregando' ? <Carregando /> : null}

      {pedido.estado === 'falhou' ? (
        <>
          <Aviso tipo="erro">{pedido.mensagem}</Aviso>
          <Botao titulo="Tentar de novo" onPress={recarregar} tipo="secundario" />
        </>
      ) : null}

      {todaABase ? (
        dadosBase ? (
          dadosBase.pessoas.length === 0 ? (
            <Cartao>
              <Corpo>
                {busca
                  ? 'Ninguém encontrado com esse CPF ou nome.'
                  : 'A base ainda está vazia. Ela se preenche sozinha conforme as equipes se cadastram nos eventos.'}
              </Corpo>
            </Cartao>
          ) : (
            <>
              {/*
                O total NÃO muda com a busca: ele responde "quantas existem".
                Recalculá-lo pela busca faria a base parecer encolher a cada
                letra digitada. A lista corta em 50 (ver o servidor) — por
                isso o texto usa `encontrados` (a busca inteira), não
                `pessoas.length` (o que coube na tela).
              */}
              <Legenda>
                {busca
                  ? `${dadosBase.pessoas.length} de ${dadosBase.encontrados} encontradas`
                  : `Mostrando ${dadosBase.pessoas.length} de ${dadosBase.total} pessoas na base — digite para buscar`}
              </Legenda>
              <Respiro altura={espaco.s} />
              <Cartao semPadding>
                {dadosBase.pessoas.map((p, i) => (
                  <View key={p.cpf}>
                    {i > 0 ? <View style={e.fio} /> : null}
                    <LinhaDaBase pessoa={p} />
                  </View>
                ))}
              </Cartao>
            </>
          )
        ) : null
      ) : dadosRecrutar ? (
        dadosRecrutar.pessoas.length === 0 ? (
          <Cartao>
            <Corpo>
              {busca || cidade
                ? 'Ninguém encontrado. Tente outro nome ou outra cidade — a grafia da cidade é a que a pessoa digitou no cadastro.'
                : 'A base se preenche sozinha conforme as equipes se cadastram nos eventos.'}
            </Corpo>
          </Cartao>
        ) : (
          <Cartao semPadding>
            {dadosRecrutar.pessoas.map((p, i) => (
              <View key={p.cpf}>
                {i > 0 ? <View style={e.fio} /> : null}
                <LinhaRegional pessoa={p} />
              </View>
            ))}
          </Cartao>
        )
      ) : null}
    </Tela>
  )
}

function LinhaRegional({ pessoa }: { pessoa: PessoaRegional }) {
  const router = useRouter()
  const e = useEstilos()

  /*
   * Chamar abre o WhatsApp com a conversa já aberta.
   *
   * É o que esta tela existe para fazer: achar alguém e falar com ela. Copiar
   * o número e colar noutro aplicativo é o caminho que faz ninguém chamar.
   */
  async function chamar() {
    if (!pessoa.telefone) return
    const numero = `55${pessoa.telefone.replace(/\D/g, '')}`
    try {
      await Linking.openURL(`https://wa.me/${numero}`)
    } catch {
      // Sem WhatsApp instalado, nada acontece — e o número segue na tela.
    }
  }

  return (
    <View style={e.pessoa}>
      <View style={e.linhaDoNome}>
        {/*
          O nome abre a ficha: histórico entre organizações e o botão de
          atribuir a um evento. É o passo que fecha "achei" em "chamei" — sem
          ele, esta tela só serve para telefonar.
        */}
        <Pressable onPress={() => router.push(`/pessoa/${pessoa.cpf}` as never)} hitSlop={8}>
          <TituloDeCartao>{pessoa.nome}</TituloDeCartao>
        </Pressable>
        <Selo
          texto={pessoa.eventosTrabalhados > 0
            ? `${pessoa.eventosTrabalhados} evento${pessoa.eventosTrabalhados === 1 ? '' : 's'} trabalhado${pessoa.eventosTrabalhados === 1 ? '' : 's'}`
            : 'Sem presença registrada'}
          tipo={pessoa.eventosTrabalhados > 0 ? 'sucesso' : 'info'}
        />
      </View>

      <View style={e.metas}>
        {pessoa.funcao ? <Meta icone="IdCard" texto={pessoa.funcao} /> : null}
        <Meta icone="MapPin" texto={pessoa.cidade || 'cidade não informada'} />
        <Meta icone="User" texto={formatCpf(pessoa.cpf)} />
        <Meta
          icone="Building2"
          texto={`${pessoa.organizacoes} organizaç${pessoa.organizacoes === 1 ? 'ão' : 'ões'}`}
        />
        <Meta icone="Clock" texto={`último em ${formatarBR(pessoa.ultimo, 'data')}`} />
      </View>

      <Respiro altura={espaco.s} />
      {pessoa.telefone ? (
        <Botao titulo={`Chamar no WhatsApp · ${formatTelefone(pessoa.telefone)}`} onPress={chamar} tipo="acento" />
      ) : (
        <Legenda>Sem telefone cadastrado — não dá para chamar por aqui.</Legenda>
      )}
    </View>
  )
}

function LinhaDaBase({ pessoa }: { pessoa: PessoaDaBase }) {
  const router = useRouter()
  const e = useEstilos()

  return (
    <View style={e.pessoa}>
      {/* O nome abre a ficha: histórico entre organizações, e atribuir a um evento. */}
      <Pressable onPress={() => router.push(`/pessoa/${pessoa.cpf}` as never)} hitSlop={8}>
        <TituloDeCartao>{pessoa.nome}</TituloDeCartao>
      </Pressable>
      <Legenda>{formatCpf(pessoa.cpf)}</Legenda>

      <View style={e.selos}>
        <Selo
          texto={`${pessoa.eventos} evento${pessoa.eventos === 1 ? '' : 's'}`}
          tipo={pessoa.eventos >= 2 ? 'sucesso' : 'info'}
        />
        <Selo
          texto={`${pessoa.organizacoes} organizaç${pessoa.organizacoes === 1 ? 'ão' : 'ões'}`}
          tipo="info"
        />
        {pessoa.funcao ? <Selo texto={pessoa.funcao} tipo="info" /> : null}
      </View>

      <Text style={e.rodape}>
        {pessoa.telefone ? `${formatTelefone(pessoa.telefone)} · ` : ''}
        último cadastro em {formatarBR(pessoa.ultimoCadastro, 'curto')}
      </Text>
    </View>
  )
}

function Meta({ icone, texto: valor }: { icone: string; texto: string }) {
  const { uso } = useTema()
  const e = useEstilos()
  return (
    <View style={e.meta}>
      <Icone nome={icone} tamanho={11} tom={uso.tintaFraca} />
      <Text style={e.metaTexto} numberOfLines={1}>{valor}</Text>
    </View>
  )
}

/** A partir de quantas cidades a lista ganha campo de busca. */
const MINIMO_PARA_BUSCAR_CIDADE = 8

function semAcentoCidade(t: string): string {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/**
 * O modal de escolher a cidade — mesmo padrão de `ModalDeSetores`, em
 * `evento/[id]/editar.tsx`. Toque na linha já escolhe E fecha: é filtro de
 * uma cidade por vez, não marcar várias.
 */
function ModalDeSelecaoDeCidade({
  visivel, cidades, selecionada, aoEscolher, aoFechar,
}: {
  visivel: boolean
  cidades: string[]
  selecionada: string
  aoEscolher: (cidade: string) => void
  aoFechar: () => void
}) {
  const { cor, uso } = useTema()
  const e = useEstilos()
  const [busca, setBusca] = useState('')

  const filtradas = busca.trim()
    ? cidades.filter(c => semAcentoCidade(c).includes(semAcentoCidade(busca.trim())))
    : cidades

  return (
    <Modal visible={visivel} animationType="slide" onRequestClose={aoFechar}>
      <View style={e.cidadeModalFora}>
        <View style={e.cidadeModalTopo}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <TituloDeCartao>Filtrar por cidade</TituloDeCartao>
          </View>
          <Pressable onPress={() => { setBusca(''); aoFechar() }} hitSlop={8} accessibilityLabel="Fechar">
            <Icone nome="X" tamanho={20} tom={uso.tintaMedia} />
          </Pressable>
        </View>

        {cidades.length >= MINIMO_PARA_BUSCAR_CIDADE ? (
          <View style={e.cidadeModalBusca}>
            <Campo
              value={busca}
              onChangeText={setBusca}
              placeholder="Buscar cidade…"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
        ) : null}

        <ScrollView contentContainerStyle={e.cidadeModalLista}>
          <Pressable
            onPress={() => aoEscolher('')}
            accessibilityRole="radio"
            accessibilityState={{ selected: selecionada === '' }}
            style={[e.cidadeModalLinha, selecionada === '' && e.cidadeModalLinhaMarcada]}
          >
            <Text style={[e.cidadeModalLinhaTexto, selecionada === '' && e.cidadeModalLinhaTextoMarcado]}>
              Todas as cidades
            </Text>
            {selecionada === '' ? <Icone nome="Check" tamanho={16} tom={cor.acento600} /> : null}
          </Pressable>

          {filtradas.length === 0 ? (
            <Legenda>Nenhuma cidade encontrada com “{busca}”.</Legenda>
          ) : filtradas.map(c => {
            const marcada = c === selecionada
            return (
              <Pressable
                key={c}
                onPress={() => aoEscolher(c)}
                accessibilityRole="radio"
                accessibilityState={{ selected: marcada }}
                style={[e.cidadeModalLinha, marcada && e.cidadeModalLinhaMarcada]}
              >
                <Text style={[e.cidadeModalLinhaTexto, marcada && e.cidadeModalLinhaTextoMarcado]} numberOfLines={1}>
                  {c}
                </Text>
                {marcada ? <Icone nome="Check" tamanho={16} tom={cor.acento600} /> : null}
              </Pressable>
            )
          })}
        </ScrollView>
      </View>
    </Modal>
  )
}

function criarEstilos(cor: Tokens['cor'], uso: Tokens['uso']) {
  return StyleSheet.create({
    grade: { flexDirection: 'row', flexWrap: 'wrap', gap: espaco.m },
    gradeItem: { width: '48%', flexGrow: 1 },

    rotulo: { ...texto.etiqueta, color: uso.tintaFraca },

    cidadeSeletorBotao: {
      minHeight: ALVO_MINIMO,
      borderRadius: raio.campo,
      flexDirection: 'row',
      alignItems: 'center',
      gap: espaco.s,
      paddingHorizontal: espaco.g,
    },
    cidadeSeletorTexto: { ...texto.corpoForte, color: '#ffffff', flex: 1, minWidth: 0 },

    cidadeModalFora: { flex: 1, backgroundColor: uso.superficie, paddingTop: espaco.gg },
    cidadeModalTopo: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: espaco.s,
      paddingHorizontal: espaco.g,
      paddingBottom: espaco.g,
      borderBottomWidth: 1,
      borderBottomColor: uso.borda,
    },
    cidadeModalBusca: { paddingHorizontal: espaco.g, paddingTop: espaco.m },
    cidadeModalLista: { padding: espaco.g },
    cidadeModalLinha: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      minHeight: ALVO_MINIMO,
      paddingHorizontal: espaco.m,
      borderRadius: raio.campo,
    },
    cidadeModalLinhaMarcada: { backgroundColor: cor.acento50 },
    cidadeModalLinhaTexto: { ...texto.base, fontFamily: tipo.regular, color: uso.tinta },
    cidadeModalLinhaTextoMarcado: { fontFamily: tipo.semi, color: cor.acento700 },

    fio: { height: 1, backgroundColor: uso.borda },
    pessoa: { padding: espaco.g },
    linhaDoNome: { flexDirection: 'row', alignItems: 'center', gap: espaco.s, flexWrap: 'wrap' },
    metas: { flexDirection: 'row', flexWrap: 'wrap', gap: espaco.m, marginTop: espaco.s },
    meta: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: '100%' },
    metaTexto: { ...texto.xs, fontFamily: tipo.regular, color: uso.tintaFraca, flexShrink: 1 },
    selos: { flexDirection: 'row', flexWrap: 'wrap', gap: espaco.s, marginTop: espaco.xs },
    rodape: { ...texto.xxs, fontFamily: tipo.regular, color: uso.tintaFraca, marginTop: espaco.xs },
  })
}

function useEstilos() {
  const { cor, uso } = useTema()
  return useMemo(() => criarEstilos(cor, uso), [cor, uso])
}
