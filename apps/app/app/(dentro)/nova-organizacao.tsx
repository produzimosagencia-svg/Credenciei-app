// Nova organização — cadastrar um cliente novo da plataforma.
//
// ─── O QUE ESTA TELA CRIA, DE UMA VEZ SÓ ────────────────────────────────────
//
// Três coisas, na mesma operação: a organização, o admin dono dela (com login
// próprio) e — se o master já souber — o primeiro evento. É o mesmo formulário
// do sistema web, só que em três cartões em vez de três seções lado a lado.
//
// O primeiro evento é OPCIONAL de propósito: o master pode não ter os dados
// na mão agora, e o próprio admin cria o evento dele depois, dentro do limite
// de licenças definido aqui.
//
// A foto de perfil e a pasta no Google Drive existem no sistema web e não
// estão aqui — são passos de servidor (upload e integração externa), não do
// formulário, e entram junto quando este método ligar na API de verdade.

import { useState } from 'react'
import { useRouter } from 'expo-router'
import { View, StyleSheet } from 'react-native'
import { formatCpfCnpj, titleCaseNome } from '@credenciei/dominio'
import { mensagemDoErro } from '../../src/dados/pedido'
import { useSessao } from '../../src/sessao/contexto'
import {
  Aviso, Botao, Campo, Cartao, Corpo, Escolha, Legenda, Respiro, Tela,
  TituloDaTela, TituloDeCartao,
} from '../../src/ui/componentes'
import { CampoDeDataHora } from '../../src/ui/data-hora'
import { Icone } from '../../src/ui/icone'
import { cor, espaco } from '../../src/ui/tema'

const PERIODOS = ['Mensal', 'Anual', 'Por evento'] as const
const CHAVE_DO_PERIODO: Record<(typeof PERIODOS)[number], 'mensal' | 'anual' | 'por_evento'> = {
  Mensal: 'mensal',
  Anual: 'anual',
  'Por evento': 'por_evento',
}

