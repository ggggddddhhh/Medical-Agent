import { ChiefComplaint } from "../domain/constants.js";
import { chestPainProtocol } from "./chest-pain.js";
import { headacheProtocol } from "./headache.js";

export const protocols = Object.freeze({
  [ChiefComplaint.HEADACHE]: headacheProtocol,
  [ChiefComplaint.CHEST_PAIN]: chestPainProtocol,
});

export function detectChiefComplaint(text) {
  const normalized = text.toLowerCase();
  if (/(头|脑袋).{0,4}(痛|疼)/.test(normalized)) {
    return ChiefComplaint.HEADACHE;
  }
  if (/(胸|胸口|心口).{0,6}(痛|疼|压|闷|紧)/.test(normalized)) {
    return ChiefComplaint.CHEST_PAIN;
  }
  for (const protocol of Object.values(protocols)) {
    if (protocol.aliases.some((alias) => normalized.includes(alias))) {
      return protocol.chiefComplaint;
    }
  }
  return null;
}

export function getProtocol(chiefComplaint) {
  return protocols[chiefComplaint] ?? null;
}
