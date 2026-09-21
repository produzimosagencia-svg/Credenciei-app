// O repositório sobre o Supabase — a ponte entre a API nova e o banco atual.
//
// ─── ELE FALA DOIS IDIOMAS ──────────────────────────────────────────────────
//
// A API inteira pensa em `pessoas` (permanente) e `participacoes` (do evento).
// O banco de hoje não tem isso: tem `funcionarios`, que é uma pessoa DENTRO de
// um setor DE um evento. Trabalhar em dois eventos cria dois cadastros, e o
// mesmo CPF vira duas linhas sem nada ligando uma à outra.
//
// Este arquivo faz a tradução. É o único lugar do projeto que conhece o schema
// antigo — e é por isso que ele existe: quando o banco migrar, a tradução some
// daqui e nenhum endpoint muda.
//
//   API pensa            banco de hoje tem
//   ─────────────────────────────────────────────────────
//   pessoas              (não existe — derivado do CPF)
//   participacoes        funcionarios
//   equipes              fornecedores
//   registros            registros (aponta para funcionario_id)
//
// ─── A PESSOA, ENQUANTO A TABELA NÃO EXISTE ─────────────────────────────────
//
// Sem tabela `pessoas`, a identidade da pessoa é o CPF. `pessoaPorTelefone`
// acha qualquer cadastro com aquele número e devolve o CPF como identidade;
// `participacoesDaPessoa` busca TODOS os cadastros com aquele CPF, em qualquer
// evento. É exatamente o comportamento que a tabela vai dar — só que caro:
// consulta por CPF em vez de por chave estrangeira.
//
// Funciona para começar e não escala. A tela "base de colaboradores" do sistema
// atual já faz isso agrupando em memória, e trava por volta de três mil
// cadastros. É a razão nº 1 da migração, não um detalhe.

import { createHash, randomBytes } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { chaveDaPermissao, diaBRT, type Papel } from '@credenciei/dominio'
import { cpfParaEmail } from '../identificador.js'
import type {
  AcessoCompleto, AtividadeBruta, BatidaResumida, BloqueioDeCpf, Contestacao, DiaDeTrabalho, EdicaoDeEventoNoRepositorio,
  EstadoDaConferencia, EstadoDaPortaria, Evento, EventoComContagens, ExcecaoDePermissao,
  FiltroDeAuditoria, LinhaConferenciaNoRepositorio, LinhaDeAuditoria, LinhaDoDia,
  NovaEntradaDeAuditoria, NovaOrganizacaoNoRepositorio, NovoAcessoNoRepositorio,
  NovoAdminNoRepositorio,
  NovoBloqueioNoRepositorio, NovoEventoNoRepositorio, NovoRegistro, NovoSetorNoRepositorio, NovoVeiculoNoRepositorio,
  Organizacao, OrganizacaoComContagens, Participacao, ParticipacaoParaLocalizar, Perfil, Pessoa, PessoaDaBase,
  Registro, Repositorio, SetorComPessoas, SetorCriado, TrabalhoNaBase, Veiculo,
} from './repositorio.js'

const soDigitos = (v: string | null | undefined) => (v ?? '').replace(/\D/g, '')

const TAMANHO_DA_PAGINA = 1000

/**
 * Traz TODAS as linhas de uma consulta, paginando de 1000 em 1000.
 *
 * O PostgREST tem um teto de linhas por consulta (`db.max_rows`, 1000 por
 * padrão) — corta em SILÊNCIO, sem erro nenhum. Uma base com 2000 pessoas
 * voltaria "1000 pessoas na base" sem ninguém perceber que faltou a metade.
 * É o mesmo `buscarTudo` que o site já tem para isto — mesmo teto, mesma
 * receita, aqui só pelo id de quem chama montar cada página.
 */
async function buscarTudo<T>(
  montar: (de: number, ate: number) => PromiseLike<{ data: T[] | null }>,
): Promise<T[]> {
  const tudo: T[] = []
  for (let pagina = 0; ; pagina++) {
    const de = pagina * TAMANHO_DA_PAGINA
    const { data } = await montar(de, de + TAMANHO_DA_PAGINA - 1)
    if (!data?.length) break
    tudo.push(...data)
    if (data.length < TAMANHO_DA_PAGINA) break
  }
  return tudo
}

/** Preço por categoria de template, em BRL — os mesmos valores do site (`lib/whatsapp-painel.ts`). */
const PRECO_META_BRL = { AUTHENTICATION: 0.035, MARKETING: 0.3217, UTILITY: 0.035 } as const

/**
 * A categoria de um disparo automático, SEM consultar a Meta.
 *
 * O site resolve a categoria de verdade contra os templates aprovados na
 * Meta Business Manager (uma chamada à API da Meta, feita com uma
 * credencial que esta API ainda não tem — WhatsApp real foi adiado, ver
 * CLAUDE.md). Sem essa consulta, só o caso especial documentado no site
 * (`credenciais_supervisor` é sempre autenticação) resolve certo; o resto
 * cai em UTILITY, o preço mais barato dos três. Isso SUBESTIMA o custo se
 * algum dia houver disparo de categoria MARKETING (mais caro) neste fluxo —
 * hoje não há, é só automação operacional (lembrete, alerta, confirmação).
 */
function categoriaWhatsappSimplificada(tipo: string): keyof typeof PRECO_META_BRL {
  if (tipo === 'credenciais_supervisor') return 'AUTHENTICATION'
  return 'UTILITY'
}

/**
 * O id de pessoa, enquanto a tabela não existe.
 *
 * Prefixado para nunca ser confundido com um id de verdade: se um dia alguém
 * passar um destes onde se espera um UUID, a consulta não encontra nada em vez
 * de encontrar a linha errada.
 */
const idDaPessoa = (cpf: string) => `cpf:${soDigitos(cpf)}`
const cpfDoId = (id: string) => (id.startsWith('cpf:') ? id.slice(4) : null)

type LinhaFuncionario = {
  id: string
  nome: string
  cpf: string
  telefone: string | null
  cargo: string | null
  empresa?: string | null
  ativo: boolean | null
  descredenciado_em: string | null
  valor_receber: number | null
  pago: boolean | null
  pago_em: string | null
  foto_perfil_path: string | null
  qr_token: string
  fornecedor_id: string
  cidade: string | null
  created_at: string
  chave_pix?: string | null
}

export class RepositorioSupabase implements Repositorio {
  constructor(private db: SupabaseClient) {}

