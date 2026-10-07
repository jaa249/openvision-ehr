'use strict';
// The web app, served from inside the desktop app's own process (D51).
//
// It loads SvelteKit's adapter-node request handler (build/handler.js; not build/index.js, which
// would listen on HOST/PORT by itself) and serves it with node:http, so the shell decides where it
// listens. Today that is 127.0.0.1 on a free port chosen by Windows, reachable only from this
// computer and only with the per-launch shell token. A later "allow other devices on the clinic
// network" switch changes only what is passed here (host, TLS, device tokens), not the app.
//
//   const srv = await start({ handlerPath, token, log });   // { url, port, close(graceMs) }
const http = require('node:http');
const { pathToFileURL } = require('node:url');
const { HEADER, REFUSED, tokenMatches } = require('./lib/shelltoken.cjs');

/**
 * Starts the server. Options: handlerPath (build/handler.js), host (default 127.0.0.1), port (0 = any
 * free port), token (shell token; required header when set), log (lib/log.cjs logger, optional).
 */
async function start({ handlerPath, host = '127.0.0.1', port = 0, token, log } = {}) {
	if (!handlerPath) throw new Error('start: handlerPath is required');
	// Environment (OPENVISION_DB, BODY_SIZE_LIMIT, …) must be set before this import: the handler reads it on load.
	const { handler } = await import(pathToFileURL(handlerPath).href);

	const server = http.createServer((req, res) => {
		const started = Date.now();
		if (token && !tokenMatches(req.headers[HEADER], token)) {
			res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
			res.end(REFUSED);
			log?.warn(`refused a request without the shell token: ${req.method}`);
			return;
		}
		if (log) {
			res.once('finish', () => {
				// Static files are not worth a line each.
				if (!req.url.startsWith('/_app/')) log.request(req.method, req.url, res.statusCode, Date.now() - started);
			});
		}
		handler(req, res, () => {
			res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
			res.end('Not found');
		});
	});
	// A slow client cannot hold the app open forever; Chromium reuses idle connections well within this.
	server.keepAliveTimeout = 5000;

	await new Promise((resolve, reject) => {
		server.once('error', reject);
		server.listen({ host, port }, () => {
			server.off('error', reject);
			resolve();
		});
	});
	const addr = server.address();
	const url = `http://${host.includes(':') ? `[${host}]` : host}:${addr.port}`;
	log?.info(`server listening on ${url}`);

	let closing = null;
	/** Stops taking new requests, lets in-flight ones finish for up to graceMs, then drops what is left. */
	function close(graceMs = 3000) {
		if (closing) return closing;
		closing = new Promise((resolve) => {
			const timer = setTimeout(() => {
				log?.warn(`server: requests still open after ${graceMs} ms, closing them`);
				server.closeAllConnections();
			}, graceMs);
			server.close(() => {
				clearTimeout(timer);
				log?.info('server stopped');
				resolve();
			});
			server.closeIdleConnections();
		});
		return closing;
	}

	return { url, port: addr.port, host, close, server };
}

module.exports = { start };
