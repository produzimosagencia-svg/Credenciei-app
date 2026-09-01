// Encontre colaborador — a base regional da plataforma.
//
// Serviço vendido à parte: quem consulta e monta equipe para o evento de um
// cliente é o dono da plataforma, não o cliente. Por isso a CIDADE importa
// aqui e não importa na base comum — a pergunta desta tela é "quem eu tenho em
// Vitória que já trabalhou?".
//
// ─── O NÚMERO QUE VALE É PRESENÇA, NÃO CADASTRO ─────────────────────────────
//
// A lista mostra em quantos eventos a pessoa de fato TRABALHOU, e não em
// quantos se inscreveu. Cadastro sem presença não diz nada sobre ela; presença
// diz. É a diferença entre "está na lista" e "apareceu" — e é sobre isso que se
// decide chamar alguém.

import { useState } from 'react'
import { useRouter } from 'expo-router'
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native'
import { formatCpf, formatTelefone, formatarBR } from '@credenciei/dominio'
import type { PessoaRegional } from '@credenciei/contrato'
import { usePedido } from '../../src/dados/pedido'
import { useSessao } from '../../src/sessao/contexto'
import {
  Aviso, Botao, Campo, Carregando, Cartao, Corpo, Indicador, Legenda, Respiro,
  Selo, Tela, TituloDaTela, TituloDeCartao,
} from '../../src/ui/componentes'
import { Icone } from '../../src/ui/icone'
import { cor, espaco, raio, texto, tipo, uso } from '../../src/ui/tema'

const ICONE: Record<string, string> = {
  encontradas: 'UserSearch',
  com_historico: 'UserCheck',
  cidades: 'MapPin',
  com_telefone: 'MessageCircle',
}

export default function EncontrarColaborador() {
  const { cliente } = useSessao()
  const [busca, setBusca] = useState('')
  const [cidade, setCidade] = useState('')

  const { pedido, recarregar } = usePedido(
    () => cliente.encontrarColaborador({ busca, cidade }),
    [cliente, busca, cidade],
  )
  const dados = pedido.estado === 'pronto' ? pedido.dados : null

  return (
    <Tela>
      <TituloDaTela>Encontre colaborador</TituloDaTela>
      <Legenda>
        Base regional da plataforma — para montar equipe para o evento de um
        cliente que contratou o serviço
      </Legenda>
      <Respiro />

      {dados ? (
        <View style={e.grade}>
          {dados.indicadores.map(i => (
            <View key={i.chave} style={e.gradeItem}>
              <Indicador
                rotulo={i.rotulo}
                valor={i.valor}
                sub={i.sub}
                tom={i.tom}
                icone={<Icone nome={ICONE[i.chave] ?? 'Users'} tamanho={16} tom="#ffffff" />}
              />
            </View>
          ))}
        </View>
      ) : null}

      <Respiro altura={espaco.m} />

      <Campo
        value={busca}
        onChangeText={setBusca}
        placeholder="Nome ou CPF…"
        autoCapitalize="none"
        autoCorrect={false}
      />

      {/*
        As cidades vêm prontas do servidor e NÃO encolhem com o filtro: uma
        lista que some conforme se usa vira um beco sem saída — a pessoa filtra
        por uma cidade e perde o caminho para as outras.
      */}
      {dados && dados.cidades.length > 0 ? (
        <>
          <Text style={e.rotulo}>CIDADE</Text>
          <Respiro altura={espaco.s} />
          <View style={e.cidades}>
            <Pressable
              onPress={() => setCidade('')}
              style={[e.cidade, cidade === '' && e.cidadeAtiva]}
            >
              <Text style={[e.cidadeTexto, cidade === '' && e.cidadeTextoAtivo]}>Todas</Text>
            </Pressable>
            {dados.cidades.map(c => (
              <Pressable
                key={c}
                onPress={() => setCidade(c === cidade ? '' : c)}
                style={[e.cidade, cidade === c && e.cidadeAtiva]}
              >
                <Text style={[e.cidadeTexto, cidade === c && e.cidadeTextoAtivo]}>{c}</Text>
              </Pressable>
            ))}
          </View>
          <Respiro altura={espaco.m} />
        </>
      ) : null}

      {pedido.estado === 'carregando' ? <Carregando /> : null}

      {pedido.estado === 'falhou' ? (
        <>
          <Aviso tipo="erro">{pedido.mensagem}</Aviso>
          <Botao titulo="Tentar de novo" onPress={recarregar} tipo="secundario" />
        </>
      ) : null}

      {dados ? (
        dados.pessoas.length === 0 ? (
          <Cartao>
            <Corpo>
              {busca || cidade
                ? 'Ninguém encontrado. Tente outro nome ou outra cidade — a grafia da cidade é a que a pessoa digitou no cadastro.'
                : 'A base se preenche sozinha conforme as equipes se cadastram nos eventos.'}
            </Corpo>
          </Cartao>
        ) : (
          <Cartao semPadding>
            {dados.pessoas.map((p, i) => (
              <View key={p.cpf}>
                {i > 0 ? <View style={e.fio} /> : null}
                <LinhaRegional pessoa={p} />
              </View>
            ))}
          </Cartao>
        )
      ) : null}
    </Tela>
  )
}

