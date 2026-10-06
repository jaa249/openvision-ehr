<script lang="ts">
	// Refraction row (spec §1.5): current glasses #1-#5 (W), manifest + cycloplegic (MR/CR), autorefraction (AR)
	// and contact lens (CTL). Field formatting on leaving a box and the transpose button follow §8.7;
	// print buttons open the spectacle / contact lens Rx (§12).
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { FIELD_BY_ID } from '#lib/exam/catalog.ts';
	import {
		COL_LABEL,
		CTL_BRANDS,
		CTL_MANUFACTURERS,
		CTL_SUPPLIERS,
		H_BASES,
		LENS_MATERIALS,
		LENS_TREATMENTS,
		RX_TYPES,
		V_BASES,
		W_SLOTS,
		WET_METHODS,
		eyeId,
		formatAxis,
		formatPower,
		formatUpper,
		isQuarterStep,
		kindOf,
		ouId,
		sourceFieldIds,
		sourceLabel,
		splitList,
		transpose,
		type CylSign,
		type EyeCol,
		type RxSource
	} from '#lib/exam/sections/refraction.ts';
	import type { Findings } from '#lib/shorthand/parse.ts';
	import type { PanelProps } from './types.ts';
	import { defaultPrefs, type PrefKey, type Prefs as StoredPrefs } from '#lib/prefs/keys.ts';
	import { loadPrefs, savePrefs } from '#lib/prefs/client.ts';

	let {
		findings,
		preview,
		copied,
		onedit,
		oncommit,
		onprintrx
	}: PanelProps & { onprintrx?: (source: RxSource) => void } = $props();

	type Eye = 'OD' | 'OS';
	const EYES: Eye[] = ['OD', 'OS'];

	// ---------- per-user panel prefs (§1.7 / §1.5: visibility follows prefs and clicks, never data) ----------
	// Stored per user on the server (/api/prefs); see #lib/prefs/client.ts for the offline fallback.
	interface Prefs {
		W: boolean;
		MR: boolean;
		AR: boolean;
		CTL: boolean;
		wide: boolean;
		cyl: CylSign;
	}
	const PREF_KEY = {
		W: 'refraction.W',
		MR: 'refraction.MR',
		AR: 'refraction.AR',
		CTL: 'refraction.CTL',
		wide: 'refraction.wide',
		cyl: 'cylinder'
	} as const satisfies Record<keyof Prefs, PrefKey>;
	const fromStore = (p: StoredPrefs): Prefs => ({
		W: p['refraction.W'],
		MR: p['refraction.MR'],
		AR: p['refraction.AR'],
		CTL: p['refraction.CTL'],
		wide: p['refraction.wide'],
		cyl: p.cylinder
	});
	let prefs = $state<Prefs>(fromStore(defaultPrefs()));
	onMount(() => {
		loadPrefs().then((p) => (prefs = fromStore(p)));
	});
	function setPref<K extends keyof Prefs>(k: K, v: Prefs[K]) {
		prefs = { ...prefs, [k]: v };
		void savePrefs({ [PREF_KEY[k]]: v });
	}

	/** Glasses slots revealed by "Additional Rx" this session; slots with values always show (§1.5). */
	let revealed = $state(new Set<number>());
	let status = $state('');
	let statusTimer: ReturnType<typeof setTimeout> | undefined;
	function say(msg: string) {
		status = msg;
		clearTimeout(statusTimer);
		statusTimer = setTimeout(() => (status = ''), 6000);
	}

	const val = (id: string) => findings[id]?.value ?? '';
	const has = (source: RxSource) => sourceFieldIds(source).some((id) => val(id).trim() && id !== ouId(source, 'RX_TYPE'));
	const writable = (id: string) => FIELD_BY_ID.has(id);

	const slotVisible = (n: number) => (n === 1 ? prefs.W : has(`W${n}` as RxSource) || revealed.has(n));
	const visibleSlots = $derived(W_SLOTS.filter((n) => slotVisible(n)));
	const nextSlot = $derived(W_SLOTS.find((n) => n > 1 && !slotVisible(n)));

	function cell(id: string) {
		const ghost = preview?.[id];
		const real = findings[id];
		return {
			value: ghost?.value ?? real?.value ?? '',
			ghost: !!ghost,
			isDefault: !ghost && !!real?.isDefault,
			copied: !ghost && copied.has(id)
		};
	}

	// ---------- column layouts ----------
	type Fmt = 'sph' | 'cyl' | 'axis' | 'add' | 'upper' | 'text';
	interface Col {
		col: EyeCol;
		head: string;
		fmt: Fmt;
		options?: string[];
		list?: string;
		wide?: boolean;
	}
	const C = {
		SPH: { col: 'SPH', head: 'Sph', fmt: 'sph' },
		CYL: { col: 'CYL', head: 'Cyl', fmt: 'cyl' },
		AXIS: { col: 'AXIS', head: 'Axis', fmt: 'axis' },
		VA: { col: 'VA', head: 'VA', fmt: 'text' },
		MIDADD: { col: 'MIDADD', head: 'Mid ADD', fmt: 'add' },
		ADD: { col: 'ADD', head: 'ADD', fmt: 'add' },
		NEARVA: { col: 'NEARVA', head: 'Near VA', fmt: 'text' },
		PRISM: { col: 'PRISM', head: 'Prism', fmt: 'upper' },
		BASE: { col: 'BASE', head: 'Base', fmt: 'upper' }
	} satisfies Record<string, Col>;
	const FITTING: Col[] = [
		{ col: 'HPD', head: 'H prism', fmt: 'upper' },
		{ col: 'HBASE', head: 'Base', fmt: 'upper', options: H_BASES },
		{ col: 'VPD', head: 'V prism', fmt: 'upper' },
		{ col: 'VBASE', head: 'Base', fmt: 'upper', options: V_BASES },
		{ col: 'SLABOFF', head: 'Slab-off', fmt: 'text' },
		{ col: 'VERTEXDIST', head: 'Vertex', fmt: 'text' },
		{ col: 'MPDD', head: 'PD dist', fmt: 'upper' },
		{ col: 'MPDN', head: 'PD near', fmt: 'upper' }
	];

	function wCols(source: RxSource): Col[] {
		const t = val(ouId(source, 'RX_TYPE'));
		const filled = (col: EyeCol) => EYES.some((e) => val(eyeId(source, col, e)).trim());
		// FIX: the Rx type buttons really show/hide the mid and near columns (values always stay visible).
		const showMid = t === '2' || t === '3' || filled('MIDADD');
		const showNear = t !== '0' || filled('ADD') || filled('NEARVA');
		return [C.SPH, C.CYL, C.AXIS, C.VA, ...(showMid ? [C.MIDADD] : []), ...(showNear ? [C.ADD, C.NEARVA] : [])];
	}
	const MR_COLS: Col[] = [C.SPH, C.CYL, C.AXIS, C.VA, C.ADD, C.NEARVA, C.PRISM, C.BASE];
	const CR_COLS: Col[] = [C.SPH, C.CYL, C.AXIS, C.VA];
	const AR_COLS: Col[] = [C.SPH, C.CYL, C.AXIS, C.VA, C.ADD, C.NEARVA, C.PRISM];
	const CTL_COLS: Col[] = [C.SPH, C.CYL, C.AXIS, { col: 'BC', head: 'BC', fmt: 'text' }, { col: 'DIAM', head: 'Diam', fmt: 'text' }, C.ADD, C.VA];
	const CTL_LENS: Col[] = [
		{ col: 'BRAND', head: 'Brand', fmt: 'text', list: 'ctl-brands' },
		{ col: 'MANUFACTURER', head: 'Manufacturer', fmt: 'text', list: 'ctl-makers' },
		{ col: 'SUPPLIER', head: 'Supplier', fmt: 'text', list: 'ctl-suppliers' }
	];

	// ---------- formatting on leaving a box (§8.7) ----------
	/** Value when the box got focus: the ADD copy only overwrites an OS that still matched it. */
	const focusStart: Record<string, string> = {};

	function apply(changes: Record<string, string>, label = '') {
		const ids = Object.keys(changes).filter((id) => writable(id) && val(id) !== changes[id]);
		if (!ids.length) return;
		if (ids.length === 1 && !label) {
			onedit(ids[0], changes[ids[0]]);
			return;
		}
		const next: Findings = { ...findings };
		for (const id of ids) next[id] = { value: changes[id], isDefault: false };
		oncommit(next, ids, label);
	}

	function leave(source: RxSource, c: Col, eye: Eye) {
		const id = eyeId(source, c.col, eye);
		if (preview?.[id]) return; // a shorthand preview is showing; nothing typed here
		const raw = val(id);
		const kind = kindOf(source);
		const changes: Record<string, string> = {};
		let label = '';
		if (c.fmt === 'sph') changes[id] = formatPower(raw, 'sph').value;
		else if (c.fmt === 'cyl') {
			const sph = val(eyeId(source, 'SPH', eye)).trim();
			const axisId = eyeId(source, 'AXIS', eye);
			if (!raw.trim()) {
				// Leaving the cylinder empty under a sphere means a spherical Rx.
				if (sph && sph.toUpperCase() !== 'PLANO') changes[id] = 'SPH';
			} else {
				const f = formatPower(raw, 'cyl', prefs.cyl);
				changes[id] = f.value === 'SPH' && sph.toUpperCase() === 'PLANO' ? '' : f.value;
				if (f.signTyped && f.value !== 'SPH' && f.signTyped !== prefs.cyl) {
					setPref('cyl', f.signTyped);
					say(`Cylinder sign is now ${f.signTyped === '-' ? 'minus' : 'plus'} for new entries.`);
				}
			}
			if (changes[id] === 'SPH' || (changes[id] === '' && raw.trim())) changes[axisId] = '';
		} else if (c.fmt === 'axis') changes[id] = formatAxis(raw).value;
		else if (c.fmt === 'add') {
			const value = formatPower(raw, 'add').value;
			changes[id] = value;
			// OD ADD / mid ADD carry to OS for MR, AR, CTL and glasses (§8.7), unless OS was set to something else.
			if (eye === 'OD' && kind !== 'CR') {
				const osId = eyeId(source, c.col, 'OS');
				const os = val(osId);
				if (value && (os === '' || os === (focusStart[id] ?? '')) && os !== value) {
					changes[osId] = value;
					label = `${sourceLabel(source)} ${COL_LABEL[c.col]} copied OD → OS`;
				}
			}
		} else if (c.fmt === 'upper') changes[id] = formatUpper(raw);
		apply(changes, label);
	}

	function warn(c: Col, value: string): string {
		if (!value) return '';
		if (c.fmt === 'sph' || c.fmt === 'cyl' || c.fmt === 'add')
			return /^[+-]\d+\.\d+$/.test(value) || /^(PLANO|SPH)$/.test(value)
				? isQuarterStep(value)
					? ''
					: 'Not a 0.25 D step'
				: '';
		if (c.fmt === 'axis') return formatAxis(value).ok ? '' : 'Axis must be 1-180';
		return '';
	}

	// ---------- actions ----------
	function doTranspose(source: RxSource) {
		const changes: Record<string, string> = {};
		for (const e of EYES) {
			const ids = { sph: eyeId(source, 'SPH', e), cyl: eyeId(source, 'CYL', e), axis: eyeId(source, 'AXIS', e) };
			const t = transpose({ sph: val(ids.sph), cyl: val(ids.cyl), axis: val(ids.axis) });
			if (!t) continue;
			changes[ids.sph] = t.sph;
			changes[ids.cyl] = t.cyl;
			changes[ids.axis] = t.axis;
		}
		if (!Object.keys(changes).length) {
			say(`${sourceLabel(source)}: nothing to transpose (no cylinder).`);
			return;
		}
		// FIX: transposing saves (through oncommit), with Undo.
		apply(changes, `Transposed ${sourceLabel(source)}`);
	}

	function clearSource(source: RxSource, label = `Cleared ${sourceLabel(source)}`) {
		const ids = sourceFieldIds(source).filter((id) => writable(id) && (val(id) || findings[id]?.isDefault));
		if (!ids.length) return;
		const next: Findings = { ...findings };
		for (const id of ids) next[id] = { value: '', isDefault: false };
		oncommit(next, ids, label);
	}

	function closeSlot(n: number) {
		if (n === 1) {
			setPref('W', false); // closing #1 turns off the whole glasses panel; #2-#5 with values stay
			return;
		}
		revealed = new Set([...revealed].filter((x) => x !== n));
		clearSource(`W${n}` as RxSource, `Removed glasses #${n}`);
	}

	function addSlot() {
		const n = nextSlot;
		if (!n) return;
		revealed = new Set([...revealed, n]);
		say(`Glasses #${n} added.`);
	}

	function printRx(source: RxSource) {
		if (onprintrx) onprintrx(source);
		else window.open(`${base}/rx?source=${source}`, '_blank', 'noopener');
	}
	const base = $derived(`/patients/${page.params.pid}/encounters/${page.params.eid}`);

	function toggleTreatment(source: RxSource, t: string, on: boolean) {
		const id = ouId(source, 'LENS_TREATMENTS');
		const cur = splitList(val(id)).filter((x) => x !== t);
		if (on) cur.push(t);
		const ordered = [...LENS_TREATMENTS.filter((x) => cur.includes(x)), ...cur.filter((x) => !LENS_TREATMENTS.includes(x))];
		onedit(id, ordered.join('|'));
	}

	const TOGGLES: { key: 'W' | 'MR' | 'AR' | 'CTL'; label: string; sources: RxSource[] }[] = [
		{ key: 'W', label: 'Glasses (W)', sources: ['W1'] },
		{ key: 'MR', label: 'Manifest / cyclo', sources: ['MR', 'CR'] },
		{ key: 'AR', label: 'Autorefraction', sources: ['AR'] },
		{ key: 'CTL', label: 'Contact lens', sources: ['CTL'] }
	];
