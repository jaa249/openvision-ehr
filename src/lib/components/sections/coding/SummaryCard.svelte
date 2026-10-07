<script lang="ts">
	// Coding lines summary (spec §11.4 FIX: "Save coding lines" replaces "Populate fee sheet").
	import type { CodingSummary } from '#lib/coding/lines.ts';
	import type { SavedLines } from '#lib/coding/types.ts';
	import { codeSetsShort } from '#lib/codesets/index.ts';

	let {
		summary,
		saved,
		canEdit,
		busy = false,
		message = null,
		failed = false,
		onsave,
		onprint
	}: {
		summary: CodingSummary;
		saved: SavedLines;
		canEdit: boolean;
		busy?: boolean;
		message?: string | null;
		failed?: boolean;
		onsave: () => void;
		onprint: () => void;
	} = $props();

	const same = $derived(
		JSON.stringify({ dx: summary.dx, cpt: summary.cpt.map(({ kind, code, modifiers, pointers, units }) => ({ kind, code, modifiers, pointers, units })) }) ===
			JSON.stringify({ dx: saved.dx, cpt: saved.cpt.map(({ kind, code, modifiers, pointers, units }) => ({ kind, code, modifiers, pointers, units })) })
	);
	const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
	const LEVEL = { error: 'Fix', warning: 'Check', suggestion: 'Consider' } as const;
</script>

<div class="panel wide" role="group" aria-labelledby="summary-title">
	<div class="card-head">
		<h3 id="summary-title">Coding lines</h3>
		<span class="saved-state" aria-live="polite">
			{#if saved.savedAt}
				{same ? 'Saved' : 'Changed since saved'} · {when(saved.savedAt)}{saved.savedBy ? ` by ${saved.savedBy}` : ''}
			{:else}
				Not saved yet
			{/if}
		</span>
	</div>

	<div class="tables">
		<div class="tbl">
			<h4>Diagnoses <span class="count">{summary.dx.length} of 12</span></h4>
			{#if summary.dx.length}
				<table>
					<thead><tr><th scope="col" class="ptr">Ptr</th><th scope="col" class="code">{codeSetsShort(summary.dx.map((d) => d.code))}</th><th scope="col">Impression</th></tr></thead>
					<tbody>
						{#each summary.dx as d (d.letter)}
							<tr><td class="ptr">{d.letter}</td><td class="code">{d.code}</td><td>{d.title}</td></tr>
						{/each}
					</tbody>
				</table>
			{:else}
				<p class="empty">No coded diagnoses.</p>
			{/if}
		</div>
		<div class="tbl">
			<h4>Procedures</h4>
			<table>
				<thead><tr><th scope="col" class="code">CPT</th><th scope="col">Description</th><th scope="col" class="mod">Mod</th><th scope="col" class="ptr">Ptr</th></tr></thead>
				<tbody>
					{#each summary.cpt as l, i (i)}
						<tr class:over={l.pointers.length > 4}>
							<td class="code">{l.code}</td>
							<td>{l.description}</td>
							<td class="mod">{l.modifiers.join(' ') || '—'}</td>
							<td class="ptr">{l.pointers.join('') || '—'}</td>
						</tr>
					{:else}
						<tr><td colspan="4" class="empty">No procedure lines.</td></tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>

	{#if summary.checks.length}
		<ul class="checks" aria-label="Checks">
			{#each summary.checks as c, i (i)}
				<li class={c.level}><span class="lvl">{LEVEL[c.level]}</span> {c.message}</li>
			{/each}
		</ul>
	{/if}

	<div class="actions">
		<button type="button" class="primary" disabled={!canEdit || !summary.ok || busy} onclick={onsave}>Save coding lines</button>
		<button type="button" disabled={busy} onclick={onprint}>Print superbill</button>
		<p class="help">
			{#if !canEdit}
				Only a provider or admin can save coding lines. Print shows the last saved lines.
			{:else if !summary.ok}
				Fix the items marked "Fix" to save.
			{:else}
				Saves this exam's lines for billing (only this exam's lines are changed). Print saves first, then opens the superbill in a new tab.
			{/if}
		</p>
		{#if message}<p class="msg" class:failed role={failed ? 'alert' : 'status'}>{message}</p>{/if}
	</div>
</div>

<style>
	.saved-state {
		font-size: var(--text-xs);
		color: var(--text-3);
	}
	.tables {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr));
		gap: var(--space-3);
		padding: var(--space-2) var(--space-3);
	}
	.tbl {
		min-width: 0;
	}
	h4 {
		margin: 0 0 var(--space-1);
		font-size: var(--text-xs);
		font-weight: var(--weight-semibold);
		color: var(--text-2);
	}
	.count {
		font-weight: var(--weight-regular);
		color: var(--text-3);
	}
	table {
		width: 100%;
		border-collapse: collapse;
		table-layout: fixed;
		font-size: var(--text-xs);
	}
	th,
	td {
		text-align: left;
		padding: 4px var(--space-1);
		border-bottom: 1px solid var(--hairline);
		vertical-align: top;
		overflow-wrap: anywhere;
	}
	th {
		color: var(--text-3);
		font-weight: var(--weight-semibold);
	}
	.ptr {
		width: 3.5em;
	}
	.code {
		width: 5.5em;
		font-family: var(--font-mono);
	}
	.mod {
		width: 3.5em;
		font-family: var(--font-mono);
	}
	tr.over .ptr {
		color: var(--danger);
		font-weight: var(--weight-semibold);
	}
	.empty {
		margin: 0;
		color: var(--text-3);
		font-size: var(--text-xs);
	}
	.checks {
		list-style: none;
		margin: 0;
		padding: var(--space-2) var(--space-3);
		display: grid;
		gap: var(--space-1);
		border-top: 1px solid var(--hairline);
		font-size: var(--text-xs);
	}
	.lvl {
		display: inline-block;
		min-width: 5.5em;
		font-weight: var(--weight-semibold);
	}
	.error .lvl {
		color: var(--danger);
	}
	.warning .lvl {
		color: var(--warn);
	}
	.suggestion .lvl {
		color: var(--accent);
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-3);
		border-top: 1px solid var(--hairline);
		background: var(--surface-2);
	}
	.actions button {
		min-height: max(var(--target-min), 40px);
	}
	.primary {
		background: var(--accent);
		color: var(--accent-text);
		border-color: var(--accent);
		font-weight: var(--weight-semibold);
	}
	.primary:hover:not(:disabled) {
		background: var(--accent);
		filter: brightness(1.08);
	}
	.primary:disabled {
		background: var(--surface-1);
		border-color: var(--hairline);
		color: var(--text-3);
	}
	.help,
	.msg {
		flex: 1 1 100%;
		margin: 0;
		font-size: var(--text-xs);
		color: var(--text-3);
	}
	.msg {
		color: var(--ok);
	}
	.msg.failed {
		color: var(--danger);
	}
</style>
