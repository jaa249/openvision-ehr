// Shared helpers for the drawing API routes.
import { error } from '@sveltejs/kit';

/** Parses the route ids; anything that is not a positive safe integer is a plain 404. */
export function ids(params: Record<string, string | undefined>, ...names: string[]): number[] {
	return names.map((n) => {
		const v = Number(params[n]);
		if (!Number.isSafeInteger(v) || v <= 0) error(404, 'Not found');
		return v;
	});
}

/** A stored PNG. Never cached: a drawing changes during the visit and is patient data. */
export function pngResponse(png: Uint8Array): Response {
	return new Response(new Uint8Array(png), {
		headers: {
			'content-type': 'image/png',
			'content-length': String(png.byteLength),
			'cache-control': 'no-store'
		}
	});
}
