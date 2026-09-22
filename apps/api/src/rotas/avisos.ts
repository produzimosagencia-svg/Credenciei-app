// O mural "Avisos" — comunicado do admin, mostrado quando a pessoa abre a
// própria tela. Cópia de `avisosPendentesFuncionario`/
// `avisosPendentesSupervisor` no site (`lib/avisos.ts`): a MESMA tabela, não
// uma cópia isolada — um aviso criado no painel do site precisa aparecer no
// app, e vice-versa.
//
// Fase 1 (21/09/2026): só a LEITURA — ver e confirmar visto. Criar/editar
// aviso continua sendo feito pelo painel do site (`/admin/eventos/[id]/
// avisos`), que já tem essa tela pronta; nada se perde adiando o CRUD no
// app pra depois.
//
// Nenhuma checagem de permissão extra além de estar logado: a régua de
// quem vê o quê já é resolvida por dentro (`Repositorio.avisosPendentes`,
// pelo `pessoaId` — nunca aceito de fora, resolvido do token, como em toda
// rota deste projeto).

import type { Repositorio } from '../dados/repositorio.js'

export async function avisosPendentes(
  repo: Repositorio, pessoaId: string, eventoId: string,
): Promise<{ id: string; titulo: string; mensagem: string }[]> {
  return repo.avisosPendentes(pessoaId, eventoId)
}

export async function marcarAvisoVisto(
  repo: Repositorio, pessoaId: string, avisoId: string,
): Promise<Record<string, never>> {
  await repo.marcarAvisoVisto(avisoId, pessoaId)
  return {}
}
