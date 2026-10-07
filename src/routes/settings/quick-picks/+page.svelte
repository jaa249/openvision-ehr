<script lang="ts">
	import { enhance } from '$app/forms';
	import { useI18n } from '#lib/i18n/context.ts';
	import type { MessageKey } from '#lib/i18n/catalog.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const { t } = useI18n();

	const MODES = [
		['add', 'settings.qpModeAdd'],
		['replace', 'settings.qpModeReplace'],
		['append', 'settings.qpModeAppend']
	] as const satisfies readonly (readonly [string, MessageKey])[];
	const MODE_SHORT: Record<string, MessageKey> = { add: 'settings.qpModeShortAdd', replace: 'settings.qpModeShortReplace', append: 'settings.qpModeShortAppend' };
	const modeShort = (m: string) => (MODE_SHORT[m] ? t(MODE_SHORT[m]) : m);
	const rowLabel = $derived(new Map(data.rows.map((r) => [r.id, r.label])));

	// Drag to reorder (pointer); the ↑ ↓ buttons are the keyboard way and do the same thing.
	let order = $state<number[]>([]);
	$effect.pre(() => {
		order = data.picks.map((p) => p.id);
	});
	const byId = $derived(new Map(data.picks.map((p) => [p.id, p])));
	let dragging = $state<number | null>(null);
	let reorderForm = $state<HTMLFormElement>();
	let editing = $state<number | null>(null);

	function onDragStart(e: DragEvent, id: number) {
		dragging = id;
		e.dataTransfer?.setData('text/plain', String(id));
		if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
	}
	function onDragOver(e: DragEvent, overId: number) {
		if (dragging === null || dragging === overId) return;
		e.preventDefault();
		const from = order.indexOf(dragging);
		const to = order.indexOf(overId);
		const next = [...order];
		next.splice(from, 1);
		next.splice(to, 0, dragging);
		order = next;
	}
	function onDrop(e: DragEvent) {
		e.preventDefault();
		if (dragging === null) return;
		dragging = null;
		if (order.join() !== data.picks.map((p) => p.id).join()) reorderForm?.requestSubmit();
	}

	const keep = (confirmText?: string) => ({ cancel }: { cancel: () => void }) => {
		if (confirmText && !confirm(confirmText)) cancel();
		return async ({ result, update }: { result: { type: string }; update: (o?: { reset?: boolean }) => Promise<void> }) => {
			await update({ reset: false });
			if (result.type === 'success') editing = null;
		};
	};
	const addErr = $derived<Record<string, string>>(form?.section === 'add' && form.errors ? form.errors : {});
	type PickValues = { row: string; label: string; text: string; mode: string };
	const valuesOf = (f: unknown): PickValues | null => {
		const v = (f as { values?: Partial<PickValues> } | null)?.values;
		return v && typeof v.row === 'string' ? (v as PickValues) : null;
	};
	const addVals = $derived(form?.section === 'add' ? valuesOf(form) : null);
	const rowErr = (id: number): Record<string, string> => (form?.section === 'row' && form.id === id && form.errors ? form.errors : {});
	const desc = (errs: Record<string, string>, prefix: string, k: string) => (errs[k] ? `${prefix}-${k}-err` : undefined);
</script>

<svelte:head><title>{t('settings.quickPicksTitle')}</title></svelte:head>

<h2>{t('settings.quickPicksHeading')}</h2>
<p class="lead">{t('settings.quickPicksLead')}</p>

