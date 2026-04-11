/* eslint-disable */
module.exports = {
  displayName: 'echarts',
  preset: '../../jest.preset.js',
  globals: {},
  transform: {
    '^.+\\.[tj]s$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.spec.json'
      }
    ]
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: '../../coverage/packages/echarts',
  transformIgnorePatterns: ['../../node_modules/(?!(echarts)/)']
}
