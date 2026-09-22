// Interpreta um áudio de gasto — transcreve e extrai os campos.
//
// Cópia de `c:\Dev\credenciei\lib\gastos-ia.ts`, mesma regra: NUNCA INVENTA.
// Se a IA não tem certeza de valor, fornecedor, categoria ou data, o campo
// fica `null` e entra em `precisaConfirmar` — a tela pinta em âmbar e não
// deixa salvar sem completar. Um palpite errado que passa direto é pior que
// um campo em branco que pede atenção.
//
// Função pura de resultado (não lança pra erro de config — devolve um erro
// amigável), igual ao padrão de `expo-push.ts`: quem chama (`rotas/
// gastos.ts`) já sabe lidar com falha sem precisar saber POR QUE falhou.

import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai'
import { CATEGORIAS_GASTO, categoriaValida } from '@credenciei/dominio'
import type { GastoExtraido } from '@credenciei/contrato'

const MODELO = 'gemini-3.6-flash'

const ESQUEMA = {
  type: Type.OBJECT,
  properties: {
    transcricao: { type: Type.STRING, description: 'Transcrição literal do áudio, em português.' },
    valor: { type: Type.NUMBER, nullable: true, description: 'Valor em reais, só o número. null se não foi dito ou está ambíguo.' },
    descricao: { type: Type.STRING, nullable: true, description: 'O que foi o gasto, curto. Ex.: "aluguel de estrutura", "gasolina", "almoço da equipe".' },
    fornecedor: { type: Type.STRING, nullable: true, description: 'Nome da empresa ou pessoa que recebeu o pagamento. null se não foi dito.' },
    categoria: { type: Type.STRING, nullable: true, description: `Uma destas, exatamente: ${CATEGORIAS_GASTO.join(', ')}. null se não der pra inferir com segurança.` },
    dataGasto: { type: Type.STRING, nullable: true, description: 'Data do gasto em formato YYYY-MM-DD. Resolva "ontem", "hoje", "segunda" etc. contra a data de referência. null se não foi mencionada.' },
    precisaConfirmar: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Nomes dos campos (valor, descricao, fornecedor, categoria, dataGasto) que você deixou null OU sobre os quais tem dúvida. Vazio se tudo veio claro.',
    },
  },
  required: ['transcricao', 'valor', 'descricao', 'fornecedor', 'categoria', 'dataGasto', 'precisaConfirmar'],
}

function instrucao(ctx: { eventoNome: string; hoje: string }): string {
  return [
    'Você recebe um áudio curto de um produtor de eventos relatando um gasto que fez.',
    `O gasto é do evento "${ctx.eventoNome}". A data de referência ("hoje") é ${ctx.hoje}.`,
    '',
    'Transcreva o áudio e extraia os campos do esquema.',
    '',
    'REGRAS:',
    '- NUNCA invente. Se um valor, fornecedor, categoria ou data não foi dito claramente, deixe o campo null.',
    '- Todo campo que você deixar null (ou sobre o qual tenha dúvida) DEVE entrar em precisaConfirmar.',
    `- categoria só pode ser uma destas, escrita igual: ${CATEGORIAS_GASTO.join(', ')}. Se o áudio não permitir escolher com segurança, categoria = null.`,
    '- valor é só o número em reais. "850 reais" -> 850. "2 mil e trezentos" -> 2300. "mil e quinhentos" -> 1500.',
    '- dataGasto: SEMPRE no formato YYYY-MM-DD, sem hora. Resolva expressões relativas ("ontem", "segunda") contra a data de referência. Sem menção de data -> null (a tela usa hoje).',
    '- descricao é curta e concreta, do jeito que o produtor falaria.',
    '- transcricao é sempre preenchida, mesmo que o resto seja null.',
  ].join('\n')
}

async function comRetentativa<T>(fn: () => Promise<T>, tentativas = 3): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn()
    } catch (e) {
      const texto = String((e as Error)?.message ?? e)
      const transitorio = /UNAVAILABLE|503|RESOURCE_EXHAUSTED|429|high demand/i.test(texto)
      if (!transitorio || i >= tentativas - 1) throw e
      await new Promise(r => setTimeout(r, Math.min(1500 * 2 ** i, 12_000)))
    }
  }
}

export async function interpretarAudioDeGastoDeVerdade(
  audio: Buffer, mime: string, ctx: { eventoNome: string; hoje: string },
): Promise<GastoExtraido> {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('A leitura de áudio ainda não foi configurada neste ambiente. Fale com o administrador.')
  }

  const ia = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })

  const resposta = await comRetentativa(() =>
    ia.models.generateContent({
      model: MODELO,
      contents: [{
        role: 'user',
        parts: [
          { inlineData: { mimeType: mime, data: audio.toString('base64') } },
          { text: instrucao(ctx) },
        ],
      }],
      config: {
        responseMimeType: 'application/json',
        responseSchema: ESQUEMA as never,
        // Extração de campos de um áudio curto não pede raciocínio longo — e
        // o produtor está esperando na tela de "processando".
        thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
      },
    }),
  )

  const bruto = resposta.text
  if (!bruto) throw new Error('Não consegui entender o áudio. Grave de novo, falando um pouco mais devagar.')

  let cru: Partial<GastoExtraido>
  try {
    cru = JSON.parse(bruto) as Partial<GastoExtraido>
  } catch {
    throw new Error('Não consegui interpretar o áudio. Tente de novo ou lance o gasto manualmente.')
  }

  // Nunca confia cego no que voltou: valor tem que ser número positivo,
  // categoria tem que estar na lista, precisaConfirmar tem que ser array.
  const valor = typeof cru.valor === 'number' && Number.isFinite(cru.valor) && cru.valor > 0 ? cru.valor : null
  const categoria = categoriaValida(cru.categoria ?? null)
  // O modelo às vezes devolve `2026-09-10T00:00:00.000Z` em vez de só a
  // data — fica com os 10 primeiros caracteres se o começo for uma data válida.
  const dataCrua = (cru.dataGasto ?? '').slice(0, 10)
  const dataGasto = /^\d{4}-\d{2}-\d{2}$/.test(dataCrua) ? dataCrua : null

  const precisaConfirmar = new Set(Array.isArray(cru.precisaConfirmar) ? cru.precisaConfirmar : [])
  // Blindagem: se o campo ficou vazio mas a IA não avisou, avisa aqui.
  if (valor === null) precisaConfirmar.add('valor')
  if (!cru.descricao?.trim()) precisaConfirmar.add('descricao')
  if (cru.categoria && !categoria) precisaConfirmar.add('categoria')

  return {
    transcricao: cru.transcricao?.trim() || '(não consegui transcrever)',
    valor,
    descricao: cru.descricao?.trim() || null,
    fornecedor: cru.fornecedor?.trim() || null,
    categoria,
    dataGasto,
    precisaConfirmar: [...precisaConfirmar],
  }
}
