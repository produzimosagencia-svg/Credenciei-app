// Criar um acesso.
//
// ─── AS TRÊS FUNÇÕES QUE ESTA TELA CRIA ─────────────────────────────────────
//
// Trazido do site em 11/09/2026: eram só supervisor antes. Agora são três,
// cada uma com um vínculo diferente:
//
//   supervisor        preso a UM setor de um evento — só enxerga aquele
//                      setor, equipe e presença.
//   operador de portão preso ao EVENTO inteiro, sem setor — lê o QR e
//                      registra ponto, não gerencia nada. É o posto de
//                      credenciamento em si.
//   suporte            preso ao EVENTO inteiro, sem setor, com validade
//                      opcional — apoio contratado pro dia, corrige a
//                      operação, nunca administra.
//
// Admin e master ficam fora deste formulário de propósito: são criados pela
// plataforma, noutro lugar. Produtor também fica fora — é o módulo Gastos,
// que o app ainda não tem (ver Epic 19 do backlog).
//
// ─── A ABA "FUNÇÕES LIGADAS" ────────────────────────────────────────────────
//
// Cada função nasce com o padrão do código (`capacidadesDoPapel`, em
// `@credenciei/dominio`); aqui dá pra desligar o que a pessoa não deve ter,
// ou ligar o extra que o papel pode ganhar (hoje só "Escanear QR" pro
// supervisor). Só o que DIFERE do padrão vai no override — o resto o
// servidor completa sozinho pela função, do mesmo jeito que o site faz.
//
// Trazido do site em 11/09/2026 — parcial: o override é gravado e volta na
// lista de acessos, mas nenhuma tela do app ainda LÊ esse override na hora de
// montar o menu ou travar uma rota (só o padrão do papel roda). Ligar isso
// fica para uma tela de Configurações que o app também não tem ainda.

import { useEffect, useState } from 'react'
import { useRouter } from 'expo-router'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { capacidadesDoPapel, formatCpf, formatTelefone, titleCaseNome } from '@credenciei/dominio'
import type { EventoComSetores, FuncaoDeAcesso } from '@credenciei/contrato'
import { mascararData } from '../../src/campos'
import { mensagemDoErro } from '../../src/dados/pedido'
import { useSessao } from '../../src/sessao/contexto'
import {
  Aviso, Botao, Campo, Carregando, Cartao, Corpo, Escolha, Legenda, Respiro,
  Tela, TituloDaTela, TituloDeCartao,
} from '../../src/ui/componentes'
import { Icone } from '../../src/ui/icone'
import { cor, espaco, raio, texto, tipo, uso } from '../../src/ui/tema'

const FUNCOES: {
  valor: FuncaoDeAcesso
  rotulo: string
  icone: string
  vinculo: string
  ajuda: string
}[] = [
  {
    valor: 'supervisor', rotulo: 'Supervisor', icone: 'Users', vinculo: 'evento + setor',
    ajuda: 'Fica preso a um único setor: enxerga só a equipe daquele setor. Se cuida de dois, crie dois acessos.',
  },
  {
    valor: 'operador_portao', rotulo: 'Gestor de credenciamento', icone: 'ShieldCheck', vinculo: 'evento',
    ajuda: 'Lê o QR no portão e registra ponto. Não gerencia evento nem equipe. Cobre o evento inteiro.',
  },
  {
    valor: 'suporte', rotulo: 'Suporte de sistema', icone: 'User', vinculo: 'evento',
    ajuda: 'Apoio contratado pro dia do evento: acompanha e ajuda a resolver problema de operação. Nunca administra. Pode ter prazo de validade.',
  },
]

/** "08/09/2026" completo → "2026-09-08"; incompleto → null. */
function paraISO(dataDigitada: string): string | null {
  const [dd, mm, aaaa] = dataDigitada.split('/')
  if (!dd || !mm || aaaa?.length !== 4) return null
  return `${aaaa}-${mm}-${dd}`
}

