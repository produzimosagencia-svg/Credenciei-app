/*
 * Configurar evento: editar informações e horários, marcar os dias de
 * trabalho, e criar um evento novo.
 *
 * O tema aqui é o mesmo de toda rota de gerenciamento: só quem administra
 * eventos mexe, só na própria organização — "não encontrado" e "não é seu"
 * respondem igual.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cenarioHenriqueEJuliano } from '../dados/memoria.js'
import {
  adicionarSupervisor, alternarCadastroPorLink, alternarLinkDoSetor, alternarPortaria, configuracaoDoEvento,
  configuracaoDoMeio, criarEvento, criarLinkCadastroIndividual, criarSetor, editarSetor, eventoDetalhado, excluirSetor,
  salvarConfiguracaoDoMeio, salvarDiasDeTrabalho, salvarEvento, trocarTokenDaPortaria,
} from './configurar-evento.js'

const SITE = 'https://site.teste'
const SUPERVISOR_NOVO = { nome: 'Marina Oliveira', cpf: '111.222.333-96', telefone: '(27) 99988-7766' }

const DADOS_BASE = {
  nome: 'Henrique e Juliano — Kleber Andrade',
  descricao: null,
  local: 'Estádio Kleber Andrade',
  dataInicio: '2026-09-05T18:30:00-03:00',
  dataFim: '2026-09-06T08:00:00-03:00',
  batidaLivre: false,
  checkinAutonomo: false,
  janelaEntradaInicio: '2026-09-05T07:00:00-03:00',
  janelaEntradaFim: '2026-09-05T23:55:00-03:00',
  janelaFimInicio: '2026-09-06T01:30:00-03:00',
  janelaFimFim: '2026-09-06T08:00:00-03:00',
}

// ─── Permissão e isolamento ─────────────────────────────────────────────────

test('supervisor não configura evento', async () => {
  const { repo, evento } = cenarioHenriqueEJuliano()
  repo.perfis.push({ id: 'auth-sup', nome: 'Carlos', papel: 'supervisor', organizacaoId: 'org-1', ativo: true })
  await assert.rejects(configuracaoDoEvento(repo, 'auth-sup', evento.id), /permissão/)
})

test('admin de outra organização não vê o evento', async () => {
  const { repo, evento } = cenarioHenriqueEJuliano()
  repo.perfis.push({ id: 'auth-outro', nome: 'Bia', papel: 'admin', organizacaoId: 'org-2', ativo: true })
  await assert.rejects(configuracaoDoEvento(repo, 'auth-outro', evento.id), /Não encontramos/)
})

test('admin de outra organização recebe "não encontrado" ao salvar', async () => {
  const { repo, evento } = cenarioHenriqueEJuliano()
  repo.perfis.push({ id: 'auth-outro', nome: 'Bia', papel: 'admin', organizacaoId: 'org-2', ativo: true })
  await assert.rejects(salvarEvento(repo, 'auth-outro', evento.id, DADOS_BASE), /Não encontramos/)
})

test('master configura evento de qualquer organização', async () => {
  const { repo, evento, master } = cenarioHenriqueEJuliano()
  const cfg = await configuracaoDoEvento(repo, master.id, evento.id)
  assert.equal(cfg.eventoId, evento.id)
})

// ─── Ler a configuração ─────────────────────────────────────────────────────

test('a configuração traz os horários e os dias, com o principal travado', async () => {
  const { repo, evento, admin } = cenarioHenriqueEJuliano()
  const cfg = await configuracaoDoEvento(repo, admin.id, evento.id)

  assert.equal(cfg.nome, evento.nome)
  assert.equal(cfg.diaPrincipal, '2026-09-05')
  assert.equal(cfg.batidaLivre, false)
  assert.equal(cfg.checkinAutonomo, false)

  const principal = cfg.dias.find(d => d.tipo === 'principal')
  assert.ok(principal)
  assert.equal(principal!.temBatidas, true)

  // O cenário tem 03, 04 (antes) e 06/09 (depois) como preparação.
  const preparacao = cfg.dias.filter(d => d.tipo === 'preparacao')
  assert.equal(preparacao.length, 3)
})

// ─── Salvar o evento ────────────────────────────────────────────────────────

test('recusa nome vazio', async () => {
  const { repo, evento, admin } = cenarioHenriqueEJuliano()
  const r = await salvarEvento(repo, admin.id, evento.id, { ...DADOS_BASE, nome: '  ' })
  assert.match(r.erro ?? '', /nome/)
})

test('recusa horário impossível — a saída fecha antes de o evento começar', async () => {
  const { repo, evento, admin } = cenarioHenriqueEJuliano()
  const r = await salvarEvento(repo, admin.id, evento.id, {
    ...DADOS_BASE,
    janelaFimInicio: '2026-09-05T01:00:00-03:00',
    janelaFimFim: '2026-09-05T02:00:00-03:00',
  })
  assert.match(r.erro ?? '', /antes de o evento começar/)
})

test('salva as informações e os horários', async () => {
  const { repo, evento, admin } = cenarioHenriqueEJuliano()
  const r = await salvarEvento(repo, admin.id, evento.id, {
    ...DADOS_BASE,
    nome: 'Henrique e Juliano — Nome Novo',
    descricao: 'Show de sertanejo',
    batidaLivre: true,
  })
  assert.equal(r.erro, undefined)

  const salvo = await repo.eventoPorId(evento.id)
  assert.equal(salvo!.nome, 'Henrique e Juliano — Nome Novo')
  assert.equal(salvo!.descricao, 'Show de sertanejo')
  assert.equal(salvo!.batida_livre, true)
})

test('mudar a data de início move o dia principal — o antigo vira preparação', async () => {
  const { repo, evento, admin } = cenarioHenriqueEJuliano()
  const r = await salvarEvento(repo, admin.id, evento.id, {
    ...DADOS_BASE,
    dataInicio: '2026-09-10T18:30:00-03:00',
    dataFim: '2026-09-11T08:00:00-03:00',
    janelaEntradaInicio: '2026-09-10T07:00:00-03:00',
    janelaEntradaFim: '2026-09-10T23:55:00-03:00',
    janelaFimInicio: '2026-09-11T01:30:00-03:00',
    janelaFimFim: '2026-09-11T08:00:00-03:00',
  })
  assert.equal(r.erro, undefined)

  const dias = await repo.diasDoEvento(evento.id)
  const antigo = dias.find(d => d.data === '2026-09-05')
  const novo = dias.find(d => d.data === '2026-09-10')
  assert.equal(antigo?.tipo, 'preparacao', 'o dia antigo continua existindo, só que como preparação')
  assert.equal(novo?.tipo, 'principal', 'o novo dia é que passa a ser o principal')
})

test('salvar sem mudar a data não duplica nem mexe no dia principal', async () => {
  const { repo, evento, admin } = cenarioHenriqueEJuliano()
  await salvarEvento(repo, admin.id, evento.id, DADOS_BASE)

  const dias = await repo.diasDoEvento(evento.id)
  const doDiaPrincipal = dias.filter(d => d.data === '2026-09-05')
  assert.equal(doDiaPrincipal.length, 1)
  assert.equal(doDiaPrincipal[0]!.tipo, 'principal')
})

// ─── Dias de trabalho ───────────────────────────────────────────────────────

test('marca dias novos e tira dias sem batida', async () => {
  const { repo, evento, admin } = cenarioHenriqueEJuliano()
  // O cenário já tem 03/09 e 06/09 como preparação — pede só um dia novo.
  const r = await salvarDiasDeTrabalho(repo, admin.id, evento.id, ['2026-09-04'])
  assert.equal(r.erro, undefined)
  assert.equal(r.resultado!.dias, 1)
  assert.equal(r.resultado!.preservados, 0)

  const dias = await repo.diasDoEvento(evento.id)
  const datas = dias.map(d => d.data).sort()
  assert.deepEqual(datas, ['2026-09-04', '2026-09-05'])
})

test('preserva dia desmarcado que já tem batida', async () => {
  const { repo, evento, participacao, admin } = cenarioHenriqueEJuliano()
  await repo.gravarRegistro({
    id: 'reg-1', participacaoId: participacao.id, tipo: 'entrada',
    dataRef: '2026-09-03', registradoEm: '2026-09-03T08:00:00-03:00',
    fotoPath: null, lat: null, lng: null, manual: false,
  })

  // Pede só 04/09 — tentando tirar 03/09, que já tem a batida de cima.
  const r = await salvarDiasDeTrabalho(repo, admin.id, evento.id, ['2026-09-04'])
  assert.equal(r.resultado!.preservados, 1)
  // "dias" conta só o que foi PEDIDO (04/09) — 03/09 aparece em "preservados",
  // não aqui, senão a mesma data contaria duas vezes na mensagem da tela.
  assert.equal(r.resultado!.dias, 1)

  const dias = await repo.diasDoEvento(evento.id)
  assert.ok(dias.some(d => d.data === '2026-09-03' && d.tipo === 'preparacao'))
})

test('o dia principal nunca sai nem entra pela lista de preparação', async () => {
  const { repo, evento, admin } = cenarioHenriqueEJuliano()
  // Pede o próprio dia principal junto — não deveria virar um segundo dia.
  await salvarDiasDeTrabalho(repo, admin.id, evento.id, ['2026-09-05', '2026-09-04'])
  const dias = await repo.diasDoEvento(evento.id)
  const doDiaPrincipal = dias.filter(d => d.data === '2026-09-05')
  assert.equal(doDiaPrincipal.length, 1)
  assert.equal(doDiaPrincipal[0]!.tipo, 'principal')
})

// ─── Batida do meio ─────────────────────────────────────────────────────────

test('a configuração do meio traz os setores e os dias do evento', async () => {
  const { repo, evento, admin } = cenarioHenriqueEJuliano()
  const cfg = await configuracaoDoMeio(repo, admin.id, evento.id)

  // O cenário nasce com o setor "Produção" já exigindo o meio.
  assert.deepEqual(cfg.setores, [{ setorId: 'eq-1', nome: 'Produção', exigeMeio: true }])
  assert.equal(cfg.dias.length, 4) // 03, 04, 05 (principal) e 06/09
})

test('salvar desliga tudo e liga só o que veio marcado', async () => {
  const { repo, evento, admin } = cenarioHenriqueEJuliano()

  const r = await salvarConfiguracaoDoMeio(repo, admin.id, evento.id, [], ['2026-09-05'])
  assert.equal(r.erro, undefined)
  assert.equal(r.setores, 0)
  assert.equal(r.dias, 1)

  const cfg = await configuracaoDoMeio(repo, admin.id, evento.id)
  assert.equal(cfg.setores[0]!.exigeMeio, false)
  assert.deepEqual(cfg.dias.filter(d => d.exigeMeio).map(d => d.data), ['2026-09-05'])
})

test('setor ou dia de OUTRO evento nunca entra na configuração do meio', async () => {
  /*
   * Sem filtrar pelo evento, um id de setor (ou uma data) de outro evento —
   * por engano ou de propósito — ligaria o meio de algo que não é deste
   * evento. Achado comparando com o site (`lib/actions.ts` filtra por
   * `idsDoEvento`/`datasDoEvento` antes de gravar), 13/09/2026.
   */
  const { repo, evento, admin } = cenarioHenriqueEJuliano()
  repo.equipes.push({ id: 'eq-de-outro-evento', nome: 'Bar', eventoId: 'ev-outro', exigeMeio: false })

  const r = await salvarConfiguracaoDoMeio(
    repo, admin.id, evento.id, ['eq-de-outro-evento'], ['2099-01-01'],
  )
  assert.equal(r.erro, undefined)
  assert.equal(r.setores, 0, 'o setor de outro evento não conta nem é ligado')
  assert.equal(r.dias, 0, 'a data que não pertence a este evento não conta nem é ligada')

  const outro = repo.equipes.find(e => e.id === 'eq-de-outro-evento')
  assert.equal(outro?.exigeMeio, false, 'o setor de outro evento continua do jeito que estava')
})

