// WhatsApp — o canal que fala com todo mundo.
//
// É da plataforma, e não de um evento: quem dispara em massa e responde
// conversa é o dono, nunca o produtor de um cliente.
//
// ─── O QUE IMPEDE O CANAL DE FUNCIONAR VEM ANTES DOS NÚMEROS ────────────────
//
// Número bonito com a fila pausada engana: "142 enviadas hoje" com o envio
// desligado faz alguém concluir que está tudo certo enquanto a fila acumula.
// Por isso os avisos ficam no topo, antes de qualquer contagem.
//
// ─── ESTE CANAL JÁ CAIU ─────────────────────────────────────────────────────
//
// A conta de WhatsApp deste projeto já foi restringida, e quando ela cai o
// login do colaborador cai junto — é o mesmo canal que manda o código de seis
// dígitos. Está anotado nas limitações conhecidas do projeto, e é por isso que
// o estado do canal é a primeira coisa desta tela.

import { StyleSheet, Text, View } from 'react-native'
import type { TemplateDoWhatsApp } from '@credenciei/contrato'
import { usePedido } from '../../src/dados/pedido'
import { useSessao } from '../../src/sessao/contexto'
import {
  Aviso, Botao, Carregando, Cartao, Corpo, Indicador, Legenda, Respiro, Selo,
  Separador, Tela, TituloDaTela, TituloDeCartao,
} from '../../src/ui/componentes'
import { Icone } from '../../src/ui/icone'
import { cor, espaco, texto, tipo, uso } from '../../src/ui/tema'

const ICONE: Record<string, string> = {
  enviadas: 'Send',
  falhas: 'X',
  fila: 'MessageCircle',
  templates: 'FileSpreadsheet',
}

const NOME_DA_CATEGORIA: Record<TemplateDoWhatsApp['categoria'], string> = {
  AUTHENTICATION: 'autenticação',
  MARKETING: 'marketing',
  UTILITY: 'utilidade',
}

const SITUACAO: Record<
  TemplateDoWhatsApp['situacao'],
  { rotulo: string; tom: 'sucesso' | 'aviso' | 'erro' }
> = {
  aprovado: { rotulo: 'Aprovado', tom: 'sucesso' },
  em_analise: { rotulo: 'Em análise', tom: 'aviso' },
  rejeitado: { rotulo: 'Rejeitado', tom: 'erro' },
}