export default function NovoAcesso() {
  const router = useRouter()
  const { cliente } = useSessao()

  const [eventos, setEventos] = useState<EventoComSetores[] | null>(null)
  const [funcao, setFuncao] = useState<FuncaoDeAcesso>('supervisor')
  const [eventoId, setEventoId] = useState('')
  const [setorId, setSetorId] = useState('')
  const [nome, setNome] = useState('')
  const [cpf, setCpf] = useState('')
  const [telefone, setTelefone] = useState('')
  const [expiraEm, setExpiraEm] = useState('')
  const [ativo, setAtivo] = useState(true)
  const [ligadas, setLigadas] = useState<Record<string, boolean>>({})
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
  const cfg = FUNCOES.find(f => f.valor === funcao)!

  // Um toggle por capacidade que este papel oferece, começando no valor que
  // ele tem HOJE — o servidor completa o resto sozinho pelo padrão do código.
  const capacidades = capacidadesDoPapel(funcao)
  const ligada = (chave: string, padraoAtual: boolean): boolean =>
    chave in ligadas ? (ligadas[chave] ?? padraoAtual) : padraoAtual

  function trocarFuncao(f: FuncaoDeAcesso) {
    setFuncao(f)
    // Os toggles do papel anterior deixam de valer — outra função, outro catálogo.
    setLigadas({})
    setErro(null)
  }

  function trocarEvento(id: string) {
    setEventoId(id)
    // O setor pertence ao evento: manter o anterior criaria um supervisor
    // apontando para um setor de outro evento.
    const novo = eventos?.find(x => x.eventoId === id)
    setSetorId(novo?.setores[0]?.setorId ?? '')
  }

  async function salvar() {
    setErro(null)
    if (funcao === 'supervisor' && !setorId) {
      setErro('Escolha o setor do supervisor.')
      return
    }
    setSalvando(true)
    try {
      // Só o que DIFERE do padrão vai pro override — o resto o servidor
      // completa sozinho pela função.
      const permissoesUsuario: Record<string, boolean> = {}
      for (const c of capacidades) {
        const v = ligada(c.chave, c.padraoAtual)
        if (v !== c.padraoAtual) permissoesUsuario[c.chave] = v
      }

      const r = await cliente.criarAcesso({
        funcao,
        nome,
        cpf,
        telefone,
        eventoId,
        setorId: funcao === 'supervisor' ? setorId : undefined,
        expiraEm: funcao === 'suporte' ? paraISO(expiraEm) : undefined,
        ativo,
        permissoesUsuario,
      })
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
            onPress={() => { setCriado(null); setNome(''); setCpf(''); setTelefone(''); setExpiraEm('') }}
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
            Cadastre um evento antes de criar acessos — supervisor, gestor de
            credenciamento ou suporte, todos precisam de um evento para atuar.
          </Corpo>
        </Cartao>
      </Tela>
    )
  }

  return (
    <Tela>
      <TituloDaTela>Criar acesso</TituloDaTela>
      <Legenda>Escolha a função — o vínculo muda de acordo com ela</Legenda>
      <Respiro />

      {erro ? <Aviso tipo="erro">{erro}</Aviso> : null}

      <Cartao>
        <TituloDeCartao>Função no sistema</TituloDeCartao>
        <Respiro altura={espaco.m} />
        {FUNCOES.map(f => {
          const ativa = f.valor === funcao
          return (
            <Pressable
              key={f.valor}
              onPress={() => trocarFuncao(f.valor)}
              accessibilityRole="radio"
              accessibilityState={{ selected: ativa }}
              style={[e.funcao, ativa && e.funcaoAtiva]}
            >
              <View style={e.funcaoTopo}>
                <Icone nome={f.icone} tamanho={16} tom={ativa ? cor.acento600 : uso.tintaFraca} />
                <Text style={[e.funcaoTitulo, ativa && e.funcaoTituloAtivo]}>{f.rotulo}</Text>
              </View>
              <Text style={e.funcaoVinculo}>Vínculo: {f.vinculo}</Text>
            </Pressable>
          )
        })}
        <Respiro altura={espaco.s} />
        <Legenda>{cfg.ajuda}</Legenda>
      </Cartao>

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
        {funcao === 'suporte' ? (
          <Campo
            rotulo="Acesso expira em (opcional)"
            value={expiraEm}
            onChangeText={t => setExpiraEm(mascararData(t))}
            placeholder="dd/mm/aaaa"
            keyboardType="number-pad"
            maxLength={10}
            ajuda="Passada a data, o acesso para de funcionar sozinho."
          />
        ) : null}
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

        {funcao === 'supervisor' ? (
          <>
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
          </>
        ) : null}
      </Cartao>

      {capacidades.length > 0 ? (
        <Cartao>
          <TituloDeCartao>Funções ligadas</TituloDeCartao>
          <Legenda>
            Já vem com o padrão de {cfg.rotulo}. Desligue o que esta pessoa
            não deve ter.
          </Legenda>
          <Respiro altura={espaco.m} />

          {capacidades.map((c, i) => {
            const on = ligada(c.chave, c.padraoAtual)
            return (
              <View key={c.chave}>
                {i > 0 ? <View style={e.fioDaFuncao} /> : null}
                <Pressable
                  onPress={() => setLigadas(m => ({ ...m, [c.chave]: !on }))}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  style={e.funcaoLigada}
                >
                  <View style={[e.caixaDaFuncao, on && e.caixaDaFuncaoMarcada]}>
                    {on ? <Icone nome="Check" tamanho={12} tom="#ffffff" espessura={3} /> : null}
                  </View>
                  <View style={e.textoDaFuncao}>
                    <Corpo forte>{c.nome}</Corpo>
                    <Legenda>{c.descricao}</Legenda>
                  </View>
                </Pressable>
              </View>
            )
          })}
        </Cartao>
      ) : null}

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

  funcao: {
    paddingHorizontal: espaco.m,
    paddingVertical: espaco.m,
    borderRadius: raio.campo,
    borderWidth: 1,
    borderColor: uso.borda,
    marginBottom: espaco.s,
  },
  funcaoAtiva: { borderColor: cor.acento500, backgroundColor: cor.acento50 },
  funcaoTopo: { flexDirection: 'row', alignItems: 'center', gap: espaco.s },
  funcaoTitulo: { ...texto.corpoForte, color: uso.tintaMedia },
  funcaoTituloAtivo: { color: uso.tinta, fontFamily: tipo.semi },
  funcaoVinculo: { ...texto.xs, fontFamily: tipo.regular, color: uso.tintaFraca, marginTop: 4, marginLeft: 24 },

  fioDaFuncao: { height: 1, backgroundColor: uso.borda, marginVertical: espaco.s },
  funcaoLigada: { flexDirection: 'row', gap: espaco.m, alignItems: 'flex-start' },
  textoDaFuncao: { flex: 1, minWidth: 0 },
  caixaDaFuncao: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: cor.neutro300,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  caixaDaFuncaoMarcada: { backgroundColor: cor.acento500, borderColor: cor.acento600 },

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
