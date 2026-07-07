/* eslint-disable */
const fs = require('node:fs')
const path = require('node:path')

const workspaceRoot = path.resolve(__dirname, '../..')
const nodeModulesRoot = path.join(workspaceRoot, 'node_modules')
const transformSeedPackages: string[] = ['@xpert-ai/chatkit-types']
const staticTransformAllowList: string[] = ['lodash-es', 'nanoid', 'marked', '@angular/common/locales']

const readPackageJson = (packageName: string) => {
  const packagePath = path.join(nodeModulesRoot, ...packageName.split('/'), 'package.json')
  try {
    return JSON.parse(fs.readFileSync(packagePath, 'utf8'))
  } catch {
    return null
  }
}

const collectTransformPackages = (seedPackages: string[]) => {
  const seen = new Set<string>()
  const queue = [...seedPackages]

  while (queue.length) {
    const name = queue.shift()
    if (!name || seen.has(name)) {
      continue
    }

    seen.add(name)
    const pkg = readPackageJson(name)
    if (!pkg) {
      continue
    }

    const deps = {
      ...pkg.dependencies,
      ...pkg.optionalDependencies,
      ...pkg.peerDependencies
    }

    for (const dependencyName of Object.keys(deps || {})) {
      if (!seen.has(dependencyName)) {
        queue.push(dependencyName)
      }
    }
  }

  return Array.from(seen)
}

const escapeRegex = (value: string) => value.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&')
const transformPackages = collectTransformPackages(transformSeedPackages)
const transformAllowList = [...staticTransformAllowList, ...transformPackages]
const transformAllowListPattern = transformAllowList.map(escapeRegex).join('|')
const transformIgnorePattern = transformAllowList.length
  ? `node_modules/(?!((?:\\.pnpm/[^/]+/node_modules/)?(${transformAllowListPattern})(/|$))|.*\\.mjs$)`
  : 'node_modules/'

module.exports = {
  displayName: 'cloud',
  preset: '../../jest.preset.js',
  setupFilesAfterEnv: ['<rootDir>/src/test-setup.ts'],
  globals: {},
  coverageDirectory: '../../coverage/apps/cloud',
  transform: {
    '^.+\\.(ts|mjs|js|html|svg)$': [
      'jest-preset-angular',
      {
        tsconfig: '<rootDir>/tsconfig.spec.json',
        stringifyContentPathRegex: '\\.(html|svg)$'
      }
    ]
  },
  transformIgnorePatterns: [transformIgnorePattern],
  moduleNameMapper: {
    '^@xpert-ai/contracts$': '<rootDir>/../../packages/contracts/src/index.ts',
    '^@cloud/environments/environment$': '<rootDir>/src/environments/environment.jest.ts',
    '^apps/cloud/src/environments/environment$': '<rootDir>/src/environments/environment.jest.ts',
    '^(?:\\.{1,2}/)+environments/environment$': '<rootDir>/src/environments/environment.jest.ts'
  },
  snapshotSerializers: [
    'jest-preset-angular/build/serializers/no-ng-attributes',
    'jest-preset-angular/build/serializers/ng-snapshot',
    'jest-preset-angular/build/serializers/html-comment'
  ]
}
