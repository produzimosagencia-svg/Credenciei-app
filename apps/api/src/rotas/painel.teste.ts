/*
 * O Painel é a primeira tela de quem tem conta — e a que decide o recorte.
 * O tema aqui é isolamento: master vê tudo, quem gerencia evento só a
 * própria organização, supervisor só o próprio evento. Nenhuma tela filtra —
 * quem filtra é este arquivo.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cenarioHenriqueEJuliano } from '../dados/memoria.js'
import { painel } from './painel.js'
import type { Evento } from '../dados/repositorio.js'

/** O cenário base, mais um segundo evento de OUTRA organização. */
function comSegundaOrganizacao() {
  const c = cenarioHenriqueEJuliano()

  const eventoDaOutra: Evento = {
    id: 'ev-outra',
    nome: 'Festa da Outra Empresa',
    descricao: null,
    organizacaoId: 'org-2',
    organizacaoNome: 'Outra Produtora',
    local: 'Outro local',
    dataInicio: '2026-09-10T20:00:00-03:00',
    dataFim: '2026-09-11T04:00:00-03:00',
    janela_entrada_inicio: null,
    janela_entrada_fim: null,
    janela_fim_inicio: null,
    janela_fim_fim: null,
    batida_livre: false,
    checkin_autonomo: false,
    codigoConvite: null,
    exigeAprovacao: false,
    ativo: true,
  }
  c.repo.eventos.push(eventoDaOutra)
  c.repo.equipes.push({ id: 'eq-outra', nome: 'Produção', eventoId: 'ev-outra' })

  return { ...c, eventoDaOutra }
}

/** Um supervisor, preso ao setor (equipe) do evento Henrique e Juliano. */
function comSupervisor() {
  const c = cenarioHenriqueEJuliano()
  const supervisor = { id: 'auth-supervisor', nome: 'Carlos Silva', papel: 'supervisor' as const, organizacaoId: 'org-1', ativo: true }
  c.repo.perfis.push(supervisor)
  const equipe = c.repo.equipes.find(e => e.id === 'eq-1')!
  equipe.supervisorPessoaId = supervisor.id
  return { ...c, supervisor }
}

test('o master vê os eventos de TODAS as organizações', async () => {
  const { repo, master } = comSegundaOrganizacao()
  const p = await painel(repo, master.id)
  const nomes = p.eventos.map(e => e.nome).sort()
  assert.deepEqual(nomes, ['Festa da Outra Empresa', 'Henrique e Juliano — Kleber Andrade'])
})

test('o admin vê só os eventos da PRÓPRIA organização', async () => {
  const { repo, admin } = comSegundaOrganizacao()
  const p = await painel(repo, admin.id)
  assert.equal(p.eventos.length, 1)
  assert.equal(p.eventos[0]?.nome, 'Henrique e Juliano — Kleber Andrade')
})

test('o supervisor vê só o PRÓPRIO evento, nunca os outros da organização', async () => {
  const { repo, supervisor } = comSupervisor()
  repo.equipes.push({ id: 'eq-outro-setor', nome: 'Portaria', eventoId: repo.eventos[0]!.id })
  const p = await painel(repo, supervisor.id)
  assert.equal(p.eventos.length, 1)
  assert.equal(p.eventos[0]?.eventoId, 'ev-hj')
})

test('supervisor sem equipe vinculada não vê evento nenhum, mas não quebra', async () => {
  const c = cenarioHenriqueEJuliano()
  const semEquipe = { id: 'auth-sem-equipe', nome: 'Sem Equipe', papel: 'supervisor' as const, organizacaoId: 'org-1', ativo: true }
  c.repo.perfis.push(semEquipe)
  const p = await painel(c.repo, semEquipe.id)
  assert.deepEqual(p.eventos, [])
  assert.equal(p.indicadores.find(i => i.chave === 'eventos_ativos')?.valor, 0)
})

test('quem não tem perfil de painel (colaborador, id inexistente) é recusado', async () => {
  const { repo, pessoa } = cenarioHenriqueEJuliano()
  // `pessoa.id` está em `pessoas`, não em `perfis` — é exatamente o caso do
  // colaborador tentando o painel, e a recusa é a mesma de um id qualquer.
  await assert.rejects(() => painel(repo, pessoa.id), /não tem acesso/)
})

test('evento encerrado soma no total, mas some da lista de "acontecendo agora"', async () => {
  const { repo, admin, evento } = cenarioHenriqueEJuliano()
  const encerrado = { ...evento, id: 'ev-velho', nome: 'Evento Já Encerrado', ativo: false }
  repo.eventos.push(encerrado)

  const p = await painel(repo, admin.id)
  assert.equal(p.eventos.length, 1, 'só o ativo aparece na lista')
  assert.equal(p.eventos[0]?.nome, evento.nome)
  assert.equal(p.indicadores.find(i => i.chave === 'eventos_ativos')?.sub, 'de 2 no total')
})

