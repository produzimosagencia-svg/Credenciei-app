// O campo de data e hora.
//
// ─── MESMO LAYOUT DO SELETOR DO SITE ────────────────────────────────────────
//
// Pedido do Juan, 13/09/2026: nos dois lugares (site e app) tem que ser o
// mesmo desenho. Copiado de `components/DateTimePicker.tsx` — o calendário
// do mês (semana começando na segunda) e a lista de horários de 5 em 5
// minutos lado a lado (aqui, um embaixo do outro — a tela é estreita demais
// para os dois de lado), com Limpar / Cancelar / Aplicar no rodapé.
//
// Antes disto, só o celular tinha um seletor de verdade (o do sistema
// operacional — sem nenhuma semelhança com o do site); o navegador caía num
// par de campos de texto com máscara. Os dois motivos para essa saída fácil
// não existem mais: o seletor agora é este mesmo componente, web e nativo.
//
// ─── O ERRO QUE ESTE COMPONENTE NÃO PODE REPETIR ────────────────────────────
//
// No sistema web, o seletor de data gravava num campo escondido controlado pelo
// React — e o React escreve a propriedade direto, sem emitir evento. A
// validação da tela ficou congelada nos valores da carga da página: o produtor
// corrigia tudo certo e continuava barrado por um veredito velho.
//
// Aqui o valor sobe por `aoMudar` a cada alteração, e quem valida lê o estado
// atual no instante da decisão. Não existe campo escondido, nem cache.

import { useMemo, useRef, useState } from 'react'
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { diaBRT } from '@credenciei/dominio'
import { deISO, paraISO } from '../data'
import { Icone } from './icone'
import { espaco, gradienteMarca, raio, texto, tipo } from './tema'
import { useTema, type Tokens } from './tema-contexto'

const p2 = (n: number) => String(n).padStart(2, '0')

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]
const DIAS_DA_SEMANA = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']

function gerarHorarios(): string[] {
  const horarios: string[] = []
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 5) horarios.push(`${p2(h)}:${p2(m)}`)
  }
  return horarios
}
const HORARIOS = gerarHorarios()
/** Altura de cada linha da lista — usada só para calcular o scroll inicial. */
const ALTURA_DO_HORARIO = 46

/** A segunda-feira da semana que contém `d`. */
function segundaDaSemana(d: Date): Date {
  const diaDaSemana = (d.getDay() + 6) % 7 // 0 = segunda
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - diaDaSemana)
}

/** Todas as semanas (segunda a domingo) que tocam o mês de `mesReferencia`. */
function gerarDiasDoMes(mesReferencia: Date): Date[] {
  const primeiro = new Date(mesReferencia.getFullYear(), mesReferencia.getMonth(), 1)
  const ultimo = new Date(mesReferencia.getFullYear(), mesReferencia.getMonth() + 1, 0)
  const inicio = segundaDaSemana(primeiro)
  const fimDaSemana = segundaDaSemana(ultimo)
  const fim = new Date(fimDaSemana.getFullYear(), fimDaSemana.getMonth(), fimDaSemana.getDate() + 6)

  const dias: Date[] = []
  for (let d = inicio; d <= fim; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) dias.push(d)
  return dias
}

const soData = (d: Date) => `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()}`
/** "05/09/2026" → Date local, sem depender de fuso. */
function dataDoBR(dataBR: string): Date | null {
  const d = (dataBR ?? '').replace(/\D/g, '')
  if (d.length !== 8) return null
  const dia = Number(d.slice(0, 2)), mes = Number(d.slice(2, 4)), ano = Number(d.slice(4))
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null
  return new Date(ano, mes - 1, dia)
}

