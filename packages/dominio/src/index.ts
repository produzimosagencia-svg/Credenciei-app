/**
 * A regra de negócio do Credenciei — a mesma no servidor, na web e no celular.
 *
 * Tudo aqui é PURO: sem banco, sem rede, sem framework. É o que permite a
 * mesma função decidir se alguém pode bater ponto no servidor da Vercel e
 * dentro de um celular em modo avião, sem nenhuma chance de divergirem.
 *
 * O que NÃO entra aqui: qualquer coisa que precise consultar o banco. Essa
 * parte vive na API, que chama estas funções depois de buscar os dados.
 */
export * from './janelas.js'
export * from './credencial-qr.js'
export * from './format.js'
export * from './tz.js'
export * from './codigo-evento.js'
export * from './permissoes.js'
export * from './busca.js'
export * from './conferencia.js'
export * from './capacidades.js'
export * from './gastos.js'
export * from './orcamentos.js'
