/*
 * Quem consegue ENTRAR no sistema. O tema aqui: isolamento por organização
 * (o mesmo do resto da API), e a régua de criação — supervisor pede setor,
 * operador de portão e suporte não, e só o master cria suporte.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cenarioHenriqueEJuliano } from '../dados/memoria.js'
import {
  acessos, criarAcesso, editarSupervisor, eventosComSetores, excluirAcesso, mudarSituacaoDoAcesso,
  operadoresDoEvento, trocarSenhaDoAcesso,
} from './acessos.js'
import type { Evento } from '../dados/repositorio.js'

const NOVO_SUPERVISOR = {
  funcao: 'supervisor' as const,
  nome: 'Larissa Prado', cpf: '65498732100', telefone: '27999887766',
  eventoId: 'ev-hj', setorId: 'eq-1', ativo: true,
}

/** Uma segunda organização, com um evento e uma equipe próprios. */
function comSegundaOrganizacao() {
  const c = cenarioHenriqueEJuliano()
  const eventoDaOutra: Evento = { ...c.evento, id: 'ev-outra', organizacaoId: 'org-2', nome: 'Festa da Outra Empresa' }
  c.repo.eventos.push(eventoDaOutra)
  c.repo.equipes.push({ id: 'eq-outra', nome: 'Portaria', eventoId: 'ev-outra' })
  c.repo.organizacoes.push({
    id: 'org-2', nome: 'Outra Empresa', documento: null, responsavelNome: null,
    limiteEventos: 5, valorCobrado: null, valorCobradoPeriodo: null, ativo: true,
    criadaEm: '2025-01-01T00:00:00-03:00',
  })
  return { ...c, eventoDaOutra }
}

test('quem não pode gerenciar usuários não acessa nada aqui', async () => {
  const { repo, pessoa } = cenarioHenriqueEJuliano()
  await assert.rejects(() => acessos(repo, pessoa.id), /permissão/)
  await assert.rejects(() => criarAcesso(repo, pessoa.id, NOVO_SUPERVISOR), /permissão/)
  await assert.rejects(() => mudarSituacaoDoAcesso(repo, pessoa.id, 'x', false), /permissão/)
  await assert.rejects(() => eventosComSetores(repo, pessoa.id), /permissão/)
  await assert.rejects(() => trocarSenhaDoAcesso(repo, pessoa.id, 'x', 'senhaNova123'), /permissão/)
  await assert.rejects(() => excluirAcesso(repo, pessoa.id, 'x'), /permissão/)
})

// ─── Listar ─────────────────────────────────────────────────────────────────

test('admin vê só os acessos da própria organização, master vê os das duas', async () => {
  const { repo, admin, master } = comSegundaOrganizacao()
  await criarAcesso(repo, master.id, { ...NOVO_SUPERVISOR, eventoId: 'ev-outra', setorId: 'eq-outra' })

  // A organização do admin já tem duas contas no cenário (Marina Alves e a
  // suspensa) — a supervisora da OUTRA organização não pode aparecer aqui.
  const doAdmin = await acessos(repo, admin.id)
  assert.ok(!doAdmin.itens.some(a => a.nome === 'Larissa Prado'))

  const doMaster = await acessos(repo, master.id)
  assert.ok(doMaster.itens.some(a => a.nome === 'Larissa Prado'), 'master enxerga a outra organização também')
})

test('master nunca aparece na lista de acessos', async () => {
  const { repo, master } = cenarioHenriqueEJuliano()
  const lista = await acessos(repo, master.id)
  assert.ok(!lista.itens.some(a => a.papel === 'master'))
})

test('busca por nome ou CPF, e filtro por situação', async () => {
  const { repo, admin } = cenarioHenriqueEJuliano()
  await criarAcesso(repo, admin.id, NOVO_SUPERVISOR)
  await criarAcesso(repo, admin.id, { ...NOVO_SUPERVISOR, nome: 'Bruno Alves', cpf: '11144477735', ativo: false })

  const porNome = await acessos(repo, admin.id, { busca: 'Larissa' })
  assert.deepEqual(porNome.itens.map(a => a.nome), ['Larissa Prado'])

  const porCpf = await acessos(repo, admin.id, { busca: '654.987.321-00' })
  assert.deepEqual(porCpf.itens.map(a => a.nome), ['Larissa Prado'])

  const inativos = await acessos(repo, admin.id, { situacao: 'inativos' })
  // A conta suspensa do cenário já é inativa — Bruno se junta a ela.
  assert.deepEqual(inativos.itens.map(a => a.nome).sort(), ['Bruno Alves', 'Conta Bloqueada'])
})

