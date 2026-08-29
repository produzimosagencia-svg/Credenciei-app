# Credenciei — Plataforma (App + Web)

Projeto de transformação do Credenciei em plataforma multiplataforma:
Android, iOS e Web sobre a MESMA base e a MESMA regra de negócio.

> **Ainda não há código aqui.** Esta pasta guarda o planejamento até a
> Sprint 0 ser aprovada. O sistema em produção continua em `c:\Dev\credenciei`
> e não é tocado por este projeto até haver decisão explícita.

## Estrutura

    docs/
      auditoria.md          o que existe hoje, medido
      arquitetura.md        a decisão central e o desenho proposto
      backlog.md            epics → features → tasks
      infraestrutura.md     contas, custos, quem cria o quê
      riscos.md             o que pode dar errado, e o plano
      decisoes/             uma decisão por arquivo (ADR)
      sprints/              planejamento e review de cada sprint

## Relação com o sistema atual

O sistema atual NÃO é substituído. Ele vira a base:

    c:\Dev\credenciei        Next.js — web + regra de negócio + banco
             │
             ├── ganha uma API HTTP (/api/v1)   ← o trabalho central
             │
    c:\Dev\credenciei-app    o app mobile, que consome essa API

A regra de negócio continua morando num lugar só.
