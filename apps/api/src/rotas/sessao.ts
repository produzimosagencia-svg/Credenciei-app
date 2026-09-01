// Entrar no aplicativo — por WhatsApp, no número que a pessoa já cadastrou.
//
// ─── POR QUE WHATSAPP E NÃO SENHA ───────────────────────────────────────────
//
// Senha exige lembrar, e quem trabalha um evento por trimestre não lembra. O
// caminho de recuperação viraria o caminho principal, e aí a senha só atrapalha.
//
// SMS resolveria, mas custa: cadastrar vinte mil pessoas sairia por R$ 2 a 4
// mil, e cada reenvio soma. O WhatsApp o sistema já paga e a equipe já usa —
// é por lá que ela recebe tudo hoje.
//
// ─── O QUE PODE DAR ERRADO, E O QUE FAZEMOS ─────────────────────────────────
//
// A conta fica amarrada ao número. Quem troca de número perde o acesso — e com
// ele o histórico. Precisa de um caminho de recuperação antes da produção; ele
// ainda não existe, e está anotado como pendência.
//
// Se a conta de WhatsApp for restringida (já aconteceu neste projeto), o login
// para junto com os avisos. É um ponto único de falha conhecido.

import type { Papel } from '@credenciei/dominio'
import { podePassar } from '../limite.js'
import { identificadorParaEmail } from '../identificador.js'
import type { Repositorio } from '../dados/repositorio.js'

/** Por quanto tempo o código enviado continua valendo. */
export const VALIDADE_DO_CODIGO_MS = 10 * 60_000

/** Quantas tentativas erradas antes de o código ser queimado. */
export const TENTATIVAS_MAXIMAS = 5

export type CodigoPendente = {
  telefone: string
  codigo: string
  expiraEm: number
  tentativas: number
}

/** Onde os códigos em aberto ficam. Em produção, uma tabela com expiração. */
export interface GuardaDeCodigos {
  guardar(c: CodigoPendente): Promise<void>
  buscar(telefone: string): Promise<CodigoPendente | null>
  apagar(telefone: string): Promise<void>
}

/** Como o código chega até a pessoa. Injetado para o teste não mandar nada. */
export type EnviarPorWhatsapp = (telefone: string, codigo: string) => Promise<void>

/**
 * Confere a senha contra o Supabase Auth e devolve o id do dono, se bateu.
 *
 * Fica fora do `Repositorio` de propósito: não é uma consulta de dado, é uma
 * chamada a um serviço de autenticação — `signInWithPassword`, no Supabase.
 * Injetado pelo mesmo motivo do `enviar`: o teste não pode depender de rede.
 */
export type AutenticarComSenha = (email: string, senha: string) => Promise<{ userId: string } | null>

export type Sorteio = () => string

const seisDigitos: Sorteio = () => {
  const c = globalThis.crypto
  if (c?.getRandomValues) {
    const v = new Uint32Array(1)
    c.getRandomValues(v)
    return String(v[0]! % 1_000_000).padStart(6, '0')
  }
  return String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0')
}

export const soDigitos = (v: string) => (v ?? '').replace(/\D/g, '')

export type Dependencias = {
  repo: Repositorio
  codigos: GuardaDeCodigos
  enviar: EnviarPorWhatsapp
  /**
   * Opcional porque nem todo ambiente de teste precisa dele — só quem chama
   * `entrarComSenha` exige que esteja configurado.
   */
  autenticar?: AutenticarComSenha
  sortear?: Sorteio
  agora?: () => number
}

// ── Pedir o código ──────────────────────────────────────────────────────────

export async function pedirCodigo(
  dep: Dependencias,
  telefoneBruto: string,
): Promise<{ enviado: boolean; erro?: string }> {
  const agora = dep.agora ?? (() => Date.now())
  const telefone = soDigitos(telefoneBruto)

  if (telefone.length < 10 || telefone.length > 13) {
    return { enviado: false, erro: 'Digite o número com DDD, do jeito que ele está no seu WhatsApp.' }
  }

  /*
   * Limite por número, não só por aparelho.
   *
   * Sem isso, pedir o código vira uma arma: alguém dispara mil pedidos para o
   * número de outra pessoa e enche o WhatsApp dela — e ainda gasta o envio,
   * que é pago.
   */
  if (!podePassar(`codigo:${telefone}`, 3, 10 * 60_000, agora())) {
    return { enviado: false, erro: 'Você já pediu o código algumas vezes. Espere alguns minutos e tente de novo.' }
  }

  const codigo = (dep.sortear ?? seisDigitos)()
  await dep.codigos.guardar({
    telefone,
    codigo,
    expiraEm: agora() + VALIDADE_DO_CODIGO_MS,
    tentativas: 0,
  })

  /*
   * Responde `enviado` mesmo para número que não existe na base.
   *
   * Dizer "não encontramos esse número" transformaria a tela de login numa
   * consulta: bastaria testar números até descobrir quem está cadastrado. A
   * pessoa que digitou errado simplesmente não recebe nada, o que ela entende
   * sozinha.
   *
   * O envio só acontece de verdade para quem existe — não se gasta mensagem
   * com número que não vai receber.
   */
  const pessoa = await dep.repo.pessoaPorTelefone(telefone)
  if (pessoa) await dep.enviar(telefone, codigo)

  return { enviado: true }
}

