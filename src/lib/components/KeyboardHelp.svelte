<script lang="ts">
	// Keyboard and shorthand help sheet (D56). Opened with ? (not in a text box), F1, the "?" button on
	// the shorthand bar, the desktop Help menu, or openKeyboardHelp({ filter }) from anywhere (e.g. a
	// row's code hint). Everything listed comes from the modules the page itself uses: shortcuts.ts for
	// keys, SECTIONS for 1-0, and the parser's codes for the table, so the sheet never drifts.
	// Native modal <dialog>: focus moves in, Esc closes, focus goes back to where it was.
	import { onMount, tick } from 'svelte';
	import { sectionLabel, type Section, type SectionId } from '#lib/exam/catalog.ts';
	import { KEYBOARD_HELP_EVENT, SHORTCUTS, type KeyboardHelpOptions, type Shortcut } from '#lib/exam/shortcuts.ts';
	import { codeRows, matchTier, type CodeRow } from '#lib/shorthand/suggest.ts';
	import { describeCodePlain } from '#lib/shorthand/describe.ts';
	import { useI18n } from '#lib/i18n/context.ts';
	import type { MessageKey } from '#lib/i18n/catalog.ts';

	let { sections, current }: { sections: readonly Pick<Section, 'id' | 'key'>[]; current: SectionId } = $props();
	const { t } = useI18n();

	let dialog = $state<HTMLDialogElement>();
	let filterInput = $state<HTMLInputElement>();
	let titleEl = $state<HTMLHeadingElement>();
	let filter = $state('');
	let scope = $state<'section' | 'all'>('section');
	let returnTo: HTMLElement | null = null;

	const GROUPS: { id: Shortcut['group']; label: MessageKey }[] = [
		{ id: 'typing', label: 'keys.groupTyping' },
		{ id: 'panels', label: 'keys.groupPanels' },
		{ id: 'actions', label: 'keys.groupActions' }
	];
	// "Show this help" is one row with both keys.
	const shortcutRows = $derived(
		GROUPS.map((g) => ({
			...g,
			rows: SHORTCUTS.filter((s) => s.group === g.id && s.id !== 'helpF1').map((s) => ({
				keys: s.id === 'help' ? [['?'], ['F1']] : [s.keys],
				label: s.label
			}))
		}))
	);

	const GRAMMAR: { example: string[]; text: MessageKey }[] = [
		{ example: ['rc:1+ inj'], text: 'keys.gField' },
		{ example: ['lk:tr spk', 'bk:clear'], text: 'keys.gEye' },
		{ example: ['rl:NS.a'], text: 'keys.gAppend' },
		{ example: ['d', 'das'], text: 'keys.gNormal' },
		{ example: ['rc:quiet; papillae'], text: 'keys.gSeparator' },
		{ example: ['pmh:hypertension'], text: 'keys.gHistory' }
	];

	const ROWS: CodeRow[] = codeRows();
	const described = $derived(ROWS.map((r) => ({ row: r, text: describeCodePlain(r.entry, t), where: whereOf(r) })));

	function whereOf(r: CodeRow): string {
		if (r.entry.kind === 'issue') return t('keys.sectionHistory');
		if (!r.entry.section) return t('keys.sectionAll');
		return sectionLabel(r.entry.section, t);
	}

	// Same matching as the bar's suggestions: exact code, then code prefix, word start, anywhere.
	const shown = $derived.by(() => {
		const q = filter.trim().toLocaleLowerCase();
		const inScope = described.filter(({ row }) => scope === 'all' || row.entry.section === current);
		if (!q) return inScope;
		return inScope
			.map((d) => {
				const tierOf = (c: string) => {
					if (c.toLocaleLowerCase() === q) return 0;
					const m = matchTier({ primary: c, secondary: `${d.text} ${d.where}` }, q);
					return m < 0 ? Infinity : m + 1;
				};
				return { d, tier: Math.min(...d.row.codes.map(tierOf)) };
			})
			.filter((x) => x.tier !== Infinity)
			.sort((a, b) => a.tier - b.tier)
			.map((x) => x.d);
	});

	export async function show(opts: KeyboardHelpOptions = {}) {
		if (!dialog) return;
		if (!dialog.open) returnTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		filter = opts.filter ?? '';
		scope = opts.filter ? 'all' : 'section';
		if (!dialog.open) dialog.showModal();
		await tick();
		// Opened for a code: straight to the filtered table. Otherwise from the top, on the title.
		if (opts.filter) {
			filterInput?.focus();
			filterInput?.select();
		} else {
			dialog.scrollTop = 0;
			titleEl?.focus();
		}
	}

	function close() {
		dialog?.close();
	}

	function onclose() {
		const back = returnTo?.isConnected ? returnTo : document.getElementById('shorthand');
		returnTo = null;
		back?.focus();
	}

	function printSheet() {
		const root = document.documentElement;
		root.classList.add('kh-printing');
		const done = () => root.classList.remove('kh-printing');
		window.addEventListener('afterprint', done, { once: true });
		window.print();
		setTimeout(done, 1000);
	}

	function onkeydown(e: KeyboardEvent) {
		// Keys pressed in the sheet stay in the sheet: no section switching or panel changes behind it.
		e.stopPropagation();
		if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'p') {
			e.preventDefault();
			printSheet();
		}
	}

	onMount(() => {
		const open = (e: Event) => void show((e as CustomEvent<KeyboardHelpOptions>).detail ?? {});
		window.addEventListener(KEYBOARD_HELP_EVENT, open);
		return () => window.removeEventListener(KEYBOARD_HELP_EVENT, open);
	});
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<dialog class="kh" bind:this={dialog} aria-labelledby="kh-title" {onclose} {onkeydown}>
	<header>
		<h2 id="kh-title" tabindex="-1" bind:this={titleEl}>{t('keys.title')}</h2>
		<span class="actions">
			<button type="button" class="no-print" onclick={printSheet}>{t('keys.print')}</button>
			<button type="button" class="no-print" onclick={close}>{t('keys.close')}</button>
		</span>
	</header>
	<p class="intro">{t('keys.intro')}</p>

	<section aria-labelledby="kh-keys">
		<h3 id="kh-keys">{t('keys.keysHeading')}</h3>
		<div class="cols">
			<table>
				<caption>{t('keys.sectionKeysHeading')}</caption>
				<thead><tr><th scope="col">{t('keys.colKeys')}</th><th scope="col">{t('keys.colAction')}</th></tr></thead>
				<tbody>
					{#each sections as s (s.id)}
						<tr><td><kbd>{s.key}</kbd></td><td>{t('keys.sectionKey', { section: sectionLabel(s.id, t) })}</td></tr>
					{/each}
				</tbody>
			</table>
			{#each shortcutRows as g (g.id)}
				<table>
					<caption>{t(g.label)}</caption>
					<thead><tr><th scope="col">{t('keys.colKeys')}</th><th scope="col">{t('keys.colAction')}</th></tr></thead>
					<tbody>
						{#each g.rows as r (r.label)}
							<tr>
								<td class="keys" dir="ltr"
									>{#each r.keys as combo, ci (ci)}{#if ci > 0}<span class="or"> / </span>{/if}{#each combo as k, ki (ki)}{#if ki > 0}+{/if}<kbd>{k}</kbd>{/each}{/each}</td
								>
								<td>{t(r.label)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			{/each}
		</div>
	</section>

	<section aria-labelledby="kh-shorthand">
		<h3 id="kh-shorthand">{t('keys.shorthandHeading')}</h3>
		<table class="grammar">
			<thead><tr><th scope="col">{t('keys.colExample')}</th><th scope="col">{t('keys.colMeaning')}</th></tr></thead>
			<tbody>
				{#each GRAMMAR as g (g.text)}
					<tr>
						<td dir="ltr">{#each g.example as ex, i (i)}{#if i > 0}<span class="or"> · </span>{/if}<code>{ex}</code>{/each}</td>
						<td>{t(g.text)}</td>
					</tr>
				{/each}
				<tr><td dir="ltr"><kbd>Enter</kbd><span class="or"> · </span><kbd>Esc</kbd></td><td>{t('keys.gEnter')}</td></tr>
				<tr><td dir="ltr"><kbd>↑</kbd> <kbd>↓</kbd><span class="or"> · </span><kbd>Tab</kbd></td><td>{t('keys.gSuggest')}</td></tr>
			</tbody>
		</table>
	</section>

	<section aria-labelledby="kh-codes">
		<h3 id="kh-codes">{t('keys.codesHeading')}</h3>
		<div class="filters no-print">
			<span class="filter">
				<label for="kh-filter">{t('keys.filterLabel')}</label>
				<input id="kh-filter" type="text" bind:this={filterInput} bind:value={filter} placeholder={t('keys.filterPlaceholder')} autocomplete="off" spellcheck="false" aria-describedby="kh-count" />
			</span>
			<fieldset>
				<legend>{t('keys.scopeLabel')}</legend>
				<label><input type="radio" name="kh-scope" value="section" bind:group={scope} />{t('keys.scopeSection', { section: sectionLabel(current, t) })}</label>
				<label><input type="radio" name="kh-scope" value="all" bind:group={scope} />{t('keys.scopeAll')}</label>
			</fieldset>
		</div>
		<p id="kh-count" class="count" role="status">{t('keys.codesShown', { count: shown.length })}</p>
		{#if shown.length}
			<table class="codes">
				<thead><tr><th scope="col">{t('keys.colCode')}</th><th scope="col">{t('keys.colWritesTo')}</th><th scope="col">{t('keys.colSection')}</th></tr></thead>
				<tbody>
					{#each shown as { row, text, where } (row.codes[0])}
						<tr>
							<td dir="ltr">{#each row.codes as c, i (c)}{#if i > 0}<span class="or"> · </span>{/if}<code>{c.toLowerCase()}</code>{/each}</td>
							<td>{text}</td>
							<td>{where}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{:else}
			<p class="empty">{filter.trim() ? t('keys.noCodes', { query: filter.trim() }) : t('keys.noCodesSection')}</p>
		{/if}
		<p class="note">{t('keys.fieldIdsNote')}</p>
	</section>
</dialog>

<style>
	.kh {
		width: min(56rem, calc(100vw - 32px));
		max-height: min(90vh, 60rem);
		padding: 0 var(--space-5) var(--space-4);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-2);
		background: var(--surface-3);
		color: var(--text-1);
		box-shadow: var(--shadow-overlay);
		overflow-y: auto;
	}
	.kh::backdrop {
		background: rgb(0 0 0 / 0.35);
	}
	header {
		position: sticky;
		top: 0;
		z-index: 1;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		flex-wrap: wrap;
		padding: var(--space-4) 0 var(--space-2);
		background: var(--surface-3);
		border-bottom: 1px solid var(--hairline);
	}
	h2 {
		font-size: var(--text-md);
		margin: 0;
	}
	h3 {
		font-size: var(--text-sm);
		margin: var(--space-4) 0 var(--space-2);
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--text-2);
	}
	.actions {
		display: inline-flex;
		gap: var(--space-2);
	}
	.actions button {
		min-height: var(--target-min);
	}
	.intro,
	.note,
	.count,
	.empty {
		font-size: var(--text-sm);
		color: var(--text-2);
		margin: var(--space-2) 0;
	}
	.cols {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
		gap: var(--space-3) var(--space-5);
		align-items: start;
	}
	table {
		border-collapse: collapse;
		width: 100%;
		font-size: var(--text-sm);
	}
	caption {
		text-align: start;
		font-weight: var(--weight-semibold);
		padding-bottom: var(--space-1);
	}
	th {
		text-align: start;
		font-weight: var(--weight-semibold);
		color: var(--text-2);
		font-size: var(--text-xs);
		border-bottom: 1px solid var(--hairline);
		padding: var(--space-1) var(--space-2) var(--space-1) 0;
	}
	td {
		padding: var(--space-1) var(--space-2) var(--space-1) 0;
		border-bottom: 1px solid var(--hairline);
		vertical-align: baseline;
	}
	td:first-child {
		white-space: nowrap;
		width: 1%;
		padding-inline-end: var(--space-4);
	}
	/* Narrow screens: key and example cells wrap too, so the sheet never scrolls sideways. */
	@media (max-width: 40rem) {
		td:first-child {
			white-space: normal;
			width: auto;
			padding-inline-end: var(--space-2);
		}
		td {
			overflow-wrap: anywhere;
		}
		.codes {
			table-layout: fixed;
		}
	}
	/* Codes cell: several codes may wrap (BCN7 · BCNVII · CN7 …). */
	.codes td:first-child {
		white-space: normal;
		width: 30%;
	}
	kbd,
	code {
		font-family: var(--font-mono);
		font-size: 0.95em;
		padding: 0 4px;
		border: 1px solid var(--hairline);
		border-radius: var(--radius-1);
		background: var(--surface-1);
		white-space: nowrap;
	}
	.or {
		color: var(--text-3);
	}
	.filters {
		display: flex;
		gap: var(--space-3) var(--space-5);
		flex-wrap: wrap;
		align-items: end;
	}
	.filter {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		flex: 1 1 16rem;
	}
	.filter label,
	legend {
		font-size: var(--text-xs);
		color: var(--text-2);
	}
	.filter input {
		min-height: max(var(--target-min), 2.25rem);
		font: inherit;
		color: var(--text-1);
		background: var(--surface-0);
		border: 1px solid var(--hairline-strong, var(--hairline));
		border-radius: var(--radius-1);
		padding: 0 var(--space-2);
	}
	fieldset {
		border: 0;
		margin: 0;
		padding: 0;
		display: flex;
		gap: var(--space-3);
		flex-wrap: wrap;
		align-items: center;
	}
	legend {
		padding: 0;
		margin-bottom: var(--space-1);
		width: 100%;
	}
	fieldset label {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		min-height: var(--target-min);
		font-size: var(--text-sm);
	}
	@media print {
		.kh {
			position: static;
			width: auto;
			max-height: none;
			overflow: visible;
			border: 0;
			box-shadow: none;
			padding: 0;
			background: #fff;
			color: #000;
		}
		.kh::backdrop {
			display: none;
		}
		header {
			position: static;
			background: none;
		}
		.no-print {
			display: none;
		}
		tr {
			break-inside: avoid;
		}
		kbd,
		code {
			background: none;
		}
	}
	/* Printing the sheet: only the dialog goes on paper (the exam page's own print rules hide the rest). */
	@media print {
		:global(html.kh-printing body > *:not(:has(dialog.kh[open]))),
		:global(html.kh-printing .print-hint) {
			display: none !important;
		}
		:global(html.kh-printing .frame) {
			display: none !important;
		}
	}
</style>
