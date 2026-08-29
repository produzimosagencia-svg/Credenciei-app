// O código que leva o colaborador para dentro de um evento.
//
//   Festival XYZ  ·  2026   →   XYZ-2026-K7M2
//
// A pessoa digita, o sistema identifica o evento e abre o formulário. É o que
// substitui o link individual: com conta permanente ela não recebe mais uma
// credencial pronta — ela entra no evento e a credencial nasce ali.
//
// ─── POR QUE NÃO SÃO QUATRO DÍGITOS ─────────────────────────────────────────
//
// O formato pedido era `XYZ-2026-8472`. Quatro dígitos dão dez mil combinações,
// e as outras duas partes são públicas: a sigla vem do nome do evento e o ano é
// o ano. Alguém com um script entra em qualquer evento em minutos — e entrar
// num evento não é curiosidade, é aparecer na lista de pagamento.
//
// Mesma forma, mesmo tamanho, alfabeto maior: 32 caracteres em vez de 10, o que
// leva de dez mil para mais de um milhão de combinações. Quem digita não nota
// diferença nenhuma; quem tenta adivinhar leva cem vezes mais tempo.
//
// ─── O ALFABETO ─────────────────────────────────────────────────────────────
//
// Base32 de Crockford. O que ela resolve é a leitura em voz alta e por foto —
// código de evento é ditado por rádio no meio da montagem, e lido de um print
// no WhatsApp.
//
// O gerador nunca produz I, L, O nem U. Mas a leitura ACEITA os três primeiros
// e os converte, porque quem enxergou um "O" numa foto vai digitar "O":
//
//     I → 1        L → 1        O → 0
//
// Essa conversão só funciona porque 0 e 1 continuam no alfabeto. Foi o erro da
// primeira versão deste arquivo: eu havia tirado tanto as letras quanto os
// números parecidos, e aí não sobrava para onde converter — a correção
// simplesmente se desfazia.
//
// U fica de fora do gerador por outro motivo: evita que o sorteio forme
// palavrão sem querer, num código que vai ser lido em voz alta na operação.
//
// ─── O QUE ISTO NÃO RESOLVE ─────────────────────────────────────────────────
//
// Adivinhação por força bruta. Mil tentativas por segundo derrubam qualquer
// código de quatro caracteres. Por isso o código é UMA camada, não a única:
// quem chama precisa limitar tentativas por aparelho, e o organizador pode
// exigir aprovação antes de o vínculo valer.

/** Base32 de Crockford: sem I, L, O e U. */
const ALFABETO = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

/** O gerador evita U — o alfabeto aceita na leitura, o sorteio não usa. */
const SORTEAVEIS = ALFABETO.replace('U', '')

/** Quantos caracteres no grupo aleatório. */
const TAMANHO_SORTEIO = 4

/** O que a pessoa vê e digita. */
export type CodigoDeEvento = string

/** Como o acaso entra — injetável para o teste poder ser determinístico. */
export type Sorteio = (limite: number) => number

const sorteioPadrao: Sorteio = limite => {
  // `crypto` quando existir: um código previsível é um código adivinhável.
  const c = globalThis.crypto
  if (c?.getRandomValues) {
    const v = new Uint32Array(1)
    // Descarta o excedente para não enviesar os primeiros caracteres do
    // alfabeto, que é o que um `% limite` cru faria.
    const teto = Math.floor(0xffffffff / limite) * limite
    let n: number
    do { c.getRandomValues(v); n = v[0]! } while (n >= teto)
    return n % limite
  }
  return Math.floor(Math.random() * limite)
}

/**
 * A sigla, tirada do nome do evento.
 *
 * Serve para a pessoa reconhecer de onde veio o código: recebido no meio de dez
 * mensagens, "HEJ-2026-K7M2" diz que é do Henrique e Juliano, e "AB3-2026-K7M2"
 * não diz nada.
 *
 * Acentos perdem o acento, o que não for letra some, e palavras de ligação são
 * ignoradas. Nome curto ganha X até completar três — tamanho fixo é mais fácil
 * de digitar e de conferir do que um código que muda de comprimento.
 */
export function siglaDoNome(nome: string): string {
  const limpo = (nome ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z ]/g, ' ')
    .trim()

  const palavras = limpo.split(/\s+/).filter(Boolean)
  const uteis = palavras.filter(p => !['DE', 'DA', 'DO', 'DAS', 'DOS', 'E'].includes(p))
  const base = uteis.length ? uteis : palavras

  const iniciais = base.map(p => p[0]).join('')
  // Uma palavra só ("Rock"): usa as três primeiras letras dela, porque uma
  // inicial solitária não distinguiria evento nenhum.
  const bruta = iniciais.length >= 2 ? iniciais : (base[0] ?? '')

  return (bruta + 'XXX').slice(0, 3)
}

/** Gera o código de um evento novo. */
export function gerarCodigoDeEvento(
  nome: string,
  ano: number,
  sortear: Sorteio = sorteioPadrao,
): CodigoDeEvento {
  let sorteado = ''
  for (let i = 0; i < TAMANHO_SORTEIO; i++) sorteado += SORTEAVEIS[sortear(SORTEAVEIS.length)]
  return `${siglaDoNome(nome)}-${ano}-${sorteado}`
}

export type LeituraDeCodigo =
  | { ok: true; codigo: CodigoDeEvento }
  | { ok: false; erro: string }

/**
 * Aceita o que a pessoa digitou e devolve o código no formato do banco.
 *
 * Perdoa tudo que não muda a identidade: minúsculas, espaços, traços a mais ou
 * a menos, e as três confusões de leitura. Quem digita está com o celular numa
 * mão e uma caixa na outra — recusar por causa de um espaço seria criar um
 * problema onde não havia.
 */
export function lerCodigoDeEvento(digitado: string): LeituraDeCodigo {
  const cru = (digitado ?? '').toUpperCase().replace(/[\s\-_.]/g, '')
  if (!cru) return { ok: false, erro: 'Digite o código que você recebeu.' }

  const m = /^([A-Z]{3})(\d{4})([A-Z0-9]{4})$/.exec(cru)
  if (!m) {
    return {
      ok: false,
      erro: 'O código tem três letras, o ano e mais quatro caracteres — como ABC-2026-K7M2. Confira o que você recebeu.',
    }
  }

  const [, sigla, ano, sorteado] = m as unknown as [string, string, string, string]

  // As três confusões de leitura, convertidas para o que o alfabeto usa.
  const corrigido = sorteado.replace(/[IL]/g, '1').replace(/O/g, '0')

  const forasteiro = [...corrigido].find(c => !ALFABETO.includes(c))
  if (forasteiro) {
    return { ok: false, erro: `O caractere "${forasteiro}" não aparece nos nossos códigos. Confira o que você digitou.` }
  }

  return { ok: true, codigo: `${sigla}-${ano}-${corrigido}` }
}

/** Formata enquanto a pessoa digita: ABC2026K7M2 → ABC-2026-K7M2 */
export function mascararCodigo(parcial: string): string {
  const cru = (parcial ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 11)
  return [cru.slice(0, 3), cru.slice(3, 7), cru.slice(7, 11)].filter(Boolean).join('-')
}

/**
 * Quantas combinações o sorteio pode produzir.
 *
 * Exportado para o teste poder afirmar sobre ele: se alguém encurtar o alfabeto
 * ou o sorteio um dia, o teste cai antes de a brecha chegar à produção.
 */
export const COMBINACOES = SORTEAVEIS.length ** TAMANHO_SORTEIO
