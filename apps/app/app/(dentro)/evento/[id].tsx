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

import { useState } from 'react'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import * as Clipboard from 'expo-clipboard'
import { formatarBR } from '@credenciei/dominio'
import type { SetorDetalhado, TipoBatida } from '@credenciei/contrato'
import { usePedido } from '../../../src/dados/pedido'
import { mensagemDoErro } from '../../../src/dados/pedido'
import { useSessao } from '../../../src/sessao/contexto'
import {
  Aviso, Botao, Campo, Carregando, Cartao, Corpo, Etiqueta, Indicador, Legenda,
  Respiro, Selo, Separador, Tela, TituloDaTela, TituloDeCartao,
} from '../../../src/ui/componentes'
import { Icone } from '../../../src/ui/icone'
import { BotaoDePlanilha } from '../../../src/ui/planilha'
import { CartaoDaPortaria } from '../../../src/ui/portaria'
import { cor, corDaEtapa, espaco, raio, texto, tipo, uso } from '../../../src/ui/tema'

const ICONE_DO_INDICADOR: Record<string, string> = {
  setores: 'Users',
  funcionarios: 'UserCheck',
  presentes: 'Clock',
  nao_chegaram: 'Clock',
}

const ROTULO_DA_ETAPA: Record<TipoBatida, string> = {
  entrada: 'Entrada',
  meio: 'Meio',
  fim: 'Saída',
}

export default function ConfiguracaoDoEvento() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const { cliente } = useSessao()

  const [versao, setVersao] = useState(0)
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [criando, setCriando] = useState(false)

  const { pedido, recarregar } = usePedido(
    () => cliente.evento(String(id)),
    [cliente, id, versao],
  )

  const dados = pedido.estado === 'pronto' ? pedido.dados : null

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

          <View style={e.grade}>
            {dados.indicadores.map(i => (
              <View key={i.chave} style={e.gradeItem}>
                <Indicador
                  rotulo={i.rotulo}
                  valor={i.valor}
                  sub={i.sub}
                  tom={i.tom}
                  icone={<Icone nome={ICONE_DO_INDICADOR[i.chave] ?? 'Users'} tamanho={16} tom="#ffffff" />}
                />
              </View>
            ))}
          </View>

          <Respiro altura={espaco.m} />
          <Cartao>
            <View style={e.titulo}>
              <Icone nome="Activity" tamanho={16} tom={cor.sucesso600} />
              <TituloDeCartao>Progresso de presença</TituloDeCartao>
            </View>
            <Legenda>
              Quantos dos {dados.totalPessoas} funcionários já registraram cada etapa
            </Legenda>
            <Respiro altura={espaco.g} />
            {dados.progresso.map(p => (
              <BarraDaEtapa key={p.etapa} etapa={p.etapa} feitos={p.feitos} total={p.total} />
            ))}
          </Cartao>

          <Respiro altura={espaco.s} />
          <Etiqueta>Fornecedores e setores</Etiqueta>
          <Legenda>Cada setor gera um link próprio de cadastro para a equipe</Legenda>
          <Respiro altura={espaco.m} />

          <CartaoDaPortaria
            portaria={dados.portaria}
            ocupado={ocupado}
            aoAlternar={aberta => agir(() => cliente.alternarPortaria(String(id), aberta))}
            aoTrocarQr={() => agir(() => cliente.trocarTokenDaPortaria(String(id)))}
          />

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
            <Botao titulo="Novo fornecedor / setor" onPress={() => setCriando(true)} />
          )}

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
            setores.map(s => (
              <CartaoDoSetor
                key={s.setorId}
                setor={s}
                aoVerEquipe={() => router.push(`/setor/${s.setorId}` as never)}
                aoImportar={() => setVersao(v => v + 1)}
              />
            ))
          )}

        </>
      ) : null}
    </Tela>
  )
}

// ─── Peças ──────────────────────────────────────────────────────────────────

function Metadado({ icone, texto: valor }: { icone: string; texto: string }) {
  return (
    <View style={e.metaItem}>
      <Icone nome={icone} tamanho={12} tom={uso.tintaFraca} />
      <Text style={e.metaTexto} numberOfLines={1}>{valor}</Text>
    </View>
  )
}

function BarraDaEtapa({
  etapa, feitos, total,
}: { etapa: TipoBatida; feitos: number; total: number }) {
  const pct = total > 0 ? Math.round((feitos / total) * 100) : 0

  return (
    <View style={e.etapa}>
      <View style={e.etapaTopo}>
        <View style={e.etapaNome}>
          <View style={[e.ponto, { backgroundColor: corDaEtapa[etapa] }]} />
          <Text style={e.etapaRotulo}>{ROTULO_DA_ETAPA[etapa]}</Text>
        </View>
        <Text style={e.etapaNumero}>{feitos}/{total} · {pct}%</Text>
      </View>
      <View style={e.trilho}>
        {pct > 0 ? (
          <View style={[e.barra, { width: `${pct}%`, backgroundColor: corDaEtapa[etapa] }]} />
        ) : null}
      </View>
    </View>
  )
}

/**
 * Um setor.
 *
 * A barra de progresso só aparece quando existe um teto para comparar: ela diz
 * o que o número sozinho não diz — o quanto falta. Sem `estimado`, ela seria
 * uma barra sem escala.
 */
