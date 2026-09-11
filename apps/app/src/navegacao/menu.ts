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
  ehMaster, podeAcompanhar, podeBloquearCpf, podeEscanear, podeGerenciarEventos,
  podeGerenciarUsuarios, podeGerenciarVeiculos,
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
    principal.push({ rota: '/atividades', rotulo: 'Atividades do evento', icone: 'Activity', pronta: true })
  }

  if (podeGerenciarUsuarios(papel)) {
    principal.push({ rota: '/acessos', rotulo: 'Acessos', icone: 'Users', pronta: true })
  }

  // Suporte entra aqui mesmo sem gerenciar acessos: é justamente quem
  // conserta a operação no dia, e veículo é uma das coisas que ele corrige.
  if (podeGerenciarVeiculos(papel)) {
    principal.push({ rota: '/veiculos', rotulo: 'Veículos', icone: 'Truck', pronta: true })
  }

  // O supervisor entra: é ele quem vê a pessoa tentando se cadastrar sem
  // estar escalada. O operador de portão fica de fora — lê o QR, não decide
  // quem pode se cadastrar.
  if (podeBloquearCpf(papel)) {
    principal.push({ rota: '/bloquear-cpf', rotulo: 'Bloquear CPF', icone: 'ShieldBan', pronta: true })
  }

  // Mesmo alcance de `exigirAcessoAoEvento` no site: quem gerencia evento, e
  // supervisor (só o próprio setor). Sem suporte — não está na régua de lá.
  if (podeGerenciarEventos(papel) || papel === 'supervisor') {
    principal.push({ rota: '/relatorios', rotulo: 'Relatórios', icone: 'FileSpreadsheet', pronta: true })
  }

  // Mesmo alcance de `podeBloquearCpf` — quem gerencia evento, supervisor e
  // suporte. Mais restrito que o registro assistido de propósito: aqui se
  // escreve o passado, com hora arbitrária — ato de gestão.
  if (podeBloquearCpf(papel)) {
    principal.push({ rota: '/lancar-ponto', rotulo: 'Lançamento manual', icone: 'ClipboardPen', pronta: true })
  }

  // Sem supervisor: ele já tem a própria equipe na tela do setor — o atalho
  // existe pra quem enxerga o evento inteiro (e suporte, no escopo dele).
  if (podeGerenciarEventos(papel) || papel === 'suporte') {
    principal.push({ rota: '/editar-colaborador', rotulo: 'Editar colaborador', icone: 'UserCog', pronta: true })
  }

  grupos.push({ itens: principal })

  // "Plataforma" continua rotulado: é o que só o dono da plataforma enxerga, e
  // separar deixa claro que não faz parte da operação de um evento.
  if (ehMaster(papel)) {
    grupos.push({
      titulo: 'Plataforma',
      itens: [
        { rota: '/organizacoes', rotulo: 'Organizações', icone: 'Building2', pronta: true },
        { rota: '/base-funcionarios', rotulo: 'Base de funcionários', icone: 'IdCard', pronta: true },
        // A base regional é serviço vendido à parte: quem consulta e atribui
        // gente ao evento de um cliente é o dono da plataforma, não o cliente.
        { rota: '/encontrar', rotulo: 'Encontre colaborador', icone: 'UserSearch', pronta: true },
        // O canal de WhatsApp é da plataforma, não de um evento: quem dispara
        // em massa e responde conversa é o dono, nunca o produtor de um cliente.
        { rota: '/whatsapp', rotulo: 'WhatsApp', icone: 'MessageCircle', pronta: true },
        // Suporte é gente contratada pela PLATAFORMA — o escopo atravessa
        // organizações, e só o master decide quem tem esse acesso.
        { rota: '/suporte', rotulo: 'Suporte de Sistema', icone: 'UserCog', pronta: true },
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
      { rota: '/credencial', rotulo: 'Minha credencial', icone: 'QrCode', pronta: true },
      { rota: '/meus-dias', rotulo: 'Meus dias', icone: 'ClipboardCheck', pronta: true },
      { rota: '/meu-pagamento', rotulo: 'Meu pagamento', icone: 'Wallet', pronta: true },
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
