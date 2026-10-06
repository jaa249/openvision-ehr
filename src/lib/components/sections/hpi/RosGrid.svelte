<script lang="ts">
	// Review of systems (spec §7.3): twelve systems, each a Negative toggle plus free text, and comments.
	// Stored per visit (form_eye_ros). FIX: nothing is implied; an untouched system stays unrecorded.
	import { ROS_COMMENTS, ROS_NEGATIVE, ROS_SYSTEMS, isRosNegative, rosAllNegative, rosClear } from '#lib/exam/sections/history.ts';
	import type { PanelProps } from '../types.ts';
	import { cellState, withValues } from '../workup/cell.ts';

	let { findings, preview, copied, onedit, oncommit, maxLength }: Pick<PanelProps, 'findings' | 'preview' | 'copied' | 'onedit' | 'oncommit'> & {
		maxLength: (id: string) => number;
	} = $props();

	const cell = (id: string) => cellState(id, findings, preview, copied);
	const recorded = $derived(ROS_SYSTEMS.filter((s) => (findings[s.id]?.value ?? '').trim()).length);
	const rc = $derived(cell(ROS_COMMENTS));
	const hasAny = $derived(recorded > 0 || !!(findings[ROS_COMMENTS]?.value ?? '').trim());

	/** The toggle writes "negative" or clears it. Replacing other typed text gets an undo toast. */
	function toggle(id: string, label: string) {
		const cur = (findings[id]?.value ?? '').trim();
		if (isRosNegative(cur)) return onedit(id, '');
		if (!cur) return onedit(id, ROS_NEGATIVE);
		const { next, changed } = withValues(findings, { [id]: ROS_NEGATIVE });
		oncommit(next, changed, `${label}: negative`);
	}

	function allNegative() {
		const { next, changed } = rosAllNegative(findings);
		if (changed.length) oncommit(next, changed, 'ROS: empty systems negative');
	}

	function clear() {
		const { next, changed } = rosClear(findings);
		if (changed.length) oncommit(next, changed, 'Cleared ROS');
	}
</script>

<div class="panel" role="group" aria-labelledby="ros-title">
	<div class="card-head">
		<h3 id="ros-title">Review of systems</h3>
		<button type="button" class="act" disabled={recorded === ROS_SYSTEMS.length} onclick={allNegative}>All negative</button>
		<button type="button" class="act" disabled={!hasAny} onclick={clear}>Clear ROS</button>
	</div>
	<div class="grid">
		{#each ROS_SYSTEMS as s (s.id)}
			{@const c = cell(s.id)}
			{@const neg = isRosNegative(c.value)}
			<div class="sys" class:ghost={c.ghost} class:copied={c.copied} data-field={s.id}>
				<span class="name" id="ros-{s.id}">{s.label}<span class="code">{s.short}</span></span>
				<button
					type="button"
					class="neg"
					aria-pressed={neg}
					aria-label="{s.label} negative"
					onclick={() => toggle(s.id, s.label)}
				>
					<span aria-hidden="true">{neg ? '✓' : '○'}</span> Negative
				</button>
				<input
					value={neg ? '' : c.value}
					maxlength={maxLength(s.id)}
					autocomplete="off"
					aria-labelledby="ros-{s.id}"
					placeholder={neg ? 'Negative' : 'Findings'}
					oninput={(e) => onedit(s.id, e.currentTarget.value)}
				/>
			</div>
		{/each}
	</div>
	<label class="comments">
		<span>ROS comments <span class="code inline">ROSCOM</span></span>
		<textarea
			rows="2"
			maxlength={maxLength(ROS_COMMENTS)}
			class:ghost={rc.ghost}
			class:copied={rc.copied}
			value={rc.value}
			oninput={(e) => onedit(ROS_COMMENTS, e.currentTarget.value)}
		></textarea>
	</label>
	<p class="hint" aria-live="polite">
		{recorded} of {ROS_SYSTEMS.length} systems recorded. Only recorded systems print; an untouched system is never reported as negative.
		"All negative" fills just the empty ones.
	</p>
</div>

<style>
	.panel {
		background: var(--surface-1);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-2);
		overflow: hidden;
		min-width: 0;
	}
	.card-head {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex-wrap: wrap;
		padding: var(--space-2) var(--space-3);
		border-bottom: 1px solid var(--hairline);
		background: var(--surface-2);
	}
	h3 {
		font-size: var(--text-sm);
		font-weight: var(--weight-semibold);
		margin: 0 auto 0 0;
	}
	.act {
		min-height: max(var(--target-min), 40px);
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr));
		gap: var(--space-2) var(--space-4);
		padding: var(--space-3);
	}
	.sys {
		display: grid;
		grid-template-columns: 8.5em auto minmax(0, 1fr);
		align-items: center;
		gap: var(--space-2);
		border-radius: var(--radius-1);
		padding: 2px;
	}
	.sys.ghost {
		background: var(--accent-soft);
	}
	.sys.ghost input {
		color: var(--accent);
		font-style: italic;
	}
	.sys.copied,
	textarea.copied {
		background: var(--copied-tint);
	}
	.name {
		color: var(--text-2);
		min-width: 0;
	}
	.code {
		display: block;
		font: var(--text-xs) var(--font-mono);
		color: var(--text-3);
	}
	.code.inline {
		display: inline;
	}
	.neg {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		min-height: max(var(--target-min), 40px);
		padding: 0 var(--space-2);
		color: var(--text-2);
		white-space: nowrap;
	}
	.neg[aria-pressed='true'] {
		color: var(--ok);
		border-color: var(--ok);
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
		box-sizing: border-box;
	}
	input::placeholder,
	textarea::placeholder {
		color: var(--text-3);
	}
	input:focus,
	textarea:focus {
		border-color: var(--accent);
		background: var(--surface-1);
		outline: none;
		box-shadow: 0 0 0 1px var(--focus-ring);
	}
	.comments {
		display: grid;
		gap: var(--space-1);
		padding: var(--space-2) var(--space-3);
		color: var(--text-2);
		border-top: 1px solid var(--hairline);
	}
	textarea {
		resize: vertical;
	}
	textarea.ghost {
		color: var(--accent);
		font-style: italic;
		background: var(--accent-soft);
	}
	.hint {
		margin: 0;
		padding: var(--space-2) var(--space-3);
		font-size: var(--text-xs);
		color: var(--text-3);
		border-top: 1px solid var(--hairline);
	}
</style>