test('admin de outra organização não configura o meio de um evento que não é seu', async () => {
  const { repo, evento } = cenarioHenriqueEJuliano()
  repo.perfis.push({ id: 'auth-outro', nome: 'Bia', papel: 'admin', organizacaoId: 'org-2', ativo: true })
  await assert.rejects(configuracaoDoMeio(repo, 'auth-outro', evento.id), /Não encontramos/)
  await assert.rejects(salvarConfiguracaoDoMeio(repo, 'auth-outro', evento.id, [], []), /Não encontramos/)
})

// ─── Criar evento ───────────────────────────────────────────────────────────

test('admin cria evento sempre na própria organização, mesmo mandando outra', async () => {
  const { repo, admin } = cenarioHenriqueEJuliano()
  const r = await criarEvento(repo, admin.id, {
    organizacaoId: 'org-999', // ignorado: quem decide é o servidor
    nome: 'Festa Nova',
    dataInicio: '2026-10-01T20:00:00-03:00',
    dataFim: '2026-10-02T04:00:00-03:00',
  })
  assert.equal(r.erro, undefined)
  const criado = await repo.eventoPorId(r.eventoId!)
  assert.equal(criado!.organizacaoId, 'org-1')
})

test('master precisa escolher a organização', async () => {
  const { repo, master } = cenarioHenriqueEJuliano()
  const r = await criarEvento(repo, master.id, {
    nome: 'Festa Nova',
    dataInicio: '2026-10-01T20:00:00-03:00',
    dataFim: '2026-10-02T04:00:00-03:00',
  })
  assert.match(r.erro ?? '', /organização/)
})

