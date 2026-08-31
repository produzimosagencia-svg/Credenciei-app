import { EmConstrucao } from '../../src/ui/em-construcao'

export default function Escanear() {
  return (
    <EmConstrucao
      titulo="Escanear QR"
      icone="ScanLine"
      oQueVaiFazer="Vai abrir a câmera, ler o QR da credencial e registrar a presença na hora — inclusive sem internet, guardando na fila até o sinal voltar."
      deOndeVem="/scan"
    />
  )
}
