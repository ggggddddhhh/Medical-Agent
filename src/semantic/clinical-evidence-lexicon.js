export const CLINICAL_EVIDENCE_LEXICON_VERSION = "clinical-evidence-lexicon-0.2.0";

const ENTRY = (conceptId, factPath, proposedValue, pattern, options = {}) => Object.freeze({
  conceptId,
  factPath,
  proposedValue,
  pattern,
  ...options,
});

const SHARED = Object.freeze([
  ENTRY("duration", "symptoms.durationMinutes", "parse_duration", String.raw`(?:持续|已经|有|疼了|痛了)?\s*(?:\d+(?:\.\d+)?|一|两|三|四|五|六|七|八|九|十|半)\s*(?:分钟|小时|天|个月)(?!前)`),
  ENTRY("severity", "symptoms.severity", "parse_severity", String.raw`(?:大约|大概|差不多|是)?\s*(?:10|[0-9])\s*分`),
  ENTRY("active_resolved", "symptoms.activeNow", false, String.raw`(?:现在|目前)?\s*(?:已经)?\s*(?:不疼|不痛|没有了|好了|缓解|消失)`),
  ENTRY("active_current", "symptoms.activeNow", true, String.raw`(?:现在|目前|今天)\s*(?:还在|仍然|也有|持续|反复)`),
  ENTRY("prior_similar", "relevantHistory.priorSimilarEpisode", true, String.raw`(?:以前|之前|曾经)也`),
]);

const HEADACHE = Object.freeze([
  ENTRY("headache_complaint", "chiefComplaint.code", "headache", String.raw`(?:头[痛疼]|脑袋(?:疼|痛)|脑壳.{0,8}(?:疼|痛|炸开))`),
  ENTRY("sudden_onset", "symptoms.suddenOnset", true, String.raw`(?:突然|一下子|一下(?=像|就|疼|痛)|瞬间|猛地|骤然|雷击样|霹雳样|(?:像|如同)?炸开|爆炸(?:一样|样)?|像开关被打开一样)`),
  ENTRY("sudden_severe_onset", "symptoms.onsetPattern", "sudden_severe", String.raw`(?:突然|一下子|一下(?=像|就|疼|痛)|瞬间|猛地|骤然|雷击样|霹雳样|(?:像|如同)?炸开|爆炸(?:一样|样)?|像开关被打开一样)`),
  ENTRY("gradual_onset", "symptoms.onsetPattern", "gradual", String.raw`(?:逐渐|慢慢|一点点|越来越|慢慢加上来)`),
  ENTRY("rapid_peak", "symptoms.rapidPeak", true, String.raw`(?:几秒(?:钟)?|十来秒|十几[秒妙]|数秒|半分钟|一分(?:钟)?内|一两分钟内|很快.{0,8}(?:最厉害|最严重|最痛|最疼|痛到顶|疼到顶)|立刻.{0,8}(?:最厉害|最严重|最痛|最疼|痛到顶|疼到顶)|(?:十来秒|十几[秒妙]).{0,8}(?:到顶|最历害|最厉害|最重)|(?:一?眨眼|转眼|顷刻|片刻|立马|马上).{0,8}(?:(?:疼|痛).{0,3})?(?:到)?(?:极点|最狠|最痛|最疼|最重|顶峰|到顶))`),
  ENTRY("worst_ever_headache", "redFlags.worstEverHeadache", true, String.raw`(?:(?:有生以来|这辈子).{0,10}(?:最严重|最痛|最疼)|最严重的一次)`),
  ENTRY("neurological_deficit", "redFlags.neurologicalDeficit", true, String.raw`(?:(?:一侧|半边|左边|右边).{0,12}(?:无力|没劲|麻木|发[麻嘛]|使不上劲)|(?:左|右)?(?:手|脚|手脚|胳[膊博]|手臂|腿|肢体).{0,10}(?:无力|没劲|使不上劲|发[麻嘛]|像被抽走了力气|像?断了?电|不听使唤|拖不动|抬不起来|拿不稳|端不住)|嘴.{0,5}歪|口角.{0,5}歪|说[话化花].{0,6}(?:不清|不利索|含[糊胡])|言语不清|视物异常|看不清|复视)`),
  ENTRY("altered_consciousness", "redFlags.alteredConsciousness", true, String.raw`(?:意识不清|神志不清|意识模糊|昏迷|昏过去|昏倒|叫不醒|失去意识|难以叫醒)`),
  ENTRY("recent_head_trauma", "redFlags.recentHeadTrauma", true, String.raw`(?:撞到头|撞了头|摔到头|磕到头|头部受伤|头部外伤|外伤后.{0,8}头[痛疼])`),
  ENTRY("fever", "redFlags.feverNeckStiffness", true, String.raw`(?:发热|发[烧稍]|高[烧稍]|烧得厉害|(?:浑身|全身|身体).{0,5}(?:发烫|滚烫|烫得像火炉))`, { group: "fever_neck", component: "fever" }),
  ENTRY("neck_stiffness", "redFlags.feverNeckStiffness", true, String.raw`(?:(?:脖子|勃子|脖颈|颈部|脖梗子).{0,14}(?:僵|硬|不能低头|难以低头|低不下去|弯不下去|动不了|转不动|像焊住|跟生锈)|脖子像木板一样)`, { group: "fever_neck", component: "neck" }),
]);

