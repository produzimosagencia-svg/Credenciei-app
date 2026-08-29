# 002 — Colaborador entra por WhatsApp

**Decidido em** 29/08/2026 por Juan · **Estado:** aceito

## Contexto

20.000 colaboradores precisam de conta. Três caminhos: SMS, e-mail, WhatsApp.

## Decisão

Código de acesso enviado por WhatsApp, no número que a pessoa já cadastrou.

## Por quê

| | Custo p/ 20.000 | Chega? |
|---|---|---|
| SMS | R$ 2.000–4.000 | sim |
| E-mail | grátis | muita gente não tem ou não abre |
| **WhatsApp** | já pago | é onde a equipe já é avisada hoje |

O sistema já manda mensagem por WhatsApp e o telefone já está cadastrado. Não
há canal novo a construir nem custo novo a aprovar.

## Consequência

- A conta fica amarrada ao número. Trocar de número precisa de um caminho de
  recuperação — senão a pessoa perde o histórico.
- Se a conta do WhatsApp for restringida de novo (já aconteceu), o login para
  em conjunto com os avisos. **Precisa de um segundo caminho antes da produção.**
