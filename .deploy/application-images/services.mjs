import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const api = require('../api/dependencies.cjs')
const web = require('../webapp/dependencies.cjs')
const pipelineInputs = [
  '.dockerignore',
  '.deploy/application-images/',
  '.github/workflows/docker-publish.yml',
  '.github/workflows/build-application-images.yml'
]
const nodeInputs = [
  ...pipelineInputs,
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  '.npmrc',
  '.eslintrc.json',
  '.nxignore',
  'nx.json',
  'tsconfig.base.json',
  'wait'
]
const computeRuntimeInputs = [
  'packages/sandbox-runtime/images/compute/',
  'packages/sandbox-runtime/images/browser/runtime/runner-host.mjs',
  'packages/server-ai/src/sandbox/sandbox-job/runtime-definitions/compute-node-python-v1.json'
]

// The Docker dependency profiles own the list of shared source packages. Web
// also copies two browser-safe plugin-sdk contracts without installing the SDK.
export const services = [
  {
    name: '@xpert-ai/xpert-api',
    manifest: 'apps/api/package.json',
    image_name: 'xpert-api',
    dockerfile: '.deploy/api/Dockerfile',
    node_options: '--max-old-space-size=4096',
    health_check: '.deploy/api/check-image.cjs',
    inputs: [
      ...nodeInputs,
      '.deploy/api/',
      '.github/workflows/api-runtime-dependencies.yml',
      'apps/api/',
      'docker/.scripts/initdb.d/',
      'tools/release/',
      'tools/scripts/publish.mjs',
      'tools/scripts/build.mjs',
      'tools/scripts/update-pnpm-lock-if-needed.cjs',
      ...api.packages.map((directory) => `${directory}/`)
    ],
    shared: api.packages.map((directory) => `${directory}/package.json`)
  },
  {
    name: '@xpert-ai/xpert-ui',
    manifest: 'apps/cloud/package.json',
    image_name: 'xpert-webapp',
    dockerfile: '.deploy/webapp/Dockerfile',
    node_options: '--max-old-space-size=4096',
    health_check: '.deploy/webapp/check-image.cjs',
    inputs: [
      ...nodeInputs,
      '.deploy/webapp/',
      '.deploy/api/entrypoint.prod.sh',
      '.deploy/api/entrypoint.compose.sh',
      '.github/workflows/webapp-dependencies.yml',
      'tailwind-workspace-reference.css',
      'tailwind.workspace.config.js',
      'tailwind.theme.vars.js',
      ...web.packages.map((directory) => `${directory}/`),
      'libs/template-installation/',
      'packages/plugin-sdk/src/connector.ts',
      'packages/plugin-sdk/src/lib/connector/strategy.interface.ts'
    ],
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
    health_check: '.deploy/nsjail-runner/check-image.cjs',
    inputs: [...pipelineInputs, '.deploy/nsjail-runner/', 'packages/nsjail-runner/', ...computeRuntimeInputs],
    requiredReleaseInputs: ['.deploy/nsjail-runner/', ...computeRuntimeInputs],
    shared: []
  }
]

export function affectsImage(service, files) {
  return files.some(
    (file) =>
      !/(^|\/)(README|CHANGELOG|AGENTS)\.md$/.test(file) &&
      service.inputs.some((input) => (input.endsWith('/') ? file.startsWith(input) : file === input))
  )
}

export function requiresImageRelease(service, files) {
  return affectsImage(
    { inputs: service.requiredReleaseInputs ?? [] },
    files.filter((file) => !/(^|\/)test_[^/]+\.py$/.test(file))
  )
}
