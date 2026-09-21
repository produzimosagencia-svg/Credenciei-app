// Os rótulos da trilha de auditoria — cópia de
// `c:\Dev\credenciei\lib\auditoria-rotulos.ts`, com duas entradas que o
// próprio arquivo do site esquece (`ALTERACAO_EVENTO`, usado por
// `toggleAtivoEvento`, e `REABERTURA_CADASTRO_INDIVIDUAL`, usado por
// `criarLinkCadastroIndividual`) — sem elas, essas duas ações cairiam no
// código cru (`l.acao`) na tela, igual acontece no site hoje.

export const ACAO_LABELS: Record<string, string> = {
  ALTERACAO_CPF: 'Correção de CPF',
  ALTERACAO_NOME: 'Correção de nome',
  ALTERACAO_TELEFONE: 'Correção de telefone',
  ALTERACAO_SETOR: 'Mudança de setor',
  ALTERACAO_EVENTO: 'Status do evento',
  ATIVACAO_FUNCIONARIO: 'Ativação',
  DESATIVACAO_FUNCIONARIO: 'Desativação',
  CADASTRO_EMERGENCIAL: 'Cadastro emergencial',
  REGISTRO_ENTRADA_ASSISTIDA: 'Entrada assistida',
  REGISTRO_SAIDA_ASSISTIDA: 'Saída assistida',
  CORRECAO_PONTO: 'Correção de ponto',
  DESCREDENCIAMENTO: 'Descredenciamento',
  EXCLUSAO_FUNCIONARIO: 'Funcionário excluído',
  BLOQUEIO_CPF: 'CPF bloqueado',
  DESBLOQUEIO_CPF: 'CPF liberado',
  EXCLUSAO_PONTO: 'Batida apagada',
  RESET_SENHA: 'Redefinição de senha',
  ALTERACAO_SUPERVISOR: 'Alteração de supervisor',
  ALTERACAO_PERMISSAO: 'Permissão alterada',
  REABERTURA_TURNO: 'Voltou a trabalhar (turno reaberto)',
  REABERTURA_CADASTRO_INDIVIDUAL: 'Cadastro individual reaberto',
}

/**
 * O tom do selo — cópia da régua visual do site (`TOM_DA_ACAO`): vermelho
 * para exclusão/bloqueio, âmbar para mudança de situação, verde para
 * ativação/desbloqueio, neutro para o resto.
 */
export function tomDaAcao(acao: string): 'erro' | 'aviso' | 'sucesso' | 'info' {
  if (acao.startsWith('EXCLUSAO_') || acao === 'BLOQUEIO_CPF') return 'erro'
  if (acao === 'DESATIVACAO_FUNCIONARIO' || acao === 'DESCREDENCIAMENTO' || acao === 'ALTERACAO_PERMISSAO') return 'aviso'
  if (acao === 'ATIVACAO_FUNCIONARIO' || acao === 'DESBLOQUEIO_CPF' || acao.startsWith('REGISTRO_')) return 'sucesso'
  return 'info'
}
