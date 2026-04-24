import { isInitialized } from "../core/paths.ts";
import { NotInitializedError } from "../core/errors.ts";
import { convene } from "../engine/convene.ts";

export async function conveneCommand(
  question: string,
  opts: { with?: string; stream?: boolean },
): Promise<void> {
  if (!isInitialized()) throw new NotInitializedError();
  if (!question.trim()) {
    throw new Error('需要提供问题: council convene "<你的问题>"');
  }
  await convene(question, opts);
}
