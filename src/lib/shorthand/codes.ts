// Shorthand vocabulary for the sections built so far. Codes are compared upper-case.
// Source of truth for the full set: docs/spec/SHORTHAND.md (+ fixes in BEHAVIOR.md §2.6).

import type { SectionId } from '#lib/exam/catalog.ts';

/** Code -> target field ids. Field ids themselves are also valid codes (handled by the parser). */
export const ALIASES: Record<string, string[]> = {
	// single eye
	RC: ['ODCONJ'],
	LC: ['OSCONJ'],
	RK: ['ODCORNEA'],
	LK: ['OSCORNEA'],
	RAC: ['ODAC'],
	LAC: ['OSAC'],
	RL: ['ODLENS'],
	LL: ['OSLENS'], // left lens wins over "both lower lids" (spec §2.6)
	RI: ['ODIRIS'],
	LI: ['OSIRIS'],
	RG: ['ODGONIO'],
	LG: ['OSGONIO'],
	RPACH: ['ODKTHICKNESS'],
	LPACH: ['OSKTHICKNESS'],
	RSCH1: ['ODSCHIRMER1'],
	LSCH1: ['OSSCHIRMER1'],
	RSCH2: ['ODSCHIRMER2'],
	LSCH2: ['OSSCHIRMER2'],
	RTBUT: ['ODTBUT'],
	LTBUT: ['OSTBUT'],
	ASCOM: ['ANTSEG_COMMENTS'],
	ACOM: ['ANTSEG_COMMENTS'],
	// both eyes
	BC: ['ODCONJ', 'OSCONJ'],
	C: ['ODCONJ', 'OSCONJ'],
	BK: ['ODCORNEA', 'OSCORNEA'],
	K: ['ODCORNEA', 'OSCORNEA'],
	BAC: ['ODAC', 'OSAC'],
	AC: ['ODAC', 'OSAC'],
	BL: ['ODLENS', 'OSLENS'],
	L: ['ODLENS', 'OSLENS'],
	BI: ['ODIRIS', 'OSIRIS'],
	I: ['ODIRIS', 'OSIRIS'],
	BG: ['ODGONIO', 'OSGONIO'],
	G: ['ODGONIO', 'OSGONIO'],
	GONIO: ['ODGONIO', 'OSGONIO'],
	BPACH: ['ODKTHICKNESS', 'OSKTHICKNESS'],
	PACH: ['ODKTHICKNESS', 'OSKTHICKNESS'],
	BTBUT: ['ODTBUT', 'OSTBUT'],
	TBUT: ['ODTBUT', 'OSTBUT'],
	SCH1: ['ODSCHIRMER1', 'OSSCHIRMER1'], // shown as a label but unhandled in the original (§2.6)
	SCH2: ['ODSCHIRMER2', 'OSSCHIRMER2'],
	BSCH1: ['ODSCHIRMER1', 'OSSCHIRMER1'],
	BSCH2: ['ODSCHIRMER2', 'OSSCHIRMER2']
};

export type Command = { kind: 'defaults' | 'clear'; sections: SectionId[] | 'all' };

/** Whole-entry commands (spec §2.3 stage 1). */
export const COMMANDS: Record<string, Command> = {
	D: { kind: 'defaults', sections: 'all' },
	DANTSEG: { kind: 'defaults', sections: ['ANTSEG'] },
	DAS: { kind: 'defaults', sections: ['ANTSEG'] },
	CLEARAS: { kind: 'clear', sections: ['ANTSEG'] },
	CLEARANTSEG: { kind: 'clear', sections: ['ANTSEG'] },
	CANTSEG: { kind: 'clear', sections: ['ANTSEG'] },
	CANT: { kind: 'clear', sections: ['ANTSEG'] },
	CAS: { kind: 'clear', sections: ['ANTSEG'] }
};
