import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

@Entity({ name: "audit" })
export class Audit {
	@PrimaryGeneratedColumn()
	id!: number;

	@CreateDateColumn({ name: "start_time", type: "datetime" })
	startTime!: Date;

	@UpdateDateColumn({ name: "last_update_time", type: "datetime" })
	lastUpdateTime!: Date;

	@Column({ name: "session_id", type: "varchar", length: 255 })
	sessionId!: string;

	@Column({ name: "cross_device", type: "boolean", default: true })
	crossDevice!: boolean;

	@Column({
		name: "dcql_query",
		type: "longtext",
		nullable: true,
		default: () => "NULL",
		transformer: {
			to: (value: Record<string, unknown> | null) => {
				if (value === null) {
					return null;
				}
				return JSON.stringify(value);
			},
			from: (value: string | Record<string, unknown> | null) => {
				if (value === null) {
					return null;
				}
				if (typeof value !== "string") {
					return value;
				}
				try {
					return JSON.parse(value) as Record<string, unknown>;
				} catch (error) {
					console.warn("Audit.dcqlQuery: failed to parse stored value as JSON", error);
					return null;
				}
			},
		}
	})
	dcqlQuery!: Record<string, unknown> | null;

	@Column({ name: "completed", type: "boolean", default: false })
	completed!: boolean;

	@Column({ name: "error_code", type: "varchar", length: 255, nullable: true, default: () => "NULL" })
	errorCode!: string | null;
}
