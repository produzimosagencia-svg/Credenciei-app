// A conferência pelo CPF, quando o crachá não passa.
//
// ─── POR QUE ELA EXISTE ─────────────────────────────────────────────────────
//
// Sem ela, o operador com um crachá recusado e uma pessoa na frente tem duas
// saídas, e as duas são ruins: mandar a pessoa embora, ou deixar entrar sem
// conferir. E quando a fila está andando, ele vai escolher a segunda.
//
// O CPF responde a pergunta que interessa — "esta pessoa está na lista deste
// evento?" — sem depender do celular dela, que é justamente o que falhou.

import { useState } from 'react'
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native'
import type { ConferenciaPorCpf as Resultado } from '@credenciei/contrato'
import { formatCpf } from '@credenciei/dominio'
import { mensagemDoErro } from '../dados/pedido'
import { useSessao } from '../sessao/contexto'
import { Aviso, Botao, Campo, Corpo, Legenda, Respiro, Selo, TituloDaTela } from './componentes'
import { cor, espaco, texto, tipo } from './tema'

const ROTULO: Record<string, string> = { entrada: 'Entrada', meio: 'Meio', fim: 'Saída' }

export function ConferenciaPorCpf({
  eventoId, aviso, aoFechar,
}: {
  eventoId: string
  /** O motivo pelo qual o crachá não passou. A pessoa precisa saber por quê. */
  aviso: string
  aoFechar: () => void
}) {
  const { cliente } = useSessao()
  const [cpf, setCpf] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [resultado, setResultado] = useState<Resultado | null>(null)

  async function conferir() {
    setErro(null)
    setOcupado(true)
    try {
      setResultado(await cliente.conferirPorCpf(eventoId, cpf))
    } catch (e) {
      setErro(mensagemDoErro(e))
    } finally {
      setOcupado(false)
    }
  }

  const completo = cpf.replace(/\D/g, '').length === 11

  return (
    <Modal visible animationType="slide" onRequestClose={aoFechar}>
      <ScrollView style={e.fora} contentContainerStyle={e.conteudo} keyboardShouldPersistTaps="handled">
        <TituloDaTela>Conferir pelo CPF</TituloDaTela>
        <Respiro altura={espaco.m} />

        <Aviso tipo="aviso">{aviso}</Aviso>

        {!resultado ? (
          <>
            <Campo
              rotulo="CPF da pessoa"
              value={cpf}
              onChangeText={t => { setCpf(formatCpf(t)); setErro(null) }}
              placeholder="000.000.000-00"
              keyboardType="number-pad"
              autoFocus
              maxLength={14}
              erro={erro ?? undefined}
              ajuda="Peça o documento. É a única forma de conferir sem o celular dela."
            />
            <Botao titulo="Conferir" onPress={conferir} ocupado={ocupado} desabilitado={!completo} />
          </>
        ) : (
          <>
            <View style={[e.veredito, resultado.encontrada && resultado.ativo ? e.vereditoOk : e.vereditoNao]}>
              <Text style={e.vereditoTexto}>
                {resultado.encontrada && resultado.ativo
                  ? 'Está credenciada'
                  : resultado.encontrada
                    ? 'Na lista, mas não ativada'
                    : 'Não está na lista'}
              </Text>
            </View>

            <Respiro altura={espaco.m} />
            <Corpo>{resultado.mensagem}</Corpo>

            {resultado.encontrada ? (
              <>
                <Respiro altura={espaco.m} />
                <Legenda>Etapas já registradas hoje</Legenda>
                <Respiro altura={espaco.s} />
                {resultado.etapasFeitas && resultado.etapasFeitas.length > 0 ? (
                  <View style={e.etapas}>
                    {resultado.etapasFeitas.map(et => (
                      <Selo key={et} texto={ROTULO[et] ?? et} tipo="sucesso" />
                    ))}
                  </View>
                ) : (
                  <Corpo>Nenhuma ainda.</Corpo>
                )}
              </>
            ) : null}

            <Respiro altura={espaco.gg} />
            <Text style={e.nota}>
              A conferência não registra presença — ela só diz se a pessoa está
              na lista. Quem grava a batida é a leitura do crachá, ou a tela de
              Registrar ponto.
            </Text>

            <Respiro />
            <Botao
              titulo="Conferir outro CPF"
              onPress={() => { setResultado(null); setCpf('') }}
              tipo="secundario"
            />
          </>
        )}

        <Respiro altura={espaco.s} />
        <Botao titulo="Voltar a ler QR Code" onPress={aoFechar} tipo="fantasma" />
      </ScrollView>
    </Modal>
  )
}

const e = StyleSheet.create({
  fora: { flex: 1, backgroundColor: cor.fundo },
  conteudo: { padding: espaco.g, paddingTop: espaco.ggg, paddingBottom: espaco.gggg },

  veredito: { borderRadius: 12, borderWidth: 1, padding: espaco.g, alignItems: 'center' },
  vereditoOk: { backgroundColor: cor.sucesso50, borderColor: cor.sucesso200 },
  vereditoNao: { backgroundColor: cor.erro50, borderColor: cor.erro200 },
  vereditoTexto: { ...texto.xl, color: cor.neutro800 },

  etapas: { flexDirection: 'row', flexWrap: 'wrap', gap: espaco.s },

  nota: { ...texto.xs, fontFamily: tipo.regular, color: cor.neutro400, lineHeight: 18 },
})
