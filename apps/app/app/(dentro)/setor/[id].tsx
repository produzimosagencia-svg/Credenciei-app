// A equipe de um setor.
//
// É a tela que o "Ver equipe" abre, e a que o supervisor deixa aberta durante o
// evento. No computador ela é uma tabela larga com dez colunas; num celular,
// cada pessoa vira uma linha com o que se olha de relance: quem é, e como está
// cada etapa.
//
// ─── AS TRÊS BOLINHAS SÃO O CONTEÚDO ────────────────────────────────────────
//
// Entrada, meio e saída, com a cor dizendo o estado:
//
//   verde     registrou;
//   âmbar     ainda dá tempo, ou a etapa é livre;
//   vermelho  o prazo passou e não registrou — é a pendência;
//   cinza     a janela nem abriu.
//
// Quem calcula é o servidor, e não esta tela: o status depende da janela do
// evento, do dia e — no caso do meio — da entrada de CADA pessoa.

import { useMemo, useState } from 'react'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { formatCpf, formatTelefone, formatarBR, podeBloquearCpf } from '@credenciei/dominio'
import type { PessoaDoSetor, TipoBatida } from '@credenciei/contrato'
import { usePedido } from '../../../src/dados/pedido'
import { useSessao } from '../../../src/sessao/contexto'
import {
  contarPorFiltro, filtrarEquipe, NOME_DO_FILTRO, type FiltroDaEquipe,
} from '../../../src/equipe'
import {
  Aviso, Botao, Campo, Carregando, Cartao, Corpo, Indicador, Legenda, Respiro,
  Selo, Separador, Tela, TituloDaTela, TituloDeCartao,
} from '../../../src/ui/componentes'
import { Icone } from '../../../src/ui/icone'
import { FichaDaPessoaModal } from '../../../src/ui/ficha-da-pessoa'
import { BotaoDePlanilha } from '../../../src/ui/planilha'
import { corDaEtapa, espaco, raio, texto, tipo } from '../../../src/ui/tema'
import { useTema, type Tokens } from '../../../src/ui/tema-contexto'

const FILTROS: FiltroDaEquipe[] = ['todos', 'pendencias', 'presentes', 'ausentes', 'nao_ativados']

const ICONE_DO_INDICADOR: Record<string, string> = {
  total: 'Users',
  pendencias: 'AlertTriangle',
  a_receber: 'Wallet',
}

const ROTULO_DA_ETAPA: Record<TipoBatida, string> = {
  entrada: 'Entrada',
  meio: 'Meio',
  fim: 'Saída',
}

