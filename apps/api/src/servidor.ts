// O servidor HTTP.
//
// ─── ELE É FINO DE PROPÓSITO ────────────────────────────────────────────────
//
// Nenhuma regra mora aqui. Este arquivo só traduz HTTP para chamadas de função
// e de volta — a decisão de quem pode o quê está nas rotas, e a de quando se
// pode bater ponto está no domínio.
//
// A razão é testabilidade: tudo que importa já roda em teste sem subir
// servidor, sem porta e sem banco. Se as regras estivessem aqui dentro, cada
// teste precisaria de uma requisição HTTP de verdade — e os 56 testes da API
// levariam minutos em vez de milissegundos.
//
// ─── A AUTENTICAÇÃO ─────────────────────────────────────────────────────────
//
// Toda rota abaixo de /v1, tirando o login, exige um token. O middleware
// resolve o token em `pessoaId` e é ele que as rotas recebem — nenhuma rota lê
// id de pessoa do corpo ou da URL. É o que fecha a porta do IDOR por
// construção, e não por disciplina.

import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { Papel } from '@credenciei/dominio'
import type { Sessoes } from './sessoes.js'
import type { Repositorio } from './dados/repositorio.js'
import type { Dependencias as DepSessao } from './rotas/sessao.js'
import { entrar, entrarComSenha, pedirCodigo } from './rotas/sessao.js'
import { registrarBatida } from './rotas/batidas.js'
import { painelDaEquipe } from './rotas/equipe.js'
import { painel } from './rotas/painel.js'
import { conferirPorCpf, eventosParaEscanear, registrarPorQr } from './rotas/escanear.js'
import { abrirFicha, localizarPessoa, registrarPresencaAssistida } from './rotas/ponto-assistido.js'
import { atividades, eventosParaAcompanhar } from './rotas/atividades.js'
import type { VisaoDeAtividade } from '@credenciei/contrato'
import {
  consultarConvite, entrarNoEvento, meuFinanceiro, meuQr, meusDias,
  minhasParticipacoes, type FonteDeCampos,
} from './rotas/eventos.js'

export type Ambiente = {
  repo: Repositorio
  sessoes: Sessoes
  sessao: DepSessao
  campos: FonteDeCampos
  segredoQr: string
  novoToken: () => string
}

type Variaveis = { pessoaId: string; papel: Papel }

