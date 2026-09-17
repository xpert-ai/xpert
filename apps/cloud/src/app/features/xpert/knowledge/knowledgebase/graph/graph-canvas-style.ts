import type cytoscape from 'cytoscape'

export function graphStyles(): cytoscape.StylesheetJson {
  const textPrimary = graphCssVar('--color-text-primary', '--foreground')
  const textSecondary = graphCssVar('--color-text-secondary', '--muted-foreground')
  const textTertiary = graphCssVar('--color-text-tertiary', '--muted-foreground')
  const border = graphCssVar('--color-components-panel-border', '--border')
  const background = graphCssVar('--color-components-card-bg', '--background')
  const primary = graphCssVar('--color-primary', '--primary')
  const fontFamily = window.getComputedStyle(document.body).fontFamily

  return [
    {
      selector: 'node',
      style: {
        'background-color': 'data(color)',
        'border-color': background,
        'border-width': 3,
        width: 'data(size)',
        height: 'data(size)',
        label: 'data(label)',
        color: textSecondary,
        'font-family': fontFamily,
        'font-size': 12,
        'font-weight': 500,
        'text-valign': 'bottom',
        'text-halign': 'center',
        'text-margin-y': 9,
        'text-wrap': 'ellipsis',
        'text-max-width': '132px',
        'text-background-color': background,
        'text-background-opacity': 0.86,
        'text-background-padding': '3px',
        'overlay-opacity': 0,
        'transition-property': 'opacity, border-width, border-color',
        'transition-duration': 160
      }
    },
    {
      selector: 'edge',
      style: {
        width: 'data(weight)',
        'line-color': border,
        'target-arrow-color': border,
        'target-arrow-shape': 'triangle',
        'arrow-scale': 0.76,
        'curve-style': 'bezier',
        'control-point-step-size': 54,
        label: 'data(label)',
        color: textTertiary,
        'font-family': fontFamily,
        'font-size': 10,
        'font-weight': 500,
        'text-rotation': 'autorotate',
        'text-background-color': background,
        'text-background-opacity': 0.94,
        'text-background-padding': '3px',
        'text-opacity': 0,
        opacity: 0.72,
        'overlay-opacity': 0,
        'transition-property': 'opacity, line-color, target-arrow-color, text-opacity, width',
        'transition-duration': 160
      }
    },
    { selector: 'node[visibility = "hidden"]', style: { 'border-style': 'dashed', 'border-color': textTertiary } },
    { selector: 'edge[visibility = "hidden"]', style: { 'line-style': 'dashed' } },
    {
      selector: 'node:selected',
      style: {
        'border-color': primary,
        'border-width': 5,
        color: textPrimary,
        'font-weight': 700
      }
    },
    {
      selector: 'edge:selected',
      style: {
        'line-color': primary,
        'target-arrow-color': primary,
        'text-opacity': 1,
        opacity: 1,
        width: 3
      }
    },
    {
      selector: '.is-contextual',
      style: {
        opacity: 1
      }
    },
    {
      selector: '.is-hovered',
      style: {
        'text-opacity': 1,
        opacity: 1
      }
    },
    {
      selector: '.is-muted',
      style: {
        opacity: 0.12,
        'text-opacity': 0
      }
    }
  ]
}

export function graphCssVar(name: string, fallbackName?: string) {
  if (typeof window === 'undefined') {
    return ''
  }
  const style = window.getComputedStyle(document.documentElement)
  const value = style.getPropertyValue(name).trim() || (fallbackName ? style.getPropertyValue(fallbackName).trim() : '')
  if (!value) {
    return ''
  }

  const canvas = document.createElement('canvas')
  canvas.width = 1
  canvas.height = 1
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) {
    return value
  }
  context.fillStyle = value
  context.fillRect(0, 0, 1, 1)
  const [red, green, blue, alpha] = context.getImageData(0, 0, 1, 1).data
  return `rgba(${red}, ${green}, ${blue}, ${alpha / 255})`
}