  static apartirDoAmbiente(): RepositorioSupabase {
    const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
    const chave = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !chave) {
      throw new Error('Faltam SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.')
    }
    return new RepositorioSupabase(createClient(url, chave, { auth: { persistSession: false } }))
  }

  // ── Identidade ────────────────────────────────────────────────────────────

  async pessoaPorTelefone(telefone: string): Promise<Pessoa | null> {
    const d = soDigitos(telefone)
    if (d.length < 10) return null

    /*
     * Compara pelos ÚLTIMOS OITO dígitos.
     *
     * O mesmo número aparece no banco de várias formas: com e sem o 55 do
     * país, com e sem o 9 na frente do celular, com e sem máscara. Comparar o
     * texto inteiro faria a pessoa não conseguir entrar por causa de como
     * alguém digitou o número dela meses atrás.
     *
     * Oito dígitos são o número sem DDD — específico o bastante para não
     * colidir dentro de um estado, e tolerante às variações que importam.
     */
    const finais = d.slice(-8)
    const { data } = await this.db
      .from('funcionarios')
      .select('cpf, nome, telefone, foto_perfil_path')
      .like('telefone', `%${finais}`)
      .order('created_at', { ascending: false })
      .limit(1)

    const f = data?.[0]
    if (!f?.cpf) return null

    return {
      id: idDaPessoa(f.cpf as string),
      nome: f.nome as string,
      cpf: f.cpf as string,
      telefone: (f.telefone as string | null) ?? null,
      fotoPath: (f.foto_perfil_path as string | null) ?? null,
    }
  }

  async pessoaPorCpf(cpf: string): Promise<Pessoa | null> {
    return this.pessoaPorId(idDaPessoa(cpf))
  }

  async pessoaPorId(id: string): Promise<Pessoa | null> {
    const cpf = cpfDoId(id)
    if (!cpf) return null

    // O cadastro mais recente manda: é o que tem o nome e a foto atualizados.
    const { data } = await this.db
      .from('funcionarios')
      .select('cpf, nome, telefone, foto_perfil_path')
      .eq('cpf', cpf)
      .order('created_at', { ascending: false })
      .limit(1)

    const f = data?.[0]
    if (!f) return null

    return {
      id,
      nome: f.nome as string,
      cpf,
      telefone: (f.telefone as string | null) ?? null,
      fotoPath: (f.foto_perfil_path as string | null) ?? null,
    }
  }

  async excluirMinhaConta(pessoaId: string): Promise<void> {
    const cpf = cpfDoId(pessoaId)
    if (!cpf) return

    /*
     * `foto_perfil_path` é escrito pelo SITE (este app nunca sobe essa
     * foto — só a selfie do meio, num bucket e esquema de caminho
     * diferentes). Por isso aqui só o CAMPO é limpo, sem tentar apagar
     * nada do Storage: não temos como confirmar o bucket/caminho de algo
     * que nunca escrevemos, e arriscar apagar o arquivo errado é pior do
     * que deixar um arquivo órfão sem nome nenhum apontando pra ele.
     */
    await this.db.from('funcionarios')
      .update({ nome: 'Pessoa excluída', telefone: null, foto_perfil_path: null })
      .eq('cpf', cpf)
  }

  async criarPessoa(): Promise<Pessoa> {
    /*
     * Não dá para criar pessoa sem evento no modelo antigo.
     *
     * `funcionarios` exige `fornecedor_id` — não existe cadastro solto. Criar
     * conta antes de entrar num evento só passa a ser possível depois da
     * migração, e falhar aqui em voz alta é melhor do que inventar uma linha
     * órfã que ninguém depois entende de onde veio.
     */
    throw new Error(
      'Criar pessoa sem vínculo com evento exige a tabela `pessoas`. Ver docs/decisoes/006-migracao-pessoas.md',
    )
  }

  /*
   * `id` é o mesmo id do Supabase Auth: quem chama aqui já verificou a
   * senha (`entrarComSenha`, via `signInWithPassword`) e só precisa saber o
   * papel e a organização de quem acabou de entrar.
   */
  async perfilPorId(id: string): Promise<Perfil | null> {
    const { data } = await this.db
      .from('perfis')
      .select('id, nome, role, organizacao_id, ativo, permissoes_usuario')
      .eq('id', id)
      .maybeSingle()

    if (!data) return null
    const organizacaoId = (data.organizacao_id as string | null) ?? null

    // As exceções de organização (camada 2) vêm junto — é o que faz
    // `podeEscanear(perfil)` e companhia responderem certo em toda rota que
    // já chama `perfilPorId`, sem cada uma ter que lembrar de buscar isto.
    const excecoes = await this.mapaDeExcecoes(organizacaoId)

    return {
      id: data.id as string,
      nome: data.nome as string,
      papel: data.role as Perfil['papel'],
      organizacaoId,
      // Coluna nova o suficiente para não existir em toda linha antiga —
      // ausente é o mesmo que ativo, nunca o contrário: uma conta virando
      // "bloqueada" por um `null` no meio da migração trancaria gente de
      // fora sem ninguém ter suspendido nada.
      ativo: data.ativo !== false,
      permissoesUsuario: (data.permissoes_usuario as Record<string, boolean> | null) ?? {},
      permissoesOrganizacao: excecoes,
    }
  }

  /** A da organização mescla POR CIMA da da plataforma — mesma regra do site. */
  private async mapaDeExcecoes(organizacaoId: string | null): Promise<Record<string, boolean>> {
    const [daPlataforma, daOrganizacao] = await Promise.all([
      this.excecoesDePermissao(null),
      organizacaoId ? this.excecoesDePermissao(organizacaoId) : Promise.resolve([]),
    ])
    const mapa: Record<string, boolean> = {}
    for (const e of daPlataforma) mapa[chaveDaPermissao(e.papel, e.chave)] = e.permitido
    for (const e of daOrganizacao) mapa[chaveDaPermissao(e.papel, e.chave)] = e.permitido
    return mapa
  }

  async excecoesDePermissao(organizacaoId: string | null): Promise<ExcecaoDePermissao[]> {
    let consulta = this.db.from('permissoes_organizacao').select('organizacao_id, role, chave, permitido')
    consulta = organizacaoId ? consulta.eq('organizacao_id', organizacaoId) : consulta.is('organizacao_id', null)
    const { data, error } = await consulta
    // Tolerante à tabela ainda não existir — mesma cautela do site
    // (`obterPermissoes`): sem isso, todo login pagaria um erro de graça
    // enquanto uma instância nova não tivesse rodado a migração.
    if (error || !data) return []
    return data.map(l => ({
      organizacaoId: (l.organizacao_id as string | null) ?? null,
      papel: l.role as Papel,
      chave: l.chave as string,
      permitido: l.permitido as boolean,
    }))
  }

  async salvarExcecaoDePermissao(
    organizacaoId: string | null, papel: Papel, chave: string, permitido: boolean | null,
    atualizadoPor: string,
  ): Promise<void> {
    /*
     * Sempre apaga e, se for o caso, insere de novo — nunca `upsert`: o
     * índice único de lá usa `coalesce(organizacao_id, ...)`, e o PostgREST
     * não casa `on conflict` com índice de expressão. Mesma solução do site.
     */
    let apagar = this.db.from('permissoes_organizacao').delete().eq('role', papel).eq('chave', chave)
    apagar = organizacaoId ? apagar.eq('organizacao_id', organizacaoId) : apagar.is('organizacao_id', null)
    const { error: erroAoApagar } = await apagar
    if (erroAoApagar) throw new Error('Não foi possível salvar esta permissão.')

    if (permitido !== null) {
      const { error } = await this.db.from('permissoes_organizacao').insert([{
        organizacao_id: organizacaoId, role: papel, chave, permitido, atualizado_por: atualizadoPor,
      }])
      if (error) throw new Error('Não foi possível salvar esta permissão.')
    }
  }

  // ── Evento ────────────────────────────────────────────────────────────────

  async eventoPorCodigo(codigo: string): Promise<Evento | null> {
    const { data, error } = await this.db
      .from('eventos')
      .select(`${CAMPOS_EVENTO}, organizacoes(nome)`)
      .eq('codigo_convite', codigo)
      .limit(1)

    // Erro de consulta vira "não encontrado", não uma queda da API — quem
    // digitou o código não sabe (nem precisa saber) que o servidor teve um
    // problema; do lado dele, o código simplesmente não é válido.
    if (error) return null
    return data?.[0] ? paraEvento(data[0]) : null
  }

  async eventoPorId(id: string): Promise<Evento | null> {
    const { data } = await this.db
      .from('eventos')
      .select(`${CAMPOS_EVENTO}, organizacoes(nome)`)
      .eq('id', id)
      .limit(1)
    return data?.[0] ? paraEvento(data[0]) : null
  }

  async diasDoEvento(eventoId: string): Promise<DiaDeTrabalho[]> {
    const { data } = await this.db
      .from('jornada_dias')
      .select('data, tipo, cancelado, exige_meio')
      .eq('evento_id', eventoId)
      .order('data')

    return (data ?? []).map(d => ({
      data: d.data as string,
      tipo: (d.tipo as 'principal' | 'preparacao') ?? 'preparacao',
      cancelado: d.cancelado === true,
      // Nasce ligado — o padrão da coluna. Ver `LinhaDoDia.exigeMeio`.
      exigeMeio: d.exige_meio !== false,
    }))
  }

  async criarEvento(dados: NovoEventoNoRepositorio): Promise<Evento> {
    const { data, error } = await this.db
      .from('eventos')
      .insert([{
        nome: dados.nome,
        descricao: dados.descricao,
        organizacao_id: dados.organizacaoId,
        local: dados.local,
        data_inicio: dados.dataInicio,
        data_fim: dados.dataFim,
        janela_entrada_inicio: dados.janela_entrada_inicio,
        janela_entrada_fim: dados.janela_entrada_fim,
        janela_fim_inicio: dados.janela_fim_inicio,
        janela_fim_fim: dados.janela_fim_fim,
        codigo_convite: dados.codigoConvite,
      }])
      .select(`${CAMPOS_EVENTO}`)
      .single()

    if (error || !data) throw new Error('Não foi possível criar o evento.')

    // Sem o dia principal, o evento nasce inutilizável — nenhuma batida
    // encontraria jornada nenhuma para valer nele.
    await this.garantirDiaPrincipal(data.id as string, diaBRT(dados.dataInicio))

    return paraEvento(data)
  }

  async atualizarEvento(id: string, dados: EdicaoDeEventoNoRepositorio): Promise<void> {
    await this.db.from('eventos').update({
      nome: dados.nome,
      descricao: dados.descricao,
      local: dados.local,
      data_inicio: dados.dataInicio,
      data_fim: dados.dataFim,
      batida_livre: dados.batida_livre,
      checkin_autonomo: dados.checkin_autonomo,
      janela_entrada_inicio: dados.janela_entrada_inicio,
      janela_entrada_fim: dados.janela_entrada_fim,
      janela_fim_inicio: dados.janela_fim_inicio,
      janela_fim_fim: dados.janela_fim_fim,
    }).eq('id', id)
  }

  async garantirDiaPrincipal(eventoId: string, novaData: string): Promise<void> {
    // O dia antigo vira preparação em vez de sumir — se já tem batida
    // registrada, ela precisa continuar tendo um dia ao qual pertencer.
    await this.db.from('jornada_dias')
      .update({ tipo: 'preparacao' })
      .eq('evento_id', eventoId)
      .eq('tipo', 'principal')
      .neq('data', novaData)

    const { data: existente } = await this.db.from('jornada_dias')
      .select('id, tipo')
      .eq('evento_id', eventoId)
      .eq('data', novaData)
      .maybeSingle()

    if (existente) {
      if (existente.tipo !== 'principal') {
        await this.db.from('jornada_dias').update({ tipo: 'principal' }).eq('id', existente.id as string)
      }
    } else {
      await this.db.from('jornada_dias').insert([{
        evento_id: eventoId, data: novaData, tipo: 'principal', cancelado: false, exige_meio: true,
      }])
    }
  }

  async datasComRegistro(eventoId: string): Promise<Set<string>> {
    const { data } = await this.db.from('registros').select('data_ref').eq('evento_id', eventoId)
    return new Set((data ?? []).map(r => r.data_ref as string))
  }

  async salvarDiasDeTrabalho(eventoId: string, datasFinais: string[]): Promise<void> {
    const { data: existentes } = await this.db
      .from('jornada_dias')
      .select('id, data')
      .eq('evento_id', eventoId)
      .eq('tipo', 'preparacao')

    const atuais = new Map((existentes ?? []).map(d => [d.data as string, d.id as string]))
    const finalSet = new Set(datasFinais)

    const idsParaRemover = [...atuais.entries()].filter(([data]) => !finalSet.has(data)).map(([, id]) => id)
    const datasParaInserir = datasFinais.filter(d => !atuais.has(d))

    if (idsParaRemover.length) {
      await this.db.from('jornada_dias').delete().in('id', idsParaRemover)
    }
    if (datasParaInserir.length) {
      await this.db.from('jornada_dias').insert(
        datasParaInserir.map(data => ({
          evento_id: eventoId, data, tipo: 'preparacao', cancelado: false, exige_meio: true,
        })),
      )
    }
  }

  /**
   * Duas idas ao banco para a página inteira — não uma por evento, que
   * multiplicaria requisição conforme a lista de eventos cresce. Mesma
   * receita de `app/admin/page.tsx` no site. Cada ida pagina com
   * `buscarTudo` — um evento com mais de 1000 pessoas ou 1000 entradas
   * saía subcontado sem aviso nenhum antes disto (achado testando com a
   * base real, que passa de 2000 cadastros).
   */
  async eventosComContagens(
    opcoes: { organizacaoId?: string | null; eventoId?: string },
  ): Promise<EventoComContagens[]> {
    const eventos = await buscarTudo((de, ate) => {
      let query = this.db.from('eventos').select('id, nome, local, data_inicio, organizacao_id, ativo, fornecedores(count)')
        .order('data_inicio', { ascending: false })
        .range(de, ate)

      if (opcoes.eventoId) query = query.eq('id', opcoes.eventoId)
      else if (opcoes.organizacaoId !== undefined && opcoes.organizacaoId !== null) {
        query = query.eq('organizacao_id', opcoes.organizacaoId)
      }
      return query
    })
    const idsDosEventos = eventos.map(e => e.id as string)
    if (!idsDosEventos.length) return []

    const [funcionarios, entradas] = await Promise.all([
      buscarTudo((de, ate) => this.db
        .from('funcionarios').select('id, fornecedores!inner(evento_id)')
        .in('fornecedores.evento_id', idsDosEventos).range(de, ate)),
      buscarTudo((de, ate) => this.db
        .from('registros').select('funcionario_id, evento_id')
        .in('evento_id', idsDosEventos).eq('tipo', 'entrada').range(de, ate)),
    ])

    const equipePorEvento = new Map<string, number>()
    for (const f of funcionarios) {
      const eid = (f.fornecedores as unknown as { evento_id: string })?.evento_id
      if (eid) equipePorEvento.set(eid, (equipePorEvento.get(eid) ?? 0) + 1)
    }
    // Um Set por evento: a mesma pessoa pode ter mais de um registro de entrada.
    const presentesPorEvento = new Map<string, Set<string>>()
    for (const r of entradas) {
      const eid = r.evento_id as string
      if (!presentesPorEvento.has(eid)) presentesPorEvento.set(eid, new Set())
      presentesPorEvento.get(eid)!.add(r.funcionario_id as string)
    }

    return eventos.map(e => ({
      id: e.id as string,
      nome: e.nome as string,
      local: (e.local as string | null) ?? null,
      dataInicio: (e.data_inicio as string | null) ?? null,
      organizacaoId: (e.organizacao_id as string | null) ?? null,
      ativo: e.ativo === true,
      setores: (e.fornecedores as { count: number }[] | null)?.[0]?.count ?? 0,
      equipe: equipePorEvento.get(e.id as string) ?? 0,
      presentes: presentesPorEvento.get(e.id as string)?.size ?? 0,
    }))
  }

  async registrosEntrePeriodo(eventoId: string, de: string, ate: string) {
    const { data } = await this.db
      .from('registros')
      .select('tipo')
      .eq('evento_id', eventoId)
      .gte('created_at', de)
      .lte('created_at', ate)
    return (data ?? []).map(r => ({ tipo: r.tipo as 'entrada' | 'meio' | 'fim' }))
  }

  async registrosDoEventoNoDia(eventoId: string, dataRef: string) {
    const { data } = await this.db
      .from('registros')
      .select('funcionario_id, tipo')
      .eq('evento_id', eventoId)
      .eq('data_ref', dataRef)
    return (data ?? []).map(r => ({
      participacaoId: r.funcionario_id as string,
      tipo: r.tipo as 'entrada' | 'meio' | 'fim',
    }))
  }

  // ── KPIs do Painel do master ────────────────────────────────────────────

  async funcionariosNaBaseTotal(): Promise<number> {
    const linhas = await buscarTudo<{ cpf: string }>((de, ate) =>
      this.db.from('funcionarios').select('cpf').range(de, ate))
    return new Set(linhas.map(l => l.cpf)).size
  }

  async valorCobradoEmEventosAtivos(): Promise<number> {
    const linhas = await buscarTudo<{ valor_receber: number | null }>((de, ate) =>
      this.db
        .from('funcionarios')
        .select('valor_receber, fornecedores!inner(evento_id, eventos!inner(ativo))')
        .eq('fornecedores.eventos.ativo', true)
        .range(de, ate))
    return linhas.reduce((a, l) => a + (Number(l.valor_receber) || 0), 0)
  }

  async custoWhatsappRecente(dias: number): Promise<{ enviados: number; custoEstimado: number }> {
    const corte = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString()

    const agendadas = await buscarTudo<{ tipo: string }>((de, ate) =>
      this.db
        .from('mensagens_agendadas')
        .select('tipo')
        .eq('status', 'enviado')
        .gte('enviado_em', corte)
        .range(de, ate))

    let enviados = 0
    let custoEstimado = 0
    for (const l of agendadas) {
      enviados++
      custoEstimado += PRECO_META_BRL[categoriaWhatsappSimplificada(l.tipo)]
    }

    /*
     * O site também soma os disparos de autenticação que saem direto pela
     * Cloud API (fora da fila `mensagens_agendadas`, em `whatsapp_eventos`),
     * resolvendo a categoria de verdade contra os templates aprovados na
     * Meta Business Manager (uma chamada à API da Meta). Esta API ainda não
     * tem essa credencial ligada — o WhatsApp real foi adiado por decisão
     * sua (ver CLAUDE.md) — então este número FICA SUBESTIMADO enquanto
     * isso não entrar: falta a parcela de autenticação disparada fora da
     * fila. A parcela da fila (a maior parte do volume operacional) já está
     * certa acima.
     */
    return { enviados, custoEstimado }
  }

  async atividadeRecente(eventoIds: string[], limite: number): Promise<AtividadeBruta[]> {
    if (!eventoIds.length) return []
    const { data } = await this.db
      .from('registros')
      .select('id, tipo, created_at, funcionarios(nome, fornecedores(nome))')
      .in('evento_id', eventoIds)
      .order('created_at', { ascending: false })
      .limit(limite)

    return (data ?? []).map(r => {
      const func = r.funcionarios as unknown as { nome: string; fornecedores: { nome: string } | null } | null
      return {
        id: r.id as string,
        nomePessoa: func?.nome ?? '',
        setorNome: func?.fornecedores?.nome ?? null,
        tipo: r.tipo as 'entrada' | 'meio' | 'fim',
        em: r.created_at as string,
      }
    })
  }

  /**
   * A mesma consulta de `linhasDaVisao` no site: a equipe do evento (ou de
   * UM fornecedor só) juntada aos registros DAQUELE DIA — a base das sete
   * visões de Atividades, que filtram esta lista de jeitos diferentes.
   */
  async linhasDoEventoNoDia(eventoId: string, dia: string, equipeId?: string): Promise<LinhaDoDia[]> {
    let equipeQuery = this.db
      .from('funcionarios')
      .select(`${CAMPOS_FUNCIONARIO}, fornecedores!inner(id, nome, evento_id, exige_meio)`)
      .eq('fornecedores.evento_id', eventoId)
      .order('nome')
    if (equipeId) equipeQuery = equipeQuery.eq('fornecedor_id', equipeId)

    const [{ data: equipe }, { data: registros }] = await Promise.all([
      equipeQuery,
      this.db
        .from('registros')
        .select('funcionario_id, tipo, created_at, registro_manual')
        .eq('evento_id', eventoId)
        .eq('data_ref', dia),
    ])

    const porPessoa = new Map<string, Partial<Record<'entrada' | 'meio' | 'fim', BatidaResumida>>>()
    for (const r of registros ?? []) {
      const atual = porPessoa.get(r.funcionario_id as string) ?? {}
      atual[r.tipo as 'entrada' | 'meio' | 'fim'] = { em: r.created_at as string, manual: r.registro_manual === true }
      porPessoa.set(r.funcionario_id as string, atual)
    }

    return (equipe ?? []).map(f => {
      const linha = f as unknown as LinhaFuncionario & {
        fornecedores: { id: string; nome: string; exige_meio: boolean | null }
      }
      const feito = porPessoa.get(linha.id) ?? {}
      return {
        participacaoId: linha.id,
        nome: linha.nome,
        cpf: linha.cpf,
        telefone: linha.telefone,
        setorId: linha.fornecedores.id,
        setorNome: linha.fornecedores.nome,
        // Nasce desligado — o padrão da coluna. Ver `LinhaDoDia.exigeMeio`.
        exigeMeio: linha.fornecedores.exige_meio === true,
        ativo: linha.ativo !== false,
        descredenciadoEm: linha.descredenciado_em,
        entrada: feito.entrada ?? null,
        meio: feito.meio ?? null,
        fim: feito.fim ?? null,
      }
    })
  }

  /**
   * A mesma consulta de `localizarFuncionario` no site: `funcionarios` juntado
   * a `fornecedores` e `eventos`, restrito a eventos ATIVOS — regularizar
   * ponto de evento encerrado não é o caso de uso.
   */
  async participacoesParaLocalizar(
    escopo: { organizacaoId?: string | null; equipeId?: string },
  ): Promise<ParticipacaoParaLocalizar[]> {
    const data = await buscarTudo((de, ate) => {
      let query = this.db
        .from('funcionarios')
        .select(`${CAMPOS_FUNCIONARIO}, fornecedores!inner(id, nome, eventos!inner(id, nome, ativo, organizacao_id))`)
        .eq('fornecedores.eventos.ativo', true)
        .order('nome')
        .range(de, ate)

      if (escopo.equipeId) query = query.eq('fornecedor_id', escopo.equipeId)
      else if (escopo.organizacaoId !== undefined && escopo.organizacaoId !== null) {
        query = query.eq('fornecedores.eventos.organizacao_id', escopo.organizacaoId)
      }
      return query
    })

    return data.map(f => {
      const linha = f as unknown as LinhaFuncionario & {
        fornecedores: { id: string; nome: string; eventos: { id: string; nome: string } }
      }
      return {
        participacaoId: linha.id,
        pessoaId: idDaPessoa(linha.cpf),
        nome: linha.nome,
        cpf: linha.cpf,
        funcao: linha.cargo,
        setorNome: linha.fornecedores.nome,
        eventoId: linha.fornecedores.eventos.id,
        eventoNome: linha.fornecedores.eventos.nome,
        ativo: linha.ativo !== false,
        // Mesma lacuna de `paraParticipacao`, abaixo: o supervisor de um
        // setor vive em `perfis`, não em `funcionarios` — precisaria de uma
        // segunda consulta que a Ficha ainda não pede o bastante para pagar.
        supervisorNome: null,
      }
    })
  }

  // ── Participação ──────────────────────────────────────────────────────────

  async participacoesDaPessoa(pessoaId: string): Promise<Participacao[]> {
    const cpf = cpfDoId(pessoaId)
    if (!cpf) return []

    const { data } = await this.db
      .from('funcionarios')
      .select(`${CAMPOS_FUNCIONARIO}, fornecedores!inner(id, nome, evento_id)`)
      .eq('cpf', cpf)

    return (data ?? []).map(f => paraParticipacao(f as never, pessoaId))
  }

  async participacaoPorId(id: string): Promise<Participacao | null> {
    const { data } = await this.db
      .from('funcionarios')
      .select(`${CAMPOS_FUNCIONARIO}, fornecedores!inner(id, nome, evento_id)`)
      .eq('id', id)
      .limit(1)

    const f = data?.[0] as (LinhaFuncionario & { fornecedores: unknown }) | undefined
    return f ? paraParticipacao(f as never, idDaPessoa(f.cpf)) : null
  }

  async participacaoPorQrToken(token: string): Promise<Participacao | null> {
    const { data } = await this.db
      .from('funcionarios')
      .select(`${CAMPOS_FUNCIONARIO}, fornecedores!inner(id, nome, evento_id)`)
      .eq('qr_token', token)
      .limit(1)

    const f = data?.[0] as (LinhaFuncionario & { fornecedores: unknown }) | undefined
    return f ? paraParticipacao(f as never, idDaPessoa(f.cpf)) : null
  }

  async criarParticipacao(p: Omit<Participacao, 'id'>): Promise<Participacao> {
    const cpf = cpfDoId(p.pessoaId)
    if (!cpf) throw new Error('Pessoa inválida.')

    // Reaproveita nome e telefone do cadastro mais recente — é a promessa da
    // conta permanente: dado que já existe não é pedido de novo.
    const anterior = await this.pessoaPorId(p.pessoaId)

    const { data, error } = await this.db
      .from('funcionarios')
      .insert([{
        fornecedor_id: p.equipeId,
        nome: anterior?.nome ?? '',
        cpf,
        telefone: anterior?.telefone ?? null,
        cargo: p.funcao,
        ativo: p.ativo,
        valor_receber: p.valorReceber,
        qr_token: p.qrToken,
        cidade: p.cidade,
      }])
      .select(`${CAMPOS_FUNCIONARIO}, fornecedores!inner(id, nome, evento_id)`)
      .single()

    if (error || !data) throw new Error('Não foi possível criar a participação.')
    return paraParticipacao(data as never, p.pessoaId)
  }

  async moverParticipacao(participacaoId: string, novoEquipeId: string): Promise<void> {
    const { error } = await this.db.from('funcionarios')
      .update({ fornecedor_id: novoEquipeId })
      .eq('id', participacaoId)
    if (error) throw new Error('Não foi possível mover esta pessoa de setor.')
  }

  async definirPagamentoDaParticipacao(participacaoId: string, pago: boolean): Promise<void> {
    const { error } = await this.db.from('funcionarios')
      .update({ pago, pago_em: pago ? new Date().toISOString() : null })
      .eq('id', participacaoId)
    if (error) throw new Error('Não foi possível atualizar o pagamento.')
  }

  async definirValorAReceberDaParticipacao(participacaoId: string, valor: number): Promise<void> {
    const { error } = await this.db.from('funcionarios')
      .update({ valor_receber: valor })
      .eq('id', participacaoId)
    if (error) throw new Error('Não foi possível salvar o valor.')
  }

  async recredenciarParticipacao(participacaoId: string): Promise<void> {
    const { error } = await this.db.from('funcionarios')
      .update({ descredenciado_em: null })
      .eq('id', participacaoId)
    if (error) throw new Error('Não foi possível recredenciar esta pessoa.')
  }

  async alternarAtivacaoDaParticipacao(participacaoId: string, ativo: boolean): Promise<void> {
    const { error } = await this.db.from('funcionarios')
      .update({ ativo })
      .eq('id', participacaoId)
    if (error) throw new Error(`Não foi possível ${ativo ? 'ativar' : 'desativar'} esta pessoa.`)
  }

  async corrigirTelefoneDaParticipacao(participacaoId: string, telefone: string): Promise<void> {
    const { error } = await this.db.from('funcionarios')
      .update({ telefone })
      .eq('id', participacaoId)
    if (error) throw new Error('Não foi possível corrigir o telefone.')

    /*
     * Mesmo efeito do site (`editarTelefoneFuncionario`): mensagens do
     * WhatsApp já AGENDADAS mas ainda não enviadas guardam o telefone de
     * quando foram agendadas, não o de agora — sem isto, tudo que já está
     * na fila sai pro número antigo, e quem corrigiu vai embora achando
     * que resolveu. O que já foi ENVIADO fica como está: é histórico.
     */
    await this.db.from('mensagens_agendadas')
      .update({ telefone })
      .eq('funcionario_id', participacaoId)
      .eq('status', 'pendente')
  }

  async excluirParticipacaoDeVez(participacaoId: string): Promise<void> {
    const { error } = await this.db.from('funcionarios').delete().eq('id', participacaoId)
    if (error) throw new Error('Não foi possível excluir esta pessoa.')
  }

  async participacaoPorCpfNoEvento(eventoId: string, cpf: string): Promise<{ nome: string; setorNome: string } | null> {
    const { data } = await this.db
      .from('funcionarios')
      .select('nome, fornecedores!inner(evento_id, nome)')
      .eq('cpf', cpf)
      .eq('fornecedores.evento_id', eventoId)
      .limit(1)
    const linha = data?.[0]
    if (!linha) return null
    return { nome: linha.nome as string, setorNome: (linha.fornecedores as unknown as { nome: string }).nome }
  }

  async criarParticipacaoDaImportacao(dados: {
    equipeId: string; nome: string; cpf: string; telefone: string | null
    funcao: string | null; cidade: string | null; valorReceber: number
  }): Promise<Participacao> {
    const { data, error } = await this.db
      .from('funcionarios')
      .insert([{
        fornecedor_id: dados.equipeId,
        nome: dados.nome,
        cpf: dados.cpf,
        telefone: dados.telefone,
        cargo: dados.funcao,
        cidade: dados.cidade,
        valor_receber: dados.valorReceber,
        ativo: true,
        qr_token: randomBytes(16).toString('hex'),
      }])
      .select(`${CAMPOS_FUNCIONARIO}, fornecedores!inner(id, nome, evento_id)`)
      .single()
    if (error || !data) throw new Error('Não foi possível importar esta linha.')
    return paraParticipacao(data as never, idDaPessoa(dados.cpf))
  }

  // ── Batidas ───────────────────────────────────────────────────────────────

  async registroPorId(id: string): Promise<Registro | null> {
    const { data } = await this.db.from('registros').select(CAMPOS_REGISTRO).eq('id', id).limit(1)
    return data?.[0] ? paraRegistro(data[0]) : null
  }

  async registrosDoDia(participacaoId: string, dataRef: string): Promise<Registro[]> {
    const { data } = await this.db
      .from('registros')
      .select(CAMPOS_REGISTRO)
      .eq('funcionario_id', participacaoId)
      .eq('data_ref', dataRef)
      .order('created_at')
    return (data ?? []).map(paraRegistro)
  }

  async registrosDaParticipacao(participacaoId: string): Promise<Registro[]> {
    const { data } = await this.db
      .from('registros')
      .select(CAMPOS_REGISTRO)
      .eq('funcionario_id', participacaoId)
      .order('created_at')
    return (data ?? []).map(paraRegistro)
  }

  /*
   * O mesmo bucket que o credenciei-web já usa (`presencas`, privado, criado
   * pela migração dele — não por nós, ver `docs/backlog.md`). Reaproveitar em
   * vez de criar um novo é o que faz `registros.foto_url` continuar sendo um
   * caminho que os dois sistemas entendem igual, sem tradução.
   */
  private static readonly BUCKET_DE_FOTOS = 'presencas'

  /**
   * Decodifica a data URL que a câmera do app já produz
   * (`data:image/jpeg;base64,...`) e sobe para `caminho`. `upsert: true` troca
   * o arquivo antigo no mesmo caminho em vez de acumular versões — não há
   * histórico de fotos, só a mais recente de cada etapa/dia.
   */
  private async subirFoto(caminho: string, fotoBase64: string): Promise<string> {
    const casada = /^data:(image\/\w+);base64,(.+)$/.exec(fotoBase64)
    if (!casada) throw new Error('Foto em formato inválido.')
    const tipoMime = casada[1]!
    const base64 = casada[2]!

    const { error } = await this.db.storage
      .from(RepositorioSupabase.BUCKET_DE_FOTOS)
      .upload(caminho, Buffer.from(base64, 'base64'), { contentType: tipoMime, upsert: true })
    if (error) throw new Error(`Falha ao subir a foto: ${error.message}`)

    return caminho
  }

  private static extensaoDe(fotoBase64: string): string {
    return /^data:image\/png;base64,/.test(fotoBase64) ? 'png' : 'jpg'
  }

  async subirFotoDoMeio(
    eventoId: string,
    participacaoId: string,
    dataRef: string,
    fotoBase64: string,
  ): Promise<string> {
    // Mesmo esquema de caminho do site para o meio autoatendido: evento/
    // participação/meio-dia.
    const caminho = `${eventoId}/${participacaoId}/meio-${dataRef}.${RepositorioSupabase.extensaoDe(fotoBase64)}`
    return this.subirFoto(caminho, fotoBase64)
  }

  async subirFotoAssistida(
    eventoId: string,
    participacaoId: string,
    tipo: string,
    dataRef: string,
    fotoBase64: string,
  ): Promise<string> {
    // Mesmo esquema do site para o registro assistido: evento/participação/
    // assistido-etapa-dia — prefixo diferente do meio autoatendido para não
    // um sobrescrever o outro no mesmo dia.
    const caminho = `${eventoId}/${participacaoId}/assistido-${tipo}-${dataRef}.${RepositorioSupabase.extensaoDe(fotoBase64)}`
    return this.subirFoto(caminho, fotoBase64)
  }

  async urlDaFoto(caminho: string): Promise<string | null> {
    // Sem `download: true`, ao contrário do link de relatório — aqui a
    // ideia é abrir a foto na hora (o site também abre inline, não baixa).
    const { data, error } = await this.db.storage
      .from(RepositorioSupabase.BUCKET_DE_FOTOS)
      .createSignedUrl(caminho, 15 * 60)
    if (error || !data) return null
    return data.signedUrl
  }

  async gravarRegistro(r: NovoRegistro): Promise<Registro> {
    const part = await this.participacaoPorId(r.participacaoId)
    if (!part) throw new Error('Participação não encontrada.')

    const { data, error } = await this.db
      .from('registros')
      .insert([{
        id: r.id, // o id do APARELHO vira a chave — é a idempotência
        funcionario_id: r.participacaoId,
        evento_id: part.eventoId,
        tipo: r.tipo,
        data_ref: r.dataRef,
        created_at: r.registradoEm,
        foto_url: r.fotoPath,
        latitude: r.lat,
        longitude: r.lng,
        dispositivo: 'app',
        registro_manual: r.manual,
      }])
      .select(CAMPOS_REGISTRO)
      .single()

    /*
     * Chave duplicada não é erro: é a idempotência funcionando.
     *
     * Duas requisições podem chegar ao mesmo tempo com o mesmo id — o app
     * reenviando enquanto a primeira ainda está em voo. A verificação anterior
     * não pega esse caso; o banco pega. Devolver o que já está lá é a resposta
     * certa.
     */
    if (error?.code === '23505') {
      const ja = await this.registroPorId(r.id)
      if (ja) return ja
    }
    if (error || !data) throw new Error('Não foi possível gravar a batida.')
    return paraRegistro(data)
  }

  async apagarRegistro(id: string): Promise<void> {
    await this.db.from('registros').delete().eq('id', id)
  }

  async apagarRegistroDoTipo(participacaoId: string, tipo: 'entrada' | 'meio' | 'fim', dataRef: string): Promise<void> {
    await this.db.from('registros').delete()
      .eq('funcionario_id', participacaoId).eq('tipo', tipo).eq('data_ref', dataRef)
  }

  async apagarFotosVencidas(diasDeRetencao: number, agora: Date): Promise<{ apagadas: number }> {
    const corte = new Date(agora.getTime() - diasDeRetencao * 86_400_000).toISOString()

    // "Fechado" é data_fim; sem data_fim configurado, vale data_inicio —
    // mesma régua de `periodoDoEvento` no domínio.
    const { data: eventosFechados } = await this.db
      .from('eventos')
      .select('id')
      .or(`data_fim.lt.${corte},and(data_fim.is.null,data_inicio.lt.${corte})`)
    const eventoIds = (eventosFechados ?? []).map(e => e.id as string)
    if (!eventoIds.length) return { apagadas: 0 }

    const { data: comFoto } = await this.db
      .from('registros')
      .select('id, foto_url')
      .in('evento_id', eventoIds)
      .not('foto_url', 'is', null)
    const linhas = comFoto ?? []
    if (!linhas.length) return { apagadas: 0 }

    const caminhos = linhas.map(l => l.foto_url as string)
    const { error } = await this.db.storage.from(RepositorioSupabase.BUCKET_DE_FOTOS).remove(caminhos)
    // Uma foto que já não existe no Storage (removida por fora, por exemplo)
    // não pode travar a limpeza do resto — o objetivo é o `foto_url` sumir
    // da linha de qualquer jeito.
    if (error) console.error('[apagarFotosVencidas] falha ao remover do Storage', error.message)

    const ids = linhas.map(l => l.id as string)
    await this.db.from('registros').update({ foto_url: null }).in('id', ids)

    return { apagadas: ids.length }
  }

  // ── Supervisor ────────────────────────────────────────────────────────────

  async participacoesDaEquipe(equipeId: string) {
    const { data } = await this.db
      .from('funcionarios')
      .select(`${CAMPOS_FUNCIONARIO}, fornecedores!inner(id, nome, evento_id)`)
      .eq('fornecedor_id', equipeId)
      .order('nome')

    return (data ?? []).map(f => {
      const linha = f as unknown as LinhaFuncionario
      const pessoaId = idDaPessoa(linha.cpf)
      return {
        ...paraParticipacao(f as never, pessoaId),
        pessoa: {
          id: pessoaId,
          nome: linha.nome,
          cpf: linha.cpf,
          telefone: linha.telefone,
          fotoPath: linha.foto_perfil_path,
        },
      }
    })
  }

  async equipeDoSupervisor(pessoaId: string) {
    const cpf = cpfDoId(pessoaId)
    if (!cpf) return null

    // O supervisor está em `perfis`, não em `funcionarios` — ele tem login.
    const { data } = await this.db
      .from('perfis')
      .select('fornecedor_id, fornecedores(id, nome, evento_id)')
      .eq('cpf', cpf)
      .eq('role', 'supervisor')
      .limit(1)

    const p = data?.[0]
    const f = p?.fornecedores as unknown as { id: string; nome: string; evento_id: string } | null
    return f ? { id: f.id, nome: f.nome, eventoId: f.evento_id } : null
  }

  // ── Acessos ───────────────────────────────────────────────────────────────

  async acessosNoEscopo(organizacaoId?: string | null): Promise<AcessoCompleto[]> {
    let query = this.db
      .from('perfis')
      .select(`${CAMPOS_ACESSO}, fornecedores(nome)`)
      .neq('role', 'master')
      .order('created_at', { ascending: false })
    if (organizacaoId !== undefined && organizacaoId !== null) query = query.eq('organizacao_id', organizacaoId)

    const { data } = await query
    return (data ?? []).map(paraAcesso)
  }

  async acessoPorCpf(cpf: string): Promise<AcessoCompleto | null> {
    const d = soDigitos(cpf)
    if (!d) return null
    const { data } = await this.db.from('perfis').select(`${CAMPOS_ACESSO}, fornecedores(nome)`).eq('cpf', d).maybeSingle()
    return data ? paraAcesso(data) : null
  }

  async definirSituacaoDoAcesso(id: string, ativo: boolean): Promise<AcessoCompleto | null> {
    const { data, error } = await this.db
      .from('perfis')
      .update({ ativo })
      .eq('id', id)
      .select(`${CAMPOS_ACESSO}, fornecedores(nome)`)
      .maybeSingle()
    if (error || !data) return null
    return paraAcesso(data)
  }

  async atualizarAcesso(
    id: string,
    dados: { nome: string; telefone: string; ativo: boolean; permissoesUsuario?: Record<string, boolean> },
  ): Promise<void> {
    const { error } = await this.db.from('perfis')
      .update({
        nome: dados.nome, telefone: dados.telefone, ativo: dados.ativo,
        ...(dados.permissoesUsuario !== undefined ? { permissoes_usuario: dados.permissoesUsuario } : {}),
      })
      .eq('id', id)
    if (error) throw new Error('Não foi possível salvar as alterações deste acesso.')
  }

  async equipesDoEvento(eventoId: string): Promise<{ setorId: string; nome: string; exigeMeio: boolean }[]> {
    const { data } = await this.db
      .from('fornecedores')
      .select('id, nome, exige_meio')
      .eq('evento_id', eventoId)
      .order('nome')
    return (data ?? []).map(f => ({
      setorId: f.id as string,
      nome: f.nome as string,
      // Nasce DESLIGADO — o padrão da coluna. Ver `LinhaDoDia.exigeMeio`.
      exigeMeio: f.exige_meio === true,
    }))
  }

  // ── Batida do meio ────────────────────────────────────────────────────────

  async definirSetoresComMeio(eventoId: string, setorIdsLigados: string[]): Promise<void> {
    await this.db.from('fornecedores').update({ exige_meio: false }).eq('evento_id', eventoId)
    if (setorIdsLigados.length) {
      await this.db.from('fornecedores').update({ exige_meio: true }).in('id', setorIdsLigados)
    }
  }

  async definirDiasComMeio(eventoId: string, datasLigadas: string[]): Promise<void> {
    await this.db.from('jornada_dias').update({ exige_meio: false }).eq('evento_id', eventoId)
    if (datasLigadas.length) {
      await this.db.from('jornada_dias').update({ exige_meio: true }).eq('evento_id', eventoId).in('data', datasLigadas)
    }
  }

  /**
   * Cria a conta de painel de verdade: um usuário no Supabase Auth (senha
   * aleatória e descartada — ninguém a usa, é o convite de senha que ainda
   * falta que resolveria isto, ver o topo de `rotas/acessos.ts`) e a linha
   * em `perfis`. Se a segunda parte falhar, desfaz a primeira: usuário do
   * Auth sem perfil é uma conta fantasma, que nem aparece na lista e nem
   * pode ser recriada (o e-mail já estaria em uso).
   */
  async criarAcesso(dados: NovoAcessoNoRepositorio): Promise<AcessoCompleto> {
    const cpf = soDigitos(dados.cpf)
    const email = cpfParaEmail(cpf)

    const { data: user, error } = await this.db.auth.admin.createUser({
      email,
      password: randomBytes(32).toString('base64url'),
      email_confirm: true,
    })
    if (error || !user?.user) throw new Error(error?.message ?? 'Não foi possível criar o acesso.')

    const { data, error: erroPerfil } = await this.db
      .from('perfis')
      .insert([{
        id: user.user.id,
        nome: dados.nome,
        email,
        cpf,
        telefone: dados.telefone,
        ativo: dados.ativo,
        role: dados.papel,
        organizacao_id: dados.organizacaoId,
        fornecedor_id: dados.setorId ?? null,
        acesso_expira_em: dados.expiraEm ?? null,
        permissoes_usuario: dados.permissoesUsuario,
      }])
      .select(`${CAMPOS_ACESSO}, fornecedores(nome)`)
      .single()

    if (erroPerfil || !data) {
      await this.db.auth.admin.deleteUser(user.user.id).catch(() => {})
      throw new Error('Não foi possível criar o acesso.')
    }

    // Ver o comentário em `reatribuirSupervisorAoSetor`: esta tabela é quem
    // guarda TODOS os setores que o supervisor alcança, não só o atual.
    if (dados.papel === 'supervisor' && dados.setorId) {
      await this.db
        .from('supervisor_setores')
        .upsert({ perfil_id: user.user.id, fornecedor_id: dados.setorId }, { onConflict: 'perfil_id,fornecedor_id' })
    }

    return paraAcesso(data)
  }

  async criarAdmin(dados: NovoAdminNoRepositorio): Promise<AcessoCompleto> {
    const { data: user, error } = await this.db.auth.admin.createUser({
      email: dados.email,
      password: dados.senha,
      email_confirm: true,
    })
    if (error || !user?.user) throw new Error(error?.message ?? 'Não foi possível criar o admin.')

    const { data, error: erroPerfil } = await this.db
      .from('perfis')
      .insert([{
        id: user.user.id,
        nome: dados.nome,
        email: dados.email,
        role: 'admin',
        organizacao_id: dados.organizacaoId,
        ativo: dados.ativo,
      }])
      .select(`${CAMPOS_ACESSO}, fornecedores(nome)`)
      .single()

    if (erroPerfil || !data) {
      await this.db.auth.admin.deleteUser(user.user.id).catch(() => {})
      throw new Error('Não foi possível criar o admin.')
    }
    return paraAcesso(data)
  }

  async definirSenhaDoAcesso(id: string, senha: string): Promise<void> {
    const { error } = await this.db.auth.admin.updateUserById(id, { password: senha })
    if (error) throw new Error('Não foi possível trocar a senha.')
  }

  async excluirAcesso(id: string): Promise<void> {
    // A conta de autenticação primeiro: se a exclusão do perfil falhar depois,
    // fica um perfil órfão (visível, corrigível) — nunca uma conta fantasma
    // que ninguém mais acha pela lista.
    await this.db.auth.admin.deleteUser(id).catch(() => {})
    await this.db.from('perfis').delete().eq('id', id)
  }

  // ── Plataforma (organizações) ──────────────────────────────────────────────

  async organizacoesComContagens(): Promise<OrganizacaoComContagens[]> {
    const { data } = await this.db
      .from('organizacoes')
      .select(`${CAMPOS_ORGANIZACAO}, eventos(count), perfis(nome, email, role)`)
      .order('created_at', { ascending: false })
    return (data ?? []).map(paraOrganizacaoComContagens)
  }

  async organizacaoPorId(id: string): Promise<Organizacao | null> {
    const { data } = await this.db.from('organizacoes').select(CAMPOS_ORGANIZACAO).eq('id', id).maybeSingle()
    return data ? paraOrganizacao(data) : null
  }

  async definirSituacaoDaOrganizacao(id: string, ativa: boolean): Promise<void> {
    await this.db.from('organizacoes').update({ ativo: ativa }).eq('id', id)
  }

  /**
   * Cria a organização e o admin dono dela — a MESMA sequência de
   * `criarAcesso`, com uma diferença: o admin entra com a senha que o master
   * escolheu (não uma descartada), porque é a única conta deste sistema que
   * nasce com uma senha de verdade desde o início.
   */
  async criarOrganizacao(dados: NovaOrganizacaoNoRepositorio): Promise<OrganizacaoComContagens> {
    const { data: org, error: erroOrg } = await this.db
      .from('organizacoes')
      .insert([{
        nome: dados.nome,
        documento: dados.documento,
        responsavel_nome: dados.responsavelNome,
        limite_eventos: dados.limiteEventos,
        valor_cobrado: dados.valorCobrado,
        valor_cobrado_periodo: dados.valorCobradoPeriodo,
      }])
      .select(CAMPOS_ORGANIZACAO)
      .single()
    if (erroOrg || !org) throw new Error('Não foi possível criar a organização.')

    const { data: user, error: erroUser } = await this.db.auth.admin.createUser({
      email: dados.email,
      password: dados.senha,
      email_confirm: true,
    })
    if (erroUser || !user?.user) {
      await this.db.from('organizacoes').delete().eq('id', org.id as string)
      throw new Error(erroUser?.message ?? 'Não foi possível criar o admin desta organização.')
    }

    const { error: erroPerfil } = await this.db
      .from('perfis')
      .insert([{ id: user.user.id, nome: dados.adminNome, email: dados.email, role: 'admin', organizacao_id: org.id }])

    if (erroPerfil) {
      await this.db.auth.admin.deleteUser(user.user.id).catch(() => {})
      await this.db.from('organizacoes').delete().eq('id', org.id as string)
      throw new Error('Não foi possível criar o admin desta organização.')
    }

    return { ...paraOrganizacao(org), eventos: 0, adminNome: dados.adminNome, adminEmail: dados.email }
  }

  // ── Veículos ────────────────────────────────────────────────────────────

  async veiculosDoEvento(eventoId: string): Promise<Veiculo[]> {
    const { data } = await this.db
      .from('veiculos')
      .select('id, placa, modelo, cor, tipo, empresa, observacoes, funcionarios(nome, cpf), veiculo_dias(data)')
      .eq('evento_id', eventoId)
      .order('created_at', { ascending: false })
    return (data ?? []).map(paraVeiculo)
  }

  /**
   * A FOTO AINDA NÃO SOBE AO STORAGE — mesma pendência de `registrarBatida`.
   * `NovoVeiculoNoRepositorio` nem carrega o campo.
   */
  async criarVeiculo(dados: NovoVeiculoNoRepositorio): Promise<Veiculo> {
    const { data: veiculo, error } = await this.db
      .from('veiculos')
      .insert([{
        evento_id: dados.eventoId,
        funcionario_id: dados.participacaoId,
        placa: dados.placa,
        modelo: dados.modelo,
        cor: dados.cor,
        tipo: dados.tipo,
        empresa: dados.empresa,
        observacoes: dados.observacoes,
      }])
      .select('id')
      .single()
    if (error || !veiculo) throw new Error('Não foi possível cadastrar o veículo.')

    if (dados.dias.length) {
      await this.db.from('veiculo_dias').insert(dados.dias.map(data => ({ veiculo_id: veiculo.id, data })))
    }

    return {
      id: veiculo.id as string,
      placa: dados.placa,
      modelo: dados.modelo,
      cor: dados.cor,
      tipo: dados.tipo,
      empresa: dados.empresa,
      observacoes: dados.observacoes,
      condutorNome: dados.condutorNome,
      condutorCpf: dados.condutorCpf,
      dias: dados.dias,
    }
  }

  async excluirVeiculo(veiculoId: string, eventoId: string): Promise<boolean> {
    const { error, count } = await this.db
      .from('veiculos')
      .delete({ count: 'exact' })
      .eq('id', veiculoId)
      .eq('evento_id', eventoId)
    return !error && !!count
  }

  // ── Bloqueio de CPF ─────────────────────────────────────────────────────

  async bloqueiosDoEvento(eventoId: string): Promise<BloqueioDeCpf[]> {
    const { data } = await this.db
      .from('cpfs_bloqueados')
      .select('id, cpf, motivo, created_at, perfis(nome)')
      .eq('evento_id', eventoId)
      .order('created_at', { ascending: false })
    return (data ?? []).map(paraBloqueio)
  }

  async existeBloqueio(eventoId: string, cpf: string): Promise<boolean> {
    const { data } = await this.db.from('cpfs_bloqueados').select('id').eq('evento_id', eventoId).eq('cpf', cpf).limit(1)
    return !!data?.length
  }

  async criarBloqueio(dados: NovoBloqueioNoRepositorio): Promise<BloqueioDeCpf> {
    const { data, error } = await this.db
      .from('cpfs_bloqueados')
      .insert([{ evento_id: dados.eventoId, cpf: dados.cpf, motivo: dados.motivo, bloqueado_por: dados.bloqueadoPorId }])
      .select('id, cpf, motivo, created_at')
      .single()
    if (error || !data) throw new Error('Não foi possível bloquear este CPF.')
    return {
      id: data.id as string,
      cpf: data.cpf as string,
      motivo: (data.motivo as string | null) ?? null,
      criadoEm: data.created_at as string,
      bloqueadoPorNome: dados.bloqueadoPorNome,
    }
  }

  async removerBloqueio(bloqueioId: string, eventoId: string): Promise<boolean> {
    const { error, count } = await this.db
      .from('cpfs_bloqueados')
      .delete({ count: 'exact' })
      .eq('id', bloqueioId)
      .eq('evento_id', eventoId)
    return !error && !!count
  }

  // ── Base de funcionários ────────────────────────────────────────────────

  async todasAsPessoasDaBase(): Promise<PessoaDaBase[]> {
    const data = await buscarTudo((de, ate) => this.db
      .from('funcionarios')
      .select('id, cpf, nome, telefone, cargo, cidade, created_at, fornecedores!inner(evento_id, eventos!inner(organizacao_id))')
      .order('created_at', { ascending: false })
      .range(de, ate))

    const ids = data.map(f => f.id as string)
    const entradas = ids.length
      ? await buscarTudo((de, ate) => this.db
        .from('registros').select('funcionario_id').eq('tipo', 'entrada').in('funcionario_id', ids).range(de, ate))
      : []
    const idsComEntrada = new Set(entradas.map(r => r.funcionario_id as string))

    type Acumulado = {
      cpf: string; nome: string; telefone: string | null; funcao: string | null; cidade: string | null
      eventoIds: Set<string>; eventosComPresenca: Set<string>; orgIds: Set<string>; ultimo: string
    }
    const porCpf = new Map<string, Acumulado>()

    for (const linha of data) {
      const cpf = linha.cpf as string
      const fornecedor = linha.fornecedores as unknown as { evento_id: string; eventos: { organizacao_id: string | null } }
      const criadoEm = linha.created_at as string
      const cidade = linha.cidade as string | null

      const atual = porCpf.get(cpf) ?? {
        cpf, nome: linha.nome as string, telefone: linha.telefone as string | null, funcao: linha.cargo as string | null,
        cidade, eventoIds: new Set<string>(), eventosComPresenca: new Set<string>(), orgIds: new Set<string>(),
        ultimo: criadoEm,
      }
      atual.eventoIds.add(fornecedor.evento_id)
      if (idsComEntrada.has(linha.id as string)) atual.eventosComPresenca.add(fornecedor.evento_id)
      if (fornecedor.eventos?.organizacao_id) atual.orgIds.add(fornecedor.eventos.organizacao_id)
      if (criadoEm > atual.ultimo) atual.ultimo = criadoEm
      if (cidade && !atual.cidade) atual.cidade = cidade
      porCpf.set(cpf, atual)
    }

    return [...porCpf.values()].map(a => ({
      cpf: a.cpf, nome: a.nome, telefone: a.telefone, funcao: a.funcao, cidade: a.cidade,
      eventos: a.eventoIds.size, eventosTrabalhados: a.eventosComPresenca.size,
      organizacoes: a.orgIds.size, ultimoCadastro: a.ultimo,
    }))
  }

  async trabalhosDaPessoa(cpf: string): Promise<TrabalhoNaBase[]> {
    const { data } = await this.db
      .from('funcionarios')
      .select(`${CAMPOS_FUNCIONARIO}, fornecedores!inner(id, nome, evento_id, eventos!inner(id, nome, organizacao_id, data_inicio, data_fim, organizacoes(nome)))`)
      .eq('cpf', cpf)
      .order('created_at', { ascending: false })
    if (!data?.length) return []

    const ids = data.map(f => f.id as string)
    const { data: entradas } = await this.db
      .from('registros').select('funcionario_id').eq('tipo', 'entrada').in('funcionario_id', ids)
    const comEntrada = new Set((entradas ?? []).map(r => r.funcionario_id as string))

    return data.map(l => {
      const fornecedor = l.fornecedores as unknown as {
        id: string; nome: string
        eventos: {
          id: string; nome: string; organizacao_id: string | null; data_inicio: string | null
          data_fim: string | null; organizacoes: { nome?: string } | null
        }
      }
      const evento = fornecedor.eventos
      return {
        participacaoId: l.id as string,
        eventoId: evento.id,
        eventoNome: evento.nome,
        organizacaoId: evento.organizacao_id,
        organizacaoNome: evento.organizacoes?.nome ?? '',
        setorId: fornecedor.id,
        setorNome: fornecedor.nome,
        cargo: l.cargo as string | null,
        dataInicio: evento.data_inicio ?? (l.created_at as string),
        dataFim: evento.data_fim,
        ativo: l.ativo !== false,
        descredenciadoEm: l.descredenciado_em as string | null,
        compareceu: comEntrada.has(l.id as string),
        criadoEm: l.created_at as string,
      }
    })
  }

  async setorPorId(setorId: string): Promise<{ setorId: string; nome: string; eventoId: string } | null> {
    const { data } = await this.db.from('fornecedores').select('id, nome, evento_id').eq('id', setorId).maybeSingle()
    return data ? { setorId: data.id as string, nome: data.nome as string, eventoId: data.evento_id as string } : null
  }

  // ── Cartaz da portaria ────────────────────────────────────────────────────
  //
  // Não é uma tabela própria: é `token_portaria`/`portaria_ativa`, colunas do
  // próprio evento (confirmado no código do site). "Cadastrados" é contado,
  // não guardado — `funcionarios.origem = 'portaria'` marca quem entrou por
  // aqui, e ninguém escreve nessa coluna por fora deste caminho.

  async portariaDoEvento(eventoId: string): Promise<EstadoDaPortaria | null> {
    const { data } = await this.db
      .from('eventos')
      .select('token_portaria, portaria_ativa')
      .eq('id', eventoId)
      .maybeSingle()
    if (!data) return null

    const { count } = await this.db
      .from('funcionarios')
      .select('id, fornecedores!inner(evento_id)', { count: 'exact', head: true })
      .eq('fornecedores.evento_id', eventoId)
      .eq('origem', 'portaria')

    return {
      aberta: data.portaria_ativa === true,
      token: (data.token_portaria as string | null) ?? null,
      cadastrados: count ?? 0,
    }
  }

  async definirPortaria(eventoId: string, estado: { aberta: boolean; token: string | null }): Promise<void> {
    await this.db.from('eventos').update({ portaria_ativa: estado.aberta, token_portaria: estado.token }).eq('id', eventoId)
  }

  // ── Criar setor ────────────────────────────────────────────────────────────

  async criarSetor(dados: NovoSetorNoRepositorio): Promise<SetorCriado> {
    const { data, error } = await this.db
      .from('fornecedores')
      .insert([{
        evento_id: dados.eventoId,
        nome: dados.nome,
        valor_combinado: dados.valorPorPessoa,
        exige_meio: dados.exigeMeio,
      }])
      .select('id, nome, token_formulario')
      .single()
    if (error || !data) throw new Error('Não foi possível criar o setor.')
    return {
      setorId: data.id as string,
      nome: data.nome as string,
      token: (data.token_formulario as string | null) ?? null,
    }
  }

  async excluirSetor(setorId: string): Promise<void> {
    await this.db.from('fornecedores').delete().eq('id', setorId)
  }

  async atualizarSetor(
    setorId: string, dados: { nome: string; valorPorPessoa: number | null; exigeMeio: boolean },
  ): Promise<void> {
    const { error } = await this.db.from('fornecedores')
      .update({ nome: dados.nome, valor_combinado: dados.valorPorPessoa, exige_meio: dados.exigeMeio })
      .eq('id', setorId)
    if (error) throw new Error('Não foi possível salvar as alterações do setor.')
  }

  async alternarLinkDoSetor(setorId: string, ativo: boolean): Promise<void> {
    await this.db.from('fornecedores').update({ link_ativo: ativo }).eq('id', setorId)
  }

  async alternarCadastroPorLink(eventoId: string, suspenso: boolean): Promise<void> {
    await this.db.from('eventos').update({ cadastro_suspenso: suspenso }).eq('id', eventoId)
  }

  async salvarAutorizacaoIndividual(
    setorId: string, eventoId: string, token: string, expiraEm: string,
  ): Promise<void> {
    const hash = createHash('sha256').update(token).digest('hex')
    const { error } = await this.db.from('sistema_estado').insert({
      chave: `cadastro_individual:${hash}`,
      valor: {
        evento_id: eventoId,
        fornecedor_id: setorId,
        criado_em: new Date().toISOString(),
        expira_em: expiraEm,
      },
    })
    if (error) throw new Error('Não foi possível criar o link individual.')
  }

  async reatribuirSupervisorAoSetor(perfilId: string, setorId: string): Promise<AcessoCompleto> {
    const { data, error } = await this.db
      .from('perfis')
      .update({ fornecedor_id: setorId, ativo: true })
      .eq('id', perfilId)
      .select(`${CAMPOS_ACESSO}, fornecedores(nome)`)
      .single()
    if (error || !data) throw new Error('Não foi possível vincular o supervisor a este setor.')

    /*
     * Só ACRESCENTA ao alcance dele — nunca troca o que já tinha.
     *
     * É a correção de um bug real do site: antes desta tabela existir,
     * atribuir um segundo setor a um supervisor apagava silenciosamente o
     * acesso ao primeiro (aconteceu com uma supervisora escalada em 3 bares
     * ao mesmo tempo). `perfis.fornecedor_id` continua sendo só "qual setor
     * ele está vendo agora" — a lista completa fica nesta tabela.
     */
    await this.db
      .from('supervisor_setores')
      .upsert({ perfil_id: perfilId, fornecedor_id: setorId }, { onConflict: 'perfil_id,fornecedor_id' })

    return paraAcesso(data)
  }

  async setoresDoEvento(eventoId: string): Promise<SetorComPessoas[]> {
    const { data } = await this.db
      .from('fornecedores')
      /*
       * `perfis!fornecedor_id`, não `perfis(...)` sozinho: o Postgres tem MAIS
       * DE UM jeito de ligar `fornecedores` a `perfis` (achado em 13/09/2026,
       * conferindo ao vivo — sem o hint, o PostgREST recusa a consulta INTEIRA
       * com "more than one relationship was found", e o evento aparecia sem
       * setor nenhum, silenciosamente).
       */
      .select('id, nome, valor_combinado, token_formulario, link_ativo, exige_meio, funcionarios(count), perfis!fornecedor_id(id, nome, ativo, role, telefone, permissoes_usuario)')
      .eq('evento_id', eventoId)
      .order('nome')

    return (data ?? []).map(f => ({
      setorId: f.id as string,
      nome: f.nome as string,
      pessoas: (f.funcionarios as { count: number }[] | null)?.[0]?.count ?? 0,
      valorPorPessoa: (f.valor_combinado as number | null) ?? null,
      token: (f.token_formulario as string | null) ?? null,
      // `undefined` (linha antiga de antes desta coluna existir) vale como
      // LIGADO — mesma regra do site, para não fechar cadastro sozinho.
      linkAtivo: (f.link_ativo as boolean | null) !== false,
      exigeMeio: f.exige_meio === true,
      supervisores: ((f.perfis as {
        id: string; nome: string; ativo: boolean | null; role: string; telefone: string | null
        permissoes_usuario: Record<string, boolean> | null
      }[] | null) ?? [])
        .filter(p => p.role === 'supervisor')
        .map(p => ({
          id: p.id, nome: p.nome, ativo: p.ativo !== false, telefone: p.telefone,
          permissoesUsuario: p.permissoes_usuario ?? {},
        })),
    }))
  }

  // ── Conferência de equipe ──────────────────────────────────────────────

  async conferenciasDoEvento(eventoId: string): Promise<LinhaConferenciaNoRepositorio[]> {
    const [{ data: setores }, { data: confs }] = await Promise.all([
      this.db.from('fornecedores')
        // `perfis!fornecedor_id` — ver o comentário do mesmo hint em `setoresDoEvento`.
        .select('id, nome, perfis!fornecedor_id(nome, role)')
        .eq('evento_id', eventoId)
        .order('nome'),
      this.db.from('conferencias_equipe')
        .select('fornecedor_id, status, confirmada_em, confirmada_por, total_mantidos, total_removidos')
        .eq('evento_id', eventoId),
    ])

    const confPorSetor = new Map((confs ?? []).map(c => [c.fornecedor_id as string, c]))

    return (setores ?? []).map(s => {
      const supervisor = ((s.perfis as { nome: string; role: string }[] | null) ?? [])
        .find(p => p.role === 'supervisor')
      const c = confPorSetor.get(s.id as string)
      return {
        setorId: s.id as string,
        setorNome: s.nome as string,
        supervisorNome: supervisor?.nome ?? null,
        estado: c ? {
          status: (c.status as 'pendente' | 'confirmada') ?? 'pendente',
          confirmadaEm: (c.confirmada_em as string | null) ?? null,
          confirmadaPorPessoaId: (c.confirmada_por as string | null) ?? null,
          totalMantidos: (c.total_mantidos as number | null) ?? null,
          totalRemovidos: (c.total_removidos as number | null) ?? null,
        } : null,
      }
    })
  }

  async estadoDaConferencia(setorId: string): Promise<EstadoDaConferencia | null> {
    const { data } = await this.db.from('conferencias_equipe')
      .select('status, confirmada_em, confirmada_por, total_mantidos, total_removidos')
      .eq('fornecedor_id', setorId)
      .maybeSingle()
    if (!data) return null
    return {
      status: (data.status as 'pendente' | 'confirmada') ?? 'pendente',
      confirmadaEm: (data.confirmada_em as string | null) ?? null,
      confirmadaPorPessoaId: (data.confirmada_por as string | null) ?? null,
      totalMantidos: (data.total_mantidos as number | null) ?? null,
      totalRemovidos: (data.total_removidos as number | null) ?? null,
    }
  }

  async confirmarConferencia(dados: {
    setorId: string
    eventoId: string
    confirmadoPorPessoaId: string
    mantidos: number
    removidos: number
    agora: string
  }): Promise<void> {
    await this.db.from('conferencias_equipe').upsert({
      fornecedor_id: dados.setorId,
      evento_id: dados.eventoId,
      status: 'confirmada',
      confirmada_por: dados.confirmadoPorPessoaId,
      confirmada_em: dados.agora,
      total_mantidos: dados.mantidos,
      total_removidos: dados.removidos,
    }, { onConflict: 'fornecedor_id' })
  }

  async descredenciarParticipacao(participacaoId: string, agora: string): Promise<void> {
    await this.db.from('funcionarios').update({ descredenciado_em: agora }).eq('id', participacaoId)
  }

  // ── Auditoria ─────────────────────────────────────────────────────────────

  async registrarAuditoria(entrada: NovaEntradaDeAuditoria): Promise<void> {
    /*
     * NUNCA lança — cópia do site's `registrarAuditoria`: uma falha ao
     * gravar auditoria não pode travar a ação de negócio que já aconteceu.
     * Sem o `try/catch` do site (que também lê o IP de `x-forwarded-for`,
     * algo que só existe atrás de proxy HTTP — aqui não temos o request).
     */
    try {
      const { error } = await this.db.from('alteracoes_cadastro').insert([{
        usuario_responsavel: entrada.autorNome,
        usuario_responsavel_id: entrada.autorId,
        organizacao_id: entrada.organizacaoId ?? null,
        evento_id: entrada.eventoId ?? null,
        funcionario_id: entrada.participacaoId ?? null,
        acao: entrada.acao,
        campo_alterado: entrada.campoAlterado ?? null,
        valor_anterior: entrada.valorAnterior ?? null,
        valor_novo: entrada.valorNovo ?? null,
        motivo: entrada.motivo ?? null,
      }])
      if (error) console.error('[auditoria] não gravou', error.message)
    } catch (e) {
      console.error('[auditoria] falha inesperada', e)
    }
  }

  async auditoria(filtro: FiltroDeAuditoria): Promise<LinhaDeAuditoria[]> {
    let consulta = this.db
      .from('alteracoes_cadastro')
      .select('id, created_at, usuario_responsavel, acao, campo_alterado, valor_anterior, valor_novo, motivo, evento_id, eventos(nome)')
      .order('created_at', { ascending: false })
      .limit(filtro.limite ?? 200)

    if (filtro.organizacaoId !== undefined) consulta = consulta.eq('organizacao_id', filtro.organizacaoId)
    if (filtro.autorId !== undefined) consulta = consulta.eq('usuario_responsavel_id', filtro.autorId)
    if (filtro.eventoId !== undefined) consulta = consulta.eq('evento_id', filtro.eventoId)
    if (filtro.desde !== undefined) consulta = consulta.gte('created_at', filtro.desde)

    const { data, error } = await consulta
    if (error) return []
    return (data ?? []).map(l => ({
      id: l.id as string,
      quando: l.created_at as string,
      autorNome: l.usuario_responsavel as string,
      acao: l.acao as string,
      campoAlterado: (l.campo_alterado as string | null) ?? null,
      valorAnterior: (l.valor_anterior as string | null) ?? null,
      valorNovo: (l.valor_novo as string | null) ?? null,
      motivo: (l.motivo as string | null) ?? null,
      eventoId: (l.evento_id as string | null) ?? null,
      eventoNome: (l.eventos as { nome: string }[] | null)?.[0]?.nome ?? null,
    }))
  }

  // ── Push ────────────────────────────────────────────────────────────────

  async registrarTokenDePush(pessoaId: string, token: string, plataforma: 'ios' | 'android'): Promise<void> {
    // Upsert pelo TOKEN — se outra pessoa entrar no mesmo aparelho depois,
    // a mesma linha passa a apontar pra ela, sem duplicar.
    await this.db.from('app_push_tokens').upsert(
      { token, pessoa_id: pessoaId, plataforma, atualizado_em: new Date().toISOString() },
      { onConflict: 'token' },
    )
  }

  // ── Contestação de batida ──────────────────────────────────────────────────

  async criarContestacao(dados: {
    participacaoId: string; tipo: 'entrada' | 'meio' | 'fim'; dataRef: string; motivo: string
  }): Promise<Contestacao> {
    const { data, error } = await this.db.from('app_contestacoes')
      .insert([{
        participacao_id: dados.participacaoId, tipo: dados.tipo, data_ref: dados.dataRef, motivo: dados.motivo,
      }])
      .select('id, participacao_id, tipo, data_ref, motivo, criado_em')
      .single()
    if (error || !data) throw new Error('Não foi possível registrar a contestação.')
    return {
      id: data.id as string,
      participacaoId: data.participacao_id as string,
      tipo: data.tipo as 'entrada' | 'meio' | 'fim',
      dataRef: data.data_ref as string,
      motivo: data.motivo as string,
      criadoEm: data.criado_em as string,
    }
  }

  async contestacoesAbertas(participacaoId: string): Promise<Contestacao[]> {
    const { data } = await this.db.from('app_contestacoes')
      .select('id, participacao_id, tipo, data_ref, motivo, criado_em')
      .eq('participacao_id', participacaoId)
      .is('resolvida_em', null)
      .order('criado_em', { ascending: false })
    return (data ?? []).map(c => ({
      id: c.id as string,
      participacaoId: c.participacao_id as string,
      tipo: c.tipo as 'entrada' | 'meio' | 'fim',
      dataRef: c.data_ref as string,
      motivo: c.motivo as string,
      criadoEm: c.criado_em as string,
    }))
  }

  async contestacaoPorId(id: string): Promise<Contestacao | null> {
    const { data } = await this.db.from('app_contestacoes')
      .select('id, participacao_id, tipo, data_ref, motivo, criado_em')
      .eq('id', id)
      .maybeSingle()
    if (!data) return null
    return {
      id: data.id as string,
      participacaoId: data.participacao_id as string,
      tipo: data.tipo as 'entrada' | 'meio' | 'fim',
      dataRef: data.data_ref as string,
      motivo: data.motivo as string,
      criadoEm: data.criado_em as string,
    }
  }

  async resolverContestacao(id: string, resolvidaPorPessoaId: string): Promise<void> {
    await this.db.from('app_contestacoes')
      .update({ resolvida_em: new Date().toISOString(), resolvida_por: resolvidaPorPessoaId })
      .eq('id', id)
  }
}

