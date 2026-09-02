import { verifyEvidenceSpan } from "./evidence-span-finder.js";

export const LINGUISTIC_ASSERTION_LAYER_VERSION = "linguistic-assertion-layer-0.2.0";

const CORRECTION = /更正|纠正|说错了|说错|改口|重新想了想|重新想想|记错了|记错|其实|准确地说/;
const CERTAIN = /确实|真的|肯定|其实|明确|就是/;
const UNCERTAIN = /好像|可能|也许|似乎|不太确定|不确定|说不准|说不好|记不清|拿不准|不敢肯定|怀疑|大概|约莫|觉得|感觉|像是/;
const HYPOTHETICAL = /如果|假如|要是|万一|假设|倘若/;
const SOURCE = /网上|文章|资料|举例|例如|比如|听说|写着|别人说|医生问/;
const OTHER_PERSON = /我朋友|朋友|我家人|家里人|家属|我爱人|爱人|同事|同学|室友|邻居|父亲|母亲|爸爸|妈妈|爸|妈|丈夫|妻子|老公|老婆|孩子|儿子|女儿|别人|患者|他|她/;
const SUBJECT_UNCLEAR = /不清楚(?:是)?谁|不知道(?:是)?谁|分不清(?:是)?谁|是我还是|本人还是|谁的症状.{0,6}(?:不清楚|不知道)/;
const NEGATION = /没有|并无|无明显|否认|不伴|从未|(?<!是)不是|并非|没(?:有)?|不(?:会|曾|再|伴|往|向|硬|疼|痛)/;
const STRONG_PAST = /大前天|前天|昨天|昨晚|上周|上星期|上个月|去年|前年|以前|曾经|之前|早些时候|当时|那次|过去|(?:\d+|一|两|三|四|五|六|七|八|九|十|半)(?:分钟|小时|天|周|个月|年)前|今早|早上|上午|中午|下午|夜里|凌晨|那会儿|那阵子/;
const RECENT_PAST = /刚才|刚刚/;
const CURRENT = /现在|正在|目前|仍然|还在|今天|此刻|这会儿|眼下|依旧/;
const RESOLVED = /已经.{0,8}(?:好了|缓解|消失|不疼|不痛)|现在.{0,8}(?:没有|没再|不再|正常|清醒)/;
const NEW_ONSET = /突然|一下子?|瞬间|猛地|骤然|几秒|十来秒|十几[秒妙]|半分钟|一分(?:钟)?内|一?眨眼|转眼|顷刻/;
const TEMPORALITY_UNCLEAR = /(?:现在|目前|这会儿).{0,6}(?:还是|或是).{0,6}(?:以前|之前|过去)|(?:以前|之前|过去).{0,6}(?:还是|或是).{0,6}(?:现在|目前)|(?:时间|什么时候|何时).{0,8}(?:记不清|不清楚|不知道)/;

export class LinguisticAssertionLayer {
  analyze({ message, spans }) {
    if (typeof message !== "string" || !Array.isArray(spans)) {
      throw new TypeError("LinguisticAssertionLayer requires message and spans.");
    }
    return {
      assertionLayerVersion: LINGUISTIC_ASSERTION_LAYER_VERSION,
      assertions: spans.map((span) => classify(message, span)),
    };
  }
}

function classify(message, span) {
  const clause = clauseAround(message, span.start, span.end);
  const nearby = message.slice(Math.max(0, span.start - 24), Math.min(message.length, span.end + 24));
  const directAnswer = /医生问.{0,30}我.{0,20}(?:回答|说).{0,12}(?:都没有|没有|没)/.test(message);
  const patientObservedByOther = /(?:家人|朋友|同事|同学|室友|爱人).{0,10}(?:说|看见|看到|发现).{0,20}(?:我|本人|叫不醒我)/.test(nearby);
  const rawQuote = !directAnswer && !patientObservedByOther &&
    (insideQuotes(message, span) || SOURCE.test(clause.text));
  const referentialDenial = rawQuote && span.conceptHints.some((hint) =>
    hint.factPath.startsWith("redFlags."))
    ? patientDenialAfter(message, span.end)
    : null;
  const quote = rawQuote && !referentialDenial;
  const hypothetical = HYPOTHETICAL.test(clause.prefix) || HYPOTHETICAL.test(nearby);
  const subject = referentialDenial
    ? "patient"
    : classifySubject(clause, nearby, { directAnswer, patientObservedByOther, quote, hypothetical });
  const polarity = referentialDenial
    ? "negative"
    : classifyPolarity(message, span, clause, { directAnswer });
  const temporalUnclear = TEMPORALITY_UNCLEAR.test(clause.text) || TEMPORALITY_UNCLEAR.test(nearby);
  const certainty = subject === "unclear" || UNCERTAIN.test(clause.text) || temporalUnclear
    ? "uncertain"
    : CERTAIN.test(clause.text) || CORRECTION.test(clause.text)
      ? "certain"
      : "certain";
  return {
    assertionId: `assertion-${span.spanId}`,
    spanId: span.spanId,
    evidenceExact: verifyEvidenceSpan(message, span),
    subject,
    polarity,
    certainty,
    temporality: classifyTemporality(clause.text, nearby, span),
    quote,
    hypothetical,
    explicitCorrection: CORRECTION.test(message),
    conceptHints: structuredClone(span.conceptHints),
    evidence: [
      { text: span.text, start: span.start, end: span.end },
      ...(referentialDenial ? [referentialDenial] : []),
    ],
  };
}