export default function EquipeDoSetor() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const { cliente, sessao } = useSessao()
  const { cor } = useTema()
  const e = useEstilos()

  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState<FiltroDaEquipe>('todos')
  const [versao, setVersao] = useState(0)
  /** Quem está com a ficha aberta. `null` é ninguém. */
  const [aberta, setAberta] = useState<string | null>(null)

  const { pedido, recarregar } = usePedido(
    () => cliente.equipeDoSetor(String(id)),
    [cliente, id, versao],
  )

  const dados = pedido.estado === 'pronto' ? pedido.dados : null
  const contagem = dados ? contarPorFiltro(dados.pessoas) : null
  const visiveis = dados ? filtrarEquipe(dados.pessoas, { busca, filtro }) : []

  return (
    <Tela>
      {pedido.estado === 'carregando' ? <Carregando /> : null}

      {pedido.estado === 'falhou' ? (
        <>
          <Aviso tipo="erro">{pedido.mensagem}</Aviso>
          <Botao titulo="Tentar de novo" onPress={recarregar} tipo="secundario" />
        </>
      ) : null}

      {dados && contagem ? (
        <>
          <TituloDaTela>{dados.setorNome}</TituloDaTela>
          <Legenda>{dados.eventoNome}</Legenda>
          <Respiro />

          <View style={e.acoes}>
            <View style={e.acaoLarga}>
              <BotaoDePlanilha setorId={String(id)} aoImportar={() => setVersao(v => v + 1)} />
            </View>
            <View style={e.acaoLarga}>
              <Botao titulo="Escanear QR" onPress={() => router.push('/escanear')} tipo="acento" />
            </View>
          </View>
          {/*
            Mesma régua de quem PODE conferir (`podeBloquearCpf` — quem
            gerencia evento, supervisor e suporte): o operador de portão lê o
            QR, não decide quem fica na equipe, então nem vê o botão.
          */}
          {podeBloquearCpf(sessao?.papel) ? (
            <>
              <Respiro altura={espaco.s} />
              <Botao
                titulo="Conferência de equipe"
                onPress={() => router.push(`/conferencia/${id}` as never)}
                tipo="secundario"
              />
            </>
          ) : null}

          <Respiro />

          <View style={e.grade}>
            {dados.indicadores.map(i => (
              <View key={i.chave} style={e.gradeItem}>
                <Indicador
                  rotulo={i.rotulo}
                  // "a_receber" é sempre número — só a ficha entre organizações usa texto pronto.
                  valor={i.chave === 'a_receber' ? emReais(i.valor as number) : i.valor}
                  sub={i.sub}
                  tom={i.tom}
                  icone={ICONE_DO_INDICADOR[i.chave] ?? 'Users'}
                />
              </View>
            ))}
          </View>

          <Respiro altura={espaco.m} />
          <Cartao>
            <View style={e.tituloComIcone}>
              <Icone nome="Activity" tamanho={16} tom={cor.sucesso600} />
              <TituloDeCartao>Progresso da equipe</TituloDeCartao>
            </View>
            <Legenda>
              Quantos dos {dados.pessoas.length} funcionários já registraram cada etapa
            </Legenda>
            <Respiro altura={espaco.g} />
            {dados.progresso.map(p => (
              <BarraDaEtapa key={p.etapa} etapa={p.etapa} feitos={p.feitos} total={p.total} />
            ))}
          </Cartao>

          <Campo
            value={busca}
            onChangeText={setBusca}
            placeholder="Buscar por nome, CPF, empresa, função…"
            autoCapitalize="none"
            autoCorrect={false}
            ajuda={`${visiveis.length} de ${dados.pessoas.length}`}
          />

          <View style={e.filtros}>
            {FILTROS.map(f => {
              const ativo = f === filtro
              return (
                <Pressable
                  key={f}
                  onPress={() => setFiltro(f)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: ativo }}
                  style={[e.filtro, ativo && e.filtroAtivo]}
                >
                  <Text style={[e.filtroTexto, ativo && e.filtroTextoAtivo]}>
                    {NOME_DO_FILTRO[f]}
                  </Text>
                  <View style={[e.contador, ativo && e.contadorAtivo]}>
                    <Text style={[e.contadorTexto, ativo && e.contadorTextoAtivo]}>
                      {contagem[f]}
                    </Text>
                  </View>
                </Pressable>
              )
            })}
          </View>

          <Respiro altura={espaco.m} />

          {visiveis.length === 0 ? (
            <Cartao>
              <Corpo>
                {busca
                  ? 'Ninguém com esse nome, CPF ou empresa.'
                  : filtro === 'todos'
                    ? 'Este setor ainda não tem equipe. Importe uma planilha ou mande o link do formulário.'
                    : `Ninguém em "${NOME_DO_FILTRO[filtro]}".`}
              </Corpo>
            </Cartao>
          ) : (
            <Cartao semPadding>
              {visiveis.map((p, i) => (
                <View key={p.participacaoId}>
                  {i > 0 ? <View style={e.fio} /> : null}
                  <LinhaDaPessoa pessoa={p} aoTocar={() => setAberta(p.participacaoId)} />
                </View>
              ))}
            </Cartao>
          )}
        </>
      ) : null}

      {aberta ? (
        <FichaDaPessoaModal
          participacaoId={aberta}
          aoFechar={() => setAberta(null)}
          aoMudar={() => setVersao(v => v + 1)}
        />
      ) : null}
    </Tela>
  )
}

