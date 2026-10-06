/** Upper bound for one print job, so a mistaken "select all" cannot hang the browser. */
export const MAX_PRINT = 200;

/** Upper bound for one CSV/FHIR export; matches the longest list the Encounters page shows. */
export const MAX_EXPORT = 500;
