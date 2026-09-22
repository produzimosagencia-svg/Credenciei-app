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
//   operador_portao vinculado ao EVENTO inteiro (não a um setor). Só lê QR e
//                 registra ponto manual — nunca gerencia evento, equipe ou
//                 usuários. É o posto de credenciamento em si, sem precisar
//                 de senha de admin. Trazido do site em 11/09/2026.
//   suporte       gente contratada pro dia do evento, pra resolver problema
//                 de operação (CPF errado, ponto que não bateu) sem ser dona
//                 da conta. Corrige a operação; nunca administra. Trazido do
//                 site em 11/09/2026.
//   colaborador   NOVO, e só existe no app. É a pessoa contratada para o
//                 evento. Vê a própria credencial, o próprio ponto e o próprio
//                 pagamento — nada mais. No sistema web ela não tem login: a
//                 credencial chega por um link no WhatsApp.
//
// `gerente` e `cliente` são papéis legados: continuam no banco e continuam
// valendo, mas não são mais oferecidos. `gerente` equivale a admin.
//
// `produtor`  cliente do PRODUTO Gastos, isolado do credenciamento — login
//                 próprio (e-mail+senha, como admin), só enxerga o módulo
//                 Gastos, só os eventos vinculados em `produtor_eventos`.
//                 Trazido do site em 22/09/2026 — ver Epic 19 do backlog.

export type Papel =
  | 'master'
  | 'admin'
  | 'supervisor'
  | 'operador_portao'
  | 'suporte'
  | 'gerente'
  | 'cliente'
  | 'colaborador'
  | 'produtor'

/**
 * O que se pergunta a uma função de capacidade: um papel, ou o acesso
 * inteiro — cópia de `AlvoPermissao` em `c:\Dev\credenciei\lib\permissions.ts`.
 *
 * Passar o ACESSO é o que faz a resposta considerar o que a organização ligou
 * ou desligou na tela de Configurações (`permissoesOrganizacao`) e o que foi
 * decidido para este acesso especificamente (`permissoesUsuario`). Passar só
 * o papel continua valendo — é o padrão do código, sem exceção nenhuma.
 */
export type AlvoPermissao =
  | string
  | {
      papel?: string | null
      /** Exceções da ORGANIZAÇÃO, chaveadas por `papel:chave` — ver `permissoes_organizacao`. */
      permissoesOrganizacao?: Record<string, boolean> | null
      /** Overrides deste ACESSO, chaveados só por `chave` — ver `perfis.permissoes_usuario`. */
      permissoesUsuario?: Record<string, boolean> | null
    }
  | null
  | undefined

export const chaveDaPermissao = (papel: string, chave: string) => `${papel}:${chave}`

/** O papel puro, venha o alvo como string ou como o acesso inteiro. */
export function papelDoAlvo(alvo?: AlvoPermissao): string | undefined {
  return typeof alvo === 'string' ? alvo : (alvo?.papel ?? undefined)
}

/**
 * Resolve uma capacidade em três camadas, da mais específica pra mais geral:
 *
 *   1. override do próprio ACESSO      (permissoesUsuario[chave])
 *   2. exceção da ORGANIZAÇÃO          (permissoesOrganizacao[papel:chave])
 *   3. padrão do código                (a função `padrao(papel)`)
 *
 * A primeira que tiver um booleano vence. Ausência em todas = comportamento
 * de sempre.
 *
 * MASTER NUNCA É AFETADO — mesmo raciocínio do site: uma tela de permissões
 * capaz de tirar do master a permissão de abrir a própria tela de permissões
 * se tranca sozinha, e a saída seria mexer direto no banco.
 */
function resolver(alvo: AlvoPermissao, chave: string, padrao: (papel?: string) => boolean): boolean {
  const papel = papelDoAlvo(alvo)
  if (papel === 'master') return padrao(papel)

  if (typeof alvo !== 'string') {
    const doAcesso = alvo?.permissoesUsuario?.[chave]
    if (typeof doAcesso === 'boolean') return doAcesso
  }

  const excecoes = typeof alvo === 'string' ? null : alvo?.permissoesOrganizacao
  const excecao = papel ? excecoes?.[chaveDaPermissao(papel, chave)] : undefined
  return typeof excecao === 'boolean' ? excecao : padrao(papel)
}

/** Fábrica das capacidades do catálogo: cada uma é "o padrão do código + a exceção". */
function capacidade(chave: string, padrao: (papel?: string) => boolean) {
  return (alvo?: AlvoPermissao) => resolver(alvo, chave, padrao)
}

export const NOME_DO_PAPEL: Record<Papel, string> = {
  master: 'Master',
  admin: 'Administrador',
  supervisor: 'Supervisor',
  operador_portao: 'Operador de portão',
  suporte: 'Suporte de Sistema',
  gerente: 'Gerente',
  cliente: 'Cliente',
  colaborador: 'Colaborador',
  produtor: 'Produtor',
}

/** Dono da plataforma: acesso irrestrito a todas as organizações. */
export const ehMaster = (papel?: string) => papel === 'master'

