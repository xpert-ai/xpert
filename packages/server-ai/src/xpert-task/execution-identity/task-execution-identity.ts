import { CommandBus } from '@nestjs/cqrs'
import { IUser, IXpertTask } from '@xpert-ai/contracts'
import { ResolveExecutionIdentityCommand, runWithExecutionIdentity } from '@xpert-ai/server-core'

/** Persisted task ownership selects the actor; ambient requests and cached relations grant no authority. */
export async function runWithTaskExecutionIdentity<T>(
    commands: CommandBus,
    task: Pick<IXpertTask, 'tenantId' | 'organizationId'>,
    userId: string,
    work: (user: IUser) => T | Promise<T>
): Promise<T> {
    const identity = await commands.execute(
        new ResolveExecutionIdentityCommand({
            tenantId: task.tenantId,
            organizationId: task.organizationId,
            userId,
            kind: 'user'
        })
    )
    return runWithExecutionIdentity(identity, () => work(identity.user))
}
