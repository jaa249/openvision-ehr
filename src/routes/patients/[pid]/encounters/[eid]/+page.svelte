<script lang="ts">
	import { onMount } from 'svelte';
	import { FIELDS, SECTIONS, SECTION_DEF, fieldId, type SectionId } from '#lib/exam/catalog.ts';
	import { applyPick, type QuickPick } from '#lib/exam/quickpicks.ts';
	import type { PriorVisit } from '#lib/exam/types.ts';
	import { applyOps, parseShorthand, type Findings, type Op } from '#lib/shorthand/parse.ts';
	import { Saver } from '#lib/exam/saver.svelte.ts';
	import PatientBanner from '#lib/components/PatientBanner.svelte';
	import SectionRail from '#lib/components/SectionRail.svelte';
	import SectionPanel from '#lib/components/SectionPanel.svelte';
	import QuickPickPanel from '#lib/components/QuickPickPanel.svelte';
	import PriorsPanel from '#lib/components/PriorsPanel.svelte';
	import ShorthandBar from '#lib/components/ShorthandBar.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	// The exam is edited locally and saved in the background; the server copy only seeds it.
	// svelte-ignore state_referenced_locally
	let findings = $state<Findings>(structuredClone(data.findings));
	let section = $state<SectionId>('ANTSEG');
	let shorthand = $state('');
	/** Right-hand helper: none (just type), quick picks, or prior visits (spec §1.6). */
	let mode = $state<'text' | 'qp' | 'priors'>('text');
	let priorIndex = $state(0);
	/** Fields filled by copy-forward; tinted until edited (spec §6.3). */
	let copied = $state(new Set<string>());
	let bar: ShorthandBar;

	// svelte-ignore state_referenced_locally
	const saver = new Saver(`/api/patients/${data.patient.id}/encounters/${data.encounter.id}/findings`);

	const current = $derived(SECTIONS.find((s) => s.id === section)!);
	const sec = $derived(SECTION_DEF.get(section));
	const picks = $derived(data.quickPicks.filter((p) => p.zone === section));
	const MODES = [
		{ id: 'text', label: 'Type' },
		{ id: 'qp', label: 'Quick picks' },
		{ id: 'priors', label: 'Prior visits' }
	] as const;

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
		if (changed.some((id) => copied.has(id))) copied = new Set([...copied].filter((id) => !changed.includes(id)));
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
		if (!sec) return;
		const ids = new Set(sec.rows.flatMap((r) => (side === 'OU' ? [r.od, r.os] : [fieldId(side, r)])));
		const subset = Object.fromEntries(Object.entries(data.defaults).filter(([id]) => ids.has(id)));
		const { findings: next, changed } = applyOps(findings, [{ kind: 'defaults', sections: [sec.id], source: '' }], subset);
		commit(next, changed, side === 'OU' ? 'Normal OU' : `Normal ${side}`);
	}

	function copy(from: 'OD' | 'OS') {
		if (!sec) return;
		const to = from === 'OD' ? 'OS' : 'OD';
		const next = { ...findings };
		const changed: string[] = [];
		for (const row of sec.rows.filter((r) => r.copyable)) {
			const src = findings[fieldId(from, row)] ?? { value: '', isDefault: false };
			const dst = fieldId(to, row);
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
		for (const f of FIELDS.filter((f) => f.section === section && f.eye === side)) {
			if (!findings[f.id]?.value && !findings[f.id]?.isDefault) continue;
			next[f.id] = { value: '', isDefault: false };
			changed.push(f.id);
		}
		commit(next, changed, `Cleared ${side}`);
	}

	// ---------- quick picks ----------
	function pick(p: QuickPick, eye: 'OD' | 'OS' | 'OU', modifier: string | null) {
		const { findings: next, changed } = applyPick(findings, p, eye, modifier);
		const what = p.text ? (modifier ? `${modifier} ${p.label}` : p.label) : 'Cleared';
		commit(next, changed, `${what} · ${eye}`);
	}

	// ---------- copy forward from a prior visit ----------
	/** Overwrites with the prior visit's recorded values; fields it left blank are kept (spec §6.3). */
	function copyForward(prior: PriorVisit, sections: SectionId[] | 'all') {
		const next = { ...findings };
		const changed: string[] = [];
		for (const f of FIELDS.filter((f) => sections === 'all' || sections.includes(f.section))) {
			const src = prior.findings[f.id]?.value;
			if (!src) continue;
			const cur = findings[f.id];
			if (cur && cur.value === src && !cur.isDefault) continue;
			next[f.id] = { value: src, isDefault: false };
			changed.push(f.id);
		}
		const where = sections === 'all' ? 'whole exam' : current.label;
		commit(next, changed, `Copied ${where} from ${prior.date}`);
		copied = new Set([...copied, ...changed]);
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
		const typing = target.closest('input, textarea, select, [contenteditable]');
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
</script>

<svelte:window {onkeydown} />
<svelte:head><title>{data.patient.name} · Exam · OpenVision</title></svelte:head>

<a class="skip" href="#exam">Skip to exam</a>
<div class="frame">
	<PatientBanner patient={data.patient} encounter={data.encounter} {saver} />
	<div class="body">
		<SectionRail current={section} {findings} onselect={(id) => (section = id)} />
		<main id="exam" tabindex="-1">
			{#if sec}
				<div class="modes" role="group" aria-label="Helper panel">
					{#each MODES as m (m.id)}
						<button type="button" aria-pressed={mode === m.id} onclick={() => (mode = m.id)}>
							{m.label}{#if m.id === 'priors' && data.priors.length}<span class="count">{data.priors.length}</span>{/if}
						</button>
					{/each}
				</div>
				<div class="work" class:with-aside={mode !== 'text'}>
					<SectionPanel
						{sec}
						{findings}
						{preview}
						{copied}
						onedit={edit}
						ondefaults={defaults}
						oncopy={copy}
						onclear={clearSide}
					/>
					{#if mode === 'qp'}
						<aside class="aside" aria-label="Quick picks">
							<QuickPickPanel {sec} {picks} onpick={pick} />
						</aside>
					{:else if mode === 'priors'}
						<aside class="aside" aria-label="Prior visits">
							<PriorsPanel
								{sec}
								priors={data.priors}
								bind:index={priorIndex}
								oncopysection={(p) => copyForward(p, [section])}
								oncopyall={(p) => copyForward(p, 'all')}
							/>
						</aside>
					{/if}
				</div>
			{:else}
				<div class="empty">
					<h2>{current.label}</h2>
					<p>
						This section isn't built yet. External, Slit lamp and Fundus (keys <kbd>5</kbd> <kbd>6</kbd>
						<kbd>7</kbd>) are ready to try.
					</p>
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
		container-type: inline-size;
	}
	main:focus {
		outline: none;
	}
	.modes {
		display: inline-flex;
		gap: 2px;
		padding: 2px;
		margin-bottom: var(--space-3);
		background: var(--surface-2);
		border-radius: var(--radius-2);
	}
	.modes button {
		border-color: transparent;
		background: transparent;
		color: var(--text-2);
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
	}
	.modes button[aria-pressed='true'] {
		background: var(--surface-0);
		border-color: var(--hairline);
		color: var(--text-1);
	}
	.count {
		font-size: var(--text-xs);
		padding: 0 6px;
		border-radius: var(--radius-pill);
		background: var(--accent-soft);
		color: var(--accent);
	}
	.work {
		display: grid;
		gap: var(--space-4);
		align-items: start;
	}
	.work.with-aside {
		grid-template-columns: minmax(0, 1fr) 320px;
	}
	.aside {
		position: sticky;
		top: 0;
		max-height: calc(100dvh - 220px);
		overflow: auto;
		background: var(--surface-1);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-2);
		padding: var(--space-3);
		animation: aside-in var(--dur-panel-in) var(--ease-enter);
	}
	@keyframes aside-in {
		from {
			opacity: 0;
			transform: translateX(8px);
		}
	}
	/* Stack the helper under the exam when the work area (not the window) gets narrow. */
	@container (max-width: 1000px) {
		.work.with-aside {
			grid-template-columns: minmax(0, 1fr);
		}
		.aside {
			position: static;
			max-height: none;
		}
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
