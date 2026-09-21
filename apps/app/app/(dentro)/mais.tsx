// O menu inteiro.
//
// Na barra de baixo cabem três abas. Aqui está o resto — e o resto INTEIRO,
// incluindo o que já está nas abas, porque uma lista pela metade obriga quem
// procura a lembrar onde cada coisa mora.
//
// A ordem e os grupos são os do menu lateral do sistema web: um bloco sem
// rótulo com o trabalho de um dia de evento, e abaixo o bloco "Plataforma", que
// só o dono da plataforma enxerga.

import { useRouter } from 'expo-router'
import { useMemo } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { NOME_DO_PAPEL } from '@credenciei/dominio'
import { usePedido } from '../../src/dados/pedido'
import { useSessao } from '../../src/sessao/contexto'
import { useAlvoDePermissao } from '../../src/navegacao/alvo-de-permissao'
import { menuDe, type ItemDoMenu } from '../../src/navegacao/menu'
import { Icone } from '../../src/ui/icone'
import {
  Botao, Cartao, Etiqueta, Legenda, Respiro, Selo, Separador, Tela, TituloDaTela,
} from '../../src/ui/componentes'
import { espaco, raio, texto, tipo } from '../../src/ui/tema'
import { useTema, type Tokens } from '../../src/ui/tema-contexto'

export default function Mais() {
  const router = useRouter()
  const { cliente, sessao, sair } = useSessao()
  const { pedido } = usePedido(() => cliente.eu(), [cliente])
  const alvo = useAlvoDePermissao()
  const { cor, uso, modo, alternar } = useTema()
  const e = useEstilos()

  const grupos = menuDe(alvo ?? sessao?.papel ?? 'colaborador')

  return (
    <Tela>
      <TituloDaTela>Mais</TituloDaTela>
      <Respiro />

      <Cartao>
        <View style={e.pessoa}>
          <View style={e.iniciais}>
            <Text style={e.iniciaisTexto}>
              {pedido.estado === 'pronto' ? iniciaisDe(pedido.dados.nome) : '··'}
            </Text>
          </View>
          <View style={e.pessoaTexto}>
            <Text style={e.nome} numberOfLines={1}>
              {pedido.estado === 'pronto' ? pedido.dados.nome : 'Carregando…'}
            </Text>
            <Legenda>
              {sessao ? NOME_DO_PAPEL[sessao.papel] : ''}
              {pedido.estado === 'pronto' && pedido.dados.telefone
                ? ` · ${pedido.dados.telefone}`
                : ''}
            </Legenda>
          </View>
        </View>
      </Cartao>

      {grupos.map((grupo, i) => (
        <View key={grupo.titulo ?? `grupo-${i}`}>
          {grupo.titulo ? (
            <>
              <Respiro altura={espaco.s} />
              <Etiqueta>{grupo.titulo}</Etiqueta>
              <Respiro altura={espaco.s} />
            </>
          ) : null}

          <Cartao semPadding>
            {grupo.itens.map((item, j) => (
              <View key={item.rota}>
                {j > 0 ? <View style={e.fio} /> : null}
                <LinhaDoMenu item={item} aoTocar={() => router.push(item.rota as never)} />
              </View>
            ))}
          </Cartao>
        </View>
      ))}

      <Separador />

      {/*
        O tema Arena (escuro) chegou no rebranding de 11/09/2026. O app
        continua abrindo claro — decisão do Juan, diferente do site — e o
        escuro fica aqui, como escolha da pessoa, guardada no aparelho.
      */}
      <Cartao semPadding>
        <Pressable
          onPress={alternar}
          accessibilityRole="switch"
          accessibilityState={{ checked: modo === 'escuro' }}
          style={({ pressed }) => [e.linha, pressed && e.linhaTocada]}
        >
          <View style={e.blocoDoIcone}>
            <Icone nome={modo === 'escuro' ? 'Moon' : 'Sun'} tamanho={18} tom={cor.neutro600} />
          </View>
          <Text style={e.rotulo}>{modo === 'escuro' ? 'Tema escuro' : 'Tema claro'}</Text>
          <Selo texto={modo === 'escuro' ? 'Arena' : 'Padrão'} tipo="info" />
        </Pressable>
      </Cartao>

      <Respiro altura={espaco.m} />
      <Botao titulo="Sair da conta" onPress={() => { void sair() }} tipo="secundario" />

      <Respiro />
      <Legenda>Credenciei · Produzimos</Legenda>
    </Tela>
  )
}

/**
 * Uma linha do menu.
 *
 * O que ainda não foi construído aparece marcado, e continua tocável: a tela
 * existe e diz o que vai fazer. Item cinza que não reage ao toque é a mesma
 * armadilha do botão que não responde — a pessoa não sabe se está quebrado ou
 * se ela fez algo errado.
 */
function LinhaDoMenu({ item, aoTocar }: { item: ItemDoMenu; aoTocar: () => void }) {
  const { cor } = useTema()
  const e = useEstilos()
  return (
    <Pressable
      onPress={aoTocar}
      accessibilityRole="link"
      style={({ pressed }) => [e.linha, pressed && e.linhaTocada]}
    >
      <View style={e.blocoDoIcone}>
        <Icone nome={item.icone} tamanho={18} tom={cor.neutro600} />
      </View>

      <Text style={e.rotulo} numberOfLines={1}>{item.rotulo}</Text>

      {item.pronta ? null : <Selo texto="em construção" tipo="aviso" />}
      <Icone nome="ChevronRight" tamanho={16} tom={cor.neutro400} />
    </Pressable>
  )
}

/** As iniciais, como o chip do usuário do painel web. */
function iniciaisDe(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return '··'
  const letras = partes.length > 1
    ? (partes[0]?.[0] ?? '') + (partes[partes.length - 1]?.[0] ?? '')
    : (partes[0] ?? '').slice(0, 2)
  return letras.toUpperCase()
}

function criarEstilos(cor: Tokens['cor'], uso: Tokens['uso']) {
  return StyleSheet.create({
    pessoa: { flexDirection: 'row', alignItems: 'center', gap: espaco.m },
    iniciais: {
      width: 44,
      height: 44,
      borderRadius: raio.peca,
      backgroundColor: cor.acento50,
      alignItems: 'center',
      justifyContent: 'center',
    },
    iniciaisTexto: { ...texto.corpoForte, color: cor.acento700 },
    pessoaTexto: { flex: 1, minWidth: 0 },
    nome: { ...texto.tituloCartao, color: uso.tinta },

    linha: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: espaco.m,
      paddingHorizontal: espaco.g,
      minHeight: 56,
    },
    linhaTocada: { backgroundColor: cor.neutro50 },
    fio: { height: 1, backgroundColor: uso.borda, marginLeft: 60 },
    blocoDoIcone: { width: 28, alignItems: 'center' },
    rotulo: { ...texto.base, fontFamily: tipo.media, color: uso.tinta, flex: 1 },
  })
}

function useEstilos() {
  const { cor, uso } = useTema()
  return useMemo(() => criarEstilos(cor, uso), [cor, uso])
}
