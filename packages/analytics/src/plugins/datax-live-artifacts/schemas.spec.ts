import { DataXLiveArtifactManifestSchema } from './schemas'

describe('Data X Live Artifact manifest contract', () => {
	it('accepts a whitelisted binding with declared typed controls', () => {
		expect(
			DataXLiveArtifactManifestSchema.safeParse({
				version: 1,
				bindings: [
					{
						id: 'sales',
						resourceId: 'semantic-model-1',
						actionTypeCode: 'mdx.query_metric_snapshot',
						target: { entityRef: 'semantic_indicator:sales' },
						params: { window: '${controls.window}' }
					}
				],
				controls: [
					{
						id: 'window',
						label: 'Window',
						type: 'select',
						defaultValue: 'P30D',
						options: [{ label: '30 days', value: 'P30D' }]
					}
				]
			}).success
		).toBe(true)
	})

	it('rejects undeclared control placeholders and mismatched defaults', () => {
		const parsed = DataXLiveArtifactManifestSchema.safeParse({
			version: 1,
			bindings: [
				{
					id: 'sales',
					resourceId: 'semantic-model-1',
					actionTypeCode: 'mdx.query_cube_slice',
					target: { entityId: '11111111-1111-4111-8111-111111111111' },
					params: { limit: '${controls.missing}' }
				}
			],
			controls: [{ id: 'limit', label: 'Limit', type: 'number', defaultValue: '10' }]
		})

		expect(parsed.success).toBe(false)
		if (!parsed.success) {
			expect(parsed.error.issues.map((issue) => issue.message)).toEqual(
				expect.arrayContaining([
					'number control has an invalid defaultValue',
					"Binding references undeclared control 'missing'"
				])
			)
		}
	})
})
