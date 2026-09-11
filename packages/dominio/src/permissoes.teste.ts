/*
 * As permissões decidem duas coisas ao mesmo tempo: o que aparece no menu do
 * app e o que a API aceita. Por isso o teste mais importante deste arquivo não
 * é sobre quem PODE — é sobre o colaborador, que não pode nada.
 *
 * Um papel novo que caísse por engano dentro de um `podeX` daria acesso de
 * painel a vinte mil pessoas contratadas por um dia.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ehDePainel, ehMaster, ehSuporte, NOME_DO_PAPEL, podeAcompanhar, podeBloquearCpf,
  podeEscanear, podeExcluir, podeGerenciarEventos, podeGerenciarOrganizacoes,
  podeGerenciarUsuarios, podeGerenciarVeiculos, veTodosEventos, type Papel,
} from './permissoes.js'

const TODOS: Papel[] = [
  'master', 'admin', 'supervisor', 'operador_portao', 'suporte', 'gerente', 'cliente', 'colaborador',
]

const PODERES = [
  ehMaster, veTodosEventos, podeGerenciarOrganizacoes, podeGerenciarUsuarios,
  podeGerenciarEventos, podeExcluir, podeEscanear, podeAcompanhar, podeGerenciarVeiculos,
  podeBloquearCpf,
]

test('o colaborador não pode NADA do painel', () => {
  /*
   * Este é o teste que protege o sistema inteiro. O colaborador é o único papel
   * que existe às dezenas de milhares, e é o único que entra por um caminho sem
   * senha — um código de seis dígitos no WhatsApp.
   *
   * Se ele escorregar para dentro de qualquer `podeX`, um crachá vira um painel
   * de administração.
   */
  for (const poder of PODERES) {
    assert.equal(poder('colaborador'), false, `${poder.name} deixou o colaborador passar`)
  }
  assert.equal(ehDePainel('colaborador'), false)
})

test('papel desconhecido não pode nada', () => {
  // Vale para papel novo no banco, papel escrito errado e ausência de papel.
  for (const poder of PODERES) {
    assert.equal(poder(undefined), false, `${poder.name} aceitou papel ausente`)
    assert.equal(poder(''), false, `${poder.name} aceitou papel vazio`)
    assert.equal(poder('Master'), false, `${poder.name} aceitou papel com maiúscula`)
    assert.equal(poder('dono'), false, `${poder.name} aceitou papel inventado`)
  }
})

test('só o master exclui, e só o master mexe em organização', () => {
  for (const papel of TODOS) {
    const esperado = papel === 'master'
    assert.equal(podeExcluir(papel), esperado, `podeExcluir(${papel})`)
    assert.equal(podeGerenciarOrganizacoes(papel), esperado, `podeGerenciarOrganizacoes(${papel})`)
    assert.equal(veTodosEventos(papel), esperado, `veTodosEventos(${papel})`)
  }
})

test('o supervisor acompanha, mas não escaneia', () => {
  /*
   * Foi decisão do Juan, e é a mesma separação que as mensagens já dizem à
   * equipe: "vá ao credenciamento", e não "procure seu supervisor". Tirar o
   * scanner dele não pode cegá-lo em relação à própria equipe — daí acompanhar
   * continuar liberado.
   */
  assert.equal(podeEscanear('supervisor'), false)
  assert.equal(podeAcompanhar('supervisor'), true)
})

test('quem escaneia também acompanha', () => {
  // Acompanhar é mais fraco que escanear: quem registra presença precisa
  // poder olhar quem já registrou.
  for (const papel of TODOS) {
    if (podeEscanear(papel)) {
      assert.equal(podeAcompanhar(papel), true, `${papel} escaneia mas não acompanha`)
    }
  }
})

test('gerente é tratado como administrador', () => {
  // Papel legado: continua no banco, e continua valendo o mesmo que admin.
  assert.equal(podeGerenciarUsuarios('gerente'), podeGerenciarUsuarios('admin'))
  assert.equal(podeGerenciarEventos('gerente'), podeGerenciarEventos('admin'))
  assert.equal(podeEscanear('gerente'), podeEscanear('admin'))
})

test('o cliente cria e escaneia, mas não mexe em quem tem acesso', () => {
  assert.equal(podeGerenciarEventos('cliente'), true)
  assert.equal(podeEscanear('cliente'), true)
  assert.equal(podeGerenciarUsuarios('cliente'), false)
})

test('o operador de portão escaneia, mas não gerencia nada', () => {
  // É o posto de credenciamento em si — não precisa de senha de admin pra
  // registrar presença, e não pode criar evento, setor ou acesso.
  assert.equal(podeEscanear('operador_portao'), true)
  assert.equal(podeAcompanhar('operador_portao'), true)
  assert.equal(podeGerenciarEventos('operador_portao'), false)
  assert.equal(podeGerenciarUsuarios('operador_portao'), false)
  assert.equal(ehDePainel('operador_portao'), true)
})

test('o suporte acompanha, mas não escaneia nem administra', () => {
  // Corrige a operação (ver Epic 17 — corrigir CPF, veículos); nunca
  // administra: não cria evento, não gerencia acessos.
  assert.equal(ehSuporte('suporte'), true)
  assert.equal(podeEscanear('suporte'), false)
  assert.equal(podeAcompanhar('suporte'), true)
  assert.equal(podeGerenciarEventos('suporte'), false)
  assert.equal(podeGerenciarUsuarios('suporte'), false)
  assert.equal(ehDePainel('suporte'), true)
})

test('veículos: master, admin e suporte gerenciam — o resto não', () => {
  // Mais estreito que podeGerenciarEventos de propósito: gerente e cliente
  // gerenciam evento mas não respondem pelo portão.
  for (const papel of TODOS) {
    const esperado = papel === 'master' || papel === 'admin' || papel === 'suporte'
    assert.equal(podeGerenciarVeiculos(papel), esperado, `podeGerenciarVeiculos(${papel})`)
  }
})

test('bloquear CPF: quem gerencia evento, supervisor e suporte — não o operador de portão', () => {
  // Operador de portão lê o QR, não decide quem pode se cadastrar.
  for (const papel of TODOS) {
    const esperado = podeGerenciarEventos(papel) || papel === 'supervisor' || papel === 'suporte'
    assert.equal(podeBloquearCpf(papel), esperado, `podeBloquearCpf(${papel})`)
  }
  assert.equal(podeBloquearCpf('operador_portao'), false)
})

test('todo papel tem um nome para mostrar na tela', () => {
  for (const papel of TODOS) {
    assert.ok(NOME_DO_PAPEL[papel], `falta o nome de ${papel}`)
  }
})