// ─── Peças ──────────────────────────────────────────────────────────────────

/**
 * Uma pessoa na lista.
 *
 * A linha inteira é tocável, e não só o nome: num celular, um alvo do tamanho
 * de uma palavra é o que faz a pessoa errar três vezes antes de acertar.
 */
function LinhaDaPessoa({
  pessoa, aoTocar,
}: { pessoa: PessoaDoSetor; aoTocar: () => void }) {
  const { uso } = useTema()
  const e = useEstilos()
  return (
    <Pressable
      onPress={aoTocar}
      accessibilityRole="button"
      accessibilityLabel={`Abrir a ficha de ${pessoa.nome}`}
      style={({ pressed }) => [e.pessoa, pressed && e.pessoaTocada]}
    >
      <View style={e.retrato}>
        <Text style={e.iniciais}>{iniciaisDe(pessoa.nome)}</Text>
      </View>

      <View style={e.pessoaTexto}>
        <View style={e.pessoaTopo}>
          <Text style={e.nome} numberOfLines={1}>{pessoa.nome}</Text>
          {!pessoa.ativo ? <Selo texto="Não ativado" tipo="aviso" /> : null}
        </View>

        <Legenda>
          {[pessoa.empresa, pessoa.funcao].filter(Boolean).join(' · ') || 'Sem empresa'}
        </Legenda>
        <Legenda>{formatCpf(pessoa.cpf)}{pessoa.telefone ? ` · ${formatTelefone(pessoa.telefone)}` : ''}</Legenda>

        <View style={e.etapas}>
          <Bolinha etapa="entrada" em={pessoa.entrada} status={pessoa.statusEntrada} />
          <Bolinha etapa="meio" em={pessoa.meio} status={pessoa.statusMeio} />
          <Bolinha etapa="fim" em={pessoa.fim} status={pessoa.statusFim} />
        </View>
      </View>
      <Icone nome="ChevronRight" tamanho={16} tom={uso.tintaFraca} />
    </Pressable>
  )
}

/**
 * Uma etapa de uma pessoa.
 *
 * A cor vem do STATUS, não de ter horário: verde é feito, âmbar é dentro do
 * prazo, vermelho é prazo vencido, cinza é janela que nem abriu. Pintar tudo
 * que não tem horário de cinza deixaria a equipe inteira apagada — o caso mais
 * comum é a etapa ser livre.
 */
function Bolinha({
  etapa, em, status,
}: { etapa: TipoBatida; em: string | null; status: PessoaDoSetor['statusEntrada'] }) {
  const { cor } = useTema()
  const e = useEstilos()
  const tom = {
    feito: corDaEtapa[etapa],
    aberto: cor.aviso600,
    fechado: cor.erro600,
    indefinido: cor.neutro300,
  }[status]

  return (
    <View style={e.etapa}>
      <View style={[e.ponto, { backgroundColor: tom }]} />
      <Text style={[e.etapaTexto, status === 'fechado' && e.etapaAtrasada]}>
        {em ? formatarBR(em, 'hora') : ROTULO_DA_ETAPA[etapa]}
      </Text>
    </View>
  )
}

function BarraDaEtapa({
  etapa, feitos, total,
}: { etapa: TipoBatida; feitos: number; total: number }) {
  const e = useEstilos()
  const pct = total > 0 ? Math.round((feitos / total) * 100) : 0
  return (
    <View style={e.barraFora}>
      <View style={e.barraTopo}>
        <View style={e.barraNome}>
          <View style={[e.ponto, { backgroundColor: corDaEtapa[etapa] }]} />
          <Text style={e.barraRotulo}>{ROTULO_DA_ETAPA[etapa]}</Text>
        </View>
        <Text style={e.barraNumero}>{feitos}/{total} · {pct}%</Text>
      </View>
      <View style={e.trilho}>
        {pct > 0 ? (
          <View style={[e.barra, { width: `${pct}%`, backgroundColor: corDaEtapa[etapa] }]} />
        ) : null}
      </View>
    </View>
  )
}

