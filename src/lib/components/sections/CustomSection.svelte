<script lang="ts">
	// Sections that are not simple OD/OS row tables get their own panel component.
	// Every PanelProps field (including `readonly`) is passed through to the panel in `props`.
	import type { SectionId } from '#lib/exam/catalog.ts';
	import type { PanelProps } from './types.ts';
	import type { RxSource } from '#lib/exam/sections/refraction.ts';
	import VisionPanel from './VisionPanel.svelte';
	import PressurePanel from './PressurePanel.svelte';
	import RefractionPanel from './RefractionPanel.svelte';
	import HpiPanel from './HpiPanel.svelte';
	import NeuroPanel from './NeuroPanel.svelte';
	import ImpPlanPanel from './ImpPlanPanel.svelte';
	import CodingPanel from './CodingPanel.svelte';

	let {
		section,
		onprintrx,
		...props
	}: PanelProps & { section: SectionId; /** Refraction: save, then open the Rx print page (spec §12.1). */ onprintrx?: (source: RxSource) => void } =
		$props();
</script>

{#if section === 'ACUITY'}
	<VisionPanel {...props} />
{:else if section === 'IOP'}
	<PressurePanel {...props} />
{:else if section === 'REFRACTION'}
	<RefractionPanel {...props} {onprintrx} />
{:else if section === 'HPI'}
	<HpiPanel {...props} />
{:else if section === 'NEURO'}
	<NeuroPanel {...props} />
{:else if section === 'IMPPLAN'}
	<ImpPlanPanel {...props} />
{:else if section === 'CODING'}
	<CodingPanel {...props} />
{/if}
