<script lang="ts">
	// Settings › Code sets (D49): each diagnosis code set with its publisher, licence (WHO citation for
	// ICD-11) and status, and Download / Import file / Remove. Nothing is shipped with OpenVision.
	import {
		downloadLanguage,
		downloadSet,
		importLanguage,
		importSet,
		removeLanguage,
		removeSet,
		type CodeSetResult,
		type CodeSetState,
		type Icd11LanguageResult,
		type Icd11LanguageState
	} from '#lib/codesets/admin_client.ts';
	import { icd11LanguageName } from '#lib/codesets/releases.ts';
	import type { CodeSetId } from '#lib/codesets/index.ts';
	import Msg from '#lib/i18n/Msg.svelte';
	import { useI18n } from '#lib/i18n/context.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const { t, date, locale } = useI18n();
	const setName = (id: CodeSetId) => (id === 'icd11' ? t('codes.setIcd11') : t('codes.setIcd10cm'));

	// Live state per set: starts from the page data, replaced by each API answer.
	let states = $state<Partial<Record<CodeSetId, CodeSetState>>>({});
	const stateOf = (id: CodeSetId): CodeSetState => states[id] ?? data.sets.find((s) => s.set === id)!;
	let busy = $state<Partial<Record<CodeSetId, 'download' | 'import' | 'remove'>>>({});
	let notes = $state<Partial<Record<CodeSetId, { ok: boolean; text: string }>>>({});
	const inputs: Partial<Record<CodeSetId, HTMLInputElement>> = {};

	async function run(id: CodeSetId, kind: 'download' | 'import' | 'remove', go: () => Promise<CodeSetResult>) {
		busy[id] = kind;
		notes[id] = undefined;
		const r = await go();
		busy[id] = undefined;
		if (r.ok) {
			states[id] = r.state;
			notes[id] = { ok: true, text: kind === 'remove' ? t('settings.codeSetsRemoved') : t('settings.codeSetsDone', { count: r.state.rows }) };
		} else {
			notes[id] = {
				ok: false,
				text: r.message || (r.status ? t('settings.codeSetsFailed', { status: r.status }) : t('settings.codeSetsNoConnection'))
			};
		}
	}

	function picked(id: CodeSetId, e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (file) run(id, 'import', () => importSet(id, file));
	}

	function remove(id: CodeSetId) {
		if (!confirm(t('settings.codeSetsRemoveConfirm', { set: setName(id) }))) return;
		run(id, 'remove', () => removeSet(id));
	}

	// WHO's ICD-11 titles in other languages (D50): one row per WHO language file, same actions as a set.
	let langStates = $state<Record<string, Icd11LanguageState>>({});
	const langOf = (lang: string): Icd11LanguageState => langStates[lang] ?? data.languages.find((l) => l.lang === lang)!;
	let langBusy = $state<Record<string, 'download' | 'import' | 'remove' | undefined>>({});
	let langNotes = $state<Record<string, { ok: boolean; text: string } | undefined>>({});
	const langInputs: Record<string, HTMLInputElement> = {};
	/** The language in the reader's language, with its own name when that differs ("alemán (Deutsch)"). */
	const langLabel = (lang: string) => {
		const here = icd11LanguageName(lang, locale);
		const own = icd11LanguageName(lang, lang);
		return own && own.toLowerCase() !== here.toLowerCase() ? `${here} (${own})` : here;
	};

	async function runLang(lang: string, kind: 'download' | 'import' | 'remove', go: () => Promise<Icd11LanguageResult>) {
		langBusy[lang] = kind;
		langNotes[lang] = undefined;
		const r = await go();
		langBusy[lang] = undefined;
		if (r.ok) {
			langStates[lang] = r.state;
			langNotes[lang] = { ok: true, text: kind === 'remove' ? t('settings.codeSetsRemoved') : t('settings.codeSetsLangDone', { count: r.state.rows }) };
		} else {
			langNotes[lang] = {
				ok: false,
				text: r.message || (r.status ? t('settings.codeSetsFailed', { status: r.status }) : t('settings.codeSetsNoConnection'))
			};
		}
	}

	function pickedLang(lang: string, e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (file) runLang(lang, 'import', () => importLanguage(lang, file));
	}

	function removeLang(lang: string) {
		if (!confirm(t('settings.codeSetsLangRemoveConfirm', { language: icd11LanguageName(lang, locale) }))) return;
		runLang(lang, 'remove', () => removeLanguage(lang));
	}
