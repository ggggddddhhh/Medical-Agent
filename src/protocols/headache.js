export const headacheProtocol = Object.freeze({
  code: "HEADACHE_V1",
  chiefComplaint: "headache",
  version: "1.0.0",
  displayName: "头痛",
  aliases: ["头痛", "头疼", "脑袋疼", "headache"],
  questions: [
    {
      id: "HEADACHE_ONSET",
      factPath: "symptoms.onsetPattern",
      parser: "onset_pattern",
      text: "这个头痛是突然在几秒到几分钟内达到最严重程度，还是逐渐出现的？",
    },
    {
      id: "HEADACHE_NEURO",
      factPath: "redFlags.neurologicalDeficit",
      parser: "boolean",
      text: "有没有同时出现一侧肢体无力或麻木、嘴歪、说话不清、视物异常？",
    },
    {
      id: "HEADACHE_FEVER_NECK",
      factPath: "redFlags.feverNeckStiffness",
      parser: "boolean",
      text: "有没有发热并伴随脖子僵硬、难以低头？",
    },
    {
      id: "HEADACHE_TRAUMA",
      factPath: "redFlags.recentHeadTrauma",
      parser: "boolean",
      text: "近期是否撞到头部，或头痛是在头部受伤后出现的？",
    },
    {
      id: "HEADACHE_SEVERITY",
      factPath: "symptoms.severity",
      parser: "severity",
      text: "如果 0 分是不痛、10 分是难以忍受，现在大约是几分？",
    },
  ],
  emergencyRules: [
    {
      id: "HEADACHE_THUNDERCLAP",
      when: (state) => state.symptoms.onsetPattern === "sudden_severe",
    },
    {
      id: "HEADACHE_FOCAL_NEUROLOGICAL_DEFICIT",
      when: (state) => state.redFlags.neurologicalDeficit === true,
    },
    {
      id: "HEADACHE_FEVER_NECK_STIFFNESS",
      when: (state) => state.redFlags.feverNeckStiffness === true,
    },
    {
      id: "HEADACHE_AFTER_HEAD_TRAUMA",
      when: (state) => state.redFlags.recentHeadTrauma === true,
    },
  ],
});
