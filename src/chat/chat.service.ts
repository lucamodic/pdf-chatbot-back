import { Injectable, Logger } from '@nestjs/common';
import { RetrieverService } from '../rag/retriever.service';
import { GeminiService } from '../rag/gemini.service';
import { HistoryService } from './history.service';
import { buildSystemPrompt, buildUserPrompt } from '../rag/prompts';
import { ConfigService } from '@nestjs/config';
import { ActivityLogService } from '../activity-log/activity-log.service';

const COURSE_TITLE = 'Cátedra';
const NO_CONTEXT_REPLY = 'No encuentro esa información en el material de la cátedra.';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private retriever: RetrieverService,
    private gemini: GeminiService,
    private historyService: HistoryService,
    private config: ConfigService,
    private activityLog: ActivityLogService,
  ) {}

  async *ask(userId: string, question: string): AsyncGenerator<{ type: 'token' | 'done' | 'chat_error'; data: any }> {
    const chunks = await this.retriever.search(question);

    if (chunks.length === 0) {
      yield { type: 'token', data: NO_CONTEXT_REPLY };
      yield { type: 'done', data: { sources: [] } };
      await this.historyService.save(userId, question, NO_CONTEXT_REPLY, []);
      return;
    }

    const systemPrompt = buildSystemPrompt(this.config.get('COURSE_TITLE', COURSE_TITLE));
    const userPrompt = buildUserPrompt(question, chunks);

    this.logger.log(`Calling Gemini stream for question: "${question.slice(0, 60)}..."`);
    this.logger.log(`Context — ${chunks.length} chunks. First heading: "${chunks[0]?.heading}" snippet: "${chunks[0]?.text?.slice(0, 80)}"`);

    let fullAnswer = '';
    let tokenCount = 0;
    const seen = new Set<string>();
    const sources = chunks
      .filter((c) => { if (seen.has(c.heading)) return false; seen.add(c.heading); return true; })
      .map((c) => ({ chunkId: c.id, heading: c.heading, snippet: c.text.slice(0, 200) }));

    try {
      for await (const token of this.gemini.streamChat(systemPrompt, userPrompt)) {
        fullAnswer += token;
        tokenCount++;
        yield { type: 'token', data: token };
      }

      this.logger.log(`Stream complete — ${tokenCount} tokens, ${fullAnswer.length} chars`);
      yield { type: 'done', data: { sources } };
      await this.historyService.save(userId, question, fullAnswer, sources);
    } catch (err: any) {
      this.logger.error(`streamChat error: ${err.message}`);
      await this.activityLog.error('ChatService', err.message, err, { question });
      yield { type: 'chat_error', data: err.message || 'Error generating response' };
    }
  }
}
