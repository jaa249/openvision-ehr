<script lang="ts">
	// The shorthand codes under a row label ("RC · LC · BC"): the whole line always shows; the tip
	// spells each code out; clicking it (or Enter / Space) opens the keyboard and shorthand help sheet
	// filtered to this row's codes. It is not a Tab stop (tabindex -1): eleven of them per section made
	// keyboard travel long, and keyboard users reach the same filtered sheet with ? (the field is in the
	// sheet's code table). Screen readers still read the codes and their spelled-out description.
	import { useI18n } from '#lib/i18n/context.ts';
	import { codeHintText, describeHint } from '#lib/exam/codehint.ts';
	import { ariaKeys, openKeyboardHelp } from '#lib/exam/shortcuts.ts';
	import { tip } from './tooltip.ts';

	let { hint, inline = false }: { hint: string; inline?: boolean } = $props();
	const i18n = useI18n();
	const { t } = i18n;
	const text = $derived(`${codeHintText(hint, t, i18n.list, ariaKeys('shorthand'))} ${t('tips.codeHintOpen')}`);
	/** The help sheet filters by one code: the right-eye one when there is a pair, else the first. */
	const filter = $derived((describeHint(hint).find((p) => p.role === 'right') ?? describeHint(hint)[0])?.code ?? hint);
</script>

<button type="button" tabindex="-1" class="code" class:inline use:tip={text} onclick={() => openKeyboardHelp({ filter })}>{hint}</button>

<style>
	.code {
		display: block;
		min-height: 24px;
		padding: 0;
		border: 0;
		background: none;
		font: var(--text-xs) var(--font-mono);
		color: var(--text-3);
		text-align: start;
		overflow-wrap: anywhere;
		cursor: help;
	}
	.code.inline {
		display: inline;
		min-height: 0;
	}
	.code:hover {
		color: var(--text-2);
		text-decoration: underline dotted;
	}
	.code:focus-visible {
		outline: 2px solid var(--focus-ring);
		outline-offset: 1px;
		border-radius: 2px;
	}
</style>
