# flat-earth-sim — v1.3 audit follow-up: Progress

Source plan: `C:\Users\User\.claude\plans\have-a-look-at-spicy-newt.md` (read for context; this file is the live state).

**Update protocol (for Claude):** tick items the moment they land. Checkpoint before stopping/compacting/usage running out. On resume: read this file first.

Legend: `[x]` done · `[~]` partial · `[ ]` not started · `[-]` deferred

Last updated: 2026-08-22

---

One Conventional Commit per step, on `main`. Push only at the end (deploys GitHub Pages).

- [x] 1. `test(sim)`: `test/sim.test.js` via `node --test test/` (latLon case red until step 5)
- [x] 2. `refactor(sim)`: pure `*At(t)` helpers; getters + finders delegate; `DEFAULT_SIM_SPEED` in ui.js
- [x] 3. `refactor(state)`: `js/state.js` schema; `test/state.test.js`; main.js lists removed
- [x] 4. `refactor(ui)`: initUI context/handles; single `setEdgeMode`; slider labels; pause text; sky.js needsUpdate lines
- [x] 5. `fix(map)`: 180° onto full disc; Antarctica band 227–256 px; tropic circles; bipolar ring; docs numbers
- [x] 6. `docs(lore)`: doctrine vs flavour (README, About, tooltips)
- [x] 7. `feat(scene)`: `js/rng.js` seeded build RNG
- [x] 8. `feat(ui)`: COPY LINK; one-shot URL params; postcards stop writing address bar
- [x] 9. `feat(ui)`: mobile media queries; panel collapsed on small screens
- [x] 10. `chore`: LICENSE (MIT), `assets/PressStart2P-OFL.txt`, favicon, OG meta
- [x] 11. `ci`: `.github/workflows/test.yml`
- [ ] 12. `docs`: README v1.3 + CLAUDE.md + 7 regenerated screenshots; delete `.superpowers/sdd/progress.md`; push; delete this file

## Decisions made
- URL params are one-shot (stripped after apply); sharing goes through COPY LINK. Keeps localStorage authoritative.
- Map fix moves the map (south pole = disc edge), not the sun constants — constants already match the full-disc scale.