export function criarServidor(amb: Ambiente) {
  const app = new Hono<{ Variables: Variaveis }>()

  app.use('*', cors())

  app.get('/saude', c => c.json({ ok: true, em: new Date().toISOString() }))

  // ── Login: as únicas rotas sem token ────────────────────────────────────
  app.post('/v1/entrar/codigo', async c => {
    const { telefone } = await c.req.json<{ telefone?: string }>()
    return c.json(await pedirCodigo(amb.sessao, telefone ?? ''))
  })

  app.post('/v1/entrar', async c => {
    const { telefone, codigo } = await c.req.json<{ telefone?: string; codigo?: string }>()
    const r = await entrar(amb.sessao, telefone ?? '', codigo ?? '')
    if (!r.ok) return c.json({ erro: r.erro }, 401)
    return c.json({ sessao: await amb.sessoes.abrir(r.pessoaId, 'colaborador') })
  })

  /*
   * O caminho de quem tem conta de painel: CPF (supervisor), e-mail
   * (admin/master) ou o nome de usuário antigo — mais senha. Existe em
   * paralelo ao de cima porque são duas populações diferentes: dezenas de
   * pessoas com conta permanente, e dezenas de MILHARES contratadas por um
   * dia, que não vão criar nem lembrar de senha nenhuma.
   */
  app.post('/v1/entrar/senha', async c => {
    const { identificador, senha } = await c.req.json<{ identificador?: string; senha?: string }>()
    const r = await entrarComSenha(amb.sessao, identificador ?? '', senha ?? '')
    if (!r.ok) return c.json({ erro: r.erro }, 401)
    return c.json({ sessao: await amb.sessoes.abrir(r.pessoaId, r.papel) })
  })

  app.post('/v1/renovar', async c => {
    const { renovacao } = await c.req.json<{ renovacao?: string }>()
    const s = await amb.sessoes.renovar(renovacao ?? '')
    if (!s) return c.json({ erro: 'Sessão expirada. Entre de novo.' }, 401)
    return c.json({ sessao: s })
  })

  // ── Daqui para baixo, tudo exige token ──────────────────────────────────
  app.use('/v1/*', async (c, next) => {
    if (c.req.path.startsWith('/v1/entrar') || c.req.path === '/v1/renovar') return next()

    const cabecalho = c.req.header('Authorization') ?? ''
    const token = cabecalho.startsWith('Bearer ') ? cabecalho.slice(7) : ''
    const s = await amb.sessoes.sessaoDoToken(token)
    if (!s) return c.json({ erro: 'Sessão expirada. Entre de novo.' }, 401)

    c.set('pessoaId', s.pessoaId)
    c.set('papel', s.papel)
    return next()
  })

  app.get('/v1/eu', async c => {
    const papel = c.get('papel')

    /*
     * Colaborador é `Pessoa`; quem tem conta de painel é `Perfil` — são
     * tabelas diferentes, e um id de uma nunca bate na outra. `/v1/eu`
     * decide qual buscar pelo papel da SESSÃO (nunca por tentar as duas e
     * ver qual responde: isso deixaria uma pessoa ler o perfil de outra se
     * os ids colidissem por acaso).
     */
    if (papel === 'colaborador') {
      const p = await amb.repo.pessoaPorId(c.get('pessoaId'))
      if (!p) return c.json({ erro: 'Conta não encontrada.' }, 404)
      return c.json({
        pessoaId: p.id,
        nome: p.nome,
        // Só os últimos dígitos: a tela confirma a identidade sem trafegar o CPF.
        cpfFinal: `**${(p.cpf ?? '').slice(-2)}`,
        telefone: p.telefone,
        fotoUrl: p.fotoPath,
        papel,
      })
    }

    const perfil = await amb.repo.perfilPorId(c.get('pessoaId'))
    if (!perfil) return c.json({ erro: 'Conta não encontrada.' }, 404)
    return c.json({
      pessoaId: perfil.id,
      nome: perfil.nome,
      // Quem tem conta de painel entra por e-mail ou CPF-usuário, não por
      // CPF exibido em tela — as telas que mostram `cpfFinal` são do
      // colaborador, e o menu já nem oferece esse caminho a este papel.
      cpfFinal: '',
      telefone: null,
      fotoUrl: null,
      papel: perfil.papel,
    })
  })

  // ── Entrar num evento ───────────────────────────────────────────────────
  app.get('/v1/convites/:codigo', async c => {
    const r = await consultarConvite(amb.repo, amb.campos, c.get('pessoaId'), c.req.param('codigo'))
    return r.erro ? c.json({ erro: r.erro }, 400) : c.json(r.convite)
  })

  app.post('/v1/participacoes', async c => {
    const { codigo, respostas } = await c.req.json<{ codigo?: string; respostas?: Record<string, string> }>()
    const r = await entrarNoEvento(
      amb.repo, amb.campos, c.get('pessoaId'), codigo ?? '', respostas ?? {}, amb.novoToken,
    )
    return r.erro ? c.json({ erro: r.erro }, 400) : c.json(r.participacao, 201)
  })

  // ── O que é meu ─────────────────────────────────────────────────────────
  app.get('/v1/participacoes', async c =>
    c.json(await minhasParticipacoes(amb.repo, c.get('pessoaId'))))

  app.get('/v1/participacoes/:id/dias', async c =>
    protegido(c, () => meusDias(amb.repo, c.get('pessoaId'), c.req.param('id'))))

  app.get('/v1/participacoes/:id/financeiro', async c =>
    protegido(c, () => meuFinanceiro(amb.repo, c.get('pessoaId'), c.req.param('id'))))

  app.get('/v1/participacoes/:id/qr', async c =>
    protegido(c, () => meuQr(amb.repo, amb.segredoQr, c.get('pessoaId'), c.req.param('id'))))

  // ── Bater ponto ─────────────────────────────────────────────────────────
  app.post('/v1/batidas', async c => {
    const corpo = await c.req.json<{
      id?: string; participacaoId?: string; tipo?: string
      registradoEm?: string; fotoPath?: string; lat?: number; lng?: number
    }>()

    if (!corpo.id || !corpo.participacaoId || !corpo.registradoEm) {
      return c.json({ erro: 'Pedido incompleto.' }, 400)
    }
    if (corpo.tipo !== 'entrada' && corpo.tipo !== 'meio' && corpo.tipo !== 'fim') {
      return c.json({ erro: 'Etapa inválida.' }, 400)
    }

    const r = await registrarBatida(amb.repo, c.get('pessoaId'), {
      id: corpo.id,
      participacaoId: corpo.participacaoId,
      tipo: corpo.tipo,
      registradoEm: corpo.registradoEm,
      fotoPath: corpo.fotoPath ?? null,
      lat: corpo.lat ?? null,
      lng: corpo.lng ?? null,
    })

    /*
     * Recusa devolve 422, não 400 nem 500.
     *
     * A distinção importa para a fila offline: 4xx que não seja 408/429 é
     * DECISÃO — reenviar não muda nada, e ela descarta e explica. Erro de rede
     * ou 5xx é transporte, e ela guarda e tenta de novo. Devolver 500 numa
     * recusa faria o aparelho insistir para sempre em algo que nunca vai passar.
     */
    return c.json(r, r.situacao === 'recusado' ? 422 : 200)
  })

  // ── Supervisor ──────────────────────────────────────────────────────────
  app.get('/v1/equipe', async c =>
    protegido(c, () => painelDaEquipe(amb.repo, c.get('pessoaId'))))

  // ── Painel ──────────────────────────────────────────────────────────────
  app.get('/v1/painel', async c =>
    protegido(c, () => painel(amb.repo, c.get('pessoaId'))))

  // ── Escanear QR ─────────────────────────────────────────────────────────
  app.get('/v1/escanear/eventos', async c =>
    protegido(c, () => eventosParaEscanear(amb.repo, c.get('pessoaId'))))

  app.post('/v1/escanear/:eventoId', async c => {
    const { codigo } = await c.req.json<{ codigo?: string }>()
    return protegido(c, () => registrarPorQr(
      amb.repo, amb.segredoQr, c.get('pessoaId'), c.req.param('eventoId'), codigo ?? '',
    ))
  })

  app.post('/v1/escanear/:eventoId/cpf', async c => {
    const { cpf } = await c.req.json<{ cpf?: string }>()
    return protegido(c, () => conferirPorCpf(
      amb.repo, c.get('pessoaId'), c.req.param('eventoId'), cpf ?? '',
    ))
  })

  // ── Registrar ponto por outra pessoa ────────────────────────────────────
  app.get('/v1/localizar', async c =>
    protegido(c, () => localizarPessoa(amb.repo, c.get('pessoaId'), c.req.query('termo') ?? '')))

  app.get('/v1/localizar/:participacaoId', async c =>
    protegido(c, () => abrirFicha(amb.repo, c.get('pessoaId'), c.req.param('participacaoId'))))

  app.post('/v1/localizar/:participacaoId/presenca', async c => {
    const corpo = await c.req.json<{
      tipo?: string; fotoBase64?: string; lat?: number; lng?: number; dispositivo?: string; motivo?: string
    }>()
    const tipo = corpo.tipo
    if (tipo !== 'entrada' && tipo !== 'meio' && tipo !== 'fim') {
      return c.json({ erro: 'Etapa inválida.' }, 400)
    }
    return protegido(c, () => registrarPresencaAssistida(amb.repo, c.get('pessoaId'), c.req.param('participacaoId'), {
      tipo,
      fotoBase64: corpo.fotoBase64 ?? '',
      lat: corpo.lat,
      lng: corpo.lng,
      dispositivo: corpo.dispositivo,
      motivo: corpo.motivo,
    }))
  })

  // ── Atividades ───────────────────────────────────────────────────────────
  app.get('/v1/atividades/eventos', async c =>
    protegido(c, () => eventosParaAcompanhar(amb.repo, c.get('pessoaId'))))

  app.get('/v1/atividades/:eventoId', async c => {
    const visao = c.req.query('visao')
    const dia = c.req.query('dia')
    return protegido(c, () => atividades(amb.repo, c.get('pessoaId'), c.req.param('eventoId'), {
      ...(visao ? { visao: visao as VisaoDeAtividade } : {}),
      ...(dia ? { dia } : {}),
    }))
  })

  return app
}

/**
 * Traduz a recusa das rotas em 404.
 *
 * As funções lançam "não encontrada" tanto para id inexistente quanto para id
 * de outra pessoa — de propósito, para não entregar quais ids existem. Aqui a
 * mensagem sai como está, sem enriquecer.
 */
async function protegido<T>(
  c: { json: (corpo: unknown, status?: 200 | 404) => Response },
  fn: () => Promise<T>,
): Promise<Response> {
  try {
    return c.json(await fn())
  } catch (e) {
    return c.json({ erro: e instanceof Error ? e.message : 'Não encontrado.' }, 404)
  }
}
