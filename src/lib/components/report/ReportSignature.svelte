<script lang="ts">
	// Signature block on the printed report (spec §13.2 item 12 FIX: always shown; real signing date).
	// Addenda follow the signature, each with its author and time; they never change the signed text.
	import type { Signature } from '#lib/plan/types.ts';
	import Msg from '#lib/i18n/Msg.svelte';
	import { useI18n } from '#lib/i18n/context.ts';
	let { provider, signature }: { provider: string; signature: Signature | null | undefined } = $props();

	const { t, dateTime } = useI18n();
	/** In the page language (D48): "Oct 7, 2026, 3:04 PM" in English. */
	const when = (iso: string) => dateTime(iso);
</script>

<div class="block">
	<div class="sign">
		<span class="line"></span>
		<span class="provider">{provider}</span>
		{#if signature}
			<span class="signed"><Msg key="report.signedBy" params={{ name: signature.signedBy }}>{#snippet date()}<time datetime={signature.signedAt}>{when(signature.signedAt)}</time>{/snippet}</Msg></span>
		{:else}
			<span class="draft">{t('report.notSigned')}</span>
		{/if}
	</div>
	{#if signature?.addenda.length}
		<section class="addenda" aria-label={t('report.addenda')}>
			<h3>{t('report.addenda')}</h3>
			<ol>
				{#each signature.addenda as a, i (i)}
					<li>
						<div class="by">{a.by} · <time datetime={a.at}>{when(a.at)}</time></div>
						<p>{a.text}</p>
					</li>
				{/each}
			</ol>
		</section>
	{/if}
</div>

<style>
	/* One root element: the report footer lays out signature and "Generated" side by side. */
	.block {
		max-width: 5.5in;
	}
	.sign {
		display: grid;
		gap: 2px;
		font-size: 9.5pt;
		min-width: 3in;
	}
	.line {
		border-bottom: 1px solid var(--ink);
		height: 2em;
	}
	.provider {
		color: var(--ink);
	}
	.signed {
		color: var(--ink);
		font-size: 8.5pt;
	}
	.draft {
		color: var(--ink-2);
		font-size: 8.5pt;
		font-style: italic;
	}
	.addenda {
		margin-top: 8pt;
		font-size: 9.5pt;
		color: var(--ink);
		break-inside: avoid;
	}
	.addenda h3 {
		font-size: 10pt;
		margin: 0 0 4pt;
	}
	.addenda ol {
		margin: 0;
		padding-inline-start: 1.4em;
	}
	.addenda li + li {
		margin-top: 4pt;
	}
	.by {
		color: var(--ink-2);
		font-size: 8.5pt;
	}
	.addenda p {
		margin: 1pt 0 0;
		white-space: pre-wrap;
	}
</style>
