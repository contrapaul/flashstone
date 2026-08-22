# Art filenames to draw

Generated from the shipped card set on 2026-08-22. **210 cards, 5 card backs,
2 backdrops, 14 UI marks.** Every one is optional — a missing file keeps the
generated gradient, so this list can be worked through in any order and the
game never breaks partway.

Sizes and export settings are in `README.md` next to this file. Filenames must
match **exactly**, lowercase, no spaces — the id *is* the filename.

---

## Dimensions at a glance

| What | Folder | Pixels | Alpha |
|---|---|---|---|
| Card illustration | `art/cards/` | **708 × 300** (2.36:1) | no |
| Card back | `art/backs/` | **536 × 672** (1:1.254) | no |
| Backdrop | `art/scene/` | **2560 × 1440** (16:9) | no |
| Portrait backdrop (optional) | `art/scene/` | **1536 × 2048** (3:4) | no |
| Cost crystal | `art/ui/` | **228 × 252** | **yes** |
| Attack / health gem | `art/ui/` | **138 × 138** | **yes** |
| Rarity gem | `art/ui/` | **66 × 66** | **yes** |
| Mana crystal | `art/ui/` | **132 × 132** | **yes** |
| Keyword marks | `art/ui/` | **144 × 144** | **yes** |
| Taunt / Divine Shield | `art/ui/` | **480 × 480** | **yes** |
| Foil frame | `art/ui/` | **536 × 672** | **yes** |
| Foil sheen | `art/ui/` | **1072 × 672** | **yes** |

---

## Tier 1 — 21 files, and the game looks drawn

Everything here is seen constantly, by everyone, on the first screen.

### Backdrops — `art/scene/` · 2560 × 1440, lossy WebP, under 500 KB each

- [ ] `table.webp` — behind the play field. **Keep the centre dark and quiet**;
      cards and text sit there. Detail in the outer thirds.
- [ ] `menu.webp` — behind every other page. Same rule, less critical.
- [ ] `table-portrait.webp` — *optional*, 1536 × 2048, used below 820px wide.
      Only needed if `table.webp` loses something vital in a 3:4 crop.

### Card backs — `art/backs/` · 536 × 672

- [ ] `default.webp` — Grimoire. The standard back, seen in every match.
- [ ] `astral.webp` — 300 gold in the shop.
- [ ] `verdant.webp` — 300 gold in the shop.
- [ ] `ember.webp` — 300 gold in the shop.
- [ ] `ascendant.webp` — **not for sale.** Unlocked by winning 3 games, so it
      should read as earned rather than bought.

### The four wired UI gems — `art/ui/` · transparent

These are the only UI files a component reads today; the rest are indexed but
not yet drawn on screen. Draw the face, not the frame — the CSS still draws the
border, so leave the outer 8% clear.

- [ ] `cost-crystal.webp` — 228 × 252 · the mana gem, top-left of every card
- [ ] `attack-gem.webp` — 138 × 138 · bottom-left
- [ ] `health-gem.webp` — 138 × 138 · bottom-right
- [ ] `rarity-gem.webp` — 66 × 66 · the lozenge on the nameplate

`.svg` is accepted here and is the better choice for flat marks.

### The starter 15 — `art/cards/` · 708 × 300

Two copies of each are granted to every new account, so these are the first
fifteen cards anyone sees and the deck they play their first match with.

- [ ] `static-data.webp` — Static Data · Common · Minion · A1.1
- [ ] `haptic-technology.webp` — Haptic Technology · Common · Minion · A2.2
- [ ] `user-observation.webp` — User Observation · Uncommon · Minion · A2.1
- [ ] `psychology-factors.webp` — Psychology Factors · Uncommon · Spell · A1.1
- [ ] `population-stereotype.webp` — Population Stereotype · Uncommon · Spell · A2.1
- [ ] `rapid-prototyping.webp` — Rapid Prototyping · Uncommon · Minion · A2.2
- [ ] `circular-economy.webp` — Circular Economy · Uncommon · Minion · A3.1
- [ ] `scenario.webp` — Scenario · Common · Minion · A2.1
- [ ] `user-population.webp` — User Population · Uncommon · Minion · A2.1
- [ ] `augmented-reality-ar.webp` — Augmented Reality (AR) · Uncommon · Minion · A2.2
- [ ] `motion-capture.webp` — Motion Capture · Common · Minion · A2.2
- [ ] `functional-prototype.webp` — Functional Prototype · Uncommon · Minion · A2.2
- [ ] `research-question.webp` — Research Question · Common · Minion · A2.1
- [ ] `task-analysis.webp` — Task Analysis · Uncommon · Minion · A2.1
- [ ] `research-stage.webp` — Research Stage · Common · Minion · A2.1

