/** send/interrupt 的文本体解析：<text> 参数 / --text-file / --stdin（verbatim 自 Trellis）。 */
import * as fs from "fs";
import { StringDecoder } from "string_decoder";

export interface ChannelTextBodyOptions {
  text?: string;
  stdin?: boolean;
  textFile?: string;
}

interface ResolveChannelTextBodyOptions {
  required: boolean;
  missingMessage: string;
  emptyMessage: string;
}

export async function resolveChannelTextBody(
  opts: ChannelTextBodyOptions,
  resolveOpts: ResolveChannelTextBodyOptions,
): Promise<string | undefined> {
  const raw = await readChannelTextBody(opts);
  if (raw === undefined) {
    if (resolveOpts.required) throw new Error(resolveOpts.missingMessage);
    return undefined;
  }
  const text = raw.trimEnd();
  if (!text) throw new Error(resolveOpts.emptyMessage);
  return text;
}

async function readChannelTextBody(opts: ChannelTextBodyOptions): Promise<string | undefined> {
  if (opts.text !== undefined && opts.text !== "") return opts.text;
  if (opts.textFile) return fs.readFileSync(opts.textFile, "utf-8");
  if (opts.stdin) return await readStdin();
  return undefined;
}

async function readStdin(): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    let buf = "";
    // 管道分块可能落在中文/emoji 的 UTF-8 字节中间，跨块保留未完成的字符。
    const decoder = new StringDecoder("utf-8");
    const onData = (chunk: Buffer): void => {
      buf += decoder.write(chunk);
    };
    const cleanup = (): void => {
      process.stdin.off("data", onData);
      process.stdin.off("end", onEnd);
      process.stdin.off("error", onError);
    };
    const onEnd = (): void => {
      cleanup();
      resolve(buf + decoder.end());
    };
    const onError = (err: Error): void => {
      cleanup();
      reject(err);
    };
    process.stdin.on("data", onData);
    process.stdin.once("end", onEnd);
    process.stdin.once("error", onError);
  });
}
