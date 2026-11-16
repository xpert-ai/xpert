const colors = ['plum', 'mint', 'blue', 'ochre', 'rose', 'aqua']
function overlayAvatar(item) {
  const el = document.createElement('span')
  const tone = Array.from(item.name).reduce((n, c) => (n + c.codePointAt(0)) % colors.length, 0)
  el.className = 'avatar ' + colors[tone]
  el.setAttribute('aria-hidden', 'true')
  el.textContent = item.glyph
  if (!item.glyph && item.kind === 'assistant') {
    const face = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    face.setAttribute('viewBox', '0 0 100 100')
    face.setAttribute('aria-hidden', 'true')
    // The same resting face as the Bosi assistant avatar in the main window.
    for (const [d, width] of [
      ['M23 31 L39 46 L23 60', '7.5'],
      ['M78 35 L64 46 L78 59', '3.3'],
      ['M39 70 Q50 78 61 70', '3.3']
    ]) {
      const path = document.createElementNS(face.namespaceURI, 'path')
      path.setAttribute('d', d)
      path.setAttribute('stroke-width', width)
      face.append(path)
    }
    el.append(face)
  }
  if (item.image) {
    const image = new Image()
    image.alt = ''
    image.referrerPolicy = 'no-referrer'
    image.onload = () => el.replaceChildren(image)
    image.src = item.image
  }
  return el
}