export function CampoDeDataHora({
  rotulo, valor, aoMudar, ajuda,
}: {
  rotulo: string
  /** Instante ISO, ou `null` quando ainda não há valor. */
  valor: string | null
  aoMudar: (iso: string | null) => void
  ajuda?: string
}) {
  const { cor, uso } = useTema()
  const e = useMemo(() => criarEstilos(cor, uso), [cor, uso])
  const atual = deISO(valor)
  const [data, setData] = useState(atual.data)
  const [hora, setHora] = useState(atual.hora)
  const [aberto, setAberto] = useState(false)

  // Estado de edição, só enquanto o modal está aberto — "Cancelar" descarta.
  const [dataEditada, setDataEditada] = useState<Date | null>(null)
  const [horaEditada, setHoraEditada] = useState<string | null>(null)
  const [mesVisivel, setMesVisivel] = useState(new Date())
  const rolagem = useRef<ScrollView>(null)

  /** Sempre que um dos dois muda, o instante inteiro sobe — ou `null`. */
  function propagar(novaData: string, novaHora: string) {
    setData(novaData)
    setHora(novaHora)
    aoMudar(paraISO(novaData, novaHora))
  }

  function abrir() {
    const dataAtual = dataDoBR(data) ?? new Date()
    setDataEditada(dataDoBR(data))
    setHoraEditada(hora || null)
    setMesVisivel(dataAtual)
    setAberto(true)

    // Rola até o horário já escolhido — sem isto a lista sempre abre em
    // 00:00, e quem já tem 18:00 escolhido rolaria 216 itens à mão.
    const indice = HORARIOS.indexOf(hora)
    if (indice >= 0) {
      setTimeout(() => {
        rolagem.current?.scrollTo({ y: Math.max(0, indice * ALTURA_DO_HORARIO - ALTURA_DO_HORARIO * 2), animated: false })
      }, 50)
    }
  }

  function aplicar() {
    if (!dataEditada || !horaEditada) return
    propagar(soData(dataEditada), horaEditada)
    setAberto(false)
  }

  function limpar() {
    setData('')
    setHora('')
    aoMudar(null)
    setAberto(false)
  }

  const podeAplicar = !!dataEditada && !!horaEditada
  const hoje = diaBRT()
  const dias = useMemo(() => gerarDiasDoMes(mesVisivel), [mesVisivel])

  return (
    <View style={e.fora}>
      <Text style={e.rotulo}>{rotulo}</Text>
      <Pressable onPress={abrir} style={e.botao} accessibilityRole="button">
        <Text style={[e.botaoTexto, !data && e.vazio]}>
          {data ? `${data}${hora ? ` ${hora}` : ''}` : 'Selecionar data e hora'}
        </Text>
        <Icone nome="CalendarDays" tamanho={16} tom={uso.tintaFraca} />
      </Pressable>
      {ajuda ? <Text style={e.ajuda}>{ajuda}</Text> : null}

      <Modal visible={aberto} transparent animationType="fade" onRequestClose={() => setAberto(false)}>
        <Pressable style={e.fundo} onPress={() => setAberto(false)}>
          {/* `onStartShouldSetResponder` pararia o toque de vazar pro fundo sem
              precisar de mais uma lib — mas um Pressable vazio, que só existe
              para NÃO ser o `fundo`, já resolve com menos código: o toque para
              aqui e nunca chega no pai. */}
          <Pressable style={e.caixa} onPress={() => {}}>
            <View style={e.cabecalhoMes}>
              <Pressable
                onPress={() => setMesVisivel(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
                hitSlop={8}
                accessibilityLabel="Mês anterior"
              >
                <Icone nome="ChevronLeft" tamanho={18} tom={uso.tintaFraca} />
              </Pressable>
              <Text style={e.cabecalhoMesTexto}>
                {MESES[mesVisivel.getMonth()]!.replace(/^./, c => c.toUpperCase())} {mesVisivel.getFullYear()}
              </Text>
              <Pressable
                onPress={() => setMesVisivel(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
                hitSlop={8}
                accessibilityLabel="Próximo mês"
              >
                <Icone nome="ChevronRight" tamanho={18} tom={uso.tintaFraca} />
              </Pressable>
            </View>

            <View style={e.semana}>
              {DIAS_DA_SEMANA.map(d => <Text key={d} style={e.semanaTexto}>{d}</Text>)}
            </View>

            <View style={e.grade}>
              {dias.map(dia => {
                const foraDoMes = dia.getMonth() !== mesVisivel.getMonth()
                const selecionado = dataEditada
                  && dia.getFullYear() === dataEditada.getFullYear()
                  && dia.getMonth() === dataEditada.getMonth()
                  && dia.getDate() === dataEditada.getDate()
                const ehHoje = `${dia.getFullYear()}-${p2(dia.getMonth() + 1)}-${p2(dia.getDate())}` === hoje

                return (
                  <Pressable
                    key={dia.toISOString()}
                    onPress={() => {
                      setDataEditada(dia)
                      if (foraDoMes) setMesVisivel(dia)
                    }}
                    style={e.dia}
                  >
                    <View style={[
                      e.diaCirculo,
                      !selecionado && ehHoje && e.diaCirculoHoje,
                      selecionado && e.diaCirculoSelecionado,
                    ]}>
                      <Text style={[
                        e.diaTexto,
                        foraDoMes && !selecionado && e.diaTextoForaDoMes,
                        !selecionado && ehHoje && e.diaTextoHoje,
                        selecionado && e.diaTextoSelecionado,
                      ]}>
                        {dia.getDate()}
                      </Text>
                    </View>
                  </Pressable>
                )
              })}
            </View>

            <View style={e.separador} />

            <Text style={e.horarioTitulo}>Horário</Text>
            <ScrollView ref={rolagem} style={e.horarioLista} showsVerticalScrollIndicator={false}>
              {HORARIOS.map(h => {
                const selecionado = horaEditada === h
                return (
                  <Pressable
                    key={h}
                    onPress={() => setHoraEditada(h)}
                    style={[e.horarioItem, selecionado && e.horarioItemSelecionado]}
                  >
                    {selecionado ? (
                      <LinearGradient
                        colors={[...gradienteMarca.cores] as [string, string, string]}
                        locations={[...gradienteMarca.posicoes] as [number, number, number]}
                        start={gradienteMarca.inicio}
                        end={gradienteMarca.fim}
                        style={e.horarioGradiente}
                      >
                        <Text style={e.horarioTextoSelecionado}>{h}</Text>
                      </LinearGradient>
                    ) : (
                      <Text style={e.horarioTexto}>{h}</Text>
                    )}
                  </Pressable>
                )
              })}
            </ScrollView>

            <View style={e.rodape}>
              <Pressable onPress={limpar} hitSlop={8}>
                <Text style={e.rodapeLimpar}>Limpar</Text>
              </Pressable>
              <View style={e.rodapeAcoes}>
                <Pressable onPress={() => setAberto(false)} hitSlop={8}>
                  <Text style={e.rodapeCancelar}>Cancelar</Text>
                </Pressable>
                <Pressable onPress={aplicar} disabled={!podeAplicar}>
                  <LinearGradient
                    colors={[...gradienteMarca.cores] as [string, string, string]}
                    locations={[...gradienteMarca.posicoes] as [number, number, number]}
                    start={gradienteMarca.inicio}
                    end={gradienteMarca.fim}
                    style={[e.rodapeAplicar, !podeAplicar && e.rodapeAplicarDesabilitado]}
                  >
                    <Text style={e.rodapeAplicarTexto}>Aplicar</Text>
                  </LinearGradient>
                </Pressable>
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  )
}

function criarEstilos(cor: Tokens['cor'], uso: Tokens['uso']) {
  return StyleSheet.create({
    fora: { marginBottom: espaco.g },
    rotulo: { ...texto.xs, fontFamily: tipo.semi, color: uso.tintaMedia, marginBottom: 6 },
    botao: {
      minHeight: 52,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: espaco.s,
      paddingHorizontal: espaco.m,
      borderRadius: raio.campo,
      borderWidth: 1,
      borderColor: uso.borda,
      backgroundColor: uso.superficie,
    },
    botaoTexto: { ...texto.base, fontFamily: tipo.media, color: uso.tinta },
    vazio: { color: cor.neutro400 },
    ajuda: { ...texto.xs, fontFamily: tipo.regular, color: uso.tintaFraca, marginTop: 6 },

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
      paddingTop: espaco.g,
      paddingHorizontal: espaco.g,
    },

    cabecalhoMes: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: espaco.m,
    },
    cabecalhoMesTexto: { ...texto.corpoForte, color: uso.tinta, textTransform: 'capitalize' },

    semana: { flexDirection: 'row', marginBottom: 4 },
    semanaTexto: {
      flex: 1, textAlign: 'center', ...texto.xxs, fontFamily: tipo.semi, color: uso.tintaFraca, paddingVertical: 4,
    },

    grade: { flexDirection: 'row', flexWrap: 'wrap' },
    dia: {
      width: `${100 / 7}%`,
      aspectRatio: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 2,
    },
    /*
     * O círculo é menor que a célula (78%), não a célula inteira — é o que dá
     * o respiro entre os dias sem precisar de `gap` no container: `gap`
     * dividido por 7 colunas de largura percentual quebraria a conta e
     * empurraria o sétimo dia pra linha de baixo.
     */
    diaCirculo: {
      width: '78%', aspectRatio: 1, borderRadius: 999, alignItems: 'center', justifyContent: 'center',
    },
    diaCirculoHoje: { backgroundColor: cor.acento50 },
    diaCirculoSelecionado: { backgroundColor: cor.acento500 },
    diaTexto: { ...texto.base, fontFamily: tipo.media, color: uso.tinta },
    diaTextoForaDoMes: { color: cor.neutro300 },
    diaTextoHoje: { fontFamily: tipo.semi, color: cor.acento600 },
    diaTextoSelecionado: { fontFamily: tipo.semi, color: '#ffffff' },

    separador: { height: 1, backgroundColor: uso.borda, marginVertical: espaco.m },

    horarioTitulo: {
      ...texto.xxs, fontFamily: tipo.forte, color: uso.tintaFraca, textTransform: 'uppercase', marginBottom: espaco.s,
    },
    horarioLista: { maxHeight: 220, marginBottom: espaco.m },
    horarioItem: {
      minHeight: 40,
      marginBottom: 6,
      borderRadius: raio.campo,
      borderWidth: 1,
      borderColor: uso.borda,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    horarioItemSelecionado: { borderWidth: 0 },
    horarioTexto: { ...texto.base, fontFamily: tipo.semi, color: uso.tintaMedia },
    horarioGradiente: {
      width: '100%', height: '100%', minHeight: 40, alignItems: 'center', justifyContent: 'center',
    },
    horarioTextoSelecionado: { ...texto.base, fontFamily: tipo.semi, color: '#ffffff' },

    rodape: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderTopWidth: 1,
      borderTopColor: uso.borda,
      marginHorizontal: -espaco.g,
      paddingHorizontal: espaco.g,
      paddingVertical: espaco.m,
    },
    rodapeLimpar: { ...texto.xs, fontFamily: tipo.semi, color: uso.tintaFraca },
    rodapeAcoes: { flexDirection: 'row', alignItems: 'center', gap: espaco.m },
    rodapeCancelar: { ...texto.base, fontFamily: tipo.media, color: uso.tintaMedia },
    rodapeAplicar: {
      minHeight: 40, paddingHorizontal: espaco.g, borderRadius: raio.campo, alignItems: 'center', justifyContent: 'center',
    },
    rodapeAplicarDesabilitado: { opacity: 0.45 },
    rodapeAplicarTexto: { ...texto.base, fontFamily: tipo.forte, color: '#ffffff' },
  })
}
