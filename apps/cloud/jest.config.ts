/* eslint-disable */
const fs = require('node:fs')
const path = require('node:path')

const workspaceRoot = path.resolve(__dirname, '../..')
const nodeModulesRoot = path.join(workspaceRoot, 'node_modules')
const transformSeedPackages = ['@xpert-ai/chatkit-types']
const staticTransformAllowList = ['lodash-es', 'nanoid', 'marked', '@angular/common/locales']

type DependencyMap = { [packageName: string]: string }

type NodePackageJson = {
  dependencies?: DependencyMap
  optionalDependencies?: DependencyMap
  peerDependencies?: DependencyMap
}

const readPackageJson = (packageName: string): NodePackageJson | null => {
  const packagePath = path.join(nodeModulesRoot, ...packageName.split('/'), 'package.json')
  try {
    return JSON.parse(fs.readFileSync(packagePath, 'utf8'))
  } catch {
    return null
  }
}

const collectTransformPackages = (seedPackages: readonly string[]): string[] => {
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
const transformIgnorePattern = transformAllowList.length
  ? `node_modules/(?!(${transformAllowList.map(escapeRegex).join('|')})(/|$)|.*\\.mjs$)`
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
