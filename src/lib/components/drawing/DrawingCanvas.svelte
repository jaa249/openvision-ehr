<script lang="ts">
	// One drawing canvas for one exam zone (docs/spec/BEHAVIOR.md §5).
	// All state lives in this instance (FIX: the original shared pointer state across canvases);
	// DrawingPanel re-creates it per zone.
	import { onMount } from 'svelte';
	import { History } from './history.ts';
	import { DrawingSaver } from './saver.svelte.ts';
	import { BLANK_BASE, baseFor, ZONE_LABEL_KEY } from '#lib/drawings/bases.ts';
	import { useI18n } from '#lib/i18n/context.ts';
	import type { MessageKey } from '#lib/i18n/catalog.ts';

	let { patientId, encounterId, zone }: { patientId: number; encounterId: number; zone: string } = $props();

	/** Logical canvas size (§5.1). The backing store is 2-3× this for crisp lines on HiDPI screens. */
	const W = 450;
	const H = 250;
	const PENCILS: { name: MessageKey; color: string }[] = [
		{ name: 'drawing.pencilBlue', color: '#1f5fd6' },
		{ name: 'drawing.pencilYellow', color: '#f2c200' },
		{ name: 'drawing.pencilOrange', color: '#f07a12' },
		{ name: 'drawing.pencilBrown', color: '#7a4a1e' },
		{ name: 'drawing.pencilRed', color: '#d42020' },
		{ name: 'drawing.pencilBlack', color: '#111111' },
		{ name: 'drawing.pencilWhite', color: '#ffffff' }
	];
	const WIDTHS = [1, 3, 5, 10, 15];

	interface Prior {
		id: number;
		encounterId: number;
		date: string;
		visitType: string;
	}

	// svelte-ignore state_referenced_locally
	const api = `/api/patients/${patientId}/encounters/${encounterId}/drawings/${encodeURIComponent(zone)}`;
	const i18n = useI18n();
	const { t } = i18n;
	// svelte-ignore state_referenced_locally
	const zoneKey = ZONE_LABEL_KEY[zone as keyof typeof ZONE_LABEL_KEY];
	const label = $derived(zoneKey ? t(zoneKey) : zone);

	let color = $state('#111111');
	let width = $state(1);
	let canvas: HTMLCanvasElement;
	let ctx: CanvasRenderingContext2D;
	let scale = 2;

	/** Lossless PNG snapshots (§5.2 FIX). The current entry is always what the canvas shows. */
	const history = new History<Promise<Blob>>();
	let canUndo = $state(false);
	let canRedo = $state(false);
	let ready = $state(false);
	let busy = $state(false);
	let loadError = $state(false);
	/** What Revert redraws: the drawing or base loaded when the panel opened, or a chosen prior. */
	let loaded: CanvasImageSource | null = null;

	const saver = new DrawingSaver(api, () => history.current ?? Promise.reject(new Error('Nothing to save')));

	let priors = $state<Prior[]>([]);
	/** 0 = this visit's canvas; n = priors[n - 1] (newest first). */
	let view = $state(0);
	const prior = $derived(view > 0 ? priors[view - 1] : null);

	// ---------- canvas helpers ----------
	function snapshot(): Promise<Blob> {
		const p = new Promise<Blob>((resolve, reject) =>
			canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Snapshot failed'))), 'image/png')
		);
		p.catch(() => {});
		return p;
	}

	function sync() {
		canUndo = history.canUndo;
		canRedo = history.canRedo;
	}

	/** Replaces the whole canvas with an image, on white (the paper colour). */
	function paint(src: CanvasImageSource) {
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.globalCompositeOperation = 'source-over';
		ctx.fillStyle = '#ffffff';
		ctx.fillRect(0, 0, canvas.width, canvas.height);
		ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
		ctx.setTransform(scale, 0, 0, scale, 0, 0);
	}

	/** Records the canvas as a new undo step and schedules a save. */
	function commit(delay: number) {
		history.push(snapshot());
		sync();
		saver.changed(delay);
	}

	async function imageFromUrl(src: string): Promise<HTMLImageElement> {
		const img = new Image();
		img.src = src;
		await img.decode();
		return img;
	}

	async function imageFromBlob(blob: Blob): Promise<ImageBitmap> {
		return createImageBitmap(blob);
	}

	/** Runs canvas-replacing steps one at a time, so fast Undo clicks land in order. */
	let chain: Promise<void> = Promise.resolve();
	function run(step: () => Promise<void>) {
		chain = chain.then(async () => {
			busy = true;
			try {
				await step();
			} catch (e) {
				console.error('Drawing step failed', e);
			} finally {
				busy = false;
			}
		});
		return chain;
	}

	// ---------- loading (§5.4) ----------
	async function load() {
		let img: CanvasImageSource | null = null;
		try {
			const res = await fetch(api, { cache: 'no-store' });
			if (res.ok) img = await imageFromBlob(await res.blob());
			else if (res.status !== 404) loadError = true;
		} catch {
			loadError = true;
		}
		if (loadError) saver.disable(); // never overwrite a drawing we failed to read
		img ??= await imageFromUrl(baseFor(zone));
		paint(img);
		loaded = img;
		history.reset(snapshot());
		sync();
		ready = true;
	}

	async function loadPriors() {
		try {
			const res = await fetch(`${api}/priors`, { cache: 'no-store' });
			if (res.ok) priors = ((await res.json()) as { priors: Prior[] }).priors;
		} catch {
			priors = [];
		}
	}

	// ---------- tools ----------
	function undo() {
		if (!history.canUndo) return;
		run(async () => {
			const step = history.undo();
			sync();
			if (!step) return;
			const bmp = await imageFromBlob(await step);
			paint(bmp);
			bmp.close();
			saver.changed(0);
		});
	}

	function redo() {
		if (!history.canRedo) return;
		run(async () => {
			const step = history.redo();
			sync();
			if (!step) return;
			const bmp = await imageFromBlob(await step);
			paint(bmp);
			bmp.close();
			saver.changed(0);
		});
	}

	function revert() {
		run(async () => {
			if (!loaded) return;
			paint(loaded);
			commit(0);
		});
	}

	function loadBase(src: string) {
		run(async () => {
			paint(await imageFromUrl(src));
			commit(0);
		});
	}

	/** "Use this image": the prior becomes this visit's starting point and is saved with it (§5.4). */
	function usePrior(p: Prior) {
		run(async () => {
			const res = await fetch(`${api}/priors/${p.id}`, { cache: 'no-store' });
			if (!res.ok) throw new Error(`Prior drawing ${res.status}`);
			const bmp = await imageFromBlob(await res.blob());
			paint(bmp);
			loaded = bmp;
			commit(0);
			view = 0;
		});
	}

	// ---------- pointer drawing (mouse, pen and touch; §5.2 FIX) ----------
	let activePointer: number | null = null;
	let last: { x: number; y: number } | null = null;

	function toCanvas(e: PointerEvent) {
		const r = canvas.getBoundingClientRect();
		return { x: ((e.clientX - r.left) * W) / r.width, y: ((e.clientY - r.top) * H) / r.height };
	}

	function onpointerdown(e: PointerEvent) {
		if (!ready || busy || activePointer !== null) return;
		if (e.pointerType === 'mouse' && e.button !== 0) return;
		e.preventDefault();
		canvas.setPointerCapture?.(e.pointerId);
		canvas.focus({ preventScroll: true });
		activePointer = e.pointerId;
		last = toCanvas(e);
		// A tap leaves a dot.
		ctx.beginPath();
		ctx.arc(last.x, last.y, width / 2, 0, Math.PI * 2);
		ctx.fillStyle = color;
		ctx.fill();
	}

	function onpointermove(e: PointerEvent) {
		if (e.pointerId !== activePointer || !last) return;
		const coalesced = e.getCoalescedEvents?.() ?? [];
		const events = coalesced.length ? coalesced : [e];
		ctx.strokeStyle = color;
		ctx.lineWidth = width;
		ctx.lineCap = 'round';
		ctx.lineJoin = 'round';
		ctx.beginPath();
		ctx.moveTo(last.x, last.y);
		for (const ev of events) {
			last = toCanvas(ev);
			ctx.lineTo(last.x, last.y);
		}
		ctx.stroke();
	}

	function onpointerup(e: PointerEvent) {
		if (e.pointerId !== activePointer) return;
		activePointer = null;
		last = null;
		commit(1500);
	}

	// ---------- keyboard: undo/redo while focus is inside the panel ----------
	function onkeydown(e: KeyboardEvent) {
		if (!(e.ctrlKey || e.metaKey) || e.altKey || view !== 0) return;
		const k = e.key.toLowerCase();
		if ((k === 'z' && e.shiftKey) || (k === 'y' && !e.shiftKey)) redo();
		else if (k === 'z') undo();
		else return;
		// Handled here, so the exam page's own Ctrl+Z (bulk-action undo) must not also run.
		e.preventDefault();
		e.stopPropagation();
	}

	// ---------- lifecycle ----------
	onMount(() => {
		scale = Math.min(3, Math.max(2, Math.ceil(window.devicePixelRatio || 1)));
		canvas.width = W * scale;
		canvas.height = H * scale;
		ctx = canvas.getContext('2d')!;
		run(load);
		loadPriors();

		const onvisibility = () => {
			if (document.visibilityState === 'hidden') void saver.flush(true);
		};
		const onbeforeunload = (e: BeforeUnloadEvent) => {
			if (saver.dirty) e.preventDefault();
		};
		document.addEventListener('visibilitychange', onvisibility);
		window.addEventListener('beforeunload', onbeforeunload);
		return () => {
			document.removeEventListener('visibilitychange', onvisibility);
			window.removeEventListener('beforeunload', onbeforeunload);
			// Panel closing or zone changing: save what is on the canvas.
			void saver.flush();
			saver.stop();
		};
	});

	const fmt = (date: string) => i18n.date(date);

	/** The saver's failure in the page language (the server's own detail text stays as sent). */
	function problemText(): string {
		const p = saver.problem;
		if (!p) return saver.message ?? t('drawing.notSaved');
		switch (p.kind) {
			case 'readonly':
				return p.detail ? t('drawing.notSavedBecause', { reason: p.detail }) : t('drawing.notSavedReadOnly');
			case 'signedOut':
				return t('drawing.signedOut');
			case 'tooLarge':
				return t('drawing.notSavedTooLarge');
			case 'refused':
				return p.detail ? t('drawing.notSavedBecause', { reason: p.detail }) : t('drawing.notSavedError', { status: p.status });
			case 'retrying':
				return t('drawing.notSavedRetrying');
		}
	}

	const status = $derived.by(() => {
		switch (saver.status) {
			case 'pending':
			case 'saving':
				return t('drawing.saving');
			case 'saved':
				return saver.savedAt ? t('drawing.savedAt', { time: i18n.time(saver.savedAt) }) : t('drawing.saved');
			case 'retrying':
			case 'failed':
				return problemText();
			default:
				return '';
		}
	});
	const customActive = $derived(!PENCILS.some((p) => p.color === color));
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<section class="drawing" aria-label={t('drawing.heading', { zone: label })} {onkeydown}>
	<header class="head">
		<h2>{t('drawing.heading', { zone: label })}</h2>
		<span
			class="status"
			class:warn={saver.status === 'retrying' || saver.status === 'failed'}
			role="status"
			aria-live="polite">{status}</span
		>
	</header>

	{#if priors.length > 0}
		<div class="nav" role="group" aria-label={t('drawing.navGroup')}>
			<button type="button" onclick={() => (view = priors.length)} disabled={view === priors.length} aria-label={t('drawing.navOldest')}>⏮</button>
			<button type="button" onclick={() => view++} disabled={view === priors.length} aria-label={t('drawing.navOlder')}>◀</button>
			<select bind:value={view} aria-label={t('drawing.navChoose')}>
				<option value={0}>{t('drawing.thisVisit')}</option>
				{#each priors as p, i (p.id)}
					<option value={i + 1}>{fmt(p.date)} · {p.visitType}</option>
				{/each}
			</select>
			<button type="button" onclick={() => view--} disabled={view === 0} aria-label={t('drawing.navNewer')}>▶</button>
			<button type="button" onclick={() => (view = 0)} disabled={view === 0} aria-label={t('drawing.navNewest')}>⏭</button>
		</div>
	{/if}

	{#if prior}
		<figure class="prior">
			<img src="{api}/priors/{prior.id}" width={W} height={H} alt={t('drawing.priorAlt', { zone: label, date: fmt(prior.date) })} />
			<figcaption>{t('drawing.priorCaption', { date: fmt(prior.date) })}</figcaption>
		</figure>
		<div class="row">
			<button type="button" class="primary" onclick={() => usePrior(prior)} disabled={!ready}>{t('drawing.useThisImage')}</button>
			<button type="button" onclick={() => (view = 0)}>{t('drawing.backToThisVisit')}</button>
		</div>
	{/if}

	<div class="board" hidden={!!prior}>
		<div class="frame">
			<canvas
				bind:this={canvas}
				tabindex="0"
				aria-label={t('drawing.canvasLabel', { zone: label })}
				{onpointerdown}
				{onpointermove}
				{onpointerup}
				onpointercancel={onpointerup}
				oncontextmenu={(e) => e.preventDefault()}
			></canvas>
			{#if !ready}<p class="loading">{t('drawing.loading')}</p>{/if}
		</div>
		{#if loadError}<p class="error" role="alert">{t('drawing.loadError')}</p>{/if}

		<div class="tools" role="group" aria-label={t('drawing.pencilGroup')}>
			{#each PENCILS as p (p.color)}
				<button
					type="button"
					class="pencil"
					class:on={color === p.color}
					aria-pressed={color === p.color}
					aria-label={t('drawing.pencil', { colour: t(p.name) })}
					title={t('drawing.pencil', { colour: t(p.name) })}
					onclick={() => (color = p.color)}
				>
					<span class="swatch" style:background={p.color}></span>
				</button>
			{/each}
			<label class="pencil picker" class:on={customActive} title={t('drawing.pickColour')}>
				<input type="color" value={customActive ? color : '#2e7d32'} oninput={(e) => (color = e.currentTarget.value)} />
				<span class="visually-hidden">{t('drawing.customColour')}</span>
			</label>
		</div>

		<div class="tools" role="group" aria-label={t('drawing.lineWidthGroup')}>
			{#each WIDTHS as w (w)}
				<button
					type="button"
					class="width"
					class:on={width === w}
					aria-pressed={width === w}
					aria-label={t('drawing.lineWidth', { width: w })}
					title={t('drawing.lineWidth', { width: w })}
					onclick={() => (width = w)}
				>
					<span class="sample" style:height="{Math.min(w, 12)}px"></span>
					<span class="num">{w}</span>
				</button>
			{/each}
		</div>

		<div class="row actions">
			<button type="button" onclick={undo} disabled={!canUndo} aria-keyshortcuts="Control+Z" title={t('drawing.undoTitle')}>{t('drawing.undo')}</button>
			<button type="button" onclick={redo} disabled={!canRedo} aria-keyshortcuts="Control+Y Control+Shift+Z" title={t('drawing.redoTitle')}>{t('drawing.redo')}</button>
			<button type="button" onclick={revert} disabled={!ready} title={t('drawing.revertTitle')}>{t('drawing.revert')}</button>
			<button type="button" onclick={() => loadBase(baseFor(zone))} disabled={!ready} title={t('drawing.newTitle', { zone: label })}>{t('drawing.new')}</button>
			<button type="button" onclick={() => loadBase(BLANK_BASE)} disabled={!ready} title={t('drawing.blankTitle')}>{t('drawing.blank')}</button>
		</div>
	</div>
</section>

<style>
	.drawing {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--space-2);
		align-content: start;
	}
	.head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--space-2);
	}
	h2 {
		margin: 0;
		font-size: var(--text-md);
	}
	.status {
		font-size: var(--text-xs);
		color: var(--text-3);
		text-align: right;
	}
	.status.warn,
	.error {
		color: var(--danger);
	}
	.error {
		margin: 0;
		font-size: var(--text-xs);
	}
	.board {
		display: grid;
		gap: var(--space-2);
	}
	.board[hidden] {
		display: none;
	}
	.frame {
		position: relative;
		width: 100%;
		max-width: 675px;
	}
	canvas,
	.prior img {
		display: block;
		width: 100%;
		max-width: 675px;
		height: auto;
		aspect-ratio: 450 / 250;
		background: #fff;
		border: 1px solid var(--hairline);
		border-radius: var(--radius-1);
	}
	canvas {
		/* Only the canvas swallows touch gestures, so the page still scrolls elsewhere. */
		touch-action: none;
		user-select: none;
		-webkit-user-select: none;
		-webkit-touch-callout: none;
		cursor: crosshair;
	}
	.loading {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		margin: 0;
		color: #4a5160;
		font-size: var(--text-sm);
	}
	.prior {
		margin: 0;
		display: grid;
		gap: var(--space-1);
	}
	figcaption {
		font-size: var(--text-xs);
		color: var(--text-2);
	}
	.nav {
		display: flex;
		gap: 4px;
	}
	.nav button {
		min-width: 36px;
		padding: 0;
	}
	select {
		flex: 1 1 0;
		width: 0;
		min-width: 0;
		min-height: var(--target-min);
		font: inherit;
		color: var(--text-1);
		background: var(--surface-0);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-1);
		padding: 0 var(--space-2);
	}
	.tools,
	.row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 4px;
	}
	.row {
		gap: var(--space-2);
	}
	.pencil {
		position: relative;
		display: inline-grid;
		place-items: center;
		width: max(var(--target-min), 32px);
		height: max(var(--target-min), 32px);
		padding: 0;
		border-radius: var(--radius-pill);
		border-color: transparent;
		background: transparent;
		cursor: pointer;
	}
	.swatch,
	.picker input {
		width: 18px;
		height: 18px;
		border-radius: var(--radius-pill);
		border: 1px solid rgb(0 0 0 / 0.35);
		box-shadow: 0 0 0 1px rgb(255 255 255 / 0.5);
	}
	/* The selected pencil is enlarged (§5.2). */
	.pencil.on .swatch,
	.picker.on input {
		width: 26px;
		height: 26px;
	}
	.pencil.on {
		border-color: var(--accent);
		background: var(--accent-soft);
	}
	.picker input {
		padding: 0;
		cursor: pointer;
		background: conic-gradient(red, yellow, lime, cyan, blue, magenta, red);
		-webkit-appearance: none;
		appearance: none;
	}
	.picker:focus-within {
		outline: 2px solid var(--focus-ring);
		outline-offset: 2px;
	}
	.picker input:focus-visible {
		outline: none;
	}
	.picker input::-webkit-color-swatch-wrapper {
		padding: 0;
	}
	.picker input::-webkit-color-swatch {
		border: none;
		border-radius: var(--radius-pill);
	}
	.picker input::-moz-color-swatch {
		border: none;
		border-radius: var(--radius-pill);
	}
	.picker:not(.on) input::-webkit-color-swatch {
		opacity: 0;
	}
	.picker:not(.on) input::-moz-color-swatch {
		opacity: 0;
	}
	.width {
		display: inline-flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 3px;
		min-width: 40px;
		padding: 2px var(--space-2);
		border-bottom-width: 1px;
	}
	.sample {
		display: block;
		width: 22px;
		min-height: 1px;
		border-radius: var(--radius-pill);
		background: var(--text-1);
	}
	.width .num {
		font-size: var(--text-xs);
		line-height: 1;
	}
	/* The selected width is underlined (§5.2). */
	.width.on {
		border-color: var(--accent);
		background: var(--accent-soft);
		box-shadow: inset 0 -3px 0 var(--accent);
	}
	.primary {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--accent-text);
	}
	.primary:hover {
		background: var(--accent);
		filter: brightness(1.05);
	}
	@media (prefers-reduced-motion: no-preference) {
		.swatch,
		.picker input {
			transition:
				width var(--dur-micro-in) var(--ease-standard),
				height var(--dur-micro-in) var(--ease-standard);
		}
	}
</style>
