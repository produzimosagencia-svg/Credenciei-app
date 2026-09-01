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

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type {
  DiaDeTrabalho, Evento, NovoRegistro, Participacao, Perfil, Pessoa, Registro, Repositorio,
} from './repositorio.js'

const soDigitos = (v: string | null | undefined) => (v ?? '').replace(/\D/g, '')

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
  ativo: boolean | null
  descredenciado_em: string | null
  valor_receber: number | null
  pago: boolean | null
  pago_em: string | null
  foto_perfil_path: string | null
  qr_token: string
  fornecedor_id: string
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
      .select('id, nome, role, organizacao_id, ativo')
      .eq('id', id)
      .maybeSingle()

    if (!data) return null
    return {
      id: data.id as string,
      nome: data.nome as string,
      papel: data.role as Perfil['papel'],
      organizacaoId: (data.organizacao_id as string | null) ?? null,
      // Coluna nova o suficiente para não existir em toda linha antiga —
      // ausente é o mesmo que ativo, nunca o contrário: uma conta virando
      // "bloqueada" por um `null` no meio da migração trancaria gente de
      // fora sem ninguém ter suspendido nada.
      ativo: data.ativo !== false,
    }
  }

  // ── Evento ────────────────────────────────────────────────────────────────

  async eventoPorCodigo(codigo: string): Promise<Evento | null> {
    const { data, error } = await this.db
      .from('eventos')
      .select(`${CAMPOS_EVENTO}, organizacoes(nome)`)
      .eq('codigo_convite', codigo)
      .limit(1)

    /*
     * A coluna `codigo_convite` ainda não existe no banco.
     *
     * Enquanto a migração não roda, a consulta falha — e falhar como "evento
     * não encontrado" é o comportamento certo: nenhum evento tem código ainda,
     * então nenhum código pode valer. Derrubar a API seria pior.
     */
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
      .select('data, tipo, cancelado')
      .eq('evento_id', eventoId)
      .order('data')

    return (data ?? []).map(d => ({
      data: d.data as string,
      tipo: (d.tipo as 'principal' | 'preparacao') ?? 'preparacao',
      cancelado: d.cancelado === true,
    }))
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
      }])
      .select(`${CAMPOS_FUNCIONARIO}, fornecedores!inner(id, nome, evento_id)`)
      .single()

    if (error || !data) throw new Error('Não foi possível criar a participação.')
    return paraParticipacao(data as never, p.pessoaId)
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
}

// ─── Tradução ────────────────────────────────────────────────────────────────

/*
 * ATENÇÃO: `batida_livre` depende do ALTER TABLE que o sistema web já pede
 * (`supabase/upgrade-batida-livre.sql`, no repositório de produção). Se a
 * coluna não existir no banco, o PostgREST recusa a consulta INTEIRA — não é
 * um campo que volta nulo, é a leitura do evento que para de funcionar.
 */
const CAMPOS_EVENTO =
  'id, nome, organizacao_id, local, data_inicio, data_fim, ' +
  'janela_entrada_inicio, janela_entrada_fim, janela_fim_inicio, janela_fim_fim, ' +
  'batida_livre'

const CAMPOS_FUNCIONARIO =
  'id, nome, cpf, telefone, cargo, ativo, descredenciado_em, ' +
  'valor_receber, pago, pago_em, foto_perfil_path, qr_token, fornecedor_id'

const CAMPOS_REGISTRO =
  'id, funcionario_id, tipo, data_ref, created_at, foto_url, latitude, longitude'

function paraEvento(l: Record<string, unknown>): Evento {
  const org = l.organizacoes as { nome?: string } | null
  return {
    id: l.id as string,
    nome: l.nome as string,
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
    codigoConvite: (l.codigo_convite as string | null) ?? null,
    exigeAprovacao: false,
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
  }
}
