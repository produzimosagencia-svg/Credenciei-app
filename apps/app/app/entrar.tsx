// A porta do app: entrar com o número de WhatsApp.
//
// ─── POR QUE WHATSAPP, E NÃO SENHA ──────────────────────────────────────────
//
// Senha exigiria a pessoa lembrar de uma senha usada três vezes por ano. SMS
// custaria entre R$ 2 mil e R$ 4 mil para vinte mil contas. E-mail muita gente
// simplesmente não abre. O WhatsApp é o único canal que todo mundo tem aberto —
// e o sistema atual já manda por lá.
//
// A decisão está escrita em `docs/decisoes/002-login-por-whatsapp.md`, com o
// risco que ela carrega: se a conta de WhatsApp for restringida, o login para
// junto.

import { useState } from 'react'
import { Redirect } from 'expo-router'
import { StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { mensagemDoErro } from '../src/dados/pedido'
import { DEMONSTRACAO } from '../src/dados/cliente'
import { useSessao } from '../src/sessao/contexto'
import {
  Aviso, Botao, Campo, Corpo, Legenda, Respiro, Tela,
} from '../src/ui/componentes'
import { cor, espaco, fonte } from '../src/ui/tema'
import { mascararTelefone, telefoneParaEnvio, telefoneValido } from '../src/telefone'

type Etapa = 'telefone' | 'codigo'

export default function Entrar() {
  const { sessao, cliente, entrar } = useSessao()
  const insets = useSafeAreaInsets()

  const [etapa, setEtapa] = useState<Etapa>('telefone')
  const [telefone, setTelefone] = useState('')
  const [codigo, setCodigo] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  // Quem já tem sessão não vê esta tela. Declarativo, e não `router.replace`:
  // assim não existe o instante em que as duas telas disputam a navegação.
  if (sessao) return <Redirect href="/" />

  async function pedirCodigo() {
    setErro(null)
    setOcupado(true)
    try {
      const r = await cliente.pedirCodigo(telefoneParaEnvio(telefone))
      if (!r.enviado) {
        setErro(r.erro ?? 'Não conseguimos enviar o código.')
        return
      }
      setCodigo('')
      setEtapa('codigo')
    } catch (e) {
      setErro(mensagemDoErro(e))
    } finally {
      setOcupado(false)
    }
  }

  async function confirmar() {
    setErro(null)
    setOcupado(true)
    try {
      const r = await cliente.entrar(telefoneParaEnvio(telefone), codigo)
      if (!r.sessao) {
        setErro(r.erro ?? 'Não conseguimos entrar.')
        return
      }
      await entrar(r.sessao)
    } catch (e) {
      setErro(mensagemDoErro(e))
    } finally {
      setOcupado(false)
    }
  }

  return (
    <View style={e.fora}>
      <View style={[e.topo, { paddingTop: insets.top + espaco.gg }]}>
        <Text style={e.marca}>Credenciei</Text>
        <Text style={e.chamada}>Sua credencial e seu ponto, no celular.</Text>
      </View>

      <Tela>
        {erro ? <Aviso tipo="erro">{erro}</Aviso> : null}

        {etapa === 'telefone' ? (
          <>
            <Corpo>
              Digite o número de WhatsApp que você usa. Vamos mandar um código
              de seis dígitos por lá.
            </Corpo>
            <Respiro />
            <Campo
              rotulo="Seu WhatsApp"
              value={telefone}
              onChangeText={t => setTelefone(mascararTelefone(t))}
              placeholder="(27) 99999-9999"
              keyboardType="phone-pad"
              autoComplete="tel"
              textContentType="telephoneNumber"
              ajuda="Com DDD. Se colar com +55, a gente entende."
              maxLength={15}
            />
            <Botao
              titulo="Receber código no WhatsApp"
              onPress={pedirCodigo}
              ocupado={ocupado}
              desabilitado={!telefoneValido(telefone)}
            />
          </>
        ) : (
          <>
            <Corpo>
              Mandamos um código para <Corpo forte>{telefone}</Corpo>. Ele chega
              como mensagem no WhatsApp.
            </Corpo>
            <Respiro />
            <Campo
              rotulo="Código de seis dígitos"
              value={codigo}
              onChangeText={t => setCodigo(t.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              keyboardType="number-pad"
              autoComplete="one-time-code"
              textContentType="oneTimeCode"
              autoFocus
              maxLength={6}
              style={e.codigo}
            />
            <Botao
              titulo="Entrar"
              onPress={confirmar}
              ocupado={ocupado}
              desabilitado={codigo.length !== 6}
            />
            <Respiro altura={espaco.s} />
            <Botao titulo="Não chegou? Pedir de novo" onPress={pedirCodigo} tipo="texto" desabilitado={ocupado} />
            <Botao
              titulo="Usar outro número"
              onPress={() => { setEtapa('telefone'); setErro(null) }}
              tipo="texto"
              desabilitado={ocupado}
            />
          </>
        )}

        {DEMONSTRACAO ? (
          <>
            <Respiro altura={espaco.gg} />
            <Aviso tipo="atencao">
              Modo demonstração: nada é gravado de verdade. Qualquer número com
              DDD funciona, e o código é sempre 123456.
            </Aviso>
          </>
        ) : null}

        <Respiro altura={espaco.gg} />
        <Legenda>
          Ao entrar, você concorda que seus registros de ponto fiquem guardados
          para o cálculo do pagamento.
        </Legenda>
      </Tela>
    </View>
  )
}

const e = StyleSheet.create({
  fora: { flex: 1, backgroundColor: cor.fundo },
  topo: {
    backgroundColor: cor.marca,
    paddingHorizontal: espaco.g,
    paddingBottom: espaco.gg,
  },
  marca: { color: cor.sobreEscuro, fontSize: 34, fontWeight: '800', letterSpacing: -0.5 },
  chamada: { color: '#C9D6E8', fontSize: fonte.destaque, marginTop: espaco.xs },
  codigo: { fontSize: 28, letterSpacing: 8, textAlign: 'center', fontWeight: '700' },
})
