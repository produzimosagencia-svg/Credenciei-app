// Criar um acesso.
//
// ─── O QUE ESTA TELA CRIA, E O QUE NÃO CRIA ─────────────────────────────────
//
// Ela cria SUPERVISOR — e nada mais. Um supervisor nasce preso a um setor de um
// evento: é só ali que ele enxerga equipe, presença e histórico. Não existe
// supervisor "da organização", e é essa amarra que faz o isolamento entre
// setores funcionar por construção.
//
// Admin e master são criados pela plataforma, noutro lugar. Colocar os três no
// mesmo formulário faria alguém dar acesso à organização inteira querendo dar
// acesso a um setor.

import { useEffect, useState } from 'react'
import { useRouter } from 'expo-router'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { formatCpf, formatTelefone, titleCaseNome } from '@credenciei/dominio'
import type { EventoComSetores } from '@credenciei/contrato'
import { mensagemDoErro } from '../../src/dados/pedido'
import { useSessao } from '../../src/sessao/contexto'
import {
  Aviso, Botao, Campo, Carregando, Cartao, Corpo, Escolha, Legenda, Respiro,
  Tela, TituloDaTela, TituloDeCartao,
} from '../../src/ui/componentes'
import { Icone } from '../../src/ui/icone'
import { cor, espaco, raio, texto, tipo, uso } from '../../src/ui/tema'