// ─── Tradução ────────────────────────────────────────────────────────────────

/*
 * ATENÇÃO: `batida_livre` depende do ALTER TABLE que o sistema web já pede
 * (`supabase/upgrade-batida-livre.sql`, no repositório de produção). Se a
 * coluna não existir no banco, o PostgREST recusa a consulta INTEIRA — não é
 * um campo que volta nulo, é a leitura do evento que para de funcionar.
 */
const CAMPOS_EVENTO =
  'id, nome, descricao, organizacao_id, local, data_inicio, data_fim, ' +
  'janela_entrada_inicio, janela_entrada_fim, janela_fim_inicio, janela_fim_fim, ' +
  'batida_livre, checkin_autonomo, ativo, cadastro_suspenso'

const CAMPOS_FUNCIONARIO =
  'id, nome, cpf, telefone, cargo, empresa, ativo, descredenciado_em, ' +
  'valor_receber, pago, pago_em, foto_perfil_path, qr_token, fornecedor_id, cidade, created_at, chave_pix'

const CAMPOS_REGISTRO =
  'id, funcionario_id, tipo, data_ref, created_at, foto_url, latitude, longitude, registro_manual'

function paraEvento(l: Record<string, unknown>): Evento {
  const org = l.organizacoes as { nome?: string } | null
  return {
    id: l.id as string,
    nome: l.nome as string,
    descricao: (l.descricao as string | null) ?? null,
    organizacaoId: (l.organizacao_id as string | null) ?? null,
    organizacaoNome: org?.nome ?? null,
    local: (l.local as string | null) ?? null,
    dataInicio: (l.data_inicio as string | null) ?? null,
    dataFim: (l.data_fim as string | null) ?? null,
    janela_entrada_inicio: (l.janela_entrada_inicio as string | null) ?? null,
    janela_entrada_fim: (l.janela_entrada_fim as string | null) ?? null,
    janela_fim_inicio: (l.janela_fim_inicio as string | null) ?? null,
    janela_fim_fim: (l.janela_fim_fim as string | null) ?? null,
    // Ausente vira `false`, e não `null`: a regra do domínio testa `=== true`,
    // mas deixar nulo aqui esconderia a diferença entre "desligado" e "coluna
    // não veio" — e as duas precisam ser distinguíveis quando algo der errado.
    batida_livre: (l.batida_livre as boolean | null) ?? false,
    // Mesmo raciocínio: ausente vira `false`, não `null`.
    checkin_autonomo: (l.checkin_autonomo as boolean | null) ?? false,
    codigoConvite: (l.codigo_convite as string | null) ?? null,
    exigeAprovacao: false,
    // Ausente vira `true`: eventos antigos, de antes da coluna existir, não
    // podem "desaparecer" do Painel por uma migração que nem mexeu neles.
    ativo: l.ativo !== false,
    cadastroSuspenso: l.cadastro_suspenso === true,
  }
}