test('criar evento gera o dia principal, sem o qual nada bate ponto', async () => {
  const { repo, admin } = cenarioHenriqueEJuliano()
  const r = await criarEvento(repo, admin.id, {
    nome: 'Festa Nova',
    dataInicio: '2026-10-01T20:00:00-03:00',
    dataFim: '2026-10-02T04:00:00-03:00',
  })
  const dias = await repo.diasDoEvento(r.eventoId!)
  assert.equal(dias.length, 1)
  assert.equal(dias[0]!.tipo, 'principal')
  assert.equal(dias[0]!.data, '2026-10-01')
})

test('recusa criar evento com horário impossível', async () => {
  const { repo, admin } = cenarioHenriqueEJuliano()
  const r = await criarEvento(repo, admin.id, {
    nome: 'Festa Nova',
    dataInicio: '2026-10-02T20:00:00-03:00',
    dataFim: '2026-10-01T04:00:00-03:00', // termina antes de começar
  })
  assert.match(r.erro ?? '', /terminando antes de começar/)
})

test('colaborador não cria evento', async () => {
  const { repo, pessoa } = cenarioHenriqueEJuliano()
  const r = await criarEvento(repo, pessoa.id, {
    nome: 'Festa Nova',
    dataInicio: '2026-10-01T20:00:00-03:00',
    dataFim: '2026-10-02T04:00:00-03:00',
  })
  assert.match(r.erro ?? '', /permissão/)
})

