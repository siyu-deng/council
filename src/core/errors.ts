export class CouncilError extends Error {
  constructor(
    message: string,
    public hint?: string,
  ) {
    super(message);
    this.name = "CouncilError";
  }
}

export class NotInitializedError extends CouncilError {
  constructor() {
    super(
      "Council 尚未初始化",
      "运行 `council init` 创建 ~/.council/ 目录",
    );
    this.name = "NotInitializedError";
  }
}

export class PersonaNotFoundError extends CouncilError {
  constructor(ref: string) {
    super(
      `找不到 persona: ${ref}`,
      "运行 `council persona list` 查看所有可用 persona",
    );
    this.name = "PersonaNotFoundError";
  }
}

export class SessionNotFoundError extends CouncilError {
  constructor(id: string) {
    super(`找不到 session: ${id}`, "检查 ~/.council/sessions/ 下的文件名");
    this.name = "SessionNotFoundError";
  }
}

export class ApiKeyMissingError extends CouncilError {
  constructor() {
    super(
      "未找到 ANTHROPIC_API_KEY",
      "在环境变量中设置, 或把它写进项目根的 .env 文件",
    );
    this.name = "ApiKeyMissingError";
  }
}
