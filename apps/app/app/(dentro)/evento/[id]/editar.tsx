// Editar o evento.
//
// É a tela que decide o comportamento do sistema inteiro naquele evento: a que
// horas a equipe pode bater, quais dias ela trabalha, e se o dia do evento
// trava por horário ou não.
//
// ─── AS TRÊS LIÇÕES QUE ESTA TELA CARREGA ───────────────────────────────────
//
// 1. O BLOQUEIO ABRE UM AVISO, NUNCA CALA. A primeira versão no sistema web
//    barrava o envio em silêncio — o produtor clicava em salvar, nada
//    acontecia, e ele saía acreditando que tinha salvado. Uma configuração que
//    a pessoa PENSA que salvou é mais perigosa que uma que ela sabe estar
//    errada.
//
// 2. A CONFERÊNCIA RECALCULA NO INSTANTE DO TOQUE. Depois, a mesma tela travou
//    de novo com um veredito velho: o seletor de data gravava sem emitir
//    evento, e a validação ficou congelada nos valores da carga da página. O
//    produtor corrigia tudo certo e continuava barrado, sem nada explicar.
//
// 3. A BATIDA LIVRE VEM ANTES DOS HORÁRIOS. Ela muda o significado de tudo que
//    vem abaixo: com ela ligada, os campos deixam de ser trava e viram
//    referência. Colocada depois, o produtor preencheria acreditando que
//    aqueles horários recusam alguém, e só então descobriria que não.

import { useEffect, useState } from 'react'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { conferirHorariosDoEvento, type ProblemaDeJanela } from '@credenciei/dominio'
import type {
  ConfiguracaoDoEvento, DiaDeTrabalho, EdicaoDoEvento, ResultadoDosDias,
} from '@credenciei/contrato'
import { diaDoInstante } from '../../../../src/data'
import { mensagemDoErro, usePedido } from '../../../../src/dados/pedido'
import { useSessao } from '../../../../src/sessao/contexto'
import {
  Aviso, Botao, Campo, Carregando, Cartao, Corpo, Etiqueta, Legenda, Respiro,
  Separador, Tela, TituloDaTela, TituloDeCartao,
} from '../../../../src/ui/componentes'
import { CampoDeDataHora } from '../../../../src/ui/data-hora'
import { Icone } from '../../../../src/ui/icone'
import { cor, espaco, raio, texto, tipo, uso } from '../../../../src/ui/tema'

/** Quantos dias antes e depois do evento aparecem na grade. */
const DIAS_ANTES = 14
const DIAS_DEPOIS = 7

const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'] as const

export default function EditarEvento() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const { cliente } = useSessao()

  const { pedido, recarregar } = usePedido(
    () => cliente.configuracaoDoEvento(String(id)),
    [cliente, id],
  )

  return (
    <Tela>
      <TituloDaTela>Editar evento</TituloDaTela>
      <Respiro />

      {pedido.estado === 'carregando' ? <Carregando /> : null}

      {pedido.estado === 'falhou' ? (
        <>
          <Aviso tipo="erro">{pedido.mensagem}</Aviso>
          <Botao titulo="Tentar de novo" onPress={recarregar} tipo="secundario" />
        </>
      ) : null}

      {pedido.estado === 'pronto' ? (
        <Formulario
          inicial={pedido.dados}
          aoSalvar={async dados => cliente.salvarEvento(String(id), dados)}
          aoSalvarDias={async dias => cliente.salvarDiasDeTrabalho(String(id), dias)}
          aoTerminar={() => router.back()}
        />
      ) : null}
    </Tela>
  )
}

