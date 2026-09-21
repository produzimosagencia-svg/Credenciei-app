// Acessos — quem consegue entrar no sistema.
//
// ─── NÃO CONFUNDIR COM A EQUIPE DO EVENTO ───────────────────────────────────
//
// Quem só trabalha no dia aparece dentro do setor, e não faz login em lugar
// nenhum. Aqui são as poucas pessoas que administram: master, admin e os
// supervisores, cada um preso a um setor.
//
// ─── DUAS DECISÕES QUE A TELA CARREGA ───────────────────────────────────────
//
// INATIVO NÃO É EXCLUÍDO. Inativo é bloqueado no login sem perder o histórico —
// é o que se usa quando alguém sai da equipe mas os registros antigos precisam
// continuar existindo. Excluir apaga; desativar só fecha a porta.
//
// A PRÓPRIA LINHA NÃO TEM AÇÕES. Ninguém desativa o próprio acesso por engano —
// ficaria trancado para fora, e num sistema onde só o master cria admins isso
// vira uma ligação para a plataforma no meio do evento. O servidor recusa
// também, mas a tela nem oferece.

import { useRouter } from 'expo-router'
import { useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { formatarBR, NOME_DO_PAPEL } from '@credenciei/dominio'
import type { Acesso } from '@credenciei/contrato'
import { usePedido, useValorComAtraso } from '../../src/dados/pedido'
import { mensagemDoErro } from '../../src/dados/pedido'
import { useSessao } from '../../src/sessao/contexto'
import {
  Aviso, Botao, Campo, Carregando, Cartao, Corpo, Legenda, Respiro, Selo, Tela,
  TituloDaTela,
} from '../../src/ui/componentes'
import { Icone } from '../../src/ui/icone'
import { espaco, raio, texto, tipo } from '../../src/ui/tema'
import { useTema, type Tokens } from '../../src/ui/tema-contexto'

type Situacao = 'todos' | 'ativos' | 'inativos'

export default function Acessos() {
  const router = useRouter()
  const { cliente } = useSessao()
  const e = useEstilos()

  const [situacao, setSituacao] = useState<Situacao>('todos')
  const [busca, setBusca] = useState('')
  const [versao, setVersao] = useState(0)
  const [mudando, setMudando] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const buscaComAtraso = useValorComAtraso(busca)
  const { pedido, recarregar } = usePedido(
    () => cliente.acessos({ busca: buscaComAtraso, situacao }),
    [cliente, buscaComAtraso, situacao, versao],
  )

  async function mudarSituacao(acesso: Acesso) {
    setErro(null)
    setMudando(acesso.id)
    try {
      const r = await cliente.mudarSituacaoDoAcesso(acesso.id, !acesso.ativo)
      if (r.erro) return setErro(r.erro)
      setVersao(v => v + 1)
    } catch (e) {
      setErro(mensagemDoErro(e))
    } finally {
      setMudando(null)
    }
  }

  const dados = pedido.estado === 'pronto' ? pedido.dados : null
  const souMaster = dados?.itens.find(a => a.souEu)?.papel === 'master'

  async function trocarSenha(acesso: Acesso, novaSenha: string) {
    const r = await cliente.trocarSenhaDoAcesso(acesso.id, novaSenha)
    if (!r.erro) setVersao(v => v + 1)
    return r
  }

  async function excluir(acesso: Acesso) {
    const r = await cliente.excluirAcesso(acesso.id)
    if (!r.erro) setVersao(v => v + 1)
    return r
  }

  return (
    <Tela>
      <TituloDaTela>Acessos</TituloDaTela>
      <Legenda>Quem consegue entrar no sistema — não é a equipe do evento</Legenda>
      <Respiro />

      <Botao titulo="Criar acesso" onPress={() => router.push('/novo-acesso')} />
      <Respiro />

      {dados ? (
        <Abas
          atual={situacao}
          aoTrocar={setSituacao}
          contadores={{ todos: dados.total, ativos: dados.ativos, inativos: dados.inativos }}
        />
      ) : null}

      <Respiro altura={espaco.m} />

      <Campo
        rotulo="Buscar"
        value={busca}
        onChangeText={setBusca}
        placeholder="Nome, e-mail ou CPF"
        autoCapitalize="none"
        autoCorrect={false}
      />

      {erro ? <Aviso tipo="erro">{erro}</Aviso> : null}

      {pedido.estado === 'carregando' ? <Carregando /> : null}

      {pedido.estado === 'falhou' ? (
        <>
          <Aviso tipo="erro">{pedido.mensagem}</Aviso>
          <Botao titulo="Tentar de novo" onPress={recarregar} tipo="secundario" />
        </>
      ) : null}

      {dados ? (
        dados.itens.length === 0 ? (
          <Cartao>
            <Corpo>
              {busca
                ? 'Ninguém encontrado. Tente outro nome ou e-mail.'
                : situacao === 'inativos'
                  ? 'Ninguém inativo.'
                  : 'Nenhum acesso cadastrado.'}
            </Corpo>
          </Cartao>
        ) : (
          <>
            <Legenda>
              {busca
                ? `${dados.itens.length} ${dados.itens.length === 1 ? 'resultado' : 'resultados'} para "${busca}"`
                : `${dados.itens.length} ${dados.itens.length === 1 ? 'pessoa' : 'pessoas'} nesta lista`}
            </Legenda>
            <Respiro altura={espaco.s} />

            <Cartao semPadding>
              {dados.itens.map((a, i) => (
                <View key={a.id}>
                  {i > 0 ? <View style={e.fio} /> : null}
                  <LinhaDeAcesso
                    acesso={a}
                    ocupado={mudando === a.id}
                    souMaster={souMaster}
                    aoMudarSituacao={() => mudarSituacao(a)}
                    aoTrocarSenha={senha => trocarSenha(a, senha)}
                    aoExcluir={() => excluir(a)}
                  />
                </View>
              ))}
            </Cartao>
          </>
        )
      ) : null}
    </Tela>
  )
}

function Abas({
  atual, aoTrocar, contadores,
}: {
  atual: Situacao
  aoTrocar: (s: Situacao) => void
  contadores: Record<Situacao, number>
}) {
  const e = useEstilos()
  const abas: { chave: Situacao; rotulo: string }[] = [
    { chave: 'todos', rotulo: 'Todos' },
    { chave: 'ativos', rotulo: 'Ativos' },
    { chave: 'inativos', rotulo: 'Inativos' },
  ]

  return (
    <View style={e.abas}>
      {abas.map(aba => {
        const ativa = aba.chave === atual
        return (
          <Pressable
            key={aba.chave}
            onPress={() => aoTrocar(aba.chave)}
            accessibilityRole="tab"
            accessibilityState={{ selected: ativa }}
            style={[e.aba, ativa && e.abaAtiva]}
          >
            <Text style={[e.abaTexto, ativa && e.abaTextoAtivo]}>{aba.rotulo}</Text>
            <View style={[e.abaContador, ativa && e.abaContadorAtivo]}>
              <Text style={[e.abaContadorTexto, ativa && e.abaContadorTextoAtivo]}>
                {contadores[aba.chave]}
              </Text>
            </View>
          </Pressable>
        )
      })}
    </View>
  )
}

function LinhaDeAcesso({
  acesso, ocupado, souMaster, aoMudarSituacao, aoTrocarSenha, aoExcluir,
}: {
  acesso: Acesso
  ocupado: boolean
  souMaster: boolean
  aoMudarSituacao: () => void
  aoTrocarSenha: (novaSenha: string) => Promise<{ erro?: string }>
  aoExcluir: () => Promise<{ erro?: string }>
}) {
  const { cor, uso } = useTema()
  const e = useEstilos()
  const [modo, setModo] = useState<'senha' | 'excluir' | null>(null)
  const [senha, setSenha] = useState('')
  const [erroLocal, setErroLocal] = useState<string | null>(null)
  const [ocupadoLocal, setOcupadoLocal] = useState(false)

  function fechar() {
    setModo(null)
    setSenha('')
    setErroLocal(null)
  }

  async function confirmarSenha() {
    setErroLocal(null)
    setOcupadoLocal(true)
    try {
      const r = await aoTrocarSenha(senha)
      if (r.erro) return setErroLocal(r.erro)
      fechar()
    } finally {
      setOcupadoLocal(false)
    }
  }

  async function confirmarExclusao() {
    setErroLocal(null)
    setOcupadoLocal(true)
    try {
      const r = await aoExcluir()
      if (r.erro) return setErroLocal(r.erro)
      fechar()
    } finally {
      setOcupadoLocal(false)
    }
  }
  /*
   * Só DOIS tons de selo para o papel: quem tem mais poder ganha cor, o resto é
   * neutro. Antes eram cinco cores diferentes — com cinco pessoas na tela,
   * cinco cores, e nenhuma delas dizendo nada.
   */
  const papelComCor = acesso.papel === 'master' || acesso.papel === 'admin'

  return (
    <View>
    <View style={e.linha}>
      <View style={e.iniciais}>
        <Text style={e.iniciaisTexto}>{iniciaisDe(acesso.nome)}</Text>
      </View>

      <View style={e.linhaTexto}>
        <View style={e.linhaTopo}>
          <Text style={e.nome} numberOfLines={1}>{acesso.nome}</Text>
          {acesso.souEu ? <Selo texto="Você" tipo="info" /> : null}
          {!acesso.ativo ? <Selo texto="Inativo" tipo="aviso" /> : null}
          <View style={[e.papel, papelComCor && e.papelForte]}>
            <Text style={[e.papelTexto, papelComCor && e.papelTextoForte]}>
              {NOME_DO_PAPEL[acesso.papel]}
            </Text>
          </View>
        </View>

        <View style={e.meta}>
          <View style={e.metaItem}>
            <Icone nome="IdCard" tamanho={11} tom={uso.tintaFraca} />
            <Text style={e.metaTexto} numberOfLines={1}>{acesso.identificador}</Text>
          </View>
          <View style={e.metaItem}>
            <Icone nome="Building2" tamanho={11} tom={uso.tintaFraca} />
            <Text style={e.metaTexto} numberOfLines={1}>
              {acesso.papel === 'supervisor'
                ? (acesso.setorNome ?? 'sem setor')
                : `${acesso.eventos} ${acesso.eventos === 1 ? 'evento' : 'eventos'}`}
            </Text>
          </View>
          <View style={e.metaItem}>
            <Icone nome="CalendarDays" tamanho={11} tom={uso.tintaFraca} />
            <Text style={e.metaTexto}>{formatarBR(acesso.criadoEm, 'data')}</Text>
          </View>
          {acesso.expiraEm ? (
            <View style={e.metaItem}>
              <Icone nome="AlertTriangle" tamanho={11} tom={cor.aviso700} />
              <Text style={[e.metaTexto, e.metaExpira]}>expira em {formatarBR(acesso.expiraEm, 'data')}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </View>

    {/* Abaixo da linha, não ao lado: três botões cabendo ao lado do nome
        espremia nome e metadados a ponto de truncar tudo. */}
    {!acesso.souEu ? (
      <View style={e.acoes}>
        <Pressable
          onPress={aoMudarSituacao}
          disabled={ocupado}
          accessibilityRole="button"
          accessibilityLabel={acesso.ativo ? 'Bloquear o acesso' : 'Liberar o acesso'}
          style={({ pressed }) => [e.acao, pressed && e.acaoTocada, ocupado && e.acaoTravada]}
        >
          <Text style={[e.acaoTexto, acesso.ativo && e.acaoTextoBloquear]}>
            {acesso.ativo ? 'Bloquear' : 'Liberar'}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setModo(m => (m === 'senha' ? null : 'senha'))}
          accessibilityRole="button"
          accessibilityLabel="Trocar a senha"
          style={({ pressed }) => [e.acao, pressed && e.acaoTocada]}
        >
          <Text style={e.acaoTexto}>Trocar senha</Text>
        </Pressable>
        {souMaster ? (
          <Pressable
            onPress={() => setModo(m => (m === 'excluir' ? null : 'excluir'))}
            accessibilityRole="button"
            accessibilityLabel="Excluir o acesso"
            style={({ pressed }) => [e.acao, pressed && e.acaoTocada]}
          >
            <Text style={[e.acaoTexto, e.acaoTextoBloquear]}>Excluir</Text>
          </Pressable>
        ) : null}
      </View>
    ) : null}

    {modo === 'senha' ? (
      <View style={e.expansao}>
        <Campo
          rotulo="Nova senha"
          value={senha}
          onChangeText={setSenha}
          placeholder="Ao menos 6 caracteres"
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          erro={erroLocal ?? undefined}
          ajuda="Passe a nova senha para a pessoa — o app não avisa sozinho."
        />
        <View style={e.expansaoAcoes}>
          <Botao titulo="Salvar" ocupado={ocupadoLocal} onPress={confirmarSenha} />
          <Botao titulo="Cancelar" tipo="fantasma" onPress={fechar} />
        </View>
      </View>
    ) : null}

    {modo === 'excluir' ? (
      <View style={e.expansao}>
        <Legenda>Excluir o acesso de {acesso.nome}? O histórico dela continua existindo; só o login some.</Legenda>
        {erroLocal ? <Aviso tipo="erro">{erroLocal}</Aviso> : null}
        <View style={e.expansaoAcoes}>
          <Botao titulo="Excluir" tipo="perigo" ocupado={ocupadoLocal} onPress={confirmarExclusao} />
          <Botao titulo="Cancelar" tipo="fantasma" onPress={fechar} />
        </View>
      </View>
    ) : null}
    </View>
  )
}

function iniciaisDe(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return '?'
  const letras = partes.length > 1
    ? (partes[0]?.[0] ?? '') + (partes[partes.length - 1]?.[0] ?? '')
    : (partes[0] ?? '').slice(0, 2)
  return letras.toUpperCase()
}

function criarEstilos(cor: Tokens['cor'], uso: Tokens['uso']) {
  return StyleSheet.create({
  fio: { height: 1, backgroundColor: uso.borda, marginLeft: 60 },

  abas: { flexDirection: 'row', gap: espaco.s },
  aba: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 38,
    paddingHorizontal: espaco.m,
    borderRadius: raio.pilula,
    borderWidth: 1,
    borderColor: uso.borda,
    backgroundColor: uso.superficie,
  },
  abaAtiva: { backgroundColor: cor.acento500, borderColor: cor.acento600 },
  abaTexto: { ...texto.corpoForte, color: uso.tintaMedia },
  abaTextoAtivo: { color: '#ffffff' },
  abaContador: {
    minWidth: 20,
    paddingHorizontal: 5,
    borderRadius: 999,
    backgroundColor: cor.neutro100,
    alignItems: 'center',
  },
  abaContadorAtivo: { backgroundColor: 'rgba(255,255,255,0.25)' },
  abaContadorTexto: { ...texto.xxs, fontFamily: tipo.semi, color: uso.tintaMedia },
  abaContadorTextoAtivo: { color: '#ffffff' },

  linha: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: espaco.m,
    paddingHorizontal: espaco.g,
    paddingVertical: espaco.m,
  },
  iniciais: {
    width: 32,
    height: 32,
    borderRadius: 999,
    backgroundColor: cor.neutro100,
    borderWidth: 1,
    borderColor: uso.borda,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  iniciaisTexto: { ...texto.xxs, fontFamily: tipo.semi, color: cor.neutro600 },
  linhaTexto: { flex: 1, minWidth: 0, gap: 4 },
  linhaTopo: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  nome: { ...texto.corpoForte, color: uso.tinta, flexShrink: 1 },

  papel: {
    borderRadius: raio.pilula,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: cor.neutro100,
  },
  papelForte: { backgroundColor: cor.acento50 },
  papelTexto: { ...texto.xxs, fontFamily: tipo.semi, color: cor.neutro600 },
  papelTextoForte: { color: cor.acento700 },

  meta: { flexDirection: 'row', flexWrap: 'wrap', gap: espaco.m },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: '100%' },
  metaTexto: { ...texto.xs, fontFamily: tipo.regular, color: uso.tintaFraca, flexShrink: 1 },
  metaExpira: { color: cor.aviso700 },

  acoes: {
    flexDirection: 'row', flexWrap: 'wrap', gap: espaco.xs,
    paddingHorizontal: espaco.g, paddingBottom: espaco.m,
  },
  acao: {
    minHeight: 34,
    paddingHorizontal: espaco.m,
    borderRadius: raio.campo,
    borderWidth: 1,
    borderColor: uso.borda,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acaoTocada: { backgroundColor: cor.neutro50 },
  acaoTravada: { opacity: 0.45 },
  acaoTexto: { ...texto.xs, fontFamily: tipo.semi, color: cor.sucesso700 },
  acaoTextoBloquear: { color: cor.erro700 },

  expansao: { paddingHorizontal: espaco.g, paddingBottom: espaco.m, gap: espaco.s },
  expansaoAcoes: { flexDirection: 'row', gap: espaco.s },
  })
}

function useEstilos() {
  const { cor, uso } = useTema()
  return useMemo(() => criarEstilos(cor, uso), [cor, uso])
}
