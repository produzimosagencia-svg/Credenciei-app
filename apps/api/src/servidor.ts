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

import { randomBytes } from 'node:crypto'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { Papel } from '@credenciei/dominio'
import type { Sessoes } from './sessoes.js'
import type { LimiteDeTentativas } from './limite.js'
import type { Repositorio } from './dados/repositorio.js'
import type { Dependencias as DepSessao } from './rotas/sessao.js'
import { entrar, entrarComSenha, pedirCodigo } from './rotas/sessao.js'
import { contestarBatida, registrarBatida, registrarEntradaLivre } from './rotas/batidas.js'
import { apagarFotosVencidas } from './rotas/manutencao.js'
import {
  enviarAlertaSupervisorDeEntrada, enviarAlertaSupervisorDeSaida,
  enviarLembretesDeEntrada, enviarLembretesDeSaida, type EnviarPush,
} from './rotas/lembretes.js'
import { excluirMinhaConta } from './rotas/conta.js'
import { painelDaEquipe } from './rotas/equipe.js'
import { painel } from './rotas/painel.js'
import { conferirPorCpf, eventosParaEscanear, registrarPorQr } from './rotas/escanear.js'
import { abrirFicha, localizarPessoa, registrarPresencaAssistida } from './rotas/ponto-assistido.js'
import { atividades, eventosParaAcompanhar } from './rotas/atividades.js'
import {
  acessos, criarAcesso, editarSupervisor, eventosComSetores, excluirAcesso, mudarSituacaoDoAcesso,
  operadoresDoEvento, trocarSenhaDoAcesso,
} from './rotas/acessos.js'
import type { FuncaoDeAcesso, VisaoDeAtividade } from '@credenciei/contrato'
import {
  consultarConvite, entrarNoEvento, meuFinanceiro, meuQr, meusDias,
  minhasParticipacoes, type FonteDeCampos,
} from './rotas/eventos.js'
import {
  adicionarSupervisor, alternarCadastroPorLink, alternarLinkDoSetor, alternarPortaria, configuracaoDoEvento,
  configuracaoDoMeio, criarEvento, criarLinkCadastroIndividual, criarSetor, editarSetor, eventoDetalhado,
  excluirSetor, salvarConfiguracaoDoMeio, salvarDiasDeTrabalho, salvarEvento, trocarTokenDaPortaria,
} from './rotas/configurar-evento.js'
import { baixarModelo, equipeDoSetor, exportarEquipe, importarPlanilha } from './rotas/setor.js'
import {
  alternarAtivacao, corrigirCpf, corrigirFuncao, corrigirTelefone, crachaDaPessoa, excluirDaEquipe, fichaDaPessoa,
  marcarPagamento, moverDeSetor, resolverContestacao, salvarValorAReceber, tirarDaEquipe, tornarSupervisor,
  trazerDeVolta,
} from './rotas/ficha-da-pessoa.js'
import {
  conferenciaDoSetor, conferenciasDoEvento, confirmarConferencia, planilhaDaConferencia, removerDaConferencia,
} from './rotas/conferencia.js'
import {
  alternarOrganizacao, criarOrganizacao, organizacoes,
} from './rotas/plataforma.js'
import {
  minhasPermissoes, permissoesDaOrganizacao, salvarPermissaoDaOrganizacao,
} from './rotas/configuracoes.js'
import { auditoria } from './rotas/auditoria.js'
import {
  buscarCondutorPorCpf, cadastrarVeiculo, eventosParaVeiculos, excluirVeiculo, veiculosDoEvento,
} from './rotas/veiculos.js'
import {
  bloquearCpf, bloqueiosDoEvento, desbloquearCpf, eventosParaBloqueio,
} from './rotas/bloquear-cpf.js'
import {
  eventosParaRelatorios, relatorioDoEvento, relatorioDoSetor, relatoriosPorSetorZip, resumoDeRelatorios,
} from './rotas/relatorios.js'
import { ArquivosEmMemoria, type Arquivos } from './arquivos.js'
import type { Periodo, QuemNoRelatorio } from '@credenciei/contrato'
import {
  atribuirPessoaAoEvento, baseDeFuncionarios, encontrarColaborador, fichaDaPessoaNaBase,
} from './rotas/base-de-funcionarios.js'
import { registrarTokenDePush } from './rotas/push.js'

