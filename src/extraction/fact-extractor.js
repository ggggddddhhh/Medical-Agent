const NEGATIVE_PATTERN = /(没有|没伴|并无|无明显|不是|并不是|否认|不伴|没有过|从未|否|不)/;
const POSITIVE_PATTERN = /(有|是的|对|会|正在|仍然|反复|嗯|是)/;

export function extractFacts(text, state, protocol) {
  const normalized = text.trim().toLowerCase();
  const facts = {
    patientContext: extractPatientContext(normalized),
    symptoms: {},
    redFlags: {},
    factStatuses: {},
  };

  extractSemanticRedFlags(normalized, facts);
  const unavailableStatus = parseUnavailableStatus(normalized);

  if (state.decisionState.pendingQuestionId === "CONFIRM_ADULT") {
    if (unavailableStatus) {
      facts.factStatuses["patientContext.adultConfirmed"] = unavailableStatus;
    } else {
      const adultConfirmation = parseBoolean(normalized);
      if (adultConfirmation !== undefined) {
        facts.patientContext.adultConfirmed = adultConfirmation;
      }
    }
  }

  const pendingQuestion = protocol?.questions.find(
    (question) => question.id === state.decisionState.pendingQuestionId,
  );
  if (pendingQuestion) {
    if (unavailableStatus) {
      facts.factStatuses[pendingQuestion.factPath] = unavailableStatus;
    } else if (
      !hasFactAtPath(facts, pendingQuestion.factPath) &&
      !hasSemanticFactOutsidePath(facts, pendingQuestion.factPath)
    ) {
      const parsed = parsePendingAnswer(normalized, pendingQuestion.parser);
      if (parsed !== undefined) {
        assignFact(facts, pendingQuestion.factPath, parsed);
      }
    }
  }

  const severity = parseSeverity(normalized);
  if (severity !== undefined) {
    facts.symptoms.severity = severity;
  }

  return facts;
}

function hasSemanticFactOutsidePath(facts, pendingPath) {
  for (const section of ["patientContext", "symptoms", "redFlags"]) {
    for (const key of Object.keys(facts[section] ?? {})) {
      if (`${section}.${key}` !== pendingPath) {
        return true;
      }
    }
  }
  return false;
}

function hasFactAtPath(facts, path) {
  const [section, key] = path.split(".");
  return facts[section]?.[key] !== undefined;
}

function extractPatientContext(text) {
  const pregnancyContext = /(怀孕|孕妇|孕期|妊娠)/.test(text)
    ? { pregnant: true }
    : {};
  const ageMatch = text.match(/(?:我|患者|病人)?\s*(\d{1,3})\s*岁/);
  if (!ageMatch) {
    if (/(已满|超过)\s*18\s*岁|成年人|成人/.test(text)) {
      return { ...pregnancyContext, adultConfirmed: true };
    }
    if (/(未满|不到)\s*18\s*岁|未成年/.test(text)) {
      return { ...pregnancyContext, adultConfirmed: false };
    }
    return pregnancyContext;
  }

  const age = Number(ageMatch[1]);
  return {
    ...pregnancyContext,
    age,
    adultConfirmed: age >= 18,
  };
}

