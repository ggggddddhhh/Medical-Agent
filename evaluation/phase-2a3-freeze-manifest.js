export const phase2a3ProductionFreeze = Object.freeze({
  commit: "768073578cc999dd61449c864444121831d58049",
  policy: "Evidence-grounded production semantic pipeline frozen before Phase 2A.3 Blind Holdout authoring and execution.",
  files: Object.freeze({
    "src/semantic/clinical-evidence-lexicon.js": "64a007b19d47e4b7251085dd78eea52b22d0de936aebec942b8b2d469cc0b9a7",
    "src/semantic/evidence-span-finder.js": "82c0be19530eb628f9e8ec7f8323b37a18e237847ae138b98bc137fb17dc2139",
    "src/semantic/linguistic-assertion-layer.js": "9cc0ffdd69c2c3e22d1571cd283dc103942e92fb31c6f7d779c31d89e25e38f7",
    "src/semantic/safety-signal-detector.js": "2f820da94ccbfc8eee876f5fe26a56dcf6d691736fa977f967bc5a780c0eac32",
    "src/semantic/concept-mapper.js": "6883bf313ff77a304837ccfc61caf64a37aa8d6cd9d66ef4a9959152d9486764",
    "src/semantic/semantic-gate.js": "9de1d7e23687d4cec93c9225907ffc772dc0c30bc140234660a1df6dcdcc0eb7",
    "src/semantic/clarification-manager.js": "fa3a6d285ad2c203aa0de109b1a5b16812c731bc952aca7b673340ef2ea6ff71",
    "src/semantic/conversation-reconciler.js": "4b6899a1d99e6b8c3c4334dc652e7f35a28634c3cb4f58f7400dbd4c2131d7c1",
    "src/semantic/hybrid-semantic-validator.js": "43b4e15814b1297d0c4496199c222fb7b314561317162c8ea9cc39ff5725047c",
    "src/semantic/targeted-verifier.js": "fa2ddf9ba87df2fe93429da09f64a3c2934f13c90473ff9e5cf5127bc70bdbf8",
  }),
});

export const phase2a3HoldoutSeal = Object.freeze({
  dataset: "evaluation/phase-2a3-blind-holdout.js",
  datasetSha256: "a65552cfc79c817ca8a6005cbbed3e7dba927f89be0d502ab2c627b75c74b4dd",
  cases: 40,
  firstRealRun: true,
  policy: "No production semantic file may change after commit 7680735 and no Holdout result may be used to tune this sealed dataset.",
});
