import { ICertification } from '@xpert-ai/contracts'
import { IQuery } from '@nestjs/cqrs'
import { FindManyOptions } from 'typeorm'

/**
 */
export class CertificationMyQuery implements IQuery {
	static readonly type = '[Certification] My'

	constructor(public readonly options: Pick<FindManyOptions<ICertification>, 'where'> & Pick<
		FindManyOptions<ICertification>,
		'relations'
	>) {}
}
