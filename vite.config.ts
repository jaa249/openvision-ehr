/// <reference types="vitest/config" />
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			// Single self-hosted Node server: `npm run build && node build`.
			adapter: adapter(),
			// adapter-node assumes https unless a proxy header says otherwise, so on a plain-http
			// local install Kit's own form-origin check rejects every same-site form post. Our
			// hooks.server.ts instead requires Origin host == Host for ALL mutating requests.
			csrf: { trustedOrigins: ['*'] }
		})
	],
	test: {
		// desktop/: the Windows app's pure helpers and build scripts (D51).
		include: ['src/**/*.test.ts', 'desktop/**/*.test.ts'],
		exclude: ['**/node_modules/**', 'desktop/dist/**']
	}
});