function paraParticipacao(
  l: LinhaFuncionario & { fornecedores: { id: string; nome: string; evento_id: string } },
  pessoaId: string,
): Participacao {
  return {
    id: l.id,
    pessoaId,
    eventoId: l.fornecedores.evento_id,
    equipeId: l.fornecedores.id,
    equipeNome: l.fornecedores.nome,
    funcao: l.cargo,
    supervisorNome: null,
    // `ativo` nulo no banco antigo significa ativo: a coluna foi adicionada
    // depois, e as linhas anteriores a ela ficaram sem valor.
    ativo: l.ativo !== false,
    descredenciadoEm: l.descredenciado_em,
    valorReceber: l.valor_receber,
    pago: l.pago === true,
    pagoEm: l.pago_em,
    qrToken: l.qr_token,
    cidade: l.cidade,
    criadoEm: l.created_at,
    empresa: l.empresa ?? null,
    chavePix: l.chave_pix ?? null,
  }
}

function paraRegistro(l: Record<string, unknown>): Registro {
  return {
    id: l.id as string,
    participacaoId: l.funcionario_id as string,
    tipo: l.tipo as 'entrada' | 'meio' | 'fim',
    dataRef: l.data_ref as string,
    /*
     * `created_at` guarda o horário da BATIDA, não o da linha.
     *
     * O sistema atual grava ali o instante em que a pessoa bateu. A coluna
     * separada para o horário de recebimento ainda não existe, então os dois
     * saem iguais — e a divergência do relógio só passa a ser detectável
     * depois da migração. Está anotado como pendência.
     */
    registradoEm: l.created_at as string,
    recebidoEm: l.created_at as string,
    fotoPath: (l.foto_url as string | null) ?? null,
    lat: (l.latitude as number | null) ?? null,
    lng: (l.longitude as number | null) ?? null,
    manual: l.registro_manual === true,
  }
}

