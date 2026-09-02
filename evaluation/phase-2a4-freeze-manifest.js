export const phase2a4ProductionFreeze = Object.freeze({
  commit: "2f5aeb3fefb4a49e729a15a6099ff78ac3790e08",
  policy: "Competition semantic repair frozen before Phase 2A.4 Blind Holdout execution.",
  files: Object.freeze({
    "src/semantic/clinical-evidence-lexicon.js": "6a1b77cc73d820c44df49207cb576507a127a5fcc8c41652a2273a1b9a6bdd65",
    "src/semantic/evidence-span-finder.js": "6cba6c12f8534f1d5a706b1879838b6fa670b54068d6b15c28f0baab06b91f58",
    "src/semantic/linguistic-assertion-layer.js": "9faf4f7d6673908ed6928babe2d4e11feb1525a0cbba90d79e4fe3dad9125586",
    "src/semantic/safety-signal-detector.js": "2f820da94ccbfc8eee876f5fe26a56dcf6d691736fa977f967bc5a780c0eac32",
    "src/semantic/concept-mapper.js": "7a17c5701392796e68d0bc3ed0019299052d40f131e3abdc651c8b90706918fc",
    "src/semantic/semantic-gate.js": "9de1d7e23687d4cec93c9225907ffc772dc0c30bc140234660a1df6dcdcc0eb7",
    "src/semantic/clarification-manager.js": "fa3a6d285ad2c203aa0de109b1a5b16812c731bc952aca7b673340ef2ea6ff71",
    "src/semantic/conversation-reconciler.js": "4b6899a1d99e6b8c3c4334dc652e7f35a28634c3cb4f58f7400dbd4c2131d7c1",
    "src/semantic/hybrid-semantic-validator.js": "43b4e15814b1297d0c4496199c222fb7b314561317162c8ea9cc39ff5725047c",
    "src/semantic/targeted-verifier.js": "fa2ddf9ba87df2fe93429da09f64a3c2934f13c90473ff9e5cf5127bc70bdbf8",
  }),
});

export const phase2a4HoldoutSeal = Object.freeze({
  dataset: "evaluation/phase-2a4-blind-holdout.js",
  datasetSha256: "0ae26aa5bf551384a54542b0b5ed9c2ef2f31d6966bbaed1c84a6d1bdc9a3f87",
  cases: 24,
  firstRealRun: true,
  policy: "No production semantic file changes after 2f5aeb3; do not tune or rerun this Blind Holdout.",
});

export const phase2a4RepeatedHighRiskCaseIds = Object.freeze([
  "P2A4-BLIND-EV-01",
  "P2A4-BLIND-EV-03",
  "P2A4-BLIND-SUB-04",
  "P2A4-BLIND-TIM-04",
  "P2A4-BLIND-CER-03",
  "P2A4-BLIND-MIX-02",
]);
