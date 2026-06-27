import type { Request, Response, NextFunction } from 'express';
import type { RegisterUserUseCase } from '../../../application/use-cases/RegisterUser';
import type { LoginUserUseCase } from '../../../application/use-cases/LoginUser';

export class AuthController {
  constructor(
    private readonly registerUseCase: RegisterUserUseCase,
    private readonly loginUseCase: LoginUserUseCase,
    private readonly refreshTokenUseCase: RefreshTokenUseCase,
    private readonly logoutUseCase: LogoutUseCase,
    private readonly verifyOtpUseCase: VerifyOtpUseCase,
    private readonly resetPasswordUseCase: ResetPasswordUseCase,
  ) {}

  register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.registerUseCase.execute(req.body);
      res.status(201).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  };

  login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.ip || '';
      const result = await this.loginUseCase.execute(req.body, ipAddress);
      res.status(200).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  };

  verifyOtp = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.verifyOtpUseCase.execute(req.body);
      res.status(200).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  };

  refreshToken = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { refreshToken } = req.body;
      const result = await this.refreshTokenUseCase.execute(refreshToken);
      res.status(200).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  };

  logout = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { refreshToken } = req.body;
      await this.logoutUseCase.execute(refreshToken);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  };

  requestPasswordReset = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { identifier } = req.body;
      await this.resetPasswordUseCase.requestReset(identifier);
      res.status(200).json({ success: true, data: { message: 'Reset instructions sent' } });
    } catch (err) {
      next(err);
    }
  };

  confirmPasswordReset = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { token, newPassword } = req.body;
      await this.resetPasswordUseCase.confirmReset(token, newPassword);
      res.status(200).json({ success: true, data: { message: 'Password updated successfully' } });
    } catch (err) {
      next(err);
    }
  };

  health = (_req: Request, res: Response): void => {
    res.status(200).json({ status: 'healthy', service: 'auth-service', timestamp: new Date().toISOString() });
  };
}

// Placeholder types for injected use cases
interface RefreshTokenUseCase { execute(token: string): Promise<unknown>; }
interface LogoutUseCase { execute(token: string): Promise<void>; }
interface VerifyOtpUseCase { execute(data: unknown): Promise<unknown>; }
interface ResetPasswordUseCase {
  requestReset(identifier: string): Promise<void>;
  confirmReset(token: string, password: string): Promise<void>;
}
