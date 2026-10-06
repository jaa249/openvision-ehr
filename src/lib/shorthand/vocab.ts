// Abbreviation expansion for exam-finding text (docs/spec/SHORTHAND.md, with the
// fixes from BEHAVIOR.md §2.2: no swallowed spaces, Krukenberg spelling, finding zones only).

type Rule = [pattern: RegExp, replacement: string];

// [abbreviation, expansion, caseInsensitive]
const WORDS: [string, string, boolean][] = [
	['inf', 'inferior', false],
	['sup', 'superior', false],
	['nas', 'nasal', false],
	['temp', 'temporal', false],
	['med', 'medial', false],
	['lat', 'lateral', false],
	['dermato', 'dermatochalasis', false],
	['lac', 'laceration', false],
	['lacr', 'lacrimal', false],
	['dcr', 'DCR', true],
	['bcc', 'BCC', true],
	['scc', 'SCC', true],
	['sebc', 'sebaceous cell carcinoma', true],
	['fh', 'forehead', true],
	['glab', 'glabellar', true],
	['cic', 'cicatricial', true],
	['entrop', 'entropion', true],
	['ectrop', 'ectropion', true],
	['ect', 'ectropion', false],
	['ent', 'entropion', true],
	['tr', 'trace', true],
	['gut', 'guttata', false],
	['pter', 'pterygium', false],
	['pig', 'pigmented', false],
	['inj', 'injection', true],
	['fc', 'flare/cell', true],
	['ks', 'Krukenberg spindle', true],
	['spk', 'SPK', true],
	['pek', 'PEK', true],
	['str', 'stromal', true],
	['endo', 'endothelial', true],
	['rec', 'recession', true],
	['limb', 'limbus', true],
	['tl', 'tear lake', true],
	['csme', 'CSME', true],
	['bdr', 'BDR', true],
	['ppdr', 'PPDR', false],
	['ht', 'horseshoe tear', true],
	['ab', 'air bubble', true],
	['c3f8', 'C3F8', true],
	['ma', 'macroaneurysm', true],
	['mias', 'microaneurysm', true],
	['ped', 'PED', true],
	['mac', 'macula', true],
	['fov', 'fovea', true],
	['vh', 'vitreous hemorrhage', true]
];

const RULES: Rule[] = [
	[/w\/ /g, 'with '],
	// "3 o" -> "3 o'clock" for clock hours 1-12
	[/\b(1[0-2]|[1-9]) o\b(?!')/gi, "$1 o'clock"],
	...WORDS.map(([abbr, full, ci]): Rule => [new RegExp(`\\b${abbr}\\b`, ci ? 'gi' : 'g'), full])
];

export function expandVocab(text: string): string {
	let out = text;
	for (const [re, rep] of RULES) out = out.replace(re, rep);
	return out;
}
