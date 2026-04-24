import { readIdentity } from "../core/skill-md.ts";

export function identityBlock(): string {
  const id = readIdentity();
  if (!id.trim()) return "";
  return `\n\n=== 用户身份档案 (identity.md) ===\n${id}\n=== 档案结束 ===\n`;
}

export const CONVERSATION_FORMAT_NOTE = `
对话格式说明: 下面是用户 (User / Prompt) 与 AI (Assistant / Response) 的完整对话, 通常来自 Claude.ai 导出, 以 "## Prompt:" 和 "## Response:" 分隔。
- "## Prompt:" 之后的文本 = 用户的原话
- "## Response:" 之后的文本 = AI 的回答 (不是用户)
`;
