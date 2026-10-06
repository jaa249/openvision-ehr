<script lang="ts">
	// Visit status (spec §11.5 adapted: no scheduler). Native radios, so arrow keys move between segments.
	import { VISIT_STATUSES, type StatusChange, type VisitStatusId } from '#lib/coding/types.ts';

	let {
		status,
		history,
		busy = false,
		error = null,
		onchange
	}: {
		status: VisitStatusId;
		history: StatusChange[];
		busy?: boolean;
		error?: string | null;
		onchange: (s: VisitStatusId) => void;
	} = $props();

	const label = (id: VisitStatusId) => VISIT_STATUSES.find((s) => s.id === id)?.label ?? id;
	const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
	const current = $derived(VISIT_STATUSES.find((s) => s.id === status));
	let showHistory = $state(false);
</script>

<fieldset class="status" aria-describedby="status-help">
	<legend>Visit status</legend>
	<div class="segments">
		{#each VISIT_STATUSES as s (s.id)}
			<label class="seg" class:on={status === s.id}>
				<input type="radio" name="visit-status" value={s.id} checked={status === s.id} disabled={busy} onchange={() => onchange(s.id)} />
				<span>{s.label}</span>
			</label>
		{/each}
	</div>
	<p id="status-help" class="help">
		{current?.help}
		{#if history[0]}
			Set by {history[0].changedBy}, {when(history[0].changedAt)}.
		{/if}
	</p>
	{#if history.length > 1}
		<button type="button" class="link" aria-expanded={showHistory} aria-controls="status-history" onclick={() => (showHistory = !showHistory)}>
			{showHistory ? 'Hide' : 'Show'} status history ({history.length})
		</button>
	{/if}
	{#if error}<p class="err" role="alert">{error}</p>{/if}
	{#if showHistory}
		<ol id="status-history" class="history">
			{#each history as h, i (i)}
				<li><strong>{label(h.status)}</strong> — {h.changedBy}, {when(h.changedAt)}</li>
			{/each}
		</ol>
	{/if}
</fieldset>

<style>
	.status {
		border: 0;
		margin: 0;
		padding: 0;
		min-width: 0;
	}
	legend {
		font-size: var(--text-xs);
		font-weight: var(--weight-semibold);
		color: var(--text-2);
		padding: 0;
		margin-bottom: var(--space-1);
	}
	.segments {
		display: flex;
		flex-wrap: wrap;
		border: 1px solid var(--hairline);
		border-radius: var(--radius-2);
		overflow: hidden;
		background: var(--surface-1);
	}
	.seg {
		flex: 1 1 auto;
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: max(var(--target-min), 40px);
		padding: 0 var(--space-3);
		font-size: var(--text-sm);
		color: var(--text-2);
		cursor: pointer;
		border-right: 1px solid var(--hairline);
		white-space: nowrap;
	}
	.seg:last-child {
		border-right: 0;
	}
	.seg input {
		position: absolute;
		opacity: 0;
		inset: 0;
		margin: 0;
		cursor: pointer;
	}
	.seg.on {
		background: var(--accent);
		color: var(--accent-text);
		font-weight: var(--weight-semibold);
	}
	.seg:has(input:focus-visible) {
		outline: 2px solid var(--focus-ring);
		outline-offset: -3px;
	}
	.seg:has(input:disabled) {
		cursor: progress;
	}
	.help,
	.err {
		margin: var(--space-1) 0 0;
		font-size: var(--text-xs);
		color: var(--text-3);
	}
	.err {
		color: var(--danger);
	}
	.link {
		border: 0;
		background: none;
		padding: 0;
		min-height: max(var(--target-min), 40px);
		color: var(--accent);
		text-decoration: underline;
		font-size: var(--text-xs);
	}
	.history {
		margin: var(--space-1) 0 0;
		padding-left: var(--space-5);
		font-size: var(--text-xs);
		color: var(--text-2);
	}
</style>
