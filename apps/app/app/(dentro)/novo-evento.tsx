// Entrar num evento com o código que chegou no WhatsApp.
//
// ─── O QUE ESTE CÓDIGO RESOLVE ──────────────────────────────────────────────
//
// Sem ele, cada evento novo seria um cadastro novo: nome, CPF, telefone, tudo
// de novo, mil vezes por evento. Com ele, a pessoa que já tem conta digita um
// código curto e responde só o que ESTE evento pede a mais.
//
// O código é lido pelo domínio (`lerCodigoDeEvento`), o mesmo que o servidor
// usa. Ele perdoa minúscula, espaço, traço a mais ou a menos e as três
// confusões clássicas de leitura — porque quem digita está com o celular numa
// mão e uma caixa na outra.

import { useState } from 'react'
import { useRouter } from 'expo-router'
import { View, StyleSheet } from 'react-native'
import { formatarBR, mascararCodigo } from '@credenciei/dominio'
import type { CampoDoFormulario, ConviteDoEvento } from '@credenciei/contrato'
import { camposFaltando, fraseDoQueFalta, mascararData } from '../../src/campos'
import { mensagemDoErro } from '../../src/dados/pedido'
import { useSessao } from '../../src/sessao/contexto'
import {
  Aviso, Botao, Campo, Cartao, Corpo, Escolha, Legenda, Respiro, Tela, Titulo,
} from '../../src/ui/componentes'
import { cor, espaco, fonte } from '../../src/ui/tema'

/**
 * Quantos caracteres o código tem sem os traços: sigla (3) + ano (4) + sorteio
 * (4). O botão de procurar só acende quando o código está completo — aqui
 * travar é honesto, porque a pessoa VÊ que ainda falta digitar.
 */
const TAMANHO_DO_CODIGO = 11

