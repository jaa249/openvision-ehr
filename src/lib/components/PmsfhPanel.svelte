<script lang="ts">
	// Patient history (PMSFH) summary + editor, embedded in the HPI section (spec §1.3, §7.2).
	// Loads and saves through /api/patients/[pid]/encounters/[eid]/history (patient-level data).
	import { tick } from 'svelte';
	import {
		FH_NEGATIVE,
		FH_ROWS,
		ISSUE_TYPE_DEF,
		ISSUE_TYPE_DEFS,
		OCCURRENCES,
		OUTCOMES,
		SOCIAL_HABITS,
		SOCIAL_STATUSES,
		SOCIAL_TEXT
	} from '#lib/history/lists.ts';
	import { chronicTexts, issueLine, summarizeFamily, summarizeSocial, visibleIssues } from '#lib/history/summary.ts';
	import { historyBus, publishAllergyStatus } from '#lib/history/bus.svelte.ts';
	import type { Issue, IssueType, PmsfhResponse } from '#lib/history/types.ts';

	let {
		patientId,
		encounterId,
		onchronic
	}: {
		patientId: number;
		encounterId: number;
		/** Chronic issue texts ("title codes\ncomments"), sent whenever the issue list loads or changes (§7.4). */
		onchronic?: (texts: string[]) => void;
	} = $props();

	const url = $derived(`/api/patients/${patientId}/encounters/${encounterId}/history`);

	let data = $state<PmsfhResponse | null>(null);
	let loadError = $state('');
	let busy = $state(false);
	/** Screen-reader announcement after each save. */
	let status = $state('');

	// ---------- loading (on mount, on visit change, and whenever the shared bus bumps) ----------
	let requestId = 0;
	function received(next: PmsfhResponse) {
		data = next;
		onchronic?.(chronicTexts(next.issues));
		publishAllergyStatus(patientId, next.allergyStatus);
	}
	async function load(target: string) {
		const id = ++requestId;
		try {
			const res = await fetch(target);
			if (!res.ok) throw new Error(String(res.status));
			const next = (await res.json()) as PmsfhResponse;
			if (id !== requestId) return;
			received(next);
			loadError = '';
		} catch {
			if (id === requestId) loadError = 'Past history could not be loaded. Check the connection.';
		}
	}
	$effect(() => {
		void historyBus.version;
		load(url);
	});

	/** POSTs one action; returns field errors on 400 (shown inline), or null on success. */
	async function post(body: Record<string, unknown>, done: string): Promise<Record<string, string> | null> {
		busy = true;
		try {
			const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
			if (res.status === 400) {
				const j = await res.json().catch(() => ({}));
				return j.errors ?? { form: j.message ?? 'Not saved: check the entries.' };
			}
			if (!res.ok) return { form: res.status === 404 ? 'This visit or entry no longer exists.' : 'Not saved: server error. Try again.' };
			++requestId; // a slower GET in flight must not overwrite this fresher answer
			received((await res.json()) as PmsfhResponse);
			status = done;
			return null;
		} catch {
			return { form: 'Not saved: check the connection and try again.' };
		} finally {
			busy = false;
		}
	}

	// ---------- summary (§1.3) ----------
	const SUMMARY_ORDER: IssueType[] = ['POH', 'POS', 'EYEMED', 'PMH', 'SURG', 'MED', 'ALLERGY'];
	const family = $derived(data ? summarizeFamily(data.family) : { state: 'unrecorded' as const });
	const social = $derived(data ? summarizeSocial(data.social) : []);
	const fmtDate = (iso: string) => iso.slice(0, 10);

	// ---------- editor ----------
	type Mode = IssueType | 'FH' | 'SOCIAL';
	interface Draft {
		id: number | null;
		type: IssueType;
		title: string;
		codes: string;
		begin: string;
		end: string;
		occurrence: string;
		reaction: string;
		outcome: string;
		provider: string;
		comments: string;
	}
	let mode = $state<Mode | null>(null);
	let draft = $state<Draft>(blank('POH'));
	let fhDraft = $state<Record<string, string>>({});
	let shDraft = $state<Record<string, string>>({});
	let errors = $state<Record<string, string>>({});
	let confirmDelete = $state(false);
	let opener: HTMLElement | null = null;
	let editorEl = $state<HTMLElement | null>(null);

	const def = $derived(ISSUE_TYPE_DEF.get(draft.type)!);
	/** Editing a saved issue keeps its type (only the Eye medication box moves a med between lists). */
	const editing = $derived(draft.id !== null && mode !== null && mode !== 'FH' && mode !== 'SOCIAL');
	const picks = $derived(data && mode && mode !== 'FH' && mode !== 'SOCIAL' ? (data.quickPicks[mode] ?? []) : []);

	function blank(type: IssueType): Draft {
		return { id: null, type, title: '', codes: '', begin: '', end: '', occurrence: '', reaction: '', outcome: '', provider: '', comments: '' };
	}
	function toDraft(i: Issue): Draft {
		const { active: _active, ...rest } = i;
		return rest;
	}
	function today(): string {
		const d = new Date();
		const p = (n: number) => String(n).padStart(2, '0');
		return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
	}

	/** Opens the editor on the chosen type (FIX: never on a different type's field set), or on an issue to edit it. */
	async function open(next: Mode, issue?: Issue, from?: EventTarget | null) {
		opener = (from as HTMLElement | null) ?? (document.activeElement as HTMLElement | null);
		errors = {};
		confirmDelete = false;
		mode = next;
		if (next === 'FH') fhDraft = { ...(data?.family ?? {}) };
		else if (next === 'SOCIAL') shDraft = { ...(data?.social ?? {}) };
		else draft = issue ? toDraft(issue) : blank(next);
		await tick();
		editorEl?.querySelector<HTMLElement>('[data-autofocus]')?.focus();
	}
	/** Switching type in the radio row keeps what was typed, so a mis-chosen type costs nothing. */
	function switchType(next: Mode) {
		if (next === mode) return;
		errors = {};
		if (next === 'FH' || next === 'SOCIAL') {
			open(next);
			return;
		}
		if (mode === 'FH' || mode === 'SOCIAL') draft = blank(next);
		else draft = { ...draft, type: next };
		mode = next;
	}
	function close() {
		mode = null;
		errors = {};
		confirmDelete = false;
		const back = opener;
		opener = null;
		tick().then(() => (back?.isConnected ? back : null)?.focus());
	}

	function pickTitle(title: string, codes: string) {
		draft.title = title;
		if (def.codes && codes) draft.codes = codes;
		errors.title = '';
	}
	function setActive(on: boolean) {
		draft.end = on ? '' : today();
	}
	function setOutcome(v: string) {
		draft.outcome = v;
		if (v === 'resolved' && def.end && !draft.end) draft.end = today();
	}

	/** Client-side checks mirror the server's (§7.2): title required, end not before begin. */
	function check(): Record<string, string> {
		const e: Record<string, string> = {};
		if (!draft.title.trim()) e.title = `${def.titleLabel} is required.`;
		if (def.end && draft.begin && draft.end && draft.end < draft.begin) e.end = `${def.end} cannot be before ${def.begin?.toLowerCase()}.`;
		return e;
	}

	async function saveIssue(ev: SubmitEvent) {
		ev.preventDefault();
		const e = check();
		if (Object.keys(e).length) {
			errors = e;
			return;
		}
		const res = await post({ action: 'saveIssue', issue: { ...draft } }, `Saved ${draft.title.trim()}.`);
		if (res) errors = res;
		else close();
	}
	async function removeIssue() {
		if (draft.id === null) return;
		const res = await post({ action: 'deleteIssue', id: draft.id }, `Deleted ${draft.title}.`);
		if (res) errors = res;
		else close();
	}
	async function saveFamily(ev: SubmitEvent) {
		ev.preventDefault();
		const sent = Object.fromEntries(FH_ROWS.filter((r) => r.group !== 'summary').map((r) => [r.key, fhDraft[r.key] ?? '']));
		const res = await post({ action: 'family', data: sent }, 'Family history saved.');
		if (res) errors = res;
		else close();
	}
	async function saveSocial(ev: SubmitEvent) {
		ev.preventDefault();
		const keys = [...SOCIAL_TEXT.map((f) => f.key), ...SOCIAL_HABITS.flatMap((h) => [h.key, `${h.key}_status`, `${h.key}_date`])];
		const sent = Object.fromEntries(keys.map((k) => [k, shDraft[k] ?? '']));
		const res = await post({ action: 'social', data: sent }, 'Social history saved.');
		if (res) errors = res;
		else close();
	}
	let nkdaError = $state('');
	async function setNkda(on: boolean) {
		const res = await post({ action: 'nkda', on }, on ? 'Marked no known allergies.' : 'No known allergies unmarked.');
		nkdaError = res ? (res.nkda ?? res.form ?? Object.values(res)[0]) : '';
	}

	function onEditorKey(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.stopPropagation();
			close();
		}
	}
	const err = (k: string) => (errors[k] ? `${k}-err-${encounterId}` : undefined);
	const id = (k: string) => `pm-${k}-${encounterId}`;
