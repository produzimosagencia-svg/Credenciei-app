// Registrar presença por outra pessoa — quando o crachá não passa e o
// colaborador está na frente de quem atende.
//
// ─── QUEM ESCOLHE A ETAPA É O OPERADOR, NÃO O SERVIDOR ──────────────────────
//
// Ao contrário do scanner (`registrarPorQr`), aqui existia uma trava ("grava
// só a pendente calculada") pensada contra erro; na operação real virou o
// problema oposto: sem QR na hora, pode faltar entrada, meio OU saída, e a
// "próxima" calculada nem sempre é a que aconteceu de verdade. Mudou no site
// em 11/09/2026: quem decide a etapa é quem está vendo a pessoa. Escolher uma
// etapa que já tem registro SOBRESCREVE o horário — é correção, não
// duplicata.
//
// Por isso também não valida janela de horário, de propósito: existe
// justamente para o caso em que a janela já fechou. O que sustenta a
// confiança aqui é a foto e a trilha, não a hora.
//
// ─── O QUE ESTE ARQUIVO NÃO FAZ AINDA ───────────────────────────────────────
//
// O fechamento automático do vínculo na saída do dia principal
// (`descredenciar`) ainda é só do servidor de mentira. Ver `docs/backlog.md`.
// A auditoria (13/09/2026) já está ligada — ver `registrarAuditoria` abaixo.

import {
  diaBRT, diaDeReferenciaAssistida, distanciaEntreCpfs, podeAcompanhar, ehMaster, formatarBR,
  TOLERANCIA_DE_CPF, type RegistroParaInferencia,
} from '@credenciei/dominio'
import type { BatidaAssistida, CandidatoLocalizado, FichaLocalizada, TipoBatida } from '@credenciei/contrato'
import type { ParticipacaoParaLocalizar, Perfil, Repositorio } from '../dados/repositorio.js'

/** Lista maior que isso não se escolhe, se refina — mesmo teto do site. */
const MAX_CANDIDATOS = 25

const ORDEM_DAS_ETAPAS: TipoBatida[] = ['entrada', 'meio', 'fim']

const ROTULO_DA_ETAPA: Record<TipoBatida, string> = {
  entrada: 'Entrada',
  meio: 'Meio do evento',
  fim: 'Saída',
}

async function exigirPodeAcompanhar(repo: Repositorio, pessoaId: string): Promise<Perfil> {
  const perfil = await repo.perfilPorId(pessoaId)
  if (!perfil || !podeAcompanhar(perfil)) throw new Error('Você não tem permissão para localizar pessoas.')
  return perfil
}

/**
 * O recorte de quem procura, na mesma régua do resto da API: master vê
 * tudo; supervisor só a PRÓPRIA equipe (`null` quando não tem nenhuma —
 * devolve lista vazia, não todo mundo); o resto, só a própria organização.
 */
async function escopoDeLocalizacao(
  repo: Repositorio, perfil: Perfil,
): Promise<{ organizacaoId?: string | null; equipeId?: string } | null> {
  if (ehMaster(perfil.papel)) return {}
  if (perfil.papel === 'supervisor') {
    const equipe = await repo.equipeDoSupervisor(perfil.id)
    return equipe ? { equipeId: equipe.id } : null
  }
  return { organizacaoId: perfil.organizacaoId }
}

