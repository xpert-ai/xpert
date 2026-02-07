import {
	Injectable,
	ExecutionContext,
	CallHandler,
    ClassSerializerInterceptor,
	NestInterceptor
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { instanceToPlain } from 'class-transformer';
import { RolesEnum } from '@metad/contracts';
import { RequestContext } from './../../core/context';

@Injectable()
export class SerializerInterceptor extends ClassSerializerInterceptor implements NestInterceptor {

    intercept(
		ctx: ExecutionContext,
		next: CallHandler
	): Observable<any> {
		const role = RequestContext.currentUser()?.role?.name as RolesEnum;
		const groups = role ? [role] : [];
		return next
			.handle()
			.pipe(
				map((data) => instanceToPlain(data, groups.length ? { groups } : {}))
			);
	}
}
