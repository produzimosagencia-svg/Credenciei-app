// Veículos — só cadastro e consulta.
//
// O veículo não bate ponto, não tem QR e não passa pelo scanner. O condutor
// precisa já estar credenciado NESTE evento — é ele que responde pelo
// veículo, e é por isso que o cadastro sempre começa buscando o CPF dele.

import { ehMaster, podeGerenciarVeiculos } from '@credenciei/dominio'
import type {
  CondutorEncontrado, DadosDeVeiculo, EventoEscaneavel, Veiculo as VeiculoDoContrato, VeiculosDoEvento,
} from '@credenciei/contrato'
import type { Perfil, Repositorio } from '../dados/repositorio.js'

async function exigirPodeGerenciarVeiculos(repo: Repositorio, pessoaId: string): Promise<Perfil> {
  const perfil = await repo.perfilPorId(pessoaId)
  if (!perfil || !podeGerenciarVeiculos(perfil)) {
    throw new Error('Você não tem permissão para gerenciar veículos.')
  }
  return perfil
}

async function exigirAcessoAoEvento(repo: Repositorio, pessoaId: string, eventoId: string) {
  const perfil = await exigirPodeGerenciarVeiculos(repo, pessoaId)
  const evento = await repo.eventoPorId(eventoId)
  if (!evento || (!ehMaster(perfil.papel) && evento.organizacaoId !== perfil.organizacaoId)) {
    throw new Error('Não encontramos este evento.')
  }
  return { perfil, evento }
}

export async function eventosParaVeiculos(repo: Repositorio, pessoaId: string): Promise<EventoEscaneavel[]> {
  const perfil = await exigirPodeGerenciarVeiculos(repo, pessoaId)
  const eventos = await repo.eventosComContagens(ehMaster(perfil.papel) ? {} : { organizacaoId: perfil.organizacaoId })
  return eventos.filter(e => e.ativo).map(e => ({ eventoId: e.id, nome: e.nome }))
}

function paraVeiculo(v: Awaited<ReturnType<Repositorio['veiculosDoEvento']>>[number]): VeiculoDoContrato {
  return { ...v, temFoto: false }
}

export async function veiculosDoEvento(
  repo: Repositorio, pessoaId: string, eventoId: string,
): Promise<VeiculosDoEvento> {
  await exigirAcessoAoEvento(repo, pessoaId, eventoId)
  const [dias, veiculos] = await Promise.all([repo.diasDoEvento(eventoId), repo.veiculosDoEvento(eventoId)])
  return {
    dias: dias.map(d => ({ data: d.data, tipo: d.tipo })),
    veiculos: veiculos.map(paraVeiculo),
  }
}

/**
 * Acha o condutor pelo CPF, DENTRO do evento — é o que preenche o resto do
 * formulário sozinho. Um CPF que existe na base mas não neste evento devolve
 * um erro que diz exatamente isso, e não "não encontrado" genérico: quem
 * está cadastrando o veículo precisa saber que o caminho é credenciar a
 * pessoa primeiro.
 */
export async function buscarCondutorPorCpf(
  repo: Repositorio, pessoaId: string, eventoId: string, cpfDigitado: string,
): Promise<{ condutor?: CondutorEncontrado; erro?: string }> {
  await exigirAcessoAoEvento(repo, pessoaId, eventoId)

  const cpf = (cpfDigitado ?? '').replace(/\D/g, '')
  if (cpf.length !== 11) return { erro: 'O CPF precisa ter 11 dígitos.' }

  const pessoa = await repo.pessoaPorCpf(cpf)
  const participacoes = pessoa ? await repo.participacoesDaPessoa(pessoa.id) : []
  const doEvento = participacoes.find(p => p.eventoId === eventoId && !p.descredenciadoEm)

  if (!pessoa || !doEvento) {
    return {
      erro: 'Este CPF não está credenciado neste evento. Cadastre a pessoa na equipe antes de vincular o veículo a ela.',
    }
  }

  return {
    condutor: {
      participacaoId: doEvento.id,
      nome: pessoa.nome,
      cpf: pessoa.cpf,
      funcao: doEvento.funcao,
      setorNome: doEvento.equipeNome,
      // LIMITE CONHECIDO: `Participacao` não carrega a empresa do condutor —
      // ver `Repositorio.Participacao`. A tela mostra o campo em branco.
      empresa: null,
    },
  }
}

/** Placa brasileira: o formato antigo (ABC1234) e o Mercosul (ABC1D23) convivem. */
const FORMATO_DA_PLACA = /^[A-Z]{3}\d[A-Z0-9]\d{2}$/

export async function cadastrarVeiculo(
  repo: Repositorio, pessoaId: string, eventoId: string, dados: DadosDeVeiculo,
): Promise<{ placa?: string; condutor?: string; erro?: string }> {
  await exigirAcessoAoEvento(repo, pessoaId, eventoId)

  const placa = (dados.placa ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  const modelo = (dados.modelo ?? '').trim()

  if (!FORMATO_DA_PLACA.test(placa)) {
    return { erro: 'Placa inválida. Use o formato ABC1D23 (Mercosul) ou ABC1234.' }
  }
  if (modelo.length < 2) return { erro: 'Informe o modelo do veículo.' }

  const achado = await buscarCondutorPorCpf(repo, pessoaId, eventoId, dados.cpf)
  if (!achado.condutor) return { erro: achado.erro }

  // Índice único (evento, placa) — a mesma placa duas vezes no mesmo evento
  // seria dois cadastros para um veículo só.
  const existentes = await repo.veiculosDoEvento(eventoId)
  if (existentes.some(v => v.placa === placa)) {
    return { erro: `A placa ${placa} já está cadastrada neste evento.` }
  }

  const veiculo = await repo.criarVeiculo({
    eventoId,
    participacaoId: achado.condutor.participacaoId,
    placa,
    modelo,
    cor: dados.cor?.trim() || null,
    tipo: dados.tipo?.trim() || null,
    empresa: dados.empresa?.trim() || null,
    observacoes: dados.observacoes?.trim() || null,
    dias: dados.dias ?? [],
    condutorNome: achado.condutor.nome,
    condutorCpf: achado.condutor.cpf,
  })

  return { placa: veiculo.placa, condutor: veiculo.condutorNome }
}

export async function excluirVeiculo(
  repo: Repositorio, pessoaId: string, veiculoId: string, eventoId: string,
): Promise<{ erro?: string }> {
  await exigirAcessoAoEvento(repo, pessoaId, eventoId)
  const apagou = await repo.excluirVeiculo(veiculoId, eventoId)
  if (!apagou) return { erro: 'Não encontramos este veículo.' }
  return {}
}
