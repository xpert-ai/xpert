module.exports = {
  displayName: 'local-shell-sandbox',
  testEnvironment: 'node',
  transform: { '^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }] },
  moduleNameMapper: {
    '^@xpert-ai/contracts$': '<rootDir>/../../contracts/src/index.ts',
    '^@xpert-ai/plugin-sdk$': '<rootDir>/../../plugin-sdk/src/index.ts'
  }
}
