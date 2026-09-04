import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";

export const MEMORY_CHECKPOINT_SCHEMA_VERSION = "phase-5-memory-checkpoint-0.1.0";
export const FILE_SESSION_MANAGER_VERSION = "phase-5-file-session-manager-0.1.0";

export class FileSessionManager {
  #directory;
  #clock;

  constructor({
    directory = process.env.MEMORY_STORAGE_DIR ?? join(process.cwd(), "runtime", "memory"),
    clock = () => new Date(),
  } = {}) {
    if (typeof directory !== "string" || directory.trim().length === 0) {
      throw new TypeError("Memory storage directory must be a non-empty string.");
    }
    if (typeof clock !== "function") {
      throw new TypeError("clock must be a function.");
    }
    this.#directory = resolve(directory);
    this.#clock = clock;
  }

  get directory() {
    return this.#directory;
  }

  has(sessionId) {
    return existsSync(this.#pathFor(sessionId));
  }

  load(sessionId) {
    const path = this.#pathFor(sessionId);
    if (!existsSync(path)) {
      const error = new Error(`Session checkpoint not found: ${sessionId}`);
      error.code = "SESSION_CHECKPOINT_NOT_FOUND";
      throw error;
    }
    let checkpoint;
    try {
      checkpoint = JSON.parse(readFileSync(path, "utf8"));
    } catch (cause) {
      const error = new Error(`Session checkpoint is unreadable: ${sessionId}`, { cause });
      error.code = "SESSION_CHECKPOINT_INVALID";
      throw error;
    }
    validateCheckpoint(checkpoint, sessionId);
    return structuredClone(checkpoint);
  }

  save(checkpoint) {
    validateCheckpoint(checkpoint);
    mkdirSync(this.#directory, { recursive: true });
    const path = this.#pathFor(checkpoint.sessionId);
    const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
    const stored = {
      ...structuredClone(checkpoint),
      schemaVersion: MEMORY_CHECKPOINT_SCHEMA_VERSION,
      updatedAt: this.#clock().toISOString(),
    };
    try {
      writeFileSync(temporaryPath, `${JSON.stringify(stored, null, 2)}\n`, {
        encoding: "utf8",
        mode: 0o600,
      });
      renameSync(temporaryPath, path);
    } finally {
      if (existsSync(temporaryPath)) rmSync(temporaryPath, { force: true });
    }
    return structuredClone(stored);
  }

  #pathFor(sessionId) {
    validateSessionId(sessionId);
    const path = resolve(join(this.#directory, `${sessionId}.json`));
    if (dirname(path) !== this.#directory) {
      throw new TypeError("Session ID resolves outside the memory directory.");
    }
    return path;
  }
}

function validateSessionId(sessionId) {
  if (
    typeof sessionId !== "string"
    || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(sessionId)
  ) {
    throw new TypeError("sessionId contains unsupported characters.");
  }
}

function validateCheckpoint(checkpoint, expectedSessionId = null) {
  if (!checkpoint || typeof checkpoint !== "object" || Array.isArray(checkpoint)) {
    throw new TypeError("Memory checkpoint must be an object.");
  }
  validateSessionId(checkpoint.sessionId);
  if (expectedSessionId && checkpoint.sessionId !== expectedSessionId) {
    throw new Error("Session checkpoint ID does not match the requested session.");
  }
  if (
    checkpoint.schemaVersion !== MEMORY_CHECKPOINT_SCHEMA_VERSION
    || !checkpoint.caseState
    || !Array.isArray(checkpoint.history)
    || !Array.isArray(checkpoint.snapshots)
    || !checkpoint.factMemory
    || !checkpoint.questionMemory
  ) {
    const error = new Error("Unsupported or incomplete memory checkpoint.");
    error.code = "SESSION_CHECKPOINT_INVALID";
    throw error;
  }
}
