import type { UUID } from '@mediflow/shared-types';
import type { User } from '../entities/User';

export interface IUserRepository {
  findById(id: UUID): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  findByPhone(phone: string): Promise<User | null>;
  save(user: User): Promise<void>;
  update(user: User): Promise<void>;
  existsByEmail(email: string): Promise<boolean>;
  existsByPhone(phone: string): Promise<boolean>;
}
