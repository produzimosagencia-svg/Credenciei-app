// Conferência de equipe — a janela em que ela abre.
//
// ─── DE ONDE ISTO VEIO ──────────────────────────────────────────────────────
//
// Copiado de `lib/conferencia.ts` no site — a parte pura, sem banco — trazido
// em 11/09/2026. É a tela que o supervisor usa 1 dia antes do evento: vê a
// equipe, tira quem não é dele e confirma que aquela lista está certa.
//
// ─── ABRE 1 DIA ANTES, E NÃO FECHA MAIS ─────────────────────────────────────
//
// A partir de 24h antes do começo do evento. Antes disso a tela mostra "abre
// em…"; depois, continua aberta — não fecha, porque confirmar tarde ainda é
// melhor que não confirmar.

export const ANTECEDENCIA_MS = 24 * 60 * 60 * 1000

export function abreEm(dataInicioIso: string): Date {
  return new Date(new Date(dataInicioIso).getTime() - ANTECEDENCIA_MS)
}

export function conferenciaAberta(dataInicioIso: string, agora = new Date()): boolean {
  return agora.getTime() >= abreEm(dataInicioIso).getTime()
}

/** Quantos dias faltam pro evento começar (pode ser negativo). */
export function diasAteEvento(dataInicioIso: string, agora = new Date()): number {
  return (new Date(dataInicioIso).getTime() - agora.getTime()) / 86_400_000
}
