// Editar colaborador — achar alguém do evento e abrir a ficha dela.
//
// Trazido do site em 11/09/2026. Não é funcionalidade nova: mover de setor,
// corrigir CPF, ajustar valor e tornar supervisor já existem dentro da ficha
// da pessoa (a mesma que "Ver equipe" abre ao tocar num nome). O que faltava
// era o CAMINHO até ela — quem não sabia em qual setor a pessoa estava tinha
// que abrir setor por setor, e num evento de muitos setores isso é a
// diferença entre resolver na hora e não resolver.
//
// Sem supervisor aqui de propósito: ele já tem a própria equipe na tela do
// setor — o atalho existe pra quem enxerga o evento inteiro.

import { useEffect, useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { formatCpf } from '@credenciei/dominio'
import type { BuscaDeColaboradores, ColaboradorDoEvento, EventoEscaneavel } from '@credenciei/contrato'
import { mensagemDoErro } from '../../src/dados/pedido'
import { useSessao } from '../../src/sessao/contexto'
import {
  Aviso, Botao, Campo, Carregando, Cartao, Corpo, Legenda, Respiro, Selo,
  Tela, TituloDaTela, TituloDeCartao,
} from '../../src/ui/componentes'
import { FichaDaPessoaModal } from '../../src/ui/ficha-da-pessoa'
import { Icone } from '../../src/ui/icone'
import { espaco, texto } from '../../src/ui/tema'
import { useTema, type Tokens } from '../../src/ui/tema-contexto'

const MINIMO_PARA_BUSCAR = 2

export default function EditarColaborador() {
  const { cliente } = useSessao()
  const { cor, uso } = useTema()
  const e = useMemo(() => criarEstilos(cor, uso), [cor, uso])

  const [eventos, setEventos] = useState<EventoEscaneavel[] | null>(null)
  const [eventoId, setEventoId] = useState('')
  const [dados, setDados] = useState<BuscaDeColaboradores | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [aberta, setAberta] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    cliente.eventosParaEditarColaborador()
      .then(lista => { if (vivo) setEventos(lista) })
      .catch(e => { if (vivo) setErro(mensagemDoErro(e)) })
    return () => { vivo = false }
  }, [cliente])

  async function abrirEvento(id: string) {
    setEventoId(id)
    setErro(null)
    try {
      const r = await cliente.colaboradoresDoEvento(id)
      setDados(r)
    } catch (e) {
      setErro(mensagemDoErro(e))
    }
  }

  async function recarregar() {
    if (!eventoId) return
    try {
      setDados(await cliente.colaboradoresDoEvento(eventoId))
    } catch (e) {
      setErro(mensagemDoErro(e))
    }
  }

  if (!eventos) {
    return <Tela>{erro ? <Aviso tipo="erro">{erro}</Aviso> : <Carregando />}</Tela>
  }

  if (!eventoId) {
    return (
      <Tela>
        <TituloDaTela>Editar colaborador</TituloDaTela>
        <Legenda>Escolha o evento em que a pessoa está</Legenda>
        <Respiro />
        {eventos.length === 0 ? (
          <Cartao>
            <Corpo>Crie um evento no Painel para poder editar a equipe dele.</Corpo>
          </Cartao>
        ) : (
          <Cartao semPadding>
            {eventos.map((ev, i) => (
              <View key={ev.eventoId}>
                {i > 0 ? <View style={e.fio} /> : null}
                <Pressable
                  onPress={() => abrirEvento(ev.eventoId)}
                  style={({ pressed }) => [e.opcao, pressed && e.opcaoTocada]}
                >
                  <Icone nome="UserCog" tamanho={16} tom={uso.tintaFraca} />
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

  if (!dados) {
    return <Tela>{erro ? <Aviso tipo="erro">{erro}</Aviso> : <Carregando />}</Tela>
  }

  const termo = busca.trim().toLowerCase()
  const digitos = busca.replace(/\D/g, '')
  const encontrados = termo.length < MINIMO_PARA_BUSCAR ? [] : dados.colaboradores.filter(p =>
    p.nome.toLowerCase().includes(termo)
    || (digitos.length >= 3 && p.cpf.includes(digitos))
    || p.setorNome.toLowerCase().includes(termo),
  ).slice(0, 30)

  return (
    <Tela>
      <TituloDaTela>Editar colaborador</TituloDaTela>
      <Legenda>{dados.eventoNome} — mover de setor, corrigir dados e ajustar valor</Legenda>
      <Respiro altura={espaco.s} />
      <Botao titulo="Trocar de evento" onPress={() => { setEventoId(''); setDados(null); setBusca('') }} tipo="fantasma" />
      <Respiro />

      {erro ? <Aviso tipo="erro">{erro}</Aviso> : null}

      <Cartao>
        <TituloDeCartao>Quem você procura?</TituloDeCartao>
        <Legenda>
          {dados.colaboradores.length.toLocaleString('pt-BR')} pessoas neste evento — busque
          por nome, CPF ou setor
        </Legenda>
        <Respiro altura={espaco.m} />
        <Campo
          value={busca}
          onChangeText={setBusca}
          placeholder="Nome, CPF ou setor…"
          autoCapitalize="none"
          autoCorrect={false}
        />
      </Cartao>

      {termo.length < MINIMO_PARA_BUSCAR ? null : encontrados.length === 0 ? (
        <Cartao><Corpo>Ninguém com &quot;{busca}&quot;.</Corpo></Cartao>
      ) : (
        <Cartao semPadding>
          {encontrados.map((p, i) => (
            <View key={p.participacaoId}>
              {i > 0 ? <View style={e.fio} /> : null}
              <LinhaDoColaborador colaborador={p} onAbrir={() => setAberta(p.participacaoId)} />
            </View>
          ))}
        </Cartao>
      )}

      {aberta ? (
        <FichaDaPessoaModal
          participacaoId={aberta}
          aoFechar={() => setAberta(null)}
          aoMudar={recarregar}
        />
      ) : null}
    </Tela>
  )
}

function LinhaDoColaborador({
  colaborador: p, onAbrir,
}: { colaborador: ColaboradorDoEvento; onAbrir: () => void }) {
  const { cor, uso } = useTema()
  const e = useMemo(() => criarEstilos(cor, uso), [cor, uso])
  return (
    <Pressable
      onPress={onAbrir}
      style={({ pressed }) => [e.pessoaLinha, pressed && e.opcaoTocada]}
    >
      <View style={e.pessoaTexto}>
        <View style={e.pessoaTopo}>
          <Corpo forte>{p.nome}</Corpo>
          {!p.ativo ? <Selo texto="Não ativado" tipo="aviso" /> : null}
        </View>
        <Legenda>{p.setorNome}{p.cargo ? ` · ${p.cargo}` : ''} · {formatCpf(p.cpf)}</Legenda>
      </View>
      <Icone nome="ChevronRight" tamanho={16} tom={cor.neutro400} />
    </Pressable>
  )
}

function criarEstilos(cor: Tokens['cor'], uso: Tokens['uso']) {
  return StyleSheet.create({
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

    pessoaLinha: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: espaco.s,
      paddingHorizontal: espaco.g,
      paddingVertical: espaco.m,
    },
    pessoaTexto: { flex: 1, minWidth: 0, gap: 2 },
    pessoaTopo: { flexDirection: 'row', alignItems: 'center', gap: espaco.s, flexWrap: 'wrap' },
  })
}
