import { ArgumentMetadata, BadRequestException } from '@nestjs/common'
import {
    ProjectSettingsUpdateDTO,
    ProjectUpdateInputDTO,
    createProjectUpdateValidationPipe
} from './project-update.dto'

describe('ProjectUpdateInputDTO', () => {
    const metadata: ArgumentMetadata = { type: 'body', metatype: ProjectUpdateInputDTO }

    it('accepts only Project basic configuration fields', async () => {
        const result = await createProjectUpdateValidationPipe().transform(
            {
                name: 'Launch plan',
                avatar: { emoji: { id: 'rocket' } },
                description: 'Coordinate the launch',
                settings: { mode: 'plan', managementMode: 'advanced' }
            },
            metadata
        )

        expect(result).toBeInstanceOf(ProjectUpdateInputDTO)
        expect(result).toMatchObject({
            name: 'Launch plan',
            avatar: { emoji: { id: 'rocket' } },
            description: 'Coordinate the launch',
            settings: { mode: 'plan', managementMode: 'advanced' }
        })
        expect(result.settings).toBeInstanceOf(ProjectSettingsUpdateDTO)
    })

    it.each(['id', 'tenantId', 'organizationId', 'ownerId', 'owner', 'status', 'workspaceId', 'copilotModel'])(
        'rejects ordinary updates to the protected %s field for every Project role',
        async (field) => {
            await expect(
                createProjectUpdateValidationPipe().transform(
                    { name: 'Launch plan', [field]: 'attacker-value' },
                    metadata
                )
            ).rejects.toBeInstanceOf(BadRequestException)
        }
    )

    it.each(['instruction', 'projectAssistantId'])(
        'rejects the governed settings.%s field from the ordinary update route',
        async (field) => {
            await expect(
                createProjectUpdateValidationPipe().transform(
                    { settings: { mode: 'plan', [field]: 'attacker-value' } },
                    metadata
                )
            ).rejects.toBeInstanceOf(BadRequestException)
        }
    )

    it.each(['name', 'avatar', 'description', 'settings'])(
        'rejects null for the non-null basic field %s',
        async (field) => {
            await expect(
                createProjectUpdateValidationPipe().transform({ [field]: null }, metadata)
            ).rejects.toBeInstanceOf(BadRequestException)
        }
    )
})
