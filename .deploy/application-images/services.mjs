import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const api = require('../api/dependencies.cjs')
const web = require('../webapp/dependencies.cjs')

// The Docker dependency profiles own the list of shared source packages. Web
// also copies two browser-safe plugin-sdk contracts without installing the SDK.
export const services = [
  {
    name: '@xpert-ai/xpert-api',
    manifest: 'apps/api/package.json',
    image_name: 'xpert-api',
    dockerfile: '.deploy/api/Dockerfile',
    node_options: '--max-old-space-size=4096',
    shared: api.packages.map((directory) => `${directory}/package.json`)
  },
  {
    name: '@xpert-ai/xpert-ui',
    manifest: 'apps/cloud/package.json',
    image_name: 'xpert-webapp',
    dockerfile: '.deploy/webapp/Dockerfile',
    node_options: '--max-old-space-size=4096',
    shared: [...web.packages.filter((directory) => directory !== 'apps/cloud'), 'packages/plugin-sdk'].map(
      (directory) => `${directory}/package.json`
    )
  },
  {
    name: '@xpert-ai/nsjail-runner',
    manifest: 'packages/nsjail-runner/package.json',
    image_name: 'xpert-nsjail-runner',
    dockerfile: '.deploy/nsjail-runner/Dockerfile',
    node_options: '',
    shared: []
  }
]
