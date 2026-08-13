/**
 * Entrega de un archivo generado por la API al usuario.
 *
 * En desktop es una descarga común. En mobile, que es donde se arma el pedido
 * caminando el depósito, descargar un .xlsx y después encontrarlo en el
 * explorador de archivos para adjuntarlo a un chat es un dolor. Si el navegador
 * soporta compartir archivos se abre la hoja nativa y el Excel va directo al
 * WhatsApp del proveedor, sin pasar por la carpeta de descargas.
 *
 * No necesita ninguna dependencia: Web Share API nivel 2, con fallback.
 */

export type ResultadoEntrega =
  /** Se abrió la hoja de compartir y el usuario eligió un destino. */
  | 'compartido'
  /** Se descargó el archivo (desktop, o mobile sin soporte para compartir). */
  | 'descargado'
  /** El usuario cerró la hoja de compartir sin elegir nada. */
  | 'cancelado'

export interface Archivo {
  blob: Blob
  filename: string
}

function descargar({ blob, filename }: Archivo): ResultadoEntrega {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // El revoke inmediato corta la descarga en algunos navegadores; un tick
  // alcanza para que el click ya haya tomado el blob.
  setTimeout(() => URL.revokeObjectURL(url), 0)
  return 'descargado'
}

export async function entregarArchivo(archivo: Archivo): Promise<ResultadoEntrega> {
  const { blob, filename } = archivo
  const file = new File([blob], filename, { type: blob.type })

  if (!navigator.canShare?.({ files: [file] })) {
    return descargar(archivo)
  }

  try {
    await navigator.share({ files: [file], title: 'Lista de pedido' })
    return 'compartido'
  } catch (err) {
    // Cerrar la hoja de compartir tira AbortError: es una decisión del usuario,
    // no un error — no corresponde caer a la descarga ni mostrar un mensaje.
    if (err instanceof DOMException && err.name === 'AbortError') {
      return 'cancelado'
    }
    // Cualquier otra falla (permisos, navegador que dice soportar y no) no debe
    // dejar al usuario sin su archivo.
    return descargar(archivo)
  }
}
