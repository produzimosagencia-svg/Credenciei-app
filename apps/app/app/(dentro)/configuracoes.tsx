// Configurações — quem pode o quê, por organização.
//
// ─── A CAMADA 2 DE `capacidade()` ───────────────────────────────────────────
//
// Três camadas decidem uma capacidade — usuário → organização → padrão do
// código (`packages/dominio/src/permissoes.ts`). Esta tela edita a do meio: a
// exceção que uma ORGANIZAÇÃO configurou, ou o padrão da PLATAFORMA inteira
// (`organizacaoId` nulo), que vale pra quem não tiver regra própria.
//
// A tabela guarda EXCEÇÕES, não a régua inteira — vazia, todo papel se
// comporta exatamente como sempre. Isso é o que permite ligar isto sem
// nenhuma migração de dado: não existe "migrar as permissões atuais", elas
// continuam no código, e o banco só responde onde alguém discordou dele.
//
// Master fica de fora da grade de propósito (ver `resolver`, em
// `permissoes.ts`): uma tela de permissões capaz de tirar do master a
// permissão de abri-la se tranca sozinha.
//
// Cópia da REGRA do site (`app/admin/configuracoes`) — o desenho é outro,
// porque a grade de tabela do site não cabe na largura de um celular; aqui
// vira uma seção por papel, com uma linha por capacidade.

import { useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { CAPACIDADES, NOME_DO_PAPEL, PAPEIS_CONFIGURAVEIS, chaveDaPermissao, type Papel } from '@credenciei/dominio'
import { mensagemDoErro, usePedido } from '../../src/dados/pedido'
import { useSessao } from '../../src/sessao/contexto'
import {
  Aviso, Carregando, Cartao, Corpo, Legenda, Respiro, Tela, TituloDaTela, TituloDeCartao,
} from '../../src/ui/componentes'
import { Icone } from '../../src/ui/icone'
import { espaco, raio, texto, tipo } from '../../src/ui/tema'
import { useTema, type Tokens } from '../../src/ui/tema-contexto'

export default function Configuracoes() {
  const { cliente } = useSessao()
  const [escopo, setEscopo] = useState<string | null>(null)
  const [versao, setVersao] = useState(0)
  const [salvando, setSalvando] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const { cor } = useTema()
  const e = useEstilos()

  const { pedido, recarregar } = usePedido(
    () => cliente.permissoesDaOrganizacao(escopo), [cliente, escopo, versao],
  )
  const dados = pedido.estado === 'pronto' ? pedido.dados : null
  const mapa = useMemo(
    () => new Map((dados?.salvas ?? []).map(p => [chaveDaPermissao(p.papel, p.chave), p.permitido])),
    [dados],
  )

  async function gravar(papel: Papel, chave: string, valor: boolean | null) {
    const id = chaveDaPermissao(papel, chave)
    setErro(null)
    setSalvando(id)
    try {
      const r = await cliente.salvarPermissaoDaOrganizacao(escopo, papel, chave, valor)
      if (r.erro) { setErro(r.erro); return }
      setVersao(v => v + 1)
    } catch (err) {
      setErro(mensagemDoErro(err))
    } finally {
      setSalvando(null)
    }
  }

  return (
    <Tela>
      <TituloDaTela>Configurações</TituloDaTela>
      <Legenda>
        O que cada tipo de acesso pode fazer no sistema. Vale na hora — cada
        toque muda o menu e as ações de quem tem aquele tipo de acesso.
      </Legenda>
      <Respiro />

      <View style={e.escopos}>
        <ChipDeEscopo
          rotulo="Padrão da plataforma"
          selecionado={escopo === null}
          aoTocar={() => setEscopo(null)}
        />
        {(dados?.organizacoes ?? []).map(o => (
          <ChipDeEscopo
            key={o.organizacaoId}
            rotulo={o.nome}
            selecionado={escopo === o.organizacaoId}
            aoTocar={() => setEscopo(o.organizacaoId)}
          />
        ))}
      </View>
      <Respiro />

      {erro ? <Aviso tipo="erro">{erro}</Aviso> : null}
      {pedido.estado === 'carregando' ? <Carregando /> : null}
      {pedido.estado === 'falhou' ? <Aviso tipo="erro">{pedido.mensagem}</Aviso> : null}

      {dados ? (
        <>
          <Legenda>
            {escopo === null
              ? 'Vale para toda organização que não tiver regra própria'
              : 'O que estiver no padrão aqui segue o padrão da plataforma'}
          </Legenda>
          <Respiro altura={espaco.s} />

          {PAPEIS_CONFIGURAVEIS.map(papel => (
            <Cartao key={papel}>
              <TituloDeCartao>{NOME_DO_PAPEL[papel]}</TituloDeCartao>
              <Respiro altura={espaco.s} />

              {CAPACIDADES.map((c, i) => {
                const padrao = c.padrao(papel)
                const id = chaveDaPermissao(papel, c.chave)
                const salvo = mapa.get(id)
                const alterado = salvo !== undefined
                const vale = alterado ? salvo : padrao

                return (
                  <View key={c.chave}>
                    {i > 0 ? <View style={e.fio} /> : null}
                    <View style={e.linha}>
                      <View style={e.linhaTexto}>
                        <Corpo forte>{c.nome}</Corpo>
                        <Legenda>{c.descricao}</Legenda>
                      </View>
                      {alterado ? (
                        <Pressable
                          onPress={() => gravar(papel, c.chave, null)}
                          disabled={salvando === id}
                          hitSlop={8}
                          accessibilityLabel={`Voltar ${c.nome} de ${NOME_DO_PAPEL[papel]} ao padrão do sistema`}
                          style={e.botaoDeVoltar}
                        >
                          <Icone nome="RotateCcw" tamanho={14} tom={cor.acento600} />
                        </Pressable>
                      ) : null}
                      <Interruptor
                        ligado={vale}
                        alterado={alterado}
                        ocupado={salvando === id}
                        rotulo={`${c.nome} para ${NOME_DO_PAPEL[papel]}`}
                        aoTocar={() => gravar(papel, c.chave, !vale === padrao ? null : !vale)}
                      />
                    </View>
                  </View>
                )
              })}
            </Cartao>
          ))}
        </>
      ) : null}
    </Tela>
  )
}

function ChipDeEscopo({
  rotulo, selecionado, aoTocar,
}: {
  rotulo: string
  selecionado: boolean
  aoTocar: () => void
}) {
  const { cor, uso } = useTema()
  return (
    <Pressable
      onPress={aoTocar}
      style={[
        estilosDoChip.base,
        { backgroundColor: selecionado ? cor.acento500 : uso.superficie, borderColor: selecionado ? cor.acento500 : uso.borda },
      ]}
    >
      <Text
        style={[estilosDoChip.texto, { color: selecionado ? '#ffffff' : uso.tinta }]}
        numberOfLines={1}
      >
        {rotulo}
      </Text>
    </Pressable>
  )
}

/**
 * O interruptor — cópia da régua do site's `Interruptor` (GradePermissoes):
 * mostra o que VALE agora, não os três estados do banco. O anel colorido diz
 * "isto foi decidido aqui, não é o padrão".
 */
function Interruptor({
  ligado, alterado, ocupado, rotulo, aoTocar,
}: {
  ligado: boolean
  alterado: boolean
  ocupado: boolean
  rotulo: string
  aoTocar: () => void
}) {
  const { cor, uso } = useTema()
  return (
    <Pressable
      onPress={aoTocar}
      disabled={ocupado}
      accessibilityRole="switch"
      accessibilityState={{ checked: ligado }}
      accessibilityLabel={rotulo}
      style={[
        estilosDoInterruptor.base,
        {
          backgroundColor: ligado ? cor.acento500 : uso.borda,
          opacity: ocupado ? 0.5 : 1,
          ...(alterado ? { borderWidth: 2, borderColor: cor.acento200 } : null),
        },
      ]}
    >
      <View style={[estilosDoInterruptor.bola, { transform: [{ translateX: ligado ? 18 : 2 }] }]} />
    </Pressable>
  )
}

const estilosDoChip = StyleSheet.create({
  base: {
    borderWidth: 1, borderRadius: raio.pilula, paddingHorizontal: espaco.m, paddingVertical: espaco.s,
    marginRight: espaco.s, marginBottom: espaco.s,
  },
  texto: { ...texto.xs, fontFamily: tipo.forte },
})

const estilosDoInterruptor = StyleSheet.create({
  base: { width: 40, height: 22, borderRadius: raio.pilula, justifyContent: 'center' },
  bola: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#ffffff' },
})

function criarEstilos(cor: Tokens['cor'], uso: Tokens['uso']) {
  return StyleSheet.create({
    escopos: { flexDirection: 'row', flexWrap: 'wrap' },
    linha: { flexDirection: 'row', alignItems: 'center', gap: espaco.s, paddingVertical: espaco.s },
    linhaTexto: { flex: 1, minWidth: 0 },
    fio: { height: 1, backgroundColor: uso.borda },
    botaoDeVoltar: {
      width: 26, height: 26, borderRadius: raio.campo, alignItems: 'center', justifyContent: 'center',
      backgroundColor: cor.acento50,
    },
  })
}

function useEstilos() {
  const { cor, uso } = useTema()
  return useMemo(() => criarEstilos(cor, uso), [cor, uso])
}
