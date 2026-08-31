// O campo de data e hora.
//
// ─── DOIS COMPORTAMENTOS, UM COMPONENTE ─────────────────────────────────────
//
// No celular, tocar abre o seletor do sistema — o calendário e o relógio que a
// pessoa já sabe usar, com o dedo. No navegador, onde esse seletor não existe,
// os dois campos são de texto com máscara.
//
// A alternativa seria escolher um dos dois para tudo. Máscara no celular é
// digitar oito números com o polegar; seletor forçado no navegador é uma
// biblioteca inteira para reimplementar o que o teclado já resolve.
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

import { useState } from 'react'
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import DateTimePicker from '@react-native-community/datetimepicker'
import { deISO, mascararDataBR, mascararHora, paraISO } from '../data'
import { Campo } from './componentes'
import { Icone } from './icone'
import { cor, espaco, raio, texto, tipo, uso } from './tema'

export function CampoDeDataHora({
  rotulo, valor, aoMudar, ajuda,
}: {
  rotulo: string
  /** Instante ISO, ou `null` quando ainda não há valor. */
  valor: string | null
  aoMudar: (iso: string | null) => void
  ajuda?: string
}) {
  const atual = deISO(valor)
  const [data, setData] = useState(atual.data)
  const [hora, setHora] = useState(atual.hora)
  const [abrindo, setAbrindo] = useState<'data' | 'hora' | null>(null)

  /** Sempre que um dos dois muda, o instante inteiro sobe — ou `null`. */
  function propagar(novaData: string, novaHora: string) {
    setData(novaData)
    setHora(novaHora)
    aoMudar(paraISO(novaData, novaHora))
  }

  if (Platform.OS === 'web') {
    return (
      <View style={e.fora}>
        <Text style={e.rotulo}>{rotulo}</Text>
        <View style={e.linha}>
          <View style={e.metade}>
            <Campo
              value={data}
              onChangeText={t => propagar(mascararDataBR(t), hora)}
              placeholder="DD/MM/AAAA"
              keyboardType="number-pad"
              maxLength={10}
            />
          </View>
          <View style={e.metade}>
            <Campo
              value={hora}
              onChangeText={t => propagar(data, mascararHora(t))}
              placeholder="HH:MM"
              keyboardType="number-pad"
              maxLength={5}
            />
          </View>
        </View>
        {ajuda ? <Text style={e.ajuda}>{ajuda}</Text> : null}
      </View>
    )
  }

  const instante = valor ? new Date(valor) : new Date()

  return (
    <View style={e.fora}>
      <Text style={e.rotulo}>{rotulo}</Text>
      <View style={e.linha}>
        <Pressable onPress={() => setAbrindo('data')} style={e.botao}>
          <Icone nome="CalendarDays" tamanho={16} tom={uso.tintaFraca} />
          <Text style={[e.botaoTexto, !data && e.vazio]}>{data || 'DD/MM/AAAA'}</Text>
        </Pressable>
        <Pressable onPress={() => setAbrindo('hora')} style={e.botao}>
          <Icone nome="Clock" tamanho={16} tom={uso.tintaFraca} />
          <Text style={[e.botaoTexto, !hora && e.vazio]}>{hora || 'HH:MM'}</Text>
        </Pressable>
      </View>
      {ajuda ? <Text style={e.ajuda}>{ajuda}</Text> : null}

      {abrindo ? (
        <DateTimePicker
          value={instante}
          mode={abrindo === 'data' ? 'date' : 'time'}
          is24Hour
          onChange={(evento, escolhido) => {
            setAbrindo(null)
            // No Android, fechar sem escolher também dispara — e sem este
            // recorte a data voltaria para "agora" a cada cancelamento.
            if (evento.type !== 'set' || !escolhido) return

            const p2 = (v: number) => String(v).padStart(2, '0')
            if (abrindo === 'data') {
              propagar(
                `${p2(escolhido.getDate())}/${p2(escolhido.getMonth() + 1)}/${escolhido.getFullYear()}`,
                hora || '00:00',
              )
            } else {
              propagar(
                data || `${p2(escolhido.getDate())}/${p2(escolhido.getMonth() + 1)}/${escolhido.getFullYear()}`,
                `${p2(escolhido.getHours())}:${p2(escolhido.getMinutes())}`,
              )
            }
          }}
        />
      ) : null}
    </View>
  )
}

const e = StyleSheet.create({
  fora: { marginBottom: espaco.g },
  rotulo: { ...texto.xs, fontFamily: tipo.semi, color: cor.neutro600, marginBottom: 6 },
  linha: { flexDirection: 'row', gap: espaco.s },
  metade: { flex: 1 },
  botao: {
    flex: 1,
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaco.s,
    paddingHorizontal: espaco.m,
    borderRadius: raio.campo,
    borderWidth: 1,
    borderColor: uso.borda,
    backgroundColor: uso.superficie,
  },
  botaoTexto: { ...texto.base, fontFamily: tipo.media, color: cor.neutro900 },
  vazio: { color: cor.neutro400 },
  ajuda: { ...texto.xs, fontFamily: tipo.regular, color: uso.tintaFraca, marginTop: 6 },
})
