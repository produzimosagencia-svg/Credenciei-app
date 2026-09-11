// Suporte de Sistema — gente contratada pro dia do evento.
//
// Trazido do site em 11/09/2026. Só o master gerencia: o escopo dela
// atravessa organizações — quem contrata é a plataforma, não o cliente.
// Corrige a operação (CPF errado, setor errado, ponto que não bateu); nunca
// administra — não exclui, não mexe em financeiro, não cria admin.
//
// ─── O ESCOPO É ORGANIZAÇÃO E/OU EVENTOS AVULSOS ────────────────────────────
//
// Organização inteira dá acesso a todos os eventos dela, atuais e futuros;
// evento avulso limita a só aquele. Os dois cabem juntos no mesmo acesso, e
// sem nenhum marcado o acesso não teria onde atuar.

import { useState } from 'react'
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { formatCpf, formatTelefone, formatarBR } from '@credenciei/dominio'
import type {
  DadosDeNovoSuporte, DadosDeSuporte, EdicaoDeSuporte, EventoParaEscopo, OpcaoDeEscopo,
  SuporteAcesso,
} from '@credenciei/contrato'
import { mascararData } from '../../src/campos'
import { usePedido, mensagemDoErro } from '../../src/dados/pedido'
import { useSessao } from '../../src/sessao/contexto'
import {
  Aviso, Botao, Campo, Carregando, Cartao, Corpo, Escolha, Legenda, Respiro,
  Selo, Tela, TituloDaTela, TituloDeCartao,
} from '../../src/ui/componentes'
import { Icone } from '../../src/ui/icone'
import { cor, espaco, raio, texto, tipo, uso } from '../../src/ui/tema'

/** "2026-09-30" → "30/09/2026". */
function paraExibicao(iso: string): string {
  const [aaaa, mm, dd] = iso.split('-')
  return `${dd}/${mm}/${aaaa}`
}

/** "30/09/2026" completo → "2026-09-30"; incompleto → null. */
function paraISO(dataDigitada: string): string | null {
  const [dd, mm, aaaa] = dataDigitada.split('/')
  if (!dd || !mm || aaaa?.length !== 4) return null
  return `${aaaa}-${mm}-${dd}`
}

export default function Suporte() {
  const { cliente } = useSessao()
  const [versao, setVersao] = useState(0)
  const [criando, setCriando] = useState(false)
  const [editando, setEditando] = useState<SuporteAcesso | null>(null)

  const { pedido, recarregar } = usePedido<DadosDeSuporte>(
    () => cliente.dadosDeSuporte(),
    [cliente, versao],
  )
  const dados = pedido.estado === 'pronto' ? pedido.dados : null

  function aoSalvar() {
    setCriando(false)
    setEditando(null)
    setVersao(v => v + 1)
  }

  return (
    <Tela>
      <TituloDaTela>Suporte de Sistema</TituloDaTela>
      <Legenda>Acesso de apoio contratado pro dia do evento — corrige a operação, nunca administra</Legenda>
      <Respiro />

      {pedido.estado === 'carregando' ? <Carregando /> : null}
      {pedido.estado === 'falhou' ? (
        <>
          <Aviso tipo="erro">{pedido.mensagem}</Aviso>
          <Botao titulo="Tentar de novo" onPress={recarregar} tipo="secundario" />
        </>
      ) : null}

      {dados ? (
        <>
          <Botao titulo="Novo suporte" onPress={() => setCriando(true)} />
          <Respiro />

          {dados.suportes.length === 0 ? (
            <Cartao>
              <Corpo>Nenhum suporte criado ainda. Crie um acesso pra ajudar na operação de um ou mais eventos.</Corpo>
            </Cartao>
          ) : (
            <Cartao semPadding>
              {dados.suportes.map((s, i) => (
                <View key={s.id}>
                  {i > 0 ? <View style={e.fio} /> : null}
                  <LinhaDeSuporte suporte={s} onEditar={() => setEditando(s)} />
                </View>
              ))}
            </Cartao>
          )}

          {criando ? (
            <FormularioDeSuporte
              organizacoes={dados.organizacoes}
              eventos={dados.eventos}
              aoFechar={() => setCriando(false)}
              aoSalvar={aoSalvar}
            />
          ) : null}
          {editando ? (
            <FormularioDeSuporte
              organizacoes={dados.organizacoes}
              eventos={dados.eventos}
              suporte={editando}
              aoFechar={() => setEditando(null)}
              aoSalvar={aoSalvar}
            />
          ) : null}
        </>
      ) : null}
    </Tela>
  )
}

