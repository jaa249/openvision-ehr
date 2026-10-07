<script lang="ts">
	// "Codes for your billing system" on the printed report (D46): the codes the provider CHOSE in the
	// Codes section, to copy into the practice's billing system. OpenVision does not bill. Printed only
	// when something is chosen and US code suggestions are on (the server leaves `codes` null otherwise).
	// Paper colours, like ReportPlan. Headings translate (D48); codes and their descriptions do not.
	import type { ChosenCodes } from '#lib/coding/types.ts';
	import { codeSetsShort } from '#lib/codesets/index.ts';
	import { useI18n } from '#lib/i18n/context.ts';
	let { codes }: { codes: ChosenCodes | null | undefined } = $props();
	const { t, list } = useI18n();
	const visit = $derived(codes?.cpt.find((l) => l.kind === 'visit'));
	const tests = $derived(codes?.cpt.filter((l) => l.kind !== 'visit') ?? []);
	const mods = (m: string[]) => (m.length ? `-${m.join('-')}` : '');
</script>

{#if codes && codes.cpt.length}
	<section class="rcodes">
		<h2>{t('report.codesTitle')}</h2>
		<dl>
			{#if visit}
				<dt>{t('report.visit')}</dt>
				<dd><span class="code">{visit.code}{mods(visit.modifiers)}</span> {visit.description}{#if visit.pointers.length}<span class="ptr"> {t('report.codesPointers', { pointers: visit.pointers.join(', ') })}</span>{/if}</dd>
			{/if}
			{#if tests.length}
				<dt>{t('report.codesTests')}</dt>
				<dd>
					<ul>
						{#each tests as test, i (i)}
							<li><span class="code">{test.code}{mods(test.modifiers)}</span> {test.description}{#if test.pointers.length}<span class="ptr"> {t('report.codesPointers', { pointers: test.pointers.join(', ') })}</span>{/if}</li>
						{/each}
					</ul>
				</dd>
			{/if}
			{#if codes.dx.length}
				<dt>{t('report.codesDiagnoses', { sets: codeSetsShort(codes.dx.map((d) => d.code), list) })}</dt>
				<dd>
					<ul>
						{#each codes.dx as d (d.letter)}
							<li><span class="ptr">{d.letter}.</span> <span class="code">{d.code}</span> {d.title}</li>
						{/each}
					</ul>
				</dd>
			{/if}
		</dl>
		<p class="note">{t('report.codesNote')}</p>
	</section>
{/if}

<style>
	.rcodes {
		break-inside: avoid;
		color: var(--ink, #111);
		margin-top: 0.8em;
		font-size: 9.5pt;
	}
	h2 {
		font-size: 11.5pt;
		margin: 0 0 0.3em;
		padding-bottom: 2px;
		border-bottom: 1px solid var(--rule, #c9c9c9);
	}
	dl {
		margin: 0;
		display: grid;
		grid-template-columns: max-content 1fr;
		gap: 0.2em 1em;
	}
	dt {
		font-weight: 600;
	}
	dd {
		margin: 0;
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.code {
		font-family: ui-monospace, Consolas, monospace;
		font-weight: 600;
	}
	.ptr,
	.note {
		color: var(--ink-2, #444);
	}
	.note {
		margin: 0.3em 0 0;
		font-size: 8.5pt;
	}
</style>
