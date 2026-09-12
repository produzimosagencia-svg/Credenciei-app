// A porta do app.
//
// ─── ESTA TELA É A DO SISTEMA WEB ───────────────────────────────────────────
//
// Fundo quase-preto arroxeado (#0a0918), a marca com o QR, "Entrar" em branco e
// grande, campo claro sem borda, botão roxo. É a cópia da tela de
// `c:\Dev\credenciei\app\login\page.tsx` — quem já usa o painel reconhece.
//
// ─── POR QUE HÁ DOIS CAMINHOS ───────────────────────────────────────────────
//
// Porque são duas populações, e nenhuma solução serve para as duas.
//
//   conta de painel     dezenas de pessoas: master, admin, supervisor. Entram
//                       com CPF ou e-mail e senha, como já entram no site.
//
//   colaborador         VINTE MIL pessoas contratadas para um dia. Não vão
//                       criar nem lembrar de senha. SMS custaria de R$ 2 a
//                       R$ 4 mil por lote e e-mail muita gente não abre —
//                       sobra o WhatsApp, que o sistema já usa.
//
// A escolha fica no topo, em dois botões. A alternativa seria adivinhar pelo
// que a pessoa digitou (parece CPF? parece telefone?), e adivinhar errado
// mandaria alguém para o caminho errado sem explicação.

import { useState } from 'react'
import { Redirect } from 'expo-router'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { mensagemDoErro } from '../src/dados/pedido'
import { DEMONSTRACAO } from '../src/dados/cliente'
import { useSessao } from '../src/sessao/contexto'
import { Marca } from '../src/ui/marca'
import { Botao, Campo, CodigoSegmentado } from '../src/ui/componentes'
import { espaco, PALETAS, raio, texto, tipo } from '../src/ui/tema'
import { TemaFixo } from '../src/ui/tema-contexto'

/*
 * Sempre a cor do tema ESCURO, nunca a do alternador — igual no site: quem
 * chega aqui ainda não tem conta, então não faz sentido nenhuma preferência
 * de tema valer. `<TemaFixo modo="escuro">`, logo abaixo, faz o mesmo valer
 * para `Botao`/`Campo`/`CodigoSegmentado`, que são compartilhados com o resto
 * do app e por padrão seguiriam o alternador.
 */
const cor = PALETAS.escuro.cor
import { CONTAS_DE_DEMONSTRACAO, SENHA_DE_DEMONSTRACAO } from '@credenciei/contrato'
import type { ContaDeDemonstracao } from '@credenciei/contrato'
import { NOME_DO_PAPEL } from '@credenciei/dominio'
import { mascararIdentificador } from '../src/campos'
import { mascararTelefone, telefoneParaEnvio, telefoneValido } from '../src/telefone'

type Caminho = 'painel' | 'equipe'
type Etapa = 'telefone' | 'codigo'

