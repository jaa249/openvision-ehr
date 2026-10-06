<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { loadPrefs } from '#lib/prefs/client.ts';
	import { FIELDS, SECTIONS, SECTION_DEF, fieldId, type SectionId } from '#lib/exam/catalog.ts';
	import { applyPick, type QuickPick } from '#lib/exam/quickpicks.ts';
	import type { PriorVisit } from '#lib/exam/types.ts';
	import { applyOps, parseShorthand, type Findings, type Op } from '#lib/shorthand/parse.ts';
	import { bump, publishAllergyStatus } from '#lib/history/bus.svelte.ts';
	import { ISSUE_TYPE_DEF } from '#lib/history/lists.ts';
	import type { AllergyStatus, IssueType, ShorthandIssueResult } from '#lib/history/types.ts';
	import { Saver, SIGNED_OUT_MESSAGE } from '#lib/exam/saver.svelte.ts';
	import { ExamLock, flushAll, lockHeaders } from '#lib/exam/lock.svelte.ts';
	import PatientBanner from '#lib/components/PatientBanner.svelte';
	import SectionRail from '#lib/components/SectionRail.svelte';
	import SectionPanel from '#lib/components/SectionPanel.svelte';
	import QuickPickPanel from '#lib/components/QuickPickPanel.svelte';
	import PriorsPanel from '#lib/components/PriorsPanel.svelte';
	import ShorthandBar from '#lib/components/ShorthandBar.svelte';
	import CustomSection from '#lib/components/sections/CustomSection.svelte';
	import DrawingPanel from '#lib/components/DrawingPanel.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	// The exam is edited locally and saved in the background; the server copy only seeds it.
	// svelte-ignore state_referenced_locally
	let findings = $state<Findings>(structuredClone(data.findings));
	let section = $state<SectionId>('ANTSEG');
	let shorthand = $state('');
	/** Right-hand helper: none (just type), quick picks, or prior visits (spec §1.6). */
	let mode = $state<'text' | 'qp' | 'priors' | 'draw'>('text');
	let priorIndex = $state(0);
	/** Fields filled by copy-forward; tinted until edited (spec §6.3). */
	let copied = $state(new Set<string>());
	let bar: ShorthandBar;

	// svelte-ignore state_referenced_locally
	const examApi = `/api/patients/${data.patient.id}/encounters/${data.encounter.id}`;
	const saver = new Saver(`${examApi}/findings`);

	// ---------- edit lock and signing (spec §15.1 FIX) ----------
	// svelte-ignore state_referenced_locally
	const lock = new ExamLock(examApi, { signature: data.lockState.signature, lock: data.lockState.lock }, applyServerFindings);
	/** Signed, or another page holds the lock: nothing on this page may change the exam or post. */
	const readonly = $derived(lock.readonly);
	// svelte-ignore state_referenced_locally
	const canSign = data.user.role === 'provider' && data.user.id === data.encounter.providerId;

	/** Fresh values from the server (read-only polling, lock acquire): changed fields take the "copied" tint. */
	function applyServerFindings(server: Findings) {
		if (saver.hasUnsaved) return; // never overwrite edits that are still on their way to the server
		const next = { ...findings };
		const changed: string[] = [];
		for (const id of new Set([...Object.keys(server), ...Object.keys(findings)])) {
			const a = findings[id];
			const b = server[id];
			if ((a?.value ?? '') === (b?.value ?? '') && !!a?.isDefault === !!b?.isDefault) continue;
			next[id] = b ?? { value: '', isDefault: false };
			changed.push(id);
		}
		if (!changed.length) return;
		findings = next;
		copied = new Set([...copied, ...changed]);
	}

	// A save refused with 423 switches the whole page to read-only...
	$effect(() => {
		const info = saver.locked;
		if (info && !untrack(() => lock.readonly)) untrack(() => lock.lost(info));
	});
	// ...and a page that becomes read-only (takeover, signed elsewhere) stops the saver; getting the
	// lock back (explicit takeover) lets it save again.
	$effect(() => {
		const mode = lock.mode;
		untrack(() => {
			if (mode === 'readonly' || mode === 'signed') {
				saver.stop({ message: lock.message ?? 'This exam is read-only.', reason: mode === 'signed' ? 'signed' : 'locked' });
			} else if (mode === 'editing' && saver.locked) saver.resume();
		});
	});

	async function takeOver() {
		const who = lock.holder ? lock.holder.holderName : 'the other page';
		const ok = window.confirm(
			`Take over editing from ${who}?\n\nTheir page becomes read-only, and anything they have not saved yet will not be saved. The takeover is recorded.`
		);
		if (ok) await lock.takeOver();
	}

	let signDialog = $state<HTMLDialogElement>();
	let signError = $state<string | null>(null);
	let signing = $state(false);
	const recorded = $derived(Object.values(findings).filter((f) => f.value).length);

	/** Saves everything first, then asks for confirmation (the dialog lists what signing locks). */
	async function startSign() {
		signError = null;
		signing = true;
		const saved = await saver.settle();
		await flushAll();
		signing = false;
		if (!saved) {
			notice = 'Not signed: recent changes are not saved yet. Check the connection and try again.';
			setTimeout(() => (notice = null), 8000);
			return;
		}
		signDialog?.showModal();
	}

	async function confirmSign() {
		signing = true;
		signError = null;
		try {
			if (!(await saver.settle())) throw new Error('Recent changes are not saved yet. Check the connection and try again.');
			await flushAll();
			const res = await fetch(`${examApi}/sign`, { method: 'POST', headers: lockHeaders() });
			if (res.status === 423) {
				const body = await res.json();
				lock.lost(body);
				throw new Error(body.message);
			}
			if (res.status === 401) throw new Error(SIGNED_OUT_MESSAGE);
			if (!res.ok) throw new Error(await errorText(res, `Not signed (error ${res.status}).`));
			const { signature } = await res.json();
			lock.markSigned(signature);
			signDialog?.close();
		} catch (e) {
			signError = e instanceof Error ? e.message : String(e);
		} finally {
			signing = false;
		}
	}

	let addendum = $state('');
	let addendumError = $state<string | null>(null);
	let addingAddendum = $state(false);
	async function addAddendum() {
		if (!addendum.trim()) return;
		addingAddendum = true;
		addendumError = null;
		try {
			const res = await fetch(`${examApi}/addenda`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ text: addendum })
			});
			if (res.status === 401) throw new Error(SIGNED_OUT_MESSAGE);
			if (!res.ok) throw new Error(await errorText(res, `Not added (error ${res.status}).`));
			lock.markSigned((await res.json()).signature);
			addendum = '';
		} catch (e) {
			addendumError = e instanceof Error ? e.message : String(e);
		} finally {
			addingAddendum = false;
		}
	}
	/** The server's message from an error answer ({ message } JSON or plain text). */
	async function errorText(res: Response, fallback: string): Promise<string> {
		const text = await res.text().catch(() => '');
		try {
			return (JSON.parse(text) as { message?: string }).message || fallback;
		} catch {
			return text || fallback;
		}
	}
	const when = (iso: string) =>
		new Date(iso).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

	const current = $derived(SECTIONS.find((s) => s.id === section)!);
	const sec = $derived(SECTION_DEF.get(section));
	const picks = $derived(data.quickPicks.filter((p) => p.zone === section));
	/** Sections drawn as their own panel component instead of OD/OS rows. */
	const CUSTOM: SectionId[] = ['HPI', 'ACUITY', 'IOP', 'REFRACTION', 'NEURO', 'IMPPLAN', 'CODING'];
	/** Zones with a drawing canvas (spec §5.1). */
	const DRAW_ZONES: SectionId[] = ['HPI', 'EXT', 'ANTSEG', 'RETINA', 'NEURO', 'IMPPLAN'];
	const ALL_MODES = [
		{ id: 'text', label: 'Type', key: 't' },
		{ id: 'qp', label: 'Quick picks', key: 'b' },
		{ id: 'priors', label: 'Prior visits', key: 'p' },
		{ id: 'draw', label: 'Draw', key: 'd' }
	] as const;
	const MODES = $derived(
		ALL_MODES.filter(
			(m) =>
				m.id === 'text' ||
				(m.id === 'qp' && picks.length > 0) ||
				(m.id === 'priors' && !!sec) ||
				(m.id === 'draw' && DRAW_ZONES.includes(section))
		)
	);
	// A helper that does not exist for this section falls back to plain typing.
	const activeMode = $derived(MODES.some((m) => m.id === mode) ? mode : 'text');
	const custom = $derived(CUSTOM.includes(section));

	// ---------- printing ----------
	let notice = $state<string | null>(null);
	/** Saves first so the report matches the screen, then opens it in a new tab (spec §13). */
	async function printExam() {
		const tab = window.open('about:blank', '_blank'); // opened now, while the click still counts
		if (!(await saver.settle())) {
			tab?.close();
			notice = 'Not printed: recent changes are not saved yet. Check the connection and try again.';
			setTimeout(() => (notice = null), 8000);
			return;
		}
		const url = `/print?auto=1&ids=${data.encounter.id}`;
		if (tab) tab.location.href = url;
		else window.location.href = url;
	}
	/** Spectacle / contact lens Rx for one refraction source (spec §12.1), saved first like the report. */
	async function printRx(source: string) {
		const tab = window.open('about:blank', '_blank');
		if (!(await saver.settle())) {
			tab?.close();
			notice = 'Rx not opened: recent changes are not saved yet. Check the connection and try again.';
			setTimeout(() => (notice = null), 8000);
			return;
		}
		const url = `/patients/${data.patient.id}/encounters/${data.encounter.id}/rx?source=${encodeURIComponent(source)}`;
		if (tab) tab.location.href = url;
		else window.location.href = url;
	}

	// ---------- undo (bulk actions only; typing has the browser's own undo) ----------
	interface UndoEntry {
		label: string;
		before: Findings;
	}
	let undoEntry = $state<UndoEntry | null>(null);
	let undoTimer: ReturnType<typeof setTimeout> | undefined;

	function commit(next: Findings, changed: string[], label?: string) {
		if (changed.length === 0) return;
		if (lock.readonly) {
			// Read-only pages never change the exam (copy forward from the priors panel lands here).
			notice = lock.mode === 'signed' ? 'This exam is signed. Add an addendum instead.' : 'Read-only: someone else is editing this exam.';
			setTimeout(() => (notice = null), 6000);
			return;
		}
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

	/** Shorthand code to retype for a PMSFH list, so a failed entry goes back into the box intact. */
	const ISSUE_CODE: Record<IssueType, string> = { POH: 'POH', PMH: 'PMH', POS: 'POS', SURG: 'SURG', MED: 'MEDS', EYEMED: 'MEDS', ALLERGY: 'ALL' };
	let historyNote = $state<string | null>(null);
	let historyNoteTimer: ReturnType<typeof setTimeout> | undefined;

	/** PMSFH entries (§2.4) create patient issues through the history API, one request per entry. Returns failed entries. */
	async function sendIssueOps(ops: Extract<Op, { kind: 'issue' }>[]): Promise<string[]> {
		const failed: string[] = [];
		const added = new Map<IssueType, string[]>();
		for (const op of ops) {
			try {
				const res = await fetch(`/api/patients/${data.patient.id}/encounters/${data.encounter.id}/history`, {
					method: 'POST',
					headers: { 'content-type': 'application/json', ...lockHeaders() },
					body: JSON.stringify({ action: 'shorthand', type: op.type, text: op.text })
				});
				if (res.status === 401) signedOut = true;
				if (!res.ok) throw new Error(String(res.status));
				const { result, allergyStatus } = (await res.json()) as { result: ShorthandIssueResult; allergyStatus: AllergyStatus };
				publishAllergyStatus(data.patient.id, allergyStatus); // ALL: entries update the banner at once
				added.set(op.type, [...(added.get(op.type) ?? []), ...result.added, ...result.updated]);
			} catch {
				failed.push(`${ISSUE_CODE[op.type]}:${op.text}`);
			}
		}
		if (added.size) {
			bump();
			historyNote = [...added].map(([type, titles]) => `Added to ${ISSUE_TYPE_DEF.get(type)?.short ?? type}: ${titles.join(', ')}`).join(' · ');
			clearTimeout(historyNoteTimer);
			historyNoteTimer = setTimeout(() => (historyNote = null), 6000);
		}
		return failed;
	}

	/** A write came back 401 (idle auto-logoff or expired session). */
	let signedOut = $state(false);

	async function submitShorthand() {
		if (lock.readonly) return;
		const issueOps = parsed.ops.filter((op): op is Extract<Op, { kind: 'issue' }> => op.kind === 'issue');
		const examOps = parsed.ops.filter((op) => op.kind !== 'issue');
		if (examOps.length) runOps(examOps, 'Shorthand');
		// Unrecognized entries stay in the box so nothing typed is lost (spec §2.5 FIX).
		shorthand = parsed.errors.map((e) => e.entry).join('; ');
		if (!issueOps.length) return;
		const failed = await sendIssueOps(issueOps);
		if (failed.length) {
			// History entries that did not save go back into the box, ahead of anything typed since.
			shorthand = [...failed, shorthand].filter(Boolean).join('; ');
			notice = signedOut ? SIGNED_OUT_MESSAGE : 'Not added to the patient history. Check the connection and press Enter to try again.';
			setTimeout(() => (notice = null), 8000);
		}
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
		// Alt+T / Alt+B / Alt+P: Type, Quick picks, Prior visits (decision D4).
		const m = e.altKey && !e.ctrlKey && !e.metaKey ? MODES.find((m) => m.key === e.key.toLowerCase()) : undefined;
		if (m) {
			e.preventDefault();
			mode = m.id;
			return;
		}
		// Ctrl+P prints the exam report, not a screenshot of the editing screen.
		if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'p') {
			e.preventDefault();
			printExam();
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
		// The user's default helper panel (§1.7 prefs; new users start in Quick picks).
		loadPrefs()
			.then((p) => (mode = p['exam.mode']))
			.catch(() => {});
		const warn = (e: BeforeUnloadEvent) => {
			if (saver.hasUnsaved) e.preventDefault();
		};
		const flush = () => {
			if (document.visibilityState === 'hidden') saver.flush();
			else void lock.resume(); // back from another tab: is the lock still ours (or free again)?
		};
		// Page going away (navigation, close, bfcache): give the lock back so others can edit at once.
		const hide = () => lock.release(true);
		const show = (e: PageTransitionEvent) => {
			if (e.persisted) void lock.resume();
		};
		// The sign-in layer fires this about a minute before the idle auto-logoff: send everything now.
		const expiring = () => {
			void saver.settle();
			void flushAll();
		};
		window.addEventListener('beforeunload', warn);
		document.addEventListener('visibilitychange', flush);
		window.addEventListener('pagehide', hide);
		window.addEventListener('pageshow', show);
		window.addEventListener('session-expiring', expiring);
		void lock.start();
		return () => {
			window.removeEventListener('beforeunload', warn);
			document.removeEventListener('visibilitychange', flush);
			window.removeEventListener('pagehide', hide);
			window.removeEventListener('pageshow', show);
			window.removeEventListener('session-expiring', expiring);
			saver.flush();
			lock.stop(); // in-app navigation away: release
		};
	});
