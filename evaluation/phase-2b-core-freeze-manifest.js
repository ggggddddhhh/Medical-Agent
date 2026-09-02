export const phase2bProtectedCoreFreeze = Object.freeze({
  baselineCommit: "3d577a6ebe2eb1a141f67e5930ba601f80a7fe6d",
  policy: "Phase 2B extends the system outside the validated Node.js core; protected core files remain byte-for-byte unchanged.",
  files: Object.freeze({
    "src/engine/medical-agent.js": "4f2d122a71b3edb1481509dce01c16783df226ece6dc8c61831e2e74ef43d624",
    "src/engine/policy-engine.js": "57ced8ab4ab9c9611cf7a5885c6d87c6b02a4704e6008bbbff20661e12109677",
    "src/engine/state-machine.js": "aa5c629bfdc882a0f33260151481694e01b76069b477d59afbff4aba9be9ebce",
    "src/domain/case-state.js": "60961eb3902d3d7e36b28da71a6627ae498b1debbd61c1125d2e55e18f1b87ff",
    "src/domain/constants.js": "dda6a5133ad26cd6727bfcd9e679717f2fb3b0ba2168f0892bf2ac8d6bbfc208",
    "src/semantic/semantic-gate.js": "9de1d7e23687d4cec93c9225907ffc772dc0c30bc140234660a1df6dcdcc0eb7",
    "src/semantic/safety-signal-detector.js": "2f820da94ccbfc8eee876f5fe26a56dcf6d691736fa977f967bc5a780c0eac32",
    "src/protocols/headache.js": "a11d41b24797ebcd289e9ca47c62e3d814bfd4dad3c7cd237defb3749701bf1e",
    "src/protocols/chest-pain.js": "2de72de83f04db9f481231b43847298cac8412918b31d251b9f72d0ae0f32938",
    "src/audit/audit-log.js": "b4708b679dd8a8ad8f0ad23d4a66af87f5d9eca4cddd31d62db3929349444387",
    "src/safety/input-safety.js": "4515555fa2b3cf956d1ca5f3330ab3d724e5443c9b09b47fe4353b99b2e00521",
    "src/safety/output-safety.js": "badf967eeefd57293fc736e4d4a018cfe06eb313b68c1a4b84f9c6665e2e9d65",
  }),
});
