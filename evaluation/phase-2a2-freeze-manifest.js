export const phase2a2ProductionFreeze = Object.freeze({
  commit: "b25c8b1f1214b23e49fd0f64343ce950963a7b78",
  policy: "Phase 2A.1 production semantic layer frozen before Blind Holdout authoring and execution.",
  files: Object.freeze({
    "src/semantic/safety-signal-detector.js": "ef482c6bdc4707cafe419c0a5189ab27529d66291a95e3e804cf8c4f141744d1",
    "src/semantic/semantic-gate.js": "fe9eda7c746a922556efb1395676c6e7322ff8cc1fa5d1a29c9ff324820f3f25",
    "src/semantic/targeted-verifier.js": "fa2ddf9ba87df2fe93429da09f64a3c2934f13c90473ff9e5cf5127bc70bdbf8",
    "src/semantic/hybrid-semantic-validator.js": "716ad3454a73348144103c30c0738a5c02cbfb97d6dd0146e362bf2f5fea6a3a",
    "src/semantic/fact-evidence.js": "16dbbbcc16e5a9fc64adc2568eb77725e3754878d5a84e4aa87144b18f2187c9",
  }),
});

export const phase2a2HoldoutSeal = Object.freeze({
  dataset: "evaluation/phase-2a2-blind-holdout.js",
  datasetSha256: "772db62c990eb78784dcf6b4498167c46167c6194d085d9ab91c0dbee769ae6f",
  cases: 40,
  firstRealRun: true,
  policy: "No production semantic rule may change after this seal and before first real-model execution.",
});