/** Dono de um acesso de apoio contratado pro evento — nunca administra. */
export const ehSuporte = (papel?: string) => papel === 'suporte'

/** Cliente do produto Gastos — login próprio, só o módulo Gastos, só os eventos vinculados. */
export const ehProdutor = (papel?: string) => papel === 'produtor'

/** É gente de painel? O colaborador não é — ele só vê o que é dele. */
export const ehDePainel = (papel?: string) =>
  papel === 'master' || papel === 'admin' || papel === 'gerente'
  || papel === 'cliente' || papel === 'supervisor'
  || papel === 'operador_portao' || papel === 'suporte' || papel === 'produtor'

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
 *
 * `operador_portao` existe exatamente para ser o posto de credenciamento:
 * escaneia, mas não gerencia nada — ver `podeGerenciarEventos`, que ele NÃO
 * satisfaz. Trazido do site em 11/09/2026.
 *
 * É uma `capacidade` (não um `papel?: string => boolean` cru) desde
 * 13/09/2026: entra no catálogo de "Funções ligadas" (`capacidades.ts`), e
 * por isso precisa resolver as 3 camadas — usuário, organização, código.
 */
export const podeEscanear = capacidade('escanear', papel =>
  papel === 'master' || papel === 'admin' || papel === 'gerente' || papel === 'cliente'
  || papel === 'operador_portao')

/**
 * Pode ACOMPANHAR a operação: atividades, pendências, histórico e a tela de
 * localizar funcionário.
 *
 * Separado de `podeEscanear` porque são coisas diferentes: uma é registrar
 * presença, a outra é olhar quem já registrou. Tirar o scanner do supervisor
 * não pode cegá-lo em relação à própria equipe — é disso que ele cuida.
 *
 * O padrão reaproveita `podeEscanear`, mas com o PAPEL cru (`podeEscanear`
 * chamada aqui dentro só olha a camada 3): cada interruptor da tela de
 * Configurações é independente — liberar "escanear" pra um papel não libera
 * "acompanhar" por tabela.
 */
export const podeAcompanhar = capacidade('acompanhar', papel =>
  podeEscanear(papel) || papel === 'supervisor' || papel === 'suporte')

/**
 * Pode cadastrar/excluir VEÍCULOS autorizados a entrar no evento.
 *
 * Mais estreito que `podeGerenciarEventos` de propósito: fica de fora
 * `gerente` e `cliente`, que gerenciam evento mas não respondem pelo
 * portão. Entra `suporte`, que é justamente quem conserta a operação no
 * dia. Trazido do site em 11/09/2026.
 */
export const podeGerenciarVeiculos = capacidade('gerenciar_veiculos', papel =>
  papel === 'master' || papel === 'admin' || papel === 'suporte')

/**
 * Pode bloquear/liberar um CPF NESTE evento — supervisor, quem gerencia
 * eventos, e suporte.
 *
 * O supervisor entra porque é ele quem vê a pessoa tentando se cadastrar sem
 * estar escalada — mas só nos eventos onde tem setor (o escopo mora em quem
 * chama, não aqui). `operador_portao` fica de fora: ele lê o QR, não decide
 * quem pode se cadastrar. No site esta régua não é uma capacidade do
 * catálogo de Configurações — vive só em `exigirAcessoABloqueio`
 * (lib/actions.ts), local à ação. Trazido em 11/09/2026.
 */
export const podeBloquearCpf = (papel?: string) =>
  podeGerenciarEventos(papel) || papel === 'supervisor' || papel === 'suporte'

/**
 * Pode EXCLUIR alguém da equipe de vez — apaga o cadastro e as batidas,
 * sem volta. Diferente de "tirar da equipe" (descredenciar), que é
 * reversível e todo mundo que gerencia a equipe já pode fazer.
 *
 * O catálogo do site (`podeExcluirDaEquipe`) também lista suporte, mas a
 * rota que usa essa capacidade lá (`exigirAcessoFuncionarios`) não tem
 * nenhum caminho para suporte passar — na prática, só master, admin e
 * supervisor (do próprio setor) chegam a este botão. Copiado o
 * comportamento real, não a lista nominal.
 */
export const podeExcluirDaEquipe = (papel?: string) =>
  papel === 'master' || papel === 'admin' || papel === 'supervisor'

/**
 * Pode usar o módulo Gastos.
 *
 * Gastos é um PRODUTO à parte, com acesso próprio (`produtor`). Nenhum
 * papel operacional do credenciamento (admin, supervisor, suporte) entra
 * aqui — cópia de `podeRegistrarGastos` em `c:\Dev\credenciei\lib\permissions.ts`.
 * `master` continua entrando só pra dar suporte a um produtor com
 * problema. É uma `capacidade` (não um `papel?: string => boolean` cru)
 * pela mesma razão de `podeEscanear`: entra no catálogo de "Funções
 * ligadas", resolvendo as 3 camadas (usuário, organização, código).
 */
export const podeRegistrarGastos = capacidade('registrar_gastos', papel =>
  papel === 'produtor' || papel === 'master')
