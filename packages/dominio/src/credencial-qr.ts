// O conteúdo do QR Code da credencial — assinado e amarrado à ETAPA do evento.
//
// ─── O QUE MUDOU AO VIR PARA O PACOTE COMPARTILHADO ─────────────────────────
//
// A versão do sistema web usa `node:crypto`, que não existe no React Native.
// Como este módulo agora precisa rodar nos três lugares — servidor, navegador e
// celular —, a criptografia passou para `@noble/hashes`: JavaScript puro,
// auditado, sem dependência nativa, com o mesmo resultado byte a byte em
// qualquer ambiente.
//
// Não é troca por gosto. Sem ela haveria duas implementações do mesmo QR, e a
// primeira divergência entre elas apareceria como uma credencial legítima
// sendo recusada no portão — o pior lugar possível para descobrir.
//
// A mesma biblioteca traz Ed25519, que é como este arquivo vai ganhar
// verificação offline segura (o app confere com a chave pública sem nunca
// guardar a privada). Ver `docs/decisoes/002-qr-offline.md`.
//
// ─── UM QR POR ETAPA, NÃO POR DIA ───────────────────────────────────────────
//
// Um evento tem três etapas, e cada uma tem o seu código:
//
//   montagem     → todos os dias de preparação ANTES do dia do evento
//   evento       → o dia do evento
//   desmontagem  → os dias de trabalho DEPOIS do dia do evento
//
// Dentro de uma etapa o código é o mesmo todos os dias. O que muda o código é
// virar de etapa — e é isso que impede o crachá que circulou a semana inteira
// na montagem de servir para entrar no dia do evento.

import { hmac } from '@noble/hashes/hmac'
import { sha256 } from '@noble/hashes/sha2'
// `Veredito` vem de janelas: um veredito é a mesma coisa em todo o domínio, e
// declarar de novo aqui criaria dois tipos idênticos disputando o mesmo nome.
import type { FaseDoDia, Veredito } from './janelas.js'

/*
 * Versão do formato:
 *
 *   c1 — token cru, sem assinatura. Nunca mais aceito.
 *   c2 — assinatura cobrindo O DIA. Aceito na transição.
 *   c3 — assinatura cobrindo a ETAPA. O formato atual.
 */
const PREFIXO = 'c3'
const PREFIXO_LEGADO = 'c2'

/** A etapa, abreviada dentro do código. */
const SIGLA: Record<FaseDoDia, string> = {
  montagem: 'm',
  evento: 'p',
  desmontagem: 'd',
}
const POR_SIGLA: Record<string, FaseDoDia> = { m: 'montagem', p: 'evento', d: 'desmontagem' }

const texto = new TextEncoder()

/**
 * base64url a partir de bytes, sem depender de `Buffer`.
 *
 * `Buffer` é do Node e não existe no celular; `btoa` existe em ambos mas só
 * aceita string binária. Vinte linhas resolvem e o resultado é idêntico ao que
 * o sistema web já produz hoje — o que importa, porque assinaturas antigas
 * precisam continuar conferindo.
 */
function base64url(bytes: Uint8Array): string {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
  let saida = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0
    const b = bytes[i + 1] ?? 0
    const c = bytes[i + 2] ?? 0
    const bloco = (a << 16) | (b << 8) | c
    saida += A[(bloco >> 18) & 63]
    saida += A[(bloco >> 12) & 63]
    // Sem preenchimento com "=": o código é comparado inteiro, e o padding só
    // ocuparia espaço no QR.
    if (i + 1 < bytes.length) saida += A[(bloco >> 6) & 63]
    if (i + 2 < bytes.length) saida += A[bloco & 63]
  }
  return saida
}

function assinarCom(prefixo: string, segredo: string, ...partes: string[]): string {
  const mac = hmac(sha256, texto.encode(segredo), texto.encode([prefixo, ...partes].join('.')))
  return base64url(mac).slice(0, 16)
}

/**
 * Comparação em tempo constante.
 *
 * Comparar assinatura com `===` vaza informação: a comparação para no primeiro
 * caractere diferente, e medir esse tempo permite descobrir a assinatura certa
 * caractere a caractere. Percorrer sempre o texto inteiro fecha essa porta.
 */
function iguais(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diferenca = 0
  for (let i = 0; i < a.length; i++) diferenca |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diferenca === 0
}

export type CodigoQR = { codigo: string; fase: FaseDoDia }