export default function NovaOrganizacao() {
  const router = useRouter()
  const { cliente } = useSessao()

  const [nome, setNome] = useState('')
  const [documento, setDocumento] = useState('')
  const [responsavelNome, setResponsavelNome] = useState('')
  const [limiteEventos, setLimiteEventos] = useState('1')
  const [valorCobrado, setValorCobrado] = useState('')
  const [periodo, setPeriodo] = useState<(typeof PERIODOS)[number]>('Mensal')

  const [adminNome, setAdminNome] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')

  const [comPrimeiroEvento, setComPrimeiroEvento] = useState(false)
  const [eventoNome, setEventoNome] = useState('')
  const [dataInicio, setDataInicio] = useState<string | null>(null)
  const [dataFim, setDataFim] = useState<string | null>(null)
  const [local, setLocal] = useState('')

  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [criada, setCriada] = useState<string | null>(null)

  async function salvar() {
    setErro(null)
    setSalvando(true)
    try {
      const valor = valorCobrado.replace(',', '.').trim()
      const r = await cliente.criarOrganizacao({
        nome,
        documento: documento || null,
        responsavelNome: responsavelNome || null,
        limiteEventos: Number(limiteEventos) || 1,
        valorCobrado: valor ? Number(valor) : null,
        valorCobradoPeriodo: CHAVE_DO_PERIODO[periodo],
        adminNome,
        email,
        senha,
        primeiroEvento: comPrimeiroEvento && eventoNome && dataInicio && dataFim
          ? { nome: eventoNome, dataInicio, dataFim, local: local || null }
          : null,
      })
      if (r.erro) return setErro(r.erro)
      setCriada(r.organizacao?.nome ?? nome)
    } catch (e) {
      setErro(mensagemDoErro(e))
    } finally {
      setSalvando(false)
    }
  }

  if (criada) {
    return (
      <Tela>
        <Cartao>
          <View style={e.sucesso}>
            <Icone nome="CheckCircle" tamanho={44} tom={cor.sucesso600} espessura={1.8} />
            <TituloDeCartao>Organização criada</TituloDeCartao>
            <Corpo><Corpo forte>{criada}</Corpo> já aparece na lista de organizações.</Corpo>
            <Legenda>
              O admin recebeu o login pelo e-mail cadastrado e já pode entrar.
            </Legenda>
          </View>
          <Respiro />
          <Botao titulo="Voltar para organizações" onPress={() => router.replace('/organizacoes')} />
        </Cartao>
      </Tela>
    )
  }

  return (
    <Tela>
      <TituloDaTela>Nova organização</TituloDaTela>
      <Legenda>Cria a organização, o admin dono dela e o primeiro evento</Legenda>
      <Respiro />

      {erro ? <Aviso tipo="erro">{erro}</Aviso> : null}

      <Cartao>
        <TituloDeCartao>Organização</TituloDeCartao>
        <Respiro altura={espaco.m} />
        <Campo
          rotulo="Nome da organização"
          value={nome}
          onChangeText={t => setNome(titleCaseNome(t))}
          placeholder="Ex: Brilha Shows"
          autoCapitalize="words"
        />
        <Campo
          rotulo="CPF ou CNPJ"
          value={documento}
          onChangeText={t => setDocumento(formatCpfCnpj(t))}
          placeholder="000.000.000-00"
          keyboardType="number-pad"
        />
        <Campo
          rotulo="Limite de eventos"
          value={limiteEventos}
          onChangeText={t => setLimiteEventos(t.replace(/\D/g, ''))}
          keyboardType="number-pad"
          maxLength={3}
        />
        <Campo
          rotulo="Responsável"
          value={responsavelNome}
          onChangeText={t => setResponsavelNome(titleCaseNome(t))}
          placeholder="Nome do responsável pela empresa"
          autoCapitalize="words"
        />
        <Campo
          rotulo="Valor cobrado"
          value={valorCobrado}
          onChangeText={setValorCobrado}
          placeholder="0,00"
          keyboardType="decimal-pad"
        />
        <Escolha opcoes={[...PERIODOS]} valor={periodo} aoEscolher={v => setPeriodo(v as typeof periodo)} />
      </Cartao>

      <Cartao>
        <TituloDeCartao>Login do admin</TituloDeCartao>
        <Legenda>É quem vai gerenciar esta organização</Legenda>
        <Respiro altura={espaco.m} />
        <Campo
          rotulo="Nome do admin"
          value={adminNome}
          onChangeText={t => setAdminNome(titleCaseNome(t))}
          placeholder="Nome de quem vai gerenciar"
          autoCapitalize="words"
        />
        <Campo
          rotulo="E-mail"
          value={email}
          onChangeText={setEmail}
          placeholder="email@exemplo.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Campo
          rotulo="Senha"
          value={senha}
          onChangeText={setSenha}
          placeholder="Mín. 6 caracteres"
          secureTextEntry
          ajuda="É a senha que o admin usa para entrar — pode ser trocada depois."
        />
      </Cartao>

      <Cartao>
        <View style={e.linhaDoTitulo}>
          <TituloDeCartao>Primeiro evento</TituloDeCartao>
          <Legenda>opcional</Legenda>
        </View>
        <Legenda>
          Cadastre já, ou deixe em branco: o admin cria depois, dentro do
          limite de eventos definido acima.
        </Legenda>
        <Respiro altura={espaco.m} />

        <Escolha
          opcoes={['Deixar para o admin criar', 'Já cadastrar']}
          valor={comPrimeiroEvento ? 'Já cadastrar' : 'Deixar para o admin criar'}
          aoEscolher={v => setComPrimeiroEvento(v === 'Já cadastrar')}
        />

        {comPrimeiroEvento ? (
          <>
            <Respiro altura={espaco.m} />
            <Campo
              rotulo="Nome do evento"
              value={eventoNome}
              onChangeText={setEventoNome}
              placeholder="Ex: Show da Virada 2026"
            />
            <CampoDeDataHora rotulo="Data de início" valor={dataInicio} aoMudar={setDataInicio} />
            <CampoDeDataHora rotulo="Data de fim" valor={dataFim} aoMudar={setDataFim} />
            <Campo
              rotulo="Local"
              value={local}
              onChangeText={setLocal}
              placeholder="Ex: Arena, São Paulo"
            />
          </>
        ) : null}
      </Cartao>

      {/*
        O botão não trava por campo vazio: quem toca e não vê reação sai
        achando que o app quebrou. Quem recusa é o servidor, com o motivo
        escrito na tela — mesma régua de "Criar acesso".
      */}
      <Botao titulo="Criar organização" onPress={salvar} ocupado={salvando} />
      <Respiro altura={espaco.s} />
      <Botao titulo="Cancelar" onPress={() => router.back()} tipo="fantasma" />
    </Tela>
  )
}

const e = StyleSheet.create({
  sucesso: { alignItems: 'center', gap: espaco.s, paddingVertical: espaco.g },
  linhaDoTitulo: { flexDirection: 'row', alignItems: 'center', gap: espaco.s },
})
