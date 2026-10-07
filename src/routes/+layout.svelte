<script lang="ts">
	import favicon from '#lib/assets/favicon.svg';
	import '#lib/styles/tokens.css';
	import '#lib/styles/base.css';
	import { page } from '$app/state';
	import AppHeader from '#lib/components/AppHeader.svelte';
	import SessionWatch from '#lib/components/SessionWatch.svelte';
	import { EN } from '#lib/i18n/catalog.ts';
	import { setI18n } from '#lib/i18n/context.ts';
	import { createTranslator } from '#lib/i18n/translate.ts';
	import type { LayoutProps } from './$types';

	let { children, data }: LayoutProps = $props();

	// The page language (D48). Rebuilt only when the layout data changes (a new language or catalog).
	const translator = $derived(createTranslator(data.locale, data.messages, EN));
	setI18n(() => translator);
	// The server sets lang/dir on the first page; keep them right after a language change in the browser.
	$effect(() => {
		document.documentElement.lang = translator.locale;
		document.documentElement.dir = translator.dir;
	});

	/** Pages with their own full-height frame or made for printing get no top bar. */
	function bare(id: string | null): boolean {
		if (!id) return true;
		return (
			id === '/patients/[pid]/encounters/[eid]' ||
			id.startsWith('/print') ||
			id.includes('/rx') ||
			id.startsWith('/login') ||
			id.startsWith('/setup')
		);
	}
	const showHeader = $derived(!!data.user && !bare(page.route.id));
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>{translator.t('common.appName')}</title>
</svelte:head>

{#if showHeader && data.user}<AppHeader user={data.user} />{/if}
{#if data.user}<SessionWatch />{/if}

{@render children()}
