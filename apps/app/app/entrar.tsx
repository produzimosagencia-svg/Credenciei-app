// A porta do app.
//
// ─── ESTA TELA É A DO SISTEMA WEB ───────────────────────────────────────────
//
// Fundo quase-preto arroxeado (#0a0918), a marca em roxo com o QR, "Entrar" em
// branco e grande, campo claro sem borda, botão roxo. É a cópia da tela de
// `c:\Dev\credenciei\app\login\page.tsx` — quem já usa o painel reconhece.
//
// ─── O QUE MUDA, E POR QUÊ ──────────────────────────────────────────────────
//
// No site, entra-se com CPF e senha. Aqui, com o número de WhatsApp e um código
// de seis dígitos. A razão é o COLABORADOR: são vinte mil pessoas contratadas
// por um dia, que não vão criar nem lembrar de senha. SMS custaria de R$ 2 a
// R$ 4 mil por lote; e-mail muita gente não abre. WhatsApp todo mundo tem
// aberto, e o sistema já manda por lá.
//
// A decisão está em `docs/decisoes/002-login-por-whatsapp.md`, com o risco que
// carrega: se a conta de WhatsApp for restringida, o login para junto.
//
// FALTA DECIDIR: se quem tem conta de painel (admin, supervisor) entra aqui por
// CPF e senha, como no site, ou também por WhatsApp. Hoje só o caminho do
// WhatsApp existe.

import { useState } from 'react'
import { Redirect } from 'expo-router'
import { StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { mensagemDoErro } from '../src/dados/pedido'
import { DEMONSTRACAO } from '../src/dados/cliente'
import { useSessao } from '../src/sessao/contexto'
import { Marca } from '../src/ui/marca'
import { Botao, Campo, CodigoSegmentado } from '../src/ui/componentes'
import { cor, espaco, raio, texto, tipo } from '../src/ui/tema'
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
    <View style={[e.fora, { paddingTop: insets.top + espaco.ggg, paddingBottom: insets.bottom + espaco.gg }]}>
      <View style={e.miolo}>
        <View style={e.identidade}>
          <Marca tamanho={36} />
          <Text style={e.nomeDaMarca}>Credenciei</Text>
        </View>

        <Text style={e.titulo}>Entrar</Text>
        <Text style={e.chamada}>
          {etapa === 'telefone'
            ? 'Sua credencial e seu ponto, no celular'
            : `Código enviado para ${telefone}`}
        </Text>

        {erro ? <Text style={e.erro}>{erro}</Text> : null}

        {etapa === 'telefone' ? (
          <>
            <Campo
              escuro
              rotulo="Seu WhatsApp"
              value={telefone}
              onChangeText={t => setTelefone(mascararTelefone(t))}
              placeholder="(27) 99999-9999"
              keyboardType="phone-pad"
              autoComplete="tel"
              textContentType="telephoneNumber"
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
            <CodigoSegmentado valor={codigo} aoMudar={setCodigo} autoFoco />
            <Botao
              titulo="Entrar"
              onPress={confirmar}
              ocupado={ocupado}
              desabilitado={codigo.length !== 6}
            />
            <View style={e.alternativas}>
              <Botao titulo="Não chegou? Pedir de novo" onPress={pedirCodigo} tipo="fantasma" desabilitado={ocupado} />
              <Botao
                titulo="Usar outro número"
                onPress={() => { setEtapa('telefone'); setErro(null) }}
                tipo="fantasma"
                desabilitado={ocupado}
              />
            </View>
          </>
        )}

        {DEMONSTRACAO ? (
          <Text style={e.demonstracao}>
            Servidor de demonstração — nada é gravado. Qualquer número com DDD
            entra, e o código é 123456.
          </Text>
        ) : null}
      </View>

      <Text style={e.rodape}>Credenciei © {new Date().getFullYear()} — Produzimos</Text>
    </View>
  )
}

const e = StyleSheet.create({
  fora: {
    flex: 1,
    backgroundColor: cor.fundoEscuro,
    paddingHorizontal: espaco.gg,
    justifyContent: 'space-between',
  },
  miolo: { flex: 1 },

  identidade: { flexDirection: 'row', alignItems: 'center', gap: espaco.s, marginBottom: espaco.gggg },
  nomeDaMarca: { fontFamily: tipo.forte, fontSize: 18, letterSpacing: -0.4, color: '#ffffff' },

  titulo: { fontFamily: tipo.forte, fontSize: 30, lineHeight: 36, letterSpacing: -0.7, color: '#ffffff' },
  chamada: { ...texto.base, color: cor.neutro400, marginTop: 6, marginBottom: espaco.ggg },

  /* O erro do site: texto claro sobre vermelho translúcido, com fio da cor. */
  erro: {
    ...texto.corpo,
    color: '#fca5a5',
    backgroundColor: 'rgba(220,38,38,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(220,38,38,0.30)',
    borderRadius: raio.folha,
    paddingHorizontal: espaco.g,
    paddingVertical: 10,
    marginBottom: espaco.g,
  },

  alternativas: { marginTop: espaco.s, gap: espaco.xs },

  demonstracao: {
    ...texto.xs,
    fontFamily: tipo.regular,
    color: cor.neutro500,
    marginTop: espaco.gg,
    lineHeight: 18,
  },

  rodape: { ...texto.xs, fontFamily: tipo.regular, color: cor.neutro500, textAlign: 'center' },
})
