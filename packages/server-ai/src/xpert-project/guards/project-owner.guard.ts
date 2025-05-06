import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { XpertProjectService } from '../project.service';

@Injectable()
export class XpertProjectOwnerGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly service: XpertProjectService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const id = request.params.id;

    const project = await this.service.findOne(id);

    if (!project) {
      throw new ForbiddenException('Xpert project not found');
    }

    const isOwner = project.ownerId === user.id;

    if (!isOwner) {
      throw new ForbiddenException('Access denied');
    }

    return true;
  }
}
