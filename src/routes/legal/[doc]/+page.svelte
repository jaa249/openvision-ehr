<script lang="ts">
	import { useI18n } from '#lib/i18n/context.ts';
	import type { MessageKey } from '#lib/i18n/catalog.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const i18n = useI18n();
	const { t } = i18n;
	const TITLES = { terms: 'shell.legalTerms', privacy: 'shell.legalPrivacy', notice: 'shell.legalNotice' } as const satisfies Record<string, MessageKey>;
	const title = $derived(t(TITLES[data.doc]));
</script>

<svelte:head><title>{t('shell.legalPageTitle', { title })}</title></svelte:head>

<main>
	<nav class="top" aria-label={t('shell.legalNav')}>
		<a href={data.signedIn ? '/' : '/login'}>{t('shell.legalBack')}</a>
		<span class="spacer"></span>
		{#each Object.entries(TITLES) as [doc, key] (doc)}
			<a href="/legal/{doc}" aria-current={doc === data.doc ? 'page' : undefined}>{t(key)}</a>
		{/each}
	</nav>
	{#if i18n.locale !== 'en'}<p class="lang" lang={i18n.locale}>{t('shell.legalEnglishOnly')}</p>{/if}
	<!-- The repo's own document (docs/*.md, desktop/NOTICE-INSTALL.txt), escaped and rendered on the server. -->
	<article lang="en" dir="ltr">
		{@html data.html}
	</article>
</main>

<style>
	main {
		max-width: 46rem;
		margin: 0 auto;
		padding: var(--space-4) var(--space-4) var(--space-6);
	}
	.top {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2) var(--space-4);
		padding-bottom: var(--space-3);
		border-bottom: 1px solid var(--hairline);
		margin-bottom: var(--space-4);
	}
	.top a {
		min-height: var(--target-min);
		display: inline-flex;
		align-items: center;
	}
	.top a[aria-current='page'] {
		font-weight: var(--weight-semibold);
		text-decoration: none;
		color: var(--text-1);
	}
	.spacer {
		flex: 1;
	}
	.lang {
		color: var(--text-2);
		margin: 0 0 var(--space-3);
	}
	article {
		line-height: 1.55;
	}
	article :global(h1) {
		font-size: var(--text-xl);
		font-weight: var(--weight-semibold);
		margin: 0 0 var(--space-3);
	}
	article :global(h2) {
		font-size: var(--text-lg);
		font-weight: var(--weight-semibold);
		margin: var(--space-5) 0 var(--space-2);
	}
	article :global(li) {
		margin: var(--space-1) 0;
	}
	article :global(.table) {
		overflow-x: auto;
	}
	article :global(table) {
		border-collapse: collapse;
		width: 100%;
	}
	article :global(th),
	article :global(td) {
		border: 1px solid var(--hairline);
		padding: var(--space-2);
		text-align: start;
		vertical-align: top;
	}
	article :global(code) {
		font-family: var(--font-mono, monospace);
		overflow-wrap: anywhere;
	}
</style>
