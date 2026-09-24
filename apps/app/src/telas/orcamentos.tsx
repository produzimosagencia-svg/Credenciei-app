// Orçamentos — as peças compartilhadas entre a lista, o novo e o editar.
//
// ─── POR QUE O FORMULÁRIO MORA AQUI, E NÃO NA TELA ──────────────────────────
//
// Porque são DUAS telas com o mesmo formulário (`novo-orcamento` e
// `orcamento/[id]`), e a conta que aparece embaixo — subtotal, desconto,
// total — tem que ser a mesma nas duas. Duplicar o formulário é duplicar a
// chance de as duas mostrarem números diferentes pro mesmo orçamento.
//
// ─── A CONTA NA TELA É A MESMA DO SERVIDOR ──────────────────────────────────
//
// `subtotalDoOrcamento`/`totalDoOrcamento` vêm de `@credenciei/dominio`, as
// MESMAS funções que a API usa pra gravar. Refazer a conta em JSX daria uma
// segunda verdade, e o valor visto na tela sairia diferente do gravado.

import { useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import {
  numeroDoOrcamento, ROTULO_STATUS_ORCAMENTO, STATUS_ORCAMENTO, subtotalDoOrcamento,
  TOM_STATUS_ORCAMENTO, totalDoOrcamento, type StatusOrcamento,
} from '@credenciei/dominio'
import type { DadosDoOrcamento, OrcamentoDetalhado, ResumoDoOrcamento } from '@credenciei/contrato'
import { Icone } from '../ui/icone'
import {
  Aviso, Botao, Campo, Cartao, Escolha, Legenda, Respiro, Selo, Separador, TituloDeCartao,
} from '../ui/componentes'
import { emReais } from '../ui/dinheiro'
import { espaco, raio, texto, tipo } from '../ui/tema'
import { useTema, type Tokens } from '../ui/tema-contexto'

/** O selo colorido do status — mesmo vocabulário e mesmos tons do site. */
export function SeloDeOrcamento({ status }: { status: StatusOrcamento }) {
  return <Selo texto={ROTULO_STATUS_ORCAMENTO[status]} tipo={TOM_STATUS_ORCAMENTO[status]} />
}

/** Uma linha da listagem. O valor é a coluna gravada — ver `ResumoDoOrcamento`. */
export function LinhaDeOrcamento({
  orcamento, aoTocar,
}: { orcamento: ResumoDoOrcamento; aoTocar: () => void }) {
  const { cor } = useTema()
  const e = useEstilos()
  return (
    <Pressable
      onPress={aoTocar}
      accessibilityRole="link"
      style={({ pressed }) => [e.linha, pressed && e.linhaTocada]}
    >
      <View style={e.linhaTexto}>
        <Text style={e.linhaTitulo} numberOfLines={1}>{orcamento.nomeEvento}</Text>
        <Legenda>
          {numeroDoOrcamento(orcamento.numero)} · {orcamento.responsavel}
          {orcamento.dataEvento ? ` · ${emDataBR(orcamento.dataEvento)}` : ''}
        </Legenda>
      </View>
      <View style={e.linhaDireita}>
        <Text style={e.linhaValor}>{emReais(orcamento.valorTotal)}</Text>
        <SeloDeOrcamento status={orcamento.status} />
      </View>
      <Icone nome="ChevronRight" tamanho={16} tom={cor.neutro400} />
    </Pressable>
  )
}

/** "2026-11-14" → "14/11/2026". Sem `toLocaleDateString`, pelo mesmo motivo de `emReais`. */
export function emDataBR(iso: string): string {
  const [ano, mes, dia] = iso.slice(0, 10).split('-')
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : iso
}

type ItemNaTela = { descricao: string; valor: string }

/**
 * O formulário, do nome do evento até o botão de salvar.
 *
 * Os valores são STRING enquanto estão na tela e viram número só na hora de
 * salvar: um campo de dinheiro que guarda número não deixa apagar o último
 * dígito (vira 0 e o cursor pula), e quem digita "1.2" no meio de "1.250"
 * veria o campo se reescrever embaixo do dedo.
 */
export function FormularioDeOrcamento({
  inicial, rotuloSalvar, aoSalvar,
}: {
  inicial?: OrcamentoDetalhado
  rotuloSalvar: string
  aoSalvar: (dados: DadosDoOrcamento) => Promise<{ erro?: string }>
}) {
  const { cor } = useTema()
  const e = useEstilos()

  const [nomeEvento, setNomeEvento] = useState(inicial?.nomeEvento ?? '')
  const [responsavel, setResponsavel] = useState(inicial?.responsavel ?? '')
  const [telefone, setTelefone] = useState(inicial?.telefone ?? '')
  const [dataEvento, setDataEvento] = useState(inicial?.dataEvento ?? '')
  const [valorDia, setValorDia] = useState(numeroNoCampo(inicial?.valorDia))
  const [valorFuncionario, setValorFuncionario] = useState(numeroNoCampo(inicial?.valorFuncionario))
  const [valorTecnico, setValorTecnico] = useState(numeroNoCampo(inicial?.valorTecnico))
  const [dias, setDias] = useState(String(inicial?.dias ?? 1))
  const [desconto, setDesconto] = useState(numeroNoCampo(inicial?.desconto))
  const [observacoes, setObservacoes] = useState(inicial?.observacoes ?? '')
  const [status, setStatus] = useState<StatusOrcamento>(inicial?.status ?? 'rascunho')
  const [itens, setItens] = useState<ItemNaTela[]>(
    inicial?.itens.map(i => ({ descricao: i.descricao, valor: numeroNoCampo(i.valor) })) ?? [],
  )

  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const paraCalculo = {
    valorDia: emNumero(valorDia),
    valorFuncionario: emNumero(valorFuncionario),
    valorTecnico: emNumero(valorTecnico),
    dias: Math.max(1, Math.round(emNumero(dias)) || 1),
    desconto: emNumero(desconto),
    // Só os itens preenchidos entram na conta — a linha em branco que alguém
    // acabou de adicionar não pode mexer no total enquanto ele digita.
    itens: itens.filter(i => i.descricao.trim() && emNumero(i.valor) > 0)
      .map(i => ({ valor: emNumero(i.valor) })),
  }
  const subtotal = subtotalDoOrcamento(paraCalculo)
  const total = totalDoOrcamento(paraCalculo)
  const descontoPassaDoTotal = paraCalculo.desconto > subtotal

  async function salvar() {
    setErro(null)
    setSalvando(true)
    try {
      const r = await aoSalvar({
        nomeEvento, responsavel, telefone, dataEvento,
        valorDia: paraCalculo.valorDia,
        valorFuncionario: paraCalculo.valorFuncionario,
        valorTecnico: paraCalculo.valorTecnico,
        dias: paraCalculo.dias,
        desconto: paraCalculo.desconto,
        observacoes: observacoes.trim() || null,
        status,
        itens: itens.map(i => ({ descricao: i.descricao, valor: emNumero(i.valor) })),
      })
      if (r.erro) setErro(r.erro)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <>
      <Cartao>
        <TituloDeCartao>O cliente</TituloDeCartao>
        <Respiro altura={espaco.s} />

        <Campo
          rotulo="Nome do evento"
          placeholder="Fantástico Mundo do Lukão"
          value={nomeEvento}
          onChangeText={setNomeEvento}
        />
        <Campo
          rotulo="Responsável"
          placeholder="Quem contratou"
          value={responsavel}
          onChangeText={setResponsavel}
        />
        <Campo
          rotulo="Telefone"
          placeholder="27999990000"
          keyboardType="phone-pad"
          value={telefone}
          onChangeText={setTelefone}
        />
        <Campo
          rotulo="Data do evento"
          placeholder="AAAA-MM-DD"
          value={dataEvento}
          onChangeText={setDataEvento}
          ajuda={dataEvento.length === 10 ? emDataBR(dataEvento) : undefined}
        />
      </Cartao>

      <Cartao>
        <TituloDeCartao>As diárias</TituloDeCartao>
        <Respiro altura={espaco.xs} />
        <Legenda>
          Estes três multiplicam pelos dias do evento. Item adicional, não —
          entra uma vez só.
        </Legenda>
        <Respiro altura={espaco.s} />

        <Campo
          rotulo="Valor do dia"
          placeholder="0,00"
          keyboardType="decimal-pad"
          value={valorDia}
          onChangeText={setValorDia}
        />
        <Campo
          rotulo="Por funcionário"
          placeholder="0,00"
          keyboardType="decimal-pad"
          value={valorFuncionario}
          onChangeText={setValorFuncionario}
        />
        <Campo
          rotulo="Técnico"
          placeholder="0,00"
          keyboardType="decimal-pad"
          value={valorTecnico}
          onChangeText={setValorTecnico}
        />
        <Campo
          rotulo="Dias"
          placeholder="1"
          keyboardType="number-pad"
          value={dias}
          onChangeText={setDias}
        />
      </Cartao>

      <Cartao>
        <TituloDeCartao>Itens adicionais</TituloDeCartao>
        <Respiro altura={espaco.xs} />
        <Legenda>Projetor, tenda, som — o que é cobrado uma vez, não por dia.</Legenda>
        <Respiro altura={espaco.s} />

        {itens.length === 0 ? <Legenda>Nenhum item ainda.</Legenda> : null}

        {itens.map((item, n) => (
          <View key={n} style={e.item}>
            <View style={e.itemCampos}>
              <Campo
                placeholder="O que é"
                value={item.descricao}
                onChangeText={v => trocarItem(setItens, n, { descricao: v })}
              />
              <Campo
                placeholder="0,00"
                keyboardType="decimal-pad"
                value={item.valor}
                onChangeText={v => trocarItem(setItens, n, { valor: v })}
              />
            </View>
            <Pressable
              onPress={() => setItens(atual => atual.filter((_, i) => i !== n))}
              accessibilityRole="button"
              accessibilityLabel={`Remover item ${n + 1}`}
              style={e.remover}
            >
              <Icone nome="Trash2" tamanho={18} tom={cor.erro600} />
            </Pressable>
          </View>
        ))}

        <Respiro altura={espaco.s} />
        <Botao
          titulo="Adicionar item"
          tipo="secundario"
          onPress={() => setItens(atual => [...atual, { descricao: '', valor: '' }])}
        />
      </Cartao>

      <Cartao>
        <TituloDeCartao>Fechamento</TituloDeCartao>
        <Respiro altura={espaco.s} />

        <Campo
          rotulo="Desconto"
          placeholder="0,00"
          keyboardType="decimal-pad"
          value={desconto}
          onChangeText={setDesconto}
          erro={descontoPassaDoTotal ? 'Maior que o orçamento — vai ser aparado ao salvar.' : undefined}
        />

        <Campo
          rotulo="Observações"
          placeholder="Condições de pagamento, prazo de validade…"
          multiline
          value={observacoes}
          onChangeText={setObservacoes}
        />

        <Legenda>Status</Legenda>
        <Respiro altura={espaco.xs} />
        <Escolha
          opcoes={STATUS_ORCAMENTO.map(s => ROTULO_STATUS_ORCAMENTO[s])}
          valor={ROTULO_STATUS_ORCAMENTO[status]}
          aoEscolher={rotulo => {
            const achado = STATUS_ORCAMENTO.find(s => ROTULO_STATUS_ORCAMENTO[s] === rotulo)
            if (achado) setStatus(achado)
          }}
        />
      </Cartao>

      <ContaDoOrcamento subtotal={subtotal} desconto={paraCalculo.desconto} total={total} />

      {erro ? (
        <>
          <Aviso tipo="erro">{erro}</Aviso>
          <Respiro altura={espaco.s} />
        </>
      ) : null}

      <Botao titulo={rotuloSalvar} ocupado={salvando} onPress={() => { void salvar() }} />
      <Respiro />
    </>
  )
}

/**
 * Subtotal, desconto e total — a mesma quebra que o PDF do site mostra.
 *
 * Só o total seria mais limpo e pior: quem revisa a proposta precisa ver de
 * onde ele saiu, e o desconto é justamente o número que alguém erra.
 */
export function ContaDoOrcamento({
  subtotal, desconto, total,
}: { subtotal: number; desconto: number; total: number }) {
  const e = useEstilos()
  return (
    <Cartao>
      <View style={e.conta}>
        <Text style={e.contaRotulo}>Subtotal</Text>
        <Text style={e.contaValor}>{emReais(subtotal)}</Text>
      </View>
      {desconto > 0 ? (
        <View style={e.conta}>
          <Text style={e.contaRotulo}>Desconto</Text>
          <Text style={e.contaValor}>- {emReais(Math.min(desconto, subtotal))}</Text>
        </View>
      ) : null}
      <Separador />
      <View style={e.conta}>
        <Text style={e.contaTotalRotulo}>Total</Text>
        <Text style={e.contaTotal}>{emReais(total)}</Text>
      </View>
    </Cartao>
  )
}

function trocarItem(
  setItens: React.Dispatch<React.SetStateAction<ItemNaTela[]>>,
  n: number,
  mudanca: Partial<ItemNaTela>,
) {
  setItens(atual => atual.map((item, i) => (i === n ? { ...item, ...mudanca } : item)))
}

/** Número → o que vai no campo. Zero aparece vazio: "0,00" convida a apagar antes de digitar. */
function numeroNoCampo(valor: number | undefined): string {
  return valor ? String(valor).replace('.', ',') : ''
}

/** "1.250,50" ou "1250.5" → 1250.5. Texto que não é número vira 0, nunca `NaN`. */
function emNumero(bruto: string): number {
  const limpo = bruto.trim().replace(/\./g, '').replace(',', '.')
  const n = Number(limpo)
  return Number.isFinite(n) ? n : 0
}

function criarEstilos(cor: Tokens['cor'], uso: Tokens['uso']) {
  return StyleSheet.create({
    linha: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: espaco.m,
      paddingHorizontal: espaco.g,
      paddingVertical: espaco.m,
    },
    linhaTocada: { backgroundColor: cor.neutro50 },
    linhaTexto: { flex: 1, minWidth: 0 },
    linhaTitulo: { ...texto.base, fontFamily: tipo.media, color: uso.tinta },
    linhaDireita: { alignItems: 'flex-end', gap: espaco.xs },
    linhaValor: { ...texto.corpoForte, color: uso.tinta },

    item: { flexDirection: 'row', alignItems: 'flex-start', gap: espaco.s },
    itemCampos: { flex: 1, minWidth: 0 },
    remover: {
      width: 40,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: raio.peca,
    },

    conta: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: espaco.xs },
    contaRotulo: { ...texto.base, color: uso.tintaFraca },
    contaValor: { ...texto.base, fontFamily: tipo.media, color: uso.tinta },
    contaTotalRotulo: { ...texto.corpoForte, color: uso.tinta },
    contaTotal: { ...texto.tituloCartao, color: cor.acento600 },
  })
}

function useEstilos() {
  const { cor, uso } = useTema()
  return useMemo(() => criarEstilos(cor, uso), [cor, uso])
}
