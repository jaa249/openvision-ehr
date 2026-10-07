// The English translator for coding text built outside a component (D48): the server, the printed
// report and the tests call the coding functions without a translator and get English; the Codes
// panel passes its own `t` so the same text shows in the user's language.
import { EN } from '#lib/i18n/catalog.ts';
import { createTranslator, type Translator } from '#lib/i18n/translate.ts';

export type Translate = Translator['t'];

let en: Translator | null = null;
export const english: Translate = (key, params) => (en ??= createTranslator('en', EN, EN)).t(key, params);
