<script lang="ts">
	// Impression/Plan Builder (spec §10.2): candidate diagnoses from exam findings, POH/POS and PMH.
	// Rows start selected; "Add selected" adds every selected row from the included sources; a row's
	// Add button or a double-click adds only that row (FIX); rows can be dragged onto the list or the New Dx box.
	import type { Candidate, CandidateSet } from '#lib/plan/types.ts';
	import { useI18n } from '#lib/i18n/context.ts';
	import { tip } from '#lib/components/ui/tooltip.ts';
	import { glossary } from '#lib/i18n/glossary.ts';

	let {
		set,
		loading,
		error,
		inList,
		onadd,
		onaddmany,
		onrefresh
	}: {
		set: CandidateSet | null;
		loading: boolean;
		error: string;
		/** True when this row's item is already in the impression list. */
		inList: (c: Candidate) => boolean;
		onadd: (c: Candidate) => void;
		onaddmany: (cs: Candidate[]) => void;
		onrefresh: () => void;
	} = $props();
	const { t } = useI18n();

	let include = $state({ finding: true, poh: true, pmh: false });
	/** Unticked rows (everything else starts selected). */
	let unticked = $state<Record<string, boolean>>({});

	const SOURCES = [
		{ id: 'finding', label: 'plan.srcFindings', empty: 'plan.srcFindingsEmpty' },
		{ id: 'poh', label: 'plan.srcPoh', empty: 'plan.srcPohEmpty' },
		{ id: 'pmh', label: 'plan.srcPmh', empty: 'plan.srcPmhEmpty' }
	] as const;

	/** What POH / POS / PMH stand for. */
	const sourceTip = (id: 'finding' | 'poh' | 'pmh') =>
		id === 'poh' ? `POH: ${glossary('POH', t)} · POS: ${glossary('POS', t)}` : id === 'pmh' ? `PMH: ${glossary('PMH', t)}` : null;
	const rowsOf = (id: 'finding' | 'poh' | 'pmh') => (set ? (id === 'finding' ? set.findings : set[id]) : []);
	const selected = (c: Candidate) => !unticked[c.key] && !inList(c);
	const toAdd = $derived(SOURCES.filter((s) => include[s.id]).flatMap((s) => rowsOf(s.id).filter(selected)));

	function dragstart(e: DragEvent, c: Candidate) {
		if (!e.dataTransfer) return;
		e.dataTransfer.effectAllowed = 'copy';
		e.dataTransfer.setData('application/x-openvision-candidate', c.key);
		e.dataTransfer.setData('text/plain', `${c.title}${c.codes ? ` ${c.codes}` : ''}`);
	}
</script>

<div class="builder">
	<fieldset class="sources">
		<legend>{t('plan.include')}</legend>
		{#each SOURCES as s (s.id)}
			<label class="check">
				<input type="checkbox" bind:checked={include[s.id]} />
				<span use:tip={sourceTip(s.id) ? { text: sourceTip(s.id)!, host: true } : null}>{t(s.label)}</span>
				<span class="count">({rowsOf(s.id).length})</span>
			</label>
		{/each}
	</fieldset>

	<div class="actions">
		<button type="button" class="primary" onclick={() => onaddmany(toAdd)} disabled={!toAdd.length}>
			<span class="flip-rtl" aria-hidden="true">↩</span> {t('plan.addSelected', { n: toAdd.length })}
		</button>
		<button type="button" onclick={onrefresh} disabled={loading}>{loading ? t('plan.updating') : t('plan.refresh')}</button>
	</div>
	<p class="help">{t('plan.builderHelp')}</p>
	{#if error}<p class="error" role="alert">{error}</p>{/if}

	{#each SOURCES as s (s.id)}
		{#if include[s.id]}
			<section class="group" aria-labelledby="bld-{s.id}">
				<h4 id="bld-{s.id}"><span use:tip={sourceTip(s.id)}>{t(s.label)}</span></h4>
				{#if rowsOf(s.id).length}
					<ul>
						{#each rowsOf(s.id) as c (c.key)}
							{@const added = inList(c)}
							<li class:added draggable="true" ondragstart={(e) => dragstart(e, c)} ondblclick={() => onadd(c)}>
								<label class="check row-check">
									<input
										type="checkbox"
										checked={selected(c)}
										disabled={added}
										onchange={(e) => (unticked[c.key] = !e.currentTarget.checked)}
									/>
									<span class="title">{c.title}</span>
								</label>
								<span class="code" use:tip={c.codes ? null : t('tips.noCode')}>{c.codes || t('plan.noCode')}</span>
								{#if added}
									<span class="badge">{t('plan.inList')}</span>
								{:else}
									<button type="button" class="add" onclick={() => onadd(c)} aria-label={t('plan.addRowAria', { title: c.title })}>{t('plan.add')}</button>
								{/if}
							</li>
						{/each}
					</ul>
				{:else}
					<p class="empty">{loading && !set ? t('plan.loading') : t(s.empty)}</p>
				{/if}
			</section>
		{/if}
	{/each}
</div>

<style>
	.builder {
		display: grid;
		gap: var(--space-2);
		min-width: 0;
	}
	.sources {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1) var(--space-3);
		margin: 0;
		padding: 0;
		border: 0;
	}
	legend {
		padding: 0;
		margin-bottom: 2px;
		color: var(--text-2);
		font-size: var(--text-xs);
		font-weight: var(--weight-semibold);
	}
	.check {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		min-height: 40px;
		cursor: pointer;
	}
	.check input {
		width: 20px;
		height: 20px;
		margin: 0;
		accent-color: var(--accent);
	}
	.count {
		color: var(--text-3);
		font-variant-numeric: tabular-nums;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}
	.actions button {
		min-height: 40px;
	}
	.primary {
		background: var(--accent);
		color: var(--accent-text);
		border-color: var(--accent);
		font-weight: var(--weight-semibold);
	}
	.primary:hover {
		background: var(--accent);
		filter: brightness(1.08);
	}
	.primary:disabled {
		background: var(--surface-2);
		color: var(--text-3);
		border-color: var(--hairline);
		filter: none;
	}
	.help,
	.empty {
		margin: 0;
		font-size: var(--text-xs);
		color: var(--text-3);
	}
	.error {
		margin: 0;
		color: var(--danger);
	}
	.group {
		display: grid;
		gap: var(--space-1);
	}
	h4 {
		margin: var(--space-1) 0 0;
		font-size: var(--text-xs);
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--text-3);
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 2px;
	}
	li {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto auto;
		align-items: center;
		gap: var(--space-2);
		padding-block: 0;
		padding-inline: var(--space-2) var(--space-1);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-1);
		background: var(--surface-1);
		cursor: grab;
	}
	li.added {
		background: var(--surface-2);
		color: var(--text-3);
	}
	.row-check {
		min-width: 0;
	}
	.title {
		overflow-wrap: anywhere;
	}
	.code {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--text-2);
		text-align: end;
		max-width: 12em;
		overflow-wrap: anywhere;
	}
	.add {
		min-height: 40px;
		min-width: 56px;
	}
	.badge {
		font-size: var(--text-xs);
		padding: 2px 8px;
		border-radius: var(--radius-pill);
		background: var(--accent-soft);
		color: var(--accent);
		white-space: nowrap;
	}
</style>