---

## Tier 2 — the 40 class cards

The rarest thing in a pack and the reason a deck picks a class. Four sets of
ten, each with one Legendary.

### Designer — 10 cards

- [ ] `concept-sketch.webp` — Concept Sketch · Common · Minion
- [ ] `refine.webp` — Refine · Common · Spell
- [ ] `modular-housing.webp` — Modular Housing · Common · Minion
- [ ] `form-follows-function.webp` — Form Follows Function · Uncommon · Minion
- [ ] `rapid-iteration.webp` — Rapid Iteration · Common · Spell
- [ ] `iteration-loop.webp` — Iteration Loop · Common · Minion
- [ ] `storm-of-ideas.webp` — Storm of Ideas · Rare · Spell
- [ ] `design-studio.webp` — Design Studio · Uncommon · Minion
- [ ] `lead-designer.webp` — Lead Designer · Rare · Minion
- [ ] `the-brief.webp` — The Brief · Legendary · Minion

### Engineer — 10 cards

- [ ] `reinforce-structure.webp` — Reinforce Structure · Common · Spell
- [ ] `safety-factor.webp` — Safety Factor · Common · Minion
- [ ] `shear-force.webp` — Shear Force · Common · Spell
- [ ] `stress-test.webp` — Stress Test · Common · Minion
- [ ] `torque-wrench.webp` — Torque Wrench · Common · Weapon
- [ ] `load-bearing-wall.webp` — Load-Bearing Wall · Common · Minion
- [ ] `impact-driver.webp` — Impact Driver · Rare · Weapon
- [ ] `tolerance-check.webp` — Tolerance Check · Uncommon · Minion
- [ ] `site-foreman.webp` — Site Foreman · Rare · Minion
- [ ] `chief-engineer.webp` — Chief Engineer · Legendary · Minion

### Consumer — 10 cards

- [ ] `impulse-buy.webp` — Impulse Buy · Common · Minion
- [ ] `buy-now-pay-later.webp` — Buy Now, Pay Later · Common · Spell
- [ ] `disposable-income.webp` — Disposable Income · Common · Minion
- [ ] `warranty-claim.webp` — Warranty Claim · Common · Spell
- [ ] `brand-loyalty.webp` — Brand Loyalty · Common · Minion
- [ ] `hard-sell.webp` — Hard Sell · Common · Spell
- [ ] `recall-notice.webp` — Recall Notice · Uncommon · Spell
- [ ] `upgrade-cycle.webp` — Upgrade Cycle · Uncommon · Minion
- [ ] `market-research.webp` — Market Research · Rare · Minion
- [ ] `the-early-adopter.webp` — The Early Adopter · Legendary · Minion

### Manufacturer — 10 cards

- [ ] `cnc-burst.webp` — CNC Burst · Common · Spell
- [ ] `cooling-cycle.webp` — Cooling Cycle · Common · Spell
- [ ] `quality-control.webp` — Quality Control · Common · Minion
- [ ] `production-line.webp` — Production Line · Common · Minion
- [ ] `injection-mould.webp` — Injection Mould · Common · Spell
- [ ] `tooling-up.webp` — Tooling Up · Common · Minion
- [ ] `automation-cell.webp` — Automation Cell · Uncommon · Minion
- [ ] `overrun.webp` — Overrun · Uncommon · Spell
- [ ] `batch-run.webp` — Batch Run · Rare · Minion
- [ ] `the-factory.webp` — The Factory · Legendary · Minion

---

## Tier 3 — the five Neutral Legendaries

