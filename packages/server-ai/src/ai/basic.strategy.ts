import { Strategy } from 'passport-custom';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';

@Injectable()
export class XpertTokenStrategy extends PassportStrategy(Strategy, 'xpert-token') {
    constructor() {
        super();
    }

    async validate(req: Request, done: any) {
        try {
            const authHeader = req.headers['authorization'];
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                return done(new UnauthorizedException('Authorization header not provided or invalid'), false);
            }

            const token = authHeader.split(' ')[1];
            const user = await this.validateUser(token);
            if (!user) {
                return done(new UnauthorizedException('Invalid token'), false);
            }

            done(null, user);
        } catch (err) {
            console.error(err);
            return done(new UnauthorizedException('Unauthorized', err.message), false);
        }
    }

    validateUser(token: string) {
        console.log(token);
        return true;
    }
}