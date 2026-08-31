// Base de funcionários — todo mundo que já foi credenciado, por CPF.
//
// ─── POR CPF, E NÃO POR CADASTRO ────────────────────────────────────────────
//
// A mesma pessoa credenciada em cinco eventos de três clientes é UMA linha
// aqui. É isso que responde a pergunta que a base existe para responder:
// "esta pessoa já trabalhou com a gente?".
//
// Uma lista por cadastro responderia outra coisa — quantas vezes ela se
// inscreveu — e a mesma pessoa apareceria cinco vezes na busca, o que faz quem
// procura desconfiar de que são homônimos.

import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { formatCpf, formatTelefone, formatarBR } from '@credenciei/dominio'
import type { PessoaDaBase } from '@credenciei/contrato'
import { usePedido } from '../../src/dados/pedido'
import { useSessao } from '../../src/sessao/contexto'
import {
  Aviso, Botao, Campo, Carregando, Cartao, Corpo, Indicador, Legenda, Respiro,
  Selo, Tela, TituloDaTela, TituloDeCartao,
} from '../../src/ui/componentes'
import { Icone } from '../../src/ui/icone'
import { espaco, texto, tipo, uso } from '../../src/ui/tema'

const ICONE: Record<string, string> = {
  pessoas: 'IdCard',
  cadastros: 'Users',
  organizacoes: 'Building2',
  recorrentes: 'UserCheck',
}

export default function BaseDeFuncionarios() {
  const { cliente } = useSessao()
  const [busca, setBusca] = useState('')

  const { pedido, recarregar } = usePedido(
    () => cliente.baseDeFuncionarios(busca),
    [cliente, busca],
  )
  const dados = pedido.estado === 'pronto' ? pedido.dados : null

  return (
    <Tela>
      <TituloDaTela>Base de funcionários</TituloDaTela>
      <Legenda>
        Todo mundo que já foi credenciado por qualquer cliente, identificado
        pelo CPF
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
        placeholder="Buscar por CPF ou nome…"
        autoCapitalize="none"
        autoCorrect={false}
        ajuda="O CPF funciona com ou sem os pontos."
      />

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
              {busca
                ? 'Ninguém encontrado com esse CPF ou nome.'
                : 'A base ainda está vazia. Ela se preenche sozinha conforme as equipes se cadastram nos eventos.'}
            </Corpo>
          </Cartao>
        ) : (
          <>
            {/*
              O total NÃO muda com a busca: ele responde "quantas existem".
              Recalculá-lo pela busca faria a base parecer encolher a cada
              letra digitada.
            */}
            <Legenda>
              {busca
                ? `${dados.pessoas.length} de ${dados.total} pessoas`
                : `${dados.total} pessoas na base`}
            </Legenda>
            <Respiro altura={espaco.s} />

            <Cartao semPadding>
              {dados.pessoas.map((p, i) => (
                <View key={p.cpf}>
                  {i > 0 ? <View style={e.fio} /> : null}
                  <LinhaDaBase pessoa={p} />
                </View>
              ))}
            </Cartao>
          </>
        )
      ) : null}
    </Tela>
  )
}

function LinhaDaBase({ pessoa }: { pessoa: PessoaDaBase }) {
  return (
    <View style={e.pessoa}>
      <TituloDeCartao>{pessoa.nome}</TituloDeCartao>
      <Legenda>{formatCpf(pessoa.cpf)}</Legenda>

      <View style={e.selos}>
        <Selo
          texto={`${pessoa.eventos} evento${pessoa.eventos === 1 ? '' : 's'}`}
          tipo={pessoa.eventos >= 2 ? 'sucesso' : 'info'}
        />
        <Selo
          texto={`${pessoa.organizacoes} organizaç${pessoa.organizacoes === 1 ? 'ão' : 'ões'}`}
          tipo="info"
        />
        {pessoa.funcao ? <Selo texto={pessoa.funcao} tipo="info" /> : null}
      </View>

      <Text style={e.rodape}>
        {pessoa.telefone ? `${formatTelefone(pessoa.telefone)} · ` : ''}
        último cadastro em {formatarBR(pessoa.ultimoCadastro, 'curto')}
      </Text>
    </View>
  )
}

const e = StyleSheet.create({
  grade: { flexDirection: 'row', flexWrap: 'wrap', gap: espaco.m },
  gradeItem: { width: '48%', flexGrow: 1 },

  fio: { height: 1, backgroundColor: uso.borda },
  pessoa: { padding: espaco.g, gap: 4 },
  selos: { flexDirection: 'row', flexWrap: 'wrap', gap: espaco.s, marginTop: espaco.xs },
  rodape: { ...texto.xxs, fontFamily: tipo.regular, color: uso.tintaFraca, marginTop: espaco.xs },
})