// ─── Criar ──────────────────────────────────────────────────────────────────

test('nome curto, CPF incompleto e telefone inválido são recusados', async () => {
  const { repo, admin } = cenarioHenriqueEJuliano()
  assert.ok((await criarAcesso(repo, admin.id, { ...NOVO_SUPERVISOR, nome: 'La' })).erro)
  assert.ok((await criarAcesso(repo, admin.id, { ...NOVO_SUPERVISOR, cpf: '123' })).erro)
  assert.ok((await criarAcesso(repo, admin.id, { ...NOVO_SUPERVISOR, telefone: '123' })).erro)
})

test('supervisor sem setor escolhido é recusado', async () => {
  const { repo, admin } = cenarioHenriqueEJuliano()
  const r = await criarAcesso(repo, admin.id, { ...NOVO_SUPERVISOR, setorId: undefined })
  assert.match(r.erro ?? '', /Escolha o setor/)
})

test('setor de outro evento não é aceito', async () => {
  const { repo, admin } = comSegundaOrganizacao()
  const r = await criarAcesso(repo, admin.id, { ...NOVO_SUPERVISOR, setorId: 'eq-outra' })
  assert.match(r.erro ?? '', /Setor não encontrado/)
})

test('operador de portão nasce sem setor, preso ao evento inteiro', async () => {
  const { repo, admin } = cenarioHenriqueEJuliano()
  const r = await criarAcesso(repo, admin.id, {
    funcao: 'operador_portao', nome: 'Marcos Lima', cpf: '22233344455', telefone: '27999887766',
    eventoId: 'ev-hj', ativo: true,
  })
  assert.ok(r.acesso, r.erro)
  assert.equal(r.acesso?.papel, 'operador_portao')
  assert.equal(r.acesso?.setorNome, null)
})

test('só o master cria acesso de suporte', async () => {
  const { repo, admin, master } = cenarioHenriqueEJuliano()
  const dados = {
    funcao: 'suporte' as const, nome: 'Beatriz Nunes', cpf: '33344455566', telefone: '27999887766',
    eventoId: 'ev-hj', ativo: true, expiraEm: '2026-12-01',
  }
  const doAdmin = await criarAcesso(repo, admin.id, dados)
  assert.match(doAdmin.erro ?? '', /Só o master/)

  const doMaster = await criarAcesso(repo, master.id, dados)
  assert.ok(doMaster.acesso, doMaster.erro)
  assert.equal(doMaster.acesso?.expiraEm, '2026-12-01')
})

test('CPF repetido é recusado', async () => {
  const { repo, admin } = cenarioHenriqueEJuliano()
  assert.ok((await criarAcesso(repo, admin.id, NOVO_SUPERVISOR)).acesso)
  const r = await criarAcesso(repo, admin.id, { ...NOVO_SUPERVISOR, nome: 'Outra Pessoa' })
  assert.match(r.erro ?? '', /Já existe um acesso/)
})

test('admin não cria acesso em evento de outra organização', async () => {
  const { repo, admin } = comSegundaOrganizacao()
  const r = await criarAcesso(repo, admin.id, { ...NOVO_SUPERVISOR, eventoId: 'ev-outra', setorId: 'eq-outra' })
  assert.match(r.erro ?? '', /Sem permissão sobre este evento/)
})

test('a nova conta aparece na listagem, sem ser "eu" para quem criou', async () => {
  const { repo, admin } = cenarioHenriqueEJuliano()
  const r = await criarAcesso(repo, admin.id, NOVO_SUPERVISOR)
  assert.ok(r.acesso)
  assert.equal(r.acesso?.souEu, false)

  const lista = await acessos(repo, admin.id)
  const linha = lista.itens.find(a => a.id === r.acesso!.id)
  assert.equal(linha?.identificador, '654.987.321-00')
  assert.equal(linha?.setorNome, 'Produção')
})

// ─── Criar acesso de admin ──────────────────────────────────────────────────

const NOVO_ADMIN = {
  funcao: 'admin' as const,
  nome: 'Renata Dias', email: 'renata@produzimos.com.br', senha: 'segredo123', ativo: true,
}

