// A data por extenso — "domingo, 30 de agosto".
//
// ─── POR QUE NÃO É O `extensoBR` DO DOMÍNIO ─────────────────────────────────
//
// Porque aquele usa `toLocaleDateString` com fuso, e isso depende do Intl com
// dados de idioma completos. No servidor e no navegador existe; no celular, o
// motor JavaScript do React Native pode vir sem os dados de português — e o
// resultado silencioso é uma data em inglês, ou o fuso ignorado, virando o dia.
//
// Aqui os nomes são escritos à mão e a conta é aritmética. Menos elegante,
// impossível de sair errado.

const DIAS = [
  'domingo', 'segunda-feira', 'terça-feira', 'quarta-feira',
  'quinta-feira', 'sexta-feira', 'sábado',
]

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

const MESES_CURTOS = [
  'jan', 'fev', 'mar', 'abr', 'mai', 'jun',
  'jul', 'ago', 'set', 'out', 'nov', 'dez',
]

/** Três horas: o Brasil não tem mais horário de verão desde 2019. */
const OFFSET_MS = 3 * 60 * 60 * 1000

/** Os componentes da data no horário de Brasília, sem depender do Intl. */
function partes(iso: string | Date) {
  const br = new Date(new Date(iso).getTime() - OFFSET_MS)
  return {
    diaDaSemana: br.getUTCDay(),
    dia: br.getUTCDate(),
    mes: br.getUTCMonth(),
    ano: br.getUTCFullYear(),
  }
}

/** "domingo, 30 de agosto" — o subtítulo do painel. */
export function porExtenso(iso: string | Date): string {
  const { diaDaSemana, dia, mes } = partes(iso)
  return `${DIAS[diaDaSemana]}, ${dia} de ${MESES[mes]}`
}

/** "05 de set. de 2026" — a data curta dos cartões de evento. */
export function dataCurta(iso: string | Date): string {
  const { dia, mes, ano } = partes(iso)
  return `${String(dia).padStart(2, '0')} de ${MESES_CURTOS[mes]}. de ${ano}`
}

/**
 * "há 3 min", "há 2 h", "ontem".
 *
 * A atividade recente é lida de relance, e "18:04" obriga quem lê a fazer a
 * conta de cabeça para saber se aquilo foi agora ou de manhã. O horário exato
 * continua aparecendo ao lado — o relativo é o que responde primeiro.
 */
export function haQuantoTempo(iso: string | Date, agora: number = Date.now()): string {
  const minutos = Math.floor((agora - new Date(iso).getTime()) / 60_000)
  if (minutos < 0) return 'agora'
  if (minutos < 1) return 'agora'
  if (minutos < 60) return `há ${minutos} min`
  const horas = Math.floor(minutos / 60)
  if (horas < 24) return `há ${horas} h`
  const dias = Math.floor(horas / 24)
  if (dias === 1) return 'ontem'
  return `há ${dias} dias`
}
