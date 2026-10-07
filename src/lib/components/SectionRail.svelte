<script lang="ts">
	import { SECTIONS, sectionLabel, type Section, type SectionId } from '#lib/exam/catalog.ts';
	import { RAIL_STATES, railState, type RailState } from '#lib/exam/rail.ts';
	import { useI18n } from '#lib/i18n/context.ts';
	import type { MessageKey } from '#lib/i18n/catalog.ts';
	import type { Findings } from '#lib/shorthand/parse.ts';
	import { roving } from './ui/roving.ts';
	import { tip } from './ui/tooltip.ts';

	let {
		sections = SECTIONS,
		current,
		findings,
		defaults = {},
		onselect
	}: {
		sections?: Section[];
		current: SectionId;
		findings: Findings;
		/** The practice's normal values: what "complete" and "abnormal" are measured against (rail.ts). */
		defaults?: Record<string, string>;
		onselect: (id: SectionId) => void;
	} = $props();

	const { t } = useI18n();
	/** Short word in the button's name; longer sentence in the tooltip and the legend. */
	const WORD: Record<RailState, MessageKey> = {
		empty: 'exam.railEmpty',
		started: 'exam.railStarted',
		complete: 'exam.railComplete',
		abnormal: 'exam.railAbnormal'
	};
	const TIP: Record<RailState, MessageKey> = {
		empty: 'exam.railTipEmpty',
		started: 'exam.railTipStarted',
		complete: 'exam.railTipComplete',
		abnormal: 'exam.railTipAbnormal'
	};
	const states = $derived(Object.fromEntries(sections.map((s) => [s.id, railState(s.id, findings, defaults)])) as Record<SectionId, RailState>);

	let nav = $state<HTMLElement>();
	let legendOpen = $state(false);
	const legendId = $props.id();

	// The current section stays in view when the rail is a scrolling strip (zoom, narrow window): only the
	// strip scrolls, never the page around it.
	$effect(() => {
		const id = current;
		const strip = nav;
		if (!strip) return;
		const btn = strip.querySelector<HTMLElement>(`[data-section="${id}"]`);
		if (!btn) return;
		const n = strip.getBoundingClientRect();
		const b = btn.getBoundingClientRect();
		const pad = 24;
		if (b.left < n.left) strip.scrollLeft -= n.left - b.left + pad;
		else if (b.right > n.right) strip.scrollLeft += b.right - n.right + pad;
		if (b.top < n.top) strip.scrollTop -= n.top - b.top + pad;
		else if (b.bottom > n.bottom) strip.scrollTop += b.bottom - n.bottom + pad;
	});
</script>

