// A marca do Credenciei — a mesma do sistema que já está no ar.
//
// O desenho é a cópia de `c:\Dev\credenciei\app\icon.svg`: um QR branco em
// traço sobre o roxo #4940df, canto arredondado. Não inventei um logotipo novo
// de propósito — quem abre o app tem que reconhecer na hora que é o mesmo
// produto do painel que usa no computador.

import Svg, { Path, Rect } from 'react-native-svg'
import { cor } from './tema'

export function Marca({
  tamanho = 32,
  fundo = cor.marca,
  traco = '#ffffff',
}: {
  tamanho?: number
  fundo?: string
  traco?: string
}) {
  return (
    <Svg width={tamanho} height={tamanho} viewBox="0 0 64 64" accessibilityLabel="Credenciei">
      <Rect width="64" height="64" rx="16" fill={fundo} />
      <Glifo cor={traco} />
    </Svg>
  )
}

/** O QR sozinho, para quando o fundo já é roxo (cabeçalho, tela de abertura). */
export function GlifoDaMarca({ tamanho = 32, traco = '#ffffff' }: { tamanho?: number; traco?: string }) {
  return (
    <Svg width={tamanho} height={tamanho} viewBox="0 0 64 64">
      <Glifo cor={traco} />
    </Svg>
  )
}

function Glifo({ cor: traco }: { cor: string }) {
  // O grupo original é `translate(16,16) scale(1.3333)` sobre um ícone de 24.
  // As coordenadas abaixo já saem multiplicadas, para o SVG do React Native não
  // precisar de transformação aninhada.
  const t = (v: number) => 16 + v * 1.3333
  const l = (v: number) => v * 1.3333

  return (
    <>
      <Rect x={t(3)} y={t(3)} width={l(5)} height={l(5)} rx={l(1)} fill="none" stroke={traco} strokeWidth={l(2)} />
      <Rect x={t(16)} y={t(3)} width={l(5)} height={l(5)} rx={l(1)} fill="none" stroke={traco} strokeWidth={l(2)} />
      <Rect x={t(3)} y={t(16)} width={l(5)} height={l(5)} rx={l(1)} fill="none" stroke={traco} strokeWidth={l(2)} />
      <Path
        d={`M${t(21)} ${t(16)}h${l(-3)}a${l(2)} ${l(2)} 0 0 0 ${l(-2)} ${l(2)}v${l(3)}`}
        fill="none" stroke={traco} strokeWidth={l(2)} strokeLinecap="round" strokeLinejoin="round"
      />
      <Path d={`M${t(21)} ${t(21)}v.01`} fill="none" stroke={traco} strokeWidth={l(2)} strokeLinecap="round" />
      <Path
        d={`M${t(12)} ${t(7)}v${l(3)}a${l(2)} ${l(2)} 0 0 1 ${l(-2)} ${l(2)}h${l(-3)}`}
        fill="none" stroke={traco} strokeWidth={l(2)} strokeLinecap="round" strokeLinejoin="round"
      />
      <Path d={`M${t(3)} ${t(12)}h.01`} fill="none" stroke={traco} strokeWidth={l(2)} strokeLinecap="round" />
      <Path d={`M${t(12)} ${t(3)}h.01`} fill="none" stroke={traco} strokeWidth={l(2)} strokeLinecap="round" />
      <Path d={`M${t(12)} ${t(16)}v.01`} fill="none" stroke={traco} strokeWidth={l(2)} strokeLinecap="round" />
      <Path d={`M${t(16)} ${t(12)}h${l(1)}`} fill="none" stroke={traco} strokeWidth={l(2)} strokeLinecap="round" />
      <Path d={`M${t(21)} ${t(12)}v.01`} fill="none" stroke={traco} strokeWidth={l(2)} strokeLinecap="round" />
      <Path d={`M${t(12)} ${t(21)}v${l(-1)}`} fill="none" stroke={traco} strokeWidth={l(2)} strokeLinecap="round" />
    </>
  )
}
