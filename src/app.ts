import express, { Express, Request, Response } from 'express';
import { config } from '../config';
import bodyParser from 'body-parser';
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
import titles from '../config/titles';

import { verifierRouter } from './verifierRouter';
import _ from 'lodash';

async function main() {
	const app: Express = express();

	initDataSource().then(() => {
		console.log("Data source initialized");
	});


	app.use(cors({ credentials: true, origin: true }));

	app.use(
		'/images',
		express.static(path.join(__dirname, '../../public/images'), {
			maxAge: '30d',
			immutable: true,
		})
	);

	// __dirname is "/path/to/dist/src"
	app.use(express.static(path.join(__dirname, '../../public')));

	app.use(cookieParser());
	app.use(session({ secret: config.appSecret, cookie: { expires: null, maxAge: 3600 * 1000 } }))


	app.use(bodyParser.urlencoded({ extended: true })); // support url encoded bodies
	app.use(bodyParser.json()); // support json encoded bodies

	app.set('view engine', 'pug');

	// __dirname is "/path/to/dist/src"
	// public is located at "/path/to/dist/src"
	app.set('views', path.join(__dirname, '../../views'));

	// Instantiate dependencies
	const verifierConfigurationService = new VerifierConfigurationService();
	const openidForPresentationReceivingService = new OpenidForPresentationsReceivingService(verifierConfigurationService);
	const expressAppService = new ExpressAppService(openidForPresentationReceivingService);

	await expressAppService.configure(app);
	app.use(LanguageMiddleware);
	app.use('/verifier', verifierRouter);


	app.get('/', async (req: Request, res: Response) => {
		return res.render("index", {
			title: titles.index,
			lang: req.lang,
			locale: locale[req.lang],
		})
	})


	app.post('/', async (req, res) => {
		if (req.body.verifier == "true") {
			return res.redirect('/verifier/public/definitions');
		}
	})

	app.get('/metadata/:filename', (req, res) => {
		if (req.params.filename !== 'site.webmanifest') {
			return res.status(404).send();
		}
		const manifest = {
			name: config.siteConfig.name,
			short_name: config.siteConfig.short_name,
			start_url: "/",
			display: "standalone",
			background_color: config.siteConfig.background_color,
			theme_color: config.siteConfig.theme_color,
			icons: [
				{
					src: "/images/favicon-192x192.png",
					sizes: "192x192",
					type: "image/png"
				},
				{
					src: "/images/favicon-512x512.png",
					sizes: "512x512",
					type: "image/png"
				}
			]
		};

		res.setHeader('Content-Type', 'application/manifest+json');
		return res.send(manifest);
	});

	// catch 404 and forward to error handler
	app.use((req, _res, next) => {
		console.error("URL path not found: ", req.url)
		next(createHttpError(404));
	});

	// error handler
	app.use((err: HttpError, req: Request, res: Response) => {
		// set locals, only providing error in development
		res.locals.message = err.message;
		res.locals.error = req.app.get('env') === 'development' ? err : {};
		// render the error page
		res.status(err.status || 500);
		res.render('error', {
			lang: req.lang,
			locale: locale[req.lang]
		});
	});

	app.listen(config.port, () => {
		console.log(`Wallet enterprise app listening at ${config.url}`)
	});
}

main()
