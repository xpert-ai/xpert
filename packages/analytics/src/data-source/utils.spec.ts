import { Readable } from 'stream'
import { DBQueryRunner } from '@xpert-ai/plugin-sdk'
import { readExcelWorkSheets } from '@xpert-ai/server-common'
import { importSheetTables } from './utils'

jest.mock('@xpert-ai/server-common', () => ({
	getErrorMessage: jest.fn((error) => error?.message ?? String(error)),
	readExcelWorkSheets: jest.fn()
}))
jest.mock('@xpert-ai/server-core', () => ({
	RequestContext: {
		currentUserId: jest.fn()
	}
}))

describe('importSheetTables', () => {
	it('streams CSV files to postgres without materializing worksheet rows', async () => {
		const importCsv = jest.fn().mockResolvedValue(undefined)
		const runner = {
			type: 'pg',
			createCatalog: jest.fn(),
			import: jest.fn(),
			importCsv
		} as unknown as DBQueryRunner & { importCsv: jest.Mock }

		await importSheetTables(
			runner,
			[
				{
					name: 'sales',
					columns: [
						{ name: 'id', fieldName: 'id', type: 'String', isKey: false },
						{ name: 'amount', fieldName: 'amount', type: 'Number', isKey: false }
					],
					mergeType: 'DELETE'
				}
			],
			{
				fieldname: 'file',
				originalname: 'sales.csv',
				encoding: '7bit',
				mimetype: 'text/csv',
				stream: Readable.from(['id,amount\n1,10\n']),
				path: '/tmp/sales.csv'
			} as never
		)

		expect(readExcelWorkSheets).not.toHaveBeenCalled()
		expect(importCsv).toHaveBeenCalledWith(
			expect.objectContaining({
				name: 'sales',
				file: expect.objectContaining({
					path: '/tmp/sales.csv'
				})
			}),
			{ catalog: undefined }
		)
		expect(runner.import).not.toHaveBeenCalled()
	})
})