<!-- Each state has its own shape (not only a colour, WCAG 1.4.1): empty = ring, started = half-filled,
     complete = filled with a tick, abnormal = triangle with "!". -->
{#snippet mark(state: RailState)}
	<svg class="mark" data-state={state} viewBox="0 0 12 12" aria-hidden="true" focusable="false">
		{#if state === 'empty'}
			<circle cx="6" cy="6" r="4.5" class="ring" />
		{:else if state === 'started'}
			<circle cx="6" cy="6" r="4.5" class="ring" />
			<path d="M6 1.5 A4.5 4.5 0 0 0 6 10.5 Z" class="fill" />
		{:else if state === 'complete'}
			<circle cx="6" cy="6" r="5.25" class="fill" />
			<path d="M3.4 6.2 5.2 8 8.7 4.2" class="tick" />
		{:else}
			<path d="M6 0.8 11.4 10.8 0.6 10.8 Z" class="fill" />
			<path d="M6 4.3v3.1M6 8.7v0.6" class="bang" />
		{/if}
	</svg>
{/snippet}

<div class="rail-wrap">
	<!-- One Tab stop (roving tabindex on the current section): arrow keys, Home/End move along the
	     rail; the number keys still jump straight to a section. -->
	<nav class="rail" aria-label={t('exam.railLabel')} bind:this={nav} use:roving={{ items: 'button', typeahead: false }}>
		{#each sections as s (s.id)}
			{@const st = states[s.id]}
			<button
				type="button"
				data-section={s.id}
				aria-current={current === s.id ? 'true' : undefined}
				aria-keyshortcuts={s.key}
				class:unavailable={!s.available}
				onclick={() => onselect(s.id)}
				use:tip={s.available ? { text: `${t('exam.railTipKey', { key: s.key, section: sectionLabel(s.id, t) })} ${t(TIP[st])}`, placement: 'end', describe: false } : null}
			>
				<span class="key">{s.key}</span>
				<span class="label">{sectionLabel(s.id, t)}</span>
				{#if s.available}
					{@render mark(st)}<span class="visually-hidden">{t(WORD[st])}</span>
				{/if}
			</button>
		{/each}
	</nav>
	<button type="button" class="legend-toggle" aria-expanded={legendOpen} aria-controls="{legendId}-legend" onclick={() => (legendOpen = !legendOpen)}>
		{t('exam.railLegendButton')}
	</button>
	{#if legendOpen}
		<div class="legend" id="{legendId}-legend" role="group" aria-label={t('exam.railLegendTitle')}>
			<ul>
				{#each RAIL_STATES as st (st)}
					<li>{@render mark(st)}<span>{t(TIP[st])}</span></li>
				{/each}
			</ul>
		</div>
	{/if}
</div>

<style>
	.rail-wrap {
		display: flex;
		flex-direction: column;
		min-height: 0;
		background: var(--surface-1);
		border-inline-end: 1px solid var(--hairline);
		/* Holds the visually hidden state labels, so off-screen ones do not widen the page (in
		   right-to-left that widening scrolled the whole exam sideways on a tablet). */
		position: relative;
	}
	.rail {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: var(--space-2);
		overflow: auto;
		position: relative;
		flex: 0 1 auto;
		min-height: 0;
	}
	.rail button {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		border: 0;
		background: transparent;
		color: var(--text-2);
		text-align: start;
		padding: 0 var(--space-2);
		flex: none;
	}
	.rail button:hover {
		background: var(--surface-2);
	}
	.rail button[aria-current='true'] {
		background: var(--accent-soft);
		color: var(--text-1);
		font-weight: var(--weight-semibold);
		/* Current section: a bar too, not only the tint (WCAG 1.4.1, and visible in forced colours). */
		box-shadow: inset 3px 0 0 var(--accent);
	}
	:global([dir='rtl']) .rail button[aria-current='true'] {
		box-shadow: inset -3px 0 0 var(--accent);
	}
	.unavailable .label {
		color: var(--text-3);
	}
	.key {
		font: var(--text-xs) / 1 var(--font-mono);
		color: var(--text-3);
		width: 1.2em;
	}
	.label {
		flex: 1;
	}
	.mark {
		width: 0.75rem;
		height: 0.75rem;
		flex: none;
		overflow: visible;
	}
	.mark .ring {
		fill: none;
		stroke: var(--text-3);
		stroke-width: 1.5;
	}
	.mark[data-state='started'] .ring {
		stroke: var(--text-2);
	}
	.mark[data-state='started'] .fill {
		fill: var(--text-2);
	}
	.mark[data-state='complete'] .fill {
		fill: var(--ok);
	}
	.mark .tick {
		fill: none;
		stroke: var(--surface-1);
		stroke-width: 1.6;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.mark[data-state='abnormal'] .fill {
		fill: var(--abnormal);
	}
	.mark .bang {
		stroke: var(--surface-1);
		stroke-width: 1.5;
		stroke-linecap: round;
	}
	.legend-toggle {
		margin: 0 var(--space-2) var(--space-2);
		font-size: var(--text-xs);
		color: var(--text-2);
		background: transparent;
		border-color: transparent;
		text-decoration: underline dotted;
		text-underline-offset: 3px;
		align-self: flex-start;
		flex: none;
	}
	.legend-toggle[aria-expanded='true'] {
		color: var(--text-1);
		text-decoration-style: solid;
	}
	.legend {
		padding: 0 var(--space-3) var(--space-3);
		font-size: var(--text-xs);
		color: var(--text-2);
		overflow: auto;
		flex: none;
	}
	.legend ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: var(--space-2);
	}
	.legend li {
		display: flex;
		gap: var(--space-2);
		align-items: flex-start;
	}
	.legend .mark {
		margin-top: 0.15em;
	}
	/* Narrow window (or zoomed): the rail becomes a strip of tabs above the exam. It scrolls sideways
	   with a shadow at the edge that has more (scroll shadows), and keeps the current section in view. */
	@media (max-width: 56.25em) {
		.rail-wrap {
			flex-direction: row;
			flex-wrap: wrap;
			align-items: center;
			border-inline-end: 0;
			border-bottom: 1px solid var(--hairline);
		}
		.rail {
			flex-direction: row;
			flex: 1 1 0;
			min-width: 0;
			padding: var(--space-1) var(--space-2);
			overscroll-behavior-x: contain;
			scrollbar-width: thin;
			background:
				linear-gradient(to right, var(--surface-1) 40%, transparent) left center / 2.5rem 100% no-repeat local,
				linear-gradient(to left, var(--surface-1) 40%, transparent) right center / 2.5rem 100% no-repeat local,
				radial-gradient(farthest-side at 0 50%, color-mix(in srgb, var(--text-2) 60%, transparent), transparent) left center / 0.9rem 100% no-repeat scroll,
				radial-gradient(farthest-side at 100% 50%, color-mix(in srgb, var(--text-2) 60%, transparent), transparent) right center / 0.9rem 100% no-repeat scroll,
				var(--surface-1);
		}
		.rail button {
			white-space: nowrap;
		}
		.rail button[aria-current='true'],
		:global([dir='rtl']) .rail button[aria-current='true'] {
			box-shadow: inset 0 -3px 0 var(--accent);
		}
		.legend-toggle {
			margin: 0 var(--space-2);
		}
		.legend {
			flex-basis: 100%;
			padding-top: var(--space-2);
		}
		.legend ul {
			grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
		}
	}
	/* Windows high contrast: system colours, so every mark keeps its shape and the current section shows. */
	@media (forced-colors: active) {
		.mark .ring {
			stroke: CanvasText;
		}
		.mark .fill,
		.mark[data-state] .fill {
			fill: CanvasText;
		}
		.mark .tick,
		.mark .bang {
			stroke: Canvas;
		}
		.rail button[aria-current='true'] {
			outline: 2px solid Highlight;
			outline-offset: -2px;
		}
	}
</style>