function LinhaRegional({ pessoa }: { pessoa: PessoaRegional }) {
  const router = useRouter()

  /*
   * Chamar abre o WhatsApp com a conversa já aberta.
   *
   * É o que esta tela existe para fazer: achar alguém e falar com ela. Copiar
   * o número e colar noutro aplicativo é o caminho que faz ninguém chamar.
   */
  async function chamar() {
    if (!pessoa.telefone) return
    const numero = `55${pessoa.telefone.replace(/\D/g, '')}`
    try {
      await Linking.openURL(`https://wa.me/${numero}`)
    } catch {
      // Sem WhatsApp instalado, nada acontece — e o número segue na tela.
    }
  }

  return (
    <View style={e.pessoa}>
      <View style={e.linhaDoNome}>
        {/*
          O nome abre a ficha: histórico entre organizações e o botão de
          atribuir a um evento. É o passo que fecha "achei" em "chamei" — sem
          ele, esta tela só serve para telefonar.
        */}
        <Pressable onPress={() => router.push(`/pessoa/${pessoa.cpf}` as never)} hitSlop={8}>
          <TituloDeCartao>{pessoa.nome}</TituloDeCartao>
        </Pressable>
        <Selo
          texto={pessoa.eventosTrabalhados > 0
            ? `${pessoa.eventosTrabalhados} evento${pessoa.eventosTrabalhados === 1 ? '' : 's'} trabalhado${pessoa.eventosTrabalhados === 1 ? '' : 's'}`
            : 'Sem presença registrada'}
          tipo={pessoa.eventosTrabalhados > 0 ? 'sucesso' : 'info'}
        />
      </View>

      <View style={e.metas}>
        {pessoa.funcao ? <Meta icone="IdCard" texto={pessoa.funcao} /> : null}
        <Meta icone="MapPin" texto={pessoa.cidade || 'cidade não informada'} />
        <Meta icone="User" texto={formatCpf(pessoa.cpf)} />
        <Meta
          icone="Building2"
          texto={`${pessoa.organizacoes} organizaç${pessoa.organizacoes === 1 ? 'ão' : 'ões'}`}
        />
        <Meta icone="Clock" texto={`último em ${formatarBR(pessoa.ultimo, 'data')}`} />
      </View>

      <Respiro altura={espaco.s} />
      {pessoa.telefone ? (
        <Botao titulo={`Chamar no WhatsApp · ${formatTelefone(pessoa.telefone)}`} onPress={chamar} tipo="acento" />
      ) : (
        <Legenda>Sem telefone cadastrado — não dá para chamar por aqui.</Legenda>
      )}
    </View>
  )
}

function Meta({ icone, texto: valor }: { icone: string; texto: string }) {
  return (
    <View style={e.meta}>
      <Icone nome={icone} tamanho={11} tom={uso.tintaFraca} />
      <Text style={e.metaTexto} numberOfLines={1}>{valor}</Text>
    </View>
  )
}

const e = StyleSheet.create({
  grade: { flexDirection: 'row', flexWrap: 'wrap', gap: espaco.m },
  gradeItem: { width: '48%', flexGrow: 1 },

  rotulo: { ...texto.etiqueta, color: uso.tintaFraca },
  cidades: { flexDirection: 'row', flexWrap: 'wrap', gap: espaco.s },
  cidade: {
    minHeight: 36,
    paddingHorizontal: espaco.m,
    borderRadius: raio.pilula,
    borderWidth: 1,
    borderColor: uso.borda,
    backgroundColor: uso.superficie,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cidadeAtiva: { backgroundColor: cor.acento500, borderColor: cor.acento600 },
  cidadeTexto: { ...texto.xs, fontFamily: tipo.semi, color: uso.tintaMedia },
  cidadeTextoAtivo: { color: '#ffffff' },

  fio: { height: 1, backgroundColor: uso.borda },
  pessoa: { padding: espaco.g },
  linhaDoNome: { flexDirection: 'row', alignItems: 'center', gap: espaco.s, flexWrap: 'wrap' },
  metas: { flexDirection: 'row', flexWrap: 'wrap', gap: espaco.m, marginTop: espaco.s },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: '100%' },
  metaTexto: { ...texto.xs, fontFamily: tipo.regular, color: uso.tintaFraca, flexShrink: 1 },
})