One-of-a-kind cards, drawn at 2.5× in the inspector. Worth the most care per
file of anything in the set.

- [ ] `designing-a-solution-stage.webp` — Designing a Solution Stage · Legendary · Minion · B1.1
- [ ] `focus-group.webp` — Focus Group · Legendary · Spell · B2.1
- [ ] `functional-obsolescence.webp` — Functional Obsolescence · Legendary · Minion · C1.1
- [ ] `problem-statement.webp` — Problem Statement · Legendary · Minion · B2.1
- [ ] `the-jig.webp` — The Jig · Legendary · Weapon

---

## Tier 4 — the remaining Neutral cards, by syllabus section

150 files. Grouped so a section can be drawn as one visual run.

### (no section) — 14 cards

- [ ] `craft-knife.webp` — Craft Knife · Common · Weapon
- [ ] `drafting-blade.webp` — Drafting Blade · Common · Weapon
- [ ] `frostbolt.webp` — Frostbolt · Common · Spell
- [ ] `inversion.webp` — Inversion · Epic · Spell
- [ ] `quiet-the-room.webp` — Quiet the Room · Uncommon · Spell
- [ ] `reinforce.webp` — Reinforce · Common · Spell
- [ ] `arcane-blast.webp` — Arcane Blast · Common · Spell
- [ ] `bench-hammer.webp` — Bench Hammer · Uncommon · Weapon
- [ ] `healing-touch.webp` — Healing Touch · Common · Spell
- [ ] `second-draft.webp` — Second Draft · Common · Spell
- [ ] `fireball.webp` — Fireball · Common · Spell
- [ ] `rally.webp` — Rally · Uncommon · Spell
- [ ] `dismantle.webp` — Dismantle · Rare · Spell
- [ ] `press-brake.webp` — Press Brake · Rare · Weapon

### A1.1 — 12 cards

- [ ] `percentile-range-upper-and-lower-limits.webp` — Percentile Range (Upper and Lower Limits) · Common · Minion · A1.1
- [ ] `anthropometrics.webp` — Anthropometrics · Rare · Spell · A1.1
- [ ] `adjustability.webp` — Adjustability · Rare · Minion · A1.1
- [ ] `physiology-factors.webp` — Physiology Factors · Uncommon · Minion · A1.1
- [ ] `reach.webp` — Reach · Rare · Minion · A1.1
- [ ] `percentile.webp` — Percentile · Common · Minion · A1.1
- [ ] `ergonomics.webp` — Ergonomics · Common · Minion · A1.1
- [ ] `clearance.webp` — Clearance · Common · Minion · A1.1
- [ ] `dynamic-data.webp` — Dynamic Data · Uncommon · Minion · A1.1
- [ ] `biomechanics.webp` — Biomechanics · Uncommon · Minion · A1.1
- [ ] `range-of-sizes.webp` — Range of Sizes · Uncommon · Spell · A1.1
- [ ] `workspace-envelope.webp` — Workspace Envelope · Common · Minion · A1.1

### A2.1 — 11 cards

- [ ] `disadvantages-of-user-centred-design-ucd.webp` — Disadvantages of User-Centred Design (UCD) · Common · Minion · A2.1
- [ ] `advantage-of-user-centred-design-ucd.webp` — Advantage of User-Centred Design (UCD) · Common · Minion · A2.1
- [ ] `user-requirements.webp` — User Requirements · Rare · Minion · A2.1
- [ ] `five-stages-of-user-centred-design-ucd.webp` — Five Stages of User-Centred Design (UCD) · Common · Minion · A2.1
- [ ] `target-user.webp` — Target User · Rare · Minion · A2.1
- [ ] `task.webp` — Task · Uncommon · Minion · A2.1
- [ ] `primary-persona.webp` — Primary Persona · Uncommon · Minion · A2.1
- [ ] `user-centred-design-ucd.webp` — User-Centred Design (UCD) · Rare · Minion · A2.1
- [ ] `field-research.webp` — Field Research · Rare · Spell · A2.1
- [ ] `secondary-research.webp` — Secondary Research · Common · Minion · A2.1
- [ ] `user-centred-research-methods.webp` — User-Centred Research Methods · Common · Minion · A2.1