test('admin adiciona outro admin na própria organização, entrando por e-mail', async () => {
  const { repo, admin } = cenarioHenriqueEJuliano()
  const r = await criarAcesso(repo, admin.id, NOVO_ADMIN)
  assert.ok(r.acesso, r.erro)
  assert.equal(r.acesso?.identificador, NOVO_ADMIN.email)
  assert.equal(r.acesso?.papel, 'admin')

  const perfilNovo = repo.perfis.find(p => p.email === NOVO_ADMIN.email)
  assert.equal(perfilNovo?.organizacaoId, 'org-1')
})

test('master escolhe a organização do admin novo', async () => {
  const { repo, master } = comSegundaOrganizacao()
  const r = await criarAcesso(repo, master.id, { ...NOVO_ADMIN, organizacaoId: 'org-2' })
  assert.ok(r.acesso, r.erro)

  const perfilNovo = repo.perfis.find(p => p.email === NOVO_ADMIN.email)
  assert.equal(perfilNovo?.organizacaoId, 'org-2')
})

test('master sem escolher organização é recusado', async () => {
  const { repo, master } = cenarioHenriqueEJuliano()
  const r = await criarAcesso(repo, master.id, NOVO_ADMIN)
  assert.match(r.erro ?? '', /Escolha a organização/)
})

test('e-mail inválido e senha curta são recusados', async () => {
  const { repo, admin } = cenarioHenriqueEJuliano()
  assert.match((await criarAcesso(repo, admin.id, { ...NOVO_ADMIN, email: 'nao-e-email' })).erro ?? '', /e-mail válido/)
  assert.match((await criarAcesso(repo, admin.id, { ...NOVO_ADMIN, senha: '123' })).erro ?? '', /ao menos 6 caracteres/)
})

// ─── Ativar / desativar ─────────────────────────────────────────────────────

test('ninguém desativa o próprio acesso', async () => {
  const { repo, admin } = cenarioHenriqueEJuliano()
  const r = await mudarSituacaoDoAcesso(repo, admin.id, admin.id, false)
  assert.match(r.erro ?? '', /não pode desativar o próprio acesso/)
})

test('admin não muda a situação de acesso de outra organização', async () => {
  const { repo, admin, master } = comSegundaOrganizacao()
  const criado = await criarAcesso(repo, master.id, { ...NOVO_SUPERVISOR, eventoId: 'ev-outra', setorId: 'eq-outra' })
  assert.ok(criado.acesso)

  const r = await mudarSituacaoDoAcesso(repo, admin.id, criado.acesso!.id, false)
  assert.match(r.erro ?? '', /Não encontramos este acesso/)
})

test('desativar e reativar funcionam, e refletem na listagem', async () => {
  const { repo, admin } = cenarioHenriqueEJuliano()
  const criado = await criarAcesso(repo, admin.id, NOVO_SUPERVISOR)
  assert.ok(criado.acesso)

  await mudarSituacaoDoAcesso(repo, admin.id, criado.acesso!.id, false)
  const inativos = await acessos(repo, admin.id, { situacao: 'inativos' })
  assert.ok(inativos.itens.some(a => a.id === criado.acesso!.id))

  await mudarSituacaoDoAcesso(repo, admin.id, criado.acesso!.id, true)
  const ativos = await acessos(repo, admin.id, { situacao: 'ativos' })
  assert.ok(ativos.itens.some(a => a.id === criado.acesso!.id))
})

// ─── Trocar senha ───────────────────────────────────────────────────────────

test('admin troca a senha de um supervisor da própria organização', async () => {
  const { repo, admin } = cenarioHenriqueEJuliano()
  const criado = await criarAcesso(repo, admin.id, NOVO_SUPERVISOR)
  const r = await trocarSenhaDoAcesso(repo, admin.id, criado.acesso!.id, 'senhaNova123')
  assert.equal(r.erro, undefined)
})

test('ninguém troca a própria senha por aqui', async () => {
  const { repo, admin } = cenarioHenriqueEJuliano()
  const r = await trocarSenhaDoAcesso(repo, admin.id, admin.id, 'senhaNova123')
  assert.match(r.erro ?? '', /configurações da conta/)
})

