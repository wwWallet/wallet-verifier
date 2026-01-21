import { MigrationInterface, QueryRunner } from "typeorm";

export class createAuditTable1768995413499 implements MigrationInterface {
    name = 'createAuditTable1768995413499'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE \`audit\` (\`id\` int NOT NULL AUTO_INCREMENT, \`start_time\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`last_update_time\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`session_id\` varchar(255) NOT NULL, \`cross_device\` tinyint NOT NULL DEFAULT 0, \`dcql_query\` longtext NULL DEFAULT NULL, \`completed\` tinyint NOT NULL DEFAULT 0, \`error_code\` varchar(255) NULL DEFAULT NULL, PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE \`audit\``);
    }

}
