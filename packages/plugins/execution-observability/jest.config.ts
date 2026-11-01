import serverConfig from '../../server/jest.config'
export default {
  ...serverConfig,
  displayName: 'execution-observability',
  preset: '../../../jest.preset.js',
  moduleNameMapper: {
    '^@xpert-ai/contracts$': '<rootDir>/../../contracts/src/index.ts',
    '^@xpert-ai/plugin-sdk$': '<rootDir>/../../plugin-sdk/dist/index.cjs.js'
  },
  coverageDirectory: '../../../coverage/packages/plugins/execution-observability'
}
