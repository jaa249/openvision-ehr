<script lang="ts">
	// A message with markup inside it (D48): messages hold no HTML, so a link, code or emphasis is a
	// {placeholder} rendered by the snippet prop of the same name, e.g.
	//   <Msg key="auth.forgotStep2">{#snippet command()}<code>...</code>{/snippet}</Msg>
	// A placeholder with no snippet and no param shows as literal {name}, so a gap is visible.
	import type { Snippet } from 'svelte';
	import { useI18n } from './context.ts';
	import type { MessageKey } from './catalog.ts';
	import type { Params } from './translate.ts';

	let { key, params, ...slots }: { key: MessageKey; params?: Params; [slot: string]: Snippet | unknown } = $props();
	const i18n = useI18n();
	const pieces = $derived(i18n.parts(key, params));
	const snippet = (name: string) => (typeof slots[name] === 'function' ? (slots[name] as Snippet) : null);
</script>

{#each pieces as p, i (i)}{#if 'text' in p}{p.text}{:else if snippet(p.slot)}{@render snippet(p.slot)?.()}{:else}{`{${p.slot}}`}{/if}{/each}