// ─── O evento por dentro ────────────────────────────────────────────────────

test('o evento por dentro traz setores, portaria e o total de pessoas', async () => {
  const { repo, evento, admin, participacao } = cenarioHenriqueEJuliano()
  void participacao
  const d = await eventoDetalhado(repo, admin.id, evento.id, SITE)
  assert.equal(d.setores.length, 1)
  assert.equal(d.setores[0]!.nome, 'Produção')
  assert.equal(d.totalPessoas, 1)
  assert.equal(d.portaria.aberta, false)
  assert.equal(d.portaria.endereco, null)
})

test('os indicadores são as cinco chaves do site, escopadas a UM dia', async () => {
  const { repo, evento, admin, participacao } = cenarioHenriqueEJuliano()
  await repo.criarParticipacao({
    pessoaId: 'pes-segunda', eventoId: evento.id, equipeId: 'eq-1', equipeNome: 'Produção',
    funcao: null, supervisorNome: null, ativo: true, descredenciadoEm: null,
    valorReceber: null, pago: false, pagoEm: null, qrToken: 'tk-segunda',
    cidade: null, criadoEm: '2026-08-20T10:00:00-03:00',
  })
  await repo.gravarRegistro({
    id: 'reg-1', participacaoId: participacao.id, tipo: 'entrada', dataRef: '2026-09-05',
    registradoEm: '2026-09-05T08:00:00-03:00', fotoPath: null, lat: null, lng: null, manual: false,
  })

  const d = await eventoDetalhado(repo, admin.id, evento.id, SITE, '2026-09-05')

  assert.deepEqual(
    d.indicadores.map(i => i.chave),
    ['funcionarios_do_evento', 'presentes_no_momento', 'entradas_hoje', 'batida_do_meio_hoje', 'saidas_hoje'],
  )
  assert.equal(d.totalPessoas, 2)
  assert.equal(d.indicadores.find(i => i.chave === 'entradas_hoje')!.valor, '1/2')
  assert.equal(d.indicadores.find(i => i.chave === 'entradas_hoje')!.sub, '50% da equipe')
  assert.equal(d.indicadores.find(i => i.chave === 'presentes_no_momento')!.valor, 1)
})

test('"presentes no momento" deduplica por pessoa, não por batida', async () => {
  // Duas leituras de entrada no mesmo dia, mesma pessoa — presente é UM, não dois.
  const { repo, evento, admin, participacao } = cenarioHenriqueEJuliano()
  await repo.gravarRegistro({
    id: 'reg-a', participacaoId: participacao.id, tipo: 'entrada', dataRef: '2026-09-05',
    registradoEm: '2026-09-05T08:00:00-03:00', fotoPath: null, lat: null, lng: null, manual: false,
  })
  await repo.gravarRegistro({
    id: 'reg-b', participacaoId: participacao.id, tipo: 'entrada', dataRef: '2026-09-05',
    registradoEm: '2026-09-05T09:00:00-03:00', fotoPath: null, lat: null, lng: null, manual: false,
  })

  const d = await eventoDetalhado(repo, admin.id, evento.id, SITE, '2026-09-05')
  assert.equal(d.indicadores.find(i => i.chave === 'presentes_no_momento')!.valor, 1)
})