const CAMPOS_ACESSO =
  'id, nome, cpf, telefone, email, role, organizacao_id, ativo, fornecedor_id, created_at, acesso_expira_em, ' +
  'permissoes_usuario'

function paraAcesso(l: Record<string, unknown>): AcessoCompleto {
  const fornecedor = l.fornecedores as { nome?: string } | null
  return {
    id: l.id as string,
    nome: l.nome as string,
    cpf: (l.cpf as string | null) ?? '',
    telefone: (l.telefone as string | null) ?? null,
    email: (l.email as string | null) ?? null,
    papel: l.role as Perfil['papel'],
    organizacaoId: (l.organizacao_id as string | null) ?? null,
    ativo: l.ativo !== false,
    setorId: (l.fornecedor_id as string | null) ?? null,
    setorNome: fornecedor?.nome ?? null,
    // Ver o comentário em `AcessoCompleto.eventos`, no repositório.
    eventos: 1,
    criadoEm: l.created_at as string,
    expiraEm: (l.acesso_expira_em as string | null) ?? null,
    permissoesUsuario: (l.permissoes_usuario as Record<string, boolean> | null) ?? {},
  }
}

const CAMPOS_ORGANIZACAO =
  'id, nome, documento, responsavel_nome, limite_eventos, valor_cobrado, valor_cobrado_periodo, ativo, created_at'

