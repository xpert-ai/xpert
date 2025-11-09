import { Query } from '@nestjs/cqrs'
import { FindOneOptions } from 'typeorm';
import { Knowledgebase } from '../knowledgebase.entity';

export class KnowledgebaseGetOneQuery extends Query<Knowledgebase> {
	static readonly type = '[Knowledgebase] Get one'

	constructor(
		public readonly input: {
			id: string;
			options?: FindOneOptions<Knowledgebase>
		}
	) {
		super()
	}
}
