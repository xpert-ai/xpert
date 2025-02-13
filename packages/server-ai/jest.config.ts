/* eslint-disable */
export default {
	displayName: 'server-ai',
	preset: '../../jest.preset.js',
	globals: {},
	testEnvironment: 'node',
	transform: {
		'^.+\\.[tj]s$': [
			'ts-jest',
			{
				tsconfig: '<rootDir>/tsconfig.spec.json'
			}
		]
	},
	moduleFileExtensions: ['ts', 'js', 'html'],
	coverageDirectory: '../../coverage/packages/server-ai',
	transformIgnorePatterns: [
		'/node_modules/(?!ali-oss)', // 让 Jest 转换 ali-oss 模块
	  ],
}