<nav class="zones" aria-label={t('settings.qpLists')}>
	{#each data.zones as z (z.id)}
		<a href="?zone={z.id}" aria-current={data.zone === z.id ? 'page' : undefined}>{z.label}</a>
	{/each}
</nav>

	{#snippet editor(prefix: string, errs: Record<string, string>, v: { row: string; label: string; text: string; mode: string })}
		<div class="grid">
			<div class="field">
				<label for="{prefix}-label">{t('settings.qpLabel')}</label>
				<input id="{prefix}-label" name="label" maxlength="40" value={v.label} autocomplete="off"
					aria-invalid={errs.label ? 'true' : undefined} aria-describedby={desc(errs, prefix, 'label')} />
				{#if errs.label}<p class="err" id="{prefix}-label-err">{errs.label}</p>{/if}
			</div>
			<div class="field">
				<label for="{prefix}-row">{t('settings.qpRow')}</label>
				<select id="{prefix}-row" name="row" aria-invalid={errs.row ? 'true' : undefined} aria-describedby={desc(errs, prefix, 'row')}>
					{#each data.rows as r (r.id)}<option value={r.id} selected={v.row === r.id}>{r.label}</option>{/each}
				</select>
				{#if errs.row}<p class="err" id="{prefix}-row-err">{errs.row}</p>{/if}
			</div>
			<div class="field">
				<label for="{prefix}-text">{t('settings.qpText')}</label>
				<input id="{prefix}-text" name="text" maxlength="200" value={v.text} autocomplete="off"
					aria-invalid={errs.text ? 'true' : undefined} aria-describedby={[desc(errs, prefix, 'text'), `${prefix}-text-hint`].filter(Boolean).join(' ')} />
				<p class="hint" id="{prefix}-text-hint">{t('settings.qpTextHint')}</p>
				{#if errs.text}<p class="err" id="{prefix}-text-err">{errs.text}</p>{/if}
			</div>
			<div class="field">
				<label for="{prefix}-mode">{t('settings.qpMode')}</label>
				<select id="{prefix}-mode" name="mode" aria-invalid={errs.mode ? 'true' : undefined} aria-describedby={desc(errs, prefix, 'mode')}>
					{#each MODES as [m, label] (m)}<option value={m} selected={v.mode === m}>{t(label)}</option>{/each}
				</select>
				{#if errs.mode}<p class="err" id="{prefix}-mode-err">{errs.mode}</p>{/if}
			</div>
		</div>
	{/snippet}

<div class="ov-form">
	<form method="POST" action="?/add" novalidate use:enhance={keep()} class="card">
		<input type="hidden" name="zone" value={data.zone} />
		<h3>{t('settings.qpAddHeading')}</h3>
		{@render editor('new', addErr, addVals ?? { row: data.rows[0]?.id ?? '', label: '', text: '', mode: 'add' })}
		<div class="actions">
			<button type="submit" class="primary">{t('settings.qpAdd')}</button>
			{#if form?.section === 'add' && form.ok}<p class="saved" role="status">{form.message}</p>{/if}
		</div>
	</form>

	<section class="card" aria-labelledby="list-h">
		<div class="list-head">
			<h3 id="list-h">{t('settings.qpListCount', { zone: data.zones.find((z) => z.id === data.zone)?.label ?? '', count: data.picks.length })}</h3>
			<form method="POST" action="?/reset" use:enhance={keep(t('settings.qpResetConfirm'))}>
				<input type="hidden" name="zone" value={data.zone} />
				<button type="submit" class="danger">{t('settings.qpReset')}</button>
			</form>
		</div>
		{#if form && (form.section === 'list' || form.section === 'form')}
			{#if form.errors?.form}<p class="err" role="alert">{form.errors.form}</p>{:else if 'message' in form && form.message}<p class="saved" role="status">{form.message}</p>{/if}
		{/if}
		<form method="POST" action="?/reorder" use:enhance={keep()} bind:this={reorderForm} hidden>
			<input type="hidden" name="zone" value={data.zone} />
			<input type="hidden" name="ids" value={order.join(',')} />
		</form>
		<p class="hint">{t('settings.qpDragHint')}</p>
		<ol class="picks">
			{#each order as id, i (id)}
				{@const p = byId.get(id)}
				{#if p}
					{@const errs = rowErr(p.id)}
					<li
						class:dragging={dragging === p.id}
						ondragover={(e) => onDragOver(e, p.id)}
						ondrop={onDrop}
					>
						<div class="line">
							<span class="handle" draggable="true" ondragstart={(e) => onDragStart(e, p.id)} ondragend={() => (dragging = null)} aria-hidden="true" title={t('settings.qpDragTitle')}>⠿</span>
							<span class="what">
								<strong class:clear={p.label.includes('clear field')}>{p.label}</strong>
								<span class="meta">{p.text && p.text !== p.label
										? t('settings.qpMetaText', { row: rowLabel.get(p.row) ?? p.row, mode: modeShort(p.mode), text: p.text })
										: t('settings.qpMeta', { row: rowLabel.get(p.row) ?? p.row, mode: modeShort(p.mode) })}</span>
							</span>
							<span class="btns">
								<form method="POST" action="?/up" use:enhance={keep()}>
									<input type="hidden" name="zone" value={data.zone} /><input type="hidden" name="id" value={p.id} />
									<button type="submit" disabled={i === 0} aria-label={t('settings.qpMoveUp', { label: p.label, row: rowLabel.get(p.row) ?? '' })}>↑</button>
								</form>
								<form method="POST" action="?/down" use:enhance={keep()}>
									<input type="hidden" name="zone" value={data.zone} /><input type="hidden" name="id" value={p.id} />
									<button type="submit" disabled={i === order.length - 1} aria-label={t('settings.qpMoveDown', { label: p.label, row: rowLabel.get(p.row) ?? '' })}>↓</button>
								</form>
								<button
									type="button"
									aria-expanded={editing === p.id || !!Object.keys(errs).length}
									aria-label={t('settings.editItem', { name: p.label })}
									onclick={() => (editing = editing === p.id ? null : p.id)}
								>
									{t('common.edit')}
								</button>
								<form method="POST" action="?/delete" use:enhance={keep(t('settings.qpDeleteConfirm', { label: p.label }))}>
									<input type="hidden" name="zone" value={data.zone} /><input type="hidden" name="id" value={p.id} />
									<button type="submit" class="danger" aria-label={t('settings.deleteItem', { name: p.label })}>{t('common.delete')}</button>
								</form>
							</span>
						</div>
						{#if editing === p.id || Object.keys(errs).length}
							<form method="POST" action="?/update" novalidate use:enhance={keep()} class="edit">
								<input type="hidden" name="zone" value={data.zone} /><input type="hidden" name="id" value={p.id} />
								{@render editor(`e${p.id}`, errs, (form?.section === 'row' && form.id === p.id ? valuesOf(form) : null) ?? p)}
								<div class="actions">
									<button type="submit" class="primary">{t('settings.qpSave')}</button>
									<button type="button" onclick={() => (editing = null)}>{t('common.cancel')}</button>
								</div>
							</form>
						{/if}
						{#if form?.section === 'row' && form.id === p.id && form.ok}<p class="saved" role="status">{t('common.saved')}</p>{/if}
					</li>
				{/if}
			{/each}
		</ol>
	</section>
</div>

<style>
	h3 {
		margin: 0;
		font-size: var(--text-md);
	}
	.zones {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1);
		margin: 0 0 var(--space-4);
		border-bottom: 1px solid var(--hairline);
	}
	.zones a {
		display: inline-flex;
		align-items: center;
		min-height: max(40px, var(--target-min));
		padding: 0 var(--space-3);
		text-decoration: none;
		color: var(--text-2);
		border-bottom: 2px solid transparent;
	}
	.zones a[aria-current='page'] {
		color: var(--accent);
		border-bottom-color: var(--accent);
		font-weight: var(--weight-semibold);
	}
	.list-head {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		align-items: center;
		gap: var(--space-2);
	}
	.picks {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.picks li {
		border-top: 1px solid var(--hairline);
		padding: var(--space-1) 0;
	}
	.picks li.dragging {
		opacity: 0.5;
		background: var(--accent-soft);
	}
	.line {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex-wrap: wrap;
	}
	.handle {
		cursor: grab;
		color: var(--text-3);
		font-size: var(--text-lg);
		min-width: 24px;
		text-align: center;
		user-select: none;
	}
	.what {
		flex: 1 1 12em;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}
	.clear {
		font-style: italic;
	}
	.meta {
		color: var(--text-2);
		font-size: var(--text-xs);
		overflow-wrap: anywhere;
	}
	.btns {
		display: flex;
		gap: var(--space-1);
		flex-wrap: wrap;
	}
	.edit {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		padding: var(--space-3) 0 var(--space-2) var(--space-5);
	}
</style>
