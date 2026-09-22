// Ler o crachá no portão — a ação mais repetida do sistema inteiro.
//
// ─── QUEM DECIDE A ETAPA NÃO É O OPERADOR ───────────────────────────────────
//
// Era um botão Entrada/Saída, e o site tirou: esquecer de trocar na hora de
// liberar a equipe fazia a noite inteira sair gravada errada. Quem decide é
// `inferirMomentoDoScanner`, com o histórico de quando aquela pessoa entrou e
// saiu — mesma função que o servidor de mentira usa, então o comportamento
// não pode divergir por acidente.
//
// ─── A SAÍDA NÃO EXIGE MAIS O MEIO ──────────────────────────────────────────
//
// Mudou no site (11/09/2026): a trava travava justamente quem mais precisava
// sair — quem perdeu o meio de verdade ficava preso no evento até alguém
// destravar pelo registro assistido. A ausência continua visível no
// histórico; só deixou de IMPEDIR a saída.
//
// ─── O QUE ESTE ARQUIVO NÃO FAZ AINDA ───────────────────────────────────────
//
// Bloqueio de CPF (`bloquear-cpf`) e o fechamento automático do vínculo na
// saída do dia principal (`descredenciar`) ainda são só do servidor de
// mentira — a API real ainda não tem as tabelas/rotas por trás. Ver
// `docs/backlog.md`.

import {
  avaliarEntradaSaida, diaBRT, ehMaster, faseAtualDoQR, faseConfere, formatarBR,
  inferirMomentoDoScanner, lerCodigoQR, podeEscanear, type RegistroParaInferencia,
} from '@credenciei/dominio'
import type {
  ConferenciaPorCpf, EventoEscaneavel, PessoaLida, ResultadoDaLeitura,
} from '@credenciei/contrato'
import type { Repositorio } from '../dados/repositorio.js'

async function exigirPodeEscanear(repo: Repositorio, pessoaId: string) {
  const perfil = await repo.perfilPorId(pessoaId)
  if (!perfil || !podeEscanear(perfil)) throw new Error('Você não tem permissão para escanear.')
  return perfil
}

/**
 * Este perfil pode escanear NESTE evento?
 *
 * Master alcança qualquer um. O resto (admin, gerente, cliente, operador de
 * portão) só o da própria organização — a régua de `podeEscanearEvento` no
 * site. Supervisor nem chega aqui: `podeEscanear` já o exclui.
 */
async function podeEscanearEvento(
  repo: Repositorio, papel: string, organizacaoId: string | null, eventoOrganizacaoId: string | null,
): Promise<boolean> {
  if (ehMaster(papel)) return true
  return !!organizacaoId && organizacaoId === eventoOrganizacaoId
}

export async function eventosParaEscanear(repo: Repositorio, pessoaId: string): Promise<EventoEscaneavel[]> {
  const perfil = await exigirPodeEscanear(repo, pessoaId)
  const todos = await repo.eventosComContagens(
    ehMaster(perfil.papel) ? {} : { organizacaoId: perfil.organizacaoId },
  )
  return todos.filter(e => e.ativo).map(e => ({ eventoId: e.id, nome: e.nome }))
}

