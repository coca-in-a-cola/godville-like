# GDD acceptance inventory

This is a derived engineering checklist, NOT a replacement or edit of `GDD.md`. Nothing below claims implementation. Source sections and original block IDs remain in `GDD.md`.

## Export acceptance — verified

- Page ID: `4058c1db-e262-8144-bb05-e6202b3fe286`.
- Original page title: **Godville-like — Game Design Document**.
- Root pagination: 198 blocks over two responses (100 + 98).
- Recursive total: 359 blocks; 16 tables, 158 table rows, 5 code blocks, 4 equation blocks; 17 level-2 sections. All child lists drained to `has_more=false`.
- Table cells, rich-text equations, display equations, code languages/content, links, and nested bullet children retained. Every block has an original-ID HTML anchor, including table rows.
- Raw page/response JSON and enriched full tree are PRIVATE OUTSIDE THIS WORKSPACE at `/home/tyler/.hermes/profiles/tyler/artifacts/godville-preflight/notion-raw/`. Individual response JSON preserves the original response; only `tree.json` adds `_export_children`.
- Manifest/checksums: `/home/tyler/.hermes/profiles/tyler/artifacts/godville-preflight/export-manifest.json`.
- `GDD.md` SHA-256: `294dbcf56799b764cc2a15f56eef9bbe4f023a0844362b046e5e6947ac2bbf96`.
- Only Notion GET requests used. Source Notion page not modified. Credentials never copied into project/export.

## Full original GDD coverage and release acceptance

All items are pending implementation unless stated otherwise. **F** = foundation implementation requested now; **N** = next combat increment; **P** = later prototype; **D** = explicitly deferred beyond prototype. Split rows are intentional; this is not permission to build everything now.

| Original section | Acceptance inventory | Increment |
|---|---|---|
| Summary | Single-player, client-only, text-only autonomous hero; measurable god decisions; English first; no server/MMO | F constraints; P complete game |
| Vision | Hero acts, god nudges; transparent deterministic math; loot decisions by power; no art; reusable server-compatible sim | F architecture; P loop |
| What we take from Godville, and what we drop | Autonomous quests, diary, GP, numeric Blessing/Smite, keyword Voice, shops/loot | F combat actions; P rest; D temple/pet/social |
| The god (the player) | GP 0–100, +1/6 real minutes independent of world speed; 100-GP accumulator charges, max 3. Blessing 25 GP heals 25%; Smite 25 GP deals 20% enemy max HP bypass; outside combat Smite costs hero 10% HP, adds 5% quest and evil alignment; outside Blessing adds good alignment. Voice 5 GP, `fight/flee/rest/town/dig`, obey 30% + Clarity; Capacity/Flow/Miracle power/Clarity bought with Faith | F combat/clock; P charge/Voice/upgrades |
| The hero | Town→Travel→Combat→Travel/Return→Town, Combat→Dead→Town. Return at HP <30%, full trophy pouch or quest done. Town sells weak half + all trophies, buys one affordable item, heals, quests. Death timer and loss 25% gold + one random equipped non-blessed item. Zone `ceil((base mile + miles from town)/10)`. Godville 0/level1, Tradeburg 50/10, Beerburgh120/20, Godvillewood200/30; move after current quest at threshold. Cheap TTK courage/flee estimate; flee 50%+evasion. Alignment, favorite word, diary and quests | F estimate utility; P world loop |
| Stats and items | Nine stats; HP100, damage4–6, AS0/cap200%, DEF0, crit0/cap50%, evasion0/cap60%, regen0.5HP/s, vamp0/cap30%, counter0/cap40%. Caps on totals, not items. Damage-to-All/magic later | F all 9; D extra 2 |
| Loot, inventory and modifiers | Weapon/helmet/armor/shield/ring/amulet; 10 gear bag + separate 10 trophy pouch. Weighted power HP1, avg damage5, AS%2.5, DEF5, crit%5, EV%5, regen33, vamp%6.7, counter%5. Level scale1+0.15L, base slot power20. Modifiers 1–3 at zones1–5, 3–6 at6–15, 6–12 at16+; duplicates multiply. Flat stats→multipliers→curses→power→price; curse targets HP/damage/DEF/AS/regen with 1.5 standard modifier penalty. Full modifier catalog, stable group name order, full/compact names and ratio colors. Full bag keeps stronger; equip >=5% perceived upgrade; sell weaker half. Cursed/heretical alignment ×0.7/1.3, favorite word ×1.25, god blessing5GP ×1.5 + locked; locked never sold/dropped/death-lost | P, not foundation |
| Combat model | Seeded100ms ticks; attack1.5/(1+AS), overflow retained; queued actions→regen→bars→fullest-first (hero tie)→death. Dodge→uniform integer damage→crit×2→defense floor20%→vamp→single counter. Monster HP40+18L, damage3+1.5L to5+2.5L, family intervals1.2–2.4s, DEF0.6L. Five family tilts. Hero cheap EDPS/TTK; god200-trial Monte Carlo from current state each visible second. 10,000 fights/zone target85% wins,40–60% finishing HP; dev simulator | F rules/forecast; N balance tool/tuning; P generated families |
| Time model | Visible1×, hidden/closed0.1× via Page Visibility. No idle check/watch cap. Same outcomes per game second. GP real-time; travel/fights/quests/death world-time. Lazy catch-up persists state/RNG/timestamp, offline elapsed×0.1; localStorage initially | F pure advance/manual toggle/GP split; P visibility + persistence/world catch-up |
| Presentation | Text-only three-column hero/live/god dashboard: level/XP/HP/gold/town/distance/quest/stats/gear/bag; fight HP+attack bars, forecast+scroll log, diary otherwise; GP/charges/actions/Voice/godstats. Damage white/red, heal green,dodge grey,crit yellow,god violet. No graphics, optional text-number flash only | F sandbox bars/log/actions; P full dashboard |
| Writing, names and humor | All names in five CSV files: monsters,towns,trophies,bases,modifiers; stable IDs. Godville names placeholders. Typed diary templates 5–20 variants/event, not reused within last20 lines; preserve replacement-by-data | F schema/representative CSV; P corpus/catalog, name licensing review before publication |
| Localization | UI/diary ICU in en.json; content name_xx CSV; saved `{key,params,variantSeed}` events; locale grammar/order/inflection hooks, full/compact names; Intl formatting; pseudo-locale for expansion testing | F English ICU/event boundary; P item grammar/pseudo-locale/full diary |
| Progression and economy | XP next100×level^1.5, level+8HP/+0.5 each base damage end; Faith from quests/levels buys four godstats at rising costs; gold shop/death sinks, sell30% value, daily shop reroll; bricks0.5% kill drop; temple1000bricks phase2 with10/30/50/100% milestones | P hero/Faith/economy; D temple |
| Not in the prototype: MMO and social | No accounts, multiplayer, raids,guilds,leaderboards,newspaper,shared replays,server; keep deterministic IDs to enable later migration | F/P exclusions; D social |
| Tech stack | StrictTS,pnpm workspaces packages/sim+packages/data+apps/web,Vite,Preact/signals,plainCSS,seeded generator,PapaParse+Zod,ICU,Comlink Worker,localStorage thenIndexedDB,Vitest+fast-check. HP tenths/chances bp; pure no-clock/no-signals sim; no pow/exp in tick | F architecture/toolchain; P saves |
| Prototype plan | 1 combat sandbox +10k simulator;2 loot sandbox +roll100;3 autonomous hour+readable diary;4 god/time +rewarding overnight catch-up;5 server thenMMO. Exit gates tested separately; no art/audio/monetization/mobile-polish expansion | F subset of1; N finish1; P2–4; D5 |
| Decisions | Preserve all14 final choices: visible speed/no cap/GP real time/9stats/20%floor/power+quirks/10+10bag/multiplicative uncapped items/5curse targets/town+distance/death25%+item/1v1/MonteCarlo/CSVnames | F applicable invariants; P remainder |

