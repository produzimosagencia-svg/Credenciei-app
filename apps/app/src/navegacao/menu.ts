// O menu do app — o mesmo do sistema web, na mesma ordem.
//
// ─── POR QUE ESTE ARQUIVO NÃO IMPORTA REACT NATIVE ──────────────────────────
//
// Porque o que ele decide é REGRA, não desenho: quem vê o quê. Regra dá para
// testar sem emulador, e é testada em `menu.teste.ts`. O ícone e o toque ficam
// nas telas.
//
// ─── A ORDEM É A DO TRABALHO DE UM DIA ──────────────────────────────────────
//
// Copiada de `c:\Dev\credenciei\components\AppShell.tsx`, com o raciocínio que
// já estava escrito lá: abre o painel, escaneia, regulariza quem perdeu a
// batida, confere as atividades. Recrutar e dar acesso vêm depois, porque são
// de antes ou de depois do evento.
//
// "Eventos" não está na lista de propósito: a lista de eventos vive dentro do
// Painel, e o item levaria para a mesma tela em que a pessoa já está.

import {
  ehMaster, podeAcompanhar, podeEscanear, podeGerenciarUsuarios,
} from '@credenciei/dominio'

export type ItemDoMenu = {
  /** A rota do expo-router. */
  rota: string
  rotulo: string
  /** O nome do ícone lucide, igual ao que o sistema web usa. */
  icone: string
  /**
   * A tela já existe?
   *
   * O menu inteiro aparece desde o primeiro dia, e o que ainda não foi
   * construído aparece marcado. É melhor que esconder: quem usa vê para onde o
   * app está indo, e ninguém procura um item que "sumiu".
   */
  pronta: boolean
}

export type GrupoDoMenu = {
  /** Sem título, o grupo não ganha cabeçalho — é o bloco do dia a dia. */
  titulo?: string
  itens: ItemDoMenu[]
}

/**
 * O menu de quem tem conta de painel.
 *
 * Agrupar só vale a pena quando os grupos têm nome: uma lista corrida de sete
 * itens obriga a ler todos para achar um. Por isso o bloco de cima não tem
 * rótulo e o de baixo tem.
 */
export function menuDoPainel(papel: string): GrupoDoMenu[] {
  const grupos: GrupoDoMenu[] = []

  const principal: ItemDoMenu[] = [
    { rota: '/', rotulo: 'Painel', icone: 'Home', pronta: true },
  ]

  // Escanear QR fica só com quem credencia. O supervisor cuida da equipe, não
  // do portão — mesma separação que as mensagens já dizem à equipe.
  if (podeEscanear(papel)) {
    principal.push({ rota: '/escanear', rotulo: 'Escanear QR', icone: 'ScanLine', pronta: true })
  }

  // Acompanhar, sim: tirar o scanner do supervisor não pode cegá-lo em relação
  // à própria equipe.
  if (podeAcompanhar(papel)) {
    principal.push({ rota: '/ponto', rotulo: 'Registrar ponto', icone: 'ClipboardCheck', pronta: true })
    principal.push({ rota: '/atividades', rotulo: 'Atividades do evento', icone: 'Activity', pronta: false })
  }

  if (podeGerenciarUsuarios(papel)) {
    principal.push({ rota: '/acessos', rotulo: 'Acessos', icone: 'Users', pronta: false })
  }

  grupos.push({ itens: principal })

  // "Plataforma" continua rotulado: é o que só o dono da plataforma enxerga, e
  // separar deixa claro que não faz parte da operação de um evento.
  if (ehMaster(papel)) {
    grupos.push({
      titulo: 'Plataforma',
      itens: [
        { rota: '/organizacoes', rotulo: 'Organizações', icone: 'Building2', pronta: false },
        { rota: '/base-funcionarios', rotulo: 'Base de funcionários', icone: 'IdCard', pronta: false },
        // A base regional é serviço vendido à parte: quem consulta e atribui
        // gente ao evento de um cliente é o dono da plataforma, não o cliente.
        { rota: '/encontrar', rotulo: 'Encontre colaborador', icone: 'UserSearch', pronta: false },
        // O canal de WhatsApp é da plataforma, não de um evento: quem dispara
        // em massa e responde conversa é o dono, nunca o produtor de um cliente.
        { rota: '/whatsapp', rotulo: 'WhatsApp', icone: 'MessageCircle', pronta: false },
      ],
    })
  }

  return grupos
}

/**
 * O menu do colaborador.
 *
 * Não existe no sistema web — lá essa pessoa recebe um link com a credencial
 * dentro e não tem menu nenhum. Aqui ela tem conta, então tem um lugar para
 * onde voltar. Tudo aqui é sobre ELA: a credencial dela, o ponto dela, o
 * pagamento dela. Nenhum item leva a dado de outra pessoa.
 */
export function menuDoColaborador(): GrupoDoMenu[] {
  return [{
    itens: [
      { rota: '/', rotulo: 'Meus eventos', icone: 'CalendarDays', pronta: true },
      { rota: '/credencial', rotulo: 'Minha credencial', icone: 'QrCode', pronta: false },
      { rota: '/meus-dias', rotulo: 'Meus dias', icone: 'ClipboardCheck', pronta: false },
      { rota: '/meu-pagamento', rotulo: 'Meu pagamento', icone: 'Wallet', pronta: false },
    ],
  }]
}

export function menuDe(papel: string): GrupoDoMenu[] {
  return papel === 'colaborador' ? menuDoColaborador() : menuDoPainel(papel)
}

/**
 * As abas do rodapé: as três primeiras do menu, mais "Mais".
 *
 * Três e não cinco porque a barra do celular fica ilegível com rótulo
 * espremido — e porque as três primeiras JÁ são a ordem do trabalho de um dia.
 * O resto do menu não some: mora atrás de "Mais", inteiro.
 */
export function abasDe(papel: string): ItemDoMenu[] {
  const grupos = menuDe(papel)
  const primeiro = grupos[0]?.itens ?? []
  return primeiro.slice(0, 3)
}

/** Sobrou item fora das abas? Então "Mais" tem o que mostrar. */
export function temMaisAlemDasAbas(papel: string): boolean {
  const total = menuDe(papel).reduce((a, g) => a + g.itens.length, 0)
  return total > abasDe(papel).length
}
