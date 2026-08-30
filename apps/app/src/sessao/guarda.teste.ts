/*
 * A sessão é o que separa a pessoa da própria credencial.
 *
 * Cada teste aqui corresponde a um jeito conhecido de trancar alguém para fora
 * do próprio app — e o app trancado é pior que o app fora do ar, porque a
 * pessoa está no portão, com o celular na mão, e não tem a quem recorrer.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Sessao } from '@credenciei/contrato'
import { GuardaDaSessao, type Cofre } from './guarda.js'

const AGORA = Date.parse('2026-09-05T12:00:00-03:00')

function cofreEmMemoria(inicial: Record<string, string> = {}) {
  const dados = new Map(Object.entries(inicial))
  return {
    dados,
    ler: async (c: string) => dados.get(c) ?? null,
    gravar: async (c: string, v: string) => { dados.set(c, v) },
    apagar: async (c: string) => { dados.delete(c) },
  } satisfies Cofre & { dados: Map<string, string> }
}

function sessao(p: Partial<Sessao> = {}): Sessao {
  return {
    token: 'token-1',
    expiraEm: new Date(AGORA + 3600e3).toISOString(),
    renovacao: 'renovacao-1',
    papel: 'colaborador',
    ...p,
  }
}

/** O cofre já com uma sessão dentro, como fica depois de a pessoa entrar. */
function comSessaoGuardada(s: Sessao = sessao()) {
  return cofreEmMemoria({ 'credenciei.sessao': JSON.stringify(s) })
}

/** Uma sessão que já venceu — o gatilho da renovação. */
function vencida() {
  return sessao({ expiraEm: new Date(AGORA).toISOString() })
}

// ─── Guardar e reabrir ──────────────────────────────────────────────────────

test('sem nada guardado, não há sessão', async () => {
  const g = new GuardaDaSessao({
    cofre: cofreEmMemoria(),
    renovar: async () => assert.fail('não era para tentar renovar sem sessão'),
    agora: () => AGORA,
  })
  assert.equal(await g.carregar(), null)
  assert.deepEqual(await g.credencial(), { ok: false, motivo: 'sem-sessao' })
})

test('o que foi guardado volta na abertura seguinte', async () => {
  const cofre = cofreEmMemoria()
  const primeira = new GuardaDaSessao({ cofre, renovar: async () => ({}), agora: () => AGORA })
  await primeira.abrir(sessao())

  // Outro objeto: é o app sendo aberto de novo.
  const segunda = new GuardaDaSessao({ cofre, renovar: async () => ({}), agora: () => AGORA })
  assert.equal((await segunda.carregar())?.token, 'token-1')
})

test('sessão corrompida no aparelho não impede o app de abrir', async () => {
  /*
   * Armazenamento de celular corrompe de verdade: atualização interrompida,
   * disco cheio, troca de aparelho. Se ler quebrasse, o app não abriria nunca
   * mais e a única saída seria desinstalar.
   */
  const lixos = [
    'isto nao e json',
    '{}',
    'null',
    '{"token":"x"}',
    '{"token":"x","expiraEm":"ontem","renovacao":"y","papel":"colaborador"}',
  ]
  for (const lixo of lixos) {
    const g = new GuardaDaSessao({
      cofre: cofreEmMemoria({ 'credenciei.sessao': lixo }),
      renovar: async () => assert.fail('não era para tentar renovar'),
      agora: () => AGORA,
    })
    assert.equal(await g.carregar(), null, `deveria ignorar: ${lixo}`)
  }
})

test('sair apaga do aparelho, e não só da memória', async () => {
  const cofre = comSessaoGuardada()
  const g = new GuardaDaSessao({ cofre, renovar: async () => ({}), agora: () => AGORA })
  await g.carregar()
  await g.sair()

  assert.equal(cofre.dados.size, 0)
  const depois = new GuardaDaSessao({ cofre, renovar: async () => ({}), agora: () => AGORA })
  assert.equal(await depois.carregar(), null)
})

// ─── Renovação ──────────────────────────────────────────────────────────────

test('token com folga não gasta uma renovação', async () => {
  let chamou = 0
  const g = new GuardaDaSessao({
    cofre: comSessaoGuardada(),
    renovar: async () => { chamou++; return { sessao: sessao() } },
    agora: () => AGORA,
  })

  assert.deepEqual(await g.credencial(), { ok: true, token: 'token-1' })
  assert.equal(chamou, 0)
})

test('token perto de vencer é renovado antes de a chamada sair', async () => {
  // Trinta segundos de sobra: ainda não venceu, mas não cabe uma chamada numa
  // rede de evento. Renovar no segundo do vencimento chegaria tarde.
  const quaseVencido = sessao({ expiraEm: new Date(AGORA + 30_000).toISOString() })
  const g = new GuardaDaSessao({
    cofre: comSessaoGuardada(quaseVencido),
    renovar: async () => ({ sessao: sessao({ token: 'token-2', renovacao: 'renovacao-2' }) }),
    agora: () => AGORA,
  })

  assert.deepEqual(await g.credencial(), { ok: true, token: 'token-2' })
})

