import {
  Controller, Get, Post, UploadedFile, UseGuards, UseInterceptors, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { IngestService } from './ingest.service';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MaterialDocument, DocumentDoc } from './document.schema';

const ASSETS_DIR = path.join(process.cwd(), 'assets');

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('admin/documents')
export class DocumentsController {
  constructor(
    private ingest: IngestService,
    @InjectModel(MaterialDocument.name) private docModel: Model<DocumentDoc>,
  ) {}

  @Get()
  async list() {
    return this.docModel.find().sort({ ingestedAt: -1 });
  }

  @Post('ingest')
  async ingestFromAssets() {
    const mdFile = path.join(ASSETS_DIR, 'material.md');
    if (!fs.existsSync(mdFile)) {
      throw new BadRequestException('assets/material.md not found');
    }
    return this.ingest.ingestFile(mdFile, 'material', 'Material de Cátedra');
  }

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: ASSETS_DIR,
        filename: (_req, file, cb) => cb(null, file.originalname),
      }),
      fileFilter: (_req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (ext !== '.md' && ext !== '.txt') {
          return cb(new BadRequestException('Only .md or .txt files are allowed'), false);
        }
        cb(null, true);
      },
    }),
  )
  async upload(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file uploaded');
    return this.ingest.ingestFile(file.path, 'material', 'Material de Cátedra');
  }
}
