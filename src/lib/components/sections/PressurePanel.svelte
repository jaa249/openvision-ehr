<script lang="ts">
	// IOP / pupils (spec §1.4 clinical strip: mental status, tension, fields, pupils; §8.3, §8.5, §8.6).
	import {
		DIM_PUPIL_IDS,
		IOP_METHODS,
		IOP_METHOD_LABEL_KEY,
		MENTAL_STATUS,
		MENTAL_STATUS_LABEL_KEY,
		PUPILS_NORMAL,
		PUPIL_IDS,
		VF_IDS,
		VF_QUADRANTS,
		VF_QUADRANT_LABEL_KEY,
		fieldsState,
		formatTime,
		iopTarget,
		isHighIop,
		needsTimeStamp,
		normalizeReactivity
	} from '#lib/exam/sections/workup.ts';
	import { DILATION_DROPS, DIL_MEDS, DIL_RISKS, DIL_TIME, DROP_NAME_KEY, dropGiven, isDilated, risksDiscussed } from '#lib/exam/sections/dilation.ts';
	import Msg from '#lib/i18n/Msg.svelte';
	import { useI18n } from '#lib/i18n/context.ts';
	import type { PanelProps } from './types.ts';
	import { cellState, withValues } from './workup/cell.ts';
	import { effectiveTarget, type Fallback } from './workup/IopTargets.svelte';

	type Side = 'OD' | 'OS';
	let { context, findings, preview, copied, defaults, onedit, oncommit }: PanelProps = $props();
	const { t } = useI18n();
	const quadLabel = (n: 1 | 2 | 3 | 4) => t(VF_QUADRANT_LABEL_KEY[n]);

	const cell = (id: string) => cellState(id, findings, preview, copied);
	const val = (id: string) => findings[id]?.value ?? '';

	// ---------- IOP ----------
	// Targets (§8.3 FIX): this visit's value, else the latest prior visit's, else the provider's default, else 21.
	// The prior-visit and provider steps need the server (the VISIT's provider's defaults, not the
	// viewer's `defaults`); until it answers, only this visit's own value / 21 applies.
	let priorFallback = $state<Fallback | null>(null);
	$effect(() => {
		const ctrl = new AbortController();
		fetch(`/patients/${context.patientId}/flowsheet/targets?encounter=${context.encounterId}`, { signal: ctrl.signal })
			.then((r) => (r.ok ? r.json() : null))
			.then((j: { fallback: Fallback } | null) => {
				if (j) priorFallback = j.fallback;
			})
			.catch(() => {});
		return () => ctrl.abort();
	});
	const target = $derived(
		priorFallback
			? { OD: effectiveTarget('OD', findings, priorFallback), OS: effectiveTarget('OS', findings, priorFallback) }
			: { OD: iopTarget('OD', findings), OS: iopTarget('OS', findings) }
	);
	/** Placeholder for an empty target box: what applies when nothing is typed. */
	const fallbackTarget = $derived({
		OD: priorFallback?.OD.value ?? iopTarget('OD', {}),
		OS: priorFallback?.OS.value ?? iopTarget('OS', {})
	});
	const IOP_IDS: string[] = IOP_METHODS.flatMap((m) => [m.od, m.os]);

	/** Typing an IOP stamps the time when it is empty or midnight (§8.3; we stamp on entry, not on save). */
	function typeIop(id: string, value: string, timeId: 'IOPTIME' | 'IOPPOSTTIME') {
		if (value.trim() && needsTimeStamp(val(timeId))) {
			const { next, changed } = withValues(findings, { [id]: value, [timeId]: formatTime(new Date()) });
			oncommit(next, changed, '');
		} else onedit(id, value);
	}

	function now(timeId: 'IOPTIME' | 'IOPPOSTTIME') {
		onedit(timeId, formatTime(new Date()));
	}

	function clearIop() {
		const ids = [...IOP_IDS, 'IOPTIME'];
		const { next, changed } = withValues(findings, Object.fromEntries(ids.map((id) => [id, ''])));
		oncommit(next, changed, t('sections.iopUndoCleared'));
	}

	// ---------- dilation (spec §1.6 dilation box; no defaults) ----------
	const dilated = $derived(isDilated(findings));
	const mc = $derived(cell(DIL_MEDS));
	const tc = $derived(cell(DIL_TIME));
	/** A drop toggle stores its strength. The first drop stamps the time when it is empty (risks stay the provider's call). */
	function toggleDrop(id: string, strength: string) {
		const values: Record<string, string> = { [id]: dropGiven(findings, id) ? '' : strength };
		if (values[id] && needsTimeStamp(val(DIL_TIME))) values[DIL_TIME] = formatTime(new Date());
		const { next, changed } = withValues(findings, values);
		oncommit(next, changed, '');
	}

	// ---------- pupils ----------
	const pupilsNormal = $derived(!!val('PUPIL_NORMAL') && val('PUPIL_NORMAL') !== '0');
	const DIM_IDS = (['OD', 'OS'] as const).flatMap((e) => Object.values(DIM_PUPIL_IDS[e]));
	const dimHas = $derived([...DIM_IDS, 'PUPIL_COMMENTS'].some((id) => val(id).trim()));
	/** FIX (§1.4): the dim-light panel opens by itself whenever it holds a value. */
	let dimOverride = $state<boolean | null>(null);
	const showDim = $derived(dimOverride ?? dimHas);

	function setPupilsNormal(on: boolean) {
		if (!on) return onedit('PUPIL_NORMAL', '');
		// The provider's list values when present, else the fixed normal (spec §3.2).
		const values = Object.fromEntries(Object.entries(PUPILS_NORMAL).map(([id, v]) => [id, defaults[id] ?? v]));
		const filled = withValues(findings, values, true);
		const { next, changed } = withValues(filled.next, { PUPIL_NORMAL: '1' });
		oncommit(next, [...new Set([...filled.changed, ...changed])], t('sections.pupilsNormal'));
	}

	// ---------- confrontation fields ----------
	const vfState = $derived({ OD: fieldsState(findings, 'OD'), OS: fieldsState(findings, 'OS') });
	const ftcf = $derived(vfState.OD !== 'defect' && vfState.OS !== 'defect' && (vfState.OD === 'full' || vfState.OS === 'full'));
	const vfSummary = $derived.by(() => {
		if (vfState.OD === 'untested' && vfState.OS === 'untested') return t('sections.vfNotTested');
		if (ftcf && vfState.OD === vfState.OS) return t('sections.vfFullOu');
		const flagged = (['OD', 'OS'] as const).flatMap((e) =>
			VF_QUADRANTS.filter((q) => val(`${e}VF${q.n}`) === '1').map((q) => t('sections.vfFlagged', { eye: e, quadrant: quadLabel(q.n).toLowerCase() }))
		);
		return flagged.length
			? t('sections.vfDefect', { list: flagged.join(', ') })
			: t('sections.vfFullOneEye', { eye: vfState.OD === 'full' ? 'OD' : 'OS' });
	});
	/** Doctor's view facing the patient: OD temporal on the left, OS temporal on the right (D9). */
	const GRID: Record<Side, number[]> = { OD: [1, 2, 3, 4], OS: [2, 1, 4, 3] };

	/** Toggling a quadrant marks the fields as tested: other blank quadrants become "full" (0). */
	function toggleQuadrant(id: string) {
		const values: Record<string, string> = {};
		for (const q of VF_IDS) if (!val(q)) values[q] = '0';
		values[id] = val(id) === '1' ? '0' : '1';
		const { next, changed } = withValues(findings, values);
		oncommit(next, changed, '');
	}

	/** FTCF (§8.5, FIX §3.2): checking stores 0 in all eight quadrants; unchecking means not tested. */
	function setFtcf(on: boolean) {
		const { next, changed } = withValues(findings, Object.fromEntries(VF_IDS.map((id) => [id, on ? '0' : ''])));
		oncommit(next, changed, on ? t('sections.vfUndoFull') : t('sections.vfUndoCleared'));
	}

	function clearFields() {
		setFtcf(false);
	}