test('quem já saiu não conta mais como presente', async () => {
  const { repo, evento, admin, participacao } = cenarioHenriqueEJuliano()
  await repo.gravarRegistro({
    id: 'reg-entrada', participacaoId: participacao.id, tipo: 'entrada', dataRef: '2026-09-05',
    registradoEm: '2026-09-05T08:00:00-03:00', fotoPath: null, lat: null, lng: null, manual: false,
  })
  await repo.gravarRegistro({
    id: 'reg-saida', participacaoId: participacao.id, tipo: 'fim', dataRef: '2026-09-05',
    registradoEm: '2026-09-05T20:00:00-03:00', fotoPath: null, lat: null, lng: null, manual: false,
  })

  const d = await eventoDetalhado(repo, admin.id, evento.id, SITE, '2026-09-05')
  assert.equal(d.indicadores.find(i => i.chave === 'presentes_no_momento')!.valor, 0)
  assert.equal(d.indicadores.find(i => i.chave === 'saidas_hoje')!.valor, '1/1')
})

test('sem dia pedido, cai no último dia da operação que já passou', async () => {
  // O cenário Henrique e Juliano tem dias fixos em 2026-09-03..06 — todos no
  // passado frente a "hoje" de verdade. Sem pedir um dia, a conta cai no
  // ÚLTIMO deles, não no primeiro nem num dia fora da lista.
  const { repo, evento, admin } = cenarioHenriqueEJuliano()
  const d = await eventoDetalhado(repo, admin.id, evento.id, SITE)
  assert.deepEqual(d.diasDaOperacao, ['2026-09-03', '2026-09-04', '2026-09-05', '2026-09-06'])
  assert.equal(d.diaEscolhido, '2026-09-06')
})

test('um dia pedido que não é do evento é ignorado, cai no padrão', async () => {
  const { repo, evento, admin } = cenarioHenriqueEJuliano()
  const d = await eventoDetalhado(repo, admin.id, evento.id, SITE, '2099-01-01')
  assert.equal(d.diaEscolhido, '2026-09-06')
})

test('admin de outra organização não abre o evento por dentro', async () => {
  const { repo, evento } = cenarioHenriqueEJuliano()
  repo.perfis.push({ id: 'auth-outro', nome: 'Bia', papel: 'admin', organizacaoId: 'org-2', ativo: true })
  await assert.rejects(eventoDetalhado(repo, 'auth-outro', evento.id, SITE), /Não encontramos/)
})

// ─── Cartaz da portaria ──────────────────────────────────────────────────────

test('abrir a portaria sorteia um token; fechar não o apaga', async () => {
  const { repo, evento, admin } = cenarioHenriqueEJuliano()
  let n = 0
  const novoToken = () => `tok-${++n}`

  const aberta = await alternarPortaria(repo, admin.id, evento.id, true, SITE, novoToken)
  assert.equal(aberta.portaria?.aberta, true)
  assert.equal(aberta.portaria?.endereco, `${SITE}/portaria/tok-1`)

  const fechada = await alternarPortaria(repo, admin.id, evento.id, false, SITE, novoToken)
  assert.equal(fechada.portaria?.aberta, false)
  // O endereço continua o MESMO — o cartaz já impresso volta a funcionar
  // se a portaria for reaberta depois, sem reimprimir nada.
  assert.equal(fechada.portaria?.endereco, `${SITE}/portaria/tok-1`)
})

test('trocar o QR sorteia um token novo, sem mexer se está aberta ou fechada', async () => {
  const { repo, evento, admin } = cenarioHenriqueEJuliano()
  let n = 0
  const novoToken = () => `tok-${++n}`

  await alternarPortaria(repo, admin.id, evento.id, true, SITE, novoToken)
  const trocada = await trocarTokenDaPortaria(repo, admin.id, evento.id, SITE, novoToken)

  assert.equal(trocada.portaria?.aberta, true)
  assert.equal(trocada.portaria?.endereco, `${SITE}/portaria/tok-2`)
})

// ─── Suspender/reabrir o cadastro por link do evento inteiro ────────────────