function paraOrganizacao(l: Record<string, unknown>): Organizacao {
  return {
    id: l.id as string,
    nome: l.nome as string,
    documento: (l.documento as string | null) ?? null,
    responsavelNome: (l.responsavel_nome as string | null) ?? null,
    limiteEventos: (l.limite_eventos as number | null) ?? 1,
    valorCobrado: (l.valor_cobrado as number | null) ?? null,
    valorCobradoPeriodo: (l.valor_cobrado_periodo as Organizacao['valorCobradoPeriodo']) ?? null,
    ativo: l.ativo !== false,
    criadaEm: l.created_at as string,
  }
}

function paraVeiculo(l: Record<string, unknown>): Veiculo {
  const condutor = l.funcionarios as { nome: string; cpf: string } | null
  const dias = l.veiculo_dias as { data: string }[] | null
  return {
    id: l.id as string,
    placa: l.placa as string,
    modelo: l.modelo as string,
    cor: (l.cor as string | null) ?? null,
    tipo: (l.tipo as string | null) ?? null,
    empresa: (l.empresa as string | null) ?? null,
    observacoes: (l.observacoes as string | null) ?? null,
    condutorNome: condutor?.nome ?? '',
    condutorCpf: condutor?.cpf ?? '',
    dias: (dias ?? []).map(d => d.data),
  }
}

function paraBloqueio(l: Record<string, unknown>): BloqueioDeCpf {
  const perfil = l.perfis as { nome: string } | null
  return {
    id: l.id as string,
    cpf: l.cpf as string,
    motivo: (l.motivo as string | null) ?? null,
    criadoEm: l.created_at as string,
    bloqueadoPorNome: perfil?.nome ?? null,
  }
}

function paraOrganizacaoComContagens(l: Record<string, unknown>): OrganizacaoComContagens {
  const eventos = l.eventos as { count: number }[] | null
  const perfis = l.perfis as { nome: string; email: string; role: string }[] | null
  const admin = perfis?.find(p => p.role === 'admin') ?? null
  return {
    ...paraOrganizacao(l),
    eventos: eventos?.[0]?.count ?? 0,
    adminNome: admin?.nome ?? null,
    adminEmail: admin?.email ?? null,
  }
}
