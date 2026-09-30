// Guarda un fichero generado en el cliente. En móvil (PWA en iPhone) abre el
// menú de compartir para guardarlo en Archivos o enviarlo; en escritorio, o si
// compartir no está disponible, lo descarga.
export async function saveFile(filename: string, content: string, type = 'text/csv;charset=utf-8') {
  const file = new File([content], filename, { type })

  const isTouch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches
  if (isTouch && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename })
      return
    } catch (e) {
      // El usuario cerró el menú: no es un error ni hay que descargar.
      if (e instanceof DOMException && e.name === 'AbortError') return
      // Cualquier otro fallo: se intenta la descarga normal.
    }
  }

  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Safari necesita que la URL siga viva un momento tras el click.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