function extractSemanticRedFlags(text, facts) {
  if (
    /(突然|一下|瞬间).*(最严重|剧烈|难以忍受|受不了)|雷击样|霹雳样|几秒.*最严重|几分钟.*最严重/.test(
      text,
    ) &&
    !negates(text, "突然|一下|瞬间|雷击样|霹雳样")
  ) {
    facts.symptoms.onsetPattern = "sudden_severe";
  } else if (/(逐渐|慢慢|一点点|越来越)/.test(text)) {
    facts.symptoms.onsetPattern = "gradual";
  }

  if (
    (/(这辈子|有生以来|从来没有).*(最严重|这么痛|这么疼)|最严重的一次/.test(text)) &&
    !negates(text, "最严重|这么痛|这么疼")
  ) {
    facts.redFlags.worstEverHeadache = true;
  }

  if (
    /(一侧|半边|左边|右边).*(无力|没劲|麻木)|嘴歪|口角歪|说话.*(不清|不利索)|言语不清|视物异常|看不清|复视/.test(
      text,
    ) &&
    !negates(text, "一侧|半边|左边|右边|嘴歪|口角歪|说话|言语|视物|复视")
  ) {
    facts.redFlags.neurologicalDeficit = true;
  }

  const mentionsFever = /(发热|发烧|高烧)/.test(text);
  const mentionsNeckStiffness = /(脖子|颈部).*(僵|硬|不能低头|难以低头)/.test(text);
  if (
    mentionsFever &&
    mentionsNeckStiffness &&
    !negates(text, "发热|发烧|高烧|脖子|颈部")
  ) {
    facts.redFlags.feverNeckStiffness = true;
  }

  if (
    /(意识不清|神志不清|意识模糊|昏迷|叫不醒|失去意识)/.test(text) &&
    !negates(text, "意识|神志|昏迷|叫不醒")
  ) {
    facts.redFlags.alteredConsciousness = true;
  }

  if (
    (/(撞到|撞了|摔到|磕到|头部受伤|外伤后).*(头|脑)|头.*(撞到|撞了|摔到|磕到)/.test(text)) &&
    !negates(text, "撞到|撞了|摔到|磕到|头部受伤|外伤")
  ) {
    facts.redFlags.recentHeadTrauma = true;
  }

  if (
    /(喘不上|喘不过|呼吸困难|明显憋气|无法呼吸)/.test(text) &&
    !negates(text, "喘不上|喘不过|呼吸困难|憋气|无法呼吸")
  ) {
    facts.redFlags.difficultyBreathing = true;
  }

  if (
    (/(石头|重物).*(压|压着)|压.*(石头|重物)|压榨|紧缩|胸口.*发紧|胸.*压迫/.test(text)) &&
    !negates(text, "石头|重物|压榨|紧缩|发紧|压迫")
  ) {
    facts.redFlags.pressureOrCrushing = true;
  }

  if (
    (/(疼|痛).*(扩散|放射|窜到).*(手臂|胳膊|肩|背|颈|脖子|下颌|牙)|(?:手臂|胳膊|肩背|下颌).*(也痛|也疼)/.test(text)) &&
    !negates(text, "扩散|放射|窜到|手臂|胳膊|肩背|下颌")
  ) {
    facts.redFlags.painRadiation = true;
  }

  if (
    /(晕厥|晕倒|快要晕|差点晕|险些晕|冷汗|大汗|濒死感)/.test(text) &&
    !negates(text, "晕厥|晕倒|快要晕|差点晕|险些晕|冷汗|大汗|濒死感")
  ) {
    facts.redFlags.collapseOrSweating = true;
  }
}

function negates(text, conceptPattern) {
  const normalized = text.replaceAll("是不是", "是否");
  return new RegExp(
    `(?:没有|并无|无明显|无|不是|并非|否认|不伴).{0,8}(?:${conceptPattern})`,
  ).test(normalized);
}

function parsePendingAnswer(text, parser) {
  if (parser === "boolean") {
    return parseBoolean(text);
  }
  if (parser === "onset_pattern") {
    if (/(不是|并非|没有).*(突然|一下)|逐渐|慢慢|一点点/.test(text)) {
      return "gradual";
    }
    if (/(突然|一下|瞬间|几秒|几分钟).*(最严重|剧烈|难以忍受|受不了)|雷击样|霹雳样/.test(text)) {
      return "sudden_severe";
    }
    return undefined;
  }
  if (parser === "severity") {
    return parseSeverity(text);
  }
  return undefined;
}

function parseUnavailableStatus(text) {
  if (/(不想回答|不愿回答|拒绝回答|不方便说|不想说)/.test(text)) {
    return "refused";
  }
  if (/(不知道|不清楚|不记得|记不清|说不准|不确定)/.test(text)) {
    return "unknown";
  }
  return null;
}

function parseBoolean(text) {
  if (NEGATIVE_PATTERN.test(text)) {
    return false;
  }
  if (POSITIVE_PATTERN.test(text)) {
    return true;
  }
  return undefined;
}

function parseSeverity(text) {
  const match = text.match(/(?:大约|大概|差不多|是)?\s*(10|[0-9])\s*分/);
  if (!match) {
    return undefined;
  }
  return Number(match[1]);
}

function assignFact(facts, factPath, value) {
  const [section, key] = factPath.split(".");
  facts[section] ??= {};
  facts[section][key] = value;
}