function semAcento(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

function paraCandidato(p: ParticipacaoParaLocalizar, aproximado = false): CandidatoLocalizado {
  return {
    participacaoId: p.participacaoId,
    nome: p.nome,
    cpf: p.cpf,
    funcao: p.funcao,
    setorNome: p.setorNome,
    eventoNome: p.eventoNome,
    ...(aproximado ? { cpfAproximado: true } : {}),
  }
}

async function montarFicha(repo: Repositorio, item: ParticipacaoParaLocalizar, agora: Date): Promise<FichaLocalizada> {
  const registros = await repo.registrosDaParticipacao(item.participacaoId)
  const hoje = diaBRT(agora)
  const paraInferencia: RegistroParaInferencia[] = registros.map(r => ({
    id: r.id, tipo: r.tipo, em: r.registradoEm, dataRef: r.dataRef,
  }))

  /*
   * As etapas mostradas são as do TURNO ATUAL (aberto), não as do dia do
   * relógio — senão a ficha de quem trabalha virando a madrugada mostraria
   * "nada registrado hoje" com o turno de ontem ainda em andamento.
   */
  const diaDoTurno = diaDeReferenciaAssistida(paraInferencia, undefined, hoje, agora)
  const feitas = new Map(registros.filter(r => r.dataRef === diaDoTurno).map(r => [r.tipo, r.registradoEm]))
  const pendente = ORDEM_DAS_ETAPAS.find(e => !feitas.has(e)) ?? null

  // A última = a mais recente no relógio, não a última da ordem das etapas:
  // alguém pode ter batido o meio sem ter batido a entrada (correção prévia).
  const ultima = [...feitas.entries()].sort((a, b) => b[1].localeCompare(a[1]))[0] ?? null

  return {
    participacaoId: item.participacaoId,
    nome: item.nome,
    cpf: item.cpf,
    funcao: item.funcao,
    fotoUrl: null,
    ativo: item.ativo,
    setorNome: item.setorNome,
    eventoNome: item.eventoNome,
    supervisorNome: item.supervisorNome,
    ultimaBatida: ultima ? { rotulo: ROTULO_DA_ETAPA[ultima[0]], quandoISO: ultima[1] } : null,
    etapas: ORDEM_DAS_ETAPAS.map(tipo => ({
      tipo, rotulo: ROTULO_DA_ETAPA[tipo], quandoISO: feitas.get(tipo) ?? null,
    })),
    proximaPendente: pendente ? { tipo: pendente, rotulo: ROTULO_DA_ETAPA[pendente] } : null,
  }
}

/**
 * Localiza alguém para o registro assistido, por CPF **ou** por nome.
 *
 * Nome quase nunca é único ("Silva" pega vários), então pode devolver uma
 * lista pra escolher em vez de uma pessoa só. CPF completo cai direto na
 * ficha — o caminho rápido de quem já tem o documento na mão.
 */
export async function localizarPessoa(
  repo: Repositorio,
  pessoaId: string,
  termo: string,
  agora: Date = new Date(),
): Promise<{ ficha?: FichaLocalizada; candidatos?: CandidatoLocalizado[]; erro?: string }> {
  const perfil = await exigirPodeAcompanhar(repo, pessoaId)

  const busca = (termo ?? '').trim()
  if (busca.length < 3) {
    return { erro: 'Digite pelo menos três letras do nome, ou o CPF completo.' }
  }

  const escopo = await escopoDeLocalizacao(repo, perfil)
  const todos = escopo ? await repo.participacoesParaLocalizar(escopo) : []

  const digitos = busca.replace(/\D/g, '')
  const porCpf = digitos.length === 11 ? todos.filter(p => p.cpf === digitos) : []
  const achados = porCpf.length > 0
    ? porCpf
    : todos.filter(p => semAcento(p.nome).includes(semAcento(busca)))

  /*
   * Rede de segurança para CPF digitado errado NO CADASTRO.
   *
   * O documento na mão do operador está certo — a consulta exata é que não
   * acha uma linha gravada com um algarismo trocado. Só entra quando a busca
   * exata por CPF completo não achou nada: nunca troca uma resposta exata
   * por uma aproximada.
   */
  if (achados.length === 0 && digitos.length === 11) {
    const aproximados = todos.filter(p => distanciaEntreCpfs(p.cpf, digitos) <= TOLERANCIA_DE_CPF)
    if (aproximados.length > 0) {
      // Nunca escolhe sozinho, mesmo com um candidato só: a tela mostra nome,
      // CPF salvo e setor para o operador confirmar quem está na frente dele.
      return { candidatos: aproximados.slice(0, MAX_CANDIDATOS).map(p => paraCandidato(p, true)) }
    }
  }

  if (achados.length === 0) {
    return { erro: 'Ninguém encontrado. Confira o CPF, ou tente parte do nome.' }
  }

  // Uma só: abre direto. Mais de uma: quem escolhe é quem está olhando para a
  // pessoa — nome quase nunca é único, e errar de pessoa aqui grava a
  // presença de quem não veio.
  if (achados.length === 1) return { ficha: await montarFicha(repo, achados[0]!, agora) }
  return { candidatos: achados.slice(0, MAX_CANDIDATOS).map(p => paraCandidato(p)) }
}

/** Carrega a ficha completa depois que o operador escolhe alguém da lista. */
export async function abrirFicha(
  repo: Repositorio,
  pessoaId: string,
  participacaoId: string,
  agora: Date = new Date(),
): Promise<{ ficha?: FichaLocalizada; erro?: string }> {
  const perfil = await exigirPodeAcompanhar(repo, pessoaId)
  const escopo = await escopoDeLocalizacao(repo, perfil)
  const todos = escopo ? await repo.participacoesParaLocalizar(escopo) : []

  const item = todos.find(p => p.participacaoId === participacaoId)
  // Fora do alcance responde igual a inexistente — senão, trocar o id vira
  // uma forma de descobrir quem está cadastrado.
  if (!item) return { erro: 'Não encontramos esta pessoa.' }
  return { ficha: await montarFicha(repo, item, agora) }
}

export async function registrarPresencaAssistida(
  repo: Repositorio,
  pessoaId: string,
  participacaoId: string,
  dados: BatidaAssistida,
  agora: Date = new Date(),
): Promise<{ nome?: string; etapa?: string; erro?: string }> {
  const perfil = await exigirPodeAcompanhar(repo, pessoaId)
  const escopo = await escopoDeLocalizacao(repo, perfil)
  const todos = escopo ? await repo.participacoesParaLocalizar(escopo) : []

  const item = todos.find(p => p.participacaoId === participacaoId)
  if (!item) return { erro: 'Não encontramos esta pessoa.' }
  if (!item.ativo) return { erro: `${item.nome} ainda não foi ativada neste evento.` }

  // Etapa inválida — nunca confia cegamente no que a tela mandou, mesmo aqui,
  // onde é o operador que escolhe.
  if (!ORDEM_DAS_ETAPAS.includes(dados.tipo)) return { erro: 'Etapa inválida.' }

  /*
   * Sem foto, não registra.
   *
   * É a única prova de que o colaborador estava na frente de quem registrou.
   * Sem ela, registrar por terceiro seria só digitar um nome — e uma batida
   * que ninguém consegue contestar é uma porta aberta.
   */
  if (!dados.fotoBase64) {
    return { erro: 'A foto do rosto é obrigatória para registrar por outra pessoa.' }
  }

  const registros = await repo.registrosDaParticipacao(item.participacaoId)
  const hoje = diaBRT(agora)
  const paraInferencia: RegistroParaInferencia[] = registros.map(r => ({
    id: r.id, tipo: r.tipo, em: r.registradoEm, dataRef: r.dataRef,
  }))
  const dataRef = diaDeReferenciaAssistida(paraInferencia, dados.tipo, hoje, agora)

  /*
   * Escolher uma etapa que já tem registro SOBRESCREVE o horário — é
   * correção, não duplicata. Apaga a antiga (se existir) e grava por cima,
   * no mesmo espírito do índice único do banco de produção.
   */
  const fotoPath = await repo.subirFotoAssistida(
    item.eventoId, item.participacaoId, dados.tipo, dataRef, dados.fotoBase64,
  )

  await repo.apagarRegistroDoTipo(item.participacaoId, dados.tipo, dataRef)
  await repo.gravarRegistro({
    id: crypto.randomUUID(),
    participacaoId: item.participacaoId,
    tipo: dados.tipo,
    dataRef,
    registradoEm: agora.toISOString(),
    fotoPath,
    lat: dados.lat ?? null,
    lng: dados.lng ?? null,
    manual: true,
  })

  // Entrada/saída ganham ação própria; "meio" reaproveita CORRECAO_PONTO —
  // mesma régua do site (`registrarPresencaAssistida`).
  const ACAO_POR_ETAPA: Record<TipoBatida, string> = {
    entrada: 'REGISTRO_ENTRADA_ASSISTIDA', fim: 'REGISTRO_SAIDA_ASSISTIDA', meio: 'CORRECAO_PONTO',
  }
  await repo.registrarAuditoria({
    autorId: pessoaId, autorNome: perfil.nome, acao: ACAO_POR_ETAPA[dados.tipo],
    campoAlterado: `${ROTULO_DA_ETAPA[dados.tipo]} de ${item.nome}`,
    valorNovo: formatarBR(agora.toISOString(), 'completo'),
    participacaoId: item.participacaoId, eventoId: item.eventoId, organizacaoId: perfil.organizacaoId ?? undefined,
  })

  return { nome: item.nome, etapa: ROTULO_DA_ETAPA[dados.tipo] }
}
