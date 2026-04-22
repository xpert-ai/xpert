import { ArgumentsHost, Catch, Injectable } from '@nestjs/common'
import { BaseExceptionFilter, HttpAdapterHost } from '@nestjs/core'
import { normalizeHttpException } from './http-like-exception'

@Catch()
@Injectable()
export class HttpLikeExceptionFilter extends BaseExceptionFilter {
    constructor(adapterHost: HttpAdapterHost) {
        super(adapterHost.httpAdapter)
    }

    override catch(exception: unknown, host: ArgumentsHost) {
        super.catch(normalizeHttpException(exception) ?? exception, host)
    }
}
