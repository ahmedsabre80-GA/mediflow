import bcrypt from 'bcrypt';
import { z } from 'zod';
import type { IUserRepository } from '../../domain/repositories/IUserRepository';
import { User } from '../../domain/entities/User';
import { ConflictError, ValidationError } from '@mediflow/shared-errors';
import type { UserRole } from '@mediflow/shared-types';

const RegisterSchema = z.object({
  firstName: z.string().min(2).max(100),
  lastName: z.string().min(2).max(100),
  email: z.string().email().optional(),
  phone: z.string().regex(/^\+[1-9]\d{7,14}$/).optional(),
  password: z
    .string()
    .min(8)
    .regex(/[A-Z]/, 'Must contain uppercase')
    .regex(/[a-z]/, 'Must contain lowercase')
    .regex(/[0-9]/, 'Must contain number')
    .regex(/[^A-Za-z0-9]/, 'Must contain special character'),
  role: z.enum(['patient', 'doctor', 'pharmacy_owner', 'warehouse_owner', 'driver']).default('patient'),
}).refine((d) => d.email || d.phone, {
  message: 'Either email or phone is required',
});

type RegisterInput = z.infer<typeof RegisterSchema>;

interface RegisterOutput {
  userId: string;
  verificationSent: boolean;
  verificationMethod: 'email' | 'phone';
}

export class RegisterUserUseCase {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly otpService: IOtpService,
    private readonly eventBus: IEventBus,
    private readonly profileService: IProfileService,
  ) {}

  async execute(input: RegisterInput): Promise<RegisterOutput> {
    const parsed = RegisterSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError('Validation failed', parsed.error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      })));
    }

    const data = parsed.data;

    // Check for duplicates
    if (data.email && await this.userRepository.existsByEmail(data.email)) {
      throw new ConflictError('Email is already registered', 'USER_002');
    }
    if (data.phone && await this.userRepository.existsByPhone(data.phone)) {
      throw new ConflictError('Phone number is already registered', 'USER_003');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(data.password, 12);

    // Create user aggregate
    const user = User.create({
      email: data.email,
      phone: data.phone,
      passwordHash,
      role: data.role as UserRole,
    });

    await this.userRepository.save(user);

    // Create profile
    await this.profileService.createProfile({
      userId: user.id,
      firstName: data.firstName,
      lastName: data.lastName,
    });

    // Send verification
    const method = data.email ? 'email' : 'phone';
    await this.otpService.sendVerification(user.id, method, data.email || data.phone!);

    // Publish event
    await this.eventBus.publish('identity.user.registered', {
      eventId: crypto.randomUUID(),
      eventType: 'user.registered',
      version: '1.0',
      timestamp: new Date().toISOString(),
      source: 'auth-service',
      payload: {
        userId: user.id,
        email: data.email,
        phone: data.phone,
        role: data.role,
      },
    });

    return {
      userId: user.id,
      verificationSent: true,
      verificationMethod: method,
    };
  }
}

// Port interfaces (implemented in infrastructure layer)
interface IOtpService {
  sendVerification(userId: string, method: 'email' | 'phone', destination: string): Promise<void>;
}
interface IEventBus {
  publish(topic: string, event: unknown): Promise<void>;
}
interface IProfileService {
  createProfile(data: { userId: string; firstName: string; lastName: string }): Promise<void>;
}
