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

/**
 * Os componentes da data no horário de Brasília, sem depender do Intl.
 *
 * `mes` é ZERO A ONZE, como o JavaScript devolve — os arrays de nome acima
 * dependem disso. Quem for escrever o número na tela precisa somar um, e é
 * exatamente esse o erro que `mesDe1a12` existe para não deixar acontecer.
 */
export function partes(iso: string | Date) {
  const br = new Date(new Date(iso).getTime() - OFFSET_MS)
  return {
    diaDaSemana: br.getUTCDay(),
    dia: br.getUTCDate(),
    mes: br.getUTCMonth(),
    ano: br.getUTCFullYear(),
  }
}

/** O mês como se escreve: setembro é 9, e não 8. */
export function mesDe1a12(iso: string | Date): number {
  return partes(iso).mes + 1
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

// ─── Data e hora que a pessoa digita ────────────────────────────────────────

/** Formata enquanto digita: 05092026 → 05/09/2026 */
export function mascararDataBR(parcial: string): string {
  const d = (parcial ?? '').replace(/\D/g, '').slice(0, 8)
  if (d.length <= 2) return d
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`
}

/** Formata enquanto digita: 1830 → 18:30 */
export function mascararHora(parcial: string): string {
  const d = (parcial ?? '').replace(/\D/g, '').slice(0, 4)
  if (d.length <= 2) return d
  return `${d.slice(0, 2)}:${d.slice(2)}`
}

/**
 * "05/09/2026" + "18:30" → o instante ISO em Brasília.
 *
 * Devolve `null` quando o que foi digitado não é uma data de verdade — 32/13,
 * 25:99, ou incompleto. Quem chama decide o que fazer com isso; o que não pode
 * é virar `Invalid Date` e ser gravado como nulo em silêncio.
 */
export function paraISO(dataBR: string, hora: string): string | null {
  const d = (dataBR ?? '').replace(/\D/g, '')
  const h = (hora ?? '').replace(/\D/g, '')
  if (d.length !== 8 || h.length !== 4) return null

  const dia = Number(d.slice(0, 2))
  const mes = Number(d.slice(2, 4))
  const ano = Number(d.slice(4))
  const horas = Number(h.slice(0, 2))
  const minutos = Number(h.slice(2))

  if (mes < 1 || mes > 12) return null
  if (horas > 23 || minutos > 59) return null

  const p2 = (v: number) => String(v).padStart(2, '0')
  const iso = `${ano}-${p2(mes)}-${p2(dia)}T${p2(horas)}:${p2(minutos)}:00-03:00`
  const instante = new Date(iso)
  if (Number.isNaN(instante.getTime())) return null

  // 31/02 vira 03/03 sozinho no JavaScript. Conferir de volta é o que pega:
  // se o dia mudou, a data digitada não existia.
  if (partes(iso).dia !== dia) return null
  return iso
}

/** O contrário: um instante ISO vira os dois campos que a tela mostra. */
export function deISO(iso: string | null): { data: string; hora: string } {
  if (!iso) return { data: '', hora: '' }
  const { dia, ano } = partes(iso)
  const br = new Date(new Date(iso).getTime() - OFFSET_MS)
  const p2 = (v: number) => String(v).padStart(2, '0')
  return {
    data: `${p2(dia)}/${p2(mesDe1a12(iso))}/${ano}`,
    hora: `${p2(br.getUTCHours())}:${p2(br.getUTCMinutes())}`,
  }
}

/** "2026-09-05" a partir de um instante — o dia em Brasília. */
export function diaDoInstante(iso: string): string {
  const { ano, dia } = partes(iso)
  const p2 = (v: number) => String(v).padStart(2, '0')
  return `${ano}-${p2(mesDe1a12(iso))}-${p2(dia)}`
}
