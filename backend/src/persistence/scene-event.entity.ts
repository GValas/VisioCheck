import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

// Transforme un bigint Postgres (renvoyé en string par le driver) en number.
const bigintToNumber = {
  to: (value: number): number => value,
  from: (value: string | number | null): number =>
    value === null ? 0 : Number(value),
};

/**
 * Journal persistant : un enregistrement par événement de scène OU par
 * description générée. `kind` distingue les deux.
 */
@Entity('scene_events')
@Index(['sessionId', 'atMs'])
export class SceneEventEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'varchar', length: 128 })
  sessionId!: string;

  // 'event' (entrée/sortie) ou 'description' (caption VLM).
  @Column({ type: 'varchar', length: 16 })
  kind!: 'event' | 'description';

  // Type d'événement (OBJECT_ENTERED…) ; null pour une description.
  @Column({ type: 'varchar', length: 32, nullable: true })
  type!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  label!: string | null;

  @Column({ type: 'integer', nullable: true })
  trackId!: number | null;

  @Column({ type: 'text', nullable: true })
  text!: string | null;

  // Horodatage métier (epoch ms), distinct de la date d'insertion.
  @Column({ type: 'bigint', transformer: bigintToNumber })
  atMs!: number;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  createdAt!: Date;
}

// Forme utilisée par les couches supérieures (indépendante de TypeORM).
export interface StoredEvent {
  sessionId: string;
  kind: 'event' | 'description';
  type: string | null;
  label: string | null;
  trackId: number | null;
  text: string | null;
  atMs: number;
}