/** O código daquela credencial NAQUELA ETAPA do evento. */
export function gerarCodigoQR(segredo: string, token: string, fase: FaseDoDia): CodigoQR {
  const sigla = SIGLA[fase]
  return { codigo: `${PREFIXO}.${token}.${sigla}.${assinarCom(PREFIXO, segredo, token, sigla)}`, fase }
}

export type LeituraQR =
  | { ok: true; token: string; fase: FaseDoDia | null }
  | { ok: false; erro: string }

/**
 * Lê o que veio do scanner: confere a ASSINATURA e devolve token e etapa.
 *
 * Não decide se a etapa serve para hoje — isso depende do evento que está sendo
 * escaneado, que só quem chamou conhece. Aqui se responde apenas "este código
 * saiu deste sistema, e para qual etapa foi emitido?".
 *
 * `fase: null` significa código no formato antigo (c2), amarrado ao dia.
 */
export function lerCodigoQR(segredo: string, bruto: string, diaDeHoje: string): LeituraQR {
  const partes = (bruto ?? '').trim().split('.')

  if (partes.length !== 4) {
    return { ok: false, erro: 'QR Code fora do padrão. Peça para a pessoa abrir a credencial de novo e mostrar o código.' }
  }

  const [versao, token, meio, sig] = partes as [string, string, string, string]
  if (!token) return { ok: false, erro: 'QR Code ilegível. Peça para a pessoa recarregar a credencial.' }

  // ── Formato atual: a etapa ───────────────────────────────────────────────
  if (versao === PREFIXO) {
    if (!POR_SIGLA[meio]) {
      return { ok: false, erro: 'QR Code ilegível. Peça para a pessoa recarregar a credencial.' }
    }
    if (!iguais(assinarCom(PREFIXO, segredo, token, meio), sig)) {
      return { ok: false, erro: 'QR Code inválido. Este código não foi emitido por este sistema.' }
    }
    return { ok: true, token, fase: POR_SIGLA[meio]! }
  }

  /*
   * ── Formato antigo (c2), amarrado ao dia ────────────────────────────────
   *
   * Continua aceito na transição para não derrubar quem está com a credencial
   * ABERTA na tela quando a versão nova sobe. Não abre brecha: c2 vale só no
   * dia em que foi emitido, o que é mais restrito do que a etapa.
   */
  if (versao === PREFIXO_LEGADO) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(meio)) {
      return { ok: false, erro: 'QR Code ilegível. Peça para a pessoa recarregar a credencial.' }
    }
    if (!iguais(assinarCom(PREFIXO_LEGADO, segredo, token, meio), sig)) {
      return { ok: false, erro: 'QR Code inválido. Este código não foi emitido por este sistema.' }
    }
    if (meio !== diaDeHoje) {
      const [, m, d] = meio.split('-')
      return {
        ok: false,
        erro: `Este QR Code é do dia ${d}/${m} e não vale hoje. Peça para a pessoa abrir a credencial ao vivo — o código de hoje aparece sozinho.`,
      }
    }
    return { ok: true, token, fase: null }
  }

  return { ok: false, erro: 'QR Code fora do padrão. Peça para a pessoa abrir a credencial de novo e mostrar o código.' }
}

/** Como a etapa aparece para quem está no portão. */
export const NOME_DA_FASE: Record<FaseDoDia, string> = {
  montagem: 'montagem',
  evento: 'dia do evento',
  desmontagem: 'desmontagem',
}

/**
 * A etapa do QR serve para a etapa de hoje?
 *
 * A recusa precisa dizer as duas etapas. "QR Code inválido" faria o operador
 * pensar em código falsificado e chamar a segurança, quando o que houve foi a
 * pessoa mostrar o crachá da montagem no dia do evento — coisa que vai
 * acontecer, e que se resolve pedindo para ela recarregar a tela.
 */
export function faseConfere(doQR: FaseDoDia | null, deHoje: FaseDoDia): Veredito {
  // Código antigo (c2): já foi conferido contra o DIA de hoje, mais restrito
  // que a etapa. Nada a checar aqui.
  if (doQR === null) return { ok: true }
  if (doQR === deHoje) return { ok: true }
  return {
    ok: false,
    erro: `Este QR Code é o da ${NOME_DA_FASE[doQR]}, e hoje é ${NOME_DA_FASE[deHoje]}. Peça para a pessoa abrir a credencial de novo — o código certo aparece sozinho.`,
  }
}
