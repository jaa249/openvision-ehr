<script lang="ts">
	// Next-visit orders (spec §10.6): checkboxes from the provider's list plus a free-text plan / RTC,
	// saved per exam. The pencil opens a small editor for the provider's own list (names, CPT, order).
	import { onDestroy } from 'svelte';
	import { registerFlush } from '#lib/exam/lock.svelte.ts';
	import { postJson } from './api.ts';
	import type { OrderOption, VisitOrder } from '#lib/plan/types.ts';
	import { useI18n } from '#lib/i18n/context.ts';

	let {
		options,
		details,
		plan,
		canEdit,
		owner,
		onsave,
		onoptions
	}: {
		options: OrderOption[];
		details: VisitOrder[];
		plan: string;
		canEdit: boolean;
		owner: string;
		/** Saves this visit's orders; resolves to an error message or ''. */
		onsave: (optionIds: number[], plan: string) => Promise<string>;
		/** The list changed in the editor. */
		onoptions: (next: OrderOption[]) => void;
	} = $props();
	const { t } = useI18n();

	// Local working copies: the user's checks and text win over a slower server answer.
	let checked = $state<number[]>([]);
	let planText = $state('');
	let error = $state('');
	let seeded = false;
	$effect.pre(() => {
		if (seeded) return;
		seeded = true;
		checked = details.map((d) => d.optionId).filter((x): x is number => x !== null);
		planText = plan;
	});

	/** Orders saved on this visit whose list item was removed since: still shown so they can be unticked. */
	const orphans = $derived(details.filter((d) => d.optionId !== null && !options.some((o) => o.id === d.optionId)));

	let timer: ReturnType<typeof setTimeout> | undefined;
	function schedule(delay: number) {
		clearTimeout(timer);
		timer = setTimeout(async () => {
			timer = undefined;
			error = await onsave([...checked], planText);
		}, delay);
	}
	async function flushNow() {
		if (timer === undefined) return;
		clearTimeout(timer);
		timer = undefined;
		error = await onsave([...checked], planText);
	}
	// Signing saves first; leaving the pane (or the section) with a save waiting sends it now.
	const unregister = registerFlush(flushNow);
	onDestroy(() => {
		unregister();
		flushNow();
	});
	function toggle(id: number, on: boolean) {
		checked = on ? [...checked, id] : checked.filter((x) => x !== id);
		schedule(250);
	}

	// ---------- list editor ----------
	let editing = $state(false);
	let editError = $state('');
	let newLabel = $state('');
	let newCpt = $state('');

	async function edit(body: Record<string, unknown>): Promise<boolean> {
		const r = await postJson<OrderOption[]>(t, '/api/orders', body, false);
		if (r.ok) {
			onoptions(r.data);
			editError = '';
			return true;
		}
		if (Array.isArray(r.body.options)) onoptions(r.body.options as OrderOption[]);
		editError = r.message;
		return false;
	}
	async function addOption(e: SubmitEvent) {
		e.preventDefault();
		if (!newLabel.trim()) {
			editError = t('plan.orderNameMissing');
			return;
		}
		if (await edit({ action: 'add', label: newLabel, cpt: newCpt })) {
			newLabel = '';
			newCpt = '';
		}
	}
	function move(i: number, delta: number) {
		const ids = options.map((o) => o.id);
		const j = i + delta;
		if (j < 0 || j >= ids.length) return;
		[ids[i], ids[j]] = [ids[j], ids[i]];
		edit({ action: 'reorder', ids });
	}
</script>