export default function NovoEvento() {
  const router = useRouter()
  const { cliente } = useSessao()

  const [codigo, setCodigo] = useState('')
  const [convite, setConvite] = useState<ConviteDoEvento | null>(null)
  const [respostas, setRespostas] = useState<Record<string, string>>({})
  const [faltando, setFaltando] = useState<string[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  async function procurar() {
    setErro(null)
    setOcupado(true)
    try {
      const r = await cliente.consultarConvite(codigo)
      if (!r.convite) {
        setErro(r.erro ?? 'Não encontramos esse evento.')
        return
      }
      setConvite(r.convite)
      setRespostas({})
      setFaltando([])
    } catch (e) {
      setErro(mensagemDoErro(e))
    } finally {
      setOcupado(false)
    }
  }

  async function confirmar() {
    if (!convite) return
    setErro(null)

    /*
     * A conferência é feita ao TOCAR, e o que falta aparece escrito.
     *
     * O caminho fácil seria desabilitar o botão até tudo estar preenchido — e
     * foi exatamente isso que, no sistema web, fez alguém clicar em salvar, não
     * ver reação e sair achando que tinha salvado. Um botão que não reage não
     * ensina nada; uma frase dizendo o que falta, sim.
     */
    const pendentes = camposFaltando(convite.camposExtras, respostas)
    if (pendentes.length > 0) {
      setFaltando(pendentes.map(p => p.chave))
      setErro(fraseDoQueFalta(pendentes))
      return
    }

    setOcupado(true)
    try {
      const r = await cliente.entrarNoEvento(codigo, respostas)
      if (!r.participacao) {
        setErro(r.erro ?? 'Não conseguimos concluir sua inscrição.')
        return
      }
      // `replace` e não `push`: voltar para o formulário depois de já estar
      // dentro do evento só produziria uma segunda tentativa recusada.
      router.replace('/')
    } catch (e) {
      setErro(mensagemDoErro(e))
    } finally {
      setOcupado(false)
    }
  }

  function responder(chave: string, valor: string) {
    setRespostas(r => ({ ...r, [chave]: valor }))
    setFaltando(f => f.filter(c => c !== chave))
  }

  return (
    <Tela>
      {erro ? <Aviso tipo="erro">{erro}</Aviso> : null}

      {!convite ? (
        <>
          <Corpo>
            Digite o código que você recebeu de quem te contratou. Ele se
            parece com HJK-2026-K7M2.
          </Corpo>
          <Respiro />
          <Campo
            rotulo="Código do evento"
            value={codigo}
            onChangeText={t => setCodigo(mascararCodigo(t))}
            placeholder="ABC-2026-K7M2"
            autoCapitalize="characters"
            autoCorrect={false}
            autoFocus
            maxLength={14}
            style={e.codigo}
            ajuda="Pode digitar com ou sem os traços."
          />
          <Botao
            titulo="Procurar evento"
            onPress={procurar}
            ocupado={ocupado}
            desabilitado={codigo.replace(/[^A-Za-z0-9]/g, '').length < TAMANHO_DO_CODIGO}
          />
        </>
      ) : (
        <>
          <Cartao>
            <Legenda>{convite.organizacaoNome}</Legenda>
            <Respiro altura={espaco.xs} />
            <Titulo>{convite.eventoNome}</Titulo>
            <Respiro altura={espaco.s} />
            <Corpo>
              {formatarBR(convite.dataInicio, 'data')}
              {convite.local ? ` · ${convite.local}` : ''}
            </Corpo>
          </Cartao>

          {convite.exigeAprovacao ? (
            <Aviso tipo="atencao">
              Este evento confere as inscrições antes de liberar. Você entra na
              lista agora e recebe um aviso no WhatsApp quando for aprovado.
            </Aviso>
          ) : null}

          {convite.camposExtras.length > 0 ? (
            <>
              <Respiro altura={espaco.s} />
              <Corpo forte>O que este evento precisa saber</Corpo>
              <Legenda>Seu nome, CPF e telefone já estão na sua conta.</Legenda>
              <Respiro />
              {convite.camposExtras.map(campo => (
                <CampoDoEvento
                  key={campo.chave}
                  campo={campo}
                  valor={respostas[campo.chave] ?? ''}
                  faltando={faltando.includes(campo.chave)}
                  aoResponder={v => responder(campo.chave, v)}
                />
              ))}
            </>
          ) : null}

          <Botao titulo="Confirmar minha participação" onPress={confirmar} ocupado={ocupado} />
          <Respiro altura={espaco.s} />
          <Botao
            titulo="Não é este evento"
            onPress={() => { setConvite(null); setErro(null) }}
            tipo="texto"
            desabilitado={ocupado}
          />
        </>
      )}
    </Tela>
  )
}

/** Um campo do formulário, montado a partir do que o servidor mandou. */
function CampoDoEvento({
  campo, valor, faltando, aoResponder,
}: {
  campo: CampoDoFormulario
  valor: string
  faltando: boolean
  aoResponder: (v: string) => void
}) {
  const erro = faltando ? 'Precisa ser preenchido.' : undefined

  if (campo.tipo === 'escolha') {
    return (
      <View style={e.grupo}>
        <Corpo forte>{campo.rotulo}</Corpo>
        <Respiro altura={espaco.s} />
        <Escolha opcoes={campo.opcoes ?? []} valor={valor || null} aoEscolher={aoResponder} />
        {erro ? <Legenda>{erro}</Legenda> : null}
      </View>
    )
  }

  if (campo.tipo === 'data') {
    return (
      <Campo
        rotulo={campo.rotulo}
        value={valor}
        onChangeText={t => aoResponder(mascararData(t))}
        placeholder="DD/MM/AAAA"
        keyboardType="number-pad"
        maxLength={10}
        erro={erro}
      />
    )
  }

  return (
    <Campo
      rotulo={campo.rotulo}
      value={valor}
      onChangeText={aoResponder}
      keyboardType={campo.tipo === 'numero' ? 'number-pad' : 'default'}
      erro={erro}
    />
  )
}

const e = StyleSheet.create({
  codigo: {
    fontSize: fonte.titulo,
    letterSpacing: 2,
    textAlign: 'center',
    fontWeight: '700',
    color: cor.marca,
  },
  grupo: { marginBottom: espaco.g },
})
