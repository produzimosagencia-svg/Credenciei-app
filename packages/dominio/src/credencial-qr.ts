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
// A família `@noble` também traz Ed25519 (`@noble/curves`), que é como este
// arquivo ganha verificação OFFLINE segura no scanner do portão: o servidor
// guarda a chave PRIVADA (nunca sai de lá) e o aparelho do operador recebe só
// a PÚBLICA, que serve para conferir mas nunca para forjar um crachá novo —
// diferente do segredo HMAC de hoje, que é simétrico e não pode ir para um
// aparelho sem virar uma chave mestra de falsificação. Ver
// `docs/decisoes/009-qr-offline-ed25519.md`.
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
import { ed25519 } from '@noble/curves/ed25519'
// `Veredito` vem de janelas: um veredito é a mesma coisa em todo o domínio, e
// declarar de novo aqui criaria dois tipos idênticos disputando o mesmo nome.
import type { FaseDoDia, Veredito } from './janelas.js'

/*
 * Versão do formato:
 *
 *   c1 — token cru, sem assinatura. Nunca mais aceito.
 *   c2 — assinatura cobrindo O DIA. Aceito na transição.
 *   c3 — assinatura cobrindo a ETAPA (HMAC, chave simétrica). O formato em uso.
 *   c4 — assinatura Ed25519 (chave assimétrica) cobrindo ETAPA + JANELA DE
 *        TEMPO. Ainda não é gerado em produção — só aceito, enquanto a troca
 *        não é confirmada nos dois sistemas. Ver ADR 009.
 */
const PREFIXO = 'c3'
const PREFIXO_LEGADO = 'c2'
const PREFIXO_ED25519 = 'c4'

/**
 * Duração de cada janela do código giratório — decisão do Juan, 18/09/2026:
 * um print antigo do QR para de servir rápido, sem exigir que o aparelho do
 * colaborador tenha internet o tempo todo (só perto de trocar de janela).
 *
 * A leitura aceita a janela ATUAL e a ANTERIOR (ver `janelasAceitas`) — dá
 * uma tolerância de até ~4 minutos entre a pessoa abrir a credencial e o
 * operador terminar de escanear, sem abrir uma janela tão longa que um print
 * ainda sirva por muito tempo.
 */
const JANELA_MS = 2 * 60_000

/** Em que janela de tempo o instante cai — o contador que entra no código. */
function janelaDoInstante(instanteMs: number): number {
  return Math.floor(instanteMs / JANELA_MS)
}

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
 * O inverso de `base64url` — só passou a existir com o Ed25519, porque o
 * HMAC nunca precisou: as duas pontas comparam a assinatura como STRING
 * (`iguais`, abaixo), nunca voltam para bytes. Verificar uma assinatura
 * assimétrica exige os bytes de volta.
 */
function base64urlParaBytes(b64: string): Uint8Array {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
  const bytes: number[] = []
  for (let i = 0; i < b64.length; i += 4) {
    const c0 = A.indexOf(b64[i]!)
    const c1 = A.indexOf(b64[i + 1] ?? '')
    const c2 = i + 2 < b64.length ? A.indexOf(b64[i + 2]!) : -1
    const c3 = i + 3 < b64.length ? A.indexOf(b64[i + 3]!) : -1
    if (c0 < 0 || c1 < 0) return new Uint8Array(0)
    const bloco = (c0 << 18) | (c1 << 12) | ((c2 < 0 ? 0 : c2) << 6) | (c3 < 0 ? 0 : c3)
    bytes.push((bloco >> 16) & 255)
    if (c2 >= 0) bytes.push((bloco >> 8) & 255)
    if (c3 >= 0) bytes.push(bloco & 255)
  }
  return new Uint8Array(bytes)
}

/** Assina com a chave PRIVADA Ed25519 — só o servidor deveria chamar isto. */
function assinarComEd25519(chavePrivada: Uint8Array, ...partes: string[]): string {
  const assinatura = ed25519.sign(texto.encode([PREFIXO_ED25519, ...partes].join('.')), chavePrivada)
  return base64url(assinatura)
}