<div class="orders">
	<div class="head">
		<p class="help">{t('plan.ordersHelp')}</p>
		{#if canEdit}
			<button type="button" class="pencil" aria-expanded={editing} aria-controls="orders-editor" onclick={() => (editing = !editing)}>
				<span aria-hidden="true">✎</span> {editing ? t('plan.ordersDoneEditing') : t('plan.ordersEditList')}
			</button>
		{/if}
	</div>
	{#if !canEdit}<p class="help">{t('plan.ordersNotOwner', { owner })}</p>{/if}

	{#if editing}
		<div id="orders-editor" class="editor" role="group" aria-label={t('plan.ordersEditorAria')}>
			<p class="help">{t('plan.ordersEditorHelp')}</p>
			<ul>
				{#each options as o, i (o.id)}
					<li>
						<label class="visually-hidden" for="ord-l-{o.id}">{t('plan.orderName')}</label>
						<input id="ord-l-{o.id}" value={o.label} maxlength="80" onchange={(e) => edit({ action: 'update', id: o.id, label: e.currentTarget.value })} />
						<label class="visually-hidden" for="ord-c-{o.id}">{t('plan.orderCptFor', { label: o.label })}</label>
						<input
							id="ord-c-{o.id}"
							class="cpt"
							value={o.cpt}
							maxlength="5"
							inputmode="numeric"
							placeholder="CPT"
							onchange={(e) => edit({ action: 'update', id: o.id, cpt: e.currentTarget.value })}
						/>
						<button type="button" class="icon" onclick={() => move(i, -1)} disabled={i === 0} aria-label={t('plan.orderMoveUp', { label: o.label })}>↑</button>
						<button type="button" class="icon" onclick={() => move(i, 1)} disabled={i === options.length - 1} aria-label={t('plan.orderMoveDown', { label: o.label })}>↓</button>
						<button type="button" class="icon danger" onclick={() => edit({ action: 'delete', id: o.id })} aria-label={t('plan.orderRemove', { label: o.label })}>✕</button>
					</li>
				{/each}
			</ul>
			<form class="add" onsubmit={addOption}>
				<label class="visually-hidden" for="ord-new">{t('plan.orderNewName')}</label>
				<input id="ord-new" bind:value={newLabel} maxlength="80" placeholder={t('plan.orderNewPlaceholder')} />
				<label class="visually-hidden" for="ord-new-cpt">{t('plan.orderNewCpt')}</label>
				<input id="ord-new-cpt" class="cpt" bind:value={newCpt} maxlength="5" inputmode="numeric" placeholder="CPT" />
				<button type="submit">{t('plan.orderAdd')}</button>
			</form>
			{#if editError}<p class="error" role="alert">{editError}</p>{/if}
		</div>
	{/if}

	<fieldset class="list">
		<legend class="visually-hidden">{t('plan.ordersLegend')}</legend>
		{#each options as o (o.id)}
			<label class="check">
				<input type="checkbox" checked={checked.includes(o.id)} onchange={(e) => toggle(o.id, e.currentTarget.checked)} />
				<span>{o.label}</span>
				{#if o.cpt}<span class="cptcode">{o.cpt}</span>{/if}
			</label>
		{/each}
		{#each orphans as d (d.optionId)}
			<label class="check">
				<input type="checkbox" checked={checked.includes(d.optionId!)} onchange={(e) => toggle(d.optionId!, e.currentTarget.checked)} />
				<span>{d.label} <em>{t('plan.orderNoLongerInList')}</em></span>
				{#if d.cpt}<span class="cptcode">{d.cpt}</span>{/if}
			</label>
		{/each}
		{#if !options.length && !orphans.length}<p class="help">{canEdit ? t('plan.ordersEmptyCanEdit') : t('plan.ordersEmpty')}</p>{/if}
	</fieldset>

	<label class="plan-label" for="orders-plan">{t('plan.ordersPlanLabel')}</label>
	<textarea
		id="orders-plan"
		rows="3"
		maxlength="4000"
		placeholder={t('plan.ordersPlanPlaceholder')}
		bind:value={planText}
		oninput={() => schedule(600)}
	></textarea>
	{#if error}<p class="error" role="alert">{error}</p>{/if}
</div>

<style>
	.orders {
		display: grid;
		gap: var(--space-2);
		min-width: 0;
		container-type: inline-size;
	}
	.head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-2);
	}
	.help {
		margin: 0;
		font-size: var(--text-xs);
		color: var(--text-3);
	}
	.pencil {
		min-height: 40px;
		white-space: nowrap;
	}
	.list {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 220px), 1fr));
		gap: 2px var(--space-3);
		margin: 0;
		padding: 0;
		border: 0;
		min-width: 0;
	}
	.check {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		min-height: 40px;
		cursor: pointer;
	}
	.check input {
		width: 20px;
		height: 20px;
		margin: 0;
		flex: none;
		accent-color: var(--accent);
	}
	.cptcode {
		margin-left: auto;
		font: var(--text-xs) var(--font-mono);
		color: var(--text-3);
	}
	em {
		color: var(--text-3);
	}
	.plan-label {
		color: var(--text-2);
		font-weight: var(--weight-semibold);
	}
	input,
	textarea {
		font: inherit;
		color: var(--text-1);
		background: transparent;
		border: 1px solid var(--hairline);
		border-radius: var(--radius-1);
		padding: 4px var(--space-2);
		min-height: max(var(--target-min), 40px);
		width: 100%;
		min-width: 0;
	}
	textarea {
		resize: vertical;
	}
	input:focus,
	textarea:focus {
		border-color: var(--accent);
		background: var(--surface-1);
		outline: none;
		box-shadow: 0 0 0 1px var(--focus-ring);
	}
	input::placeholder,
	textarea::placeholder {
		color: var(--text-3);
	}
	.editor {
		display: grid;
		gap: var(--space-2);
		padding: var(--space-2);
		border: 1px dashed var(--hairline);
		border-radius: var(--radius-1);
		background: var(--surface-2);
	}
	.editor ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 2px;
	}
	/* Narrow pane: the name takes its own line; CPT and buttons below it. Wide: one row. */
	.editor li,
	.add {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 5.5em auto auto auto;
		gap: 2px;
		align-items: center;
		padding-bottom: var(--space-1);
		border-bottom: 1px solid var(--hairline);
	}
	.add {
		grid-template-columns: minmax(0, 1fr) 5.5em auto;
		border-bottom: 0;
	}
	.editor li > input:first-of-type,
	.add > input:first-of-type {
		grid-column: 1 / -1;
	}
	.editor li > input.cpt,
	.add > input.cpt {
		grid-column: 2;
	}
	@container (min-width: 460px) {
		.editor li {
			padding-bottom: 0;
			border-bottom: 0;
		}
		.editor li > input:first-of-type,
		.add > input:first-of-type {
			grid-column: 1;
		}
	}
	.add button {
		min-height: 40px;
	}
	.cpt {
		font-family: var(--font-mono);
	}
	.icon {
		min-width: 40px;
		min-height: 40px;
		padding: 0;
	}
	.danger {
		color: var(--danger);
	}
	.error {
		margin: 0;
		color: var(--danger);
		font-size: var(--text-xs);
	}
</style>