function classifySubject(clause, nearby, flags) {
  if (flags.directAnswer || flags.patientObservedByOther) return "patient";
  if (SUBJECT_UNCLEAR.test(clause.text) || SUBJECT_UNCLEAR.test(nearby)) return "unclear";
  if (OTHER_PERSON.test(clause.prefix) || OTHER_PERSON.test(nearby)) return "other";
  if (flags.hypothetical && /有人|他|她|别人/.test(nearby)) return "other";
  if (/我|本人|自己/.test(clause.text) || !flags.quote) return "patient";
  return "unclear";
}

function classifyPolarity(message, span, clause, { directAnswer }) {
  if (directAnswer && /(?:都没有|回答.{0,8}没有|回答.{0,8}没)/.test(message)) return "negative";
  const prefix = message.slice(Math.max(clause.start, span.start - 16), span.start);
  const local = message.slice(Math.max(clause.start, span.start - 10), Math.min(clause.end, span.end + 10));
  const normalized = `${prefix}${local}`.replaceAll("没劲", "乏力").replaceAll("不清", "含糊");
  if (NEGATION.test(normalized)) return "negative";
  return "positive";
}

function classifyTemporality(clause, nearby, span) {
  if (RESOLVED.test(clause)) return "resolved";
  if (TEMPORALITY_UNCLEAR.test(clause) || TEMPORALITY_UNCLEAR.test(nearby)) return "unspecified";
  if (CURRENT.test(clause)) return "current";
  if (STRONG_PAST.test(clause)) return "previous";
  if (
    span.conceptHints?.some((hint) => hint.conceptId === "collapse_or_sweating") &&
    /晕|倒|栽|瘫|软倒|眼前一黑|随后/.test(clause)
  ) return "previous";
  if (NEW_ONSET.test(clause)) return "new_onset";
  if (
    RECENT_PAST.test(clause) ||
    /眼前一黑|栽倒|倒下|昏过去|晕了一下|腿一软|窜到了|[胸头](?:口)?[痛疼]后/.test(clause)
  ) return "previous";
  return "current";
}

function clauseAround(message, start, end) {
  const separators = /[，,。！？!?；;\n]|——|--|(?:但|不过|可是|然而|等等|等一下)/g;
  let left = 0;
  let right = message.length;
  for (const match of message.matchAll(separators)) {
    if (match.index < start) left = match.index + match[0].length;
    else if (match.index >= end) {
      right = match.index;
      break;
    }
  }
  return {
    start: left,
    end: right,
    text: message.slice(left, right),
    prefix: message.slice(left, start),
  };
}

function insideQuotes(message, span) {
  for (const [open, close] of [["‘", "’"], ["“", "”"], ["\"", "\""], ["'", "'"]]) {
    const left = message.lastIndexOf(open, span.start);
    if (left < 0) continue;
    const right = message.indexOf(close, open === close ? left + 1 : span.end);
    if (right >= span.end) return true;
  }
  return false;
}

function patientDenialAfter(message, startAt) {
  const tail = message.slice(startAt);
  const match = /(?:但|不过|可是|[，,]).{0,10}(?:我|我的|我自己).{0,14}(?:没有|没|不)/.exec(tail);
  if (!match) return null;
  const start = startAt + match.index;
  return { text: match[0], start, end: start + match[0].length };
}
