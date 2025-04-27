import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { XpertProjectService } from '../project.service';

@Injectable()
export class XpertProjectGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly service: XpertProjectService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const id = request.params.id;

    const project = await this.service.findOne(id, { relations: ['members'] });

    if (!project) {
      throw new ForbiddenException('Xpert project not found');
    }

    const isMember = project.members.some(member => member.id === user.id);
    const isOwner = project.ownerId === user.id;

    if (!isMember && !isOwner) {
      throw new ForbiddenException('Access denied');
    }

    return true;
  }
}
