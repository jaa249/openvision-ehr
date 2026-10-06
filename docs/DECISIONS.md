# Decisions log

## 2026-10-06

| # | Topic | Decision | Why |
|---|---|---|---|
| D1 | License | **Apache-2.0**, clean-room rewrite | Lets any practice or company adopt it; patent grant. eye_mag (GPL-3) is a feature reference only |
| D2 | Stack | **Svelte + SQLite**, single install; Postgres optional later | Lightest pages for old office PCs; one app + one database file to install and back up |
| D3 | Feature scope | **eye_mag feature parity, near-verbatim**, per [`spec/BEHAVIOR.md`](spec/BEHAVIOR.md) | Users rate eye_mag highly; switching should need no retraining. Items tagged FIX are corrected, not copied |
| D4 | Keyboard shortcuts | **Alt** + T/D/P/B/K (not Ctrl) | Originals never bound and clash with browser Ctrl+T/D/P. No Ctrl option |
| D5 | Unknown shorthand code | Entry stays in the bar with a "did you mean…" suggestion | Original silently appended it to the previous field, hiding typos |
| D6 | New-user defaults | Common panels open + standard normal-exam defaults | Original's defaults never reached real users |
| D7 | Billing-code logic | **Suggestions only in v1**, always showing the reasoning; the doctor chooses | No coder review yet of BEHAVIOR.md §11.1 / §9.4. Revisit before auto-filling codes |
| D8 | AI | Not in the base install; optional downloadable pack, hardware-checked | Keep it light for low-power users; let capable machines do more |
| D9 | Laterality layout | OD-left doctor view for panels/drawings; OD top row in Rx tables; text labels always | No published standard; labels make either orientation safe |
| D10 | Name | **OpenVision**, repo `jaa249/openvision-ehr`, public | Plain, descriptive; qualifier avoids clashes with other "OpenVision" software |
| D11 | Shorthand submit key | **Enter only**; Tab keeps its normal focus move | Original also captured Tab, which traps keyboard users in the box |
| D12 | First slice | Slit lamp section end to end; single local user, no sign-in yet | Proves stack, shorthand, autosave and ownership checks before widening |
| D13 | Phase 2 scope | External + fundus, quick picks, prior visits with copy forward | eye_mag's two most-used strengths after shorthand |
| D14 | Quick-pick starter list | Our own short list per section, spellings corrected; copied into each provider's list on first use | Clean room; providers own and can later edit their list |
| D15 | Copy forward | Copies only fields the prior visit recorded; blank prior fields leave today's value alone. Copied fields get a tint until edited; one Undo reverts | Avoids wiping today's work with empties; tint makes carried-over findings visible for review |
| D16 | Pre-release databases | No data migrations for seed changes before v0.1; delete `data/` to pick up new demo data | Only fictional demo data exists; keeps the migration list for real schema changes |

## Still open

- Drawing library base (own vector canvas on a permissive base; not EyeDraw/AGPL).
- Equipment import order after Topcon.