test('senha curta é recusada', async () => {
  const { repo, admin } = cenarioHenriqueEJuliano()
  const criado = await criarAcesso(repo, admin.id, NOVO_SUPERVISOR)
  const r = await trocarSenhaDoAcesso(repo, admin.id, criado.acesso!.id, '123')
  assert.match(r.erro ?? '', /ao menos 6 caracteres/)
})

test('admin não troca a senha de um master, nem de acesso de outra organização', async () => {
  const { repo, admin, master } = comSegundaOrganizacao()
  const r1 = await trocarSenhaDoAcesso(repo, admin.id, master.id, 'senhaNova123')
  assert.match(r1.erro ?? '', /Não encontramos este acesso/)

  const criado = await criarAcesso(repo, master.id, { ...NOVO_SUPERVISOR, eventoId: 'ev-outra', setorId: 'eq-outra' })
  const r2 = await trocarSenhaDoAcesso(repo, admin.id, criado.acesso!.id, 'senhaNova123')
  assert.match(r2.erro ?? '', /Não encontramos este acesso/)
})

test('quem não gerencia usuários não troca senha de ninguém', async () => {
  const { repo, pessoa, admin } = cenarioHenriqueEJuliano()
  await assert.rejects(() => trocarSenhaDoAcesso(repo, pessoa.id, admin.id, 'senhaNova123'), /permissão/)
})

// ─── Editar supervisor (nome, telefone, situação) ───────────────────────────

test('admin edita nome, telefone e situação de um supervisor da própria organização', async () => {
  const { repo, admin } = cenarioHenriqueEJuliano()
  const criado = await criarAcesso(repo, admin.id, NOVO_SUPERVISOR)

  const r = await editarSupervisor(repo, admin.id, criado.acesso!.id, {
    nome: 'Larissa Prado Souza', telefone: '27988776655', ativo: false,
  })
  assert.equal(r.erro, undefined)

  const [linha] = (await acessos(repo, admin.id)).itens.filter(a => a.id === criado.acesso!.id)
  assert.equal(linha?.nome, 'Larissa Prado Souza')
  assert.equal(linha?.ativo, false)
})

test('editar também grava o override de "Funções ligadas" — e não mexe se não vier', async () => {
  const { repo, admin } = cenarioHenriqueEJuliano()
  const criado = await criarAcesso(repo, admin.id, NOVO_SUPERVISOR)

  await editarSupervisor(repo, admin.id, criado.acesso!.id, {
    nome: 'Larissa Prado', telefone: '27999887766', ativo: true, permissoesUsuario: { escanear: true },
  })
  let linha = (await acessos(repo, admin.id)).itens.find(a => a.id === criado.acesso!.id)
  assert.deepEqual(linha?.permissoesUsuario, { escanear: true })

  // Editar de novo SEM mandar `permissoesUsuario` mantém o que já estava —
  // esta tela não é a única forma de mexer nisso, e sobrescrever com vazio
  // apagaria uma decisão tomada noutra tela sem ninguém ter pedido.
  await editarSupervisor(repo, admin.id, criado.acesso!.id, {
    nome: 'Larissa Prado Souza', telefone: '27999887766', ativo: true,
  })
  linha = (await acessos(repo, admin.id)).itens.find(a => a.id === criado.acesso!.id)
  assert.deepEqual(linha?.permissoesUsuario, { escanear: true })
})

test('telefone curto demais é recusado', async () => {
  const { repo, admin } = cenarioHenriqueEJuliano()
  const criado = await criarAcesso(repo, admin.id, NOVO_SUPERVISOR)
  const r = await editarSupervisor(repo, admin.id, criado.acesso!.id, {
    nome: 'Larissa Prado', telefone: '123', ativo: true,
  })
  assert.match(r.erro ?? '', /telefone válido/)
})

test('admin não edita acesso de outra organização, nem de um master', async () => {
  const { repo, admin, master } = comSegundaOrganizacao()
  const r1 = await editarSupervisor(repo, admin.id, master.id, { nome: 'X', telefone: '27999990000', ativo: true })
  assert.match(r1.erro ?? '', /Não encontramos este acesso/)

  const criado = await criarAcesso(repo, master.id, { ...NOVO_SUPERVISOR, eventoId: 'ev-outra', setorId: 'eq-outra' })
  const r2 = await editarSupervisor(repo, admin.id, criado.acesso!.id, { nome: 'X', telefone: '27999990000', ativo: true })
  assert.match(r2.erro ?? '', /Não encontramos este acesso/)
})

