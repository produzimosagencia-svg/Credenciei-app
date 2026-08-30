/*
 * O telefone é a única porta de entrada do app.
 *
 * Um número recusado por engano é uma pessoa que não consegue entrar e não tem
 * a quem recorrer — não há senha nem e-mail alternativo. Por isso os testes
 * aqui puxam mais para o lado de ACEITAR o que a pessoa digitou de um jeito
 * diferente do esperado.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  apenasDigitos, mascararTelefone, semCodigoDoPais, telefoneParaEnvio, telefoneValido,
} from './telefone.js'

test('a máscara se monta enquanto a pessoa digita', () => {
  assert.equal(mascararTelefone(''), '')
  assert.equal(mascararTelefone('2'), '(2')
  assert.equal(mascararTelefone('27'), '(27')
  assert.equal(mascararTelefone('279'), '(27) 9')
  assert.equal(mascararTelefone('279992'), '(27) 9992')
  assert.equal(mascararTelefone('27999255959'), '(27) 99925-5959')
})

test('o traço cai num lugar no celular e noutro no fixo', () => {
  assert.equal(mascararTelefone('2733251234'), '(27) 3325-1234')
  assert.equal(mascararTelefone('27933251234'), '(27) 93325-1234')
})

test('quem colou o número com +55 não é recusado', () => {
  // É o caminho mais natural: copiar do próprio WhatsApp.
  assert.equal(semCodigoDoPais('5527999255959'), '27999255959')
  assert.equal(mascararTelefone('+55 27 99925-5959'), '(27) 99925-5959')
  assert.ok(telefoneValido('+55 (27) 99925-5959'))
  assert.equal(telefoneParaEnvio('+55 (27) 99925-5959'), '27999255959')
})

test('o corte do 55 não morde um número normal', () => {
  // 11 dígitos é número completo: nada a cortar, mesmo começando com 55.
  assert.equal(semCodigoDoPais('55999255959'), '55999255959')
  assert.equal(semCodigoDoPais('2755999255'), '2755999255')
})

test('falta de dígito é recusada antes de gastar uma mensagem', () => {
  assert.equal(telefoneValido('2799925595'), true, 'dez dígitos é fixo, e vale')
  assert.equal(telefoneValido('279992559'), false)
  assert.equal(telefoneValido('279992559591'), false)
  assert.equal(telefoneValido(''), false)
})

test('DDD que não existe é recusado', () => {
  assert.equal(telefoneValido('0799925595'), false)
  assert.equal(telefoneValido('1099925595'), false)
  assert.equal(telefoneValido('1199925595'), true)
})

test('celular sem o nono dígito é recusado', () => {
  // Onze dígitos e o terceiro não é 9: alguém digitou um a mais no fixo.
  assert.equal(telefoneValido('27833251234'), false)
  assert.equal(telefoneValido('27933251234'), true)
})

test('o que sai daqui para o servidor não tem máscara', () => {
  assert.equal(telefoneParaEnvio('(27) 99925-5959'), '27999255959')
  assert.equal(apenasDigitos('(27) 99925-5959'), '27999255959')
})
