import { Body, Controller, Get, Post } from '@nestjs/common';
import { AuthService } from './auth.service';

interface LoginDto {
  username?: string;
  password?: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** Indique si l'authentification est requise (public, sans garde). */
  @Get('status')
  status(): { authRequired: boolean } {
    return { authRequired: this.auth.authRequired() };
  }

  /** Échange identifiants → JWT. */
  @Post('login')
  login(@Body() dto: LoginDto): Promise<{ token: string; role: string }> {
    return this.auth.login(dto.username ?? '', dto.password ?? '');
  }
}