## Numerical ambiguities to document, not silently change

1. Integer damage rolls vs fractional monster endpoints and +0.5 hero damage growth: choose and document normalization/rounding. HP tenths cannot exactly represent regeneration0.5HP/s per100ms tick without a carried subunit remainder; preserve it.
2. Same-tick lethal Smite/regen/attacks, dead actors attacking, and simultaneous deaths are underspecified. Decide explicit terminal ordering compatible with tick/hit sequence; test it.
3. Defense and negative cursed stats need lower bounds, and attack speed must never create a nonpositive interval. GDD gives upper caps but not all lower caps. Do not invent them as original requirements.
4. Attack interval fixed-point approximation and whole elapsed-time remainders must be stable across split advancement and save/restore.
5. Forecast seed derivation, draws/stalemates, action inclusion, max ticks, and exact TTK→win probability/courage threshold are not specified. Keep bounded and deterministic; isolate these policies.
6. Modifier catalog and illustrative CSV disagree on Vampirism value (standard1.5% vs sample1); worked example rounds numbers approximately. Regeneration weight33 and vamp6.7 are rounded. Treat tables/rules as authoritative; record exact implementation rounding and regression expectations when loot is built.
7. Charge limit3 in prototype vs third charge temple30% unlock is inconsistent. Item locks do not specify how many may be blessed until temple50% unlock. Do not resolve by implementing phase2 prematurely.
8. Travel speed/encounter chances, quest rate/rewards, death timeout, Faith upgrade costs, family tilts, shop prices/reroll clock, and weighted modifier distribution are not fully numeric. Use explicit tunable data in later prototype increments, label assumptions.
9. Default starting zone at mile0 is0 by the written ceiling formula, while early modifier ranges begin1. Preserve formula and flag starting-zone generation policy when world/loot is built.
10. Godville names are explicitly placeholders; public distribution should retain attribution/provenance and review rights or replace names in data. No external assets or new scraped corpus are authorized in foundation.

## Parent acceptance after foundation

Run actual `pnpm test`, `pnpm typecheck`, `pnpm build`, inspect actual source/core boundaries and structured Claude result (`is_error`, model identity, permission denials), then exercise browser sandbox if browser tools are available. Do not equate an executor exit0 with complete game or publish-ready acceptance. Board stays unchanged. Parent separately owns atomic Git checkpoints, personal coca-in-a-cola repository, Pages and release after later feature acceptance.
