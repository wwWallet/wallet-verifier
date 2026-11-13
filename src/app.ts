import express, { Express, NextFunction, Request, Response } from 'express';
import { config } from '../config';
import cookieParser from 'cookie-parser';
import path from 'path';
import cors from 'cors';
import { LanguageMiddleware } from './middlewares/language.middleware';
import { initDataSource } from './AppDataSource';
import createHttpError, { HttpError } from 'http-errors';
import { ExpressAppService } from './services/ExpressAppService';
import session from 'express-session';
import { OpenidForPresentationsReceivingService } from './services/OpenidForPresentationReceivingService';
import { VerifierConfigurationService } from './services/VerifierConfigurationService';

import locale from '../config/locale';

import { verifierRouter } from './verifierRouter';
import _ from 'lodash';
import { titleWithSiteName } from '../config/titles';
import { logger } from './logger';
import { HttpLoggerMiddleware } from './middlewares/httpLogger.middleware';

const log = logger.child({ module: 'App' });

async function main() {
	const app: Express = express();

	if (config.logHttp) {
		app.use(HttpLoggerMiddleware);
	}

	initDataSource();

	app.use(cors({ credentials: true, origin: true }));

	app.use(
		'/images',
		express.static(path.join(__dirname, '../../public/images'), {
			maxAge: '30d',
			immutable: true,
		}),
	);

	// __dirname is "/path/to/dist/src"
	app.use(express.static(path.join(__dirname, '../../public')));

	app.use(cookieParser());
	app.use(
		session({
			secret: config.appSecret,
			cookie: {
				expires: null,
				maxAge: config.sessionIdCookieConfiguration.maxAge,
			},
		}),
	);

	app.use(express.urlencoded({ extended: true }));
	app.use(express.json());

	app.set('view engine', 'pug');

	// __dirname is "/path/to/dist/src"
	// public is located at "/path/to/dist/src"
	app.set('views', path.join(__dirname, '../../views'));

	// Instantiate dependencies
	const verifierConfigurationService = new VerifierConfigurationService();
	const openidForPresentationReceivingService = new OpenidForPresentationsReceivingService(
		verifierConfigurationService,
	);
	const expressAppService = new ExpressAppService(openidForPresentationReceivingService);

	await expressAppService.configure(app);
	app.use(LanguageMiddleware);

	app.use((req, res, next) => {
		res.locals.lang = req.lang;
		res.locals.locale = locale['en'];
		next();
	});

	app.use('/verifier', verifierRouter);

	app.get('/', async (_req: Request, res: Response) => {
		return res.render('index', {
			title: titleWithSiteName('index'),
		});
	});

	app.post('/', async (req, res) => {
		if (req.body?.verifier == 'true') {
			return res.redirect('/verifier/public/definitions');
		}
	});

	app.get('/metadata/:filename', (req, res) => {
		if (req.params.filename !== 'site.webmanifest') {
			return res.status(404).send();
		}
		const manifest = {
			name: config.siteConfig.name,
			short_name: config.siteConfig.short_name,
			start_url: '/',
			display: 'standalone',
			background_color: config.siteConfig.background_color,
			theme_color: config.siteConfig.theme_color,
			icons: [
				{
					src: '/images/favicon-192x192.png',
					sizes: '192x192',
					type: 'image/png',
				},
				{
					src: '/images/favicon-512x512.png',
					sizes: '512x512',
					type: 'image/png',
				},
			],
		};

		res.setHeader('Content-Type', 'application/manifest+json');
		return res.send(manifest);
	});

	// catch 404 and forward to error handler
	app.use((req, _res, next) => {
		log.debug({ method: req.method, url: req.path }, 'Route not found');
		next(createHttpError(404));
	});

	// error handler: must declare all 4 parameters, or Express treats it as normal middleware
	app.use((err: HttpError, req: Request, res: Response, next: NextFunction) => {
		if (res.headersSent) {
			return next(err);
		}
		const status = err.status || 500;
		if (status >= 500) {
			// pino-http (LOG_HTTP=true) picks this up and logs the real error instead of a generic 500
			res.err = err;
			log.error({ err, method: req.method, url: req.path }, 'Unhandled error in request handler');
		}
		// set locals, only providing error in development
		res.locals.message = err.message;
		res.locals.title = titleWithSiteName('error');
		res.locals.msg = err.expose ? err.message : 'Something went wrong';
		res.locals.error = req.app.get('env') === 'development' ? err : {};
		// render the error page
		res.status(status);
		res.render('error');
	});

	app.listen(config.port, (err) => {
		if (err) {
			log.fatal({ err, port: config.port }, 'Verifier failed to listen, exiting');
			logger.flush(() => process.exit(1));
			return;
		}
		log.info({ url: config.url, port: config.port }, 'Verifier listening');
	});
}

process.on('unhandledRejection', (reason) => {
	log.fatal({ err: reason }, 'Unhandled promise rejection, exiting');
	logger.flush(() => process.exit(1));
});

process.on('uncaughtException', (err) => {
	log.fatal({ err }, 'Uncaught exception, exiting');
	logger.flush(() => process.exit(1));
});

main();
