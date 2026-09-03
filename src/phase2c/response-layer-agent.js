import { ResponseGenerator } from "./response-generator.js";
import { ResponseSafetyError, ResponseSafetyGuard } from "./response-safety-guard.js";

export const RESPONSE_LAYER_VERSION = "phase-2c-response-layer-0.1.0";

export class ResponseLayerAgent {
  #loop;
  #generator;
  #guard;

  constructor({
    loop,
    responseGenerator = new ResponseGenerator(),
    responseSafetyGuard = new ResponseSafetyGuard(),
  } = {}) {
    if (!loop || typeof loop.handleMessage !== "function") {
      throw new TypeError("ResponseLayerAgent requires an agent loop.");
    }
    if (!responseGenerator || typeof responseGenerator.generate !== "function") {
      throw new TypeError("responseGenerator must implement generate.");
    }
    if (!responseSafetyGuard || typeof responseSafetyGuard.validate !== "function") {
      throw new TypeError("responseSafetyGuard must implement validate.");
    }
    this.#loop = loop;
    this.#generator = responseGenerator;
    this.#guard = responseSafetyGuard;
  }

  startSession(context = {}) {
    return this.#loop.startSession(context);
  }

  restoreSession(serializedState) {
    return this.#loop.restoreSession(serializedState);
  }

  exportSession(sessionId) {
    return this.#loop.exportSession(sessionId);
  }

  getSession(sessionId) {
    return {
      responseLayerVersion: RESPONSE_LAYER_VERSION,
      ...this.#loop.getSession(sessionId),
    };
  }

  getAudit(sessionId) {
    return this.#loop.getAudit(sessionId);
  }

  getDecisionTraces(sessionId) {
    return this.#loop.getDecisionTraces(sessionId);
  }

  async handleMessage(sessionId, message) {
    const decision = await this.#loop.handleMessage(sessionId, message);
    const stateBefore = this.#loop.getSession(sessionId).state;
    const fingerprintBefore = JSON.stringify(stateBefore);
    const candidate = this.#generator.generate({
      decision: structuredClone(decision),
      caseState: structuredClone(stateBefore),
    });
    const response = this.#guard.validate({
      candidate,
      decision,
      caseState: stateBefore,
    });
    const fingerprintAfter = JSON.stringify(this.#loop.getSession(sessionId).state);
    if (fingerprintAfter !== fingerprintBefore) {
      throw new ResponseSafetyError("CASE_STATE_MUTATION");
    }
    return {
      ...decision,
      responseLayerVersion: RESPONSE_LAYER_VERSION,
      ...response,
    };
  }
}
