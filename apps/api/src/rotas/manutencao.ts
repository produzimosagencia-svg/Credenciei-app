// Rotinas de manutenção — chamadas por um agendador externo (cron-job.org,
// UptimeRobot, etc.), nunca por uma pessoa logada. Por isso a proteção não é
// sessão: é um segredo compartilhado só entre o agendador e esta API.

import type { Repositorio } from '../dados/repositorio.js'

/**
 * Apaga a foto de registros de eventos fechados há mais de 90 dias —
 * decisão do Juan, ADR 003 (`docs/decisoes/003-retencao-de-fotos.md`). A
 * batida (horário, GPS, quem registrou) nunca é apagada, só a imagem.
 *
 * "90 dias" está fixo aqui, e não configurável por evento — é a mesma
 * régua para todo mundo, a ADR não previu exceção.
 */
const DIAS_DE_RETENCAO_DA_FOTO = 90

export async function apagarFotosVencidas(
  repo: Repositorio, agora: Date = new Date(),
): Promise<{ apagadas: number }> {
  return repo.apagarFotosVencidas(DIAS_DE_RETENCAO_DA_FOTO, agora)
}