function iniciaisDe(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return '?'
  const letras = partes.length > 1
    ? (partes[0]?.[0] ?? '') + (partes[partes.length - 1]?.[0] ?? '')
    : (partes[0] ?? '').slice(0, 2)
  return letras.toUpperCase()
}

/** Reais à mão: `toLocaleString` depende de dados que o celular pode não ter. */
function emReais(valor: number): string {
  const centavos = Math.round(valor * 100)
  const inteiros = String(Math.floor(centavos / 100))
  const resto = String(centavos % 100).padStart(2, '0')
  let comPontos = ''
  for (let i = 0; i < inteiros.length; i++) {
    const faltam = inteiros.length - i
    comPontos += inteiros[i]
    if (faltam > 1 && (faltam - 1) % 3 === 0) comPontos += '.'
  }
  return `R$ ${comPontos},${resto}`
}

function criarEstilos(cor: Tokens['cor'], uso: Tokens['uso']) {
  return StyleSheet.create({
  acoes: { flexDirection: 'row', gap: espaco.s },
  acaoLarga: { flex: 1 },

  grade: { flexDirection: 'row', flexWrap: 'wrap', gap: espaco.m },
  gradeItem: { width: '48%', flexGrow: 1 },

  tituloComIcone: { flexDirection: 'row', alignItems: 'center', gap: 6 },

  barraFora: { marginBottom: espaco.g },
  barraTopo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  barraNome: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  barraRotulo: { ...texto.corpoForte, color: uso.tinta },
  barraNumero: { ...texto.xs, color: uso.tintaFraca },
  trilho: { height: 6, borderRadius: 999, backgroundColor: cor.neutro100, overflow: 'hidden' },
  barra: { height: '100%', borderRadius: 999 },

  filtros: { flexDirection: 'row', flexWrap: 'wrap', gap: espaco.s },
  filtro: {
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
  filtroAtivo: { backgroundColor: cor.acento500, borderColor: cor.acento600 },
  filtroTexto: { ...texto.xs, fontFamily: tipo.semi, color: uso.tintaMedia },
  filtroTextoAtivo: { color: '#ffffff' },
  contador: {
    minWidth: 18,
    paddingHorizontal: 4,
    borderRadius: 999,
    backgroundColor: cor.neutro100,
    alignItems: 'center',
  },
  contadorAtivo: { backgroundColor: 'rgba(255,255,255,0.25)' },
  contadorTexto: { ...texto.xxs, fontFamily: tipo.semi, color: uso.tintaMedia },
  contadorTextoAtivo: { color: '#ffffff' },

  fio: { height: 1, backgroundColor: uso.borda, marginLeft: 60 },
  pessoa: { flexDirection: 'row', alignItems: 'center', gap: espaco.m, padding: espaco.g },
  pessoaTocada: { backgroundColor: cor.neutro50 },
  retrato: {
    width: 36,
    height: 36,
    borderRadius: 999,
    backgroundColor: cor.neutro100,
    borderWidth: 1,
    borderColor: uso.borda,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iniciais: { ...texto.xxs, fontFamily: tipo.semi, color: cor.neutro600 },
  pessoaTexto: { flex: 1, minWidth: 0, gap: 2 },
  pessoaTopo: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  nome: { ...texto.corpoForte, color: uso.tinta, flexShrink: 1 },

  etapas: { flexDirection: 'row', gap: espaco.g, marginTop: 6 },
  etapa: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  ponto: { width: 7, height: 7, borderRadius: 999 },
  etapaTexto: { ...texto.xxs, color: uso.tintaFraca },
  etapaAtrasada: { color: cor.erro700, fontFamily: tipo.semi },
  })
}

function useEstilos() {
  const { cor, uso } = useTema()
  return useMemo(() => criarEstilos(cor, uso), [cor, uso])
}