const CHEST_PAIN = Object.freeze([
  ENTRY("chest_pain_complaint", "chiefComplaint.code", "chest_pain", String.raw`(?:胸[口]?[痛疼]|心口[痛疼]?|胸口不舒服)`),
  ENTRY("difficulty_breathing", "redFlags.difficultyBreathing", true, String.raw`(?:喘不上气|喘不过(?:[气汽]|来)|呼[吸息](?:困[难男]|费劲|吃力)|明显憋气|无法呼吸|吸不到空气|吸不进[气汽]|气儿?.{0,8}(?:接不上|不够用|不够使|只够吸半口)|气.{0,6}(?:吸不满|不够用|不够使)|吸气.{0,8}(?:只能吸到一半|只够半口))`),
  ENTRY("pressure_or_crushing", "redFlags.pressureOrCrushing", true, String.raw`(?:(?:石头|重物|秤砣).{0,10}(?:压|压着|压住)|压.{0,10}(?:石头|重物|秤砣)|(?:胸口)?(?:不是|没有|并非)?(?:被)?压着|压榨|紧缩|胸口.{0,6}发紧|胸.{0,6}压迫|勒得慌|沉得慌|像有人坐在胸口|像(?:被)?(?:一扇)?(?:门板|皮带|铁箍|绳子|带子)?.{0,4}(?:顶住|压住|箍住|勒住|勒着|勒死|捆紧))`),
  ENTRY("pain_radiation", "redFlags.painRadiation", true, String.raw`(?:(?:疼|痛).{0,8}(?:扩散|放射|窜到|串到|申到|伸到|牵到|蔓延到|跑到).{0,18}(?:手臂|手|胳[膊博]|左臂|右臂|肩|肩胛骨|后背|背|颈|脖子|下[巴吧]|下颌)|顺着.{0,12}(?:跑|窜|串)到.{0,12}(?:手臂|手|胳[膊博]|左臂|右臂|肩|背)|(?:往|向)?(?:手臂|胳[膊博]|左臂|右臂|肩|背|颈|脖子|下[巴吧]|下颌).{0,14}(?:窜|串|扩散|放射|也痛|也疼))`),
  ENTRY("collapse_or_sweating", "redFlags.collapseOrSweating", true, String.raw`(?:晕厥|晕倒|晕过去|晕过|快要晕|差点晕|险些晕|眼前一黑|栽倒|倒下|(?:整个人|人)?(?:一下)?(?:软倒|瘫倒)|腿一软.{0,8}(?:坐到|倒在).{0,6}(?:地上|地面)|冷汗|大汗|(?:额头|脑门|全身)?.{0,4}(?:全是汗|冒汗)|汗.{0,8}(?:湿透|往下流|如雨)|衣服被汗湿透|濒死感)`),
  ENTRY("persistent_severe", "symptoms.persistentSevere", true, String.raw`(?:(?:一直|持续).{0,10}(?:很痛|很疼|不缓解|疼|痛)|(?:痛|疼).{0,8}一直不缓解|胸口一直疼)`),
  ENTRY("chest_sudden_onset", "symptoms.onsetPattern", "sudden", String.raw`(?:突然|一下子|一下(?=就|开始|发作)|瞬间|骤然)`),
  ENTRY("chest_gradual_onset", "symptoms.onsetPattern", "gradual", String.raw`(?:逐渐|慢慢|一点点|越来越)`),
]);

export function clinicalEvidenceEntries(pathway) {
  if (pathway === "HEADACHE_V1") return [...SHARED, ...HEADACHE];
  if (pathway === "CHEST_PAIN_V1") return [...SHARED, ...CHEST_PAIN];
  return [];
}
