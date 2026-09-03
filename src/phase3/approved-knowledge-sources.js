export const KNOWLEDGE_CORPUS_VERSION = "medical-education-mini-corpus-0.2.0";

export const APPROVED_KNOWLEDGE_SOURCES = Object.freeze({
  NHS_HEADACHE_2024: Object.freeze({
    topic: "headache",
    title: "NHS — Headaches",
    url: "https://www.nhs.uk/symptoms/headaches/",
    reviewedAt: "2024-04-17",
    snippet:
      "头痛如果突然发生且极其剧烈，或伴有身体或面部麻木无力、说话困难、意识模糊、视力丧失、高热与颈部僵硬等情况，需要立即寻求急救帮助。",
  }),
  CDC_STROKE_SIGNS_2026: Object.freeze({
    topic: "headache",
    title: "CDC — Signs and Symptoms of Stroke",
    url: "https://www.cdc.gov/stroke/signs-symptoms/index.html",
    reviewedAt: "2026-05-19",
    snippet:
      "卒中警示可能突然出现，包括单侧面部、手臂或腿部麻木无力，言语或理解困难，视力或平衡异常，以及原因不明的突发剧烈头痛；出现这些警示应立即联系当地急救服务。",
  }),
  CDC_HEART_ATTACK_2024: Object.freeze({
    topic: "chest_pain",
    title: "CDC — About Heart Attack Symptoms, Risk, and Recovery",
    url: "https://www.cdc.gov/heart-disease/about/heart-attack.html",
    reviewedAt: "2024-10-24",
    snippet:
      "需要关注的心脏事件警示包括胸部疼痛或不适、气短、下颌或颈背及手臂肩部不适、头晕或冷汗；出现相关警示时应立即联系当地急救服务。",
  }),
  MEDLINEPLUS_CHEST_PAIN_2025: Object.freeze({
    topic: "chest_pain",
    title: "MedlinePlus — Chest Pain",
    url: "https://medlineplus.gov/chestpain.html",
    reviewedAt: "2025-08-24",
    snippet:
      "胸痛原因很多，不能仅凭症状自行判断。胸痛持续不缓解、呈挤压或压迫感，或伴恶心、出汗、头晕、气短时，应立即寻求医疗救助。",
  }),
  NHS_EMERGENCY_HELP_2023: Object.freeze({
    topic: "all",
    title: "NHS — When to call emergency services",
    url: "https://www.nhs.uk/nhs-services/urgent-and-emergency-care-services/when-to-call-999/",
    reviewedAt: "2023-02-03",
    snippet:
      "遇到危及生命的紧急情况，应立即联系当地急救服务，准确说明位置、发生情况和联系方式；等待期间应陪伴患者、按调度人员指导提供力所能及的基本急救，并在病情变化时再次告知急救服务。",
  }),
});
