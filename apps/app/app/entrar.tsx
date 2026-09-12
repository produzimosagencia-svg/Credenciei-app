// A porta do app.
//
// ─── ESTA TELA É A DO SISTEMA WEB ───────────────────────────────────────────
//
// Fundo quase-preto (#0d0c0c), o ícone 3D da marca com o brilho laranja atrás,
// cartão de vidro, campo translúcido sem borda visível, botão em degradê
// laranja. É a cópia de `c:\Dev\credenciei\components\ui\modern-stunning-sign-in.tsx`
// (a tela de login do site foi refeita nesse componente, 12/09/2026) — quem já
// usa o painel reconhece.
//
// Simplificações, pelo mesmo motivo de sempre — RN não tem tradução direta e
// barata para `radial-gradient`/`backdrop-blur` (ver `tema.ts`):
//   • o brilho radial de fundo (duas manchas sutis) não existe aqui; fica só
//     o brilho atrás do ícone, que é o elemento que mais chama atenção;
//   • o brilho atrás do ícone é simulado com círculos concêntricos
//     translúcidos, não um blur de verdade;
//   • o cartão de vidro (gradiente sutil + blur) vira o mesmo degradê SEM
//     blur — já é próximo o bastante sem custar nada de desempenho;
//   • o texto "credenciada." é cor sólida, não o degradê em texto do site
//     (RN não recorta gradiente em texto sem uma biblioteca à parte).
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
// A escolha fica no topo do cartão, em dois botões. A alternativa seria
// adivinhar pelo que a pessoa digitou (parece CPF? parece telefone?), e
// adivinhar errado mandaria alguém para o caminho errado sem explicação. O
// site não tem este seletor — ele só atende quem tem conta de painel; aqui
// os dois caminhos vivem na mesma tela, dentro do MESMO cartão.

