import { DataSource } from 'typeorm';
import { config } from '../config';
import { logger } from './logger';

const log = logger.child({ module: 'DB' });

// Initialize DB connection
const AppDataSource: DataSource = new DataSource({
	type: 'mysql',
	host: config.db.host,
	port: Number(config.db.port),
	username: config.db.username,
	password: config.db.password,
	database: config.db.dbname,
	entities: [__dirname + '/entities/*.entity.{js,ts}'],
	migrations: [__dirname + '/migrations/*.{js,ts}'],
	synchronize: false,
});

export async function initDataSource() {
	let connected = false;

	log.info('Connecting to database');
	await AppDataSource.initialize()
		.then(() => {
			log.info('Data source initialized');
			connected = true;
		})
		.catch((err) => {
			log.error({ err }, 'Data source initialization failed, retrying in 3s');
		});

	// if not connected, then retry in loop
	while (!connected) {
		await new Promise((resolve) => setTimeout(resolve, 3000)).then(async () => {
			await AppDataSource.initialize()
				.then(() => {
					log.info('Data source initialized');
					connected = true;
				})
				.catch((err) => {
					log.error({ err }, 'Data source initialization failed, retrying in 3s');
				});
		});
	}
}

export default AppDataSource;
