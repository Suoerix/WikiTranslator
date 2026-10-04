/**
 * Terminal stream presenter for LLM output (reasoning + text).
 *
 * Line-buffered rendering inspired by flue's line-event-presenter:
 * - only complete lines are written; the trailing partial line is kept
 *   in a buffer until a newline arrives in a later delta
 * - reasoning and text are mutually flushed so their order is preserved
 * - reasoning is rendered dim + indented, text with an indented block
 * - output goes to stderr so stdout stays pipeable
 */

const DIM = '\x1b[2m';
const RESET = '\x1b[22m';

export type StreamKind = 'reasoning' | 'text';

export interface StreamPresenter {
  present(delta: string, kind: StreamKind): void;
  finish(): void;
}

interface PresenterOptions {
  write?: (s: string) => void;
  headings?: { reasoning?: string; text?: string };
}

function consumeCompleteLines(
  value: string,
  write: (line: string) => void,
): string {
  if (!value.includes('\n')) return value;
  const lines = value.split('\n');
  const remainder = lines.pop() ?? '';
  for (const line of lines) write(line);
  return remainder;
}

export function createStreamPresenter(options: PresenterOptions = {}): StreamPresenter {
  const write = options.write ?? ((s: string) => process.stderr.write(s));
  const dim = (s: string) => DIM + s + RESET;
  const headings = {
    reasoning: options.headings?.reasoning ?? 'thinking',
    text: options.headings?.text ?? 'assistant',
  };

  let streamingKind: StreamKind | null = null;
  let reasoningBuffer = '';
  let textBuffer = '';

  const writeReasoningLine = (line: string) => write(dim(`  ${line}`) + '\n');
  const writeTextLine = (line: string) => write(`  ${line}` + '\n');

  function flush(kind: StreamKind) {
    if (kind === 'reasoning' && reasoningBuffer) {
      writeReasoningLine(reasoningBuffer);
      reasoningBuffer = '';
    } else if (kind === 'text' && textBuffer) {
      writeTextLine(textBuffer);
      textBuffer = '';
    }
  }

  return {
    present(delta, kind) {
      if (!delta) return;
      if (kind === 'reasoning') {
        if (streamingKind === 'text') flush('text');
        if (streamingKind !== 'reasoning') {
          write(dim(headings.reasoning) + '\n');
          streamingKind = 'reasoning';
        }
        reasoningBuffer = consumeCompleteLines(reasoningBuffer + delta, writeReasoningLine);
      } else {
        if (streamingKind === 'reasoning') flush('reasoning');
        if (streamingKind !== 'text') {
          write(headings.text + '\n');
          streamingKind = 'text';
        }
        textBuffer = consumeCompleteLines(textBuffer + delta, writeTextLine);
      }
    },
    finish() {
      if (streamingKind) {
        flush(streamingKind);
        streamingKind = null;
      }
    },
  };
}