export default function Entrar() {
  const { sessao, cliente, entrar } = useSessao()
  const insets = useSafeAreaInsets()

  const [caminho, setCaminho] = useState<Caminho>('painel')
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  const [identificador, setIdentificador] = useState('')
  const [senha, setSenha] = useState('')

  const [etapa, setEtapa] = useState<Etapa>('telefone')
  const [telefone, setTelefone] = useState('')
  const [codigo, setCodigo] = useState('')

  // Quem já tem sessão não vê esta tela. Declarativo, e não `router.replace`:
  // assim não existe o instante em que as duas telas disputam a navegação.
  if (sessao) return <Redirect href="/" />

  function trocarCaminho(novo: Caminho) {
    setCaminho(novo)
    setErro(null)
    setEtapa('telefone')
  }

  /** Tudo que chama o servidor passa por aqui: o erro é tratado num lugar só. */
  async function tentar(acao: () => Promise<string | null>) {
    setErro(null)
    setOcupado(true)
    try {
      const problema = await acao()
      if (problema) setErro(problema)
    } catch (e) {
      setErro(mensagemDoErro(e))
    } finally {
      setOcupado(false)
    }
  }

  const entrarComSenha = (
    quem: string = identificador,
    comQual: string = senha,
  ) => tentar(async () => {
    const r = await cliente.entrarComSenha(quem.trim(), comQual)
    if (!r.sessao) return r.erro ?? 'Não conseguimos entrar.'
    await entrar(r.sessao)
    return null
  })

  const pedirCodigo = () => tentar(async () => {
    const r = await cliente.pedirCodigo(telefoneParaEnvio(telefone))
    if (!r.enviado) return r.erro ?? 'Não conseguimos enviar o código.'
    setCodigo('')
    setEtapa('codigo')
    return null
  })

  const confirmarCodigo = () => tentar(async () => {
    const r = await cliente.entrar(telefoneParaEnvio(telefone), codigo)
    if (!r.sessao) return r.erro ?? 'Não conseguimos entrar.'
    await entrar(r.sessao)
    return null
  })

  return (
    <TemaFixo modo="escuro">
    <View
      style={[
        e.fora,
        { paddingTop: insets.top + espaco.ggg, paddingBottom: insets.bottom + espaco.g },
      ]}
    >
      <ScrollView
        style={e.miolo}
        contentContainerStyle={e.mioloConteudo}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={e.identidade}>
          <Marca tamanho={36} />
          <Text style={e.nomeDaMarca}>Credenciei</Text>
        </View>

        <Text style={e.titulo}>Entrar</Text>
        <Text style={e.chamada}>
          {caminho === 'painel'
            ? 'Acesse o painel do seu evento'
            : etapa === 'telefone'
              ? 'Sua credencial e seu ponto, no celular'
              : `Código enviado para ${telefone}`}
        </Text>

        <SeletorDeCaminho valor={caminho} aoTrocar={trocarCaminho} desabilitado={ocupado} />

        {erro ? <Text style={e.erro}>{erro}</Text> : null}

        {caminho === 'painel' ? (
          <>
            <Campo
              escuro
              rotulo="CPF ou e-mail"
              value={identificador}
              onChangeText={t => setIdentificador(mascararIdentificador(t))}
              placeholder="000.000.000-00"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="username"
            />
            <Campo
              escuro
              rotulo="Senha"
              value={senha}
              onChangeText={setSenha}
              placeholder="••••••••"
              secureTextEntry
              autoComplete="current-password"
              onSubmitEditing={() => entrarComSenha()}
              returnKeyType="go"
            />
            <Botao
              titulo="Entrar"
              onPress={() => entrarComSenha()}
              ocupado={ocupado}
              desabilitado={!identificador.trim() || !senha}
            />
          </>
        ) : etapa === 'telefone' ? (
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
              onPress={confirmarCodigo}
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

        {DEMONSTRACAO && caminho === 'painel' ? (
          <ContasDeDemonstracao
            desabilitado={ocupado}
            aoEscolher={conta => {
              setIdentificador(conta.email)
              setSenha(SENHA_DE_DEMONSTRACAO)
              void entrarComSenha(conta.email, SENHA_DE_DEMONSTRACAO)
            }}
          />
        ) : null}

        {DEMONSTRACAO && caminho === 'equipe' ? (
          <Text style={e.demonstracao}>
            Demonstração: qualquer número com DDD entra, e o código é sempre
            123456.
          </Text>
        ) : null}
      </ScrollView>

      <Text style={e.rodape}>Credenciei © {new Date().getFullYear()} — Produzimos</Text>
    </View>
    </TemaFixo>
  )
}

/**
 * Os dois caminhos, lado a lado.
 *
 * Um seletor e não uma adivinhação: dá para tentar deduzir pelo que foi
 * digitado — parece CPF, parece telefone —, mas errar manda a pessoa para o
 * caminho errado sem nenhuma explicação, e ela não tem como saber que existia
 * outro.
 */
function SeletorDeCaminho({
  valor, aoTrocar, desabilitado,
}: {
  valor: Caminho
  aoTrocar: (c: Caminho) => void
  desabilitado?: boolean
}) {
  const opcoes: { chave: Caminho; rotulo: string }[] = [
    { chave: 'painel', rotulo: 'Tenho conta' },
    { chave: 'equipe', rotulo: 'Sou da equipe' },
  ]

  return (
    <View style={e.seletor}>
      {opcoes.map(o => {
        const ativa = o.chave === valor
        return (
          <Pressable
            key={o.chave}
            onPress={() => aoTrocar(o.chave)}
            disabled={desabilitado}
            accessibilityRole="tab"
            accessibilityState={{ selected: ativa }}
            style={[e.seletorItem, ativa && e.seletorItemAtivo]}
          >
            <Text style={[e.seletorRotulo, ativa && e.seletorRotuloAtivo]}>{o.rotulo}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

/**
 * As três contas de demonstração, com um toque para entrar.
 *
 * Existe porque a versão anterior escrevia "entre com master, admin ou
 * supervisor" — e o campo pedia CPF ou e-mail. Não havia como obedecer à
 * instrução: o campo, mascarado como CPF, engolia as letras em silêncio.
 *
 * Cada linha diz o que aquele papel enxerga. É a forma mais rápida de conferir
 * que a permissão está certa: entra, olha o menu, sai, entra com outro.
 */
function ContasDeDemonstracao({
  aoEscolher, desabilitado,
}: {
  aoEscolher: (conta: ContaDeDemonstracao) => void
  desabilitado?: boolean
}) {
  return (
    <View style={e.contas}>
      <Text style={e.contasTitulo}>DEMONSTRAÇÃO — TOQUE PARA ENTRAR</Text>

      {CONTAS_DE_DEMONSTRACAO.map(conta => (
        <Pressable
          key={conta.email}
          onPress={() => aoEscolher(conta)}
          disabled={desabilitado}
          accessibilityRole="button"
          style={({ pressed }) => [e.conta, pressed && e.contaTocada]}
        >
          <View style={e.contaTexto}>
            <Text style={e.contaNome}>
              {conta.nome} <Text style={e.contaPapel}>· {NOME_DO_PAPEL[conta.papel]}</Text>
            </Text>
            <Text style={e.contaDetalhe}>{conta.oQueVe}</Text>
            <Text style={e.contaCredencial}>{conta.email} · senha {SENHA_DE_DEMONSTRACAO}</Text>
          </View>
        </Pressable>
      ))}
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
  mioloConteudo: { paddingBottom: espaco.gg },

  identidade: { flexDirection: 'row', alignItems: 'center', gap: espaco.s, marginBottom: espaco.ggg },
  nomeDaMarca: { fontFamily: tipo.forte, fontSize: 18, letterSpacing: -0.4, color: '#ffffff' },

  titulo: { fontFamily: tipo.forte, fontSize: 30, lineHeight: 36, letterSpacing: -0.7, color: '#ffffff' },
  chamada: { ...texto.base, color: cor.neutro400, marginTop: 6, marginBottom: espaco.gg },

  seletor: {
    flexDirection: 'row',
    gap: espaco.xs,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: raio.peca,
    padding: espaco.xs,
    marginBottom: espaco.gg,
  },
  seletorItem: {
    flex: 1,
    minHeight: 40,
    borderRadius: raio.campoPequeno,
    alignItems: 'center',
    justifyContent: 'center',
  },
  seletorItemAtivo: { backgroundColor: cor.acento500 },
  seletorRotulo: { ...texto.corpoForte, color: cor.neutro400 },
  seletorRotuloAtivo: { color: '#ffffff' },

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

  contas: { marginTop: espaco.gg },
  contasTitulo: { ...texto.etiqueta, color: cor.neutro500, marginBottom: espaco.s },
  conta: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: raio.peca,
    paddingHorizontal: espaco.m,
    paddingVertical: 10,
    marginBottom: espaco.s,
  },
  contaTocada: { backgroundColor: 'rgba(255,255,255,0.09)', borderColor: cor.acento500 },
  contaTexto: { gap: 2 },
  contaNome: { ...texto.corpoForte, color: '#ffffff' },
  contaPapel: { fontFamily: tipo.regular, color: cor.neutro400 },
  contaDetalhe: { ...texto.xs, fontFamily: tipo.regular, color: cor.neutro400 },
  contaCredencial: { ...texto.xxs, fontFamily: tipo.regular, color: cor.neutro500 },

  rodape: { ...texto.xs, fontFamily: tipo.regular, color: cor.neutro500, textAlign: 'center' },
})