### A2.2 — 23 cards

- [ ] `scale-prototype.webp` — Scale Prototype · Uncommon · Minion · A2.2
- [ ] `generative-design.webp` — Generative Design · Rare · Minion · A2.2
- [ ] `computer-aided-design-cad.webp` — Computer-Aided Design (CAD) · Common · Minion · A2.2
- [ ] `fused-deposition-modelling-fdm.webp` — Fused Deposition Modelling (FDM) · Common · Minion · A2.2
- [ ] `assembled-drawings.webp` — Assembled Drawings · Common · Minion · A2.2
- [ ] `finite-element-analysis-fea.webp` — Finite element analysis (FEA) · Uncommon · Minion · A2.2
- [ ] `high-fidelity-prototype.webp` — High-Fidelity Prototype · Rare · Minion · A2.2
- [ ] `orthographic-projection.webp` — Orthographic Projection · Uncommon · Minion · A2.2
- [ ] `digital-human.webp` — Digital Human · Uncommon · Minion · A2.2
- [ ] `exploded-drawing.webp` — Exploded Drawing · Common · Minion · A2.2
- [ ] `physical-prototype.webp` — Physical Prototype · Common · Minion · A2.2
- [ ] `prototype.webp` — Prototype · Common · Minion · A2.2
- [ ] `surface-model.webp` — Surface Model · Uncommon · Minion · A2.2
- [ ] `virtual-prototype.webp` — Virtual Prototype · Common · Minion · A2.2
- [ ] `prototyping-techniques.webp` — Prototyping Techniques · Uncommon · Minion · A2.2
- [ ] `stereolithography-sla.webp` — Stereolithography (SLA) · Common · Minion · A2.2
- [ ] `aesthetic-prototype.webp` — Aesthetic Prototype · Common · Minion · A2.2
- [ ] `free-hand-sketching.webp` — Free-Hand Sketching · Common · Minion · A2.2
- [ ] `selective-laser-sintering-sls.webp` — Selective Laser Sintering (SLS) · Common · Minion · A2.2
- [ ] `isometric-drawing.webp` — Isometric Drawing · Common · Spell · A2.2
- [ ] `low-fidelity-prototype.webp` — Low-Fidelity Prototype · Common · Minion · A2.2
- [ ] `solid-model.webp` — Solid Model · Common · Minion · A2.2
- [ ] `virtual-reality.webp` — Virtual Reality · Common · Spell · A2.2

### A3.1 — 36 cards

