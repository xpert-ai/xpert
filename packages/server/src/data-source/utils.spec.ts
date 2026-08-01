import { Readable } from 'stream'
import { DBQueryRunner } from '@xpert-ai/plugin-sdk'
import { readExcelWorkSheets } from '@xpert-ai/server-common'
import { importSheetTables } from './utils'

jest.mock('@xpert-ai/server-common', () => ({
	getErrorMessage: jest.fn((error) => error?.message ?? String(error)),
	readExcelWorkSheets: jest.fn()
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

	it('imports Excel worksheets and tears down the runner', async () => {
		const runner = {
			type: 'postgres',
			import: jest.fn().mockResolvedValue(undefined),
			teardown: jest.fn().mockResolvedValue(undefined)
		} as unknown as DBQueryRunner
		;(readExcelWorkSheets as jest.Mock).mockResolvedValue([
			{
				name: 'sales',
				data: [{ id: '1', amount: 10 }]
			}
		])

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
				originalname: 'sales.xlsx',
				encoding: '7bit',
				mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
				buffer: Buffer.from('workbook')
			} as never
		)

		expect(runner.import).toHaveBeenCalledWith(
			expect.objectContaining({
				name: 'sales',
				data: [{ id: '1', amount: 10 }],
				format: 'json'
			}),
			{ catalog: undefined }
		)
		expect(runner.teardown).toHaveBeenCalledTimes(1)
	})

	it('wraps Excel import failures and still tears down the runner', async () => {
		const runner = {
			type: 'postgres',
			import: jest.fn().mockRejectedValue(new Error('database unavailable')),
			teardown: jest.fn().mockResolvedValue(undefined)
		} as unknown as DBQueryRunner
		;(readExcelWorkSheets as jest.Mock).mockResolvedValue([
			{
				name: 'sales',
				data: [{ id: '1' }]
			}
		])

		await expect(
			importSheetTables(
				runner,
				[
					{
						name: 'sales',
						columns: [{ name: 'id', fieldName: 'id', type: 'String', isKey: false }],
						mergeType: 'DELETE'
					}
				],
				{
					fieldname: 'file',
					originalname: 'sales.xlsx',
					encoding: '7bit',
					mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
					buffer: Buffer.from('workbook')
				} as never
			)
		).rejects.toThrow('database unavailable')
		expect(runner.teardown).toHaveBeenCalledTimes(1)
	})
})
