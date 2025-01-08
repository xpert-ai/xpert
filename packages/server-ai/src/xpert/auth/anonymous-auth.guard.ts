import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class AnonymousXpertAuthGuard extends AuthGuard(['jwt', 'xpert']) {
  canActivate(context: ExecutionContext) {
    return super.canActivate(context); // Call Passport strategy
  }
}