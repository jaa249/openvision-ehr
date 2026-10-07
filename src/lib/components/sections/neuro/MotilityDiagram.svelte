<script lang="ts">
	// One eye's motility diagram (spec §9.1): 8 gaze cells around the eye, each a 0-4 counter drawn as hash marks.
	// Original art: a star of gaze spokes behind the cells and a simple eye glyph in the center.
	// Doctor's view facing the patient (as the fields grid, D9): gaze to the patient's right is drawn on the left.
	// Our addition to the click-to-wrap parity: Shift+click, long-press, the "-" / Backspace keys or the
	// panel's Remove mode take a mark away; keys 0-4 set the count directly.
	import { gazeKey, hashOrientation, motilityCell, motilityCount, type GazeH, type GazeV } from '#lib/exam/sections/neuro.ts';
	import { useI18n } from '#lib/i18n/context.ts';
	import { tip } from '#lib/components/ui/tooltip.ts';
	import type { CellState } from '../workup/cell.ts';

	let {
		eye,
		cell,
		removeMode = false,
		onstep,
		onset
	}: {
		eye: 'OD' | 'OS';
		cell: (id: string) => CellState;
		/** Taps take a mark away instead of adding one (touch-friendly decrement). */
		removeMode?: boolean;
		onstep: (id: string, step: 1 | -1) => void;
		onset: (id: string, count: number) => void;
	} = $props();

	const { t } = useI18n();
	const eyeName = $derived(eye === 'OD' ? t('sections.motRightEye') : t('sections.motLeftEye'));
	const ROWS: GazeV[] = [-1, 0, 1];
	const COLS: GazeH[] = ['R', null, 'L'];

	// Long-press (touch / pen) removes a mark; the click that follows the press is swallowed.
	const LONG_PRESS_MS = 550;
	let pressTimer: ReturnType<typeof setTimeout> | undefined;
	let swallowClick = false;

	function pointerDown(e: PointerEvent, id: string) {
		if (e.pointerType === 'mouse') return;
		clearTimeout(pressTimer);
		pressTimer = setTimeout(() => {
			swallowClick = true;
			onstep(id, -1);
		}, LONG_PRESS_MS);
	}
	function pointerEnd() {
		clearTimeout(pressTimer);
	}
	function click(e: MouseEvent, id: string) {
		if (swallowClick) {
			swallowClick = false;
			return;
		}
		onstep(id, e.shiftKey || removeMode ? -1 : 1);
	}
	/** Keys handled here stop propagating, so the page's digit shortcuts (section keys 1-0) don't also fire. */
	function keydown(e: KeyboardEvent, id: string) {
		if (e.altKey || e.ctrlKey || e.metaKey) return;
		if (e.key === '-' || e.key === 'Backspace' || e.key === 'Delete') {
			e.preventDefault();
			e.stopPropagation();
			onstep(id, -1);
		} else if (/^[0-4]$/.test(e.key)) {
			e.preventDefault();
			e.stopPropagation();
			onset(id, Number(e.key));
		}
	}
</script>

<div class="diagram" role="group" aria-label={t('sections.motDiagramLabel', { eye: eyeName })}>
	<svg class="spokes" viewBox="0 0 90 90" aria-hidden="true" focusable="false">
		<g>
			<line x1="45" y1="5" x2="45" y2="85" />
			<line x1="5" y1="45" x2="85" y2="45" />
			<line x1="12" y1="12" x2="78" y2="78" />
			<line x1="78" y1="12" x2="12" y2="78" />
		</g>
	</svg>
	{#each ROWS as v (v)}
		{#each COLS as h (h)}
			{@const c = motilityCell(eye, v, h)}
			{#if c}
				{@const s = cell(c.id)}
				{@const n = motilityCount(s.value)}
				{@const gaze = t(gazeKey(c))}
				<button
					type="button"
					class="gaze {hashOrientation(c)}"
					class:marked={n > 0}
					class:ghost={s.ghost}
					class:copied={s.copied}
					data-field={c.id}
					aria-label={t('sections.motCellLabel', { eye: eyeName, gaze, n })}
					use:tip={{ text: t('sections.motCellTitle', { gaze, n }), press: false }}
					onclick={(e) => click(e, c.id)}
					onkeydown={(e) => keydown(e, c.id)}
					onpointerdown={(e) => pointerDown(e, c.id)}
					onpointerup={pointerEnd}
					onpointerleave={pointerEnd}
					onpointercancel={pointerEnd}
					oncontextmenu={(e) => 'pointerType' in e && e.pointerType !== 'mouse' && e.preventDefault()}
				>
					<span class="marks" aria-hidden="true">
						{#each { length: n } as _, i (i)}<span class="mark"></span>{/each}
					</span>
				</button>
			{:else}
				<div class="center" aria-hidden="true">
					<svg viewBox="0 0 40 24" focusable="false">
						<path class="lid" d="M2 12 Q20 -2 38 12 Q20 26 2 12 Z" />
						<circle class="iris" cx="20" cy="12" r="6" />
						<circle class="pupil" cx="20" cy="12" r="2.6" />
					</svg>
					<span class="eye-tag {eye.toLowerCase()}">{eye}</span>
				</div>
			{/if}
		{/each}
	{/each}
</div>

<style>
	.diagram {
		position: relative;
		display: grid;
		grid-template-columns: repeat(3, max(var(--target-min), 44px));
		grid-template-rows: repeat(3, max(var(--target-min), 44px));
		gap: 4px;
		padding: 4px;
	}
	.spokes {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		pointer-events: none;
	}
	.spokes line {
		stroke: var(--hairline);
		stroke-width: 1.5;
		stroke-linecap: round;
	}
	.gaze {
		position: relative;
		display: grid;
		place-items: center;
		padding: 0;
		min-height: 0;
		border-radius: var(--radius-2);
		background: var(--surface-1);
		touch-action: manipulation;
		user-select: none;
		-webkit-user-select: none;
		-webkit-touch-callout: none;
	}
	.gaze.marked {
		border-color: var(--abnormal);
		background: var(--abnormal-soft);
	}
	.gaze.ghost {
		outline: 2px dashed var(--accent);
		outline-offset: -2px;
	}
	.gaze.copied {
		background: var(--copied-tint);
	}
	.marks {
		display: flex;
		gap: 3px;
		align-items: center;
		justify-content: center;
	}
	/* horizontal gazes: vertical bars side by side; vertical and oblique gazes: horizontal bars stacked */
	.horizontal .marks {
		flex-direction: column;
	}
	.mark {
		background: var(--abnormal);
		border-radius: 1px;
	}
	.vertical .mark {
		width: 3px;
		height: 18px;
	}
	.horizontal .mark {
		width: 20px;
		height: 3px;
	}
	.center {
		position: relative;
		display: grid;
		place-items: center;
		align-content: center;
		gap: 1px;
	}
	.center svg {
		width: 34px;
		height: 20px;
	}
	.lid {
		fill: var(--surface-1);
		stroke: var(--text-3);
		stroke-width: 1.5;
	}
	.iris {
		fill: none;
		stroke: var(--text-2);
		stroke-width: 1.5;
	}
	.pupil {
		fill: var(--text-2);
	}
	.eye-tag {
		font-size: var(--text-xs);
		font-weight: var(--weight-semibold);
		line-height: 1;
	}
	.eye-tag.od {
		color: var(--od);
	}
	.eye-tag.os {
		color: var(--os);
	}
</style>
