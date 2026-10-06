<script lang="ts">
	import { onMount } from 'svelte';
	import { FIELDS, ANTSEG_ROWS, SECTIONS, fieldId, type SectionId } from '#lib/exam/catalog.ts';
	import { applyOps, parseShorthand, type Findings, type Op } from '#lib/shorthand/parse.ts';
	import { Saver } from '#lib/exam/saver.svelte.ts';
	import PatientBanner from '#lib/components/PatientBanner.svelte';
	import SectionRail from '#lib/components/SectionRail.svelte';
	import AntSegPanel from '#lib/components/AntSegPanel.svelte';
	import ShorthandBar from '#lib/components/ShorthandBar.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	// The exam is edited locally and saved in the background; the server copy only seeds it.
	// svelte-ignore state_referenced_locally
	let findings = $state<Findings>(structuredClone(data.findings));
	let section = $state<SectionId>('ANTSEG');
	let shorthand = $state('');
	let bar: ShorthandBar;

	// svelte-ignore state_referenced_locally
	const saver = new Saver(`/api/patients/${data.patient.id}/encounters/${data.encounter.id}/findings`);

	// ---------- undo (bulk actions only; typing has the browser's own undo) ----------
	interface UndoEntry {
		label: string;
		before: Findings;
	}
	let undoEntry = $state<UndoEntry | null>(null);
	let undoTimer: ReturnType<typeof setTimeout> | undefined;

	function commit(next: Findings, changed: string[], label?: string) {
		if (changed.length === 0) return;
		if (label) {
			const before: Findings = {};
			for (const id of changed) before[id] = findings[id] ?? { value: '', isDefault: false };
			undoEntry = { label, before };
			clearTimeout(undoTimer);
			undoTimer = setTimeout(() => (undoEntry = null), 10000);
		}
		findings = next;
		for (const id of changed) saver.queue(id, next[id].value, next[id].isDefault, label ? 0 : 400);
	}

	function undo() {
		if (!undoEntry) return;
		const next = { ...findings, ...undoEntry.before };
		const changed = Object.keys(undoEntry.before);
		undoEntry = null;
		commit(next, changed);
	}

	// ---------- edits ----------
	function edit(field: string, value: string) {
		commit({ ...findings, [field]: { value, isDefault: false } }, [field]);
	}

	function runOps(ops: Op[], label: string) {
		const { findings: next, changed } = applyOps(findings, ops, data.defaults);
		commit(next, changed, label);
	}

	function defaults(side: 'OD' | 'OS' | 'OU') {
		const subset = Object.fromEntries(
			Object.entries(data.defaults).filter(([id]) => side === 'OU' || id.startsWith(side))
		);
		const { findings: next, changed } = applyOps(findings, [{ kind: 'defaults', sections: ['ANTSEG'], source: '' }], subset);
		commit(next, changed, side === 'OU' ? 'Normal OU' : `Normal ${side}`);
	}

	function copy(from: 'OD' | 'OS') {
		const to = from === 'OD' ? 'OS' : 'OD';
		const next = { ...findings };
		const changed: string[] = [];
		for (const row of ANTSEG_ROWS.filter((r) => r.copyable)) {
			const src = findings[fieldId(from, row.id)] ?? { value: '', isDefault: false };
			const dst = fieldId(to, row.id);
			const cur = findings[dst] ?? { value: '', isDefault: false };
			if (cur.value === src.value && cur.isDefault === src.isDefault) continue;
			next[dst] = { ...src };
			changed.push(dst);
		}
		commit(next, changed, `Copied ${from} → ${to}`);
	}

	function clearSide(side: 'OD' | 'OS') {
		const next = { ...findings };
		const changed: string[] = [];
		for (const f of FIELDS.filter((f) => f.section === 'ANTSEG' && f.eye === side)) {
			if (!findings[f.id]?.value && !findings[f.id]?.isDefault) continue;
			next[f.id] = { value: '', isDefault: false };
			changed.push(f.id);
		}
		commit(next, changed, `Cleared ${side}`);
	}

	// ---------- shorthand ----------
	const parsed = $derived(parseShorthand(shorthand));
	const preview = $derived.by(() => {
		if (!parsed.ops.length) return null;
		const { findings: next, changed } = applyOps(findings, parsed.ops, data.defaults);
		return Object.fromEntries(changed.map((id) => [id, next[id]])) as Findings;
	});

	function submitShorthand() {
		if (parsed.ops.length) runOps(parsed.ops, 'Shorthand');
		// Unrecognized entries stay in the box so nothing typed is lost (spec §2.5 FIX).
		shorthand = parsed.errors.map((e) => e.entry).join('; ');
	}

	// ---------- keyboard ----------
	function onkeydown(e: KeyboardEvent) {
		const target = e.target as HTMLElement;
		const typing = target.closest('input, textarea, [contenteditable]');
		if (e.altKey && !e.ctrlKey && !e.metaKey && e.key.toLowerCase() === 'k') {
			e.preventDefault();
			bar.focus();
			return;
		}
		if (typing || e.altKey || e.ctrlKey || e.metaKey) {
			if (!typing && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && undoEntry) {
				e.preventDefault();
				undo();
			}
			return;
		}
		const s = SECTIONS.find((s) => s.key === e.key);
		if (s) section = s.id;
	}

	onMount(() => {
		const warn = (e: BeforeUnloadEvent) => {
			if (saver.hasUnsaved) e.preventDefault();
		};
		const flush = () => {
			if (document.visibilityState === 'hidden') saver.flush();
		};
		window.addEventListener('beforeunload', warn);
		document.addEventListener('visibilitychange', flush);
		return () => {
			window.removeEventListener('beforeunload', warn);
			document.removeEventListener('visibilitychange', flush);
		};
	});

	const current = $derived(SECTIONS.find((s) => s.id === section)!);
