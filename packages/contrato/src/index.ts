/**
 * O contrato entre o aplicativo e o servidor.
 *
 * Escrito antes da API existir, de propósito: é aqui que se decide o que o app
 * PODE pedir — e, por consequência, o que ele nunca vai conseguir ver.
 */
export type { ClienteApi } from './cliente.js'
export { ClienteFalso } from './cliente-falso.js'
export { ClienteHttp, FalhaDeTransporte, AindaNaoNaApi } from './cliente-http.js'
export type { OpcoesDoClienteHttp } from './cliente-http.js'
export type { ComportamentoFalso, ContaDeDemonstracao } from './cliente-falso.js'
export { CONTAS_DE_DEMONSTRACAO, SENHA_DE_DEMONSTRACAO } from './cliente-falso.js'
export { credenciaisDeDemonstracao } from './cliente-falso.js'
export type { CredencialDeDemonstracao } from './cliente-falso.js'
export type * from './tipos.js'
export { VISOES_DE_ATIVIDADE } from './tipos.js'
export type { TipoBatida } from './comum.js'
