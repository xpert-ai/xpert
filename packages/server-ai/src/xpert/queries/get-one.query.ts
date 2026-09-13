import type { Xpert } from '../xpert.entity'
import { FindOptionsWhere } from '@xpert-ai/server-core'
import { IQuery } from '@nestjs/cqrs'

export class FindXpertQuery implements IQuery {
    static readonly type = '[Xpert] Find One'

    constructor(
        public readonly conditions: FindOptionsWhere<Xpert>,
        public readonly params?: {
            relations?: string[]
            /**
             * Draft First
             */
            isDraft?: boolean
        }
    ) {}
}
