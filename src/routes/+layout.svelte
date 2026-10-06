<script lang="ts">
	import favicon from '#lib/assets/favicon.svg';
	import '#lib/styles/tokens.css';
	import '#lib/styles/base.css';
	import { page } from '$app/state';
	import AppHeader from '#lib/components/AppHeader.svelte';
	import SessionWatch from '#lib/components/SessionWatch.svelte';
	import type { LayoutProps } from './$types';

	let { children, data }: LayoutProps = $props();

	/** Pages with their own full-height frame or made for printing get no top bar. */
	function bare(id: string | null): boolean {
		if (!id) return true;
		return (
			id === '/patients/[pid]/encounters/[eid]' ||
			id.startsWith('/print') ||
			id.includes('/rx') ||
			id.includes('/superbill') ||
			id.startsWith('/login') ||
			id.startsWith('/setup')
		);
	}
	const showHeader = $derived(!!data.user && !bare(page.route.id));
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>OpenVision</title>
</svelte:head>

{#if showHeader && data.user}<AppHeader user={data.user} />{/if}
{#if data.user}<SessionWatch />{/if}

{@render children()}
