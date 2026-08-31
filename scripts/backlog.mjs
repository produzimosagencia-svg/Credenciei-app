// Conta o backlog a partir da tabela, e recusa número inventado.
//
// ─── POR QUE ISTO EXISTE ────────────────────────────────────────────────────
//
// O `docs/backlog.md` tem o número em DOIS lugares: o cabeçalho ("96 concluídas
// (35%)") e a tabela por epic. Os dois eram mantidos à mão — e em 31/08/2026
// divergiram em treze tasks, o que fez o número reportado ao Juan sair errado
// por seis pontos percentuais.
//
// A regra do projeto é "nunca estimar: contar". Um número que depende de
// alguém lembrar de somar não é contado, é estimado com passos extras. Este
// script soma a tabela e falha se o cabeçalho discordar.
//
//   npm run backlog     mostra os números e confere o cabeçalho

import { readFile } from 'node:fs/promises'

const CAMINHO = 'docs/backlog.md'

const texto = await readFile(CAMINHO, 'utf8')

/** As linhas da tabela: | # | Epic | Feito | Total | MVP | Situação | */
const LINHA = /^\|\s*(\d+)\s*\|\s*([^|]+?)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*(✓|—)\s*\|/

const epics = []
for (const linha of texto.split('\n')) {
  const m = LINHA.exec(linha)
  if (m) {
    epics.push({
      numero: Number(m[1]),
      nome: m[2],
      feito: Number(m[3]),
      total: Number(m[4]),
      mvp: m[5] === '✓',
    })
  }
}

if (epics.length === 0) {
  console.error(`Nenhuma linha de epic encontrada em ${CAMINHO}. A tabela mudou de formato?`)
  process.exit(1)
}

const soma = (lista, campo) => lista.reduce((a, e) => a + e[campo], 0)
const doMvp = epics.filter(e => e.mvp)

const feito = soma(epics, 'feito')
const total = soma(epics, 'total')
const feitoMvp = soma(doMvp, 'feito')
const totalMvp = soma(doMvp, 'total')
const pct = (a, b) => Math.round((a / b) * 100)

console.log(`  ${epics.length} epics`)
console.log(`  backlog inteiro   ${feito}/${total}  (${pct(feito, total)}%)`)
console.log(`  só o MVP          ${feitoMvp}/${totalMvp}  (${pct(feitoMvp, totalMvp)}%)`)

// ─── O cabeçalho tem que bater com a tabela ─────────────────────────────────

const cabecalho = /\*\*(\d+) tasks · (\d+) no MVP · (\d+) concluídas \((\d+)%\)\*\*/.exec(texto)
if (!cabecalho) {
  console.error('\nO cabeçalho do backlog não foi encontrado no formato esperado.')
  process.exit(1)
}

const esperado = {
  total,
  totalMvp,
  feito,
  pct: pct(feito, total),
}
const escrito = {
  total: Number(cabecalho[1]),
  totalMvp: Number(cabecalho[2]),
  feito: Number(cabecalho[3]),
  pct: Number(cabecalho[4]),
}

const divergencias = Object.entries(esperado)
  .filter(([campo, valor]) => escrito[campo] !== valor)
  .map(([campo, valor]) => `  ${campo}: cabeçalho diz ${escrito[campo]}, a tabela soma ${valor}`)

if (divergencias.length > 0) {
  console.error('\nO cabeçalho do backlog não bate com a tabela:')
  console.error(divergencias.join('\n'))
  console.error(
    `\nCorrija a linha para:\n`
    + `**${total} tasks · ${totalMvp} no MVP · ${feito} concluídas (${pct(feito, total)}%)**`,
  )
  process.exit(1)
}

console.log('\n  cabeçalho confere com a tabela')
