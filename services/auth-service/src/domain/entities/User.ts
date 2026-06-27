import { v4 as uuidv4 } from 'uuid';
import type { UUID, UserRole, AccountStatus } from '@mediflow/shared-types';

export interface UserProps {
  id: UUID;
  email?: string;
  phone?: string;
  passwordHash?: string;
  role: UserRole;
  status: AccountStatus;
  mfaEnabled: boolean;
  mfaSecret?: string;
  emailVerified: boolean;
  phoneVerified: boolean;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

export class User {
  private constructor(private readonly props: UserProps) {}

  static create(params: {
    email?: string;
    phone?: string;
    passwordHash?: string;
    role?: UserRole;
  }): User {
    if (!params.email && !params.phone) {
      throw new Error('Email or phone is required');
    }
    return new User({
      id: uuidv4(),
      email: params.email,
      phone: params.phone,
      passwordHash: params.passwordHash,
      role: params.role ?? 'patient',
      status: 'pending_verification',
      mfaEnabled: false,
      emailVerified: false,
      phoneVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  static reconstitute(props: UserProps): User {
    return new User(props);
  }

  get id(): UUID { return this.props.id; }
  get email(): string | undefined { return this.props.email; }
  get phone(): string | undefined { return this.props.phone; }
  get passwordHash(): string | undefined { return this.props.passwordHash; }
  get role(): UserRole { return this.props.role; }
  get status(): AccountStatus { return this.props.status; }
  get mfaEnabled(): boolean { return this.props.mfaEnabled; }
  get mfaSecret(): string | undefined { return this.props.mfaSecret; }
  get emailVerified(): boolean { return this.props.emailVerified; }
  get phoneVerified(): boolean { return this.props.phoneVerified; }

  verifyEmail(): void {
    this.props.emailVerified = true;
    if (this.props.status === 'pending_verification') {
      this.props.status = 'active';
    }
    this.props.updatedAt = new Date();
  }

  verifyPhone(): void {
    this.props.phoneVerified = true;
    if (this.props.status === 'pending_verification') {
      this.props.status = 'active';
    }
    this.props.updatedAt = new Date();
  }

  enableMfa(secret: string): void {
    this.props.mfaEnabled = true;
    this.props.mfaSecret = secret;
    this.props.updatedAt = new Date();
  }

  disableMfa(): void {
    this.props.mfaEnabled = false;
    this.props.mfaSecret = undefined;
    this.props.updatedAt = new Date();
  }

  updatePassword(newPasswordHash: string): void {
    this.props.passwordHash = newPasswordHash;
    this.props.updatedAt = new Date();
  }

  suspend(): void {
    this.props.status = 'suspended';
    this.props.updatedAt = new Date();
  }

  activate(): void {
    this.props.status = 'active';
    this.props.updatedAt = new Date();
  }

  recordLogin(): void {
    this.props.lastLoginAt = new Date();
    this.props.updatedAt = new Date();
  }

  isActive(): boolean {
    return this.props.status === 'active';
  }

  isDeleted(): boolean {
    return this.props.deletedAt !== undefined;
  }

  toSnapshot(): UserProps {
    return { ...this.props };
  }
}