- [ ] `elasticity.webp` — Elasticity · Rare · Minion · A3.1
- [ ] `photochromicity.webp` — Photochromicity · Common · Minion · A3.1
- [ ] `toughness.webp` — Toughness · Rare · Minion · A3.1
- [ ] `hardness.webp` — Hardness · Rare · Minion · A3.1
- [ ] `magneto-rheostatic.webp` — Magneto-Rheostatic · Common · Minion · A3.1
- [ ] `malleability.webp` — Malleability · Uncommon · Minion · A3.1
- [ ] `reactivity-food-safe.webp` — Reactivity (Food Safe) · Uncommon · Minion · A3.1
- [ ] `shape-memory-material.webp` — Shape Memory Material · Common · Minion · A3.1
- [ ] `stiffness.webp` — Stiffness · Rare · Minion · A3.1
- [ ] `tensile-strength.webp` — Tensile Strength · Uncommon · Minion · A3.1
- [ ] `chemical-properties.webp` — Chemical Properties · Common · Minion · A3.1
- [ ] `ductility.webp` — Ductility · Rare · Minion · A3.1
- [ ] `melting-point.webp` — Melting Point · Common · Minion · A3.1
- [ ] `compressive-strength.webp` — Compressive Strength · Rare · Minion · A3.1
- [ ] `hygroscopy.webp` — Hygroscopy · Common · Minion · A3.1
- [ ] `bio-materials.webp` — Bio-Materials · Common · Spell · A3.1
- [ ] `corrosion-resistance.webp` — Corrosion Resistance · Rare · Minion · A3.1
- [ ] `piezoelectricity.webp` — Piezoelectricity · Uncommon · Spell · A3.1
- [ ] `thermal-conductivity.webp` — Thermal Conductivity · Common · Minion · A3.1
- [ ] `composite-material.webp` — Composite Material · Common · Spell · A3.1
- [ ] `density.webp` — Density · Uncommon · Minion · A3.1
- [ ] `flammability.webp` — Flammability · Common · Minion · A3.1
- [ ] `glass.webp` — Glass · Common · Spell · A3.1
- [ ] `natural-materials.webp` — Natural Materials · Rare · Minion · A3.1
- [ ] `plasticity.webp` — Plasticity · Common · Minion · A3.1
- [ ] `polymer.webp` — Polymer · Uncommon · Minion · A3.1
- [ ] `timber-lumber.webp` — Timber (Lumber) · Common · Minion · A3.1
- [ ] `electrical-resistivity-electical-conductivity.webp` — Electrical Resistivity (Electical Conductivity) · Epic · Minion · A3.1
- [ ] `mechanical-properties.webp` — Mechanical Properties · Rare · Minion · A3.1
- [ ] `smart-materials.webp` — Smart Materials · Epic · Minion · A3.1
- [ ] `textiles.webp` — Textiles · Common · Minion · A3.1
- [ ] `thermal-expansion.webp` — Thermal Expansion · Common · Minion · A3.1
- [ ] `thermoelectricity.webp` — Thermoelectricity · Uncommon · Minion · A3.1
- [ ] `electro-rheostatic.webp` — Electro-Rheostatic · Uncommon · Minion · A3.1
- [ ] `manufactured-material.webp` — Manufactured Material · Common · Minion · A3.1
- [ ] `physical-properties.webp` — Physical Properties · Uncommon · Minion · A3.1

### B1.1 — 9 cards

- [ ] `errors-usability.webp` — Errors (Usability) · Uncommon · Minion · B1.1
- [ ] `satisfaction-usability.webp` — Satisfaction (Usability) · Common · Minion · B1.1
- [ ] `learnability-usability.webp` — Learnability (Usability) · Common · Minion · B1.1
- [ ] `memorability-usability.webp` — Memorability (Usability) · Uncommon · Minion · B1.1
- [ ] `user.webp` — User · Uncommon · Minion · B1.1
- [ ] `efficiency-usability.webp` — Efficiency (Usability) · Common · Minion · B1.1
- [ ] `environment.webp` — Environment · Common · Spell · B1.1
- [ ] `usability-objectives.webp` — Usability Objectives · Rare · Spell · B1.1
- [ ] `usability.webp` — Usability · Rare · Minion · B1.1

### B2.1 — 16 cards

- [ ] `aesthetic-characteristics.webp` — Aesthetic Characteristics · Common · Spell · B2.1
- [ ] `product-analysis.webp` — Product Analysis · Common · Spell · B2.1
- [ ] `model-test-refine-cycle.webp` — Model, Test, Refine Cycle · Common · Minion · B2.1
- [ ] `ideation-techniques.webp` — Ideation Techniques · Uncommon · Minion · B2.1
- [ ] `mock-up.webp` — Mock-up · Common · Minion · B2.1
- [ ] `product-requirements.webp` — Product Requirements · Rare · Minion · B2.1
- [ ] `qualitative-data.webp` — Qualitative Data · Uncommon · Minion · B2.1
- [ ] `drawings-2d-3d-assembled-isometric-orthographic-projection.webp` — Drawings (2D, 3D, Assembled, Isometric, Orthographic Projection) · Uncommon · Minion · B2.1
- [ ] `literature-search.webp` — Literature Search · Uncommon · Minion · B2.1
- [ ] `quantitative-data.webp` — Quantitative Data · Uncommon · Minion · B2.1
- [ ] `user-journey.webp` — User Journey · Uncommon · Minion · B2.1
- [ ] `design-thinking.webp` — Design Thinking · Common · Spell · B2.1
- [ ] `empathize-stage.webp` — Empathize Stage · Common · Minion · B2.1
- [ ] `storyboard.webp` — Storyboard · Common · Spell · B2.1
- [ ] `design-specification.webp` — Design Specification · Common · Minion · B2.1
- [ ] `interview.webp` — Interview · Common · Minion · B2.1