function LinhaDeSuporte({ suporte: s, onEditar }: { suporte: SuporteAcesso; onEditar: () => void }) {
  const escopoTexto = [
    ...s.escopoOrganizacoes.map(o => o.nome),
    ...s.escopoEventos.map(ev => ev.nome),
  ].join(', ') || 'Sem escopo definido'

  return (
    <Pressable onPress={onEditar} style={({ pressed }) => [e.linha, pressed && e.linhaTocada]}>
      <View style={e.linhaTexto}>
        <View style={e.linhaTopo}>
          <Corpo forte>{s.nome}</Corpo>
          {!s.ativo ? <Selo texto="Inativo" tipo="aviso" /> : s.expirado ? <Selo texto="Expirado" tipo="aviso" /> : null}
        </View>
        <Legenda>{escopoTexto}</Legenda>
        <Text style={e.expiracao}>
          {s.acessoExpiraEm ? `Válido até ${formatarBR(s.acessoExpiraEm, 'data')}` : 'Sem expiração'}
        </Text>
      </View>
      <Icone nome="ChevronRight" tamanho={16} tom={cor.neutro400} />
    </Pressable>
  )
}

function FormularioDeSuporte({
  organizacoes, eventos, suporte, aoFechar, aoSalvar,
}: {
  organizacoes: OpcaoDeEscopo[]
  eventos: EventoParaEscopo[]
  suporte?: SuporteAcesso
  aoFechar: () => void
  aoSalvar: () => void
}) {
  const { cliente } = useSessao()
  const editando = !!suporte

  const [nome, setNome] = useState(suporte?.nome ?? '')
  const [cpf, setCpf] = useState('')
  const [telefone, setTelefone] = useState(suporte?.telefone ? formatTelefone(suporte.telefone) : '')
  const [orgsEscolhidas, setOrgsEscolhidas] = useState(
    () => new Set(suporte?.escopoOrganizacoes.map(o => o.id) ?? []),
  )
  const [eventosEscolhidos, setEventosEscolhidos] = useState(
    () => new Set(suporte?.escopoEventos.map(ev => ev.id) ?? []),
  )
  const [expiraEm, setExpiraEm] = useState(suporte?.acessoExpiraEm ? paraExibicao(suporte.acessoExpiraEm) : '')
  const [ativo, setAtivo] = useState(suporte?.ativo ?? true)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [confirmandoRevogar, setConfirmandoRevogar] = useState(false)

  function alternar(set: Set<string>, aoMudar: (s: Set<string>) => void, id: string) {
    const proximo = new Set(set)
    if (proximo.has(id)) proximo.delete(id)
    else proximo.add(id)
    aoMudar(proximo)
  }

  async function salvar() {
    setErro(null)
    setSalvando(true)
    try {
      const acessoExpiraEm = expiraEm ? paraISO(expiraEm) : null
      if (expiraEm && !acessoExpiraEm) {
        setErro('Data de expiração inválida. Use dd/mm/aaaa, ou deixe em branco.')
        return
      }
      if (editando) {
        const dados: EdicaoDeSuporte = {
          nome, telefone, ativo, acessoExpiraEm,
          escopoOrganizacaoIds: [...orgsEscolhidas],
          escopoEventoIds: [...eventosEscolhidos],
        }
        const r = await cliente.editarSuporte(suporte!.id, dados)
        if (r.erro) return setErro(r.erro)
      } else {
        const dados: DadosDeNovoSuporte = {
          nome, cpf, telefone, ativo, acessoExpiraEm,
          escopoOrganizacaoIds: [...orgsEscolhidas],
          escopoEventoIds: [...eventosEscolhidos],
        }
        const r = await cliente.criarSuporte(dados)
        if (r.erro) return setErro(r.erro)
      }
      aoSalvar()
    } catch (e) {
      setErro(mensagemDoErro(e))
    } finally {
      setSalvando(false)
    }
  }

  async function revogar() {
    if (!editando) return
    setErro(null)
    setSalvando(true)
    try {
      const r = await cliente.revogarSuporte(suporte!.id)
      if (r.erro) return setErro(r.erro)
      aoSalvar()
    } catch (e) {
      setErro(mensagemDoErro(e))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal visible animationType="slide" onRequestClose={aoFechar}>
      <ScrollView style={e.modalFora} contentContainerStyle={e.modalConteudo} keyboardShouldPersistTaps="handled">
        <View style={e.modalTopo}>
          <TituloDaTela>{editando ? 'Editar suporte' : 'Novo acesso de suporte'}</TituloDaTela>
          <Pressable onPress={aoFechar} hitSlop={8} accessibilityLabel="Fechar">
            <Icone nome="X" tamanho={22} tom={uso.tintaMedia} />
          </Pressable>
        </View>
        <Respiro />

        <Cartao>
          <Campo rotulo="Nome completo" value={nome} onChangeText={setNome} placeholder="Nome da pessoa" autoCapitalize="words" />
          {!editando ? (
            <Campo
              rotulo="CPF"
              value={cpf}
              onChangeText={t => setCpf(formatCpf(t))}
              placeholder="000.000.000-00"
              keyboardType="number-pad"
              maxLength={14}
              ajuda="É o login dela — entra com CPF e senha, mesmo padrão de supervisor."
            />
          ) : null}
          <Campo
            rotulo="WhatsApp"
            value={telefone}
            onChangeText={t => setTelefone(formatTelefone(t))}
            placeholder="(11) 99999-9999"
            keyboardType="phone-pad"
            maxLength={15}
          />
        </Cartao>

        <Cartao>
          <TituloDeCartao>Atende quais organizações e/ou eventos?</TituloDeCartao>
          <Legenda>
            Organização inteira dá acesso a todos os eventos dela, atuais e futuros. Evento
            avulso limita a só aquele.
          </Legenda>
          <Respiro altura={espaco.m} />

          <Text style={e.rotulo}>ORGANIZAÇÕES</Text>
          <Respiro altura={espaco.s} />
          {organizacoes.map(o => (
            <ChecklistLinha
              key={o.id}
              rotulo={o.nome}
              marcado={orgsEscolhidas.has(o.id)}
              onPress={() => alternar(orgsEscolhidas, setOrgsEscolhidas, o.id)}
            />
          ))}

          <Respiro altura={espaco.m} />
          <Text style={e.rotulo}>EVENTOS AVULSOS</Text>
          <Respiro altura={espaco.s} />
          {eventos.map(ev => (
            <ChecklistLinha
              key={ev.id}
              rotulo={`${ev.nome} · ${ev.organizacaoNome}`}
              marcado={eventosEscolhidos.has(ev.id)}
              onPress={() => alternar(eventosEscolhidos, setEventosEscolhidos, ev.id)}
            />
          ))}
        </Cartao>

        <Cartao>
          <Campo
            rotulo="Acesso válido até (opcional)"
            value={expiraEm}
            onChangeText={t => setExpiraEm(mascararData(t))}
            placeholder="dd/mm/aaaa"
            keyboardType="number-pad"
            maxLength={10}
            ajuda="Passada essa data, o acesso para de funcionar sozinho. Em branco, não expira."
          />

          <Text style={e.rotulo}>STATUS</Text>
          <Respiro altura={espaco.s} />
          <Escolha
            opcoes={['Ativo', 'Bloqueado']}
            valor={ativo ? 'Ativo' : 'Bloqueado'}
            aoEscolher={v => setAtivo(v === 'Ativo')}
          />
        </Cartao>

        {erro ? <Aviso tipo="erro">{erro}</Aviso> : null}

        <Botao
          titulo={editando ? 'Salvar alterações' : 'Criar acesso'}
          onPress={salvar}
          ocupado={salvando}
        />

        {editando ? (
          confirmandoRevogar ? (
            <Cartao>
              <Corpo>
                Revogar o acesso de {suporte!.nome} agora? O login para de funcionar
                imediatamente — diferente de excluir, o histórico do que ela fez continua na
                Auditoria.
              </Corpo>
              <Respiro altura={espaco.m} />
              <Botao titulo="Sim, revogar" tipo="perigo" onPress={revogar} ocupado={salvando} />
              <Respiro altura={espaco.s} />
              <Botao titulo="Cancelar" tipo="fantasma" onPress={() => setConfirmandoRevogar(false)} />
            </Cartao>
          ) : (
            <>
              <Respiro altura={espaco.s} />
              <Botao titulo="Revogar acesso" tipo="fantasma" onPress={() => setConfirmandoRevogar(true)} />
            </>
          )
        ) : null}
      </ScrollView>
    </Modal>
  )
}

function ChecklistLinha({
  rotulo, marcado, onPress,
}: { rotulo: string; marcado: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: marcado }}
      style={({ pressed }) => [e.checklistLinha, marcado && e.checklistLinhaMarcada, pressed && e.linhaTocada]}
    >
      <View style={[e.checkbox, marcado && e.checkboxMarcado]}>
        {marcado ? <Icone nome="Check" tamanho={11} tom="#ffffff" espessura={3} /> : null}
      </View>
      <Text style={e.checklistTexto} numberOfLines={1}>{rotulo}</Text>
    </Pressable>
  )
}

const e = StyleSheet.create({
  fio: { height: 1, backgroundColor: uso.borda },

  linha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaco.s,
    paddingHorizontal: espaco.g,
    paddingVertical: espaco.m,
  },
  linhaTocada: { backgroundColor: cor.neutro50 },
  linhaTexto: { flex: 1, minWidth: 0, gap: 2 },
  linhaTopo: { flexDirection: 'row', alignItems: 'center', gap: espaco.s, flexWrap: 'wrap' },
  expiracao: { ...texto.xxs, fontFamily: tipo.regular, color: uso.tintaFraca },

  modalFora: { flex: 1, backgroundColor: cor.fundo },
  modalConteudo: { padding: espaco.g },
  modalTopo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },

  rotulo: { ...texto.etiqueta, color: uso.tintaFraca },
  checklistLinha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaco.s,
    minHeight: 44,
    paddingHorizontal: espaco.s,
    borderRadius: raio.campo,
  },
  checklistLinhaMarcada: { backgroundColor: cor.acento50 },
  checklistTexto: { ...texto.xs, fontFamily: tipo.regular, color: uso.tinta, flex: 1 },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: cor.neutro300,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxMarcado: { backgroundColor: cor.acento500, borderColor: cor.acento500 },
})
