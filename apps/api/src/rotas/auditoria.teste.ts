/*
 * A trilha de auditoria tem dois lados: quem PODE VER (o escopo — master
 * tudo, os demais só a própria organização, suporte só o que ele mesmo fez)
 * e quem GRAVA (cada rota sensível já tem seu próprio teste de regra de
 * negócio; aqui só confere que, ao mexer, uma linha aparece na trilha, com
 * a ação certa).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { gerarCodigoQR } from '@credenciei/dominio'
import { cenarioHenriqueEJuliano } from '../dados/memoria.js'
import { auditoria } from './auditoria.js'
import { bloqueiosDoEvento, bloquearCpf, desbloquearCpf } from './bloquear-cpf.js'
import { criarAcesso, editarSupervisor, mudarSituacaoDoAcesso, trocarSenhaDoAcesso } from './acessos.js'
import { adicionarSupervisor, criarLinkCadastroIndividual } from './configurar-evento.js'
import { salvarPermissaoDaOrganizacao } from './configuracoes.js'
import { confirmarConferencia } from './conferencia.js'
import { registrarPorQr } from './escanear.js'
import { registrarPresencaAssistida } from './ponto-assistido.js'

const NOVO_SUPERVISOR = {
  funcao: 'supervisor' as const,
  nome: 'Larissa Prado', cpf: '65498732100', telefone: '27999887766',
  eventoId: 'ev-hj', setorId: 'eq-1', ativo: true,
}

test('só quem gerencia usuários ou é suporte enxerga a trilha', async () => {
  const { repo, pessoa } = cenarioHenriqueEJuliano()
  await assert.rejects(() => auditoria(repo, pessoa.id), /permissão/)
})

test('master vê auditoria das duas organizações; admin só a própria', async () => {
  const { repo, admin, master } = cenarioHenriqueEJuliano()
  await bloquearCpf(repo, admin.id, 'ev-hj', '11122233344')

  const outraOrg = { id: 'org-2', nome: 'Outra', documento: null, responsavelNome: null, limiteEventos: 5, valorCobrado: null, valorCobradoPeriodo: null, ativo: true, criadaEm: '2025-01-01T00:00:00-03:00' }
  repo.organizacoes.push(outraOrg)
  repo.perfis.push({ id: 'auth-admin-2', nome: 'Outro Admin', papel: 'admin', organizacaoId: 'org-2', ativo: true })
  await repo.registrarAuditoria({
    autorId: 'auth-admin-2', autorNome: 'Outro Admin', acao: 'BLOQUEIO_CPF',
    organizacaoId: 'org-2',
  })

  const daAdmin = await auditoria(repo, admin.id)
  assert.equal(daAdmin.length, 1)

  const doMaster = await auditoria(repo, master.id)
  assert.equal(doMaster.length, 2)
})

test('suporte só vê o que ELE MESMO fez, mesmo tendo alcance entre organizações', async () => {
  const { repo, admin } = cenarioHenriqueEJuliano()
  repo.perfis.push({ id: 'auth-suporte', nome: 'Suporte Um', papel: 'suporte', organizacaoId: null, ativo: true })

  await bloquearCpf(repo, admin.id, 'ev-hj', '11122233344')
  await repo.registrarAuditoria({ autorId: 'auth-suporte', autorNome: 'Suporte Um', acao: 'RESET_SENHA' })

  const doSuporte = await auditoria(repo, 'auth-suporte')
  assert.equal(doSuporte.length, 1)
  assert.equal(doSuporte[0]?.acao, 'RESET_SENHA')
})

test('bloquear e desbloquear CPF gravam auditoria, com o CPF formatado', async () => {
  const { repo, admin, master } = cenarioHenriqueEJuliano()
  const r = await bloquearCpf(repo, admin.id, 'ev-hj', '11122233344', 'Não escalado')

  const linhas = await auditoria(repo, master.id)
  assert.equal(linhas[0]?.acao, 'BLOQUEIO_CPF')
  assert.equal(linhas[0]?.valorNovo, '111.222.333-44')
  assert.equal(linhas[0]?.motivo, 'Não escalado')

  const bloqueios = await bloqueiosDoEvento(repo, admin.id, 'ev-hj')
  await desbloquearCpf(repo, admin.id, bloqueios.find(b => b.cpf === r.cpf)!.id, 'ev-hj')

  const depois = await auditoria(repo, master.id)
  assert.equal(depois[0]?.acao, 'DESBLOQUEIO_CPF')
  assert.equal(depois[0]?.valorNovo, '111.222.333-44')
})

test('mudar situação, trocar senha e editar acesso gravam auditoria', async () => {
  const { repo, admin, master } = cenarioHenriqueEJuliano()
  const criado = await criarAcesso(repo, admin.id, NOVO_SUPERVISOR)
  const idSupervisor = criado.acesso!.id

  await mudarSituacaoDoAcesso(repo, admin.id, idSupervisor, false)
  await trocarSenhaDoAcesso(repo, admin.id, idSupervisor, 'senhaNova123')
  await editarSupervisor(repo, admin.id, idSupervisor, { nome: 'Larissa P. Souza', telefone: '27999887766', ativo: true })

  const acoes = (await auditoria(repo, master.id)).map(l => l.acao)
  // A mais recente vem primeiro — editar, trocar senha, mudar situação, criar.
  assert.deepEqual(acoes, [
    'ALTERACAO_SUPERVISOR', 'RESET_SENHA', 'ALTERACAO_SUPERVISOR', 'ALTERACAO_SUPERVISOR',
  ])
})

test('criar acesso admin grava auditoria própria', async () => {
  const { repo, master } = cenarioHenriqueEJuliano()
  await criarAcesso(repo, master.id, {
    funcao: 'admin', nome: 'Novo Admin', email: 'novo@empresa.com', senha: 'senha123', organizacaoId: 'org-1', ativo: true,
  })
  const linhas = await auditoria(repo, master.id)
  assert.equal(linhas[0]?.acao, 'ALTERACAO_SUPERVISOR')
  assert.match(linhas[0]?.campoAlterado ?? '', /Admin da organização/)
})

test('adicionar supervisor a um setor já existente grava auditoria', async () => {
  const { repo, admin, master } = cenarioHenriqueEJuliano()
  await adicionarSupervisor(repo, admin.id, 'eq-1', { nome: 'Fernanda Reis', cpf: '52998224725', telefone: '27988776655' })

  const linhas = await auditoria(repo, master.id)
  assert.equal(linhas[0]?.acao, 'ALTERACAO_SUPERVISOR')
  assert.match(linhas[0]?.campoAlterado ?? '', /Supervisor do setor Produção/)
})

test('link individual de 48h grava auditoria', async () => {
  const { repo, master } = cenarioHenriqueEJuliano()
  // O setor do cenário nasce sem token — dá pra gerar o link só depois de ter um.
  const setor = repo.equipes.find(e => e.id === 'eq-1')!
  setor.token = 'token-de-teste'

  await criarLinkCadastroIndividual(repo, master.id, 'ev-hj', 'eq-1', 'https://credenciei.app', () => 'tok-fixo')

  const linhas = await auditoria(repo, master.id)
  assert.equal(linhas[0]?.acao, 'REABERTURA_CADASTRO_INDIVIDUAL')
})

test('salvar permissão da organização grava auditoria', async () => {
  const { repo, master } = cenarioHenriqueEJuliano()
  await salvarPermissaoDaOrganizacao(repo, master.id, 'org-1', 'supervisor', 'escanear', true)

  const linhas = await auditoria(repo, master.id)
  assert.equal(linhas[0]?.acao, 'ALTERACAO_PERMISSAO')
  assert.equal(linhas[0]?.valorNovo, 'Liberado')
})

test('confirmar conferência de equipe grava auditoria, com os números', async () => {
  const { repo, admin, master } = cenarioHenriqueEJuliano()
  const DEPOIS = new Date('2026-09-04T20:00:00-03:00')
  await confirmarConferencia(repo, admin.id, 'eq-1', DEPOIS)

  const linhas = await auditoria(repo, master.id)
  assert.equal(linhas[0]?.acao, 'DESCREDENCIAMENTO')
  assert.match(linhas[0]?.valorNovo ?? '', /mantido/)
})

test('reabrir o turno no scanner grava auditoria', async () => {
  const { repo, admin } = cenarioHenriqueEJuliano()
  const SEGREDO = 'segredo-de-teste'
  const cracha = (fase: 'montagem' | 'evento' | 'desmontagem') => gerarCodigoQR(SEGREDO, 'token-do-joao', fase).codigo

  await registrarPorQr(repo, SEGREDO, null, admin.id, 'ev-hj', cracha('montagem'), new Date('2026-09-03T08:00:00-03:00'))
  await registrarPorQr(repo, SEGREDO, null, admin.id, 'ev-hj', cracha('montagem'), new Date('2026-09-03T18:00:00-03:00'))
  await registrarPorQr(repo, SEGREDO, null, admin.id, 'ev-hj', cracha('montagem'), new Date('2026-09-03T18:10:00-03:00'))

  const linhas = await auditoria(repo, admin.id)
  assert.equal(linhas[0]?.acao, 'REABERTURA_TURNO')
})

test('registro assistido grava auditoria, com ação diferente por etapa', async () => {
  const { repo, admin, master, participacao } = cenarioHenriqueEJuliano()
  await registrarPresencaAssistida(
    repo, admin.id, participacao.id,
    { tipo: 'entrada', fotoBase64: 'data:image/jpeg;base64,abc' },
    new Date('2026-09-05T19:00:00-03:00'),
  )
  await registrarPresencaAssistida(
    repo, admin.id, participacao.id,
    { tipo: 'meio', fotoBase64: 'data:image/jpeg;base64,abc' },
    new Date('2026-09-05T23:00:00-03:00'),
  )

  const acoes = (await auditoria(repo, master.id)).map(l => l.acao)
  assert.deepEqual(acoes, ['CORRECAO_PONTO', 'REGISTRO_ENTRADA_ASSISTIDA'])
})
