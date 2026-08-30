// O formulário que cada evento pede a mais.
//
// A conta permanente guarda nome, CPF e telefone. O que muda de evento para
// evento — função, tamanho de uniforme, tamanho de bota, número de conta — vem
// do servidor como uma lista de campos, e a tela monta o formulário a partir
// dela. É o que permite um evento novo pedir uma coisa nova sem publicar
// versão nova do app na loja.

import type { CampoDoFormulario } from '@credenciei/contrato'

/** Formata enquanto a pessoa digita: 05092026 → 05/09/2026 */
export function mascararData(parcial: string): string {
  const d = (parcial ?? '').replace(/\D/g, '').slice(0, 8)
  if (d.length <= 2) return d
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`
}

/**
 * O que ainda falta preencher.
 *
 * ─── POR QUE ISTO DEVOLVE UMA LISTA, E NÃO UM "PODE ENVIAR" ────────────────
 *
 * Porque a tela precisa DIZER o que falta, campo por campo. No sistema web, um
 * formulário que só travava — sem explicar — fez o Juan clicar em salvar, não
 * ver reação nenhuma e sair acreditando que tinha salvado. A lição ficou
 * escrita em `docs/contexto.md`: bloqueio sem explicação é pior que nenhum
 * bloqueio.
 *
 * Espaço em branco não conta como resposta: "   " preenchido às pressas viraria
 * uma função vazia no crachá de alguém.
 */
export function camposFaltando(
  campos: CampoDoFormulario[],
  respostas: Record<string, string>,
): CampoDoFormulario[] {
  return campos.filter(c => c.obrigatorio && !(respostas[c.chave] ?? '').trim())
}

/** A frase que a pessoa lê quando falta coisa. */
export function fraseDoQueFalta(faltando: CampoDoFormulario[]): string {
  const nomes = faltando.map(f => f.rotulo)
  if (nomes.length === 0) return ''
  if (nomes.length === 1) return `Falta preencher: ${nomes[0]}.`
  const ultimo = nomes[nomes.length - 1]
  return `Falta preencher: ${nomes.slice(0, -1).join(', ')} e ${ultimo}.`
}