test('quem não gerencia usuários não edita ninguém', async () => {
  const { repo, pessoa, admin } = cenarioHenriqueEJuliano()
  await assert.rejects(() => editarSupervisor(repo, pessoa.id, admin.id, {
    nome: 'X', telefone: '27999990000', ativo: true,
  }), /permissão/)
})

// ─── Excluir acesso ─────────────────────────────────────────────────────────

test('só o master exclui — admin recebe a mesma explicação do site', async () => {
  const { repo, admin } = cenarioHenriqueEJuliano()
  const criado = await criarAcesso(repo, admin.id, NOVO_SUPERVISOR)
  const r = await excluirAcesso(repo, admin.id, criado.acesso!.id)
  assert.match(r.erro ?? '', /Só o master exclui/)

  // E o acesso continua na lista — a recusa não apagou nada.
  const lista = await acessos(repo, admin.id)
  assert.ok(lista.itens.some(a => a.id === criado.acesso!.id))
})

test('o master exclui, e o acesso some da lista e do CPF', async () => {
  const { repo, admin, master } = cenarioHenriqueEJuliano()
  const criado = await criarAcesso(repo, admin.id, NOVO_SUPERVISOR)

  const r = await excluirAcesso(repo, master.id, criado.acesso!.id)
  assert.equal(r.erro, undefined)

  const lista = await acessos(repo, admin.id)
  assert.ok(!lista.itens.some(a => a.id === criado.acesso!.id))
  assert.equal(await repo.acessoPorCpf(NOVO_SUPERVISOR.cpf), null)
})

test('nem o master se exclui', async () => {
  const { repo, master } = cenarioHenriqueEJuliano()
  const r = await excluirAcesso(repo, master.id, master.id)
  assert.match(r.erro ?? '', /não pode excluir o próprio acesso/)
})

// ─── Eventos com setores ────────────────────────────────────────────────────

test('eventosComSetores só traz eventos ativos, com os setores de cada um', async () => {
  const { repo, admin, evento } = cenarioHenriqueEJuliano()
  const encerrado: Evento = { ...evento, id: 'ev-encerrado', nome: 'Evento Encerrado', ativo: false }
  repo.eventos.push(encerrado)

  const r = await eventosComSetores(repo, admin.id)
  assert.deepEqual(r.map(e => e.eventoId), ['ev-hj'])
  assert.deepEqual(r[0]?.setores, [{ setorId: 'eq-1', nome: 'Produção' }])
})

// ─── Operadores de portão do evento ──────────────────────────────────────────

test('operadoresDoEvento traz só quem tem papel operador_portao, da mesma organização', async () => {
  const { repo, admin, evento } = cenarioHenriqueEJuliano()

  const operador = await criarAcesso(repo, admin.id, {
    funcao: 'operador_portao', nome: 'Rogério Batista', cpf: '65498732100', telefone: '27999887766',
    eventoId: evento.id, ativo: true,
  })
  assert.ok(operador.acesso, operador.erro)

  // Um supervisor no meio não deve aparecer na lista de operadores.
  await criarAcesso(repo, admin.id, {
    funcao: 'supervisor', nome: 'Larissa Prado', cpf: '11122233396', telefone: '27999990000',
    eventoId: evento.id, setorId: 'eq-1', ativo: true,
  })

  const r = await operadoresDoEvento(repo, admin.id, evento.id)
  assert.equal(r.length, 1)
  assert.equal(r[0]?.nome, 'Rogério Batista')
  assert.equal(r[0]?.papel, 'operador_portao')
})

test('admin de outra organização não vê operadores de um evento que não é seu', async () => {
  const { repo, master, evento } = comSegundaOrganizacao()
  repo.perfis.push({ id: 'auth-outro', nome: 'Bia', papel: 'admin', organizacaoId: 'org-2', ativo: true })

  await criarAcesso(repo, master.id, {
    funcao: 'operador_portao', nome: 'Rogério Batista', cpf: '65498732100', telefone: '27999887766',
    eventoId: evento.id, ativo: true,
  })

  await assert.rejects(operadoresDoEvento(repo, 'auth-outro', evento.id), /Não encontramos/)
})

test('quem não gerencia usuários não vê operadores de portão', async () => {
  const { repo, pessoa, evento } = cenarioHenriqueEJuliano()
  await assert.rejects(operadoresDoEvento(repo, pessoa.id, evento.id), /permissão/)
})
