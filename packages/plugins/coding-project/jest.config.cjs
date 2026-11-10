module.exports = {
  displayName: 'coding-project', preset: '../../../jest.preset.js', testEnvironment: 'node',
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
    '^.+\\.(js|mjs)$': ['babel-jest', { configFile: `${__dirname}/../../server/babel-jest.config.js` }]
  },
  moduleNameMapper: {
    '^@xpert-ai/contracts$': '<rootDir>/../../contracts/dist/index.cjs.js',
    '^@xpert-ai/plugin-sdk$': '<rootDir>/../../plugin-sdk/dist/index.cjs.js'
  },
  transformIgnorePatterns: ['/node_modules/(?!lodash-es/|@xpert-ai/chatkit-types/)'],
  moduleFileExtensions: ['ts', 'js'], coverageDirectory: '../../../coverage/packages/plugins/coding-project'
}