</script>

{#snippet text(id: string, label: string, opts: { numeric?: boolean; size?: 'xs' | 's' | 'm'; react?: boolean } = {})}
	{@const c = cell(id)}
	<span class="inp" class:ghost={c.ghost} class:is-default={c.isDefault} class:copied={c.copied} data-field={id}>
		<input
			class="{opts.size ?? 's'}{opts.numeric ? ' num' : ''}"
			value={c.value}
			inputmode={opts.numeric ? 'decimal' : 'text'}
			autocomplete="off"
			aria-label={c.isDefault ? t('sections.labelDefault', { label }) : label}
			placeholder="–"
			oninput={(e) => onedit(id, e.currentTarget.value)}
			onchange={opts.react
				? (e) => {
						const v = normalizeReactivity(e.currentTarget.value);
						if (v !== e.currentTarget.value) onedit(id, v);
					}
				: undefined}
		/>
	</span>
{/snippet}

{#snippet iopCell(id: string, eye: Side, label: string, numeric: boolean, timeId: 'IOPTIME' | 'IOPPOSTTIME')}
	{@const c = cell(id)}
	{@const high = numeric && isHighIop(c.value, target[eye])}
	<td class="cell" class:ghost={c.ghost} class:copied={c.copied} class:high data-field={id}>
		<input
			class="s{numeric ? ' num' : ''}"
			value={c.value}
			inputmode={numeric ? 'decimal' : 'text'}
			autocomplete="off"
			maxlength="10"
			aria-label={high ? t('sections.iopAboveTargetLabel', { label, target: target[eye] }) : label}
			placeholder="–"
			oninput={(e) => typeIop(id, e.currentTarget.value, timeId)}
		/>
		{#if high}<span class="flag" title={t('sections.iopAboveTargetTitle', { target: target[eye] })}>▲ {t('sections.iopHigh')}</span>{/if}
	</td>
{/snippet}

{#snippet timeBox(id: 'IOPTIME' | 'IOPPOSTTIME', label: string)}
	{@const c = cell(id)}
	<span class="time" class:ghost={c.ghost} class:copied={c.copied} data-field={id}>
		<input class="s num" value={c.value} maxlength="10" autocomplete="off" aria-label={label} placeholder={t('sections.timePlaceholder')} oninput={(e) => onedit(id, e.currentTarget.value)} />
		<button type="button" class="mini" aria-label={t('sections.timeNowLabel', { label })} onclick={() => now(id)}>{t('sections.now')}</button>
	</span>
{/snippet}

<section aria-labelledby="iop-title">
	<div class="head">
		<h2 id="iop-title">{t('sections.iopTitle')}</h2>
	</div>

	<div class="cards">
		<!-- Tension -->
		<div class="panel" role="group" aria-labelledby="tension-title">
			<div class="card-head">
				<h3 id="tension-title">{t('sections.iopTension')} <span class="unit">mmHg</span></h3>
				<button type="button" class="mini" onclick={clearIop}>{t('sections.clear')}</button>
			</div>
			<table class="eye-ltr">
				<thead>
					<tr>
						<th scope="col" class="rowhead"><span class="visually-hidden">{t('sections.rxMethod')}</span></th>
						<th scope="col"><span class="eye od">{t('sections.eyeOdR')}</span></th>
						<th scope="col"><span class="eye os">{t('sections.eyeOsL')}</span></th>
					</tr>
				</thead>
				<tbody>
					{#each IOP_METHODS as m (m.key)}
						{@const method = t(IOP_METHOD_LABEL_KEY[m.key])}
						<tr>
							<th scope="row">{method}<span class="code">{m.od} · {m.os}</span></th>
							{@render iopCell(m.od, 'OD', t('sections.iopCellLabel', { method, eye: 'OD' }), m.numeric, 'IOPTIME')}
							{@render iopCell(m.os, 'OS', t('sections.iopCellLabel', { method, eye: 'OS' }), m.numeric, 'IOPTIME')}
						</tr>
					{/each}
					<tr>
						<th scope="row">{t('sections.iopTime')}<span class="code">IOPTIME</span></th>
						<td colspan="2" class="cell">{@render timeBox('IOPTIME', t('sections.iopTimeLabel'))}</td>
					</tr>
					<tr>
						<th scope="row">{t('sections.iopTarget')}<span class="code">ODIOPTARGET · OSIOPTARGET</span></th>
						{#each ['OD', 'OS'] as const as eye (eye)}
							{@const id = `${eye}IOPTARGET`}
							{@const c = cell(id)}
							<td class="cell" class:ghost={c.ghost} class:copied={c.copied} data-field={id}>
								<input
									class="s num"
									value={c.value}
									inputmode="decimal"
									maxlength="10"
									autocomplete="off"
									aria-label={t('sections.iopTargetLabel', { eye })}
									placeholder={String(fallbackTarget[eye])}
									oninput={(e) => onedit(id, e.currentTarget.value)}
								/>
							</td>
						{/each}
					</tr>
					<tr class="divider"><td colspan="3"></td></tr>
					<tr>
						<th scope="row">{t('sections.iopPostDilation')}<span class="code">ODIOPPOST · OSIOPPOST</span></th>
						{@render iopCell('ODIOPPOST', 'OD', t('sections.iopPostDilationLabel', { eye: 'OD' }), true, 'IOPPOSTTIME')}
						{@render iopCell('OSIOPPOST', 'OS', t('sections.iopPostDilationLabel', { eye: 'OS' }), true, 'IOPPOSTTIME')}
					</tr>
					<tr>
						<th scope="row">{t('sections.iopPostTime')}<span class="code">IOPPOSTTIME</span></th>
						<td colspan="2" class="cell">{@render timeBox('IOPPOSTTIME', t('sections.iopPostTimeLabel'))}</td>
					</tr>
				</tbody>
			</table>
			<div class="dil" role="group" aria-labelledby="dil-title">
				<div class="dil-head">
					<h4 id="dil-title">{t('sections.dilTitle')}</h4>
					<span class="dil-state" aria-live="polite">{dilated ? t('sections.dilDilated') : t('sections.dilNotDilated')}</span>
				</div>
				<div class="drops">
					{#each DILATION_DROPS as d (d.id)}
						{@const c = cell(d.id)}
						{@const on = dropGiven(findings, d.id)}
						{@const name = t(DROP_NAME_KEY[d.id])}
						<span class="drop" class:on class:ghost={c.ghost} class:copied={c.copied} data-field={d.id}>
							<button type="button" class="drop-btn" aria-pressed={on} onclick={() => toggleDrop(d.id, d.strengths[0])}>
								<span class="tick" aria-hidden="true">{on ? '✓' : '+'}</span>
								{name}
								{#if d.strengths.length === 1}<span class="strength">{d.strengths[0]}</span>{/if}
							</button>
							{#if d.strengths.length > 1}
								<select
									class="strength-pick"
									aria-label={t('sections.dilStrength', { name })}
									value={on ? c.value : d.strengths[0]}
									onchange={(e) => {
										if (on) onedit(d.id, e.currentTarget.value);
										else toggleDrop(d.id, e.currentTarget.value);
									}}
								>
									{#each new Set([...d.strengths, ...(on && !d.strengths.includes(c.value) ? [c.value] : [])]) as s (s)}
										<option value={s}>{s}</option>
									{/each}
								</select>
							{/if}
						</span>
					{/each}
				</div>
				<div class="dil-row">
					<label class="dil-other" class:ghost={mc.ghost} class:copied={mc.copied} data-field={DIL_MEDS}>
						<span>{t('sections.dilOtherDrops')} <span class="code inline">DIL</span></span>
						<input value={mc.value} maxlength="200" autocomplete="off" placeholder={t('sections.dilOtherPlaceholder')} oninput={(e) => onedit(DIL_MEDS, e.currentTarget.value)} />
					</label>
					<span class="dil-time">
						<span id="dil-time-label">{t('sections.iopTime')} <span class="code inline">DILTIME</span></span>
						<span class="time" class:ghost={tc.ghost} class:copied={tc.copied} data-field={DIL_TIME}>
							<input class="s num" value={tc.value} maxlength="10" autocomplete="off" aria-labelledby="dil-time-label" placeholder={t('sections.timePlaceholder')} oninput={(e) => onedit(DIL_TIME, e.currentTarget.value)} />
							<button type="button" class="mini tall" aria-label={t('sections.dilTimeNow')} onclick={() => onedit(DIL_TIME, formatTime(new Date()))}>{t('sections.now')}</button>
						</span>
					</span>
					<label class="check tall">
						<input type="checkbox" checked={risksDiscussed(findings)} onchange={(e) => onedit(DIL_RISKS, e.currentTarget.checked ? 'on' : '')} />
						{t('sections.dilRisks')}
					</label>
				</div>
				<p class="dil-hint"><Msg key="sections.dilHint">{#snippet codes()}<code>TROP:1%</code>, <code>NEO:2.5%</code>{/snippet}</Msg></p>
			</div>
			<p class="hint"><Msg key="sections.iopHint">{#snippet high()}<span class="flag inline">▲ {t('sections.iopHigh')}</span>{/snippet}</Msg></p>
		</div>

		<!-- Pupils -->
		<div class="panel" role="group" aria-labelledby="pupils-title">
			<div class="card-head">
				<h3 id="pupils-title">{t('sections.pupilsTitle')}</h3>
				<label class="check">
					<input type="checkbox" aria-label={t('sections.pupilsNormal')} checked={pupilsNormal} onchange={(e) => setPupilsNormal(e.currentTarget.checked)} />
					{t('sections.normal')}
				</label>
			</div>
			<table class="eye-ltr">
				<thead>
					<tr>
						<th scope="col" class="rowhead"><span class="visually-hidden">{t('sections.measure')}</span></th>
						<th scope="col"><span class="eye od">{t('sections.eyeOdR')}</span></th>
						<th scope="col"><span class="eye os">{t('sections.eyeOsL')}</span></th>
					</tr>
				</thead>
				<tbody>
					<tr>
						<th scope="row">{t('sections.pupilSizeLight')} <span class="unit">mm</span></th>
						{#each ['OD', 'OS'] as const as eye (eye)}
							<td class="cell">
								<span class="range">
									{@render text(PUPIL_IDS[eye].size1, t('sections.pupilSizeLightFrom', { eye }), { numeric: true, size: 'xs' })}
									<span aria-hidden="true">→</span>
									{@render text(PUPIL_IDS[eye].size2, t('sections.pupilSizeLightTo', { eye }), { numeric: true, size: 'xs' })}
								</span>
							</td>
						{/each}
					</tr>
					<tr>
						<th scope="row">{t('sections.pupilReactivity')}</th>
						{#each ['OD', 'OS'] as const as eye (eye)}
							<td class="cell">{@render text(PUPIL_IDS[eye].react, t('sections.pupilReactivityLabel', { eye }), { react: true })}</td>
						{/each}
					</tr>
					<tr>
						<th scope="row">{t('sections.pupilApd')}<span class="code">RAPD · LAPD</span></th>
						{#each ['OD', 'OS'] as const as eye (eye)}
							<td class="cell">{@render text(PUPIL_IDS[eye].apd, t('sections.pupilApdLabel', { eye }))}</td>
						{/each}
					</tr>
				</tbody>
			</table>
			<button
				type="button"
				class="disclose"
				aria-expanded={showDim}
				aria-controls="dim-pupils"
				onclick={() => (dimOverride = !showDim)}
			>
				<span class="flip-rtl" aria-hidden="true">{showDim ? '▾' : '▸'}</span> {t('sections.pupilDimLight')}
			</button>
			{#if showDim}
				{@const pc = cell('PUPIL_COMMENTS')}
				<div id="dim-pupils">
					<table class="eye-ltr">
						<tbody>
							<tr>
								<th scope="row" class="rowhead">{t('sections.pupilSizeDim')} <span class="unit">mm</span></th>
								{#each ['OD', 'OS'] as const as eye (eye)}
									<td class="cell">
										<span class="range">
											{@render text(DIM_PUPIL_IDS[eye].size1, t('sections.pupilSizeDimFrom', { eye }), { numeric: true, size: 'xs' })}
											<span aria-hidden="true">→</span>
											{@render text(DIM_PUPIL_IDS[eye].size2, t('sections.pupilSizeDimTo', { eye }), { numeric: true, size: 'xs' })}
										</span>
									</td>
								{/each}
							</tr>
							<tr>
								<th scope="row">{t('sections.pupilReactivityDim')}</th>
								{#each ['OD', 'OS'] as const as eye (eye)}
									<td class="cell">{@render text(DIM_PUPIL_IDS[eye].react, t('sections.pupilReactivityDimLabel', { eye }), { react: true })}</td>
								{/each}
							</tr>
						</tbody>
					</table>
					<label class="comments">
						<span>{t('sections.pupilComments')} <span class="code inline">PUPCOM</span></span>
						<textarea
							rows="2"
							class:ghost={pc.ghost}
							class:copied={pc.copied}
							value={pc.value}
							oninput={(e) => onedit('PUPIL_COMMENTS', e.currentTarget.value)}
						></textarea>
					</label>
				</div>
			{/if}
		</div>

		<!-- Confrontation fields -->
		<div class="panel" role="group" aria-labelledby="fields-title">
			<div class="card-head">
				<h3 id="fields-title">{t('sections.vfTitle')} <span class="unit">{t('sections.vfConfrontation')}</span></h3>
				<label class="check">
					<input type="checkbox" aria-label={t('sections.vfUndoFull')} checked={ftcf} onchange={(e) => setFtcf(e.currentTarget.checked)} />
					{t('sections.vfFullToCf')}
				</label>
				<button type="button" class="mini" onclick={clearFields}>{t('sections.vfNotTested')}</button>
			</div>
			<div class="vf eye-ltr">
				{#each ['OD', 'OS'] as const as eye (eye)}
					<div class="vf-eye" role="group" aria-label={t('sections.vfEyeGroup', { eye })}>
						<span class="eye {eye.toLowerCase()}">{eye}</span>
						<div class="quads">
							{#each GRID[eye] as n (n)}
								{@const q = VF_QUADRANTS[n - 1]}
								{@const id = `${eye}VF${n}`}
								{@const c = cell(id)}
								{@const qLabel = quadLabel(q.n)}
								<button
									type="button"
									class="quad"
									class:defect={c.value === '1'}
									class:full={c.value === '0'}
									class:ghost={c.ghost}
									class:copied={c.copied}
									data-field={id}
									aria-pressed={c.value === '1'}
									aria-label={t('sections.vfQuadDefect', { quadrant: qLabel, eye })}
									title={t('sections.vfQuadTitle', { quadrant: qLabel, eye })}
									onclick={() => toggleQuadrant(id)}
								>
									<span class="q-short">{q.short}</span>
									<span class="q-state">{c.value === '1' ? `✕ ${t('sections.vfStateDefect')}` : c.value === '0' ? t('sections.vfStateFull') : '–'}</span>
								</button>
							{/each}
						</div>
					</div>
				{/each}
			</div>
			<p class="status" aria-live="polite">{vfSummary}</p>
		</div>

		<!-- Mental status -->
		<div class="panel" role="group" aria-labelledby="mental-title">
			<div class="card-head"><h3 id="mental-title">{t('sections.mentalTitle')}</h3></div>
			<div class="mental">
				{#each MENTAL_STATUS as m (m.id)}
					<label class="check">
						<input
							type="checkbox"
							checked={!!cell(m.id).value}
							onchange={(e) => onedit(m.id, e.currentTarget.checked ? m.on : '')}
						/>
						{t(MENTAL_STATUS_LABEL_KEY[m.id])}
					</label>
				{/each}
			</div>
		</div>
	</div>
	<p class="legend">
		<span class="swatch" aria-hidden="true"></span> {t('sections.legendDefault')}
		<span class="swatch copied" aria-hidden="true"></span> {t('sections.legendCopied')}
		<span class="sep"><Msg key="sections.legendShorthand">{#snippet codes()}<code>ODIOPAP:15</code>, <code>IOP:16</code>, <code>APD:0</code>{/snippet}</Msg></span>
	</p>
</section>

<style>
	.head {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin-bottom: var(--space-3);
	}
	h2 {
		font-size: var(--text-md);
		font-weight: var(--weight-semibold);
		margin: 0;
	}
	h3 {
		font-size: var(--text-sm);
		font-weight: var(--weight-semibold);
		margin: 0;
		margin-inline-end: auto;
	}
	.cards {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 340px), 1fr));
		gap: var(--space-4);
		align-items: start;
	}
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
	.unit {
		color: var(--text-3);
		font-size: var(--text-xs);
		font-weight: var(--weight-regular);
		margin-inline-start: var(--space-1);
	}
	table {
		width: 100%;
		border-collapse: collapse;
		table-layout: fixed;
	}
	th,
	td {
		text-align: start;
		padding: 0 var(--space-3);
		border-bottom: 1px solid var(--hairline);
		vertical-align: middle;
	}
	.rowhead {
		width: 34%;
	}
	thead th {
		height: calc(var(--row-height) + var(--space-1));
	}
	tbody th {
		font-weight: var(--weight-regular);
		color: var(--text-2);
		height: var(--row-height);
	}
	.code {
		display: block;
		font: var(--text-xs) var(--font-mono);
		color: var(--text-3);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.code.inline {
		display: inline;
	}
	.eye {
		display: inline-flex;
		padding: 1px 6px;
		border-radius: var(--radius-1);
		font-weight: var(--weight-semibold);
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
		padding: 2px var(--space-1);
	}
	.cell.ghost,
	.inp.ghost,
	.time.ghost {
		background: var(--accent-soft);
	}
	.ghost input,
	textarea.ghost {
		color: var(--accent);
		font-style: italic;
	}
	.cell.copied,
	.inp.copied,
	.time.copied,
	textarea.copied {
		background: var(--copied-tint);
	}
	.inp.is-default {
		background: var(--default-tint);
		border-radius: var(--radius-1);
	}
	.inp,
	.time {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		border-radius: var(--radius-1);
	}
	input:not([type='checkbox']),
	textarea {
		font: inherit;
		color: var(--text-1);
		background: transparent;
		border: 1px solid var(--hairline);
		border-radius: var(--radius-1);
		padding: 4px var(--space-2);
		min-height: calc(var(--row-height) - 4px);
		max-width: 100%;
	}
	input.xs {
		width: 3.6em;
	}
	input.s {
		width: 6.5em;
	}
	input.m {
		width: 10em;
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
	.cell.high input {
		border-color: var(--danger);
		color: var(--danger);
		font-weight: var(--weight-semibold);
	}
	.flag {
		color: var(--danger);
		font-size: var(--text-xs);
		font-weight: var(--weight-semibold);
		margin-inline-start: var(--space-1);
		white-space: nowrap;
	}
	.flag.inline {
		margin: 0;
	}
	.range {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		color: var(--text-3);
	}
	.divider td {
		height: var(--space-1);
		background: var(--surface-2);
		padding: 0;
	}
	tbody tr:last-child > * {
		border-bottom: 0;
	}
	.mini {
		font-size: var(--text-xs);
		padding: 0 var(--space-2);
		color: var(--text-2);
	}
	.check {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		min-height: var(--target-min);
		cursor: pointer;
	}
	.check input {
		width: 18px;
		height: 18px;
		accent-color: var(--accent);
	}
	.hint,
	.status {
		margin: 0;
		padding: var(--space-2) var(--space-3);
		font-size: var(--text-xs);
		color: var(--text-3);
		border-top: 1px solid var(--hairline);
	}
	.status {
		color: var(--text-2);
	}
	.disclose {
		width: 100%;
		text-align: start;
		border: 0;
		border-top: 1px solid var(--hairline);
		border-radius: 0;
		background: var(--surface-2);
		color: var(--text-2);
	}
	#dim-pupils {
		border-top: 1px solid var(--hairline);
	}
	.comments {
		display: grid;
		gap: var(--space-1);
		padding: var(--space-2) var(--space-3);
		color: var(--text-2);
		border-top: 1px solid var(--hairline);
	}
	.comments textarea {
		width: 100%;
		resize: vertical;
	}
	.vf {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--space-3);
		padding: var(--space-3);
	}
	.vf-eye {
		display: grid;
		gap: var(--space-1);
		justify-items: start;
	}
	.quads {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 2px;
		width: 100%;
		max-width: 180px;
	}
	.quad {
		display: grid;
		justify-items: center;
		align-content: center;
		gap: 0;
		min-height: max(var(--target-min), 44px);
		padding: 2px;
		line-height: 1.15;
	}
	.q-short {
		font-weight: var(--weight-semibold);
		font-size: var(--text-xs);
		color: var(--text-2);
	}
	.q-state {
		font-size: var(--text-xs);
		color: var(--text-3);
	}
	.quad.full .q-state {
		color: var(--ok);
	}
	.quad.defect {
		background: var(--abnormal-soft);
		border-color: var(--abnormal);
	}
	.quad.defect .q-state,
	.quad.defect .q-short {
		color: var(--abnormal);
		font-weight: var(--weight-semibold);
	}
	.quad.ghost {
		outline: 2px dashed var(--accent);
		outline-offset: -2px;
	}
	.quad.copied {
		background: var(--copied-tint);
	}
	.mental {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1) var(--space-4);
		padding: var(--space-2) var(--space-3);
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
		background: var(--default-tint);
		border: 1px solid var(--hairline);
	}
	.swatch.copied {
		background: var(--copied-tint);
		margin-inline-start: var(--space-3);
	}
	.sep {
		margin-inline-start: var(--space-3);
	}
	/* ---- dilation block ---- */
	.dil {
		border-top: 1px solid var(--hairline);
		padding: var(--space-2) var(--space-3);
		display: grid;
		gap: var(--space-2);
	}
	.dil-head {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}
	h4 {
		font-size: var(--text-sm);
		font-weight: var(--weight-semibold);
		margin: 0;
	}
	.dil-state {
		font-size: var(--text-xs);
		color: var(--text-3);
	}
	.drops {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1);
	}
	.drop {
		display: inline-flex;
		align-items: stretch;
		border: 1px solid var(--hairline);
		border-radius: var(--radius-1);
		min-width: 0;
	}
	.drop.on {
		border-color: var(--accent);
		background: var(--accent-soft);
	}
	.drop.ghost {
		outline: 2px dashed var(--accent);
		outline-offset: -2px;
	}
	.drop.copied {
		background: var(--copied-tint);
	}
	.drop-btn {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		min-height: max(var(--target-min), 40px);
		border: 0;
		background: transparent;
		color: var(--text-1);
		font-size: var(--text-xs);
		padding: 0 var(--space-2);
	}
	.drop.on .drop-btn {
		color: var(--accent);
		font-weight: var(--weight-semibold);
	}
	.tick {
		width: 1em;
		text-align: center;
	}
	.strength {
		color: var(--text-2);
	}
	.strength-pick {
		font: inherit;
		font-size: var(--text-xs);
		color: var(--text-1);
		background: transparent;
		border: 0;
		border-inline-start: 1px solid var(--hairline);
		min-height: max(var(--target-min), 40px);
		padding: 0 var(--space-1);
	}
	.drop-btn:focus-visible,
	.strength-pick:focus-visible {
		outline: 2px solid var(--focus-ring);
		outline-offset: 1px;
	}
	.dil-row {
		display: flex;
		flex-wrap: wrap;
		align-items: end;
		gap: var(--space-2) var(--space-3);
	}
	.dil-other,
	.dil-time {
		display: grid;
		gap: 2px;
		font-size: var(--text-xs);
		color: var(--text-2);
		min-width: 0;
	}
	.dil-other {
		flex: 1 1 10em;
	}
	.dil-other input {
		width: 100%;
	}
	.dil-other.ghost input {
		color: var(--accent);
		font-style: italic;
	}
	.dil-other.copied input {
		background: var(--copied-tint);
	}
	.tall {
		min-height: max(var(--target-min), 40px);
	}
	.dil-hint {
		margin: 0;
		font-size: var(--text-xs);
		color: var(--text-3);
	}
	.dil-hint code {
		font-family: var(--font-mono);
	}
</style>
