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
	import { applyTextSize, markShortViewport } from '#lib/prefs/textsize.ts';
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

	// Text size (D53): the server puts it on <html>; keep it right after a change in My settings. A short
	// viewport (zoom or large text) is marked on <html> so the exam can stop pinning its chrome.
	$effect(() => {
		applyTextSize(data.textSize);
	});
	$effect(() => {
		const mark = () => markShortViewport();
		window.addEventListener('resize', mark);
		return () => window.removeEventListener('resize', mark);
	});

	/** Pages with their own full-height frame or made for printing get no top bar. */
	function bare(id: string | null): boolean {
		if (!id) return true;
		return (
			id === '/patients/[pid]/encounters/[eid]' ||
			id.startsWith('/print') ||
			id.includes('/rx') ||
			id.startsWith('/login') ||
			id.startsWith('/setup') ||
			id.startsWith('/legal')
		);
	}
	const showHeader = $derived(!!data.user && !bare(page.route.id));
	// "Skip to main content" on every page (WCAG 2.4.1); the exam has its own "Skip to exam".
	const showSkip = $derived(page.route.id !== '/patients/[pid]/encounters/[eid]');
	/** Moves focus to the page's <main> (made focusable for this), wherever the page put it. */
	function skipToMain(e: MouseEvent) {
		const main = document.querySelector<HTMLElement>('main');
		if (!main) return;
		e.preventDefault();
		if (!main.hasAttribute('tabindex')) main.setAttribute('tabindex', '-1');
		main.focus();
		main.scrollIntoView({ block: 'start' });
	}
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>{translator.t('common.appName')}</title>
</svelte:head>

{#if showSkip}<a class="skip-main" href="#main" onclick={skipToMain}>{translator.t('common.skipToMain')}</a>{/if}
{#if showHeader && data.user}<AppHeader user={data.user} />{/if}
{#if data.user}<SessionWatch />{/if}

{@render children()}

<style>
	/* Hidden by clipping until focused (moving it off-screen would scroll right-to-left pages sideways). */
	.skip-main {
		position: absolute;
		inset-inline-start: var(--space-2);
		top: var(--space-2);
		z-index: 60;
		background: var(--surface-3);
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-1);
	}
	.skip-main:not(:focus) {
		width: 1px;
		height: 1px;
		padding: 0;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
	:global(main:focus:not(:focus-visible)) {
		outline: none;
	}
	@media print {
		.skip-main {
			display: none;
		}
	}
</style>