</script>

<svelte:window {onkeydown} />
<svelte:head><title>{data.patient.name} · Exam · OpenVision</title></svelte:head>

<a class="skip" href="#exam">Skip to exam</a>
<p class="print-hint">To print this exam, use the Print button at the top of the exam (or Ctrl+P), which prints the formatted report.</p>
<div class="frame">
	<div class="top">
		<PatientBanner
			patient={data.patient}
			encounter={data.encounter}
			{saver}
			{lock}
			cansign={canSign}
			{signing}
			onprint={printExam}
			onsign={startSign}
			ontakeover={takeOver}
			onedit={() => lock.acquire()}
		/>
		{#if saver.signedOut || signedOut}
			<div class="lockbar warn" role="alert">{SIGNED_OUT_MESSAGE}</div>
		{:else if lock.mode === 'readonly' && (lock.message || saver.lostFields.length)}
			<div class="lockbar warn" role="alert">
				{lock.message ?? 'This page is read-only.'}
				{#if saver.lostFields.length}
					{saver.lostFields.length === 1 ? '1 change' : `${saver.lostFields.length} changes`} made here could not be saved.
				{/if}
			</div>
		{:else if lock.mode === 'signed' && lock.signature}
			<details class="lockbar signed" open={lock.signature.addenda.length > 0 || undefined}>
				<summary>
					Signed by {lock.signature.signedBy} on {when(lock.signature.signedAt)}. The exam is final; corrections go in an addendum.
					{#if data.user.role !== 'admin'}<span class="link">Add addendum</span>{/if}
					{#if lock.signature.addenda.length}<span class="count">{lock.signature.addenda.length} addend{lock.signature.addenda.length === 1 ? 'um' : 'a'}</span>{/if}
				</summary>
				{#if lock.signature.addenda.length}
					<ol class="addenda">
						{#each lock.signature.addenda as a, i (i)}
							<li><span class="by">{a.by} · {when(a.at)}</span><p>{a.text}</p></li>
						{/each}
					</ol>
				{/if}
				{#if data.user.role !== 'admin'}
					<form
						class="addendum"
						onsubmit={(e) => {
							e.preventDefault();
							addAddendum();
						}}
					>
						<label for="addendum">Addendum</label>
						<textarea id="addendum" rows="2" maxlength="4000" bind:value={addendum} placeholder="Added after signing, saved with your name and the time"></textarea>
						<button type="submit" disabled={addingAddendum || !addendum.trim()}>{addingAddendum ? 'Adding…' : 'Add addendum'}</button>
						{#if addendumError}<span class="err" role="alert">{addendumError}</span>{/if}
					</form>
				{/if}
			</details>
		{/if}
	</div>
	<div class="body">
		<SectionRail current={section} {findings} onselect={(id) => (section = id)} />
		<main id="exam" tabindex="-1">
			{#if sec || custom}
				<div class="modes" role="group" aria-label="Helper panel">
					{#each MODES as m (m.id)}
						<button
							type="button"
							aria-pressed={activeMode === m.id}
							aria-keyshortcuts="Alt+{m.key.toUpperCase()}"
							title="Alt+{m.key.toUpperCase()}"
							onclick={() => (mode = m.id)}
						>
							{m.label}{#if m.id === 'priors' && data.priors.length}<span class="count">{data.priors.length}</span>{/if}
						</button>
					{/each}
				</div>
				<div class="work" class:with-aside={activeMode !== 'text'} class:wide-aside={activeMode === 'draw'} class:readonly>
					<!-- Read-only: the editing area is inert (nothing can be typed or clicked); reading stays possible. -->
					<div class="editor" inert={readonly}>
					{#if sec}
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
					{:else}
						<CustomSection
							{section}
							context={{ patientId: data.patient.id, encounterId: data.encounter.id }}
							{findings}
							{preview}
							{copied}
							defaults={data.defaults}
							onedit={edit}
							oncommit={commit}
							onprintrx={printRx}
							{readonly}
						/>
					{/if}
					</div>
					{#if activeMode === 'qp' && sec}
						<aside class="aside" aria-label="Quick picks" inert={readonly}>
							<QuickPickPanel {sec} {picks} onpick={pick} />
						</aside>
					{:else if activeMode === 'draw'}
						<aside class="aside" aria-label="Drawing" inert={readonly}>
							<DrawingPanel patientId={data.patient.id} encounterId={data.encounter.id} zone={section} />
						</aside>
					{:else if activeMode === 'priors' && sec}
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
					<p>This section isn't built yet. Keys <kbd>1</kbd>–<kbd>8</kbd> are ready to try.</p>
				</div>
			{/if}
		</main>
	</div>
	<div class="bar" inert={readonly}>
		<ShorthandBar bind:this={bar} bind:text={shorthand} result={parsed} onsubmit={submitShorthand} />
	</div>
</div>

<dialog class="confirm" bind:this={signDialog} aria-labelledby="sign-title">
	<h2 id="sign-title">Sign this exam?</h2>
	<p>
		{data.patient.name} · {data.encounter.visitType} · <span class="num">{data.encounter.date}</span>
	</p>
	<p>Signing locks, for everyone:</p>
	<ul>
		<li>the exam findings ({recorded} recorded)</li>
		<li>the drawings</li>
		<li>the Impression/Plan and orders</li>
	</ul>
	<p class="hint">Later corrections are added as addenda with your name and the time. A signed exam cannot be unsigned.</p>
	{#if signError}<p class="err" role="alert">{signError}</p>{/if}
	<div class="actions">
		<button type="button" onclick={() => signDialog?.close()} disabled={signing}>Cancel</button>
		<button type="button" class="primary" onclick={confirmSign} disabled={signing}>{signing ? 'Signing…' : `Sign as ${data.user.displayName}`}</button>
	</div>
</dialog>

{#if notice}
	<div class="toast error" role="alert">{notice}</div>
{:else if undoEntry}
	<div class="toast" role="status">
		<span>{undoEntry.label}{historyNote ? ` · ${historyNote}` : ''}</span>
		<button type="button" onclick={undo}>Undo <kbd>Ctrl Z</kbd></button>
	</div>
{:else if historyNote}
	<div class="toast" role="status">{historyNote}</div>
{/if}

<style>
	.top {
		position: sticky;
		top: 0;
		z-index: 20;
	}
	.lockbar {
		padding: var(--space-2) var(--space-4);
		border-bottom: 1px solid var(--hairline);
		background: var(--surface-2);
	}
	.lockbar.warn {
		color: var(--warn);
		font-weight: var(--weight-semibold);
	}
	.lockbar summary {
		cursor: pointer;
		color: var(--text-2);
	}
	.lockbar summary .link {
		color: var(--accent);
		margin-left: var(--space-2);
	}
	.lockbar[open] summary .link {
		display: none;
	}
	.addenda {
		margin: var(--space-2) 0 0;
		padding-left: var(--space-5);
		max-width: var(--measure-prose);
	}
	.addenda .by {
		color: var(--text-2);
		font-size: var(--text-xs);
	}
	.addenda p {
		margin: 0 0 var(--space-2);
		white-space: pre-wrap;
	}
	.addendum {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: var(--space-2);
		margin-top: var(--space-2);
		max-width: var(--measure-prose);
	}
	.addendum label {
		flex-basis: 100%;
		font-size: var(--text-xs);
		color: var(--text-2);
	}
	.addendum textarea {
		font: inherit;
		flex: 1;
		min-width: 16em;
	}
	.err {
		color: var(--danger);
	}
	/* Read-only: the inert editing area is dimmed slightly so the state is visible at a glance. */
	.work.readonly .editor {
		opacity: 0.85;
	}
	.bar[inert] {
		opacity: 0.6;
	}
	.confirm {
		max-width: 28rem;
		border: 1px solid var(--hairline);
		border-radius: var(--radius-2);
		background: var(--surface-3);
		color: var(--text-1);
		box-shadow: var(--shadow-overlay);
		padding: var(--space-4) var(--space-5);
	}
	.confirm::backdrop {
		background: rgb(0 0 0 / 0.35);
	}
	.confirm h2 {
		font-size: var(--text-md);
		margin: 0 0 var(--space-2);
	}
	.confirm ul {
		margin: 0 0 var(--space-2);
		padding-left: var(--space-5);
	}
	.confirm .hint {
		color: var(--text-2);
	}
	.confirm .actions {
		display: flex;
		justify-content: flex-end;
		gap: var(--space-2);
		margin-top: var(--space-3);
	}
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
	.work.with-aside.wide-aside {
		grid-template-columns: minmax(0, 1fr) 484px;
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
		.work.with-aside,
		.work.with-aside.wide-aside {
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
	.print-hint {
		display: none;
	}
	/* Printing the editing screen from the browser menu would waste paper; point to the report instead. */
	@media print {
		.frame,
		.confirm,
		.toast,
		.skip {
			display: none;
		}
		.print-hint {
			display: block;
			font-size: 14pt;
			margin: 1in;
		}
	}
	.toast.error {
		color: var(--danger);
		padding-right: var(--space-4);
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
