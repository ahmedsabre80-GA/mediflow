import bcrypt from 'bcrypt';
import { z } from 'zod';
import type { IUserRepository } from '../../domain/repositories/IUserRepository';
import type { ITokenService } from '../ports/ITokenService';
import type { IRefreshTokenRepository } from '../ports/IRefreshTokenRepository';
import { AuthenticationError, BusinessRuleError } from '@mediflow/shared-errors';
import type { TokenPair } from '@mediflow/shared-types';

const LoginSchema = z.object({
  identifier: z.string().min(1),  // email or phone
  password: z.string().min(1),
  deviceId: z.string().optional(),
  deviceName: z.string().optional(),
  platform: z.enum(['ios', 'android', 'web']).optional(),
});

type LoginInput = z.infer<typeof LoginSchema>;

type LoginOutput =
  | { mfaRequired: false; tokens: TokenPair }
  | { mfaRequired: true; mfaToken: string; mfaMethod: string };

export class LoginUserUseCase {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly tokenService: ITokenService,
    private readonly refreshTokenRepository: IRefreshTokenRepository,
    private readonly mfaService: IMfaService,
    private readonly auditService: IAuditService,
  ) {}

  async execute(input: LoginInput, ipAddress: string): Promise<LoginOutput> {
    const data = LoginSchema.parse(input);

    // Find user by email or phone
    const user = data.identifier.includes('@')
      ? await this.userRepository.findByEmail(data.identifier)
      : await this.userRepository.findByPhone(data.identifier);

    if (!user || !user.passwordHash) {
      throw new AuthenticationError('AUTH_001', 'Invalid credentials');
    }

    const isValidPassword = await bcrypt.compare(data.password, user.passwordHash);
    if (!isValidPassword) {
      await this.auditService.log({
        actorId: user.id,
        action: 'auth.login.failed',
        resourceType: 'User',
        resourceId: user.id,
        metadata: { reason: 'invalid_password', ip: ipAddress },
      });
      throw new AuthenticationError('AUTH_001', 'Invalid credentials');
    }

    if (!user.isActive()) {
      throw new BusinessRuleError(
        `Account is ${user.status}. Please contact support.`,
        'AUTH_ACCOUNT_INACTIVE',
      );
    }

    // Update last login
    user.recordLogin();
    await this.userRepository.update(user);

    // MFA check
    if (user.mfaEnabled) {
      const mfaToken = await this.mfaService.createMfaChallenge(user.id);
      return {
        mfaRequired: true,
        mfaToken,
        mfaMethod: 'totp',
      };
    }

    // Issue tokens
    const tokens = await this.issueTokens(user.id, user.role, data.deviceId, ipAddress);

    await this.auditService.log({
      actorId: user.id,
      action: 'auth.login.success',
      resourceType: 'User',
      resourceId: user.id,
      metadata: { ip: ipAddress, device: data.deviceId },
    });

    return { mfaRequired: false, tokens };
  }

  private async issueTokens(
    userId: string,
    role: string,
    deviceId: string | undefined,
    ipAddress: string,
  ): Promise<TokenPair> {
    const permissions = await this.tokenService.getPermissionsForRole(role);
    const accessToken = await this.tokenService.signAccessToken({
      sub: userId,
      role,
      permissions,
    });
    const refreshToken = await this.refreshTokenRepository.create({
      userId,
      deviceId,
      ipAddress,
    });
    return {
      accessToken,
      refreshToken,
      expiresIn: 900,
    };
  }
}

interface IMfaService {
  createMfaChallenge(userId: string): Promise<string>;
}
interface IAuditService {
  log(entry: { actorId: string; action: string; resourceType: string; resourceId: string; metadata?: Record<string, unknown> }): Promise<void>;
}
