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

  mergeProtocolFacts(facts, protocol?.extractDeterministicFacts?.(normalized));
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

function mergeProtocolFacts(target, source = {}) {
  for (const section of ["symptoms", "redFlags", "relevantHistory"]) {
    Object.assign(target[section] ??= {}, source[section] ?? {});
  }
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
