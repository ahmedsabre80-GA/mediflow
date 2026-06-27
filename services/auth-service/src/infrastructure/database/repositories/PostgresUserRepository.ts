import { Pool } from 'pg';
import type { UUID } from '@mediflow/shared-types';
import type { IUserRepository } from '../../../domain/repositories/IUserRepository';
import { User, type UserProps } from '../../../domain/entities/User';

export class PostgresUserRepository implements IUserRepository {
  constructor(private readonly pool: Pool) {}

  async findById(id: UUID): Promise<User | null> {
    const result = await this.pool.query(
      'SELECT * FROM auth.users WHERE id = $1 AND deleted_at IS NULL',
      [id],
    );
    if (result.rows.length === 0) return null;
    return this.toEntity(result.rows[0]);
  }

  async findByEmail(email: string): Promise<User | null> {
    const result = await this.pool.query(
      'SELECT * FROM auth.users WHERE LOWER(email) = LOWER($1) AND deleted_at IS NULL',
      [email],
    );
    if (result.rows.length === 0) return null;
    return this.toEntity(result.rows[0]);
  }

  async findByPhone(phone: string): Promise<User | null> {
    const result = await this.pool.query(
      'SELECT * FROM auth.users WHERE phone = $1 AND deleted_at IS NULL',
      [phone],
    );
    if (result.rows.length === 0) return null;
    return this.toEntity(result.rows[0]);
  }

  async save(user: User): Promise<void> {
    const snap = user.toSnapshot();
    await this.pool.query(
      `INSERT INTO auth.users
         (id, email, phone, password_hash, role, status, mfa_enabled,
          mfa_secret, email_verified, phone_verified, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        snap.id, snap.email, snap.phone, snap.passwordHash,
        snap.role, snap.status, snap.mfaEnabled, snap.mfaSecret,
        snap.emailVerified, snap.phoneVerified, snap.createdAt, snap.updatedAt,
      ],
    );
  }

  async update(user: User): Promise<void> {
    const snap = user.toSnapshot();
    await this.pool.query(
      `UPDATE auth.users SET
         email = $2, phone = $3, password_hash = $4, role = $5, status = $6,
         mfa_enabled = $7, mfa_secret = $8, email_verified = $9,
         phone_verified = $10, last_login_at = $11, updated_at = $12
       WHERE id = $1`,
      [
        snap.id, snap.email, snap.phone, snap.passwordHash,
        snap.role, snap.status, snap.mfaEnabled, snap.mfaSecret,
        snap.emailVerified, snap.phoneVerified, snap.lastLoginAt, snap.updatedAt,
      ],
    );
  }

  async existsByEmail(email: string): Promise<boolean> {
    const result = await this.pool.query(
      'SELECT 1 FROM auth.users WHERE LOWER(email) = LOWER($1) AND deleted_at IS NULL',
      [email],
    );
    return result.rows.length > 0;
  }

  async existsByPhone(phone: string): Promise<boolean> {
    const result = await this.pool.query(
      'SELECT 1 FROM auth.users WHERE phone = $1 AND deleted_at IS NULL',
      [phone],
    );
    return result.rows.length > 0;
  }

  private toEntity(row: Record<string, unknown>): User {
    const props: UserProps = {
      id: row.id as string,
      email: row.email as string | undefined,
      phone: row.phone as string | undefined,
      passwordHash: row.password_hash as string | undefined,
      role: row.role as UserProps['role'],
      status: row.status as UserProps['status'],
      mfaEnabled: row.mfa_enabled as boolean,
      mfaSecret: row.mfa_secret as string | undefined,
      emailVerified: row.email_verified as boolean,
      phoneVerified: row.phone_verified as boolean,
      lastLoginAt: row.last_login_at ? new Date(row.last_login_at as string) : undefined,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
      deletedAt: row.deleted_at ? new Date(row.deleted_at as string) : undefined,
    };
    return User.reconstitute(props);
  }
}
