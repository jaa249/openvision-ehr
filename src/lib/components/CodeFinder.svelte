<script lang="ts">
	// Diagnosis code finder (spec §10.4, D44): a combobox over GET /api/codes/dx?q=, which searches the
	// practice's code set (ICD-10-CM or WHO ICD-11) and says which one it is.
	// Keyboard: type to search, Up/Down to move, Enter to pick, Escape closes the list (a second Escape cancels).
	// The parent shows it in place of its "Code" button and puts focus back there on pick or cancel.
	// ICD-11: OD / OS / OU append the eye as a laterality extension code; a category (not a leaf) cannot
	// be saved, so picking one lists the codes under it instead. WHO's citation is shown under the box.
	import { onMount } from 'svelte';
	import { CODE_SETS, ICD11_CITATION, withLaterality, type CodeSetId, type DxCode, type DxSearchResult, type LateralitySide } from '#lib/codesets/index.ts';
	import { useI18n } from '#lib/i18n/context.ts';
	import type { MessageKey } from '#lib/i18n/catalog.ts';

	let {
		id,
		label,
		onpick,
		oncancel,
		autofocus = true
	}: {
		id: string;
		label: string;
		onpick: (code: DxCode) => void;
		oncancel: () => void;
		autofocus?: boolean;
	} = $props();
	const { t } = useI18n();

	let query = $state('');
	let results = $state<DxCode[]>([]);
	let system = $state<CodeSetId | null>(null);
	let eye = $state<LateralitySide | null>(null);
	let active = $state(-1);
	let open = $state(false);
	let searching = $state(false);
	let failed = $state(false);
	let input: HTMLInputElement | null = $state(null);
	const listId = $derived(`${id}-list`);
	const optId = (i: number) => `${id}-opt-${i}`;
	const icd11 = $derived(system === 'icd11');
	// OD / OS / OU are international and stay as they are; the eye's name and the help sentence translate.
	const EYES: { side: LateralitySide; label: string; name: MessageKey; added: MessageKey }[] = [
		{ side: 'R', label: 'OD', name: 'codes.finderEyeRight', added: 'codes.finderEyeAddedRight' },
		{ side: 'L', label: 'OS', name: 'codes.finderEyeLeft', added: 'codes.finderEyeAddedLeft' },
		{ side: 'B', label: 'OU', name: 'codes.finderEyeBoth', added: 'codes.finderEyeAddedBoth' }
	];
	const eyeAdded = $derived(EYES.find((x) => x.side === eye)?.added);

	let timer: ReturnType<typeof setTimeout> | undefined;
	let requestId = 0;

	onMount(() => {
		if (autofocus) input?.focus();
		// Learn which code set is active before the first search (labels, eye buttons, citation).
		fetch('/api/codes/dx?q=')
			.then((r) => (r.ok ? (r.json() as Promise<DxSearchResult>) : null))
			.then((d) => {
				if (d && !system) system = d.system;
			})
			.catch(() => {});
		return () => clearTimeout(timer);
	});

	function search(q: string) {
		clearTimeout(timer);
		if (q.trim().length < 2) {
			results = [];
			open = false;
			searching = false;
			return;
		}
		searching = true;
		timer = setTimeout(async () => {
			const rid = ++requestId;
			try {
				const res = await fetch(`/api/codes/dx?q=${encodeURIComponent(q.trim())}`);
				if (!res.ok) throw new Error(String(res.status));
				const data = (await res.json()) as DxSearchResult;
				if (rid !== requestId) return;
				system = data.system;
				results = data.codes;
				active = data.codes.length ? 0 : -1;
				open = true;
				failed = false;
			} catch {
				if (rid === requestId) {
					failed = true;
					results = [];
					open = true;
				}
			} finally {
				if (rid === requestId) searching = false;
			}
		}, 200);
	}

	function pick(c: DxCode) {
		if (!c.leaf) {
			// A category: show the codes under it (search by its code).
			query = c.code;
			search(query);
			input?.focus();
			return;
		}
		open = false;
		onpick(icd11 && eye ? { ...c, code: withLaterality(c.code, eye) } : c);
	}

	function keydown(e: KeyboardEvent) {
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			if (!open && results.length) open = true;
			else if (results.length) active = (active + 1) % results.length;
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			if (results.length) active = (active - 1 + results.length) % results.length;
		} else if (e.key === 'Home' && open && results.length) {
			e.preventDefault();
			active = 0;
		} else if (e.key === 'End' && open && results.length) {
			e.preventDefault();
			active = results.length - 1;
		} else if (e.key === 'Enter') {
			e.preventDefault();
			if (open && active >= 0 && results[active]) pick(results[active]);
		} else if (e.key === 'Escape') {
			e.preventDefault();
			e.stopPropagation();
			if (open) open = false;
			else oncancel();
		}
	}

	$effect(() => {
		if (active >= 0) document.getElementById(optId(active))?.scrollIntoView({ block: 'nearest' });
	});
</script>

