const { MessageError } = require('./i18n/index.mjs')
const defaults = require('./theme-defaults.json')

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new MessageError('Invalid {{label}} configuration.', { label })
  return value
}

function choice(value, options, label) {
  if (!options.includes(value)) throw new MessageError('Invalid {{label}} configuration.', { label })
  return value
}

function integer(value, min, max, label) {
  if (!Number.isInteger(value) || value < min || value > max)
    throw new MessageError('{{label}} must be an integer from {{min}} to {{max}}.', { label, min, max })
  return value
}

function color(value, label, optional = false) {
  if (optional && value === '') return ''
  if (typeof value !== 'string' || !/^#[\da-f]{6}$/i.test(value))
    throw new MessageError('{{label}} requires a six-digit HEX color.', { label })
  return value.toLowerCase()
}

function font(value, label) {
  if (typeof value !== 'string' || value.length > 200 || (value && !/^[\p{L}\p{N}\s,'"._-]+$/u.test(value)))
    throw new MessageError('Enter a valid font name for {{label}}, up to 200 characters.', { label })
  return value.trim()
}

function colors(value, keys) {
  const input = object(value, 'Colors')
  const result = {}
  for (const key of keys) if (input[key] !== undefined) result[key] = color(input[key], key)
  return result
}

// Persist only known values; arbitrary CSS and renderer-only fields never reach the saved config.
function parseAppearance(value) {
  if (value === undefined) return structuredClone(defaults.appearance)
  const input = object(value, 'Appearance')
  const desktop = { ...defaults.appearance.desktop, ...object(input.desktop ?? {}, 'Desktop') }
  const chatkit = { ...defaults.appearance.chatkit, ...object(input.chatkit ?? {}, 'ChatKit') }
  let grayscale = null
  if (chatkit.grayscale !== null) {
    const gray = object(chatkit.grayscale, 'Grayscale')
    grayscale = {
      hue: integer(gray.hue, 0, 360, 'Grayscale hue'),
      tint: integer(gray.tint, 0, 9, 'Grayscale tint'),
      shade: integer(gray.shade ?? 0, -4, 4, 'Grayscale shade')
    }
  }
  return {
    desktop: {
      radius: integer(desktop.radius, 0, 24, 'Desktop corner radius'),
      baseSize: integer(desktop.baseSize, 14, 18, 'Desktop font size'),
      density: choice(desktop.density, ['compact', 'normal', 'spacious'], 'List density'),
      fontFamily: font(desktop.fontFamily, 'Desktop font'),
      light: colors(desktop.light, Object.keys(defaults.colors.light)),
      dark: colors(desktop.dark, Object.keys(defaults.colors.dark))
    },
    chatkit: {
      radius: choice(chatkit.radius, ['sharp', 'soft', 'round', 'pill'], 'ChatKit corners'),
      density: choice(chatkit.density, ['compact', 'normal', 'spacious'], 'ChatKit density'),
      baseSize: integer(chatkit.baseSize, 14, 18, 'ChatKit font size'),
      fontFamily: font(chatkit.fontFamily, 'ChatKit font'),
      fontFamilyMono: font(chatkit.fontFamilyMono, 'Code font'),
      accentPrimary: color(chatkit.accentPrimary, 'ChatKit accent color', true),
      accentLevel: integer(chatkit.accentLevel, 0, 3, 'Accent intensity'),
      grayscale,
      light: colors(chatkit.light, ['background', 'foreground']),
      dark: colors(chatkit.dark, ['background', 'foreground'])
    }
  }
}

module.exports = { parseAppearance }
