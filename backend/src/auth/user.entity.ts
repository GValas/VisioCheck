import { Column, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';

@Entity('users')
@Unique(['username'])
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 64 })
  username!: string;

  @Column({ type: 'varchar', length: 100 })
  passwordHash!: string;

  @Column({ type: 'varchar', length: 16, default: 'user' })
  role!: string;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  createdAt!: Date;
}

export interface JwtPayload {
  sub: string; // username
  role: string;
}