</script>

<svelte:head><title>{t('settings.codeSetsTitle')}</title></svelte:head>

<h2>{t('settings.codeSetsHeading')}</h2>
<p class="lead">{t('settings.codeSetsLead')}</p>

<div class="ov-form sets">
	{#each data.sets as s (s.set)}
		{@const st = stateOf(s.set)}
		{@const rel = s.release}
		{@const doing = busy[s.set]}
		<section class="card" aria-labelledby="set-{s.set}">
			<header>
				<h3 id="set-{s.set}">{setName(s.set)}</h3>
				{#if st.current}<span class="badge">{t('settings.codeSetsInUse')}</span>{/if}
			</header>
			<p class="hint">
				{rel.validFrom ? t('settings.codeSetsValidFrom', { release: rel.release, date: date(rel.validFrom) }) : t('settings.codeSetsRelease', { release: rel.release })}
				{t('settings.codeSetsPublisher', { publisher: rel.publisher, licence: rel.licence })}
			</p>
			{#if rel.citation}
				<p class="hint cite">{t('settings.codeSetsCitationLabel')} <a href="https://icd.who.int" rel="noreferrer" target="_blank">{rel.citation}</a></p>
			{/if}
			<p class="status" class:missing={st.rows === 0}>
				{#if st.rows === 0}
					{t('settings.codeSetsNotDownloaded')}
				{:else}
					{t('settings.codeSetsLoaded', { count: st.rows, date: st.loadedAt ? date(st.loadedAt) : '' })}
					{#if !st.upToDate}<br />{t('settings.codeSetsOlder', { release: rel.release })}{/if}
				{/if}
			</p>
			<div class="actions">
				<button type="button" class="primary" disabled={!!doing} onclick={() => run(s.set, 'download', () => downloadSet(s.set))}>
					{t('settings.codeSetsDownload')}
				</button>
				<button type="button" disabled={!!doing} onclick={() => inputs[s.set]?.click()}>{t('settings.codeSetsImport')}</button>
				<input
					bind:this={inputs[s.set]}
					class="visually-hidden"
					type="file"
					accept=".zip,.txt,application/zip,text/plain"
					tabindex="-1"
					aria-label={t('settings.codeSetsImportLabel', { set: setName(s.set) })}
					onchange={(e) => picked(s.set, e)}
				/>
				{#if st.rows > 0}
					<button
						type="button"
						class="danger"
						disabled={!!doing || st.current}
						aria-describedby={st.current ? `inuse-${s.set}` : undefined}
						onclick={() => remove(s.set)}>{t('settings.codeSetsRemove')}</button
					>
				{/if}
			</div>
			{#if st.current && st.rows > 0}<p class="hint" id="inuse-{s.set}">{t('settings.codeSetsRemoveInUse')}</p>{/if}
			<p class="note" role="status" aria-live="polite">
				{#if doing === 'download'}{t('settings.codeSetsDownloading')}{:else if doing === 'import'}{t('settings.codeSetsImporting')}{:else if doing === 'remove'}{t('settings.codeSetsRemoving')}{:else if notes[s.set]}<span
						class={notes[s.set]!.ok ? 'saved' : 'err'}>{notes[s.set]!.text}</span
					>{/if}
			</p>
			<p class="hint">
				<Msg key="settings.codeSetsOffline" params={{ entry: rel.entry.split('/').pop() ?? rel.entry }}>
					{#snippet link()}<a href={rel.url} rel="noreferrer">{t('settings.codeSetsOfficialFile')}</a>{/snippet}
				</Msg>
			</p>
			{#if s.set === 'icd11'}{@render languages()}{/if}
		</section>
	{/each}
</div>

{#snippet languages()}
	<div class="langs" role="group" aria-labelledby="langs-heading">
		<h4 id="langs-heading">{t('settings.codeSetsLangHeading')}</h4>
		<p class="hint">{t('settings.codeSetsLangLead')}</p>
		<ul>
			<li><p class="hint">{t('settings.codeSetsLangEnglish')}</p></li>
			{#each data.languages as l (l.lang)}
				{@const st = langOf(l.lang)}
				{@const rel = l.release}
				{@const doing = langBusy[l.lang]}
				{@const name = icd11LanguageName(l.lang, locale)}
				<li>
					<h5 id="lang-{l.lang}">{langLabel(l.lang)}</h5>
					<p class="hint">
						{rel.serves ? t('settings.codeSetsLangServes', { language: name }) : t('settings.codeSetsLangLater')}
						{#if rel.note === 'prerelease'}{t('settings.codeSetsLangPrerelease')}{:else if rel.note === 'titlesOnly'}{t('settings.codeSetsLangTitlesOnly')}{/if}
					</p>
					<p class="hint cite">{t('settings.codeSetsLangSource', { release: rel.release, licence: rel.licence, citation: rel.citation })}</p>
					<p class="status" class:missing={st.rows === 0}>
						{#if st.rows === 0}
							{t('settings.codeSetsNotDownloaded')}
						{:else}
							{t('settings.codeSetsLangLoaded', { count: st.rows, date: st.loadedAt ? date(st.loadedAt) : '' })}
							{#if !st.upToDate}<br />{t('settings.codeSetsOlder', { release: rel.release })}{/if}
						{/if}
					</p>
					<div class="actions" role="group" aria-labelledby="lang-{l.lang}">
						<button type="button" disabled={!!doing} onclick={() => runLang(l.lang, 'download', () => downloadLanguage(l.lang))}>
							{t('settings.codeSetsDownload')}
						</button>
						<button type="button" disabled={!!doing} onclick={() => langInputs[l.lang]?.click()}>{t('settings.codeSetsImport')}</button>
						<input
							bind:this={langInputs[l.lang]}
							class="visually-hidden"
							type="file"
							accept=".zip,.txt,application/zip,text/plain"
							tabindex="-1"
							aria-label={t('settings.codeSetsLangImportLabel', { language: name })}
							onchange={(e) => pickedLang(l.lang, e)}
						/>
						{#if st.rows > 0}
							<button type="button" class="danger" disabled={!!doing} onclick={() => removeLang(l.lang)}>{t('settings.codeSetsRemove')}</button>
						{/if}
					</div>
					<p class="note" role="status" aria-live="polite">
						{#if doing === 'download'}{t('settings.codeSetsDownloading')}{:else if doing === 'import'}{t('settings.codeSetsImporting')}{:else if doing === 'remove'}{t(
								'settings.codeSetsRemoving'
							)}{:else if langNotes[l.lang]}<span class={langNotes[l.lang]!.ok ? 'saved' : 'err'}>{langNotes[l.lang]!.text}</span>{/if}
					</p>
					<p class="hint">
						<Msg key="settings.codeSetsLangOffline">
							{#snippet link()}<a href={rel.url} rel="noreferrer">{t('settings.codeSetsLangOfficialFile', { language: name })}</a>{/snippet}
						</Msg>
					</p>
				</li>
			{/each}
		</ul>
		<p class="hint">{t('settings.codeSetsLangNoHindi')}</p>
	</div>
{/snippet}

<style>
	.langs {
		margin-top: var(--space-4);
		padding-top: var(--space-3);
		border-top: 1px solid var(--hairline);
	}
	.langs ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
	h4 {
		margin: 0 0 var(--space-1);
		font-size: var(--text-md);
		font-weight: var(--weight-semibold);
	}
	h5 {
		margin: 0;
		font-size: var(--text-md);
		font-weight: var(--weight-semibold);
	}
	.sets {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}
	header {
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
		flex-wrap: wrap;
	}
	h3 {
		margin: 0;
		font-size: var(--text-lg);
		font-weight: var(--weight-semibold);
	}
	.badge {
		font-size: var(--text-xs);
		padding: 2px var(--space-2);
		border-radius: var(--radius-1);
		background: var(--accent-soft);
		color: var(--accent);
	}
	.status {
		margin: var(--space-2) 0;
		font-weight: var(--weight-semibold);
	}
	.status.missing {
		color: var(--warn);
	}
	.cite {
		max-width: 60ch;
		overflow-wrap: anywhere;
	}
	.note {
		margin: var(--space-1) 0 0;
		min-height: 1.5em;
	}
	.note .saved,
	.note .err {
		margin: 0;
	}
</style>
