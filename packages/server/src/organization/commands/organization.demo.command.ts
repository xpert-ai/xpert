import { OrgGenerateDemoOptions } from '@xpert-ai/contracts';
import { ICommand } from '@nestjs/cqrs';

export class OrganizationDemoCommand implements ICommand {
  static readonly type = '[Organization] Demo'

  constructor(public readonly input: { id: string; options?: OrgGenerateDemoOptions }) {}
}
