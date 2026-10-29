const path = require('node:path')
const rootDir = path.resolve(__dirname, '../..')

// Runtime interaction checks complement the remote component's strict tsconfig.check.json.
module.exports = {
  rootDir,
  roots: ['<rootDir>/packages/server-ai/src/xpert-project/remote-components/project-tasks/src'],
  testEnvironment: 'node',
  testMatch: [
    '**/pipeline/*.spec.ts',
    '**/pipeline/*.spec.tsx',
    '**/execution-summary.spec.ts',
    '**/assignee.spec.tsx',
    '**/gantt.spec.tsx',
    '**/view-state.spec.ts'
  ],
  transform: {
    '^.+\\.(ts|tsx|cts)$': [
      'ts-jest',
      {
        tsconfig: {
          target: 'ES2022',
          module: 'commonjs',
          jsx: 'react-jsx',
          esModuleInterop: true,
          isolatedModules: true
        },
        diagnostics: false
      }
    ],
    '^.+\\.(js|mjs)$': [
      'babel-jest',
      {
        babelrc: false,
        configFile: false,
        presets: [['@babel/preset-env', { targets: { node: 'current' } }]]
      }
    ]
  },
  transformIgnorePatterns: ['/node_modules/(?!@xpert-ai/chatkit-types/|\\.pnpm/@xpert-ai\\+chatkit-types@)'],
  moduleNameMapper: {
    // Icons and UI packages must share the renderer's React runtime in this isolated test harness.
    '^react$': '<rootDir>/node_modules/react',
    '^react/(.*)$': '<rootDir>/node_modules/react/$1',
    '^react-dom(.*)$': '<rootDir>/node_modules/react-dom$1',
    '^@xpert-ai/contracts$': '<rootDir>/packages/contracts/src/index.ts',
    '^@/(.*)$': '<rootDir>/packages/shadcn-ui/src/$1',
    '^@xpert-ai/shadcn-ui$': '<rootDir>/packages/shadcn-ui/src/index.ts',
    '^@xpert-ai/shadcn-ui/brand-icons$': '<rootDir>/packages/shadcn-ui/src/brand-icons/index.cts'
  },
  moduleFileExtensions: ['ts', 'tsx', 'cts', 'js', 'mjs', 'json']
}