export default function WhatsApp() {
  const { cliente } = useSessao()
  const { pedido, recarregar } = usePedido(() => cliente.painelDoWhatsApp(), [cliente])
  const dados = pedido.estado === 'pronto' ? pedido.dados : null

  return (
    <Tela>
      <TituloDaTela>WhatsApp</TituloDaTela>
      <Legenda>O canal da plataforma — códigos de acesso, avisos e lembretes</Legenda>
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
          {/* Antes dos números, sempre. */}
          {dados.pausado ? (
            <Aviso tipo="aviso">
              <Corpo forte>Envio pausado.</Corpo> A fila acumula e nada sai.
              Religue quando quiser voltar a enviar.
            </Aviso>
          ) : null}

          {!dados.canal.conectada ? (
            <Aviso tipo="erro">
              <Corpo forte>Canal fora do ar.</Corpo> {dados.canal.estado}
            </Aviso>
          ) : null}

          <View style={e.grade}>
            {dados.indicadores.map(i => (
              <View key={i.chave} style={e.gradeItem}>
                <Indicador
                  rotulo={i.rotulo}
                  valor={i.valor}
                  sub={i.sub}
                  tom={i.tom}
                  icone={<Icone nome={ICONE[i.chave] ?? 'MessageCircle'} tamanho={16} tom="#ffffff" />}
                />
              </View>
            ))}
          </View>

          <Respiro altura={espaco.m} />

          <Cartao>
            <View style={e.tituloComIcone}>
              <Icone
                nome={dados.canal.conectada ? 'CheckCircle' : 'AlertTriangle'}
                tamanho={16}
                tom={dados.canal.conectada ? cor.sucesso600 : cor.aviso600}
              />
              <TituloDeCartao>Estado do canal</TituloDeCartao>
              <Selo
                texto={dados.canal.conectada ? 'No ar' : 'Fora do ar'}
                tipo={dados.canal.conectada ? 'sucesso' : 'erro'}
              />
            </View>
            <Respiro altura={espaco.s} />
            <Corpo>{dados.canal.estado}</Corpo>
            <Respiro altura={espaco.s} />
            <Legenda>
              {dados.canal.provedor === 'meta'
                ? 'API oficial da Meta (Cloud API).'
                : 'Evolution — WhatsApp Web automatizado. Ela já derrubou este número duas vezes; para volume, o caminho é a API oficial.'}
            </Legenda>
          </Cartao>

          <Cartao>
            <TituloDeCartao>Quanto já saiu</TituloDeCartao>
            <Respiro altura={espaco.m} />
            <View style={e.linha}>
              <Corpo>Mensagens disparadas</Corpo>
              <Corpo forte>{dados.disparadas.toString()}</Corpo>
            </View>
            <View style={e.linha}>
              <Corpo>Custo aproximado</Corpo>
              <Corpo forte>{emReais(dados.custoEstimado)}</Corpo>
            </View>
            <Respiro altura={espaco.s} />
            <Legenda>
              Aproximado porque a Meta cobra por categoria e por janela de
              conversa — o número fecha no fim do mês, não a cada envio.
            </Legenda>
          </Cartao>

          <Cartao>
            <TituloDeCartao>Templates</TituloDeCartao>
            <Legenda>
              Lidos direto da Meta — é o texto que a pessoa recebe, não o que
              está no código
            </Legenda>
            <Separador />

            {dados.templates.length === 0 ? (
              <Corpo>
                Nenhum template encontrado. Sem eles, nada é enviado: a Meta só
                aceita mensagem a partir de um texto aprovado.
              </Corpo>
            ) : (
              dados.templates.map((t, i) => (
                <View key={t.nome}>
                  {i > 0 ? <View style={e.fio} /> : null}
                  <View style={e.template}>
                    <View style={e.templateTexto}>
                      <Text style={e.templateNome}>{t.nome}</Text>
                      <Legenda>{NOME_DA_CATEGORIA[t.categoria]}</Legenda>
                    </View>
                    <Selo texto={SITUACAO[t.situacao].rotulo} tipo={SITUACAO[t.situacao].tom} />
                  </View>
                </View>
              ))
            )}
          </Cartao>

          {/*
            Dito na cara em vez de fingido: disparo em massa, conversas e
            fluxos são três telas do sistema web que ainda não vieram. Um
            atalho que abre uma tela vazia é pior que a ausência dele.
          */}
          <Cartao>
            <TituloDeCartao>Ainda no computador</TituloDeCartao>
            <Respiro altura={espaco.s} />
            <Corpo>
              Disparo em massa, as conversas e os fluxos automáticos continuam
              só no sistema do computador. São telas de escrita longa e leitura
              de histórico — o celular serve para acompanhar o canal, que é o
              que esta tela faz.
            </Corpo>
          </Cartao>
        </>
      ) : null}
    </Tela>
  )
}

/** Reais à mão: `toLocaleString` depende de dados que o celular pode não ter. */
function emReais(valor: number): string {
  const centavos = Math.round(valor * 100)
  const inteiros = String(Math.floor(centavos / 100))
  const resto = String(centavos % 100).padStart(2, '0')
  let comPontos = ''
  for (let i = 0; i < inteiros.length; i++) {
    const faltam = inteiros.length - i
    comPontos += inteiros[i]
    if (faltam > 1 && (faltam - 1) % 3 === 0) comPontos += '.'
  }
  return `R$ ${comPontos},${resto}`
}

const e = StyleSheet.create({
  grade: { flexDirection: 'row', flexWrap: 'wrap', gap: espaco.m },
  gradeItem: { width: '48%', flexGrow: 1 },

  tituloComIcone: { flexDirection: 'row', alignItems: 'center', gap: espaco.s, flexWrap: 'wrap' },
  linha: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: espaco.xs,
  },

  fio: { height: 1, backgroundColor: uso.borda },
  template: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaco.m,
    paddingVertical: espaco.m,
  },
  templateTexto: { flex: 1, minWidth: 0 },
  templateNome: { ...texto.corpoForte, fontFamily: tipo.media, color: uso.tinta },
})