### B2.2 — 2 cards

- [ ] `texture.webp` — Texture · Uncommon · Minion · B2.2
- [ ] `iterative-design.webp` — Iterative Design · Common · Minion · B2.2

### C1.1 — 5 cards

- [ ] `planned-obsolescence.webp` — Planned Obsolescence · Uncommon · Minion · C1.1
- [ ] `social-obsolescence.webp` — Social Obsolescence · Common · Minion · C1.1
- [ ] `triple-bottom-line-tbl.webp` — Triple Bottom Line (TBL) · Common · Minion · C1.1
- [ ] `style-obsolescence.webp` — Style Obsolescence · Common · Minion · C1.1
- [ ] `technological-obsolescence.webp` — Technological Obsolescence · Common · Minion · C1.1

### C1.2 — 2 cards

- [ ] `design-for-extremes.webp` — Design for Extremes · Common · Minion · C1.2
- [ ] `inclusive-design-universal-design.webp` — Inclusive Design (Universal Design) · Common · Minion · C1.2

### C1.3 — 6 cards

- [ ] `physio-pleasure.webp` — Physio-Pleasure · Common · Minion · C1.3
- [ ] `psycho-pleasure.webp` — Psycho-Pleasure · Common · Minion · C1.3
- [ ] `socio-pleasure.webp` — Socio-Pleasure · Common · Minion · C1.3
- [ ] `attract-converse-transact-model-act.webp` — Attract/Converse/Transact Model (ACT) · Common · Minion · C1.3
- [ ] `four-pleasure-framework.webp` — Four-Pleasure Framework · Rare · Spell · C1.3
- [ ] `ideo-pleasure.webp` — Ideo-Pleasure · Uncommon · Spell · C1.3

### C2.1 — 2 cards

- [ ] `datschefski-s-five-principles-of-sustainable-design.webp` — Datschefski’s Five Principles of Sustainable Design · Common · Minion · C2.1
- [ ] `sustainability.webp` — Sustainability · Common · Minion · C2.1

### C2.2 — 5 cards

- [ ] `biodegradable-material.webp` — Biodegradable Material · Common · Minion · C2.2
- [ ] `take-back-legislation.webp` — Take-Back Legislation · Uncommon · Minion · C2.2
- [ ] `renewable-energy-sources.webp` — Renewable Energy Sources · Rare · Minion · C2.2
- [ ] `linear-approach-economy.webp` — Linear Approach/Economy · Rare · Spell · C2.2
- [ ] `dematerialization.webp` — Dematerialization · Common · Minion · C2.2

### C3.1 — 3 cards

- [ ] `reverse-engineering.webp` — Reverse Engineering · Common · Minion · C3.1
- [ ] `swot-analysis.webp` — SWOT Analysis · Common · Minion · C3.1
- [ ] `constructive-discontent.webp` — Constructive Discontent · Common · Minion · C3.1

### C4.1 — 4 cards

- [ ] `design-for-disassembly.webp` — Design for Disassembly · Uncommon · Minion · C4.1
- [ ] `design-for-process.webp` — Design for Process · Uncommon · Spell · C4.1
- [ ] `design-for-assembly.webp` — Design for Assembly · Rare · Minion · C4.1
- [ ] `design-for-manufacture-dfm.webp` — Design for Manufacture (DfM) · Uncommon · Minion · C4.1

---

## Totals

| Tier | Files |
|---|---|
| 1 — backdrops, backs, gems, starter 15 | 26 |
| 2 — class cards | 40 |
| 3 — Neutral Legendaries | 5 |
| 4 — remaining Neutral cards | 150 |
| **Card illustrations total** | **210** |
| **Everything** | **221** |

Plus ten further `art/ui/` marks that are specified and indexed but not yet
read by any component — `mana-crystal`, `mana-crystal-spent`, `taunt`,
`divine-shield`, `charge`, `windfury`, `stealth`, `deathrattle`, `spell-mark`,
`weapon-mark` — and the two foil files. Sizes are in `README.md` §3 and §5.
Drawing them now is safe; they light up when the table work wires them.
