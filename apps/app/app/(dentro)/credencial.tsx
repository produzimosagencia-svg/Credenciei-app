import { EmConstrucao } from '../../src/ui/em-construcao'

export default function Credencial() {
  return (
    <EmConstrucao
      titulo="Minha credencial"
      icone="QrCode"
      oQueVaiFazer="Vai mostrar o seu QR do dia, que muda a cada etapa do evento, e os três botões de bater ponto: entrada, meio e saída."
      deOndeVem="o link da credencial que chega no WhatsApp"
    />
  )
}
