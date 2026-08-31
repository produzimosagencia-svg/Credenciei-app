// Quem pode o quê.
//
// ─── DE ONDE ISTO VEIO ──────────────────────────────────────────────────────
//
// Copiado de `c:\Dev\credenciei\lib\permissions.ts`, o sistema em produção,
// sem alteração de regra. Está aqui no domínio — e não na API nem no app —
// porque os dois precisam da MESMA resposta: o app usa para montar o menu, a
// API usa para recusar a rota.
//
// Se cada lado tivesse a sua cópia, o dia em que uma mudasse produziria o pior
// dos erros: um menu que mostra o botão e um servidor que recusa o clique.
//
// ─── A HIERARQUIA ───────────────────────────────────────────────────────────
//
//   master        dono da plataforma. Enxerga TODAS as organizações, todos os
//                 eventos, e cria os admins. `organizacao_id` nulo.
//   admin         dono de UMA organização. Vê só os dados dela. Cria a equipe
//                 e os eventos até o limite contratado. NÃO exclui nada.
//   supervisor    vinculado a UM setor. Cuida da equipe daquele setor, e não
//                 vê outro setor, outro evento nem a organização.
//   colaborador   NOVO, e só existe no app. É a pessoa contratada para o
//                 evento. Vê a própria credencial, o próprio ponto e o próprio
//                 pagamento — nada mais. No sistema web ela não tem login: a
//                 credencial chega por um link no WhatsApp.
//
// `gerente` e `cliente` são papéis legados: continuam no banco e continuam
// valendo, mas não são mais oferecidos. `gerente` equivale a admin.

export type Papel =
  | 'master'
  | 'admin'
  | 'supervisor'
  | 'gerente'
  | 'cliente'
  | 'colaborador'

export const NOME_DO_PAPEL: Record<Papel, string> = {
  master: 'Master',
  admin: 'Administrador',
  supervisor: 'Supervisor',
  gerente: 'Gerente',
  cliente: 'Cliente',
  colaborador: 'Colaborador',
}

/** Dono da plataforma: acesso irrestrito a todas as organizações. */
export const ehMaster = (papel?: string) => papel === 'master'

/** É gente de painel? O colaborador não é — ele só vê o que é dele. */
export const ehDePainel = (papel?: string) =>
  papel === 'master' || papel === 'admin' || papel === 'gerente'
  || papel === 'cliente' || papel === 'supervisor'

/** Enxerga todos os eventos do sistema, não só os da própria organização. */
export const veTodosEventos = (papel?: string) => papel === 'master'

/** Pode criar admins, ativar e suspender organizações, definir limites. */
export const podeGerenciarOrganizacoes = (papel?: string) => papel === 'master'

/** Master gerencia admins; admin gerencia a própria equipe. */
export const podeGerenciarUsuarios = (papel?: string) =>
  papel === 'master' || papel === 'admin' || papel === 'gerente'

/** Pode criar e editar eventos, fornecedores, setores e funcionários. */
export const podeGerenciarEventos = (papel?: string) =>
  papel === 'master' || papel === 'admin' || papel === 'gerente' || papel === 'cliente'

/**
 * Pode EXCLUIR qualquer coisa — evento, setor, funcionário, organização.
 *
 * Só o master. Exclusão aqui é sempre em cascata (apagar um setor leva a equipe
 * e as presenças junto) e não tem desfazer. O admin continua podendo ENCERRAR
 * evento e DESATIVAR pessoa, que resolvem o mesmo problema do dia a dia sem
 * destruir histórico. Quando ele precisa apagar de verdade, fala com a
 * plataforma — é a fricção que se quer.
 */
export const podeExcluir = (papel?: string) => papel === 'master'

/**
 * Pode LER o QR e registrar presença pelo scanner.
 *
 * O supervisor ficou de fora a pedido do Juan. Quem credencia é o posto de
 * credenciamento — o supervisor cuida da equipe, não do portão. É a mesma
 * separação que as mensagens já dizem à equipe ("vá ao credenciamento", e não
 * "procure seu supervisor"), valendo também no sistema.
 */
export const podeEscanear = (papel?: string) =>
  papel === 'master' || papel === 'admin' || papel === 'gerente' || papel === 'cliente'

/**
 * Pode ACOMPANHAR a operação: atividades, pendências, histórico e a tela de
 * localizar funcionário.
 *
 * Separado de `podeEscanear` porque são coisas diferentes: uma é registrar
 * presença, a outra é olhar quem já registrou. Tirar o scanner do supervisor
 * não pode cegá-lo em relação à própria equipe — é disso que ele cuida.
 */
export const podeAcompanhar = (papel?: string) =>
  podeEscanear(papel) || papel === 'supervisor'
