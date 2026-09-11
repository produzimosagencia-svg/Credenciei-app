// Bloquear CPF — a lista de quem não pode se cadastrar NESTE evento.
//
// Trazido do site em 11/09/2026. O caso real: aparece alguém tentando entrar
// no evento sem trabalhar. Tirar da equipe resolve o vínculo de hoje, mas a
// pessoa se cadastra de novo pelo mesmo link cinco minutos depois. O
// bloqueio é o que fecha essa porta — e some assim que alguém libera.
//
// ─── O ESCOPO É O EVENTO, E SÓ ELE ───────────────────────────────────────────
//
// Bloqueio DO EVENTO, não do setor: barrar só num setor deixaria a pessoa se
// cadastrar no setor ao lado, e o furo continuaria aberto.
//
// E é só DESTE evento — a pessoa segue livre pra trabalhar em qualquer outro
// evento da plataforma. Isto é uma decisão operacional de um evento, tomada
// com pressa no meio da correria; transformá-la em veto permanente ao
// trabalho de alguém seria outra coisa, de outro peso.
//
// Bloquear não apaga quem já está cadastrado — se a pessoa já está na
// equipe, tire ela do setor primeiro. Os pontos que ela bateu continuam no
// histórico.

import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { formatCpf, formatarBR } from '@credenciei/dominio'
import type { CpfBloqueado, EventoEscaneavel } from '@credenciei/contrato'
import { usePedido, mensagemDoErro } from '../../src/dados/pedido'
import { useSessao } from '../../src/sessao/contexto'
import {
  Aviso, Botao, Campo, Carregando, Cartao, Corpo, Legenda, Respiro, Tela,
  TituloDaTela, TituloDeCartao,
} from '../../src/ui/componentes'
import { Icone } from '../../src/ui/icone'
import { cor, espaco, texto, tipo, uso } from '../../src/ui/tema'

export default function BloquearCpf() {
  const { cliente } = useSessao()

  const [eventos, setEventos] = useState<EventoEscaneavel[] | null>(null)
  const [eventoId, setEventoId] = useState('')
  const [erroDeCarga, setErroDeCarga] = useState<string | null>(null)
  const [versao, setVersao] = useState(0)

  const [cpf, setCpf] = useState('')
  const [motivo, setMotivo] = useState('')
  const [bloqueando, setBloqueando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    cliente.eventosParaBloqueio()
      .then(lista => { if (vivo) setEventos(lista) })
      .catch(e => { if (vivo) setErroDeCarga(mensagemDoErro(e)) })
    return () => { vivo = false }
  }, [cliente])

  const { pedido, recarregar } = usePedido<CpfBloqueado[] | null>(
    async () => (eventoId ? cliente.bloqueiosDoEvento(eventoId) : null),
    [cliente, eventoId, versao],
  )
  const bloqueados = pedido.estado === 'pronto' ? pedido.dados : null

  async function bloquear() {
    setErro(null)
    setOk(null)
    setBloqueando(true)
    try {
      const r = await cliente.bloquearCpf(eventoId, cpf, motivo)
      if (r.erro) return setErro(r.erro)
      setOk(`${formatCpf(r.cpf ?? '')} bloqueado neste evento.`)
      setCpf('')
      setMotivo('')
      setVersao(v => v + 1)
    } catch (e) {
      setErro(mensagemDoErro(e))
    } finally {
      setBloqueando(false)
    }
  }

  async function liberar(id: string) {
    setErro(null)
    setOk(null)
    try {
      const r = await cliente.desbloquearCpf(id, eventoId)
      if (r.erro) return setErro(r.erro)
      setVersao(v => v + 1)
    } catch (e) {
      setErro(mensagemDoErro(e))
    }
  }

  if (!eventos) {
    return <Tela>{erroDeCarga ? <Aviso tipo="erro">{erroDeCarga}</Aviso> : <Carregando />}</Tela>
  }

  if (!eventoId) {
    return (
      <Tela>
        <TituloDaTela>Bloquear CPF</TituloDaTela>
        <Legenda>Escolha o evento — o bloqueio vale só dentro dele</Legenda>
        <Respiro />
        <Explicacao />
        <Respiro />
        {eventos.length === 0 ? (
          <Cartao>
            <Corpo>Você precisa de um evento para bloquear alguém nele.</Corpo>
          </Cartao>
        ) : (
          <Cartao semPadding>
            {eventos.map((ev, i) => (
              <View key={ev.eventoId}>
                {i > 0 ? <View style={e.fio} /> : null}
                <Pressable
                  onPress={() => setEventoId(ev.eventoId)}
                  style={({ pressed }) => [e.opcao, pressed && e.opcaoTocada]}
                >
                  <Icone nome="ShieldBan" tamanho={16} tom={uso.tintaFraca} />
                  <Text style={e.opcaoTexto} numberOfLines={1}>{ev.nome}</Text>
                  <Icone nome="ChevronRight" tamanho={16} tom={cor.neutro400} />
                </Pressable>
              </View>
            ))}
          </Cartao>
        )}
      </Tela>
    )
  }

  return (
    <Tela>
      <TituloDaTela>Bloquear CPF</TituloDaTela>
      <Legenda>{eventos.find(ev => ev.eventoId === eventoId)?.nome} — quem não pode se cadastrar neste evento</Legenda>
      <Respiro altura={espaco.s} />
      <Botao titulo="Trocar de evento" onPress={() => setEventoId('')} tipo="fantasma" />
      <Respiro />

      <Explicacao />
      <Respiro />

      <Cartao>
        <TituloDeCartao>Bloquear um CPF</TituloDeCartao>
        <Legenda>Vale só para este evento</Legenda>
        <Respiro altura={espaco.m} />

        <Campo
          rotulo="CPF"
          value={cpf}
          onChangeText={t => { setCpf(formatCpf(t)); setErro(null) }}
          placeholder="000.000.000-00"
          keyboardType="number-pad"
          maxLength={14}
        />
        <Campo
          rotulo="Motivo (opcional)"
          value={motivo}
          onChangeText={setMotivo}
          placeholder="Ex.: tentou entrar sem estar escalado"
        />

        {erro ? <Aviso tipo="erro">{erro}</Aviso> : null}
        {ok ? <Aviso tipo="sucesso">{ok}</Aviso> : null}

        <Botao
          titulo="Bloquear"
          onPress={bloquear}
          ocupado={bloqueando}
          desabilitado={cpf.replace(/\D/g, '').length !== 11}
        />
      </Cartao>

      {pedido.estado === 'carregando' ? <Carregando /> : null}
      {pedido.estado === 'falhou' ? (
        <>
          <Aviso tipo="erro">{pedido.mensagem}</Aviso>
          <Botao titulo="Tentar de novo" onPress={recarregar} tipo="secundario" />
        </>
      ) : null}

      {bloqueados ? (
        <>
          <Respiro />
          <Legenda>
            {bloqueados.length} CPF{bloqueados.length === 1 ? '' : 's'} bloqueado{bloqueados.length === 1 ? '' : 's'} — liberar devolve o acesso na hora
          </Legenda>
          <Respiro altura={espaco.s} />

          {bloqueados.length === 0 ? (
            <Cartao><Corpo>Nenhum CPF bloqueado neste evento.</Corpo></Cartao>
          ) : (
            <Cartao semPadding>
              {bloqueados.map((b, i) => (
                <View key={b.id}>
                  {i > 0 ? <View style={e.fio} /> : null}
                  <View style={e.linha}>
                    <View style={e.linhaTexto}>
                      <Corpo forte>{formatCpf(b.cpf)}</Corpo>
                      <Legenda>
                        {b.motivo ? `${b.motivo} · ` : ''}
                        {b.bloqueadoPor ? `por ${b.bloqueadoPor} · ` : ''}
                        {formatarBR(b.criadoEm, 'curto')}
                      </Legenda>
                    </View>
                    <Botao titulo="Liberar" tipo="secundario" onPress={() => liberar(b.id)} />
                  </View>
                </View>
              ))}
            </Cartao>
          )}
        </>
      ) : null}
    </Tela>
  )
}

