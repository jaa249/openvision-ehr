<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const addErr = $derived(form?.section === 'add' ? (form.errors?.name ?? form.errors?.form) : undefined);
	const rowErr = (id: number) => (form && form.section !== 'add' && form.id === id ? (form.errors?.name ?? form.errors?.form) : undefined);
	const keep = () => async ({ update }: { update: (o?: { reset?: boolean }) => Promise<void> }) => update({ reset: false });
</script>

<svelte:head><title>Visit types · Settings · OpenVision</title></svelte:head>

<h2>Visit types</h2>
<p class="lead">The choices offered when starting a visit. Hidden types stay on past visits but are no longer offered. Renaming does not change past visits.</p>

<div class="ov-form">
	<form method="POST" action="?/add" novalidate use:enhance class="card add">
		<div class="field">
			<label for="new-type">New visit type</label>
			<input id="new-type" name="name" maxlength="40" autocomplete="off" value={form?.section === 'add' && !form.ok ? (form.name ?? '') : ''}
				aria-invalid={addErr ? 'true' : undefined} aria-describedby={addErr ? 'new-type-err' : undefined} />
			{#if addErr}<p class="err" id="new-type-err">{addErr}</p>{/if}
		</div>
		<button type="submit" class="primary">Add</button>
	</form>

	<ol class="card types">
		{#each data.types as t, i (t.id)}
			{@const err = rowErr(t.id)}
			<li class:hidden={!t.active}>
				<form method="POST" action="?/rename" novalidate use:enhance={keep} class="rename">
					<input type="hidden" name="id" value={t.id} />
					<label class="visually-hidden" for="vt-{t.id}">Name of visit type {i + 1}</label>
					<input id="vt-{t.id}" name="name" maxlength="40" value={t.name} aria-invalid={err ? 'true' : undefined}
						aria-describedby={err ? `vt-${t.id}-err` : undefined} />
					<button type="submit">Rename<span class="visually-hidden"> {t.name}</span></button>
				</form>
				<div class="row-acts">
					{#if !t.active}<span class="tag">hidden</span>{/if}
					<form method="POST" action="?/up" use:enhance><input type="hidden" name="id" value={t.id} /><button type="submit" disabled={i === 0} aria-label="Move {t.name} up">↑</button></form>
					<form method="POST" action="?/down" use:enhance><input type="hidden" name="id" value={t.id} /><button type="submit" disabled={i === data.types.length - 1} aria-label="Move {t.name} down">↓</button></form>
					<form method="POST" action={t.active ? '?/hide' : '?/show'} use:enhance>
						<input type="hidden" name="id" value={t.id} />
						<button type="submit">{t.active ? 'Hide' : 'Show'}<span class="visually-hidden"> {t.name}</span></button>
					</form>
				</div>
				{#if err}<p class="err" id="vt-{t.id}-err" role="alert">{err}</p>{/if}
			</li>
		{/each}
	</ol>
</div>

<style>
	.add {
		flex-direction: row;
		align-items: flex-end;
		flex-wrap: wrap;
	}
	.add .field {
		flex: 1 1 14em;
	}
	.types {
		list-style: none;
		margin: 0;
		padding: var(--space-2) var(--space-4);
		gap: 0;
	}
	.types li {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2) var(--space-3);
		padding: var(--space-2) 0;
		border-top: 1px solid var(--hairline);
	}
	.types li:first-child {
		border-top: 0;
	}
	.types li > p {
		flex-basis: 100%;
	}
	.rename {
		display: flex;
		gap: var(--space-2);
		flex: 1 1 16em;
	}
	.row-acts {
		display: flex;
		gap: var(--space-1);
		align-items: center;
	}
	.hidden input {
		color: var(--text-3);
	}
	.tag {
		font-size: var(--text-xs);
		color: var(--text-3);
		margin-right: var(--space-2);
	}
</style>
