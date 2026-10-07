<script lang="ts">
	// An abbreviation with its plain name: <Abbr code="NS" /> shows "NS" with a dotted underline;
	// hover, keyboard focus on the surrounding control, or a long-press shows "nuclear sclerosis ...",
	// which is also the accessible description. `text` shows something other than the code (e.g. the
	// translated short label) while `code` picks the explanation. Unknown codes render as plain text.
	import { glossary } from '#lib/i18n/glossary.ts';
	import { useI18n } from '#lib/i18n/context.ts';
	import { tip, type TipPlacement } from './tooltip.ts';

	let { code, text, placement }: { code: string; text?: string; placement?: TipPlacement } = $props();
	const { t } = useI18n();
	const plain = $derived(glossary(code, t));
</script>

{#if plain}<abbr class="ov-abbr" use:tip={{ text: plain, placement, host: true }}>{text ?? code}</abbr>{:else}{text ?? code}{/if}
