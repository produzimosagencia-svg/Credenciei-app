/*
 * A ficha de uma pessoa da equipe — leitura (dados, financeiro, presença de
 * hoje) e as mutações que a tela oferece: mover de setor, tornar supervisor,
 * pagamento, valor a receber, tirar da equipe (reversível) e excluir de vez
 * (não é).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cenarioHenriqueEJuliano } from '../dados/memoria.js'
import {
  alternarAtivacao, corrigirTelefone, excluirDaEquipe, fichaDaPessoa, marcarPagamento, moverDeSetor,
  resolverContestacao, salvarValorAReceber, tirarDaEquipe, tornarSupervisor, trazerDeVolta,
} from './ficha-da-pessoa.js'

// ─── Leitura da ficha ───────────────────────────────────────────────────────

test('colaborador não abre a ficha de ninguém', async () => {
  const { repo, pessoa, participacao } = cenarioHenriqueEJuliano()
  await assert.rejects(fichaDaPessoa(repo, pessoa.id, participacao.id), /permissão/)
})

test('admin abre a ficha, com o financeiro e os botões de gestão', async () => {
  const { repo, admin, participacao } = cenarioHenriqueEJuliano()
  const f = await fichaDaPessoa(repo, admin.id, participacao.id)
  assert.equal(f.nome, 'João da Silva')
  assert.equal(f.descredenciadoEm, null)
  assert.equal(f.chavePix, null)
  assert.equal(f.valorReceber, 150)
  assert.equal(f.podeMover, true)
  assert.equal(f.podeTornarSupervisor, true)
  assert.equal(f.podeExcluirDaEquipe, true)
})

test('admin de outra organização não encontra a ficha', async () => {
  const { repo, participacao } = cenarioHenriqueEJuliano()
  repo.perfis.push({ id: 'auth-outro', nome: 'Bia', papel: 'admin', organizacaoId: 'org-2', ativo: true })
  await assert.rejects(fichaDaPessoa(repo, 'auth-outro', participacao.id), /Não encontramos/)
})

test('supervisor só abre a ficha de quem está no PRÓPRIO setor', async () => {
  const { repo, evento, participacao } = cenarioHenriqueEJuliano()
  repo.equipes.push({ id: 'eq-2', nome: 'Bar', eventoId: evento.id })
  repo.perfis.push({ id: 'auth-sup', nome: 'Carlos', papel: 'supervisor', organizacaoId: 'org-1', ativo: true })
  repo.equipes[0]!.supervisorPessoaId = 'auth-sup'

  const f = await fichaDaPessoa(repo, 'auth-sup', participacao.id)
  // Supervisor não gerencia eventos nem usuários — só o site também não deixa.
  assert.equal(f.podeMover, false)
  assert.equal(f.podeTornarSupervisor, false)
  // Mas exclui da própria equipe, mesma régua do site (podeExcluirDaEquipe).
  assert.equal(f.podeExcluirDaEquipe, true)

  repo.perfis.push({ id: 'auth-sup2', nome: 'Duda', papel: 'supervisor', organizacaoId: 'org-1', ativo: true })
  repo.equipes[1]!.supervisorPessoaId = 'auth-sup2'
  await assert.rejects(fichaDaPessoa(repo, 'auth-sup2', participacao.id), /Não encontramos/)
})

test('suporte e operador de portão abrem a ficha, mas sem nenhum botão de gestão', async () => {
  const { repo, participacao } = cenarioHenriqueEJuliano()
  repo.perfis.push({ id: 'auth-suporte', nome: 'Duda', papel: 'suporte', organizacaoId: 'org-1', ativo: true })
  repo.perfis.push({ id: 'auth-portao', nome: 'Rui', papel: 'operador_portao', organizacaoId: 'org-1', ativo: true })

  for (const id of ['auth-suporte', 'auth-portao']) {
    const f = await fichaDaPessoa(repo, id, participacao.id)
    assert.equal(f.podeMover, false, id)
    assert.equal(f.podeTornarSupervisor, false, id)
    assert.equal(f.podeExcluirDaEquipe, false, id)
  }
})

// ─── Mover de setor ─────────────────────────────────────────────────────────

test('admin move para outro setor do mesmo evento, e a auditoria registra', async () => {
  const { repo, admin, evento, participacao } = cenarioHenriqueEJuliano()
  repo.equipes.push({ id: 'eq-2', nome: 'Bar', eventoId: evento.id })

  const r = await moverDeSetor(repo, admin.id, participacao.id, 'eq-2')
  assert.deepEqual(r, {})
  assert.equal((await repo.participacaoPorId(participacao.id))?.equipeId, 'eq-2')

  const trilha = await repo.auditoria({ organizacaoId: 'org-1' })
  assert.ok(trilha.some(l => l.acao === 'ALTERACAO_SETOR' && l.valorAnterior === 'Produção' && l.valorNovo === 'Bar'))
})

test('mover para o mesmo setor é recusado', async () => {
  const { repo, admin, participacao } = cenarioHenriqueEJuliano()
  const r = await moverDeSetor(repo, admin.id, participacao.id, participacao.equipeId)
  assert.equal(r.erro, 'Ela já está neste setor.')
})

test('mover para setor de outro evento é recusado', async () => {
  const { repo, admin, participacao } = cenarioHenriqueEJuliano()
  repo.equipes.push({ id: 'eq-outro', nome: 'De outro evento', eventoId: 'ev-outro' })
  const r = await moverDeSetor(repo, admin.id, participacao.id, 'eq-outro')
  assert.equal(r.erro, 'Setor de destino não encontrado neste evento.')
})

test('mover é recusado se já existe alguém com o mesmo CPF no setor de destino', async () => {
  const { repo, admin, evento, participacao } = cenarioHenriqueEJuliano()
  repo.equipes.push({ id: 'eq-2', nome: 'Bar', eventoId: evento.id })
  repo.participacoes.push({ ...participacao, id: 'part-clone', equipeId: 'eq-2', equipeNome: 'Bar' })

  const r = await moverDeSetor(repo, admin.id, participacao.id, 'eq-2')
  assert.match(r.erro ?? '', /Já existe um cadastro com este CPF/)
})

test('supervisor não move ninguém de setor — limitação conhecida, ver CLAUDE.md', async () => {
  const { repo, evento, participacao } = cenarioHenriqueEJuliano()
  repo.equipes.push({ id: 'eq-2', nome: 'Bar', eventoId: evento.id })
  repo.perfis.push({ id: 'auth-sup', nome: 'Carlos', papel: 'supervisor', organizacaoId: 'org-1', ativo: true })
  repo.equipes[0]!.supervisorPessoaId = 'auth-sup'

  const r = await moverDeSetor(repo, 'auth-sup', participacao.id, 'eq-2')
  assert.match(r.erro ?? '', /permissão/)
})

// ─── Tornar supervisor ──────────────────────────────────────────────────────

test('admin promove a pessoa a supervisor do próprio setor, com acesso novo', async () => {
  const { repo, admin, participacao } = cenarioHenriqueEJuliano()
  const r = await tornarSupervisor(repo, admin.id, participacao.id, '27999112233')
  assert.deepEqual(r, {})

  const acesso = await repo.acessoPorCpf('12345678901')
  assert.equal(acesso?.papel, 'supervisor')
  assert.equal(acesso?.setorId, 'eq-1')

  const trilha = await repo.auditoria({ organizacaoId: 'org-1' })
  assert.ok(trilha.some(l => l.acao === 'ALTERACAO_SUPERVISOR' && (l.valorNovo ?? '').includes('acesso novo')))
})

test('telefone inválido é recusado antes de qualquer gravação', async () => {
  const { repo, admin, participacao } = cenarioHenriqueEJuliano()
  const r = await tornarSupervisor(repo, admin.id, participacao.id, '123')
  assert.match(r.erro ?? '', /telefone válido/)
  assert.equal(await repo.acessoPorCpf('12345678901'), null)
})

test('quem já é supervisor ganha mais este setor, em vez de um acesso duplicado', async () => {
  const { repo, admin, evento, participacao } = cenarioHenriqueEJuliano()
  repo.equipes.push({ id: 'eq-2', nome: 'Bar', eventoId: evento.id })
  await repo.criarAcesso({
    nome: 'João da Silva', cpf: '12345678901', telefone: '27999112233', papel: 'supervisor',
    organizacaoId: 'org-1', ativo: true, setorId: 'eq-2', permissoesUsuario: {},
  })

  const r = await tornarSupervisor(repo, admin.id, participacao.id, '27999112233')
  assert.deepEqual(r, {})

  const acesso = await repo.acessoPorCpf('12345678901')
  assert.equal(acesso?.setorId, 'eq-1') // reatribuído para o setor de ONDE ele foi promovido agora

  const trilha = await repo.auditoria({ organizacaoId: 'org-1' })
  assert.ok(trilha.some(l => l.acao === 'ALTERACAO_SUPERVISOR' && (l.valorNovo ?? '').includes('já era supervisor')))
})

test('CPF já usado por outro tipo de acesso é recusado', async () => {
  const { repo, admin, participacao } = cenarioHenriqueEJuliano()
  await repo.criarAcesso({
    nome: 'João da Silva', cpf: '12345678901', telefone: '27999112233', papel: 'operador_portao',
    organizacaoId: 'org-1', ativo: true, permissoesUsuario: {},
  })

  const r = await tornarSupervisor(repo, admin.id, participacao.id, '27999112233')
  assert.match(r.erro ?? '', /outro tipo de acesso/)
})

test('só quem gerencia usuários promove a supervisor', async () => {
  const { repo, participacao } = cenarioHenriqueEJuliano()
  repo.perfis.push({ id: 'auth-portao', nome: 'Rui', papel: 'operador_portao', organizacaoId: 'org-1', ativo: true })
  const r = await tornarSupervisor(repo, 'auth-portao', participacao.id, '27999112233')
  assert.match(r.erro ?? '', /permissão/)
})

// ─── Pagamento e valor a receber ────────────────────────────────────────────

test('marca e desmarca o pagamento de quem está ativo', async () => {
  const { repo, admin, participacao } = cenarioHenriqueEJuliano()
  assert.deepEqual(await marcarPagamento(repo, admin.id, participacao.id, true), {})
  assert.equal((await repo.participacaoPorId(participacao.id))?.pago, true)

  assert.deepEqual(await marcarPagamento(repo, admin.id, participacao.id, false), {})
  assert.equal((await repo.participacaoPorId(participacao.id))?.pago, false)
})

test('não marca pagamento de quem não está ativo', async () => {
  const { repo, admin, participacao } = cenarioHenriqueEJuliano()
  repo.participacoes.find(p => p.id === participacao.id)!.ativo = false
  const r = await marcarPagamento(repo, admin.id, participacao.id, true)
  assert.match(r.erro ?? '', /não está ativada/)
})

test('salva um novo valor a receber, e recusa valor negativo', async () => {
  const { repo, admin, participacao } = cenarioHenriqueEJuliano()
  assert.deepEqual(await salvarValorAReceber(repo, admin.id, participacao.id, 200), {})
  assert.equal((await repo.participacaoPorId(participacao.id))?.valorReceber, 200)

  const r = await salvarValorAReceber(repo, admin.id, participacao.id, -10)
  assert.match(r.erro ?? '', /zero ou mais/)
})

test('suporte não mexe em pagamento nem em valor a receber', async () => {
  const { repo, participacao } = cenarioHenriqueEJuliano()
  repo.perfis.push({ id: 'auth-suporte', nome: 'Duda', papel: 'suporte', organizacaoId: 'org-1', ativo: true })
  assert.match((await marcarPagamento(repo, 'auth-suporte', participacao.id, true)).erro ?? '', /permissão/)
  assert.match((await salvarValorAReceber(repo, 'auth-suporte', participacao.id, 10)).erro ?? '', /permissão/)
})

// ─── Tirar da equipe / trazer de volta ──────────────────────────────────────

test('tira da equipe, registra a auditoria, e traz de volta sem outro efeito', async () => {
  const { repo, admin, participacao } = cenarioHenriqueEJuliano()

  assert.deepEqual(await tirarDaEquipe(repo, admin.id, participacao.id), {})
  const depoisDeTirar = await repo.participacaoPorId(participacao.id)
  assert.ok(depoisDeTirar?.descredenciadoEm)

  const trilha = await repo.auditoria({ organizacaoId: 'org-1' })
  assert.ok(trilha.some(l => l.acao === 'DESCREDENCIAMENTO'))

  assert.deepEqual(await trazerDeVolta(repo, admin.id, participacao.id), {})
  assert.equal((await repo.participacaoPorId(participacao.id))?.descredenciadoEm, null)
})

test('tirar de novo quem já está fora é um no-op silencioso', async () => {
  const { repo, admin, participacao } = cenarioHenriqueEJuliano()
  await tirarDaEquipe(repo, admin.id, participacao.id)
  const antes = await repo.auditoria({ organizacaoId: 'org-1' })

  assert.deepEqual(await tirarDaEquipe(repo, admin.id, participacao.id), {})
  const depois = await repo.auditoria({ organizacaoId: 'org-1' })
  assert.equal(depois.length, antes.length)
})

test('supervisor tira e traz de volta a própria equipe', async () => {
  const { repo, participacao } = cenarioHenriqueEJuliano()
  repo.perfis.push({ id: 'auth-sup', nome: 'Carlos', papel: 'supervisor', organizacaoId: 'org-1', ativo: true })
  repo.equipes[0]!.supervisorPessoaId = 'auth-sup'

  assert.deepEqual(await tirarDaEquipe(repo, 'auth-sup', participacao.id), {})
  assert.deepEqual(await trazerDeVolta(repo, 'auth-sup', participacao.id), {})
})

test('operador de portão não tira nem traz ninguém de volta', async () => {
  const { repo, participacao } = cenarioHenriqueEJuliano()
  repo.perfis.push({ id: 'auth-portao', nome: 'Rui', papel: 'operador_portao', organizacaoId: 'org-1', ativo: true })
  assert.match((await tirarDaEquipe(repo, 'auth-portao', participacao.id)).erro ?? '', /permissão/)
  assert.match((await trazerDeVolta(repo, 'auth-portao', participacao.id)).erro ?? '', /permissão/)
})

// ─── Ativar/desativar (sem tirar da equipe) ────────────────────────────────
//
// Achado comparando com o site (21/09/2026, `alternarAtivacao`): diferente
// de tirar da equipe, a pessoa continua no setor — só pára de contar no
// fechamento e de receber lembrete de WhatsApp.

test('admin desativa e reativa, sem tirar da equipe', async () => {
  const { repo, admin, participacao } = cenarioHenriqueEJuliano()
  assert.equal(participacao.ativo, true)

  assert.deepEqual(await alternarAtivacao(repo, admin.id, participacao.id, false), {})
  assert.equal((await repo.participacaoPorId(participacao.id))?.ativo, false)
  assert.equal((await repo.participacaoPorId(participacao.id))?.descredenciadoEm, null, 'não é a mesma coisa que tirar da equipe')

  assert.deepEqual(await alternarAtivacao(repo, admin.id, participacao.id, true), {})
  assert.equal((await repo.participacaoPorId(participacao.id))?.ativo, true)
})

test('desativar grava auditoria com o de→para', async () => {
  const { repo, admin, participacao } = cenarioHenriqueEJuliano()
  await alternarAtivacao(repo, admin.id, participacao.id, false)

  const trilha = await repo.auditoria({ organizacaoId: 'org-1' })
  const linha = trilha.find(l => l.acao === 'DESATIVACAO_FUNCIONARIO')
  assert.ok(linha)
  assert.equal(linha!.valorAnterior, 'Ativo')
  assert.equal(linha!.valorNovo, 'Inativo')
})

test('supervisor ativa/desativa a própria equipe; suporte e operador de portão não', async () => {
  const { repo, participacao } = cenarioHenriqueEJuliano()
  repo.perfis.push({ id: 'auth-sup', nome: 'Carlos', papel: 'supervisor', organizacaoId: 'org-1', ativo: true })
  repo.equipes[0]!.supervisorPessoaId = 'auth-sup'
  assert.deepEqual(await alternarAtivacao(repo, 'auth-sup', participacao.id, false), {})

  repo.perfis.push({ id: 'auth-suporte', nome: 'Duda', papel: 'suporte', organizacaoId: 'org-1', ativo: true })
  repo.perfis.push({ id: 'auth-portao', nome: 'Rui', papel: 'operador_portao', organizacaoId: 'org-1', ativo: true })
  for (const id of ['auth-suporte', 'auth-portao']) {
    assert.match((await alternarAtivacao(repo, id, participacao.id, true)).erro ?? '', /permissão/, id)
  }
})

// ─── Excluir de vez ─────────────────────────────────────────────────────────

test('admin exclui de vez, e a auditoria guarda nome e CPF de quem foi excluído', async () => {
  const { repo, admin, participacao } = cenarioHenriqueEJuliano()
  const r = await excluirDaEquipe(repo, admin.id, participacao.id, 'CPF duplicado por engano')
  assert.deepEqual(r, {})
  assert.equal(await repo.participacaoPorId(participacao.id), null)

  const trilha = await repo.auditoria({ organizacaoId: 'org-1' })
  const linha = trilha.find(l => l.acao === 'EXCLUSAO_FUNCIONARIO')
  assert.ok(linha)
  assert.match(linha!.valorAnterior ?? '', /João da Silva — CPF 123\.456\.789-01/)
  assert.equal(linha!.motivo, 'CPF duplicado por engano')
})

test('suporte e operador de portão não excluem — só tiram, que preserva o histórico', async () => {
  const { repo, participacao } = cenarioHenriqueEJuliano()
  repo.perfis.push({ id: 'auth-suporte', nome: 'Duda', papel: 'suporte', organizacaoId: 'org-1', ativo: true })
  repo.perfis.push({ id: 'auth-portao', nome: 'Rui', papel: 'operador_portao', organizacaoId: 'org-1', ativo: true })

  for (const id of ['auth-suporte', 'auth-portao']) {
    const r = await excluirDaEquipe(repo, id, participacao.id)
    assert.match(r.erro ?? '', /Tirar da equipe/)
  }
  assert.ok(await repo.participacaoPorId(participacao.id))
})

test('supervisor exclui da própria equipe, mesma régua do site', async () => {
  const { repo, participacao } = cenarioHenriqueEJuliano()
  repo.perfis.push({ id: 'auth-sup', nome: 'Carlos', papel: 'supervisor', organizacaoId: 'org-1', ativo: true })
  repo.equipes[0]!.supervisorPessoaId = 'auth-sup'

  assert.deepEqual(await excluirDaEquipe(repo, 'auth-sup', participacao.id), {})
  assert.equal(await repo.participacaoPorId(participacao.id), null)
})

// ─── Corrigir telefone ──────────────────────────────────────────────────────

test('admin corrige o telefone, e a auditoria registra o antes e o depois', async () => {
  const { repo, admin, participacao } = cenarioHenriqueEJuliano()
  const r = await corrigirTelefone(repo, admin.id, participacao.id, '(27) 98888-7766')
  assert.deepEqual(r, {})

  const ficha = await fichaDaPessoa(repo, admin.id, participacao.id)
  assert.equal(ficha.telefone, '27988887766')

  const trilha = await repo.auditoria({ organizacaoId: 'org-1' })
  const linha = trilha.find(l => l.acao === 'ALTERACAO_TELEFONE')
  assert.ok(linha)
  assert.equal(linha!.valorAnterior, '27999255959')
  assert.equal(linha!.valorNovo, '27988887766')
})

test('telefone inválido é recusado, sem gravar nada', async () => {
  const { repo, admin, participacao } = cenarioHenriqueEJuliano()
  const r = await corrigirTelefone(repo, admin.id, participacao.id, '123')
  assert.match(r.erro ?? '', /Telefone inválido/)
  assert.equal((await fichaDaPessoa(repo, admin.id, participacao.id)).telefone, '27999255959')
})

test('corrigir para o mesmo telefone é um no-op silencioso, sem auditoria nova', async () => {
  const { repo, admin, participacao } = cenarioHenriqueEJuliano()
  const antes = await repo.auditoria({ organizacaoId: 'org-1' })
  assert.deepEqual(await corrigirTelefone(repo, admin.id, participacao.id, '27999255959'), {})
  const depois = await repo.auditoria({ organizacaoId: 'org-1' })
  assert.equal(depois.length, antes.length)
})

test('supervisor corrige o telefone da própria equipe, e o motivo vai pra auditoria', async () => {
  const { repo, participacao } = cenarioHenriqueEJuliano()
  repo.perfis.push({ id: 'auth-sup', nome: 'Carlos', papel: 'supervisor', organizacaoId: 'org-1', ativo: true })
  repo.equipes[0]!.supervisorPessoaId = 'auth-sup'

  const r = await corrigirTelefone(repo, 'auth-sup', participacao.id, '27977776655', 'confirmado por telefone')
  assert.deepEqual(r, {})

  const trilha = await repo.auditoria({ organizacaoId: 'org-1' })
  assert.ok(trilha.some(l => l.acao === 'ALTERACAO_TELEFONE' && l.motivo === 'confirmado por telefone'))
})

test('suporte e operador de portão não corrigem telefone', async () => {
  const { repo, participacao } = cenarioHenriqueEJuliano()
  repo.perfis.push({ id: 'auth-suporte', nome: 'Duda', papel: 'suporte', organizacaoId: 'org-1', ativo: true })
  repo.perfis.push({ id: 'auth-portao', nome: 'Rui', papel: 'operador_portao', organizacaoId: 'org-1', ativo: true })

  for (const id of ['auth-suporte', 'auth-portao']) {
    const r = await corrigirTelefone(repo, id, participacao.id, '27977776655')
    assert.match(r.erro ?? '', /permissão/, id)
  }
})

// ─── Contestação de batida ──────────────────────────────────────────────────

test('a ficha lista as contestações ainda abertas', async () => {
  const { repo, admin, participacao } = cenarioHenriqueEJuliano()
  await repo.criarContestacao({
    participacaoId: participacao.id, tipo: 'meio', dataRef: '2026-09-03', motivo: 'não gravou',
  })

  const ficha = await fichaDaPessoa(repo, admin.id, participacao.id)
  assert.equal(ficha.contestacoesAbertas.length, 1)
  assert.equal(ficha.contestacoesAbertas[0]!.motivo, 'não gravou')
})

test('admin resolve a contestação', async () => {
  const { repo, admin, participacao } = cenarioHenriqueEJuliano()
  const c = await repo.criarContestacao({
    participacaoId: participacao.id, tipo: 'entrada', dataRef: '2026-09-03', motivo: 'esqueci de bater',
  })

  assert.deepEqual(await resolverContestacao(repo, admin.id, c.id), {})
  assert.equal((await fichaDaPessoa(repo, admin.id, participacao.id)).contestacoesAbertas.length, 0)
})

test('supervisor resolve a contestação da própria equipe, mas não de outro setor', async () => {
  const { repo, evento, participacao } = cenarioHenriqueEJuliano()
  repo.equipes.push({ id: 'eq-2', nome: 'Bar', eventoId: evento.id })
  repo.perfis.push({ id: 'auth-sup', nome: 'Carlos', papel: 'supervisor', organizacaoId: 'org-1', ativo: true })
  repo.perfis.push({ id: 'auth-sup2', nome: 'Duda', papel: 'supervisor', organizacaoId: 'org-1', ativo: true })
  repo.equipes[0]!.supervisorPessoaId = 'auth-sup'
  repo.equipes[1]!.supervisorPessoaId = 'auth-sup2'

  const c = await repo.criarContestacao({
    participacaoId: participacao.id, tipo: 'fim', dataRef: '2026-09-03', motivo: 'saída não registrada',
  })

  await assert.rejects(resolverContestacao(repo, 'auth-sup2', c.id), /Não encontramos/)

  assert.deepEqual(await resolverContestacao(repo, 'auth-sup', c.id), {})
})

test('contestação inexistente é recusada', async () => {
  const { repo, admin } = cenarioHenriqueEJuliano()
  const r = await resolverContestacao(repo, admin.id, 'cont-inexistente')
  assert.match(r.erro ?? '', /Não encontramos esta contestação/)
})

test('suporte e operador de portão não resolvem contestação', async () => {
  const { repo, participacao } = cenarioHenriqueEJuliano()
  repo.perfis.push({ id: 'auth-suporte', nome: 'Duda', papel: 'suporte', organizacaoId: 'org-1', ativo: true })
  repo.perfis.push({ id: 'auth-portao', nome: 'Rui', papel: 'operador_portao', organizacaoId: 'org-1', ativo: true })
  const c = await repo.criarContestacao({
    participacaoId: participacao.id, tipo: 'meio', dataRef: '2026-09-03', motivo: 'não gravou',
  })

  for (const id of ['auth-suporte', 'auth-portao']) {
    const r = await resolverContestacao(repo, id, c.id)
    assert.match(r.erro ?? '', /permissão/, id)
  }
})
