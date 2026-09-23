/*
 * A ficha de uma pessoa da equipe — leitura (dados, financeiro, presença de
 * hoje) e as mutações que a tela oferece: mover de setor, tornar supervisor,
 * pagamento, valor a receber, tirar da equipe (reversível) e excluir de vez
 * (não é).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { gerarCodigoQR } from '@credenciei/dominio'
import { cenarioHenriqueEJuliano } from '../dados/memoria.js'
import {
  alternarAtivacao, corrigirCpf, corrigirFuncao, corrigirTelefone, crachaDaPessoa, excluirDaEquipe, fichaDaPessoa,
  marcarPagamento, moverDeSetor, resolverContestacao, salvarValorAReceber, tirarDaEquipe, tornarSupervisor,
  trazerDeVolta,
} from './ficha-da-pessoa.js'

const SEGREDO = 'segredo-de-teste'

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

test('presença hoje traz foto (só no meio) e localização — achado comparando com o site', async () => {
  const { repo, admin, participacao } = cenarioHenriqueEJuliano()
  const agora = new Date('2026-09-05T20:00:00-03:00')
  repo.registros.push({
    id: 'reg-presenca-meio', participacaoId: participacao.id, tipo: 'meio', dataRef: '2026-09-05',
    registradoEm: '2026-09-05T19:00:00-03:00', recebidoEm: '2026-09-05T19:00:00-03:00',
    fotoPath: 'ev-hj/part-joao/meio-2026-09-05.jpg', lat: -20.3222, lng: -40.3381, manual: false, origem: 'app', justificativa: null,
  })
  repo.registros.push({
    id: 'reg-presenca-entrada', participacaoId: participacao.id, tipo: 'entrada', dataRef: '2026-09-05',
    registradoEm: '2026-09-05T18:00:00-03:00', recebidoEm: '2026-09-05T18:00:00-03:00',
    fotoPath: null, lat: -20.30, lng: -40.30, manual: false, origem: 'app', justificativa: null,
  })

  const f = await fichaDaPessoa(repo, admin.id, participacao.id, agora)

  assert.ok(f.presencaHoje.meio)
  assert.ok(f.presencaHoje.meio!.fotoUrl, 'meio tem foto — é a única etapa com selfie')
  assert.equal(f.presencaHoje.meio!.lat, -20.3222)
  assert.equal(f.presencaHoje.meio!.lng, -40.3381)

  assert.ok(f.presencaHoje.entrada)
  assert.equal(f.presencaHoje.entrada!.fotoUrl, null, 'entrada não tem foto')
  assert.equal(f.presencaHoje.entrada!.lat, -20.30)

  assert.equal(f.presencaHoje.fim, null)
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

// ─── Corrigir função ────────────────────────────────────────────────────────
//
// Achado comparando com o site (21/09/2026, `editarCargoFuncionario`).

test('admin corrige a função, com espaço duplicado colapsado', async () => {
  const { repo, admin, participacao } = cenarioHenriqueEJuliano()
  const r = await corrigirFuncao(repo, admin.id, participacao.id, '  Auxiliar   de palco  ')
  assert.deepEqual(r, {})
  assert.equal((await fichaDaPessoa(repo, admin.id, participacao.id)).funcao, 'Auxiliar de palco')
})

test('função em branco é recusada', async () => {
  const { repo, admin, participacao } = cenarioHenriqueEJuliano()
  const r = await corrigirFuncao(repo, admin.id, participacao.id, '   ')
  assert.match(r.erro ?? '', /não pode ficar em branco/)
})

test('função longa demais é recusada', async () => {
  const { repo, admin, participacao } = cenarioHenriqueEJuliano()
  const r = await corrigirFuncao(repo, admin.id, participacao.id, 'x'.repeat(61))
  assert.match(r.erro ?? '', /muito longa/)
})

test('supervisor corrige a função da própria equipe; suporte e operador de portão não', async () => {
  const { repo, participacao } = cenarioHenriqueEJuliano()
  repo.perfis.push({ id: 'auth-sup', nome: 'Carlos', papel: 'supervisor', organizacaoId: 'org-1', ativo: true })
  repo.equipes[0]!.supervisorPessoaId = 'auth-sup'
  assert.deepEqual(await corrigirFuncao(repo, 'auth-sup', participacao.id, 'Roadie'), {})

  repo.perfis.push({ id: 'auth-suporte', nome: 'Duda', papel: 'suporte', organizacaoId: 'org-1', ativo: true })
  repo.perfis.push({ id: 'auth-portao', nome: 'Rui', papel: 'operador_portao', organizacaoId: 'org-1', ativo: true })
  for (const id of ['auth-suporte', 'auth-portao']) {
    assert.match((await corrigirFuncao(repo, id, participacao.id, 'Roadie')).erro ?? '', /permissão/, id)
  }
})

// ─── Corrigir CPF ───────────────────────────────────────────────────────────
//
// Achado comparando com o site (21/09/2026, `editarCpfFuncionario`). Só
// master aqui — o app ainda não modela `suporte_escopo`.

test('master corrige o CPF, e a auditoria registra o antes e o depois formatados', async () => {
  const { repo, master, participacao } = cenarioHenriqueEJuliano()
  const r = await corrigirCpf(repo, master.id, participacao.id, '111.444.777-35')
  assert.deepEqual(r, {})
  assert.equal((await fichaDaPessoa(repo, master.id, participacao.id)).cpf, '11144477735')

  const trilha = await repo.auditoria({ organizacaoId: 'org-1' })
  const linha = trilha.find(l => l.acao === 'ALTERACAO_CPF')
  assert.ok(linha)
  assert.match(linha!.valorNovo ?? '', /111\.444\.777-35/)
})

test('CPF inválido é recusado, sem gravar nada', async () => {
  const { repo, master, participacao } = cenarioHenriqueEJuliano()
  const r = await corrigirCpf(repo, master.id, participacao.id, '111.111.111-11')
  assert.match(r.erro ?? '', /CPF inválido/)
})

test('corrigir para o mesmo CPF é um no-op silencioso', async () => {
  const { repo, master, participacao } = cenarioHenriqueEJuliano()
  await corrigirCpf(repo, master.id, participacao.id, '111.444.777-35')
  const antes = await repo.auditoria({ organizacaoId: 'org-1' })
  assert.deepEqual(await corrigirCpf(repo, master.id, participacao.id, '111.444.777-35'), {})
  const depois = await repo.auditoria({ organizacaoId: 'org-1' })
  assert.equal(depois.length, antes.length)
})

test('CPF já usado por outra pessoa no MESMO evento é recusado', async () => {
  const { repo, master, evento, participacao } = cenarioHenriqueEJuliano()
  repo.pessoas.push({ id: 'pes-outra', nome: 'Bia Duarte', cpf: '98765432100', telefone: null, fotoPath: null })
  repo.participacoes.push({
    ...participacao, id: 'part-bia', pessoaId: 'pes-outra', qrToken: 'token-da-bia',
  })
  void evento

  const r = await corrigirCpf(repo, master.id, participacao.id, '98765432100')
  assert.match(r.erro ?? '', /já é de "Bia Duarte"/)
})

test('admin não corrige CPF — só master', async () => {
  const { repo, admin, participacao } = cenarioHenriqueEJuliano()
  const r = await corrigirCpf(repo, admin.id, participacao.id, '11144477735')
  assert.match(r.erro ?? '', /Só o master/)
})

// ─── Crachá (o mesmo QR da credencial) ──────────────────────────────────────

test('admin pega o crachá — o MESMO QR e a MESMA etapa da credencial da pessoa', async () => {
  const { repo, admin, participacao } = cenarioHenriqueEJuliano()
  const agora = new Date('2026-09-05T20:00:00-03:00')
  const r = await crachaDaPessoa(repo, SEGREDO, admin.id, participacao.id, agora)
  assert.equal(r.etapa, 'evento')
  assert.equal(r.codigo, gerarCodigoQR(SEGREDO, participacao.qrToken, 'evento').codigo)
})

test('a etapa do crachá muda com o dia, igual à credencial', async () => {
  const { repo, admin, participacao } = cenarioHenriqueEJuliano()
  const naMontagem = await crachaDaPessoa(repo, SEGREDO, admin.id, participacao.id, new Date('2026-09-03T10:00:00-03:00'))
  const naDesmontagem = await crachaDaPessoa(repo, SEGREDO, admin.id, participacao.id, new Date('2026-09-06T10:00:00-03:00'))
  assert.equal(naMontagem.etapa, 'montagem')
  assert.equal(naDesmontagem.etapa, 'desmontagem')
})

test('participação inexistente é recusada, sem entregar detalhe', async () => {
  const { repo, admin } = cenarioHenriqueEJuliano()
  await assert.rejects(crachaDaPessoa(repo, SEGREDO, admin.id, 'part-fantasma'), /Não encontramos/)
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
