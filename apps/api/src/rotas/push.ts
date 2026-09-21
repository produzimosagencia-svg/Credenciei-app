// Registro de token de push — a metade "guardar o endereço de entrega" do
// que falta pra Epic 11. Não manda notificação nenhuma: só recebe o token
// que o Expo devolveu no aparelho, e diz de quem é.
//
// ─── POR QUE NÃO EXIGE PERMISSÃO ALÉM DE ESTAR LOGADO ───────────────────────
//
// Qualquer papel pode registrar o PRÓPRIO aparelho — não é uma ação sobre
// outra pessoa, é sobre quem está pedindo. Não existe "não pode receber
// notificação".
//
// ─── O QUE AINDA FALTA (fora daqui, de propósito) ───────────────────────────
//
// Isto só guarda o token. O modelo de QUEM manda o quê e QUANDO (lembrete
// automático vs aviso escrito por um admin) ainda depende de uma decisão do
// Juan — ver seção 7 de `docs/credenciei-web-estado-atual.md`. Enviar de
// verdade também depende da conta Apple (APNs) e de um projeto Firebase
// (FCM, Android) — nenhum dos dois existe ainda.

import type { Repositorio } from '../dados/repositorio.js'

export async function registrarTokenDePush(
  repo: Repositorio, pessoaId: string, tokenBruto: string, plataformaBruta: string,
): Promise<{ erro?: string }> {
  const token = (tokenBruto ?? '').trim()
  if (!token) return { erro: 'Token vazio.' }
  if (plataformaBruta !== 'ios' && plataformaBruta !== 'android') {
    return { erro: 'Plataforma inválida.' }
  }

  try {
    await repo.registrarTokenDePush(pessoaId, token, plataformaBruta)
  } catch {
    // Registrar push é conveniência, não parte essencial do fluxo — uma
    // falha aqui (ex.: tabela da migração 006 ainda não rodou) não pode
    // parecer um erro pra quem só queria continuar usando o app.
  }
  return {}
}