function Explicacao() {
  return (
    <Cartao>
      <View style={e.explicacaoTitulo}>
        <Icone nome="AlertCircle" tamanho={14} tom={cor.info600} />
        <Text style={e.explicacaoTituloTexto}>Para que serve</Text>
      </View>
      <Respiro altura={espaco.s} />
      <Text style={e.explicacaoTexto}>
        Use quando você identificar alguém tentando entrar no evento{' '}
        <Text style={e.negrito}>sem estar escalado para trabalhar</Text>. Ao bloquear o
        CPF, essa pessoa não consegue mais se cadastrar por nenhum link deste evento, nem
        em outro setor — e a leitura do QR dela é recusada no portão.
      </Text>
      <Respiro altura={espaco.s} />
      <Text style={e.explicacaoTexto}>
        <Text style={e.negrito}>Vale só para este evento.</Text> O bloqueio não impede a
        pessoa de se cadastrar em outro evento da plataforma, hoje ou no futuro.
      </Text>
      <Respiro altura={espaco.s} />
      <Text style={e.explicacaoTexto}>
        <Text style={e.negrito}>Dá para desfazer a qualquer momento</Text> — é só tocar em
        &quot;Liberar&quot; na lista, e a pessoa volta a poder se cadastrar na hora.
      </Text>
      <Respiro altura={espaco.s} />
      <Text style={e.explicacaoTextoFraco}>
        Bloquear não apaga quem já está cadastrado. Se a pessoa já está na equipe, tire
        ela do setor primeiro — os pontos que ela bateu continuam no histórico.
      </Text>
    </Cartao>
  )
}

const e = StyleSheet.create({
  fio: { height: 1, backgroundColor: uso.borda },
  opcao: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaco.m,
    paddingHorizontal: espaco.g,
    minHeight: 52,
  },
  opcaoTocada: { backgroundColor: cor.neutro50 },
  opcaoTexto: { ...texto.corpo, color: uso.tinta, flex: 1 },

  linha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaco.m,
    paddingHorizontal: espaco.g,
    paddingVertical: espaco.m,
  },
  linhaTexto: { flex: 1, minWidth: 0 },

  explicacaoTitulo: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  explicacaoTituloTexto: { ...texto.corpoForte, fontFamily: tipo.semi, color: uso.tinta },
  explicacaoTexto: { ...texto.xs, fontFamily: tipo.regular, color: uso.tintaMedia, lineHeight: 18 },
  explicacaoTextoFraco: { ...texto.xs, fontFamily: tipo.regular, color: uso.tintaFraca, lineHeight: 18 },
  negrito: { fontFamily: tipo.semi, color: uso.tinta },
})
