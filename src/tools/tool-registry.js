export class ToolRegistry {
  #tools = new Map();

  register(tool) {
    if (!tool?.name || typeof tool.execute !== "function") {
      throw new TypeError("A tool must have a name and execute function.");
    }
    if (this.#tools.has(tool.name)) {
      throw new Error(`Tool already registered: ${tool.name}`);
    }
    this.#tools.set(tool.name, tool);
    return this;
  }

  call(name, args) {
    const tool = this.#tools.get(name);
    if (!tool) {
      throw new Error(`Tool is not allowlisted: ${name}`);
    }
    tool.validate?.(args);
    return structuredClone(tool.execute(structuredClone(args)));
  }

  list() {
    return [...this.#tools.keys()];
  }
}
