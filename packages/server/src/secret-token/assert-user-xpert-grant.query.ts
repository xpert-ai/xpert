import { IQuery } from '@nestjs/cqrs'

/** Revalidate the authenticated user's original Assistant delegation before domain route access. */
export class AssertUserXpertGrantQuery implements IQuery {}
