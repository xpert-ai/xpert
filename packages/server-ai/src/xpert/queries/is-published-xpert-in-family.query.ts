import { IQuery } from '@nestjs/cqrs'

export class IsPublishedXpertInFamilyQuery implements IQuery {
    constructor(
        public readonly candidateXpertId: string,
        public readonly referenceXpertId: string
    ) {}
}
