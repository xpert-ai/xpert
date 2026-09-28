// Package only the three public URLs. Installed apps use the build snapshot,
// never ambient environment variables, and saved user connections take precedence.
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { DEFAULT_CONFIG, parseConfig } = require('../service.cjs')
const { chatkitUrl } = require('./urls.mjs')
const keys = ['apiUrl', 'webUrl', 'frameUrl']

function validateConnection(value) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !keys.includes(key))
  )
    throw new Error('Desktop connection JSON must contain only apiUrl, webUrl and frameUrl')
  for (const key of Object.keys(value))
    if (typeof value[key] !== 'string' || !value[key].trim())
      throw new Error(`Invalid Desktop connection field: ${key}`)
  return value
}

function connectionDefaults(env = process.env) {
  const file = env.XPERT_DESKTOP_CONNECTION_FILE
    ? validateConnection(JSON.parse(readFileSync(resolve(env.XPERT_DESKTOP_CONNECTION_FILE), 'utf8')))
    : {}
  const overrides = { ...file }
  for (const [key, variable] of [
    ['apiUrl', 'XPERT_DESKTOP_API_URL'],
    ['webUrl', 'XPERT_DESKTOP_WEB_URL'],
    ['frameUrl', 'XPERT_DESKTOP_CHATKIT_URL']
  ])
    if (env[variable] !== undefined) overrides[key] = env[variable]
  validateConnection(overrides)
  // A customer Web deployment also hosts ChatKit unless explicitly overridden.
  if (overrides.webUrl && !overrides.frameUrl) overrides.frameUrl = chatkitUrl(overrides.webUrl)
  const config = parseConfig({ ...DEFAULT_CONFIG, ...overrides })
  return Object.fromEntries(keys.map((key) => [key, config[key]]))
}

function packagedConnection(file = resolve(__dirname, '../../dist/connection-defaults.json')) {
  const value = validateConnection(JSON.parse(readFileSync(file, 'utf8')))
  if (!keys.every((key) => Object.hasOwn(value, key)))
    throw new Error('Packaged Desktop connection URLs are incomplete')
  const config = parseConfig({ ...DEFAULT_CONFIG, ...value })
  return Object.fromEntries(keys.map((key) => [key, config[key]]))
}

module.exports = { connectionDefaults, packagedConnection }
