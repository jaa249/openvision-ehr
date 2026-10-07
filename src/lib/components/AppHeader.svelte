<script lang="ts">
	// Slim top bar for the non-exam pages: home, Patients, Visits, Settings by role, who is signed in, Sign out.
	import { page } from '$app/state';
	import { useI18n } from '#lib/i18n/context.ts';

	let { user }: { user: { id: number; displayName: string; role: 'admin' | 'provider' | 'tech' } } = $props();

	const { t } = useI18n();
	const roleLabel = (r: typeof user.role) => (r === 'admin' ? t('common.roleAdmin') : r === 'provider' ? t('common.roleProvider') : t('common.roleTech'));
	const path = $derived(page.url.pathname);
	const current = (href: string) =>
		href === '/' ? path === '/' || (path.startsWith('/patients') && !path.includes('/encounters/')) : path === href || path.startsWith(`${href}/`);
	const links = $derived([
		{ href: '/', label: t('shell.navPatients') },
		{ href: '/encounters', label: t('shell.navVisits') },
		user.role === 'admin' ? { href: '/settings', label: t('shell.navSettings') } : { href: '/settings/me', label: t('shell.mySettings') }
	]);
</script>

<header class="bar">
	<a class="brand" href="/">{t('common.appName')}</a>
	<nav aria-label={t('shell.mainNav')}>
		<ul>
			{#each links as l (l.href)}
				<li><a href={l.href} aria-current={current(l.href) ? 'page' : undefined}>{l.label}</a></li>
			{/each}
		</ul>
	</nav>
	<div class="who">
		<a class="me" href="/settings/me" title={t('shell.mySettings')}>
			<span class="name">{user.displayName}</span>
			<span class="role">{roleLabel(user.role)}</span>
		</a>
		<form method="POST" action="/logout">
			<button type="submit">{t('shell.signOut')}</button>
		</form>
	</div>
</header>

<style>
	.bar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0 var(--space-4);
		padding: 0 var(--space-4);
		background: var(--surface-1);
		border-bottom: 1px solid var(--hairline);
	}
	a {
		display: inline-flex;
		align-items: center;
		min-height: max(40px, var(--target-min));
		text-decoration: none;
		color: var(--text-1);
	}
	.brand {
		font-weight: var(--weight-semibold);
	}
	nav {
		flex: 1 1 auto;
		min-width: 0;
	}
	ul {
		display: flex;
		flex-wrap: wrap;
		gap: 0 var(--space-1);
		list-style: none;
		margin: 0;
		padding: 0;
	}
	nav a {
		padding: 0 var(--space-2);
		color: var(--text-2);
		border-bottom: 2px solid transparent;
	}
	nav a:hover {
		color: var(--text-1);
	}
	nav a[aria-current='page'] {
		color: var(--accent);
		border-bottom-color: var(--accent);
	}
	.who {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin-left: auto;
	}
	.me {
		flex-direction: column;
		align-items: flex-end;
		justify-content: center;
		line-height: var(--leading-tight);
		padding: 0 var(--space-1);
	}
	.me:hover .name {
		text-decoration: underline;
	}
	.role {
		font-size: var(--text-xs);
		color: var(--text-3);
	}
	button {
		min-height: max(40px, var(--target-min));
	}
	@media (max-width: 560px) {
		.bar {
			padding: 0 var(--space-3);
		}
		.role {
			display: none;
		}
	}
	@media print {
		.bar {
			display: none;
		}
	}
</style>
