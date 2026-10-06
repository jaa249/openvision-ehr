<script lang="ts">
	import { page } from '$app/state';
	import '#lib/components/settings/forms.css';
	import type { LayoutProps } from './$types';

	let { children, data }: LayoutProps = $props();
	const role = $derived(data.user?.role);
	// Links are hidden by role here; every settings route also checks the role on the server (403).
	const sections = $derived(
		[
			{ href: '/settings/me', label: 'My settings', show: true },
			{ href: '/settings/normals', label: 'My normal values', show: role === 'provider' || role === 'admin' },
			{ href: '/settings/quick-picks', label: 'My quick picks', show: role === 'provider' || role === 'admin' },
			{ href: '/settings/practice', label: 'Practice', show: role === 'admin' },
			{ href: '/settings/users', label: 'Users', show: role === 'admin' },
			{ href: '/settings/visit-types', label: 'Visit types', show: role === 'admin' },
			{ href: '/settings/audit', label: 'Audit log', show: role === 'admin' }
		].filter((s) => s.show)
	);
</script>

<div class="settings">
	<nav aria-label="Settings">
		<h1>Settings</h1>
		<ul>
			{#each sections as s (s.href)}
				<li><a href={s.href} aria-current={page.url.pathname === s.href ? 'page' : undefined}>{s.label}</a></li>
			{/each}
		</ul>
	</nav>
	<main>{@render children()}</main>
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