import { useState } from 'react'
import { Redirect } from 'expo-router'
import {
  Image, Linking, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { mensagemDoErro } from '../src/dados/pedido'
import { DEMONSTRACAO } from '../src/dados/cliente'
import { useSessao } from '../src/sessao/contexto'
import { AberturaDoApp } from '../src/ui/abertura'
import { Botao, Campo, CodigoSegmentado } from '../src/ui/componentes'
import { Icone } from '../src/ui/icone'
import {
  ALVO_MINIMO, espaco, PALETAS, raio, texto, tipo,
} from '../src/ui/tema'
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

/** Trocar quando o número for definido — mesmo comentário do site. */
const WHATSAPP_SUPORTE = 'https://wa.me/5500000000000?text=Esqueci%20minha%20senha%20do%20Credenciei'

/** `#A31B05 0% → #FF4A0F 60% → #FF8A4C 100%`, copiado do botão do site. */
const DEGRADE_BOTAO = ['#A31B05', '#FF4A0F', '#FF8A4C'] as const

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
  const [mostrarSenha, setMostrarSenha] = useState(false)

  const [etapa, setEtapa] = useState<Etapa>('telefone')
  const [telefone, setTelefone] = useState('')
  const [codigo, setCodigo] = useState('')

  // A animação toca por cima da tela, que já está pronta por baixo — assim
  // que termina (ou a pessoa toca a tela), some e revela o login.
  const [mostrarAbertura, setMostrarAbertura] = useState(true)

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
        <View style={e.logoFora}>
          <View style={[e.brilho, e.brilhoExterno]} />
          <View style={[e.brilho, e.brilhoMedio]} />
          <View style={[e.brilho, e.brilhoInterno]} />
          {/* eslint-disable-next-line @typescript-eslint/no-require-imports */}
          <Image source={require('../assets/marca/iso-3d.png')} style={e.logo} resizeMode="contain" />
        </View>

        <View style={e.cartao}>
          <Text style={e.titulo}>
            Toda a equipe do seu evento, <Text style={e.tituloAcento}>credenciada.</Text>
          </Text>
          <Text style={e.chamada}>
            {caminho === 'painel'
              ? 'Entre para acessar o painel do seu evento'
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
                value={identificador}
                onChangeText={t => setIdentificador(mascararIdentificador(t))}
                placeholder="CPF (supervisor) ou e-mail"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="username"
              />
              <View style={e.campoComOlho}>
                <Campo
                  escuro
                  value={senha}
                  onChangeText={setSenha}
                  placeholder="Senha"
                  secureTextEntry={!mostrarSenha}
                  autoComplete="current-password"
                  onSubmitEditing={() => entrarComSenha()}
                  returnKeyType="go"
                  style={e.campoComOlhoEntrada}
                />
                <Pressable
                  onPress={() => setMostrarSenha(v => !v)}
                  accessibilityRole="button"
                  accessibilityLabel={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
                  style={e.olho}
                  hitSlop={8}
                >
                  <Icone nome={mostrarSenha ? 'EyeOff' : 'Eye'} tamanho={16} tom="rgba(255,255,255,0.40)" />
                </Pressable>
              </View>

              <BotaoGradiente
                titulo="Entrar"
                onPress={() => entrarComSenha()}
                ocupado={ocupado}
                desabilitado={!identificador.trim() || !senha}
              />

              <Pressable
                onPress={() => Linking.openURL(WHATSAPP_SUPORTE)}
                accessibilityRole="link"
                style={e.esqueciSenha}
                hitSlop={8}
              >
                <Icone nome="MessageCircle" tamanho={14} tom="rgba(255,255,255,0.55)" />
                <Text style={e.esqueciSenhaTexto}>Esqueci a senha</Text>
              </Pressable>
            </>
          ) : etapa === 'telefone' ? (
            <>
              <Campo
                escuro
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
        </View>
      </ScrollView>

      <Text style={e.rodape}>Credenciei © {new Date().getFullYear()} — Produzimos</Text>

      {mostrarAbertura ? <AberturaDoApp aoTerminar={() => setMostrarAbertura(false)} /> : null}
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
 * O botão "Entrar" — o único em degradê da tela inteira, copiado do site
 * (`linear-gradient(135deg, #A31B05 0%, #FF4A0F 60%, #FF8A4C 100%)`). Não
 * usa o `Botao` compartilhado porque nenhum outro lugar do app pede um
 * botão em degradê — criar a variante ali para um uso só espalharia a régua
 * sem necessidade.
 */
function BotaoGradiente({
  titulo, onPress, ocupado, desabilitado,
}: {
  titulo: string
  onPress: () => void
  ocupado?: boolean
  desabilitado?: boolean
}) {
  const travado = !!(ocupado || desabilitado)
  return (
    <Pressable
      onPress={onPress}
      disabled={travado}
      accessibilityRole="button"
      accessibilityState={{ disabled: travado, busy: !!ocupado }}
      style={({ pressed }) => [
        e.botaoGradienteFora,
        travado && e.botaoGradienteTravado,
        !travado && pressed && e.afunda,
      ]}
    >
      <LinearGradient
        colors={DEGRADE_BOTAO}
        locations={[0, 0.6, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={e.botaoGradiente}
      >
        <Text style={e.botaoGradienteTexto}>{ocupado ? 'Entrando…' : titulo}</Text>
      </LinearGradient>
    </Pressable>
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

const TAMANHO_LOGO = 116

const e = StyleSheet.create({
  fora: {
    flex: 1,
    backgroundColor: cor.fundoEscuro,
    paddingHorizontal: espaco.gg,
    justifyContent: 'space-between',
  },
  miolo: { flex: 1 },
  mioloConteudo: { paddingBottom: espaco.gg },

  // ─── O ícone, com o brilho atrás ──────────────────────────────────────────
  logoFora: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: espaco.g,
  },
  logo: { width: TAMANHO_LOGO, height: TAMANHO_LOGO },
  // Três círculos concêntricos, cada vez mais opacos para o centro — a
  // aproximação sem blur do brilho radial do site atrás do ícone.
  brilho: { position: 'absolute', borderRadius: 999, backgroundColor: 'rgba(255,74,15,0.55)' },
  brilhoExterno: { width: TAMANHO_LOGO * 2.2, height: TAMANHO_LOGO * 2.2, opacity: 0.12 },
  brilhoMedio: { width: TAMANHO_LOGO * 1.6, height: TAMANHO_LOGO * 1.6, opacity: 0.18 },
  brilhoInterno: { width: TAMANHO_LOGO * 1.1, height: TAMANHO_LOGO * 1.1, opacity: 0.22 },

  // ─── O cartão de vidro ─────────────────────────────────────────────────────
  cartao: {
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingHorizontal: espaco.gg,
    paddingTop: espaco.ggg,
    paddingBottom: espaco.gg,
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 24 },
    shadowOpacity: 0.5,
    shadowRadius: 48,
    elevation: 12,
  },

  titulo: {
    fontFamily: tipo.extra, fontSize: 22, lineHeight: 27, letterSpacing: -0.4,
    color: '#ffffff', textAlign: 'center',
  },
  tituloAcento: { color: cor.acento500 },
  chamada: { ...texto.base, color: 'rgba(255,255,255,0.55)', marginTop: 8, marginBottom: espaco.gg, textAlign: 'center' },

  seletor: {
    flexDirection: 'row',
    gap: espaco.xs,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: raio.peca,
    padding: espaco.xs,
    marginBottom: espaco.gg,
    width: '100%',
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

  campoComOlho: { width: '100%', position: 'relative' },
  campoComOlhoEntrada: { paddingRight: espaco.ggg },
  olho: {
    position: 'absolute', right: espaco.m, top: 0, height: ALVO_MINIMO,
    alignItems: 'center', justifyContent: 'center',
  },

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
    width: '100%',
  },

  afunda: { transform: [{ scale: 0.98 }] },

  botaoGradienteFora: {
    width: '100%',
    borderRadius: raio.campo,
    marginTop: espaco.xs,
    shadowColor: '#FF4A0F',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 8,
  },
  botaoGradienteTravado: { opacity: 0.5 },
  botaoGradiente: {
    minHeight: ALVO_MINIMO,
    borderRadius: raio.campo,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botaoGradienteTexto: { ...texto.base, fontFamily: tipo.forte, color: '#ffffff' },

  esqueciSenha: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    marginTop: espaco.m,
  },
  esqueciSenhaTexto: { ...texto.xs, fontFamily: tipo.regular, color: 'rgba(255,255,255,0.55)' },

  alternativas: { marginTop: espaco.s, gap: espaco.xs, width: '100%' },

  demonstracao: {
    ...texto.xs,
    fontFamily: tipo.regular,
    color: cor.neutro500,
    marginTop: espaco.gg,
    lineHeight: 18,
    textAlign: 'center',
  },

  contas: { marginTop: espaco.gg, width: '100%' },
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
