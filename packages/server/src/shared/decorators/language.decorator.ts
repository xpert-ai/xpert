import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { LanguagesEnum, LanguagesMap } from '@xpert-ai/contracts';

export const LanguageDecorator = createParamDecorator(
    (data: unknown, ctx: ExecutionContext) => {
        const request = ctx.switchToHttp().getRequest();
        const headers = request.headers;
        return (LanguagesMap[headers['language']] ?? headers['language']) || LanguagesEnum.English;
    }
);