export default function NovoAcesso() {
  const router = useRouter()
  const { cliente } = useSessao()

  const [eventos, setEventos] = useState<EventoComSetores[] | null>(null)
  const [eventoId, setEventoId] = useState('')
  const [setorId, setSetorId] = useState('')
  const [nome, setNome] = useState('')
  const [cpf, setCpf] = useState('')
  const [telefone, setTelefone] = useState('')
  const [ativo, setAtivo] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [criado, setCriado] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    cliente.eventosComSetores()
      .then(lista => {
        if (!vivo) return
        setEventos(lista)
        const primeiro = lista[0]
        if (primeiro) {
          setEventoId(primeiro.eventoId)
          setSetorId(primeiro.setores[0]?.setorId ?? '')
        }
      })
      .catch(e => { if (vivo) setErro(mensagemDoErro(e)) })
    return () => { vivo = false }
  }, [cliente])

  const evento = eventos?.find(x => x.eventoId === eventoId)
  const setores = evento?.setores ?? []

  function trocarEvento(id: string) {
    setEventoId(id)
    // O setor pertence ao evento: manter o anterior criaria um supervisor
    // apontando para um setor de outro evento.
    const novo = eventos?.find(x => x.eventoId === id)
    setSetorId(novo?.setores[0]?.setorId ?? '')
  }

  async function salvar() {
    setErro(null)
    setSalvando(true)
    try {
      const r = await cliente.criarAcesso({ nome, cpf, telefone, eventoId, setorId, ativo })
      if (r.erro) return setErro(r.erro)
      setCriado(r.acesso?.nome ?? nome)
    } catch (e) {
      setErro(mensagemDoErro(e))
    } finally {
      setSalvando(false)
    }
  }

  if (criado) {
    return (
      <Tela>
        <Cartao>
          <View style={e.sucesso}>
            <Icone nome="CheckCircle" tamanho={44} tom={cor.sucesso600} espessura={1.8} />
            <TituloDeCartao>Acesso criado</TituloDeCartao>
            <Corpo><Corpo forte>{criado}</Corpo> já aparece na lista de acessos.</Corpo>
            <Legenda>
              {ativo
                ? 'Ela recebe um link para criar a senha e já pode entrar.'
                : 'O acesso foi criado bloqueado. Libere na lista quando for a hora.'}
            </Legenda>
          </View>
          <Respiro />
          <Botao titulo="Voltar para os acessos" onPress={() => router.replace('/acessos')} />
          <Respiro altura={espaco.s} />
          <Botao
            titulo="Criar outro"
            onPress={() => { setCriado(null); setNome(''); setCpf(''); setTelefone('') }}
            tipo="secundario"
          />
        </Cartao>
      </Tela>
    )
  }

  if (!eventos) {
    return <Tela>{erro ? <Aviso tipo="erro">{erro}</Aviso> : <Carregando />}</Tela>
  }

  if (eventos.length === 0) {
    return (
      <Tela>
        <TituloDaTela>Criar acesso</TituloDaTela>
        <Respiro />
        <Cartao>
          <Corpo>
            Cadastre um evento e ao menos um setor antes de criar supervisores.
            Sem setor, o supervisor não teria equipe nenhuma para cuidar.
          </Corpo>
        </Cartao>
      </Tela>
    )
  }

  return (
    <Tela>
      <TituloDaTela>Criar acesso</TituloDaTela>
      <Legenda>O supervisor é vinculado a um setor, e só enxerga aquele setor</Legenda>
      <Respiro />

      {erro ? <Aviso tipo="erro">{erro}</Aviso> : null}

      <Aviso tipo="info">
        O supervisor escaneia e gerencia a equipe de um setor específico. Ele não
        vê outros setores, outros eventos, nem a organização.
      </Aviso>

      <Cartao>
        <Campo
          rotulo="Nome completo"
          value={nome}
          onChangeText={t => setNome(titleCaseNome(t))}
          placeholder="Maria Aparecida Rocha"
          autoCapitalize="words"
        />
        <Campo
          rotulo="CPF"
          value={cpf}
          onChangeText={t => setCpf(formatCpf(t))}
          placeholder="000.000.000-00"
          keyboardType="number-pad"
          maxLength={14}
          ajuda="É por ele que a pessoa entra no sistema."
        />
        <Campo
          rotulo="Telefone"
          value={telefone}
          onChangeText={t => setTelefone(formatTelefone(t))}
          placeholder="(27) 99999-9999"
          keyboardType="phone-pad"
          maxLength={15}
        />
      </Cartao>

      <Cartao>
        <TituloDeCartao>Onde ele vai atuar</TituloDeCartao>
        <Respiro altura={espaco.m} />

        <Text style={e.rotulo}>EVENTO</Text>
        <Respiro altura={espaco.s} />
        {eventos.map(ev => {
          const marcado = ev.eventoId === eventoId
          return (
            <Pressable
              key={ev.eventoId}
              onPress={() => trocarEvento(ev.eventoId)}
              accessibilityRole="radio"
              accessibilityState={{ selected: marcado }}
              style={({ pressed }) => [e.opcao, marcado && e.opcaoMarcada, pressed && e.opcaoTocada]}
            >
              <View style={[e.marcador, marcado && e.marcadorAtivo]}>
                {marcado ? <Icone nome="Check" tamanho={12} tom="#ffffff" espessura={3} /> : null}
              </View>
              <Text style={[e.opcaoTexto, marcado && e.opcaoTextoMarcado]} numberOfLines={1}>
                {ev.nome}
              </Text>
            </Pressable>
          )
        })}

        <Respiro />
        <Text style={e.rotulo}>SETOR</Text>
        <Respiro altura={espaco.s} />
        {setores.length === 0 ? (
          <Corpo>Este evento ainda não tem setores.</Corpo>
        ) : (
          <Escolha
            opcoes={setores.map(s => s.nome)}
            valor={setores.find(s => s.setorId === setorId)?.nome ?? null}
            aoEscolher={nomeDoSetor => {
              const achado = setores.find(s => s.nome === nomeDoSetor)
              if (achado) setSetorId(achado.setorId)
            }}
          />
        )}
      </Cartao>

      <Cartao>
        <TituloDeCartao>Situação</TituloDeCartao>
        <Respiro altura={espaco.xs} />
        <Legenda>
          Ativo entra já. Bloqueado deixa tudo pronto na véspera para liberar só
          no dia.
        </Legenda>
        <Respiro altura={espaco.m} />
        <Escolha
          opcoes={['Ativo', 'Bloqueado']}
          valor={ativo ? 'Ativo' : 'Bloqueado'}
          aoEscolher={v => setAtivo(v === 'Ativo')}
        />
      </Cartao>

      {/*
        O botão não trava por campo vazio: quem toca e não vê reação sai
        achando que o app quebrou. Quem recusa é o servidor, com o motivo
        escrito na tela.
      */}
      <Botao titulo="Criar acesso" onPress={salvar} ocupado={salvando} />
      <Respiro altura={espaco.s} />
      <Botao titulo="Cancelar" onPress={() => router.back()} tipo="fantasma" />
    </Tela>
  )
}

const e = StyleSheet.create({
  sucesso: { alignItems: 'center', gap: espaco.s, paddingVertical: espaco.g },

  rotulo: { ...texto.etiqueta, color: uso.tintaFraca },

  opcao: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaco.m,
    minHeight: 48,
    paddingHorizontal: espaco.m,
    borderRadius: raio.campo,
    borderWidth: 1,
    borderColor: uso.borda,
    marginBottom: espaco.s,
  },
  opcaoMarcada: { borderColor: cor.acento500, backgroundColor: cor.acento50 },
  opcaoTocada: { backgroundColor: cor.neutro50 },
  opcaoTexto: { ...texto.corpo, color: uso.tintaMedia, flex: 1 },
  opcaoTextoMarcado: { color: uso.tinta, fontFamily: tipo.semi },
  marcador: {
    width: 20,
    height: 20,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: cor.neutro300,
    alignItems: 'center',
    justifyContent: 'center',
  },
  marcadorAtivo: { backgroundColor: cor.acento500, borderColor: cor.acento500 },
})