</script>

<svelte:window {onkeydown} />
<svelte:head><title>{data.patient.name} · Exam · OpenVision</title></svelte:head>

<a class="skip" href="#exam">Skip to exam</a>
<div class="frame">
	<PatientBanner patient={data.patient} encounter={data.encounter} {saver} />
	<div class="body">
		<SectionRail current={section} {findings} onselect={(id) => (section = id)} />
		<main id="exam" tabindex="-1">
			{#if section === 'ANTSEG'}
				<AntSegPanel
					{findings}
					{preview}
					onedit={edit}
					ondefaults={defaults}
					oncopy={copy}
					onclear={clearSide}
				/>
			{:else}
				<div class="empty">
					<h2>{current.label}</h2>
					<p>This section isn't built yet. The slit lamp section (key <kbd>6</kbd>) is ready to try.</p>
				</div>
			{/if}
		</main>
	</div>
	<ShorthandBar bind:this={bar} bind:text={shorthand} result={parsed} onsubmit={submitShorthand} />
</div>

{#if undoEntry}
	<div class="toast" role="status">
		<span>{undoEntry.label}</span>
		<button type="button" onclick={undo}>Undo <kbd>Ctrl Z</kbd></button>
	</div>
{/if}

<style>
	.frame {
		display: grid;
		grid-template-rows: auto 1fr auto;
		height: 100dvh;
	}
	.body {
		display: grid;
		grid-template-columns: 168px 1fr;
		min-height: 0;
	}
	main {
		overflow: auto;
		padding: var(--space-4) var(--space-5);
	}
	main:focus {
		outline: none;
	}
	.empty {
		color: var(--text-2);
		max-width: var(--measure-prose);
	}
	.empty h2 {
		font-size: var(--text-md);
		color: var(--text-1);
	}
	.skip {
		position: absolute;
		left: -9999px;
		z-index: 50;
	}
	.skip:focus {
		left: var(--space-2);
		top: var(--space-2);
		background: var(--surface-3);
		padding: var(--space-2) var(--space-3);
	}
	.toast {
		position: fixed;
		left: 50%;
		bottom: calc(var(--target-min) + var(--space-6));
		transform: translateX(-50%);
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-2) var(--space-2) var(--space-2) var(--space-4);
		background: var(--surface-3);
		border-radius: var(--radius-2);
		box-shadow: var(--shadow-overlay);
		animation: toast-in var(--dur-panel-in) var(--ease-enter);
	}
	@keyframes toast-in {
		from {
			opacity: 0;
			transform: translate(-50%, 6px);
		}
	}
	@media (max-width: 900px) {
		.body {
			grid-template-columns: 1fr;
			grid-template-rows: auto 1fr;
		}
		main {
			padding: var(--space-3) var(--space-4);
		}
	}
</style>