test('suspende e reabre o cadastro por link do evento inteiro', async () => {
  const { repo, evento, admin } = cenarioHenriqueEJuliano()

  const antes = await eventoDetalhado(repo, admin.id, evento.id, SITE)
  assert.equal(antes.cadastroSuspenso, false)

  await alternarCadastroPorLink(repo, admin.id, evento.id, true)
  const suspenso = await eventoDetalhado(repo, admin.id, evento.id, SITE)
  assert.equal(suspenso.cadastroSuspenso, true)

  await alternarCadastroPorLink(repo, admin.id, evento.id, false)
  const reaberto = await eventoDetalhado(repo, admin.id, evento.id, SITE)
  assert.equal(reaberto.cadastroSuspenso, false)
})

test('admin de outra organização não suspende o cadastro de um evento que não é seu', async () => {
  const { repo, evento } = cenarioHenriqueEJuliano()
  repo.perfis.push({ id: 'auth-outro', nome: 'Bia', papel: 'admin', organizacaoId: 'org-2', ativo: true })
  await assert.rejects(alternarCadastroPorLink(repo, 'auth-outro', evento.id, true), /Não encontramos/)
})

test('só quem gerencia eventos suspende o cadastro por link', async () => {
  const { repo, evento, pessoa } = cenarioHenriqueEJuliano()
  await assert.rejects(alternarCadastroPorLink(repo, pessoa.id, evento.id, true), /permissão/)
})

// ─── Link individual de 48h ──────────────────────────────────────────────────

test('master gera o link individual de 48h para um setor', async () => {
  const { repo, evento, admin, master } = cenarioHenriqueEJuliano()
  const criado = await criarSetor(repo, admin.id, evento.id, {
    nome: 'Camarim', valorPorPessoa: null, exigeMeio: false, supervisor: SUPERVISOR_NOVO,
  }, SITE)
  const setorId = criado.setor!.setorId
  const antes = Date.now()

  const r = await criarLinkCadastroIndividual(repo, master.id, evento.id, setorId, SITE, () => 'token-fixo-123')

  assert.equal(r.erro, undefined, r.erro)
  assert.match(r.link ?? '', /\/form\/.+\?individual=token-fixo-123$/)
  assert.equal(r.setorNome, 'Camarim')
  assert.equal(r.eventoNome, evento.nome)

  const expiraEm = new Date(r.expiraEm ?? '').getTime()
  assert.ok(expiraEm > antes + 47 * 60 * 60 * 1000, 'expira pelo menos 47h à frente')
  assert.ok(expiraEm < antes + 49 * 60 * 60 * 1000, 'expira no máximo 49h à frente')
})

test('admin não gera link individual — só o master', async () => {
  const { repo, evento, admin } = cenarioHenriqueEJuliano()
  const criado = await criarSetor(repo, admin.id, evento.id, {
    nome: 'Camarim', valorPorPessoa: null, exigeMeio: false, supervisor: SUPERVISOR_NOVO,
  }, SITE)
  await assert.rejects(
    criarLinkCadastroIndividual(repo, admin.id, evento.id, criado.setor!.setorId, SITE, () => 'token'),
    /Só o acesso master/,
  )
})

test('setor de outro evento é recusado', async () => {
  const { repo, evento, master } = cenarioHenriqueEJuliano()
  const r = await criarLinkCadastroIndividual(repo, master.id, evento.id, 'setor-fantasma', SITE, () => 'token')
  assert.match(r.erro ?? '', /Setor não encontrado/)
})

// ─── Criar setor ─────────────────────────────────────────────────────────────

test('criar setor pede nome e supervisor, e o setor nasce vazio de equipe', async () => {
  const { repo, evento, admin } = cenarioHenriqueEJuliano()
  const r = await criarSetor(repo, admin.id, evento.id, {
    nome: 'Segurança', valorPorPessoa: 200, exigeMeio: false, supervisor: SUPERVISOR_NOVO,
  }, SITE)

  assert.ok(r.setor, r.erro)
  assert.equal(r.setor?.pessoas, 0)
  assert.equal(r.setor?.supervisores.length, 1)
  assert.equal(r.setor?.supervisores[0]?.nome, 'Marina Oliveira')
  assert.ok(r.setor?.linkDoFormulario.startsWith(`${SITE}/form/`))

  // Ganhou login de verdade, preso a ESTE setor.
  const acesso = await repo.acessoPorCpf('11122233396')
  assert.equal(acesso?.papel, 'supervisor')
  assert.equal(acesso?.setorId, r.setor?.setorId)
})

