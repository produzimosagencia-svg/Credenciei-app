/*
 * O menu é a primeira coisa que uma pessoa vê do que ela pode fazer.
 *
 * Um item a mais aqui não abre porta nenhuma — quem recusa é o servidor —, mas
 * cria a pior experiência possível: a pessoa toca no botão e leva um "não". O
 * menu e a permissão precisam contar a mesma história.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { abasDe, menuDe, menuDoPainel, temMaisAlemDasAbas } from './menu.js'

const rotulos = (papel: string) =>
  menuDe(papel).flatMap(g => g.itens).map(i => i.rotulo)

test('o colaborador só vê o que é dele', () => {
  const dele = rotulos('colaborador')
  assert.deepEqual(dele, [
    'Meus eventos', 'Minha credencial', 'Meus dias', 'Meu pagamento', 'Meu histórico', 'Avisos',
  ])

  // Nenhum item de operação. Este é o teste que impede vinte mil contas de um
  // dia de verem a tela de quem administra o evento.
  for (const proibido of ['Painel', 'Escanear QR', 'Acessos', 'Organizações', 'WhatsApp']) {
    assert.equal(dele.includes(proibido), false, `colaborador não podia ver ${proibido}`)
  }
})

test('o supervisor acompanha, mas não tem Escanear QR', () => {
  // Foi decisão do Juan: quem credencia é o posto de credenciamento. O menu
  // precisa dizer o mesmo que a permissão, senão ele toca e leva um "não".
  const dele = rotulos('supervisor')
  assert.equal(dele.includes('Escanear QR'), false)
  assert.equal(dele.includes('Registrar ponto'), true)
  assert.equal(dele.includes('Atividades do evento'), true)
})

test('o supervisor não gerencia acessos nem vê Plataforma', () => {
  const dele = rotulos('supervisor')
  assert.equal(dele.includes('Acessos'), false)
  assert.equal(menuDoPainel('supervisor').some(g => g.titulo === 'Plataforma'), false)
})

test('só o master vê o bloco Plataforma', () => {
  for (const papel of ['admin', 'gerente', 'cliente', 'supervisor']) {
    assert.equal(
      menuDoPainel(papel).some(g => g.titulo === 'Plataforma'),
      false,
      `${papel} não podia ver Plataforma`,
    )
  }
  assert.equal(menuDoPainel('master').some(g => g.titulo === 'Plataforma'), true)
})

test('o bloco do dia a dia não tem título, e o da Plataforma tem', () => {
  // Agrupar só vale quando o grupo tem nome. O primeiro bloco conta a sequência
  // do dia sozinho, e um cabeçalho no meio quebraria a leitura.
  const doMaster = menuDoPainel('master')
  assert.equal(doMaster[0]?.titulo, undefined)
  assert.equal(doMaster[1]?.titulo, 'Plataforma')
})

test('o painel é sempre o primeiro item de quem tem painel', () => {
  for (const papel of ['master', 'admin', 'gerente', 'cliente', 'supervisor']) {
    assert.equal(menuDoPainel(papel)[0]?.itens[0]?.rotulo, 'Painel', papel)
  }
})

test('as abas são três, e saem do começo do menu', () => {
  // Cinco abas com rótulo espremido ficam ilegíveis no celular. As três
  // primeiras já são a ordem do trabalho de um dia.
  for (const papel of ['master', 'admin', 'supervisor', 'colaborador']) {
    const abas = abasDe(papel)
    assert.ok(abas.length <= 3, `${papel} ficou com ${abas.length} abas`)
    assert.deepEqual(
      abas.map(a => a.rotulo),
      rotulos(papel).slice(0, abas.length),
      papel,
    )
  }
})

test('quem tem item fora das abas ganha o "Mais"', () => {
  assert.equal(temMaisAlemDasAbas('master'), true)
  assert.equal(temMaisAlemDasAbas('colaborador'), true)
})

test('toda rota do menu é única', () => {
  // Duas entradas para a mesma rota deixariam duas abas acesas ao mesmo tempo.
  for (const papel of ['master', 'admin', 'supervisor', 'colaborador']) {
    const rotas = menuDe(papel).flatMap(g => g.itens).map(i => i.rota)
    assert.equal(new Set(rotas).size, rotas.length, `${papel} tem rota repetida`)
  }
})

test('quem gerencia usuários vê a trilha de auditoria; supervisor não', () => {
  assert.equal(rotulos('master').includes('Trilha de auditoria'), true)
  assert.equal(rotulos('admin').includes('Trilha de auditoria'), true)
  assert.equal(rotulos('supervisor').includes('Trilha de auditoria'), false)
})

test('só o master vê Configurações', () => {
  assert.equal(rotulos('master').includes('Configurações'), true)
  for (const papel of ['admin', 'supervisor', 'colaborador']) {
    assert.equal(rotulos(papel).includes('Configurações'), false, papel)
  }
})

test('o menu reage ao override — supervisor com "escanear" ligado pela organização ganha Escanear QR', () => {
  const semOverride = rotulos('supervisor')
  assert.equal(semOverride.includes('Escanear QR'), false)

  const comOverride = menuDe({
    papel: 'supervisor', permissoesOrganizacao: { 'supervisor:escanear': true },
  }).flatMap(g => g.itens).map(i => i.rotulo)
  assert.equal(comOverride.includes('Escanear QR'), true)
})
