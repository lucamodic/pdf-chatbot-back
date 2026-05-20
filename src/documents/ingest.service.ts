import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as fs from 'fs';
import * as path from 'path';
import { MaterialDocument, DocumentDoc } from './document.schema';
import { Chunk, ChunkDocument } from './chunk.schema';
import { GeminiService } from '../rag/gemini.service';

const CHUNK_SIZE = 800;
const CHUNK_OVERLAP = 100;
const ASSETS_DIR = path.join(process.cwd(), 'assets');

@Injectable()
export class IngestService implements OnModuleInit {
  private readonly logger = new Logger(IngestService.name);

  constructor(
    @InjectModel(MaterialDocument.name) private docModel: Model<DocumentDoc>,
    @InjectModel(Chunk.name) private chunkModel: Model<ChunkDocument>,
    private gemini: GeminiService,
  ) {}

  async onModuleInit() {
    const count = await this.docModel.countDocuments();
    if (count === 0) {
      const mdFile = path.join(ASSETS_DIR, 'material.md');
      if (fs.existsSync(mdFile)) {
        this.logger.log('Seeding from assets/material.md...');
        await this.ingestFile(mdFile, 'material', 'Material de Cátedra');
      } else {
        this.logger.warn('assets/material.md not found — skipping seed');
      }
    }
  }

  async ingestFile(filePath: string, slug: string, title: string): Promise<DocumentDoc> {
    const content = fs.readFileSync(filePath, 'utf-8');
    return this.ingestContent(content, slug, title, path.basename(filePath));
  }

  async ingestContent(content: string, slug: string, title: string, sourceFile: string): Promise<DocumentDoc> {
    // Save file to assets if it came from upload
    const destPath = path.join(ASSETS_DIR, sourceFile);
    if (!fs.existsSync(destPath)) {
      fs.mkdirSync(ASSETS_DIR, { recursive: true });
      fs.writeFileSync(destPath, content);
    }

    // Find last version for this slug
    const last = await this.docModel.findOne({ slug }).sort({ version: -1 });
    const version = last ? last.version + 1 : 1;

    const doc = await this.docModel.create({ slug, title, sourceFile, version, ingestedAt: new Date() });

    const chunks = this.chunkMarkdown(content);
    this.logger.log(`Ingesting ${chunks.length} chunks for "${title}" v${version}...`);

    for (let i = 0; i < chunks.length; i++) {
      const { heading, text } = chunks[i];
      const embedding = await this.gemini.embedText(text);
      await this.chunkModel.create({ documentId: doc._id as any, order: i, heading, text, embedding });
      this.logger.log(`  chunk ${i + 1}/${chunks.length} ingested`);
      // 300ms entre requests para no superar el rate limit del free tier
      if (i < chunks.length - 1) await new Promise((r) => setTimeout(r, 300));
    }

    // Remove chunks from older versions of the same slug
    if (last) {
      const oldDocs = await this.docModel.find({ slug, _id: { $ne: doc._id } });
      const oldIds = oldDocs.map((d) => d._id);
      await this.chunkModel.deleteMany({ documentId: { $in: oldIds } } as any);
      await this.docModel.deleteMany({ _id: { $in: oldIds } });
    }

    this.logger.log(`Ingestion complete for "${title}" v${version}`);
    return doc;
  }

  private chunkMarkdown(content: string): { heading: string; text: string }[] {
    const lines = content.split('\n');
    const sections: { heading: string; body: string }[] = [];
    let currentHeading = '';
    let currentBody: string[] = [];

    for (const line of lines) {
      const headingMatch = line.match(/^(#{1,3})\s+(.+)/);
      if (headingMatch) {
        if (currentBody.join('\n').trim()) {
          sections.push({ heading: currentHeading, body: currentBody.join('\n').trim() });
        }
        currentHeading = headingMatch[2].trim();
        currentBody = [];
      } else {
        currentBody.push(line);
      }
    }
    if (currentBody.join('\n').trim()) {
      sections.push({ heading: currentHeading, body: currentBody.join('\n').trim() });
    }

    const chunks: { heading: string; text: string }[] = [];
    for (const section of sections) {
      const subChunks = this.splitBySize(section.body, CHUNK_SIZE, CHUNK_OVERLAP);
      for (const text of subChunks) {
        if (text.trim()) chunks.push({ heading: section.heading, text });
      }
    }
    return chunks;
  }

  private splitBySize(text: string, size: number, overlap: number): string[] {
    const words = text.split(/\s+/);
    const chunks: string[] = [];
    let start = 0;
    while (start < words.length) {
      const end = Math.min(start + size, words.length);
      chunks.push(words.slice(start, end).join(' '));
      if (end === words.length) break;
      start = end - overlap;
    }
    return chunks;
  }
}