export async function registrarPorQr(
  repo: Repositorio,
  segredoQr: string,
  /** `null` enquanto `c4` (Ed25519) não estiver ligado — ver ADR 009. */
  chavePublicaQrEd25519: Uint8Array | null,
  pessoaId: string,
  eventoId: string,
  codigoLido: string,
  agora: Date = new Date(),
): Promise<ResultadoDaLeitura> {
  const perfil = await exigirPodeEscanear(repo, pessoaId)

  const evento = await repo.eventoPorId(eventoId)
  if (!evento) throw new Error('Evento não encontrado.')
  if (!(await podeEscanearEvento(repo, perfil.papel, perfil.organizacaoId, evento.organizacaoId))) {
    throw new Error('Você não tem acesso a este evento.')
  }

  const hoje = diaBRT(agora)
  // `faseAtualDoQR`, não `faseDoDia`: o evento pode atravessar a meia-noite,
  // e é a fase que decide qual QR a credencial mostra AGORA.
  const faseDeHoje = faseAtualDoQR(agora, evento.dataInicio, evento.dataFim)

  const lido = lerCodigoQR(segredoQr, codigoLido, hoje, chavePublicaQrEd25519, agora)
  if (!lido.ok) return { situacao: 'recusado', mensagem: lido.erro }

  const participacao = await repo.participacaoPorQrToken(lido.token)
  if (!participacao || participacao.eventoId !== eventoId) {
    return { situacao: 'recusado', mensagem: 'Esta credencial não é deste evento. Confira com a produção.' }
  }

  const confere = faseConfere(lido.fase, faseDeHoje)
  if (!confere.ok) {
    return { situacao: 'etapa_errada', doQr: lido.fase ?? '', deHoje: faseDeHoje, mensagem: confere.erro }
  }

  const pessoa = await repo.pessoaPorId(participacao.pessoaId)
  const resumo: PessoaLida = { nome: pessoa?.nome ?? '', funcao: participacao.funcao }

  if (!participacao.ativo) {
    return {
      situacao: 'recusado',
      mensagem: `${resumo.nome || 'Esta pessoa'} ainda não foi ativada neste evento. Ative no painel do setor antes de registrar.`,
    }
  }
  /*
   * Já cumpriu o evento e saiu: o crachá não vale mais aqui. O histórico
   * continua inteiro — o que acabou foi o vínculo com ESTE evento.
   */
  if (participacao.descredenciadoEm) {
    return {
      situacao: 'recusado',
      mensagem: `${resumo.nome} já foi descredenciada deste evento. Para voltar, o organizador precisa `
        + 'recredenciar no painel do setor.',
    }
  }

  const registros = await repo.registrosDaParticipacao(participacao.id)
  const paraInferencia: RegistroParaInferencia[] = registros.map(r => ({
    id: r.id, tipo: r.tipo, em: r.registradoEm, dataRef: r.dataRef,
  }))
  const decisao = inferirMomentoDoScanner(paraInferencia, hoje, agora)

  if ('erro' in decisao) return { situacao: 'recusado', mensagem: decisao.erro }

  if ('reabrir' in decisao) {
    await repo.apagarRegistro(decisao.reabrir.registroId)
    await repo.registrarAuditoria({
      autorId: pessoaId, autorNome: perfil.nome, acao: 'REABERTURA_TURNO',
      campoAlterado: `Turno de ${resumo.nome || 'alguém'}`,
      valorAnterior: `Saída às ${formatarBR(decisao.reabrir.em, 'hora')}`, valorNovo: 'Desfeita — turno reaberto',
      participacaoId: participacao.id, eventoId, organizacaoId: perfil.organizacaoId ?? undefined,
    })
    return {
      situacao: 'reaberto',
      pessoa: resumo,
      mensagem: `Bem-vindo de volta! Turno reaberto — a saída das ${formatarBR(decisao.reabrir.em, 'hora')} foi desfeita.`,
    }
  }

  const momento = decisao.momento

  /*
   * A saída pertence ao DIA DA ENTRADA que ela fecha, não ao dia do relógio.
   *
   * É o que fecha certo o turno da madrugada: quem entrou 22:00 do dia 5 e
   * sai 04:00 do dia 6 fecha o dia 5 — senão a saída abriria um dia 6 sem
   * entrada nenhuma, e o fechamento veria uma jornada partida ao meio.
   */
  const dataRef = momento === 'fim'
    ? [...registros].filter(r => r.tipo === 'entrada').sort((a, b) => b.registradoEm.localeCompare(a.registradoEm))[0]?.dataRef ?? hoje
    : hoje

  /*
   * A MESMA função que valida a entrada/saída assistida e a manual: dia não
   * marcado recusa, preparação é livre, dia principal respeita a batida
   * livre/janela. Sem isto, o scanner aceitaria batida em dia não escalado
   * ou fora do horário combinado — o servidor de mentira ainda não confere
   * isto (ver o topo do arquivo).
   */
  const dia = (await repo.diasDoEvento(eventoId)).find(d => d.data === dataRef) ?? null
  const veredito = avaliarEntradaSaida(evento, dia, momento, dataRef, agora)
  if (!veredito.ok) return { situacao: 'recusado', mensagem: veredito.erro }

  await repo.gravarRegistro({
    id: crypto.randomUUID(),
    participacaoId: participacao.id,
    tipo: momento,
    dataRef,
    registradoEm: agora.toISOString(),
    recebidoEm: agora.toISOString(),
    origem: 'app',
    fotoPath: null,
    lat: null,
    lng: null,
    manual: false,
  })

  return {
    situacao: 'registrado',
    momento,
    pessoa: resumo,
    mensagem: momento === 'entrada' ? 'Entrada registrada' : 'Saída registrada',
  }
}

export async function conferirPorCpf(
  repo: Repositorio, pessoaId: string, eventoId: string, cpf: string, agora: Date = new Date(),
): Promise<ConferenciaPorCpf> {
  const perfil = await exigirPodeEscanear(repo, pessoaId)

  const evento = await repo.eventoPorId(eventoId)
  if (!evento) throw new Error('Evento não encontrado.')
  if (!(await podeEscanearEvento(repo, perfil.papel, perfil.organizacaoId, evento.organizacaoId))) {
    throw new Error('Você não tem acesso a este evento.')
  }

  // O CPF resolve em pessoa, e a pessoa pode ter mais de um cadastro (um por
  // evento) — o que importa aqui é o vínculo justamente com ESTE evento.
  const pessoa = await repo.pessoaPorCpf(cpf)
  const todas = pessoa ? await repo.participacoesDaPessoa(pessoa.id) : []
  const participacao = todas.find(p => p.eventoId === eventoId)

  if (!pessoa || !participacao) {
    return { encontrada: false, mensagem: 'Não encontramos este CPF na equipe deste evento.' }
  }

  const registros = await repo.registrosDaParticipacao(participacao.id)
  const hoje = diaBRT(agora)
  const etapasFeitas = [...new Set(registros.filter(r => r.dataRef === hoje).map(r => r.tipo))]

  return {
    encontrada: true,
    nome: pessoa?.nome ?? '',
    funcao: participacao.funcao,
    setorNome: participacao.equipeNome,
    ativo: participacao.ativo,
    etapasFeitas,
    mensagem: participacao.ativo
      ? `${pessoa?.nome} está credenciada em ${participacao.equipeNome}.`
      : `${pessoa?.nome} está na lista, mas ainda não foi ativada no evento.`,
  }
}
