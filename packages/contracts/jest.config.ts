/* eslint-disable */
export default {
  displayName: 'contracts',
  preset: '../../jest.preset.js',
  globals: {},
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.spec.json'
      }
    ],
    '^.+\\.js$': [
      'babel-jest',
      {
        babelrc: false,
        configFile: false,
        presets: [['@babel/preset-env', { targets: { node: 'current' } }]]
      }
    ]
  },
  transformIgnorePatterns: ['/node_modules/(?!@xpert-ai/chatkit-types/|\\.pnpm/@xpert-ai\\+chatkit-types@)'],
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: '../../coverage/packages/contracts'
}
