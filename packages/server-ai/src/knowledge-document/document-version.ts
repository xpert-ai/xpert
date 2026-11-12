import { BadRequestException } from '@nestjs/common'

export function assertExpectedVersion(version: number | null | undefined): asserts version is number {
    if (!Number.isInteger(version) || version <= 0) {
        throw new BadRequestException('version is required')
    }
}
