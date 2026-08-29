/**
 * A fila de batidas que sobrevive à falta de internet.
 *
 * Não sabe nada de HTTP nem de banco: recebe um jeito de guardar e um jeito de
 * enviar, ambos injetados. É o que permite testá-la inteira sem rede, e usar a
 * mesma fila no celular (SQLite) e no navegador (localStorage).
 */
export { FilaDeBatidas, recuoDaTentativa } from './fila.js'
export type { OpcoesDaFila } from './fila.js'
export type {
  Armazem, BatidaPendente, EstadoBatida,
  Relogio, ResultadoEnvio, TipoBatida, Transporte,
} from './tipos.js'