function Formulario({
  inicial, aoSalvar, aoSalvarDias, aoTerminar,
}: {
  inicial: ConfiguracaoDoEvento
  aoSalvar: (dados: EdicaoDoEvento) => Promise<{ erro?: string }>
  aoSalvarDias: (dias: string[]) => Promise<{ resultado?: ResultadoDosDias; erro?: string }>
  aoTerminar: () => void
}) {
  const [nome, setNome] = useState(inicial.nome)
  const [descricao, setDescricao] = useState(inicial.descricao ?? '')
  const [local, setLocal] = useState(inicial.local ?? '')
  const [dataInicio, setDataInicio] = useState(inicial.dataInicio)
  const [dataFim, setDataFim] = useState(inicial.dataFim)
  const [batidaLivre, setBatidaLivre] = useState(inicial.batidaLivre)
  const [entradaInicio, setEntradaInicio] = useState(inicial.janelaEntradaInicio)
  const [entradaFim, setEntradaFim] = useState(inicial.janelaEntradaFim)
  const [saidaInicio, setSaidaInicio] = useState(inicial.janelaFimInicio)
  const [saidaFim, setSaidaFim] = useState(inicial.janelaFimFim)

  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [feito, setFeito] = useState<string | null>(null)
  const [bloqueio, setBloqueio] = useState<ProblemaDeJanela[] | null>(null)

  /**
   * A conferência, feita AGORA, sobre o estado atual.
   *
   * Nunca sobre um veredito guardado — foi assim que a tela do sistema web
   * travou de verdade, barrando o produtor com uma resposta calculada na carga
   * da página.
   */
  function conferir(): ProblemaDeJanela[] {
    return conferirHorariosDoEvento({
      data_inicio: dataInicio,
      data_fim: dataFim,
      janela_entrada_inicio: entradaInicio,
      janela_entrada_fim: entradaFim,
      janela_fim_inicio: saidaInicio,
      janela_fim_fim: saidaFim,
    })
  }

  // Os avisos que NÃO bloqueiam aparecem enquanto se preenche: eles pedem
  // atenção, não impedem. Os que bloqueiam só falam na hora do toque, e num
  // aviso que não dá para confundir com sucesso.
  const problemas = conferir()
  const alertas = problemas.filter(p => !p.bloqueia)

  async function salvar() {
    setErro(null)
    setFeito(null)

    const agora = conferir()
    const impedem = agora.filter(p => p.bloqueia)
    if (impedem.length > 0) return setBloqueio(impedem)

    setSalvando(true)
    try {
      const r = await aoSalvar({
        nome,
        descricao: descricao.trim() || null,
        local: local.trim() || null,
        dataInicio,
        dataFim,
        batidaLivre,
        janelaEntradaInicio: entradaInicio,
        janelaEntradaFim: entradaFim,
        janelaFimInicio: saidaInicio,
        janelaFimFim: saidaFim,
      })
      if (r.erro) return setErro(r.erro)
      setFeito('Evento salvo.')
    } catch (e) {
      setErro(mensagemDoErro(e))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <>
      {erro ? <Aviso tipo="erro">{erro}</Aviso> : null}
      {feito ? <Aviso tipo="sucesso">{feito}</Aviso> : null}

      <Cartao>
        <TituloDeCartao>Informações gerais</TituloDeCartao>
        <Legenda>Nome, descrição e local do evento</Legenda>
        <Respiro altura={espaco.m} />

        <Campo rotulo="Nome do evento *" value={nome} onChangeText={setNome} autoCapitalize="words" />
        <Campo
          rotulo="Descrição"
          value={descricao}
          onChangeText={setDescricao}
          multiline
          style={e.multiplasLinhas}
        />
        <Campo rotulo="Local" value={local} onChangeText={setLocal} autoCapitalize="words" />
      </Cartao>

      <Cartao>
        <TituloDeCartao>Duração</TituloDeCartao>
        <Legenda>Quando o evento começa e termina</Legenda>
        <Respiro altura={espaco.m} />

        <CampoDeDataHora rotulo="DATA DE INÍCIO *" valor={dataInicio} aoMudar={setDataInicio} />
        <CampoDeDataHora rotulo="DATA DE FIM *" valor={dataFim} aoMudar={setDataFim} />
      </Cartao>

      <Etiqueta>Horários do dia principal</Etiqueta>
      <Legenda>Quando a equipe pode bater entrada e saída no dia do evento</Legenda>
      <Respiro altura={espaco.m} />

      {/*
        A batida livre vem ANTES dos horários porque muda o significado deles.
      */}
      <Pressable onPress={() => setBatidaLivre(v => !v)} accessibilityRole="checkbox"
        accessibilityState={{ checked: batidaLivre }}>
        <Cartao>
          <View style={e.linhaDaChave}>
            <View style={[e.caixa, batidaLivre && e.caixaMarcada]}>
              {batidaLivre ? <Icone nome="Check" tamanho={12} tom="#ffffff" espessura={3} /> : null}
            </View>
            <View style={e.textoDaChave}>
              <Corpo forte>Batida livre no dia do evento</Corpo>
              <Respiro altura={espaco.xs} />
              <Corpo>
                A equipe bate quando chega e quando sai, sem horário fixo — do
                mesmo jeito que já funciona nos dias de montagem.
              </Corpo>
              <Respiro altura={espaco.xs} />
              <Legenda>
                Use quando a operação for por escala rotativa: em show grande a
                equipe entra a noite toda, em turnos, e uma janela fixa
                recusaria quem chega às três da manhã.
              </Legenda>
              <Respiro altura={espaco.xs} />
              <Legenda>
                Os horários abaixo continuam gravados e valendo como referência:
                são eles que a equipe recebe na mensagem do dia, e é por eles
                que o sistema calcula quem está atrasado. O que sai é só a
                recusa no portão.
              </Legenda>
            </View>
          </View>
        </Cartao>
      </Pressable>

      <Cartao>
        <View style={e.tituloComIcone}>
          <View style={[e.blocoDoIcone, { backgroundColor: cor.sucesso50 }]}>
            <Icone nome="LogIn" tamanho={14} tom={cor.sucesso600} />
          </View>
          <TituloDeCartao>Entrada</TituloDeCartao>
        </View>
        <Respiro altura={espaco.m} />
        <CampoDeDataHora rotulo="INÍCIO" valor={entradaInicio} aoMudar={setEntradaInicio} />
        <CampoDeDataHora rotulo="FIM" valor={entradaFim} aoMudar={setEntradaFim} />
      </Cartao>

      <Cartao>
        <View style={e.tituloComIcone}>
          <View style={[e.blocoDoIcone, { backgroundColor: cor.acento50 }]}>
            <Icone nome="LogOut" tamanho={14} tom={cor.acento500} />
          </View>
          <TituloDeCartao>Saída</TituloDeCartao>
        </View>
        <Respiro altura={espaco.m} />
        <CampoDeDataHora rotulo="INÍCIO" valor={saidaInicio} aoMudar={setSaidaInicio} />
        <CampoDeDataHora rotulo="FIM" valor={saidaFim} aoMudar={setSaidaFim} />
      </Cartao>

      {/*
        O meio perdeu o campo, mas NÃO pode perder a explicação: sem esta
        caixa, quem vê "Entrada" e "Saída" conclui que o meio deixou de
        existir — quando na verdade ele virou automático.
      */}
      <View style={e.meio}>
        <View style={[e.blocoDoIcone, { backgroundColor: cor.info50 }]}>
          <Icone nome="Camera" tamanho={14} tom={cor.info600} />
        </View>
        <View style={e.meioTexto}>
          <Corpo forte>Meio — automático</Corpo>
          <Respiro altura={espaco.xs} />
          <Corpo>
            O sistema pede a batida por foto 4 horas depois da entrada de cada
            pessoa. Quem entrar às 08:00 registra às 12:00; quem entrar às 10:30
            registra às 14:30.
          </Corpo>
          <Respiro altura={espaco.xs} />
          <Legenda>
            É pedido uma vez só, e não tem horário para configurar — a equipe
            não entra junta, e um horário fixo cobraria de quem acabou de
            chegar.
          </Legenda>
        </View>
      </View>

      {alertas.length > 0 ? (
        <>
          <Respiro altura={espaco.m} />
          {alertas.map(a => <Aviso key={a.mensagem} tipo="aviso">{a.mensagem}</Aviso>)}
        </>
      ) : null}

      <Respiro altura={espaco.m} />
      <Botao titulo="Salvar evento" onPress={salvar} ocupado={salvando} />

      <Separador />

      <DiasDeTrabalho
        diaPrincipal={dataInicio ? diaDoInstante(dataInicio) : inicial.diaPrincipal}
        dias={inicial.dias}
        aoSalvar={aoSalvarDias}
      />

      <Respiro />
      <Botao titulo="Voltar" onPress={aoTerminar} tipo="fantasma" />

      {bloqueio ? (
        <AvisoDeBloqueio problemas={bloqueio} aoFechar={() => setBloqueio(null)} />
      ) : null}
    </>
  )
}

/**
 * O bloqueio, num aviso que não dá para confundir com sucesso.
 *
 * Ele diz explicitamente que NADA foi salvo. A primeira versão desta barragem,
 * no sistema web, era silenciosa — e alguém saiu acreditando que tinha salvo
 * uma configuração que não existia.
 */
function AvisoDeBloqueio({
  problemas, aoFechar,
}: { problemas: ProblemaDeJanela[]; aoFechar: () => void }) {
  return (
    <Modal visible transparent animationType="fade" onRequestClose={aoFechar}>
      <View style={e.fundoDoAviso}>
        <View style={e.caixaDoAviso}>
          <View style={e.tituloComIcone}>
            <View style={[e.blocoDoIcone, { backgroundColor: cor.erro50 }]}>
              <Icone nome="AlertTriangle" tamanho={16} tom={cor.erro600} />
            </View>
            <TituloDeCartao>Não dá para salvar assim</TituloDeCartao>
          </View>

          <Respiro altura={espaco.m} />
          {problemas.map(p => (
            <View key={p.mensagem} style={e.problema}>
              <Corpo>{p.mensagem}</Corpo>
            </View>
          ))}

          <Respiro altura={espaco.m} />
          <Legenda>
            Nada foi salvo. Corrija os horários acima e toque em salvar de novo.
          </Legenda>

          <Respiro />
          <Botao titulo="Entendi" onPress={aoFechar} />
        </View>
      </View>
    </Modal>
  )
}

// ─── Os dias de trabalho ────────────────────────────────────────────────────

/**
 * Montagem, dia do evento e desmontagem.
 *
 * Marcar um dia é o que faz o sistema esperar a pessoa lá. É daqui que sai a
 * frase "estava escalado para 5 dias e veio em 4" no fechamento: dia não
 * marcado não é dia de trabalho, e ninguém é cobrado por ele.
 *
 * A grade é uma tira que rola de lado, e não um bloco de vinte e dois botões
 * quebrado em seis linhas: a sequência dos dias é o que dá sentido a ela, e
 * quebrar em linhas desfaz a linha do tempo.
 */
function DiasDeTrabalho({
  diaPrincipal, dias, aoSalvar,
}: {
  diaPrincipal: string | null
  dias: DiaDeTrabalho[]
  aoSalvar: (dias: string[]) => Promise<{ resultado?: ResultadoDosDias; erro?: string }>
}) {
  const travados = new Set(
    dias.filter(d => d.temBatidas && d.tipo !== 'principal').map(d => d.data),
  )
  const [marcados, setMarcados] = useState<Set<string>>(
    () => new Set(dias.filter(d => d.tipo !== 'principal').map(d => d.data)),
  )
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [feito, setFeito] = useState<string | null>(null)

  if (!diaPrincipal) {
    return (
      <Cartao>
        <TituloDeCartao>Dias de trabalho do evento</TituloDeCartao>
        <Respiro altura={espaco.s} />
        <Corpo>
          Defina a data do evento acima e salve para poder marcar os dias de
          preparação.
        </Corpo>
      </Cartao>
    )
  }

  const grade: string[] = []
  for (let i = -DIAS_ANTES; i <= DIAS_DEPOIS; i++) grade.push(somarDias(diaPrincipal, i))

  function alternar(dia: string) {
    if (dia === diaPrincipal || travados.has(dia)) return
    setFeito(null)
    setMarcados(atual => {
      const proximo = new Set(atual)
      if (proximo.has(dia)) proximo.delete(dia)
      else proximo.add(dia)
      return proximo
    })
  }

  async function salvar() {
    setErro(null)
    setFeito(null)
    setSalvando(true)
    try {
      const r = await aoSalvar([...marcados])
      if (r.erro) return setErro(r.erro)
      const res = r.resultado
      setFeito(
        `${res?.dias ?? 0} dia(s) de preparação salvos, além do dia do evento.`
        + (res && res.preservados > 0
          ? ` ${res.preservados} dia(s) desmarcado(s) foram mantidos porque já têm batidas registradas.`
          : ''),
      )
    } catch (e) {
      setErro(mensagemDoErro(e))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <>
      <Etiqueta>Dias de trabalho do evento</Etiqueta>
      <Legenda>
        Montagem, dia do evento e desmontagem — marque os dias em que a equipe
        trabalha
      </Legenda>
      <Respiro altura={espaco.m} />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={e.tira}>
        {grade.map(dia => {
          const ehPrincipal = dia === diaPrincipal
          const marcado = marcados.has(dia)
          const travado = travados.has(dia)
          // Montagem antes, desmontagem depois. Cada uma tem o seu QR, e a cor
          // é o que deixa isso legível de relance.
          const desmonte = dia > diaPrincipal
          const { semana, curto } = rotuloDoDia(dia)

          return (
            <Pressable
              key={dia}
              onPress={() => alternar(dia)}
              disabled={ehPrincipal || travado}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: ehPrincipal || marcado, disabled: ehPrincipal || travado }}
              style={[
                e.dia,
                ehPrincipal && e.diaPrincipal,
                !ehPrincipal && marcado && (desmonte ? e.diaDesmonte : e.diaMontagem),
                travado && e.diaTravado,
              ]}
            >
              <Text style={[e.diaSemana, ehPrincipal && e.diaTextoClaro]}>{semana}</Text>
              <Text style={[e.diaNumero, ehPrincipal && e.diaTextoClaro]}>{curto}</Text>
              <View style={e.diaMarca}>
                {ehPrincipal || (marcado && !travado)
                  ? <Icone nome="Check" tamanho={12} tom={ehPrincipal ? '#ffffff' : cor.acento700} espessura={3} />
                  : travado
                    ? <Icone nome="Lock" tamanho={11} tom={uso.tintaFraca} />
                    : null}
              </View>
            </Pressable>
          )
        })}
      </ScrollView>

      <Respiro altura={espaco.m} />

      <Cartao>
        <Legenda>
          <Corpo forte>Montagem</Corpo> (antes) — entrada e saída livres. O meio
          é calculado para cada pessoa, 4 horas depois da entrada dela.
        </Legenda>
        <Respiro altura={espaco.s} />
        <Legenda>
          <Corpo forte>Dia do evento</Corpo> — usa os horários configurados
          acima.
        </Legenda>
        <Respiro altura={espaco.s} />
        <Legenda>
          <Corpo forte>Desmontagem</Corpo> (depois) — mesma regra da montagem.
        </Legenda>

        <Separador />

        <Legenda>
          Cada etapa tem o seu próprio QR Code, e a credencial troca sozinha na
          virada do dia. O crachá da montagem não entra no dia do evento.
        </Legenda>
        <Respiro altura={espaco.s} />
        <Legenda>
          Dia não marcado não é dia de trabalho: ninguém consegue bater ponto
          nele, e ninguém é cobrado por não ter aparecido.
        </Legenda>
      </Cartao>

      {erro ? <Aviso tipo="erro">{erro}</Aviso> : null}
      {feito ? <Aviso tipo="sucesso">{feito}</Aviso> : null}

      {/*
        Botão próprio, e não o "Salvar evento": este bloco grava em outro
        lugar, e não deve depender de o produtor mexer em mais nada da tela.

        A contagem é só dos dias de PREPARAÇÃO — somar o dia do evento faria o
        número não bater com o que ele acabou de marcar.
      */}
      <Botao
        titulo={`Salvar ${marcados.size} dia${marcados.size === 1 ? '' : 's'} de preparação`}
        onPress={salvar}
        ocupado={salvando}
        tipo="secundario"
      />
    </>
  )
}

