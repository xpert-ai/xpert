import { ISkillRepository } from '@metad/contracts'
import { Exclude, Expose } from 'class-transformer'

@Expose()
export class SimpleSkillRepositoryDTO implements Partial<ISkillRepository> {

    @Exclude()
    options?: Record<string, any>;

    @Exclude()
    credentials?: Record<string, any>;

    constructor(partial: Partial<SimpleSkillRepositoryDTO>) {
        Object.assign(this, partial);
    }
}
