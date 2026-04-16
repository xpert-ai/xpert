/* eslint-disable */
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
  transformIgnorePatterns: ['node_modules/(?!lodash-es|nanoid|marked|@angular/common/locales|.*.mjs$)'],
  moduleNameMapper: {
    '^@cloud/environments/environment$': '<rootDir>/src/environments/environment.jest.ts',
    '^(?:\\.{1,2}/)+environments/environment$': '<rootDir>/src/environments/environment.jest.ts'
  },
  snapshotSerializers: [
    'jest-preset-angular/build/serializers/no-ng-attributes',
    'jest-preset-angular/build/serializers/ng-snapshot',
    'jest-preset-angular/build/serializers/html-comment'
  ]
}
