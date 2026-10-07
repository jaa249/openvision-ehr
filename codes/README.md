# Code sets

- `icd10cm_codes_2027.txt.gz`: ICD-10-CM FY2027 code descriptions (valid for dates of service from 2026-10-01), from the CMS "Code Descriptions in Tabular Order" file (`icd10cm_codes_2027.txt`), gzip-compressed and otherwise unchanged. ICD-10-CM is published by CMS and NCHS and is in the public domain. Source: https://www.cms.gov/medicare/coding-billing/icd-10-codes

Each line: the code without a dot, padded to 8 characters, then the description. To update for a new fiscal year, download the new file, gzip it here and change the file name in the code loader.

- `icd11_mms_2026-01_en.txt.gz`: WHO ICD-11 for Mortality and Morbidity Statistics (MMS), release 2026-01, English: WHO's `SimpleTabulation-ICD-11-MMS-en.txt`, gzip-compressed and otherwise **shipped unchanged**. `icd11_mms_readme.txt` is WHO's description of its columns. Source: https://icd.who.int (ICD-11 browser, "Info" > downloads). Licence: CC BY-ND 3.0 IGO (Creative Commons Attribution-NoDerivatives 3.0 IGO) with WHO's ICD-11 licence terms. Citation:

  > International Classification of Diseases, Eleventh Revision (ICD-11), World Health Organization (WHO) 2019 https://icd.who.int

  OpenVision reads this file as published and never writes a modified copy. Every ICD-11 code it stores keeps its code, WHO title and URI (linearization URI) together. OpenVision has no mapping or crosswalk between ICD-10(-CM) and ICD-11 and does not translate WHO titles (the leading "- " depth markers are left out on screen only). To update to a new release, download WHO's new SimpleTabulation file for MMS in English, gzip it here unchanged, replace the readme with WHO's, and change `ICD11_FILE` in `src/lib/server/icd11.ts`; the table reloads itself. Then run the tests: they check that every code in the file matches OpenVision's code shapes and that the laterality extension codes (XK9K right, XK8G left, XK9J bilateral) still exist.

CPT codes are copyrighted by the AMA; OpenVision stores only the numbers a practice enters or selects, with its own short descriptions.