export type Ambiente = {
  repo: Repositorio
  sessoes: Sessoes
  sessao: DepSessao
  /** Limite de tentativas do código de EVENTO — mesma interface da sessão, chave diferente. */
  limite: LimiteDeTentativas
  campos: FonteDeCampos
  segredoQr: string
  /**
   * Chave pública Ed25519 vigente, para `lerCodigoQR` conferir o formato
   * novo (`c4`) — ver ADR 009. `null` enquanto o par de chaves não existir
   * ou a fase de aceitar `c4` ainda não tiver sido ligada; nesse caso um
   * código `c4` (que hoje não existe em circulação) cai no mesmo "fora do
   * padrão" de qualquer formato desconhecido.
   */
  chavePublicaQrEd25519: Uint8Array | null
  novoToken: () => string
  /** Onde os relatórios gerados ficam até alguém baixar — ver `arquivos.ts`. */
  arquivos: Arquivos
  /** O domínio do site (credenciei-web) — para montar o link da portaria e do formulário do setor. */
  siteUrl: string
  /**
   * Protege as rotas de `/manutencao` — chamadas por um agendador externo
   * (cron-job.org), nunca por uma pessoa logada, então não faz sentido
   * pedir sessão. `null` desliga a rota (responde 404): sem segredo
   * configurado, mais vale não expor nada do que expor sem proteção.
   */
  segredoManutencao: string | null
  /** Manda a notificação de verdade (Expo Push) — ver `expo-push.ts`. */
  enviarPush: EnviarPush
}

type Variaveis = { pessoaId: string; papel: Papel }

