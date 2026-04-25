import { callJSON } from "../core/claude.ts";
import { loadConfig } from "../core/config.ts";
import { CONVERSATION_FORMAT_NOTE } from "./shared.ts";

export type CaptureSignal =
  | "problem-reframing"
  | "decision-heuristic"
  | "boundary-response"
  | "meta-insight";

export interface ShouldCaptureResult {
  worth_capturing: boolean;
  score: number; // 0-1
  reason: string;
  signals: CaptureSignal[];
  hint?: string;
}

const SYSTEM = `你是 Council 的 capture 守门员。判断一段对话是否值得 capture——也就是，**是否包含了用户的真实思考瞬间**, 而不是工具调用 / 闲聊 / 噪音。

${CONVERSATION_FORMAT_NOTE}

# 判定标准: 至少满足以下其一才"worth_capturing"

(a) **problem-reframing** — 用户重构了问题框架, 而不是接受 AI 给的框架
(b) **decision-heuristic** — 用户给出了一个**自己**生成的可复用决策路径
(c) **boundary-response** — 用户在 AI 否定/压力/分歧下展现了具体的应对模式
(d) **meta-insight** — 用户对自己思考方式 / 行为模式的观察 (有原话支撑)

# 硬性拒绝清单 (命中任一则不值得 capture)

❌ 用户在让 AI 写代码 / debug / 改 bug → 工具调用, 不是思考
❌ 用户在查事实 / 翻译 / 格式转换 → 工具调用
❌ 用户只是点头同意 / 追问澄清, 没产出新视角
❌ 用户输出全靠 AI 启发, 自己没原话证据
❌ 对话 < 3 轮且没有明显的"用户视角驱动"的瞬间
❌ 用户在测试 prompt / debug AI 行为 (这是元对话, 不是思考)

# 评分

- score >= 0.8: 强烈值得 (多条 signal + 鲜明的用户原话)
- score 0.5-0.79: 边缘但值得 (1 条 signal 清晰)
- score < 0.5: 不值得

# hint 字段

如果不值得 capture, 给一句话 hint 教用户**下次什么样的对话才适合 capture**。
如果值得 capture, hint 可以为空, 或给一句话提示用户最锋利的瞬间在哪。
`;

export async function shouldCapture(
  conversation: string,
): Promise<ShouldCaptureResult> {
  const cfg = loadConfig();
  const schema = {
    type: "object",
    properties: {
      worth_capturing: { type: "boolean" },
      score: { type: "number", minimum: 0, maximum: 1 },
      reason: {
        type: "string",
        description: "1-2 句, 具体说明为什么值得或不值得",
      },
      signals: {
        type: "array",
        items: {
          type: "string",
          enum: [
            "problem-reframing",
            "decision-heuristic",
            "boundary-response",
            "meta-insight",
          ],
        },
      },
      hint: {
        type: "string",
        description: "可选, 引导用户的提示",
      },
    },
    required: ["worth_capturing", "score", "reason", "signals"],
  };

  // 对话太长就只看前后各 4000 字 + 中间 sample, 节省 token
  const trimmed = trimForJudgment(conversation);

  return await callJSON<ShouldCaptureResult>(
    `请判断以下对话是否值得 capture:\n\n=== 对话开始 ===\n${trimmed}\n=== 对话结束 ===`,
    {
      model: cfg.models.distill,
      system: SYSTEM,
      label: "should-capture",
      temperature: 0.2,
      maxTokens: 800,
      jsonSchema: schema,
      toolName: "judge_capture",
    },
  );
}

function trimForJudgment(text: string): string {
  if (text.length <= 8000) return text;
  const head = text.slice(0, 4000);
  const tail = text.slice(-4000);
  return `${head}\n\n[...中间省略 ${text.length - 8000} 字符...]\n\n${tail}`;
}