test('supervisor com o mesmo CPF de outro já existente não cria login novo — este setor entra nos dela', async () => {
  const { repo, evento, admin } = cenarioHenriqueEJuliano()
  const primeiro = await criarSetor(repo, admin.id, evento.id, {
    nome: 'Bar', valorPorPessoa: 150, exigeMeio: false, supervisor: SUPERVISOR_NOVO,
  }, SITE)
  const idDoAcesso = (await repo.acessoPorCpf('11122233396'))!.id

  const segundo = await criarSetor(repo, admin.id, evento.id, {
    nome: 'Camarim', valorPorPessoa: 180, exigeMeio: false, supervisor: SUPERVISOR_NOVO,
  }, SITE)

  assert.ok(segundo.setor, segundo.erro)
  const reutilizado = await repo.acessoPorCpf('11122233396')
  assert.equal(reutilizado?.id, idDoAcesso, 'não criou um segundo login para o mesmo CPF')
  assert.equal(reutilizado?.setorId, segundo.setor?.setorId, 'o setor novo é o que ela vê agora')
  void primeiro
})

test('CPF de supervisor já usado por outro papel é recusado, e o setor não fica órfão', async () => {
  const { repo, evento, admin, pessoa } = cenarioHenriqueEJuliano()
  repo.perfis.push({
    id: 'auth-cliente-x', nome: 'Outro Papel', papel: 'cliente', organizacaoId: 'org-1', ativo: true,
    cpf: pessoa.cpf,
  })

  const antes = (await repo.setoresDoEvento(evento.id)).length
  const r = await criarSetor(repo, admin.id, evento.id, {
    nome: 'Camarim', valorPorPessoa: null, exigeMeio: false,
    supervisor: { nome: 'Fulano', cpf: pessoa.cpf, telefone: '27999990000' },
  }, SITE)

  assert.match(r.erro ?? '', /outro tipo de acesso/)
  assert.equal((await repo.setoresDoEvento(evento.id)).length, antes, 'o setor criado foi desfeito')
})

test('só quem gerencia eventos cria setor', async () => {
  const { repo, evento, pessoa } = cenarioHenriqueEJuliano()
  await assert.rejects(criarSetor(repo, pessoa.id, evento.id, {
    nome: 'Bar', valorPorPessoa: null, exigeMeio: false, supervisor: SUPERVISOR_NOVO,
  }, SITE), /permissão/)
})

// ─── Editar setor e ligar/desligar o link ───────────────────────────────────

test('editar setor muda nome, valor e o pedido do meio', async () => {
  const { repo, admin } = cenarioHenriqueEJuliano()
  const r = await editarSetor(repo, admin.id, 'eq-1', {
    nome: 'Produção — Palco B', valorPorPessoa: 175, exigeMeio: false,
  }, SITE)

  assert.ok(r.setor, r.erro)
  assert.equal(r.setor?.nome, 'Produção — Palco B')
  assert.equal(r.setor?.valorPorPessoa, 175)
  assert.equal(r.setor?.exigeMeio, false)
})

test('admin de outra organização não edita o setor', async () => {
  const { repo } = cenarioHenriqueEJuliano()
  repo.perfis.push({ id: 'auth-outro', nome: 'Bia', papel: 'admin', organizacaoId: 'org-2', ativo: true })
  await assert.rejects(editarSetor(repo, 'auth-outro', 'eq-1', {
    nome: 'Invasão', valorPorPessoa: null, exigeMeio: false,
  }, SITE), /Não encontramos/)
})

test('só quem gerencia eventos edita setor', async () => {
  const { repo, pessoa } = cenarioHenriqueEJuliano()
  await assert.rejects(editarSetor(repo, pessoa.id, 'eq-1', {
    nome: 'Produção', valorPorPessoa: null, exigeMeio: false,
  }, SITE), /permissão/)
})

test('setor inexistente responde "não encontramos" ao editar', async () => {
  const { repo, admin } = cenarioHenriqueEJuliano()
  await assert.rejects(editarSetor(repo, admin.id, 'eq-fantasma', {
    nome: 'Fantasma', valorPorPessoa: null, exigeMeio: false,
  }, SITE), /Não encontramos/)
})

test('liga e desliga o link de cadastro do setor', async () => {
  const { repo, admin, evento } = cenarioHenriqueEJuliano()

  await alternarLinkDoSetor(repo, admin.id, 'eq-1', false)
  const [desligado] = await repo.setoresDoEvento(evento.id)
  assert.equal(desligado?.linkAtivo, false)

  await alternarLinkDoSetor(repo, admin.id, 'eq-1', true)
  const [ligado] = await repo.setoresDoEvento(evento.id)
  assert.equal(ligado?.linkAtivo, true)
})

