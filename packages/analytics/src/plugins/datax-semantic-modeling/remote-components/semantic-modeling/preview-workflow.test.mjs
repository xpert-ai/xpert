import assert from 'node:assert/strict'
import test from 'node:test'

import { startRemoteViewPreview } from '../../../../../../../tools/remote-view-preview/preview-host.mjs'
import previewConfig from './preview.config.mjs'

test('creates, models, publishes and queries a semantic workspace through the built Remote View host', async (context) => {
	const preview = await startRemoteViewPreview(
		{
			...previewConfig,
			state: structuredClone(previewConfig.state),
			logStartup: false,
			logErrors: false
		},
		{ port: 0 }
	)
	context.after(() => preview.close())

	const frameResponse = await fetch(new URL('/frame', preview.url))
	assert.equal(frameResponse.status, 200)
	const frameHtml = await frameResponse.text()
	assert.match(frameHtml, /datax-semantic-modeling/)

	const catalogs = await bridge(preview.url, {
		type: 'requestParameterOptions',
		requestId: 'catalogs',
		parameterKey: 'catalog',
		query: {
			parameters: {
				dataSourceId: 'source-1'
			}
		}
	})
	assert.deepEqual(catalogs.result.items, [{ value: 'demo', label: 'Demo warehouse' }])

	const created = await bridge(preview.url, {
		type: 'executeAction',
		requestId: 'create',
		actionKey: 'create_workspace',
		input: {
			name: 'Revenue Analytics',
			key: 'revenue_analytics',
			dataSourceId: 'source-1',
			catalog: 'demo',
			projectId: 'project-1',
			type: 'SQL'
		}
	})
	const modelId = created.result.data.id
	assert.equal(modelId, 'model-2')

	const tableSchema = await bridge(preview.url, {
		type: 'requestData',
		requestId: 'table-schema',
		query: {
			parameters: {
				modelId,
				mode: 'table_schema',
				tableName: 'adv_sales'
			}
		}
	})
	assert.equal(tableSchema.data.item[0].name, 'adv_sales')
	assert.deepEqual(
		tableSchema.data.item[0].columns.map((column) => column.name),
		['id', 'name', 'amount']
	)

	const schema = {
		name: 'Revenue Analytics',
		dimensions: [
			{
				name: 'Reseller',
				hierarchies: [
					{
						name: 'Reseller',
						primaryKey: 'id',
						tables: [{ name: 'adv_reseller' }],
						levels: [{ name: 'Reseller', column: 'name', type: 'String' }]
					}
				]
			}
		],
		cubes: [
			{
				name: 'Sales',
				fact: { type: 'table', table: { name: 'adv_sales' } },
				dimensionUsages: [
					{
						name: 'Reseller',
						source: 'Reseller',
						foreignKey: 'reseller_id'
					}
				],
				measures: [{ name: 'Sales Amount', column: 'amount', aggregator: 'sum' }]
			}
		],
		virtualCubes: []
	}
	await bridge(preview.url, {
		type: 'executeAction',
		requestId: 'save',
		actionKey: 'save_draft',
		input: {
			modelId,
			schemaJson: JSON.stringify(schema)
		}
	})
	await bridge(preview.url, {
		type: 'executeAction',
		requestId: 'publish',
		actionKey: 'publish',
		input: { modelId }
	})

	const statement = `SELECT
  [Measures].Members ON COLUMNS,
  [Reseller].[Reseller].[Reseller].Members ON ROWS
FROM [Sales]`
	const query = await bridge(preview.url, {
		type: 'executeAction',
		requestId: 'query',
		actionKey: 'execute_query',
		input: {
			modelId,
			cubeName: 'Sales',
			statement
		}
	})
	assert.equal(query.result.data.rowCount, 3)
	assert.deepEqual(
		query.result.data.columns.map((column) => column.name),
		['Reseller', 'Sales Amount', 'Order Count']
	)

	const stateResponse = await fetch(new URL('/__xpert/remote-view-preview/state', preview.url))
	assert.equal(stateResponse.status, 200)
	const state = await stateResponse.json()
	assert.equal(state.workspace.item.model.id, modelId)
	assert.equal(state.workspace.item.model.status, 'published')
	assert.equal(state.workspace.item.model.projectId, 'project-1')
	assert.deepEqual(state.workspace.item.draft.schema, schema)
})

async function bridge(url, message) {
	const response = await fetch(new URL('/__xpert/remote-view-preview/bridge', url), {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			channel: 'xpertai.remote_component',
			protocolVersion: 1,
			instanceId: previewConfig.instanceId,
			...message
		})
	})
	assert.equal(response.status, 200)
	return response.json()
}
