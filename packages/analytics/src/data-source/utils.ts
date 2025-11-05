import { CreationTable, DBQueryRunner, File } from '@metad/adapter'
import { AuthenticationEnum } from '@metad/contracts'
import { UploadSheetType, getErrorMessage, readExcelWorkSheets } from '@metad/server-common'
import { RequestContext } from '@metad/server-core'
import { BadRequestException, NotFoundException } from '@nestjs/common'
import { DataSource } from './data-source.entity'
import { QueryBus } from '@nestjs/cqrs'
import { DataSourceStrategyQuery } from './queries'

export function prepareDataSource(dataSource: DataSource, userId?: string) {
	userId ||= RequestContext.currentUserId()
	// Basic authentication for single user
	if (dataSource.authType === AuthenticationEnum.BASIC) {
		const authentication = dataSource.authentications?.find((item) => item.userId === userId)
		if (!authentication) {
			throw new NotFoundException(`未找到当前用户认证信息`)
		}

		dataSource.options.username = authentication.username
		dataSource.options.password = authentication.password
	}
	return dataSource
}

export async function importSheetTables(runner: DBQueryRunner, sheets: CreationTable[], file: File) {
	const config = sheets[0]

	// Check catalog of table is existed or create.
	if (config.catalog) {
		await runner.createCatalog(config.catalog)
	}

	if (file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
		try {
			return await loadFromExcel(runner, sheets, file)
		} catch (error) {
			throw new BadRequestException(error.message)
		} finally {
			await runner.teardown()
		}
	}

	let data = null
	if (file.mimetype === 'text/csv') {
		const _sheets: UploadSheetType[] = await readExcelWorkSheets(file.originalname, file)
		data = _sheets[0].data
	}

	try {
		return await runner.import(
			{
				...config,
				file,
				data
			},
			{
				catalog: config.catalog
			}
		)
	} catch (error) {
		throw new BadRequestException(getErrorMessage(error))
	}
}

export async function dataLoad(queryBus: QueryBus, dataSource: DataSource, sheets: CreationTable[], file: File) {
	const isDev = process.env.NODE_ENV === 'development'

	const runner = await queryBus.execute(new DataSourceStrategyQuery(dataSource.type.type, { ...dataSource.options, debug: isDev, trace: isDev }))

	try {
		return await importSheetTables(runner, sheets, file)
	} finally {
		await runner.teardown()
	}
}

export async function loadFromExcel(runner: DBQueryRunner, sheets: CreationTable[], file: File) {
	const _sheets: UploadSheetType[] = await readExcelWorkSheets(file.originalname, file)
	// 并发导入
	await Promise.all(
		_sheets.map((_sheet, index) => {
			const sheet = sheets[index]
			const dataStr = JSON.stringify(_sheet.data)
			const dataBuffer = Buffer.from(dataStr)

			return runner.import(
				{
					name: sheet.name,
					columns: sheet.columns,
					file: {
						buffer: dataBuffer
					} as File,
					data: _sheet.data,
					format: 'json',
					mergeType: sheet.mergeType
				},
				{
					catalog: sheet.catalog
				}
			)
		})
	)
}
