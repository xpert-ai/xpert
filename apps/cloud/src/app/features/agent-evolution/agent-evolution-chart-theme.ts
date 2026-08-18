export interface AgentEvolutionChartTheme {
  production: string
  candidate: string
  label: string
  muted: string
  divider: string
}

export function readAgentEvolutionChartTheme(document: Document): AgentEvolutionChartTheme {
  return {
    production: readThemeColor(document, '--color-text-tertiary', '--muted-foreground'),
    candidate: readThemeColor(document, '--color-text-success', '--sys-success'),
    label: readThemeColor(document, '--color-text-secondary', '--muted-foreground'),
    muted: readThemeColor(document, '--color-text-tertiary', '--muted-foreground'),
    divider: readThemeColor(document, '--color-divider-regular', '--border')
  }
}

function readThemeColor(document: Document, ...tokens: string[]) {
  const view = document.defaultView
  const root = document.documentElement
  if (!view) {
    return 'currentColor'
  }

  const rootStyle = view.getComputedStyle(root)
  const token = tokens.find((name) => rootStyle.getPropertyValue(name).trim())
  if (!token) {
    return rootStyle.color || 'currentColor'
  }

  const probe = document.createElement('span')
  probe.style.color = `var(${token})`
  ;(document.body ?? root).appendChild(probe)
  const color = view.getComputedStyle(probe).color
  probe.remove()
  return color || rootStyle.color || 'currentColor'
}
