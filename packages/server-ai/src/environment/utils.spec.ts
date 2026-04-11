import {
	getContextEnvState,
	mergeEnvironmentWithEnvState,
	mergeRuntimeContextWithEnv
} from './utils'

describe('mergeRuntimeContextWithEnv', () => {
	it('adds env state into runtime context', () => {
		expect(
			mergeRuntimeContextWithEnv(
				{
					workspaceId: 'assistant-workspace'
				},
				{
					variables: [
						{
							name: 'workspaceId',
							value: 'workspace-1',
							type: 'secret'
						},
						{
							name: 'region',
							value: 'cn',
							type: 'default'
						}
					]
				} as any
			)
		).toEqual({
			workspaceId: 'assistant-workspace',
			env: {
				workspaceId: 'workspace-1',
				region: 'cn'
			}
		})
	})

	it('merges existing context env with environment values', () => {
		expect(
			mergeRuntimeContextWithEnv(
				{
					env: {
						existing: 'value',
						region: 'us'
					}
				},
				{
					variables: [
						{
							name: 'region',
							value: 'cn',
							type: 'default'
						},
						{
							name: 'workspaceId',
							value: 'workspace-1',
							type: 'secret'
						}
					]
				} as any
			)
		).toEqual({
			env: {
				existing: 'value',
				region: 'cn',
				workspaceId: 'workspace-1'
			}
		})
	})

	it('returns undefined when both context and environment are empty', () => {
		expect(mergeRuntimeContextWithEnv(undefined, undefined)).toBeUndefined()
	})
})

describe('getContextEnvState', () => {
	it('returns env when context contains a plain env object', () => {
		expect(
			getContextEnvState({
				scope: 'workspace',
				env: {
					workspaceId: 'workspace-1',
					region: 'cn'
				}
			})
		).toEqual({
			workspaceId: 'workspace-1',
			region: 'cn'
		})
	})

	it('returns undefined when env is missing or not a plain object', () => {
		expect(getContextEnvState({ scope: 'workspace' })).toBeUndefined()
		expect(getContextEnvState({ env: 'workspace-1' })).toBeUndefined()
		expect(getContextEnvState(null)).toBeUndefined()
	})
})

describe('mergeEnvironmentWithEnvState', () => {
	it('overrides existing variables and appends request env values', () => {
		expect(
			mergeEnvironmentWithEnvState(
				{
					id: 'env-1',
					name: 'Default',
					variables: [
						{
							name: 'oidc_token',
							value: 'old-token',
							type: 'secret'
						},
						{
							name: 'region',
							value: 'us',
							type: 'default'
						}
					]
				} as any,
				{
					oidc_token: 'new-token',
					workspace: 'cn'
				}
			)
		).toEqual({
			id: 'env-1',
			name: 'Default',
			variables: [
				{
					name: 'oidc_token',
					value: 'new-token',
					type: 'secret'
				},
				{
					name: 'region',
					value: 'us',
					type: 'default'
				},
				{
					name: 'workspace',
					value: 'cn',
					type: 'secret'
				}
			]
		})
	})

	it('creates a transient environment when only request env exists', () => {
		expect(
			mergeEnvironmentWithEnvState(undefined, {
				oidc_token: 'token'
			})
		).toEqual({
			name: 'Request Environment',
			variables: [
				{
					name: 'oidc_token',
					value: 'token',
					type: 'secret'
				}
			]
		})
	})

	it('merges env extracted from request context', () => {
		expect(
			mergeEnvironmentWithEnvState(
				{
					id: 'env-1',
					name: 'Default',
					variables: [
						{
							name: 'region',
							value: 'us',
							type: 'default'
						}
					]
				} as any,
				getContextEnvState({
					env: {
						workspaceId: 'workspace-1',
						region: 'cn'
					}
				})
			)
		).toEqual({
			id: 'env-1',
			name: 'Default',
			variables: [
				{
					name: 'region',
					value: 'cn',
					type: 'default'
				},
				{
					name: 'workspaceId',
					value: 'workspace-1',
					type: 'secret'
				}
			]
		})
	})

	it('ignores nullish override values', () => {
		expect(
			mergeEnvironmentWithEnvState(
				{
					name: 'Default',
					variables: [
						{
							name: 'region',
							value: 'us',
							type: 'default'
						}
					]
				} as any,
				{
					region: null,
					oidc_token: undefined
				}
			)
		).toEqual({
			name: 'Default',
			variables: [
				{
					name: 'region',
					value: 'us',
					type: 'default'
				}
			]
		})
	})
})
