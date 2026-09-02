export const phase2aPromotionProductionFreeze = Object.freeze({
  commit: "cb078fb71a3f675856e2a143180bb8c4ed3773e3",
  policy: "Subject ambiguity repair frozen before the promotion Blind Holdout first real-model run.",
  files: Object.freeze({
    "src/semantic/clinical-evidence-lexicon.js": "6a1b77cc73d820c44df49207cb576507a127a5fcc8c41652a2273a1b9a6bdd65",
    "src/semantic/evidence-span-finder.js": "6cba6c12f8534f1d5a706b1879838b6fa670b54068d6b15c28f0baab06b91f58",
    "src/semantic/linguistic-assertion-layer.js": "88030fc1f525840ea832018ab5053dcdff932b7d62ec60fed868cb5630ca93b6",
    "src/semantic/safety-signal-detector.js": "2f820da94ccbfc8eee876f5fe26a56dcf6d691736fa977f967bc5a780c0eac32",
    "src/semantic/concept-mapper.js": "7a17c5701392796e68d0bc3ed0019299052d40f131e3abdc651c8b90706918fc",
    "src/semantic/semantic-gate.js": "9de1d7e23687d4cec93c9225907ffc772dc0c30bc140234660a1df6dcdcc0eb7",
    "src/semantic/clarification-manager.js": "08f6153f1a91f52a1a08a5fec0e23a1abf16105368a2059ffb6a5900e490e1ed",
    "src/semantic/conversation-reconciler.js": "4b6899a1d99e6b8c3c4334dc652e7f35a28634c3cb4f58f7400dbd4c2131d7c1",
    "src/semantic/hybrid-semantic-validator.js": "43b4e15814b1297d0c4496199c222fb7b314561317162c8ea9cc39ff5725047c",
    "src/semantic/targeted-verifier.js": "fa2ddf9ba87df2fe93429da09f64a3c2934f13c90473ff9e5cf5127bc70bdbf8",
  }),
});

export const phase2aPromotionHoldoutSeal = Object.freeze({
  dataset: "evaluation/phase-2a-promotion-subject-holdout.js",
  datasetSha256: "d6ffafce96f17d213cc760bfa883688f5cde3a8ff96ba54619a4d4d287b3b146",
  cases: 12,
  firstRealRun: true,
  policy: "No production semantic changes after cb078fb; record failures without tuning or rerunning this Holdout.",
});

export const phase2aPromotionRepeatedCaseIds = Object.freeze([
  "P2A-PROMO-SUB-03",
  "P2A-PROMO-SUB-05",
  "P2A-PROMO-SUB-09",
  "P2A-PROMO-SUB-12",
]);