</script>

{#snippet fieldError(k: string)}
	{#if errors[k]}<p class="err" id="{k}-err-{encounterId}">{errors[k]}</p>{/if}
{/snippet}

<section class="pmsfh" aria-labelledby="pmsfh-h-{encounterId}">
	<div class="head">
		<h3 id="pmsfh-h-{encounterId}">Past history</h3>
		{#if busy}<span class="busy">Saving…</span>{/if}
	</div>
	<p class="visually-hidden" role="status" aria-live="polite">{status}</p>
	{#if loadError}
		<p class="err" role="alert">{loadError} <button type="button" onclick={() => load(url)}>Retry</button></p>
	{/if}

	{#if mode}
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<div class="editor" bind:this={editorEl} role="group" aria-label="Edit past history" onkeydown={onEditorKey}>
			<div class="types" role="radiogroup" aria-label="History type">
				{#each ISSUE_TYPE_DEFS as d (d.type)}
					<button
						type="button"
						role="radio"
						aria-checked={mode === d.type}
						title={d.label}
						onclick={() => switchType(d.type)}
						disabled={editing && d.type !== draft.type}
					>{d.short}</button>
				{/each}
				<button type="button" role="radio" aria-checked={mode === 'FH'} title="Family history" onclick={() => switchType('FH')} disabled={editing}>FH</button>
				<button type="button" role="radio" aria-checked={mode === 'SOCIAL'} title="Social history" onclick={() => switchType('SOCIAL')} disabled={editing}>Social</button>
			</div>

			{#if mode === 'FH'}
				<form onsubmit={saveFamily} novalidate>
					<h4>Family history</h4>
					<div class="fh">
						{#each FH_ROWS.filter((r) => r.group !== 'summary') as r, i (r.key)}
							{@const neg = (fhDraft[r.key] ?? '').toLowerCase() === FH_NEGATIVE}
							<label class="fh-label" for={id(`fh-${r.key}`)}>{r.label}</label>
							<button
								type="button"
								class="neg"
								aria-pressed={neg}
								aria-label="{r.label}: negative"
								onclick={() => (fhDraft[r.key] = neg ? '' : FH_NEGATIVE)}
							>Neg</button>
							<input
								id={id(`fh-${r.key}`)}
								value={neg ? '' : (fhDraft[r.key] ?? '')}
								placeholder={neg ? 'Negative' : 'Who, e.g. mother'}
								maxlength="200"
								autocomplete="off"
								data-autofocus={i === 0 ? '' : undefined}
								oninput={(e) => (fhDraft[r.key] = e.currentTarget.value)}
								aria-invalid={errors[r.key] ? 'true' : undefined}
							/>
						{/each}
					</div>
					{#each Object.entries(errors) as [k, m] (k)}{#if m}<p class="err">{m}</p>{/if}{/each}
					<div class="actions">
						<button type="submit" class="primary" disabled={busy}>Save</button>
						<button type="button" onclick={close}>Cancel</button>
					</div>
				</form>
			{:else if mode === 'SOCIAL'}
				<form onsubmit={saveSocial} novalidate>
					<h4>Social history</h4>
					<div class="grid2">
						{#each SOCIAL_TEXT as f, i (f.key)}
							<div class="field">
								<label for={id(`sh-${f.key}`)}>{f.label}</label>
								<input
									id={id(`sh-${f.key}`)}
									bind:value={shDraft[f.key]}
									maxlength="200"
									autocomplete="off"
									data-autofocus={i === 0 ? '' : undefined}
									aria-invalid={errors[f.key] ? 'true' : undefined}
									aria-describedby={err(f.key)}
								/>
								{@render fieldError(f.key)}
							</div>
						{/each}
					</div>
					{#each SOCIAL_HABITS as h (h.key)}
						<fieldset class="habit">
							<legend>{h.label}</legend>
							<select bind:value={shDraft[`${h.key}_status`]} aria-label="{h.label} status" aria-invalid={errors[`${h.key}_status`] ? 'true' : undefined}>
								<option value="">Status</option>
								{#each SOCIAL_STATUSES as s (s.value)}<option value={s.value}>{s.label}</option>{/each}
							</select>
							<input bind:value={shDraft[h.key]} aria-label="{h.label} note" placeholder="Note" maxlength="200" autocomplete="off" />
							<input
								type="date"
								bind:value={shDraft[`${h.key}_date`]}
								aria-label="{h.label} date"
								aria-invalid={errors[`${h.key}_date`] ? 'true' : undefined}
								aria-describedby={err(`${h.key}_date`)}
							/>
							{@render fieldError(`${h.key}_status`)}
							{@render fieldError(`${h.key}_date`)}
						</fieldset>
					{/each}
					{@render fieldError('form')}
					<div class="actions">
						<button type="submit" class="primary" disabled={busy}>Save</button>
						<button type="button" onclick={close}>Cancel</button>
					</div>
				</form>
			{:else}
				<form onsubmit={saveIssue} novalidate>
					<h4>{draft.id === null ? 'Add to' : 'Edit'} {def.label.toLowerCase()}</h4>
					{#if picks.length}
						<div class="picks" role="group" aria-label="Common {def.label.toLowerCase()}">
							{#each picks as p (p.title)}
								<button type="button" class="chip" aria-pressed={draft.title.toLowerCase() === p.title.toLowerCase()} onclick={() => pickTitle(p.title, p.codes)}>{p.title}</button>
							{/each}
						</div>
					{/if}
					<div class="grid2">
						<div class="field wide">
							<label for={id('title')}>{def.titleLabel}</label>
							<input
								id={id('title')}
								bind:value={draft.title}
								maxlength="120"
								autocomplete="off"
								required
								data-autofocus=""
								aria-invalid={errors.title ? 'true' : undefined}
								aria-describedby={err('title')}
							/>
							{@render fieldError('title')}
						</div>
						{#if def.codes}
							<div class="field">
								<label for={id('codes')}>Diagnosis code <span class="opt">(; between codes)</span></label>
								<input id={id('codes')} bind:value={draft.codes} maxlength="200" autocomplete="off" aria-invalid={errors.codes ? 'true' : undefined} aria-describedby={err('codes')} />
								{@render fieldError('codes')}
							</div>
						{/if}
						{#if def.reaction}
							<div class="field">
								<label for={id('reaction')}>Reaction</label>
								<input id={id('reaction')} bind:value={draft.reaction} maxlength="120" autocomplete="off" aria-invalid={errors.reaction ? 'true' : undefined} aria-describedby={err('reaction')} />
								{@render fieldError('reaction')}
							</div>
						{/if}
						{#if def.begin}
							<div class="field">
								<label for={id('begin')}>{def.begin}</label>
								<input id={id('begin')} type="date" bind:value={draft.begin} aria-invalid={errors.begin ? 'true' : undefined} aria-describedby={err('begin')} />
								{@render fieldError('begin')}
							</div>
						{/if}
						{#if def.end}
							<div class="field">
								<label for={id('end')}>{def.end}</label>
								<input id={id('end')} type="date" bind:value={draft.end} min={draft.begin || undefined} aria-invalid={errors.end ? 'true' : undefined} aria-describedby={err('end')} />
								{@render fieldError('end')}
							</div>
						{/if}
						{#if def.occurrence}
							<div class="field">
								<label for={id('occ')}>Course</label>
								<select id={id('occ')} bind:value={draft.occurrence} aria-invalid={errors.occurrence ? 'true' : undefined} aria-describedby={err('occurrence')}>
									{#each OCCURRENCES as o (o.value)}<option value={o.value}>{o.label}</option>{/each}
								</select>
								{@render fieldError('occurrence')}
							</div>
						{/if}
						{#if def.outcome}
							<div class="field">
								<label for={id('outcome')}>Outcome</label>
								<select id={id('outcome')} value={draft.outcome} onchange={(e) => setOutcome(e.currentTarget.value)} aria-invalid={errors.outcome ? 'true' : undefined} aria-describedby={err('outcome')}>
									{#each OUTCOMES as o (o.value)}<option value={o.value}>{o.label}</option>{/each}
								</select>
								{@render fieldError('outcome')}
							</div>
						{/if}
						{#if def.provider}
							<div class="field">
								<label for={id('provider')}>{def.provider}</label>
								<input
									id={id('provider')}
									bind:value={draft.provider}
									maxlength="80"
									autocomplete="off"
									title={draft.type === 'POH' ? 'Co-managing or referring provider' : undefined}
									aria-invalid={errors.provider ? 'true' : undefined}
									aria-describedby={err('provider')}
								/>
								{@render fieldError('provider')}
							</div>
						{/if}
					</div>
					{#if def.activeBox || def.eyeMedBox}
						<div class="checks">
							{#if def.activeBox}
								<label class="check"><input type="checkbox" checked={!draft.end || draft.end > today()} onchange={(e) => setActive(e.currentTarget.checked)} /> Active</label>
							{/if}
							{#if def.eyeMedBox}
								<label class="check"><input type="checkbox" checked={draft.type === 'EYEMED'} onchange={(e) => switchType(e.currentTarget.checked ? 'EYEMED' : 'MED')} /> Eye medication</label>
							{/if}
						</div>
					{/if}
					<div class="field">
						<label for={id('comments')}>Comments</label>
						<textarea id={id('comments')} bind:value={draft.comments} rows="2" maxlength="2000" aria-invalid={errors.comments ? 'true' : undefined} aria-describedby={err('comments')}></textarea>
						{@render fieldError('comments')}
					</div>
					{@render fieldError('form')}
					{@render fieldError('type')}
					<div class="actions">
						<button type="submit" class="primary" disabled={busy}>Save</button>
						{#if draft.id !== null}
							{#if confirmDelete}
								<span class="confirm" role="group" aria-label="Confirm delete">
									Delete {draft.title}?
									<button type="button" class="danger" onclick={removeIssue} disabled={busy}>Yes, delete</button>
									<button type="button" onclick={() => (confirmDelete = false)}>Keep</button>
								</span>
							{:else}
								<button type="button" class="danger-outline" onclick={() => (confirmDelete = true)}>Delete</button>
							{/if}
						{/if}
						<button type="button" onclick={close}>Cancel</button>
					</div>
				</form>
			{/if}
		</div>
	{/if}

	{#if data}
		<div class="summary">
			{#each SUMMARY_ORDER as type (type)}
				{@const d = ISSUE_TYPE_DEF.get(type)!}
				{@const items = visibleIssues(data.issues, type)}
				<div class="block" class:allergy={type === 'ALLERGY'}>
					<div class="bhead">
						<h4 title={d.label}>{d.short}</h4>
						<button type="button" class="add" aria-label="Add to {d.label.toLowerCase()}" onclick={(e) => open(type, undefined, e.currentTarget)}>Add</button>
					</div>
					{#if items.length}
						<ul>
							{#each items as i (i.id)}
								<li>
									<button
										type="button"
										class="item"
										class:inactive={!i.active}
										onclick={(e) => open(type, i, e.currentTarget)}
										aria-label="Edit {i.title}{i.active ? '' : ' (inactive)'}"
									>{issueLine(i)}{#if !i.active}<span class="tag"> inactive</span>{/if}</button>
								</li>
							{/each}
						</ul>
					{:else if type === 'ALLERGY'}
						{#if data.allergyStatus.kind === 'none'}
							<p class="nkda">NKDA <span class="by">confirmed by {data.allergyStatus.confirmedBy}, <span class="num nowrap">{fmtDate(data.allergyStatus.confirmedAt)}</span></span></p>
						{:else}
							<p class="unknown">Not recorded</p>
						{/if}
						<label class="check">
							<input type="checkbox" checked={data.allergyStatus.kind === 'none'} disabled={busy} onchange={(e) => setNkda(e.currentTarget.checked)} />
							No known allergies
						</label>
					{:else}
						<p class="none">None</p>
					{/if}
					{#if type === 'ALLERGY' && nkdaError}<p class="err" role="alert">{nkdaError}</p>{/if}
				</div>
			{/each}

			<div class="block">
				<div class="bhead">
					<h4 title="Family history">FH</h4>
					<button type="button" class="add" aria-label="Edit family history" onclick={(e) => open('FH', undefined, e.currentTarget)}>Edit</button>
				</div>
				{#if family.state === 'positive'}
					<ul>{#each family.lines as l (l)}<li class="text">{l}</li>{/each}</ul>
				{:else if family.state === 'negative'}
					<p class="none">Negative</p>
				{:else}
					<p class="none">Not recorded</p>
				{/if}
			</div>

			<div class="block">
				<div class="bhead">
					<h4>Social</h4>
					<button type="button" class="add" aria-label="Edit social history" onclick={(e) => open('SOCIAL', undefined, e.currentTarget)}>Edit</button>
				</div>
				{#if social.length}
					<ul>{#each social as l (l)}<li class="text">{l}</li>{/each}</ul>
				{:else}
					<p class="none">Not documented</p>
				{/if}
			</div>
		</div>
	{:else if !loadError}
		<p class="none">Loading past history…</p>
	{/if}
</section>

<style>
	.pmsfh {
		container-type: inline-size;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		min-width: 0;
	}
	.head {
		display: flex;
		align-items: baseline;
		gap: var(--space-3);
	}
	h3 {
		margin: 0;
		font-size: var(--text-md);
		font-weight: var(--weight-semibold);
	}
	h4 {
		margin: 0;
		font-size: var(--text-xs);
		font-weight: var(--weight-semibold);
		color: var(--text-3);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	.editor h4 {
		font-size: var(--text-sm);
		color: var(--text-1);
		text-transform: none;
		letter-spacing: 0;
	}
	.busy,
	.opt,
	.by,
	.tag {
		color: var(--text-3);
		font-size: var(--text-xs);
		font-weight: var(--weight-regular);
	}
	button,
	input,
	select {
		min-height: max(40px, var(--target-min));
	}
	input,
	select,
	textarea {
		font: inherit;
		color: var(--text-1);
		background: var(--surface-1);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-1);
		padding: 0 var(--space-2);
		width: 100%;
		min-width: 0;
	}
	textarea {
		padding: var(--space-2);
		resize: vertical;
	}
	input[type='checkbox'] {
		width: 20px;
		min-height: 20px;
		height: 20px;
		margin: 0;
		accent-color: var(--accent);
	}
	[aria-invalid='true'] {
		border-color: var(--danger);
	}
	.err {
		margin: 0;
		font-size: var(--text-xs);
		color: var(--danger);
		font-weight: var(--weight-semibold);
	}

	/* ---------- summary: two columns when the panel is wide enough (§1.3) ---------- */
	.summary {
		columns: 1;
		column-gap: var(--space-5);
	}
	@container (min-width: 460px) {
		.summary {
			columns: 2;
		}
	}
	.block {
		break-inside: avoid;
		padding: var(--space-1) 0 var(--space-2);
		border-bottom: 1px solid var(--hairline);
	}
	.bhead {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: var(--space-2);
	}
	.add {
		font-size: var(--text-xs);
		color: var(--accent);
		background: transparent;
		border-color: transparent;
		padding: 0 var(--space-2);
		min-width: 48px;
	}
	.add:hover {
		background: var(--accent-soft);
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.item {
		display: block;
		width: 100%;
		text-align: left;
		background: transparent;
		border-color: transparent;
		padding: var(--space-1) var(--space-2);
		margin-left: calc(-1 * var(--space-2));
		overflow-wrap: anywhere;
		line-height: var(--leading-tight);
	}
	.item:hover {
		background: var(--surface-2);
	}
	.item.inactive {
		color: var(--text-3);
	}
	.allergy .item {
		color: var(--danger);
		font-weight: var(--weight-semibold);
	}
	.text {
		padding: 2px 0;
		overflow-wrap: anywhere;
	}
	.none,
	.nkda,
	.unknown {
		margin: var(--space-1) 0;
	}
	.none {
		color: var(--text-2);
	}
	.nowrap {
		white-space: nowrap;
	}
	.unknown {
		color: var(--warn);
		font-weight: var(--weight-semibold);
	}
	.check {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		min-height: max(40px, var(--target-min));
		cursor: pointer;
	}

	/* ---------- editor ---------- */
	.editor {
		background: var(--surface-2);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-2);
		padding: var(--space-3);
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
	.types {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1);
	}
	.types button {
		font-size: var(--text-xs);
		font-weight: var(--weight-semibold);
		padding: 0 var(--space-2);
		min-width: 48px;
	}
	.types button[aria-checked='true'],
	.chip[aria-pressed='true'],
	.neg[aria-pressed='true'] {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--accent-text);
	}
	form {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
	.picks {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1);
	}
	.chip {
		font-size: var(--text-xs);
		border-radius: var(--radius-pill);
		padding: 0 var(--space-3);
	}
	.grid2 {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 11em), 1fr));
		gap: var(--space-2) var(--space-3);
	}
	.wide {
		grid-column: 1 / -1;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		min-width: 0;
	}
	label {
		font-weight: var(--weight-semibold);
	}
	.checks {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-4);
	}
	.check {
		font-weight: var(--weight-regular);
	}
	.fh {
		display: grid;
		grid-template-columns: minmax(6em, auto) auto minmax(0, 1fr);
		gap: var(--space-1) var(--space-2);
		align-items: center;
	}
	.fh-label {
		font-weight: var(--weight-regular);
	}
	.neg {
		font-size: var(--text-xs);
		min-width: 48px;
	}
	.habit {
		margin: 0;
		padding: var(--space-2) var(--space-3) var(--space-3);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-1);
		display: grid;
		grid-template-columns: minmax(0, 7.5em) minmax(0, 1fr) minmax(0, 10em);
		gap: var(--space-2);
		min-width: 0;
	}
	.habit legend {
		font-weight: var(--weight-semibold);
		padding: 0 var(--space-1);
	}
	.habit .err {
		grid-column: 1 / -1;
	}
	@container (max-width: 380px) {
		.habit {
			grid-template-columns: 1fr 1fr;
		}
		.habit input:not([type='date']) {
			grid-column: 1 / -1;
			grid-row: 1;
		}
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
	}
	.confirm {
		display: inline-flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		color: var(--danger);
		font-weight: var(--weight-semibold);
	}
	.primary {
		background: var(--accent);
		color: var(--accent-text);
		border-color: var(--accent);
		font-weight: var(--weight-semibold);
	}
	.primary:hover {
		background: var(--accent);
		filter: brightness(1.1);
	}
	.danger {
		background: var(--danger);
		border-color: var(--danger);
		color: var(--surface-1);
		font-weight: var(--weight-semibold);
	}
	.danger:hover {
		background: var(--danger);
		filter: brightness(1.1);
	}
	.danger-outline {
		color: var(--danger);
		border-color: var(--danger);
	}
</style>