<div class="finder">
	<label class="visually-hidden" for={id}>{label}</label>
	<input
		bind:this={input}
		{id}
		type="text"
		role="combobox"
		aria-autocomplete="list"
		aria-expanded={open}
		aria-controls={listId}
		aria-activedescendant={open && active >= 0 ? optId(active) : undefined}
		aria-describedby="{id}-help"
		autocomplete="off"
		spellcheck="false"
		placeholder={icd11 ? t('codes.finderPlaceholderIcd11') : t('codes.finderPlaceholderIcd10')}
		bind:value={query}
		oninput={() => search(query)}
		onkeydown={keydown}
		onblur={() => (open = false)}
	/>
	<button type="button" class="cancel" onclick={oncancel} aria-label={t('codes.finderClose')}>{t('codes.finderCancel')}</button>
	{#if icd11}
		<div class="eyes" role="group" aria-label={t('codes.finderEyeGroup')}>
			<span class="eyes-label" aria-hidden="true">{t('codes.finderEyeLabel')}</span>
			{#each EYES as x (x.side)}
				<button
					type="button"
					class="eye"
					aria-pressed={eye === x.side}
					aria-label={t('codes.finderEyeAria', { eye: x.label, name: t(x.name) })}
					onpointerdown={(e) => e.preventDefault()}
					onclick={() => (eye = eye === x.side ? null : x.side)}>{x.label}</button
				>
			{/each}
		</div>
	{/if}
	<p class="help" id="{id}-help">
		{t('codes.finderKeys')}
		{#if system === 'icd10cm'}{t('codes.finderBillableOnly', { set: CODE_SETS.icd10cm.short })}{:else if icd11}{t('codes.finderIcd11Release', { set: t('codes.setIcd11') })}
			{eyeAdded ? t(eyeAdded) : t('codes.finderChooseEye')}{/if}
	</p>
	{#if icd11}<p class="cite">{t('codes.finderCitation', { citation: ICD11_CITATION })}</p>{/if}
	<p class="visually-hidden" role="status">
		{#if open && !searching}{failed ? t('codes.finderFailed') : t('codes.finderFound', { count: results.length })}{/if}
	</p>
	{#if open}
		<ul id={listId} role="listbox" aria-label={t('codes.finderMatching')}>
			{#each results as c, i (c.code)}
				<!-- Keyboard choice happens in the combobox input (aria-activedescendant); a click here is the pointer path. -->
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<li
					id={optId(i)}
					role="option"
					aria-selected={i === active}
					class:active={i === active}
					onpointerdown={(e) => e.preventDefault()}
					onclick={() => pick(c)}
					onpointerenter={() => (active = i)}
				>
					<span class="code">{c.code}</span>
					<span class="desc">{c.description}{#if !c.leaf}<span class="cat"> · {t('codes.finderCategory')}</span>{/if}</span>
				</li>
			{:else}
				<li class="empty" role="presentation">
					{failed ? t('codes.finderFailedConnection') : icd11 ? t('codes.finderNoIcd11') : t('codes.finderNoBillable')}
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.finder {
		position: relative;
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: var(--space-1) var(--space-2);
		align-items: center;
	}
	input {
		font: inherit;
		color: var(--text-1);
		background: var(--surface-1);
		border: 1px solid var(--accent);
		border-radius: var(--radius-1);
		padding: 4px var(--space-2);
		min-height: max(var(--target-min), 40px);
		width: 100%;
		min-width: 0;
	}
	input:focus {
		outline: none;
		box-shadow: 0 0 0 1px var(--focus-ring);
	}
	input::placeholder {
		color: var(--text-3);
	}
	.cancel {
		min-height: max(var(--target-min), 40px);
	}
	.eyes {
		grid-column: 1 / -1;
		display: flex;
		align-items: center;
		gap: var(--space-1);
	}
	.eyes-label {
		font-size: var(--text-xs);
		color: var(--text-3);
	}
	.eye {
		min-width: 48px;
		min-height: 40px;
		font-family: var(--font-mono);
	}
	.eye[aria-pressed='true'] {
		background: var(--accent-soft);
		border-color: var(--accent);
		color: var(--text-1);
		font-weight: var(--weight-semibold);
	}
	.help,
	.cite {
		grid-column: 1 / -1;
		margin: 0;
		font-size: var(--text-xs);
		color: var(--text-3);
	}
	ul {
		position: absolute;
		z-index: 20;
		top: calc(max(var(--target-min), 40px) + 2px);
		left: 0;
		right: 0;
		max-height: 18rem;
		overflow-y: auto;
		margin: 0;
		padding: var(--space-1) 0;
		list-style: none;
		background: var(--surface-3);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-2);
		box-shadow: var(--shadow-overlay);
	}
	li {
		display: grid;
		grid-template-columns: 6.5em minmax(0, 1fr);
		gap: var(--space-2);
		align-items: baseline;
		padding: var(--space-2) var(--space-3);
		min-height: 40px;
		cursor: pointer;
	}
	li.active {
		background: var(--accent-soft);
		box-shadow: inset 3px 0 0 var(--accent);
	}
	.code {
		font-family: var(--font-mono);
		font-weight: var(--weight-semibold);
	}
	.desc {
		color: var(--text-2);
	}
	.cat {
		color: var(--text-3);
		font-size: var(--text-xs);
	}
	li.empty {
		display: block;
		color: var(--text-3);
		cursor: default;
	}
</style>
