// Os ícones — os mesmos do sistema web.
//
// O painel usa `lucide-react`; aqui é `lucide-react-native`, que é a mesma
// biblioteca desenhando em SVG. Assim o "Escanear QR" do celular tem o mesmo
// desenho do "Escanear QR" do computador.
//
// ─── POR QUE CADA ÍCONE VEM DO PRÓPRIO ARQUIVO ──────────────────────────────
//
// `import { Home } from 'lucide-react-native'` funciona — e traz os MIL E
// OITOCENTOS ícones da biblioteca para dentro do pacote do app, porque o
// empacotador do React Native não descarta o que não é usado. Medido aqui: de
// 881 para 2.692 módulos, só por causa dessa linha.
//
// Importando de `lucide-react-native/icons/<nome>`, entra um arquivo por ícone.
// O nome do arquivo é o nome CANÔNICO, em minúsculas com traço — e nem sempre é
// o que a gente chama: `Home` virou `house`, e `MoreHorizontal` virou
// `ellipsis`. Os apelidos antigos só existem no índice completo.

import type { ColorValue } from 'react-native'
import type { LucideIcon } from 'lucide-react-native'
import Activity from 'lucide-react-native/icons/activity'
import Building2 from 'lucide-react-native/icons/building-2'
import Camera from 'lucide-react-native/icons/camera'
import CameraOff from 'lucide-react-native/icons/camera-off'
import CircleAlert from 'lucide-react-native/icons/circle-alert'
import CircleCheckBig from 'lucide-react-native/icons/circle-check-big'
import CalendarDays from 'lucide-react-native/icons/calendar-days'
import Check from 'lucide-react-native/icons/check'
import ChevronLeft from 'lucide-react-native/icons/chevron-left'
import ChevronRight from 'lucide-react-native/icons/chevron-right'
import ClipboardCheck from 'lucide-react-native/icons/clipboard-check'
import ClipboardPen from 'lucide-react-native/icons/clipboard-pen'
import Clock from 'lucide-react-native/icons/clock'
import Download from 'lucide-react-native/icons/download'
import Ellipsis from 'lucide-react-native/icons/ellipsis'
import EyeOff from 'lucide-react-native/icons/eye-off'
import FileDown from 'lucide-react-native/icons/file-down'
import FileSpreadsheet from 'lucide-react-native/icons/file-spreadsheet'
import FileUp from 'lucide-react-native/icons/file-up'
import Hammer from 'lucide-react-native/icons/hammer'
import House from 'lucide-react-native/icons/house'
import IdCard from 'lucide-react-native/icons/id-card'
import Lock from 'lucide-react-native/icons/lock'
import LogIn from 'lucide-react-native/icons/log-in'
import LogOut from 'lucide-react-native/icons/log-out'
import MapPin from 'lucide-react-native/icons/map-pin'
import MessageCircle from 'lucide-react-native/icons/message-circle'
import Plus from 'lucide-react-native/icons/plus'
import QrCode from 'lucide-react-native/icons/qr-code'
import Radio from 'lucide-react-native/icons/radio'
import RefreshCw from 'lucide-react-native/icons/refresh-cw'
import ScanSearch from 'lucide-react-native/icons/search'
import Send from 'lucide-react-native/icons/send'
import ShieldBan from 'lucide-react-native/icons/shield-ban'
import ShieldCheck from 'lucide-react-native/icons/shield-check'
import SwitchCamera from 'lucide-react-native/icons/switch-camera'
import TriangleAlert from 'lucide-react-native/icons/triangle-alert'
import Truck from 'lucide-react-native/icons/truck'
import User from 'lucide-react-native/icons/user'
import ScanLine from 'lucide-react-native/icons/scan-line'
import UserCheck from 'lucide-react-native/icons/user-check'
import UserCog from 'lucide-react-native/icons/user-cog'
import UserSearch from 'lucide-react-native/icons/user-search'
import UserX from 'lucide-react-native/icons/user-x'
import Users from 'lucide-react-native/icons/users'
import Wallet from 'lucide-react-native/icons/wallet'
import X from 'lucide-react-native/icons/x'
import { cor } from './tema'

/**
 * O inventário de ícones do app.
 *
 * As chaves são os nomes que o menu usa — os mesmos do `AppShell.tsx` do
 * sistema web, para as duas listas poderem ser comparadas lado a lado.
 */
const ICONES: Record<string, LucideIcon> = {
  Activity,
  AlertCircle: CircleAlert,
  AlertTriangle: TriangleAlert,
  Building2,
  CalendarDays,
  Camera,
  CameraOff,
  Check,
  CheckCircle: CircleCheckBig,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  ClipboardPen,
  Clock,
  Download,
  EyeOff,
  FileDown,
  FileSpreadsheet,
  FileUp,
  Hammer,
  Home: House,
  IdCard,
  Lock,
  LogIn,
  LogOut,
  MapPin,
  MessageCircle,
  MoreHorizontal: Ellipsis,
  Plus,
  QrCode,
  Radio,
  RefreshCw,
  ScanLine,
  Search: ScanSearch,
  Send,
  ShieldBan,
  ShieldCheck,
  SwitchCamera,
  Truck,
  User,
  UserCheck,
  UserCog,
  UserSearch,
  UserX,
  Users,
  Wallet,
  X,
}

export function Icone({
  nome, tamanho = 20, tom = cor.neutro500, espessura = 2,
}: {
  nome: string
  tamanho?: number
  /**
   * `ColorValue` e não `string` porque a barra de abas entrega a cor já
   * resolvida — pode ser um valor opaco da plataforma, e não um texto como
   * '#6d46ff'.
   */
  tom?: ColorValue
  espessura?: number
}) {
  // Ícone desconhecido vira um relógio em vez de derrubar a tela: um nome
  // escrito errado no menu não pode apagar o app inteiro.
  const Desenho = ICONES[nome] ?? Clock
  return <Desenho size={tamanho} color={tom as string} strokeWidth={espessura} />
}

export const NOMES_DE_ICONE = Object.keys(ICONES)