</script>

{#snippet eyeCell(source: RxSource, c: Col, eye: Eye)}
	{@const id = eyeId(source, c.col, eye)}
	{@const s = cell(id)}
	{@const w = warn(c, s.value)}
	{@const label = `${sourceLabel(source)} ${COL_LABEL[c.col]} ${eye}`}
	<td class="cell" class:ghost={s.ghost} class:is-default={s.isDefault} class:copied={s.copied} class:warn={!!w} data-field={id}>
		{#if !writable(id)}
			<span class="na" aria-label="{label}: not available">–</span>
		{:else if c.options}
			<select aria-label={label} value={s.value} onchange={(e) => onedit(id, e.currentTarget.value)}>
				<option value=""></option>
				{#each c.options as o (o)}<option value={o}>{o}</option>{/each}
				{#if s.value && !c.options.includes(s.value)}<option value={s.value}>{s.value}</option>{/if}
			</select>
		{:else}
			<input
				class:wide={!!c.list}
				value={s.value}
				aria-label={label}
				aria-invalid={w ? 'true' : undefined}
				title={w || undefined}
				list={c.list}
				inputmode={c.fmt === 'axis' ? 'numeric' : undefined}
				autocomplete="off"
				spellcheck="false"
				placeholder="–"
				onfocus={(e) => (focusStart[id] = e.currentTarget.value)}
				oninput={(e) => onedit(id, e.currentTarget.value)}
				onblur={() => leave(source, c, eye)}
			/>
		{/if}
	</td>
{/snippet}

{#snippet grid(source: RxSource, cols: Col[], caption: string)}
	<div class="scroll">
		<table>
			<caption class="visually-hidden">{caption}</caption>
			<thead>
				<tr>
					<th scope="col" class="eyehead"><span class="visually-hidden">Eye</span></th>
					{#each cols as c (c.col)}<th scope="col">{c.head}</th>{/each}
				</tr>
			</thead>
			<tbody>
				{#each EYES as eye (eye)}
					<tr>
						<th scope="row"><span class="eye {eye.toLowerCase()}">{eye}</span></th>
						{#each cols as c (c.col)}{@render eyeCell(source, c, eye)}{/each}
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/snippet}

{#snippet ouText(source: RxSource, col: 'COMMENTS' | 'BPDD' | 'BPDN', label: string, multiline = false)}
	{@const id = ouId(source, col)}
	{@const s = cell(id)}
	<label class="ou" class:ghost={s.ghost} class:copied={s.copied} class:grow={multiline}>
		<span>{label}</span>
		{#if multiline}
			<textarea rows="1" value={s.value} aria-label="{sourceLabel(source)} {COL_LABEL[col]}" oninput={(e) => onedit(id, e.currentTarget.value)}></textarea>
		{:else}
			<input
				class="short"
				value={s.value}
				aria-label="{sourceLabel(source)} {COL_LABEL[col]}"
				oninput={(e) => onedit(id, e.currentTarget.value)}
				onblur={() => apply({ [id]: formatUpper(val(id)) })}
			/>
		{/if}
	</label>
{/snippet}

{#snippet cardHead(source: RxSource, title: string, onclose?: () => void)}
	<div class="card-head">
		<h3>{title}</h3>
		<span class="actions">
			<button type="button" class="mini" onclick={() => doTranspose(source)} title="Plus/minus cylinder transpose">± Transpose</button>
			<button type="button" class="mini" onclick={() => printRx(source)} aria-label="Print {sourceLabel(source)} Rx">Print Rx</button>
			<button type="button" class="mini" onclick={() => clearSource(source)} aria-label="Clear {sourceLabel(source)}">Clear</button>
			{#if onclose}
				<button type="button" class="mini close" onclick={onclose} aria-label="Close {title}">✕</button>
			{/if}
		</span>
	</div>
{/snippet}

<section aria-labelledby="refraction-title">
	<div class="head">
		<h2 id="refraction-title">Refraction</h2>
		<div class="toggles" role="group" aria-label="Show refraction panels">
			{#each TOGGLES as t (t.key)}
				{@const hidden = !prefs[t.key]}
				<button type="button" aria-pressed={prefs[t.key]} onclick={() => setPref(t.key, !prefs[t.key])}>
					{t.label}
					{#if hidden && t.sources.some((s) => has(s))}<span class="dot" title="Has values"><span class="visually-hidden">(has values)</span></span>{/if}
				</button>
			{/each}
		</div>
		<span class="tools">
			<button type="button" aria-pressed={prefs.wide} onclick={() => setPref('wide', !prefs.wide)} title="Prism, PD, lens material and treatments for glasses">Rx details</button>
			<button
				type="button"
				onclick={() => setPref('cyl', prefs.cyl === '+' ? '-' : '+')}
				title="Sign given to a cylinder typed without one"
				aria-label="Cylinder sign for unsigned entries: {prefs.cyl === '+' ? 'plus' : 'minus'}. Switch"
			>
				Cyl {prefs.cyl === '+' ? '+' : '−'}
			</button>
			<a href="{base}/rx/history" target="_blank" rel="noopener">Dispensed Rx</a>
		</span>
	</div>
	<p class="status" role="status" aria-live="polite">{status}</p>

	{#each visibleSlots as n (n)}
		{@const source = `W${n}` as RxSource}
		{@const typeId = ouId(source, 'RX_TYPE')}
		<article class="card" aria-label="Current glasses #{n}">
			{@render cardHead(source, `Current glasses #${n}`, () => closeSlot(n))}
			<div class="rxtype" role="radiogroup" aria-label="Glasses #{n} Rx type">
				{#each RX_TYPES as label, i (label)}
					<label class="radio">
						<input type="radio" name="rxtype-{n}" value={String(i)} checked={cell(typeId).value === String(i)} onchange={() => onedit(typeId, String(i))} />
						{label}
					</label>
				{/each}
			</div>
			{@render grid(source, wCols(source), `Glasses #${n} distance and near`)}
			{#if prefs.wide}
				<h4>Fitting details</h4>
				{@render grid(source, FITTING, `Glasses #${n} prism and PD`)}
				<div class="ou-row">
					{@render ouText(source, 'BPDD', 'Binocular PD dist')}
					{@render ouText(source, 'BPDN', 'Binocular PD near')}
					{#if true}
						{@const matId = ouId(source, 'LENS_MATERIAL')}
						{@const mat = cell(matId)}
						<label class="ou" class:copied={mat.copied}>
							<span>Lens material</span>
							<select value={mat.value} aria-label="Glasses #{n} lens material" onchange={(e) => onedit(matId, e.currentTarget.value)}>
								<option value=""></option>
								{#each LENS_MATERIALS as m (m)}<option value={m}>{m}</option>{/each}
								{#if mat.value && !LENS_MATERIALS.includes(mat.value)}<option value={mat.value}>{mat.value}</option>{/if}
							</select>
						</label>
					{/if}
				</div>
				{@const treat = splitList(cell(ouId(source, 'LENS_TREATMENTS')).value)}
				<fieldset class="treat">
					<legend>Lens treatments</legend>
					{#each LENS_TREATMENTS as t (t)}
						<label class="check">
							<input type="checkbox" checked={treat.includes(t)} onchange={(e) => toggleTreatment(source, t, e.currentTarget.checked)} />
							{t}
						</label>
					{/each}
				</fieldset>
			{/if}
			{@render ouText(source, 'COMMENTS', 'Comments', true)}
		</article>
	{/each}
	{#if nextSlot}
		<button type="button" class="add" onclick={addSlot}>+ Additional Rx</button>
	{/if}

	{#if prefs.MR}
		<article class="card" aria-label="Manifest and cycloplegic refraction">
			{@render cardHead('MR', 'Manifest (dry)', () => setPref('MR', false))}
			{@render grid('MR', MR_COLS, 'Manifest refraction')}
			<div class="ou-row">
				{#if true}
					{@const bal = cell('BALANCED')}
					<label class="check" class:copied={bal.copied}>
						<input type="checkbox" checked={!!bal.value} onchange={(e) => onedit('BALANCED', e.currentTarget.checked ? '1' : '')} />
						Balanced
					</label>
				{/if}
				{@render ouText('MR', 'COMMENTS', 'Comments', true)}
			</div>

			<div class="sub">
				{@render cardHead('CR', 'Cycloplegic (wet)')}
				{@render grid('CR', CR_COLS, 'Cycloplegic refraction')}
				<div class="ou-row">
					<div class="rxtype" role="radiogroup" aria-label="Cycloplegic method">
						<span class="lbl">Method</span>
						{#each WET_METHODS as m (m)}
							<label class="radio">
								<input type="radio" name="wettype" value={m} checked={cell('WETTYPE').value === m} onchange={() => onedit('WETTYPE', m)} />
								{m}
							</label>
						{/each}
					</div>
					{#if writable('ODIOPPOST')}
						{#each EYES as e (e)}
							{@const id = `${e}IOPPOST`}
							{@const s = cell(id)}
							<label class="ou" class:ghost={s.ghost} class:copied={s.copied}>
								<span>Post-dilation IOP {e}</span>
								<input class="short" inputmode="numeric" value={s.value} aria-label="IOP post-dilation {e}" oninput={(ev) => onedit(id, ev.currentTarget.value)} />
							</label>
						{/each}
					{/if}
				</div>
				{@render ouText('CR', 'COMMENTS', 'Comments', true)}
			</div>
		</article>
	{/if}

	{#if prefs.AR}
		<article class="card" aria-label="Autorefraction">
			{@render cardHead('AR', 'Autorefraction', () => setPref('AR', false))}
			{@render grid('AR', AR_COLS, 'Autorefraction')}
			{@render ouText('AR', 'COMMENTS', 'Comments', true)}
		</article>
	{/if}

	{#if prefs.CTL}
		<article class="card" aria-label="Contact lens">
			{@render cardHead('CTL', 'Contact lens', () => setPref('CTL', false))}
			{@render grid('CTL', CTL_COLS, 'Contact lens power and fit')}
			{@render grid('CTL', CTL_LENS, 'Contact lens brand')}
			{@render ouText('CTL', 'COMMENTS', 'Comments', true)}
		</article>
	{/if}

	<datalist id="ctl-brands">{#each CTL_BRANDS as o (o)}<option value={o}></option>{/each}</datalist>
	<datalist id="ctl-makers">{#each CTL_MANUFACTURERS as o (o)}<option value={o}></option>{/each}</datalist>
	<datalist id="ctl-suppliers">{#each CTL_SUPPLIERS as o (o)}<option value={o}></option>{/each}</datalist>

	<p class="legend">
		Powers format when you leave a box: <code>125</code> → +1.25, <code>pl</code> → PLANO, axis <code>90</code> → 090.
		<span class="swatch copied" aria-hidden="true"></span> Copied from a prior visit.
	</p>
</section>

<style>
	.head {
		display: flex;
		align-items: center;
		gap: var(--space-2) var(--space-3);
		flex-wrap: wrap;
	}
	h2 {
		font-size: var(--text-md);
		font-weight: var(--weight-semibold);
		margin: 0;
	}
	.toggles {
		display: inline-flex;
		flex-wrap: wrap;
		gap: 2px;
		padding: 2px;
		background: var(--surface-2);
		border-radius: var(--radius-2);
	}
	.toggles button {
		border-color: transparent;
		background: transparent;
		color: var(--text-2);
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
	}
	.toggles button[aria-pressed='true'] {
		background: var(--surface-0);
		border-color: var(--hairline);
		color: var(--text-1);
	}
	.dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--accent);
	}
	.tools {
		display: inline-flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin-left: auto;
	}
	.tools button[aria-pressed='true'] {
		background: var(--accent-soft);
		border-color: var(--accent);
		color: var(--accent);
	}
	.tools a {
		display: inline-flex;
		align-items: center;
		min-height: var(--target-min);
		padding: 0 var(--space-2);
	}
	.status {
		min-height: 1.4em;
		margin: var(--space-1) 0;
		color: var(--text-2);
		font-size: var(--text-sm);
	}
	.card {
		background: var(--surface-1);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-2);
		padding: var(--space-2) var(--space-3) var(--space-3);
		margin-bottom: var(--space-3);
	}
	.sub {
		border-top: 1px solid var(--hairline);
		margin-top: var(--space-3);
		padding-top: var(--space-2);
	}
	.card-head {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex-wrap: wrap;
	}
	h3 {
		font-size: var(--text-sm);
		font-weight: var(--weight-semibold);
		margin: 0 auto 0 0;
	}
	h4 {
		font-size: var(--text-xs);
		font-weight: var(--weight-semibold);
		color: var(--text-2);
		margin: var(--space-3) 0 var(--space-1);
	}
	.actions {
		display: inline-flex;
		flex-wrap: wrap;
		gap: var(--space-1);
	}
	.mini {
		font-size: var(--text-xs);
		min-height: var(--target-min);
		padding: 0 var(--space-2);
		color: var(--text-2);
	}
	.close {
		min-width: var(--target-min);
	}
	.scroll {
		overflow-x: auto;
		margin-top: var(--space-1);
	}
	table {
		border-collapse: collapse;
		font-variant-numeric: tabular-nums;
	}
	th {
		text-align: left;
		font-weight: var(--weight-regular);
		color: var(--text-2);
		font-size: var(--text-xs);
		padding: 0 var(--space-1);
		white-space: nowrap;
	}
	thead th {
		height: calc(var(--row-height) - 8px);
	}
	.eyehead {
		width: 3em;
	}
	.eye {
		display: inline-flex;
		padding: 1px 6px;
		border-radius: var(--radius-1);
		font-weight: var(--weight-semibold);
		font-size: var(--text-sm);
	}
	.eye.od {
		color: var(--od);
		background: var(--od-soft);
	}
	.eye.os {
		color: var(--os);
		background: var(--os-soft);
	}
	.cell {
		padding: 2px;
		border-radius: var(--radius-1);
		transition: background var(--dur-small-in) var(--ease-enter);
	}
	.cell.is-default {
		background: var(--default-tint);
	}
	.cell.copied,
	.ou.copied,
	.check.copied {
		background: var(--copied-tint);
	}
	.cell.ghost,
	.ou.ghost {
		background: var(--accent-soft);
	}
	.ghost input,
	.ghost textarea {
		color: var(--accent);
		font-style: italic;
	}
	input,
	select,
	textarea {
		font: inherit;
		font-variant-numeric: tabular-nums;
		color: var(--text-1);
		background: var(--surface-0);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-1);
		min-height: var(--target-min);
		padding: 2px var(--space-2);
	}
	td input {
		width: 6em;
	}
	td input.wide {
		width: 14em;
	}
	td select {
		width: 5em;
	}
	input:focus,
	select:focus,
	textarea:focus {
		border-color: var(--accent);
		outline: none;
		box-shadow: 0 0 0 1px var(--focus-ring);
	}
	input::placeholder {
		color: var(--text-3);
	}
	.cell.warn input {
		border-color: var(--abnormal);
	}
	.na {
		color: var(--text-3);
		padding: 0 var(--space-2);
	}
	.rxtype {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0 var(--space-3);
		margin: var(--space-1) 0;
	}
	.lbl {
		color: var(--text-2);
		font-size: var(--text-sm);
	}
	.radio,
	.check {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		min-height: var(--target-min);
		font-size: var(--text-sm);
		border-radius: var(--radius-1);
		padding: 0 var(--space-1);
	}
	.radio input,
	.check input {
		min-height: 0;
		width: 18px;
		height: 18px;
		accent-color: var(--accent);
	}
	.ou-row {
		display: flex;
		flex-wrap: wrap;
		align-items: end;
		gap: var(--space-2) var(--space-4);
		margin-top: var(--space-2);
	}
	.ou {
		display: grid;
		gap: 2px;
		font-size: var(--text-xs);
		color: var(--text-2);
		border-radius: var(--radius-1);
		margin-top: var(--space-2);
	}
	.ou-row .ou {
		margin-top: 0;
	}
	.ou.grow {
		flex: 1 1 18em;
	}
	.ou input.short {
		width: 7em;
	}
	.ou textarea {
		width: 100%;
		max-width: var(--measure-prose);
		resize: vertical;
		field-sizing: content;
	}
	.treat {
		border: 0;
		padding: 0;
		margin: var(--space-2) 0 0;
		display: flex;
		flex-wrap: wrap;
		gap: 0 var(--space-3);
	}
	.treat legend {
		font-size: var(--text-xs);
		color: var(--text-2);
		padding: 0;
	}
	.add {
		margin-bottom: var(--space-3);
	}
	.legend {
		color: var(--text-3);
		font-size: var(--text-xs);
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--space-2);
	}
	.legend code {
		font-family: var(--font-mono);
	}
	.swatch {
		width: 14px;
		height: 14px;
		border-radius: 3px;
		border: 1px solid var(--hairline);
		margin-left: var(--space-3);
	}
	.swatch.copied {
		background: var(--copied-tint);
	}
</style>