/** "2026-09-05" + 3 → "2026-09-08". Ao meio-dia, para o fuso não mexer no dia. */
function somarDias(dia: string, n: number): string {
  const [a, m, d] = dia.split('-').map(Number)
  const x = new Date(Date.UTC(a!, (m ?? 1) - 1, (d ?? 1) + n, 12))
  const p2 = (v: number) => String(v).padStart(2, '0')
  return `${x.getUTCFullYear()}-${p2(x.getUTCMonth() + 1)}-${p2(x.getUTCDate())}`
}

function rotuloDoDia(dia: string) {
  const [a, m, d] = dia.split('-').map(Number)
  const semana = new Date(Date.UTC(a!, (m ?? 1) - 1, d ?? 1, 12)).getUTCDay()
  return {
    semana: (SEMANA[semana] ?? '').toUpperCase(),
    curto: `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`,
  }
}

const e = StyleSheet.create({
  multiplasLinhas: { minHeight: 88, paddingTop: espaco.m, textAlignVertical: 'top' },

  linhaDaChave: { flexDirection: 'row', gap: espaco.m },
  textoDaChave: { flex: 1, minWidth: 0 },
  caixa: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: cor.neutro300,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  caixaMarcada: { backgroundColor: cor.acento500, borderColor: cor.acento600 },

  tituloComIcone: { flexDirection: 'row', alignItems: 'center', gap: espaco.s },
  blocoDoIcone: {
    width: 28,
    height: 28,
    borderRadius: raio.campo,
    alignItems: 'center',
    justifyContent: 'center',
  },

  meio: {
    flexDirection: 'row',
    gap: espaco.m,
    backgroundColor: cor.info50,
    borderWidth: 1,
    borderColor: cor.info200,
    borderRadius: raio.cartao,
    padding: espaco.g,
    marginBottom: espaco.m,
  },
  meioTexto: { flex: 1, minWidth: 0 },

  tira: { gap: espaco.s, paddingVertical: 2 },
  dia: {
    width: 62,
    paddingVertical: espaco.s,
    borderRadius: raio.campo,
    borderWidth: 1,
    borderColor: uso.borda,
    backgroundColor: uso.superficie,
    alignItems: 'center',
  },
  diaPrincipal: { backgroundColor: cor.acento500, borderColor: cor.acento600 },
  diaMontagem: { backgroundColor: cor.acento50, borderColor: cor.acento200 },
  diaDesmonte: { backgroundColor: cor.aviso50, borderColor: cor.aviso200 },
  diaTravado: { opacity: 0.7 },
  diaSemana: { ...texto.xxs, color: uso.tintaFraca },
  diaNumero: { ...texto.corpoForte, color: uso.tinta },
  diaMarca: { height: 16, justifyContent: 'center' },
  diaTextoClaro: { color: '#ffffff' },

  fundoDoAviso: {
    flex: 1,
    backgroundColor: 'rgba(17,17,19,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: espaco.gg,
  },
  caixaDoAviso: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: uso.superficie,
    borderRadius: raio.folha,
    padding: espaco.gg,
  },
  problema: {
    backgroundColor: cor.erro50,
    borderWidth: 1,
    borderColor: cor.erro200,
    borderRadius: raio.campo,
    padding: espaco.m,
    marginBottom: espaco.s,
  },
})
