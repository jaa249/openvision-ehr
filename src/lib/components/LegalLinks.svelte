<script lang="ts">
	// Terms of Use, Privacy Policy and the data safety notice (D51), as a small footer.
	import { useI18n } from '#lib/i18n/context.ts';

	const { t } = useI18n();
</script>

<nav class="legal" aria-label={t('shell.legalNav')}>
	<a href="/legal/terms">{t('shell.legalTerms')}</a>
	<a href="/legal/privacy">{t('shell.legalPrivacy')}</a>
	<a href="/legal/notice">{t('shell.legalNotice')}</a>
</nav>

<style>
	.legal {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1) var(--space-4);
		margin-top: var(--space-5);
		font-size: var(--text-sm);
	}
	.legal a {
		color: var(--text-2);
		min-height: var(--target-min);
		display: inline-flex;
		align-items: center;
	}
</style>
