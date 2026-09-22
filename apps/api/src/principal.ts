// O entrypoint que sobe a API de verdade — falando com o Supabase real e
// mandando o código de entrar pelo WhatsApp de verdade.
//
// Não existia até 12/09/2026: a API só rodava dentro dos testes, contra
// `RepositorioEmMemoria`. Este é o primeiro arquivo que liga os dois lados —
// local, na sua máquina, para testar contra o banco real.
//
// `npm run dev` (dentro de `apps/api`) sobe isto. Precisa de um `.env` — veja
// `.env.example` para a lista de variáveis.

// Carrega o `.env` ANTES de qualquer import que leia `process.env` — os
// módulos abaixo (Supabase, WhatsApp) leem a variável na hora de montar o
// cliente, não sob demanda.
try {
  process.loadEnvFile('.env')
} catch {
  // Sem arquivo (ambiente que já exporta as variáveis por fora) — segue.
}

import { randomBytes } from 'node:crypto'
import { serve } from '@hono/node-server'
import { createClient } from '@supabase/supabase-js'
import { criarServidor, type Ambiente } from './servidor.js'
import { RepositorioSupabase } from './dados/supabase.js'
import { SessoesNoSupabase } from './sessoes-supabase.js'
import { LimiteNoSupabase } from './limite-supabase.js'
import { ArquivosNoSupabase } from './arquivos-supabase.js'
import type { CodigoPendente, Dependencias as DepSessao, GuardaDeCodigos } from './rotas/sessao.js'
import { enviarCodigoPeloWhatsapp } from './whatsapp.js'
import { enviarPushDeVerdade } from './expo-push.js'

function exigirVariavel(nome: string): string {
  const valor = process.env[nome]
  if (!valor) {
    throw new Error(`Falta a variável de ambiente ${nome}. Veja apps/api/.env.example.`)
  }
  return valor
}

const porta = Number(process.env.PORT ?? 3001)
const siteUrl = (process.env.SITE_URL ?? 'https://credenciei.vercel.app').replace(/\/+$/, '')
const segredoQr = exigirVariavel('SEGREDO_QR')

/**
 * A chave PÚBLICA Ed25519 do QR novo (`c4`, ver ADR 009) — opcional por
 * enquanto: sem ela, `lerCodigoQR` recusa qualquer `c4` como "fora do
 * padrão", que é o comportamento correto antes de a fase 2 do ADR ser
 * ligada de propósito (hoje não existe crachá `c4` em circulação). A
 * PRIVADA correspondente nunca entra neste arquivo nem em nenhum outro do
 * `apps/api` — ela só é necessária para GERAR, que ainda não acontece
 * (fase 3), e mesmo lá vai morar só onde `gerarCodigoQREd25519` for
 * chamado, não aqui no bootstrap.
 */
function chavePublicaQrEd25519(): Uint8Array | null {
  const hex = process.env.CHAVE_PUBLICA_QR_ED25519
  if (!hex) return null
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error('CHAVE_PUBLICA_QR_ED25519 precisa ser 32 bytes em hexadecimal (64 caracteres). Veja apps/api/.env.example.')
  }
  return Uint8Array.from(Buffer.from(hex, 'hex'))
}

const repo = RepositorioSupabase.apartirDoAmbiente()

const urlDoSupabase = process.env.SUPABASE_URL ?? exigirVariavel('NEXT_PUBLIC_SUPABASE_URL')
const chaveDeServico = exigirVariavel('SUPABASE_SERVICE_ROLE_KEY')

/*
 * Um cliente Supabase À PARTE, só para `signInWithPassword` — o
 * `RepositorioSupabase` guarda o dele como privado de propósito (é o único
 * arquivo que conhece o schema antigo, ver o topo de `dados/supabase.ts`);
 * autenticação não é uma consulta de dado, é uma chamada a outro serviço.
 */
const auth = createClient(urlDoSupabase, chaveDeServico, { auth: { persistSession: false } })

/*
 * Um cliente Supabase DIFERENTE do `auth`, na cara — mesmo com a mesma chave
 * de serviço.
 *
 * `signInWithPassword`, acima, deixa a SESSÃO DO USUÁRIO logado guardada no
 * cliente (mesmo com `persistSession: false`, que só evita gravar em disco).
 * Toda chamada seguinte feita por ESSE MESMO cliente passa a carregar o token
 * daquele usuário, não mais a chave de serviço — e a gravação em
 * `app_sessoes` caía na política de RLS (que não existe para usuário comum,
 * só para service role) com "new row violates row-level security policy".
 * Achado testando o primeiro login de verdade depois da migração 004.
 */
const semSessao = createClient(urlDoSupabase, chaveDeServico, { auth: { persistSession: false } })

/**
 * Os códigos pendentes, na memória do processo — reiniciar a API invalida
 * todo código ainda não confirmado. Mesma limitação de `SessoesEmMemoria`,
 * documentada em "Limitações conhecidas" no `CLAUDE.md`.
 */
const codigosPendentes = new Map<string, CodigoPendente>()
const codigos: GuardaDeCodigos = {
  async guardar(c) { codigosPendentes.set(c.telefone, c) },
  async buscar(telefone) { return codigosPendentes.get(telefone) ?? null },
  async apagar(telefone) { codigosPendentes.delete(telefone) },
}

/*
 * Sobre a tabela `app_limites` (migração 005) — mesmo motivo de sessões
 * terem saído da memória: sobreviver a reiniciar e contar junto entre
 * instâncias. `semSessao`, não `auth`, pelo mesmo risco de RLS.
 */
const limite = new LimiteNoSupabase(semSessao)

/*
 * Sobre o bucket `app-relatorios` — isolado, criado só para esta API (ao
 * contrário do `presencas` da foto, que é o MESMO bucket do site). `semSessao`
 * de novo, pelo mesmo motivo: nunca o cliente que passou por
 * `signInWithPassword`.
 */
const arquivos = new ArquivosNoSupabase(semSessao)

const sessao: DepSessao = {
  repo,
  codigos,
  enviar: enviarCodigoPeloWhatsapp,
  limite,
  async autenticar(email, senha) {
    const { data, error } = await auth.auth.signInWithPassword({ email, password: senha })
    if (error || !data.user) return null
    return { userId: data.user.id }
  },
}

const amb: Ambiente = {
  repo,
  // Sobre a tabela `app_sessoes` (migração 004) — sobrevive a reiniciar a
  // API, e mais de uma instância passa a contar sessão junto. `semSessao`,
  // não `auth` — ver o comentário dele, acima.
  sessoes: new SessoesNoSupabase(semSessao),
  sessao,
  limite,
  // Os campos extras de cada evento ainda não têm de onde vir (a Plataforma
  // não modela isso) — nenhum evento pede nada além do que a conta já sabe.
  campos: async () => [],
  segredoQr,
  chavePublicaQrEd25519: chavePublicaQrEd25519(),
  segredoManutencao: process.env.SEGREDO_MANUTENCAO || null,
  enviarPush: enviarPushDeVerdade,
  novoToken: () => randomBytes(16).toString('hex'),
  arquivos,
  siteUrl,
}

const app = criarServidor(amb)

serve({ fetch: app.fetch, port: porta }, info => {
  console.log(`API ouvindo em http://localhost:${info.port} (Supabase real, WhatsApp real)`)
})