test('presentes e "ainda não chegaram" somam a equipe e quem já bateu entrada', async () => {
  const { repo, admin, participacao } = cenarioHenriqueEJuliano()
  // Mais duas pessoas na mesma equipe, sem bater ponto ainda.
  repo.pessoas.push(
    { id: 'pes-ana', nome: 'Ana', cpf: '11111111111', telefone: null, fotoPath: null },
    { id: 'pes-rui', nome: 'Rui', cpf: '22222222222', telefone: null, fotoPath: null },
  )
  repo.participacoes.push(
    { ...participacao, id: 'part-ana', pessoaId: 'pes-ana', qrToken: 'tk-ana' },
    { ...participacao, id: 'part-rui', pessoaId: 'pes-rui', qrToken: 'tk-rui' },
  )
  repo.registros.push({
    id: 'r-1', participacaoId: participacao.id, tipo: 'entrada',
    dataRef: '2026-09-05', registradoEm: '2026-09-05T18:00:00-03:00',
    recebidoEm: '2026-09-05T18:00:00-03:00', fotoPath: null, lat: null, lng: null, manual: false,
  })

  const p = await painel(repo, admin.id)
  assert.equal(p.eventos[0]?.equipe, 3, 'três participações na equipe')
  assert.equal(p.eventos[0]?.presentes, 1, 'só quem bateu entrada')
  assert.equal(p.indicadores.find(i => i.chave === 'presentes')?.sub, 'de 3 na equipe')
  assert.equal(p.indicadores.find(i => i.chave === 'nao_chegaram')?.valor, 2)
})

test('a mesma pessoa com duas entradas conta uma vez só em "presentes"', async () => {
  const { repo, admin, participacao } = cenarioHenriqueEJuliano()
  repo.registros.push(
    {
      id: 'r-1', participacaoId: participacao.id, tipo: 'entrada', dataRef: '2026-09-03',
      registradoEm: '2026-09-03T08:00:00-03:00', recebidoEm: '2026-09-03T08:00:00-03:00',
      fotoPath: null, lat: null, lng: null, manual: false,
    },
    {
      id: 'r-2', participacaoId: participacao.id, tipo: 'entrada', dataRef: '2026-09-05',
      registradoEm: '2026-09-05T18:00:00-03:00', recebidoEm: '2026-09-05T18:00:00-03:00',
      fotoPath: null, lat: null, lng: null, manual: false,
    },
  )
  const p = await painel(repo, admin.id)
  assert.equal(p.eventos[0]?.presentes, 1)
})

test('batidas na janela contam só o que caiu dentro da janela do evento de referência', async () => {
  const { repo, admin, participacao, evento } = cenarioHenriqueEJuliano()
  assert.ok(evento.janela_entrada_inicio && evento.janela_fim_fim)

  repo.registros.push(
    // Dentro da janela (a entrada do dia principal, configurada no cenário).
    {
      id: 'r-dentro', participacaoId: participacao.id, tipo: 'entrada', dataRef: '2026-09-05',
      registradoEm: '2026-09-05T19:00:00-03:00', recebidoEm: '2026-09-05T19:00:00-03:00',
      fotoPath: null, lat: null, lng: null, manual: false,
    },
    // Fora da janela (dia de montagem, bem antes de ela abrir).
    {
      id: 'r-fora', participacaoId: participacao.id, tipo: 'entrada', dataRef: '2026-09-03',
      registradoEm: '2026-09-03T08:00:00-03:00', recebidoEm: '2026-09-03T08:00:00-03:00',
      fotoPath: null, lat: null, lng: null, manual: false,
    },
  )

  const p = await painel(repo, admin.id)
  assert.equal(p.indicadores.find(i => i.chave === 'batidas')?.valor, 1)
  assert.match(p.legendaDaJanela ?? '', /Henrique e Juliano/)
})

test('sem nenhuma janela configurada, a legenda vem nula — a tela é quem explica', async () => {
  const c = cenarioHenriqueEJuliano()
  c.evento.janela_entrada_inicio = null
  c.evento.janela_entrada_fim = null
  c.evento.janela_fim_inicio = null
  c.evento.janela_fim_fim = null
  c.evento.dataFim = null

  const p = await painel(c.repo, c.admin.id)
  assert.equal(p.legendaDaJanela, null)
  assert.equal(p.indicadores.find(i => i.chave === 'batidas')?.sub, 'sem janela definida')
})

test('atividade recente vem da mais nova para a mais velha, e limitada a 10', async () => {
  const { repo, admin, participacao } = cenarioHenriqueEJuliano()
  for (let i = 0; i < 12; i++) {
    repo.registros.push({
      id: `r-${i}`, participacaoId: participacao.id, tipo: 'entrada', dataRef: '2026-09-05',
      registradoEm: `2026-09-05T${String(10 + i).padStart(2, '0')}:00:00-03:00`,
      recebidoEm: '2026-09-05T10:00:00-03:00', fotoPath: null, lat: null, lng: null, manual: false,
    })
  }
  const p = await painel(repo, admin.id)
  assert.equal(p.atividade.length, 10)
  assert.equal(p.atividade[0]?.id, 'r-11', 'a mais recente primeiro')
  assert.equal(p.atividade[0]?.nome, 'João da Silva')
  assert.equal(p.atividade[0]?.setor, 'Produção')
})

test('conta suspensa não tem tratamento especial aqui — quem barra é o login', async () => {
  // `entrarComSenha` já recusa `ativo: false` antes de a sessão nascer; o
  // Painel não precisa reconferir — é só documentar que ele não filtra por
  // engano quem já passou pela porta.
  const { repo, adminSuspenso } = cenarioHenriqueEJuliano()
  const p = await painel(repo, adminSuspenso.id)
  assert.equal(p.eventos.length, 1)
})
