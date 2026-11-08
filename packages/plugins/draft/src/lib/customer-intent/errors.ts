import { BadRequestException } from '@nestjs/common'

export function changeError(code: string): never {
  throw new BadRequestException('Evolution cannot proceed: ' + code)
}