function CartaoDoSetor({
  setor, aoVerEquipe, aoImportar,
}: { setor: SetorDetalhado; aoVerEquipe: () => void; aoImportar: () => void }) {
  const [copiado, setCopiado] = useState(false)
  const pct = setor.estimado && setor.estimado > 0
    ? Math.min(100, Math.round((setor.pessoas / setor.estimado) * 100))
    : null

  async function copiarLink() {
    try {
      await Clipboard.setStringAsync(setor.linkDoFormulario)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      // Sem área de transferência: o link continua na tela para copiar à mão.
    }
  }

  return (
    <Cartao>
      <TituloDeCartao>{setor.nome}</TituloDeCartao>
      <Respiro altura={espaco.xs} />

      <View style={e.setorMeta}>
        <Metadado
          icone="Users"
          texto={`${setor.pessoas} ${setor.pessoas === 1 ? 'pessoa' : 'pessoas'}${setor.estimado ? ` de ${setor.estimado}` : ''}`}
        />
        {setor.valorPorPessoa !== null ? (
          <Metadado icone="Wallet" texto={`${emReais(setor.valorPorPessoa)} por pessoa`} />
        ) : null}
      </View>

      {pct !== null ? (
        <>
          <Respiro altura={espaco.m} />
          <View style={e.linhaDaBarra}>
            <View style={e.trilho}>
              <View
                style={[
                  e.barra,
                  { width: `${pct}%`, backgroundColor: pct >= 100 ? cor.sucesso600 : cor.acento500 },
                ]}
              />
            </View>
            <Text style={[e.pct, pct >= 100 && e.pctCheio]}>{pct}%</Text>
          </View>
        </>
      ) : null}

      <Respiro altura={espaco.m} />
      <Botao titulo="Ver equipe" onPress={aoVerEquipe} tipo="secundario" />
      <Respiro altura={espaco.s} />
      <View style={e.acoesDoSetor}>
        <View style={e.acaoLarga}>
          <Botao
            titulo={copiado ? 'Link copiado' : 'Copiar link'}
            onPress={copiarLink}
            tipo="secundario"
          />
        </View>
        {/* Um botão só para as três operações de planilha — três na fileira
            quebrariam a linha e empurrariam para baixo o que se usa sempre. */}
        <View style={e.acaoLarga}>
          <BotaoDePlanilha setorId={setor.setorId} aoImportar={aoImportar} />
        </View>
      </View>

      <Separador />

      <View style={e.supervisores}>
        <View style={e.supervisoresTitulo}>
          <Icone nome="ShieldCheck" tamanho={12} tom={uso.tintaFraca} />
          <Text style={e.rotuloPequeno}>SUPERVISORES</Text>
        </View>
        {setor.supervisores.length === 0 ? (
          <Legenda>Nenhum supervisor vinculado a este setor</Legenda>
        ) : (
          setor.supervisores.map(s => (
            <View key={s.id} style={e.supervisor}>
              <Corpo forte>{s.nome}</Corpo>
              {!s.ativo ? <Selo texto="Inativo" tipo="aviso" /> : null}
            </View>
          ))
        )}
      </View>
    </Cartao>
  )
}

function FormularioDeSetor({
  ocupado, aoCriar, aoCancelar,
}: {
  ocupado: boolean
  aoCriar: (dados: { nome: string; estimado?: number | null; valorPorPessoa?: number | null }) => void
  aoCancelar: () => void
}) {
  const [nome, setNome] = useState('')
  const [estimado, setEstimado] = useState('')
  const [valor, setValor] = useState('')

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
        rotulo="Quantas pessoas você espera"
        value={estimado}
        onChangeText={t => setEstimado(t.replace(/\D/g, ''))}
        placeholder="opcional"
        keyboardType="number-pad"
        ajuda="Vira a barra de progresso do setor."
      />
      <Campo
        rotulo="Valor por pessoa"
        value={valor}
        onChangeText={t => setValor(t.replace(/\D/g, ''))}
        placeholder="opcional"
        keyboardType="number-pad"
      />

      <Botao
        titulo="Criar setor"
        ocupado={ocupado}
        onPress={() => aoCriar({
          nome,
          estimado: estimado ? Number(estimado) : null,
          valorPorPessoa: valor ? Number(valor) : null,
        })}
      />
      <Respiro altura={espaco.s} />
      <Botao titulo="Cancelar" onPress={aoCancelar} tipo="fantasma" />
    </Cartao>
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

const e = StyleSheet.create({
  cabecalho: { flexDirection: 'row', alignItems: 'center', gap: espaco.s, flexWrap: 'wrap' },
  meta: { flexDirection: 'row', flexWrap: 'wrap', gap: espaco.m },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: '100%' },
  metaTexto: { ...texto.xs, fontFamily: tipo.regular, color: uso.tintaFraca, flexShrink: 1 },

  grade: { flexDirection: 'row', flexWrap: 'wrap', gap: espaco.m },
  gradeItem: { width: '48%', flexGrow: 1 },

  titulo: { flexDirection: 'row', alignItems: 'center', gap: 6 },

  etapa: { marginBottom: espaco.g },
  etapaTopo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  etapaNome: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ponto: { width: 7, height: 7, borderRadius: 999 },
  etapaRotulo: { ...texto.corpoForte, color: uso.tinta },
  etapaNumero: { ...texto.xs, color: uso.tintaFraca },

  trilho: { flex: 1, height: 6, borderRadius: 999, backgroundColor: cor.neutro100, overflow: 'hidden' },
  barra: { height: '100%', borderRadius: 999 },
  linhaDaBarra: { flexDirection: 'row', alignItems: 'center', gap: espaco.s },
  pct: { ...texto.xxs, fontFamily: tipo.semi, color: uso.tintaFraca },
  pctCheio: { color: cor.sucesso700 },

  setorMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: espaco.m },
  supervisores: { gap: espaco.s },
  supervisoresTitulo: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  rotuloPequeno: { ...texto.etiqueta, color: uso.tintaFraca },
  supervisor: { flexDirection: 'row', alignItems: 'center', gap: espaco.s },
  acoesDoSetor: { flexDirection: 'row', gap: espaco.s },
  acaoLarga: { flex: 1 },

})