// ── Entrar ──────────────────────────────────────────────────────────────────

export type ResultadoEntrada =
  | { ok: true; pessoaId: string }
  | { ok: false; erro: string }

export async function entrar(
  dep: Dependencias,
  telefoneBruto: string,
  codigoDigitado: string,
): Promise<ResultadoEntrada> {
  const agora = dep.agora ?? (() => Date.now())
  const telefone = soDigitos(telefoneBruto)
  const pendente = await dep.codigos.buscar(telefone)

  /*
   * A MESMA mensagem para código inexistente, expirado e errado.
   *
   * Respostas diferentes contariam se aquele número tem código em aberto — e,
   * por tabela, se ele está cadastrado no sistema.
   */
  const recusa = { ok: false as const, erro: 'Código incorreto ou expirado. Peça um novo.' }

  if (!pendente) return recusa
  if (agora() > pendente.expiraEm) {
    await dep.codigos.apagar(telefone)
    return recusa
  }

  if (soDigitos(codigoDigitado) !== pendente.codigo) {
    const tentativas = pendente.tentativas + 1
    if (tentativas >= TENTATIVAS_MAXIMAS) {
      /*
       * Queima o código depois de algumas tentativas.
       *
       * Seis dígitos são um milhão de combinações — adivinháveis por força
       * bruta em minutos se o código sobrevivesse a tentativas ilimitadas.
       */
      await dep.codigos.apagar(telefone)
    } else {
      await dep.codigos.guardar({ ...pendente, tentativas })
    }
    return recusa
  }

  // Acertou: o código morre agora. Um código de uso único não pode servir duas
  // vezes, nem que seja para a mesma pessoa.
  await dep.codigos.apagar(telefone)

  const pessoa = await dep.repo.pessoaPorTelefone(telefone)
  if (!pessoa) return recusa

  return { ok: true, pessoaId: pessoa.id }
}

// ── Entrar com senha (conta de painel) ──────────────────────────────────────

export type ResultadoEntradaComSenha =
  | { ok: true; pessoaId: string; papel: Papel }
  | { ok: false; erro: string }

/**
 * O caminho de quem tem conta de painel: CPF, e-mail ou usuário antigo, mais
 * senha.
 *
 * A resposta é sempre a mesma quando falha — "CPF ou senha incorretos" —,
 * nunca "esse CPF não existe" nem "senha errada": diferenciar entregaria uma
 * forma de descobrir quem tem conta no sistema, exatamente como no login por
 * WhatsApp.
 */
export async function entrarComSenha(
  dep: Dependencias,
  identificadorBruto: string,
  senha: string,
): Promise<ResultadoEntradaComSenha> {
  const agora = dep.agora ?? (() => Date.now())
  const recusa = { ok: false as const, erro: 'CPF ou senha incorretos.' }

  const identificador = (identificadorBruto ?? '').trim()
  if (!identificador || !senha) return recusa

  if (!dep.autenticar) {
    throw new Error('Login por senha não está configurado neste ambiente.')
  }

  /*
   * Limite por identificador, não por IP.
   *
   * IP muda a cada torre de celular e cada CGNAT de operadora — bloquear por
   * IP tranca gente de verdade e deixa passar quem troca de rede a cada
   * tentativa. O identificador é o que o atacante não pode variar sem também
   * variar a conta que está tentando invadir.
   */
  if (!podePassar(`senha:${identificador.toLowerCase()}`, 5, 10 * 60_000, agora())) {
    return { ok: false, erro: 'Muitas tentativas. Espere alguns minutos e tente de novo.' }
  }

  const email = identificadorParaEmail(identificador)
  const auth = await dep.autenticar(email, senha)
  if (!auth) return recusa

  const perfil = await dep.repo.perfilPorId(auth.userId)
  // Suspensa responde igual a senha errada: dizer "sua organização foi
  // suspensa" a quem só errou a senha entregaria informação de graça, e
  // quem FOI suspenso já sabe por quê — não precisa que a tela confirme.
  if (!perfil || !perfil.ativo) return recusa

  return { ok: true, pessoaId: perfil.id, papel: perfil.papel }
}
