export default {
  displayName: 'shadcn-ui',
  preset: '../../jest.preset.js',
  testEnvironment: 'jsdom',
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  testMatch: ['<rootDir>/src/**/*.spec.tsx'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: {
          jsx: 'react-jsx',
          esModuleInterop: true,
          module: 'commonjs',
          types: ['jest', 'node', 'react', 'react-dom']
        }
      }
    ]
  },
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' }
}