/** Confere com a chave PÚBLICA Ed25519 — segura para rodar em qualquer aparelho. */
function conferirComEd25519(chavePublica: Uint8Array, assinaturaB64: string, ...partes: string[]): boolean {
  const assinatura = base64urlParaBytes(assinaturaB64)
  if (assinatura.length === 0) return false
  try {
    return ed25519.verify(assinatura, texto.encode([PREFIXO_ED25519, ...partes].join('.')), chavePublica)
  } catch {
    // Chave ou assinatura em formato inesperado — trata como "não confere",
    // nunca deixa a exceção subir e derrubar a leitura do crachá.
    return false
  }
}

/**
 * As janelas de tempo que uma leitura AGORA aceita: a atual e a anterior.
 *
 * A folga existe pelo mesmo motivo da tolerância do resto do sistema —
 * tempo entre a pessoa abrir a credencial e o operador terminar de
 * escanear, e uma pequena diferença de relógio entre os dois aparelhos.
 * Abrir para mais janelas alongaria demais quanto tempo um print roubado
 * ainda vale, que é o problema que o código giratório existe para resolver.
 */
function janelasAceitas(agora: Date): number[] {
  const atual = janelaDoInstante(agora.getTime())
  return [atual, atual - 1]
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

/**
 * O código no formato novo (`c4`) — Ed25519, com a janela de tempo do
 * código giratório. Ainda não é o que `meuQr`/o scanner geram por padrão
 * (ver ADR 009, fase 3): existe desde já para o `lerCodigoQR` ter o que
 * verificar enquanto a virada não é confirmada nos dois sistemas.
 *
 * A chave PRIVADA só pode viver no servidor — é ela que torna a assinatura
 * impossível de forjar sem acesso ao banco/segredos da API.
 */
export function gerarCodigoQREd25519(
  chavePrivada: Uint8Array, token: string, fase: FaseDoDia, agora: Date = new Date(),
): CodigoQR {
  const sigla = SIGLA[fase]
  const janela = String(janelaDoInstante(agora.getTime()))
  const assinatura = assinarComEd25519(chavePrivada, token, sigla, janela)
  return { codigo: `${PREFIXO_ED25519}.${token}.${sigla}.${janela}.${assinatura}`, fase }
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
 *
 * `chavePublicaEd25519`: `null` enquanto o par de chaves não existir ou o
 * sistema ainda não estiver pronto para conferir `c4` — nesse caso um
 * código `c4` cai no mesmo "fora do padrão" de qualquer formato
 * desconhecido, sem tratamento especial (não há crachá `c4` em circulação
 * antes da fase 3 do ADR 009, então isto nunca deveria acontecer de
 * verdade — é só a rede de segurança).
 */
export function lerCodigoQR(
  segredo: string,
  bruto: string,
  diaDeHoje: string,
  chavePublicaEd25519: Uint8Array | null = null,
  agora: Date = new Date(),
): LeituraQR {
  const partes = (bruto ?? '').trim().split('.')

  if (partes.length !== 4 && !(partes.length === 5 && partes[0] === PREFIXO_ED25519)) {
    return { ok: false, erro: 'QR Code fora do padrão. Peça para a pessoa abrir a credencial de novo e mostrar o código.' }
  }

  const [versao, token] = partes as [string, string]
  if (!token) return { ok: false, erro: 'QR Code ilegível. Peça para a pessoa recarregar a credencial.' }

  // ── Formato novo: Ed25519 + janela de tempo ─────────────────────────────
  if (versao === PREFIXO_ED25519) {
    const [, , meioNovo, janelaTxt, sigNova] = partes as [string, string, string, string, string]
    if (!POR_SIGLA[meioNovo]) {
      return { ok: false, erro: 'QR Code ilegível. Peça para a pessoa recarregar a credencial.' }
    }
    if (!chavePublicaEd25519) {
      return { ok: false, erro: 'QR Code fora do padrão. Peça para a pessoa abrir a credencial de novo e mostrar o código.' }
    }
    const janela = Number(janelaTxt)
    if (!Number.isInteger(janela) || !janelasAceitas(agora).includes(janela)) {
      return {
        ok: false,
        erro: 'Este QR Code expirou. Peça para a pessoa abrir a credencial de novo — o código troca sozinho de tempos em tempos.',
      }
    }
    if (!conferirComEd25519(chavePublicaEd25519, sigNova, token, meioNovo, janelaTxt)) {
      return { ok: false, erro: 'QR Code inválido. Este código não foi emitido por este sistema.' }
    }
    return { ok: true, token, fase: POR_SIGLA[meioNovo]! }
  }

  const [, , meio, sig] = partes as [string, string, string, string]

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