test('a renovação nova é gravada antes de o token novo ser usado', async () => {
  /*
   * O servidor gira o token longo: ao entregar o novo, mata o antigo. Se o app
   * usasse o token curto novo e morresse antes de gravar, sobraria no aparelho
   * um token longo que o servidor já invalidou — conta perdida por causa de um
   * fechamento de app.
   */
  const cofre = comSessaoGuardada(vencida())
  const g = new GuardaDaSessao({
    cofre,
    renovar: async () => ({ sessao: sessao({ token: 'token-2', renovacao: 'renovacao-2' }) }),
    agora: () => AGORA,
  })
  await g.credencial()

  const guardado = JSON.parse(cofre.dados.get('credenciei.sessao') ?? '{}')
  assert.equal(guardado.renovacao, 'renovacao-2')
})

test('duas telas pedindo ao mesmo tempo renovam uma vez só', async () => {
  /*
   * O token longo gira. Duas renovações em paralelo mandariam o mesmo token
   * duas vezes, e a segunda voltaria recusada — derrubando uma sessão viva.
   */
  let chamou = 0
  const g = new GuardaDaSessao({
    cofre: comSessaoGuardada(vencida()),
    renovar: async (r) => {
      chamou++
      assert.equal(r, 'renovacao-1', 'a segunda chamada mandaria um token já queimado')
      await new Promise(res => setTimeout(res, 10))
      return { sessao: sessao({ token: 'token-2', renovacao: 'renovacao-2' }) }
    },
    agora: () => AGORA,
  })

  const [a, b, c] = await Promise.all([g.credencial(), g.credencial(), g.credencial()])
  assert.equal(chamou, 1)
  assert.deepEqual(a, { ok: true, token: 'token-2' })
  assert.deepEqual(b, a)
  assert.deepEqual(c, a)
})

test('depois de renovar, a próxima chamada já usa o token novo', async () => {
  let chamou = 0
  const g = new GuardaDaSessao({
    cofre: comSessaoGuardada(vencida()),
    renovar: async () => {
      chamou++
      return { sessao: sessao({ token: 'token-2', renovacao: 'renovacao-2' }) }
    },
    agora: () => AGORA,
  })

  await g.credencial()
  assert.deepEqual(await g.credencial(), { ok: true, token: 'token-2' })
  assert.equal(chamou, 1)
})

// ─── O que separa recusa de falta de rede ───────────────────────────────────

test('sem rede, a sessão CONTINUA guardada', async () => {
  /*
   * Este é o teste mais importante do arquivo.
   *
   * Para entrar de novo, a pessoa precisa receber um código no WhatsApp — o que
   * exige a internet que ela não tem. Apagar a sessão aqui a trancaria para
   * fora do próprio crachá, no portão, sem saída.
   */
  const cofre = comSessaoGuardada(vencida())
  const g = new GuardaDaSessao({
    cofre,
    renovar: async () => { throw new Error('Sem conexão') },
    agora: () => AGORA,
  })

  assert.deepEqual(await g.credencial(), { ok: false, motivo: 'sem-rede' })
  assert.ok(cofre.dados.has('credenciei.sessao'), 'a sessão não podia ter sido apagada')
  assert.equal(g.atual()?.renovacao, 'renovacao-1')
})

test('quando a rede volta, a mesma sessão renova normalmente', async () => {
  let temRede = false
  const g = new GuardaDaSessao({
    cofre: comSessaoGuardada(vencida()),
    renovar: async () => {
      if (!temRede) throw new Error('Sem conexão')
      return { sessao: sessao({ token: 'token-2', renovacao: 'renovacao-2' }) }
    },
    agora: () => AGORA,
  })

  assert.deepEqual(await g.credencial(), { ok: false, motivo: 'sem-rede' })
  temRede = true
  assert.deepEqual(await g.credencial(), { ok: true, token: 'token-2' })
})

test('renovação recusada pelo servidor apaga a sessão e pede login', async () => {
  // Aqui sim: o servidor DISSE que não vale. Insistir não muda, e manter uma
  // sessão morta faria toda chamada falhar sem a pessoa entender por quê.
  const cofre = comSessaoGuardada(vencida())
  const g = new GuardaDaSessao({
    cofre,
    renovar: async () => ({ erro: 'Sessão expirada. Entre de novo.' }),
    agora: () => AGORA,
  })

  assert.deepEqual(await g.credencial(), { ok: false, motivo: 'sem-sessao' })
  assert.equal(cofre.dados.size, 0)
})

test('quem está ouvindo é avisado quando a sessão cai', async () => {
  const vistos: (string | null)[] = []
  const g = new GuardaDaSessao({
    cofre: comSessaoGuardada(vencida()),
    renovar: async () => ({ erro: 'não vale' }),
    agora: () => AGORA,
  })
  g.assinar(s => vistos.push(s?.token ?? null))

  await g.credencial()
  assert.deepEqual(vistos, ['token-1', null])
})