export function criarServidor(amb: Ambiente) {
  const app = new Hono<{ Variables: Variaveis }>()

  app.use('*', cors())

  app.get('/saude', c => c.json({ ok: true, em: new Date().toISOString() }))

  /*
   * Manutenção — fora de `/v1` de propósito, mesmo motivo do relatório
   * abaixo: quem chama é um agendador externo, não uma pessoa com sessão.
   * A proteção é um segredo compartilhado, não um token de login.
   */
  app.post('/manutencao/apagar-fotos-vencidas', async c => {
    if (!amb.segredoManutencao) return c.notFound()
    const recebido = c.req.header('X-Segredo-Manutencao') ?? ''
    if (recebido !== amb.segredoManutencao) return c.json({ erro: 'Não autorizado.' }, 401)
    return c.json(await apagarFotosVencidas(amb.repo))
  })

  app.post('/manutencao/lembrete-entrada', async c => {
    if (!amb.segredoManutencao) return c.notFound()
    const recebido = c.req.header('X-Segredo-Manutencao') ?? ''
    if (recebido !== amb.segredoManutencao) return c.json({ erro: 'Não autorizado.' }, 401)
    return c.json(await enviarLembretesDeEntrada(amb.repo, amb.enviarPush))
  })

  app.post('/manutencao/lembrete-saida', async c => {
    if (!amb.segredoManutencao) return c.notFound()
    const recebido = c.req.header('X-Segredo-Manutencao') ?? ''
    if (recebido !== amb.segredoManutencao) return c.json({ erro: 'Não autorizado.' }, 401)
    return c.json(await enviarLembretesDeSaida(amb.repo, amb.enviarPush))
  })

  app.post('/manutencao/alerta-supervisor-entrada', async c => {
    if (!amb.segredoManutencao) return c.notFound()
    const recebido = c.req.header('X-Segredo-Manutencao') ?? ''
    if (recebido !== amb.segredoManutencao) return c.json({ erro: 'Não autorizado.' }, 401)
    return c.json(await enviarAlertaSupervisorDeEntrada(amb.repo, amb.enviarPush))
  })

  app.post('/manutencao/alerta-supervisor-saida', async c => {
    if (!amb.segredoManutencao) return c.notFound()
    const recebido = c.req.header('X-Segredo-Manutencao') ?? ''
    if (recebido !== amb.segredoManutencao) return c.json({ erro: 'Não autorizado.' }, 401)
    return c.json(await enviarAlertaSupervisorDeSaida(amb.repo, amb.enviarPush))
  })

  /*
   * O download de um relatório — de propósito, FORA de `/v1` e sem token de
   * sessão: é um link para COMPARTILHAR (grupo do WhatsApp, computador), e um
   * link que só abre com o cabeçalho da sessão do celular não abriria em
   * lugar nenhum. Quem protege é o token em si — opaco, e expira em 15min
   * (ver `arquivos.ts`).
   *
   * Só existe de verdade quando `amb.arquivos` é a implementação em
   * memória — a de Storage devolve uma URL assinada do próprio Supabase, que
   * nunca passa por aqui.
   */
  app.get('/arquivos/:token', c => {
    if (!(amb.arquivos instanceof ArquivosEmMemoria)) {
      return c.json({ erro: 'Este link expirou ou não existe.' }, 404)
    }
    const arquivo = amb.arquivos.buscar(c.req.param('token'))
    if (!arquivo) return c.json({ erro: 'Este link expirou ou não existe.' }, 404)
    return c.body(new Uint8Array(arquivo.bytes), 200, {
      'Content-Type': arquivo.tipo,
      'Content-Disposition': `attachment; filename="${encodeURIComponent(arquivo.nome)}"`,
    })
  })

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

  app.post('/v1/minha-conta/excluir', async c => {
    if (c.get('papel') !== 'colaborador') {
      return c.json({ erro: 'Esta ação é só para conta de colaborador.' }, 400)
    }
    return c.json(await excluirMinhaConta(amb.repo, amb.sessoes, c.get('pessoaId')))
  })

  // ── Entrar num evento ───────────────────────────────────────────────────
  app.get('/v1/convites/:codigo', async c => {
    const r = await consultarConvite(amb.repo, amb.campos, amb.limite, c.get('pessoaId'), c.req.param('codigo'))
    return r.erro ? c.json({ erro: r.erro }, 400) : c.json(r.convite)
  })

  app.post('/v1/participacoes', async c => {
    const { codigo, respostas } = await c.req.json<{ codigo?: string; respostas?: Record<string, string> }>()
    const r = await entrarNoEvento(
      amb.repo, amb.campos, amb.limite, c.get('pessoaId'), codigo ?? '', respostas ?? {}, amb.novoToken,
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
      registradoEm?: string; fotoBase64?: string; lat?: number; lng?: number
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
      fotoBase64: corpo.fotoBase64 ?? null,
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

  app.post('/v1/participacoes/:id/entrada-livre', async c => {
    const { lat, lng } = await c.req.json<{ lat?: number; lng?: number }>()
    const r = await registrarEntradaLivre(amb.repo, c.get('pessoaId'), c.req.param('id'), { lat, lng })
    return c.json(r, r.situacao === 'recusado' ? 422 : 200)
  })

  app.post('/v1/participacoes/:id/contestar', async c => {
    const { tipo, dataRef, motivo } = await c.req.json<{ tipo?: string; dataRef?: string; motivo?: string }>()
    if (tipo !== 'entrada' && tipo !== 'meio' && tipo !== 'fim') {
      return c.json({ erro: 'Etapa inválida.' }, 400)
    }
    if (!dataRef) return c.json({ erro: 'Pedido incompleto.' }, 400)
    return protegido(c, () => contestarBatida(amb.repo, c.get('pessoaId'), c.req.param('id'), tipo, dataRef, motivo ?? ''))
  })

  app.post('/v1/contestacoes/:id/resolver', async c =>
    protegido(c, () => resolverContestacao(amb.repo, c.get('pessoaId'), c.req.param('id'))))

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
      amb.repo, amb.segredoQr, amb.chavePublicaQrEd25519, c.get('pessoaId'), c.req.param('eventoId'), codigo ?? '',
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

  /*
   * ── Configurar evento ────────────────────────────────────────────────────
   *
   * As quatro rotas abaixo usam `protegido`: quem não tem permissão ou pede
   * um evento que não é seu recebe 404 (a mesma resposta de "não existe" —
   * ver `exigirAcessoAoEvento`); um pedido malformado (nome vazio, data
   * faltando) volta 200 com `{ erro }` no corpo, porque não é falha de
   * transporte, é decisão — mesmo padrão de `criarAcesso`.
   */
  app.post('/v1/eventos', async c => {
    const corpo = await c.req.json<{
      organizacaoId?: string | null; nome?: string; descricao?: string | null; local?: string | null
      dataInicio?: string; dataFim?: string
      janelaEntradaInicio?: string | null; janelaEntradaFim?: string | null
      janelaFimInicio?: string | null; janelaFimFim?: string | null
    }>()
    return protegido(c, () => criarEvento(amb.repo, c.get('pessoaId'), {
      organizacaoId: corpo.organizacaoId,
      nome: corpo.nome ?? '',
      descricao: corpo.descricao ?? null,
      local: corpo.local ?? null,
      dataInicio: corpo.dataInicio ?? '',
      dataFim: corpo.dataFim ?? '',
      janelaEntradaInicio: corpo.janelaEntradaInicio ?? null,
      janelaEntradaFim: corpo.janelaEntradaFim ?? null,
      janelaFimInicio: corpo.janelaFimInicio ?? null,
      janelaFimFim: corpo.janelaFimFim ?? null,
    }))
  })

  app.get('/v1/eventos/:id', async c =>
    protegido(c, () => eventoDetalhado(
      amb.repo, c.get('pessoaId'), c.req.param('id'), amb.siteUrl, c.req.query('dia'),
    )))

  app.post('/v1/eventos/:id/portaria', async c => {
    const { aberta } = await c.req.json<{ aberta?: boolean }>()
    return protegido(c, () => alternarPortaria(
      amb.repo, c.get('pessoaId'), c.req.param('id'), aberta === true, amb.siteUrl, amb.novoToken,
    ))
  })

  app.post('/v1/eventos/:id/portaria/trocar', async c =>
    protegido(c, () => trocarTokenDaPortaria(amb.repo, c.get('pessoaId'), c.req.param('id'), amb.siteUrl, amb.novoToken)))

  app.post('/v1/eventos/:id/cadastro', async c => {
    const { suspenso } = await c.req.json<{ suspenso?: boolean }>()
    return protegido(c, () => alternarCadastroPorLink(amb.repo, c.get('pessoaId'), c.req.param('id'), suspenso === true))
  })

  app.get('/v1/eventos/:id/operadores-portao', async c =>
    protegido(c, () => operadoresDoEvento(amb.repo, c.get('pessoaId'), c.req.param('id'))))

  app.post('/v1/eventos/:id/cadastro-individual', async c => {
    const { setorId } = await c.req.json<{ setorId?: string }>()
    return protegido(c, () => criarLinkCadastroIndividual(
      amb.repo, c.get('pessoaId'), c.req.param('id'), setorId ?? '', amb.siteUrl,
      () => randomBytes(32).toString('base64url'),
    ))
  })

  app.post('/v1/eventos/:id/setores', async c => {
    const corpo = await c.req.json<{
      nome?: string; valorPorPessoa?: number | null; exigeMeio?: boolean
      supervisor?: { nome?: string; cpf?: string; telefone?: string }
    }>()
    return protegido(c, () => criarSetor(amb.repo, c.get('pessoaId'), c.req.param('id'), {
      nome: corpo.nome ?? '',
      valorPorPessoa: corpo.valorPorPessoa ?? null,
      exigeMeio: corpo.exigeMeio === true,
      supervisor: {
        nome: corpo.supervisor?.nome ?? '',
        cpf: corpo.supervisor?.cpf ?? '',
        telefone: corpo.supervisor?.telefone ?? '',
      },
    }, amb.siteUrl))
  })

  app.get('/v1/setores/:id/equipe', async c =>
    protegido(c, () => equipeDoSetor(amb.repo, c.get('pessoaId'), c.req.param('id'))))

  app.get('/v1/pessoas/:id/ficha', async c =>
    protegido(c, () => fichaDaPessoa(amb.repo, c.get('pessoaId'), c.req.param('id'))))

  app.post('/v1/pessoas/:id/mover', async c => {
    const { setorId } = await c.req.json<{ setorId?: string }>()
    return protegido(c, () => moverDeSetor(amb.repo, c.get('pessoaId'), c.req.param('id'), setorId ?? ''))
  })

  app.post('/v1/pessoas/:id/tornar-supervisor', async c => {
    const { telefone } = await c.req.json<{ telefone?: string }>()
    return protegido(c, () => tornarSupervisor(amb.repo, c.get('pessoaId'), c.req.param('id'), telefone ?? ''))
  })

  app.post('/v1/pessoas/:id/pagamento', async c => {
    const { pago } = await c.req.json<{ pago?: boolean }>()
    return protegido(c, () => marcarPagamento(amb.repo, c.get('pessoaId'), c.req.param('id'), pago === true))
  })

  app.post('/v1/pessoas/:id/valor-a-receber', async c => {
    const { valor } = await c.req.json<{ valor?: number }>()
    return protegido(c, () => salvarValorAReceber(amb.repo, c.get('pessoaId'), c.req.param('id'), valor ?? 0))
  })

  app.post('/v1/pessoas/:id/tirar', async c =>
    protegido(c, () => tirarDaEquipe(amb.repo, c.get('pessoaId'), c.req.param('id'))))

  app.post('/v1/pessoas/:id/trazer-de-volta', async c =>
    protegido(c, () => trazerDeVolta(amb.repo, c.get('pessoaId'), c.req.param('id'))))

  app.post('/v1/pessoas/:id/ativacao', async c => {
    const { ativo } = await c.req.json<{ ativo?: boolean }>()
    return protegido(c, () => alternarAtivacao(amb.repo, c.get('pessoaId'), c.req.param('id'), ativo === true))
  })

  app.post('/v1/pessoas/:id/funcao', async c => {
    const { funcao } = await c.req.json<{ funcao?: string }>()
    return protegido(c, () => corrigirFuncao(amb.repo, c.get('pessoaId'), c.req.param('id'), funcao ?? ''))
  })

  app.post('/v1/pessoas/:id/cpf', async c => {
    const { cpf } = await c.req.json<{ cpf?: string }>()
    return protegido(c, () => corrigirCpf(amb.repo, c.get('pessoaId'), c.req.param('id'), cpf ?? ''))
  })

  app.get('/v1/pessoas/:id/qr', async c =>
    protegido(c, () => crachaDaPessoa(amb.repo, amb.segredoQr, c.get('pessoaId'), c.req.param('id'))))

  app.post('/v1/pessoas/:id/excluir', async c => {
    const { motivo } = await c.req.json<{ motivo?: string }>().catch(() => ({ motivo: undefined }))
    return protegido(c, () => excluirDaEquipe(amb.repo, c.get('pessoaId'), c.req.param('id'), motivo))
  })

  app.post('/v1/pessoas/:id/telefone', async c => {
    const { telefone, motivo } = await c.req.json<{ telefone?: string; motivo?: string }>()
    return protegido(c, () => corrigirTelefone(amb.repo, c.get('pessoaId'), c.req.param('id'), telefone ?? '', motivo))
  })

  app.get('/v1/setores/modelo-de-importacao', async c =>
    protegido(c, () => baixarModelo(amb.repo, c.get('pessoaId'), amb.arquivos)))

  app.get('/v1/setores/:id/planilha', async c =>
    protegido(c, () => exportarEquipe(
      amb.repo, c.get('pessoaId'), c.req.param('id'), amb.arquivos, { dia: c.req.query('dia') },
    )))

  app.post('/v1/setores/:id/importar', async c => {
    const { base64 } = await c.req.json<{ base64?: string }>()
    return protegido(c, () => importarPlanilha(amb.repo, c.get('pessoaId'), c.req.param('id'), base64 ?? ''))
  })

  app.post('/v1/setores/:id', async c => {
    const corpo = await c.req.json<{ nome?: string; valorPorPessoa?: number | null; exigeMeio?: boolean }>()
    return protegido(c, () => editarSetor(amb.repo, c.get('pessoaId'), c.req.param('id'), {
      nome: corpo.nome ?? '',
      valorPorPessoa: corpo.valorPorPessoa ?? null,
      exigeMeio: corpo.exigeMeio === true,
    }, amb.siteUrl))
  })

  app.post('/v1/setores/:id/link', async c => {
    const { ativo } = await c.req.json<{ ativo?: boolean }>()
    return protegido(c, () => alternarLinkDoSetor(amb.repo, c.get('pessoaId'), c.req.param('id'), ativo === true))
  })

  app.post('/v1/setores/:id/excluir', async c =>
    protegido(c, () => excluirSetor(amb.repo, c.get('pessoaId'), c.req.param('id'))))

  app.post('/v1/setores/:id/supervisores', async c => {
    const corpo = await c.req.json<{ nome?: string; cpf?: string; telefone?: string }>()
    return protegido(c, () => adicionarSupervisor(amb.repo, c.get('pessoaId'), c.req.param('id'), {
      nome: corpo.nome ?? '',
      cpf: corpo.cpf ?? '',
      telefone: corpo.telefone ?? '',
    }))
  })

  app.get('/v1/eventos/:id/configuracao', async c =>
    protegido(c, () => configuracaoDoEvento(amb.repo, c.get('pessoaId'), c.req.param('id'))))

  app.post('/v1/eventos/:id/configuracao', async c => {
    const corpo = await c.req.json<{
      nome?: string; descricao?: string | null; local?: string | null
      dataInicio?: string | null; dataFim?: string | null
      batidaLivre?: boolean; checkinAutonomo?: boolean
      janelaEntradaInicio?: string | null; janelaEntradaFim?: string | null
      janelaFimInicio?: string | null; janelaFimFim?: string | null
    }>()
    return protegido(c, () => salvarEvento(amb.repo, c.get('pessoaId'), c.req.param('id'), {
      nome: corpo.nome ?? '',
      descricao: corpo.descricao ?? null,
      local: corpo.local ?? null,
      dataInicio: corpo.dataInicio ?? null,
      dataFim: corpo.dataFim ?? null,
      batidaLivre: corpo.batidaLivre === true,
      checkinAutonomo: corpo.checkinAutonomo === true,
      janelaEntradaInicio: corpo.janelaEntradaInicio ?? null,
      janelaEntradaFim: corpo.janelaEntradaFim ?? null,
      janelaFimInicio: corpo.janelaFimInicio ?? null,
      janelaFimFim: corpo.janelaFimFim ?? null,
    }))
  })

  app.post('/v1/eventos/:id/dias', async c => {
    const { dias } = await c.req.json<{ dias?: string[] }>()
    return protegido(c, () => salvarDiasDeTrabalho(amb.repo, c.get('pessoaId'), c.req.param('id'), dias ?? []))
  })

  app.get('/v1/eventos/:id/meio', async c =>
    protegido(c, () => configuracaoDoMeio(amb.repo, c.get('pessoaId'), c.req.param('id'))))

  app.post('/v1/eventos/:id/meio', async c => {
    const { setoresLigados, diasLigados } = await c.req.json<{ setoresLigados?: string[]; diasLigados?: string[] }>()
    return protegido(c, () => salvarConfiguracaoDoMeio(
      amb.repo, c.get('pessoaId'), c.req.param('id'), setoresLigados ?? [], diasLigados ?? [],
    ))
  })

  // ── Conferência de equipe ────────────────────────────────────────────────
  app.get('/v1/eventos/:id/conferencias', async c =>
    protegido(c, () => conferenciasDoEvento(amb.repo, c.get('pessoaId'), c.req.param('id'))))

  app.get('/v1/conferencia/:setorId', async c =>
    protegido(c, () => conferenciaDoSetor(amb.repo, c.get('pessoaId'), c.req.param('setorId'))))

  app.post('/v1/conferencia/:setorId/remover', async c => {
    const { funcionarioId } = await c.req.json<{ funcionarioId?: string }>()
    if (!funcionarioId) return c.json({ erro: 'Pedido incompleto.' }, 400)
    return protegido(c, () => removerDaConferencia(amb.repo, c.get('pessoaId'), c.req.param('setorId'), funcionarioId))
  })

  app.post('/v1/conferencia/:setorId/confirmar', async c =>
    protegido(c, () => confirmarConferencia(amb.repo, c.get('pessoaId'), c.req.param('setorId'))))

  app.get('/v1/conferencia/:setorId/planilha', async c =>
    protegido(c, () => planilhaDaConferencia(amb.repo, c.get('pessoaId'), c.req.param('setorId'), amb.arquivos)))

  // ── Plataforma (organizações) ────────────────────────────────────────────
  app.get('/v1/organizacoes', async c =>
    protegido(c, () => organizacoes(amb.repo, c.get('pessoaId'))))

  app.post('/v1/organizacoes', async c => {
    const corpo = await c.req.json<{
      nome?: string; documento?: string | null; responsavelNome?: string | null
      limiteEventos?: number; valorCobrado?: number | null
      valorCobradoPeriodo?: 'mensal' | 'anual' | 'por_evento'
      adminNome?: string; email?: string; senha?: string
      primeiroEvento?: { nome: string; dataInicio: string; dataFim: string; local?: string | null } | null
    }>()
    return protegido(c, () => criarOrganizacao(amb.repo, c.get('pessoaId'), {
      nome: corpo.nome ?? '',
      documento: corpo.documento ?? null,
      responsavelNome: corpo.responsavelNome ?? null,
      limiteEventos: corpo.limiteEventos ?? 1,
      valorCobrado: corpo.valorCobrado ?? null,
      valorCobradoPeriodo: corpo.valorCobradoPeriodo,
      adminNome: corpo.adminNome ?? '',
      email: corpo.email ?? '',
      senha: corpo.senha ?? '',
      primeiroEvento: corpo.primeiroEvento ?? null,
    }))
  })

  app.post('/v1/organizacoes/:id/situacao', async c => {
    const { ativa } = await c.req.json<{ ativa?: boolean }>()
    return protegido(c, () => alternarOrganizacao(amb.repo, c.get('pessoaId'), c.req.param('id'), ativa === true))
  })

  // ── Permissões (as 3 camadas de "Funções ligadas") ───────────────────────
  app.get('/v1/minhas-permissoes', async c =>
    protegido(c, () => minhasPermissoes(amb.repo, c.get('pessoaId'))))

  app.get('/v1/permissoes', async c => {
    const org = c.req.query('organizacao')
    const organizacaoId = org && org !== 'plataforma' ? org : null
    return protegido(c, () => permissoesDaOrganizacao(amb.repo, c.get('pessoaId'), organizacaoId))
  })

  app.post('/v1/permissoes', async c => {
    const { organizacaoId, papel, chave, permitido } = await c.req.json<{
      organizacaoId?: string | null; papel?: string; chave?: string; permitido?: boolean | null
    }>()
    return protegido(c, () => salvarPermissaoDaOrganizacao(
      amb.repo, c.get('pessoaId'), organizacaoId ?? null, papel ?? '', chave ?? '', permitido ?? null,
    ))
  })

  // ── Auditoria ─────────────────────────────────────────────────────────────
  app.get('/v1/auditoria', async c => {
    const eventoId = c.req.query('eventoId') || undefined
    const diasBruto = c.req.query('dias')
    const dias = diasBruto ? Number(diasBruto) : undefined
    return protegido(c, () => auditoria(amb.repo, c.get('pessoaId'), { eventoId, dias }))
  })

  // ── Push ──────────────────────────────────────────────────────────────────
  app.post('/v1/push/token', async c => {
    const { token, plataforma } = await c.req.json<{ token?: string; plataforma?: string }>()
    return protegido(c, () => registrarTokenDePush(amb.repo, c.get('pessoaId'), token ?? '', plataforma ?? ''))
  })

  // ── Veículos ──────────────────────────────────────────────────────────────
  app.get('/v1/veiculos/eventos', async c =>
    protegido(c, () => eventosParaVeiculos(amb.repo, c.get('pessoaId'))))

  app.get('/v1/veiculos/:eventoId', async c =>
    protegido(c, () => veiculosDoEvento(amb.repo, c.get('pessoaId'), c.req.param('eventoId'))))

  app.post('/v1/veiculos/:eventoId/condutor', async c => {
    const { cpf } = await c.req.json<{ cpf?: string }>()
    return protegido(c, () => buscarCondutorPorCpf(amb.repo, c.get('pessoaId'), c.req.param('eventoId'), cpf ?? ''))
  })

  app.post('/v1/veiculos/:eventoId', async c => {
    const corpo = await c.req.json<{
      cpf?: string; placa?: string; modelo?: string; tipo?: string | null; cor?: string | null
      empresa?: string | null; observacoes?: string | null; dias?: string[]
    }>()
    return protegido(c, () => cadastrarVeiculo(amb.repo, c.get('pessoaId'), c.req.param('eventoId'), {
      cpf: corpo.cpf ?? '',
      placa: corpo.placa ?? '',
      modelo: corpo.modelo ?? '',
      tipo: corpo.tipo,
      cor: corpo.cor,
      empresa: corpo.empresa,
      observacoes: corpo.observacoes,
      dias: corpo.dias,
    }))
  })

  app.post('/v1/veiculos/:eventoId/excluir', async c => {
    const { veiculoId } = await c.req.json<{ veiculoId?: string }>()
    return protegido(c, () => excluirVeiculo(amb.repo, c.get('pessoaId'), veiculoId ?? '', c.req.param('eventoId')))
  })

  // ── Bloqueio de CPF ───────────────────────────────────────────────────────
  app.get('/v1/bloqueio-cpf/eventos', async c =>
    protegido(c, () => eventosParaBloqueio(amb.repo, c.get('pessoaId'))))

  app.get('/v1/bloqueio-cpf/:eventoId', async c =>
    protegido(c, () => bloqueiosDoEvento(amb.repo, c.get('pessoaId'), c.req.param('eventoId'))))

  app.post('/v1/bloqueio-cpf/:eventoId', async c => {
    const { cpf, motivo } = await c.req.json<{ cpf?: string; motivo?: string }>()
    return protegido(c, () => bloquearCpf(amb.repo, c.get('pessoaId'), c.req.param('eventoId'), cpf ?? '', motivo))
  })

  app.post('/v1/bloqueio-cpf/:eventoId/desbloquear', async c => {
    const { bloqueioId } = await c.req.json<{ bloqueioId?: string }>()
    return protegido(c, () => desbloquearCpf(amb.repo, c.get('pessoaId'), bloqueioId ?? '', c.req.param('eventoId')))
  })

  // ── Base de funcionários / Encontrar colaborador ────────────────────────
  app.get('/v1/base-de-funcionarios', async c =>
    protegido(c, () => baseDeFuncionarios(amb.repo, c.get('pessoaId'), c.req.query('busca') ?? '')))

  app.get('/v1/encontrar-colaborador', async c => {
    const busca = c.req.query('busca')
    const cidade = c.req.query('cidade')
    return protegido(c, () => encontrarColaborador(amb.repo, c.get('pessoaId'), {
      ...(busca ? { busca } : {}),
      ...(cidade ? { cidade } : {}),
    }))
  })

  app.get('/v1/base-de-funcionarios/:cpf', async c =>
    protegido(c, () => fichaDaPessoaNaBase(amb.repo, c.get('pessoaId'), c.req.param('cpf'))))

  app.post('/v1/base-de-funcionarios/:cpf/atribuir', async c => {
    const { setorId } = await c.req.json<{ setorId?: string }>()
    return protegido(c, () => atribuirPessoaAoEvento(amb.repo, c.get('pessoaId'), c.req.param('cpf'), setorId ?? ''))
  })

  // ── Relatórios ────────────────────────────────────────────────────────────
  app.get('/v1/relatorios/eventos', async c =>
    protegido(c, () => eventosParaRelatorios(amb.repo, c.get('pessoaId'))))

  app.get('/v1/relatorios/:eventoId', async c =>
    protegido(c, () => resumoDeRelatorios(amb.repo, c.get('pessoaId'), c.req.param('eventoId'))))

  const periodoDaQuery = (c: { req: { query: (chave: string) => string | undefined } }): Periodo => ({
    de: c.req.query('de') ?? '',
    ate: c.req.query('ate') ?? '',
  })
  const quemDaQuery = (c: { req: { query: (chave: string) => string | undefined } }): QuemNoRelatorio =>
    c.req.query('quem') === 'ausentes' ? 'ausentes' : 'credenciados'

  app.get('/v1/relatorios/:eventoId/arquivo', async c =>
    protegido(c, () => relatorioDoEvento(
      amb.repo, c.get('pessoaId'), c.req.param('eventoId'), periodoDaQuery(c), quemDaQuery(c), amb.arquivos,
    )))

  app.get('/v1/relatorios/:eventoId/setor/:setorId/arquivo', async c =>
    protegido(c, () => relatorioDoSetor(
      amb.repo, c.get('pessoaId'), c.req.param('eventoId'), c.req.param('setorId'), periodoDaQuery(c),
      quemDaQuery(c), amb.arquivos,
    )))

  app.get('/v1/relatorios/:eventoId/zip', async c =>
    protegido(c, () => relatoriosPorSetorZip(
      amb.repo, c.get('pessoaId'), c.req.param('eventoId'), periodoDaQuery(c), quemDaQuery(c), amb.arquivos,
    )))

  // ── Acessos ─────────────────────────────────────────────────────────────
  app.get('/v1/acessos', async c => {
    const busca = c.req.query('busca')
    const situacao = c.req.query('situacao')
    return protegido(c, () => acessos(amb.repo, c.get('pessoaId'), {
      ...(busca ? { busca } : {}),
      ...(situacao === 'ativos' || situacao === 'inativos' ? { situacao } : {}),
    }))
  })

  app.post('/v1/acessos/:id/situacao', async c => {
    const { ativo } = await c.req.json<{ ativo?: boolean }>()
    return protegido(c, () => mudarSituacaoDoAcesso(amb.repo, c.get('pessoaId'), c.req.param('id'), ativo === true))
  })

  app.post('/v1/acessos/:id/senha', async c => {
    const { senha } = await c.req.json<{ senha?: string }>()
    return protegido(c, () => trocarSenhaDoAcesso(amb.repo, c.get('pessoaId'), c.req.param('id'), senha ?? ''))
  })

  app.post('/v1/acessos/:id/excluir', async c =>
    protegido(c, () => excluirAcesso(amb.repo, c.get('pessoaId'), c.req.param('id'))))

  app.post('/v1/acessos/:id/editar', async c => {
    const corpo = await c.req.json<{
      nome?: string; telefone?: string; ativo?: boolean; permissoesUsuario?: Record<string, boolean>
    }>()
    return protegido(c, () => editarSupervisor(amb.repo, c.get('pessoaId'), c.req.param('id'), {
      nome: corpo.nome ?? '',
      telefone: corpo.telefone ?? '',
      ativo: corpo.ativo === true,
      permissoesUsuario: corpo.permissoesUsuario,
    }))
  })

  app.get('/v1/acessos/eventos', async c =>
    protegido(c, () => eventosComSetores(amb.repo, c.get('pessoaId'))))

  app.post('/v1/acessos', async c => {
    const corpo = await c.req.json<{
      funcao?: FuncaoDeAcesso; nome?: string; cpf?: string; telefone?: string; eventoId?: string
      setorId?: string; expiraEm?: string | null; ativo?: boolean; permissoesUsuario?: Record<string, boolean>
      email?: string; senha?: string; organizacaoId?: string
    }>()
    return protegido(c, () => criarAcesso(amb.repo, c.get('pessoaId'), {
      funcao: corpo.funcao ?? 'supervisor',
      nome: corpo.nome ?? '',
      cpf: corpo.cpf ?? '',
      telefone: corpo.telefone ?? '',
      eventoId: corpo.eventoId ?? '',
      setorId: corpo.setorId,
      expiraEm: corpo.expiraEm,
      ativo: corpo.ativo !== false,
      permissoesUsuario: corpo.permissoesUsuario,
      email: corpo.email,
      senha: corpo.senha,
      organizacaoId: corpo.organizacaoId,
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