test('admin de outra organização não liga/desliga o link de um setor que não é seu', async () => {
  const { repo } = cenarioHenriqueEJuliano()
  repo.perfis.push({ id: 'auth-outro', nome: 'Bia', papel: 'admin', organizacaoId: 'org-2', ativo: true })
  await assert.rejects(alternarLinkDoSetor(repo, 'auth-outro', 'eq-1', false), /Não encontramos/)
})

// ─── Excluir setor ───────────────────────────────────────────────────────────

test('master exclui setor sem supervisor', async () => {
  const { repo, evento, master } = cenarioHenriqueEJuliano()
  const r = await excluirSetor(repo, master.id, 'eq-1')

  assert.equal(r.erro, undefined)
  assert.equal((await repo.setoresDoEvento(evento.id)).some(s => s.setorId === 'eq-1'), false)
})

test('admin não exclui — só o master, e a mensagem diz o que fazer em vez disso', async () => {
  const { repo, evento, admin } = cenarioHenriqueEJuliano()
  const r = await excluirSetor(repo, admin.id, 'eq-1')

  assert.match(r.erro ?? '', /master/)
  assert.equal((await repo.setoresDoEvento(evento.id)).some(s => s.setorId === 'eq-1'), true, 'o setor continua existindo')
})

test('setor com supervisor vinculado recusa a exclusão', async () => {
  const { repo, evento, admin, master } = cenarioHenriqueEJuliano()
  const criado = await criarSetor(repo, admin.id, evento.id, {
    nome: 'Camarim', valorPorPessoa: null, exigeMeio: false, supervisor: SUPERVISOR_NOVO,
  }, SITE)

  const r = await excluirSetor(repo, master.id, criado.setor!.setorId)

  assert.match(r.erro ?? '', /supervisores vinculados/)
  assert.equal((await repo.setoresDoEvento(evento.id)).some(s => s.setorId === criado.setor!.setorId), true)
})

test('admin de outra organização não exclui um setor que não é seu', async () => {
  const { repo } = cenarioHenriqueEJuliano()
  repo.perfis.push({ id: 'auth-outro', nome: 'Bia', papel: 'admin', organizacaoId: 'org-2', ativo: true })
  // A checagem de organização vem ANTES da de papel: "não é seu" nem chega a
  // dizer que só o master exclui — a resposta é igual à de um id inexistente.
  await assert.rejects(excluirSetor(repo, 'auth-outro', 'eq-1'), /Não encontramos/)
})

// ─── Adicionar supervisor a um setor que já existe ──────────────────────────

test('adiciona um supervisor novo a um setor já existente', async () => {
  const { repo, admin } = cenarioHenriqueEJuliano()
  const r = await adicionarSupervisor(repo, admin.id, 'eq-1', SUPERVISOR_NOVO)

  assert.equal(r.erro, undefined)
  const [setor] = (await repo.setoresDoEvento('ev-hj')).filter(s => s.setorId === 'eq-1')
  assert.equal(setor?.supervisores.some(s => s.nome === 'Marina Oliveira'), true)
})

test('CPF que já supervisiona outro setor entra também neste, sem criar login novo', async () => {
  const { repo, admin } = cenarioHenriqueEJuliano()
  await adicionarSupervisor(repo, admin.id, 'eq-1', SUPERVISOR_NOVO)
  const idDoAcesso = (await repo.acessoPorCpf('11122233396'))!.id

  const r = await adicionarSupervisor(repo, admin.id, 'eq-1', SUPERVISOR_NOVO)
  assert.equal(r.erro, undefined)
  assert.equal((await repo.acessoPorCpf('11122233396'))!.id, idDoAcesso, 'não criou um segundo login')
})

test('CPF de outro tipo de acesso é recusado ao adicionar supervisor', async () => {
  const { repo, admin, pessoa } = cenarioHenriqueEJuliano()
  repo.perfis.push({
    id: 'auth-cliente-y', nome: 'Outro Papel', papel: 'cliente', organizacaoId: 'org-1', ativo: true, cpf: pessoa.cpf,
  })
  const r = await adicionarSupervisor(repo, admin.id, 'eq-1', { nome: 'Fulano', cpf: pessoa.cpf, telefone: '27999990000' })
  assert.match(r.erro ?? '', /outro tipo de acesso/)
})

test('só quem gerencia eventos adiciona supervisor', async () => {
  const { repo, pessoa } = cenarioHenriqueEJuliano()
  await assert.rejects(adicionarSupervisor(repo, pessoa.id, 'eq-1', SUPERVISOR_NOVO), /permissão/)
})
