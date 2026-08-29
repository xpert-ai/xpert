const UNIVER_STYLESHEET_ID = 'xp-univer-stylesheet'
const UNIVER_STYLESHEET_PATH = 'univer.css'

let stylesheetLoad: Promise<void> | null = null

export function ensureUniverStylesheet(
  documentRef: Document | undefined = typeof document === 'undefined' ? undefined : document
) {
  if (!documentRef) {
    return Promise.resolve()
  }

  const existing = documentRef.getElementById(UNIVER_STYLESHEET_ID)
  if (existing?.tagName === 'LINK') {
    const link = existing as HTMLLinkElement
    if (link.sheet || link.dataset['loaded'] === 'true') {
      return Promise.resolve()
    }
    stylesheetLoad ??= waitForStylesheet(link)
    return stylesheetLoad
  }

  const link = documentRef.createElement('link')
  link.id = UNIVER_STYLESHEET_ID
  link.rel = 'stylesheet'
  link.href = new URL(UNIVER_STYLESHEET_PATH, documentRef.baseURI).href
  stylesheetLoad = waitForStylesheet(link)
  documentRef.head.append(link)
  return stylesheetLoad
}

function waitForStylesheet(link: HTMLLinkElement) {
  return new Promise<void>((resolve, reject) => {
    const handleLoad = () => {
      link.dataset['loaded'] = 'true'
      stylesheetLoad = null
      resolve()
    }
    const handleError = () => {
      link.remove()
      stylesheetLoad = null
      reject(new Error('Failed to load Univer styles'))
    }

    link.addEventListener('load', handleLoad, { once: true })
    link.addEventListener('error', handleError, { once: true })
  })
}
