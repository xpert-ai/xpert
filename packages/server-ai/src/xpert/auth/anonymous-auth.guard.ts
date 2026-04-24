import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
// Public xpert routes must prefer the xpert strategy so request scope and
// createdBy identity stay pinned to the published xpert principal.
export class AnonymousXpertAuthGuard extends AuthGuard(['xpert', 'jwt']) {
  canActivate(context: ExecutionContext) {
    return super.canActivate(context); // Call Passport strategy
  }
}
