<script lang="ts">
	import { page } from '$app/state';
	import '#lib/components/settings/forms.css';
	import { useI18n } from '#lib/i18n/context.ts';
	import LegalLinks from '#lib/components/LegalLinks.svelte';
	import type { LayoutProps } from './$types';

	let { children, data }: LayoutProps = $props();
	const { t } = useI18n();
	const role = $derived(data.user?.role);
	// Links are hidden by role here; every settings route also checks the role on the server (403).
	const sections = $derived(
		[
			{ href: '/settings/me', label: t('shell.mySettings'), show: true },
			{ href: '/settings/normals', label: t('settings.normalsHeading'), show: role === 'provider' || role === 'admin' },
			{ href: '/settings/quick-picks', label: t('settings.quickPicksHeading'), show: role === 'provider' || role === 'admin' },
			{ href: '/settings/practice', label: t('settings.practiceHeading'), show: role === 'admin' },
			{ href: '/settings/code-sets', label: t('settings.codeSetsHeading'), show: role === 'admin' },
			{ href: '/settings/users', label: t('settings.usersHeading'), show: role === 'admin' },
			{ href: '/settings/visit-types', label: t('settings.visitTypesHeading'), show: role === 'admin' },
			{ href: '/settings/audit', label: t('settings.auditHeading'), show: role === 'admin' }
		].filter((s) => s.show)
	);
</script>

<div class="settings">
	<nav aria-label={t('shell.navSettings')}>
		<h1>{t('shell.navSettings')}</h1>
		<ul>
			{#each sections as s (s.href)}
				<li><a href={s.href} aria-current={page.url.pathname === s.href ? 'page' : undefined}>{s.label}</a></li>
			{/each}
		</ul>
	</nav>
	<main>
		{#if data.disk === 'off' || data.disk === 'unknown'}
			<!-- Desktop app, admins only (D51): persistent until the drive is encrypted. -->
			<div class="disk" data-state={data.disk} role={data.disk === 'off' ? 'alert' : 'note'}>
				<p>{data.disk === 'off' ? t('settings.diskNotEncrypted') : t('settings.diskEncryptionUnknown')}</p>
				<a href={data.bitlockerHelpUrl} target="_blank" rel="noopener noreferrer">{t('settings.diskBitLockerHelp')}</a>
			</div>
		{/if}
		{@render children()}
		<LegalLinks />
	</main>
</div>

<style>
	.settings {
		display: grid;
		grid-template-columns: 13rem minmax(0, 1fr);
		gap: var(--space-5);
		max-width: 1100px;
		margin: 0 auto;
		padding: var(--space-5) var(--space-4);
	}
	h1 {
		font-size: var(--text-lg);
		font-weight: var(--weight-semibold);
		margin: 0 0 var(--space-2);
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	nav a {
		display: flex;
		align-items: center;
		min-height: max(40px, var(--target-min));
		padding: 0 var(--space-3);
		border-radius: var(--radius-1);
		text-decoration: none;
		color: var(--text-2);
	}
	nav a:hover {
		background: var(--surface-2);
		color: var(--text-1);
	}
	nav a[aria-current='page'] {
		background: var(--accent-soft);
		color: var(--accent);
		font-weight: var(--weight-semibold);
	}
	main {
		min-width: 0;
	}
	.disk {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-1) var(--space-4);
		padding: var(--space-3);
		margin: 0 0 var(--space-4);
		border-radius: var(--radius-2, 8px);
		border: 1px solid var(--warn);
		background: var(--warn-soft, var(--surface-2));
	}
	.disk[data-state='unknown'] {
		border-color: var(--hairline);
		background: var(--surface-2);
	}
	.disk p {
		margin: 0;
		flex: 1 1 20rem;
	}
	.disk a {
		min-height: var(--target-min);
		display: inline-flex;
		align-items: center;
	}
	main :global(h2) {
		font-size: var(--text-xl);
		font-weight: var(--weight-semibold);
		margin: 0 0 var(--space-1);
	}
	main :global(.lead) {
		color: var(--text-2);
		margin: 0 0 var(--space-4);
		max-width: var(--measure-prose);
	}
	@media (max-width: 760px) {
		.settings {
			grid-template-columns: 1fr;
			gap: var(--space-3);
		}
		ul {
			flex-direction: row;
			flex-wrap: wrap;
		}
	}
</style>
