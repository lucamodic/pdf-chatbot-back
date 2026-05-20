import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ActivityLog, ActivityLogDocument } from './activity-log.schema';

@Injectable()
export class ActivityLogService {
  constructor(
    @InjectModel(ActivityLog.name) private logModel: Model<ActivityLogDocument>,
  ) {}

  async error(context: string, message: string, error?: Error, meta?: Record<string, any>) {
    await this.logModel.create({
      level: 'error',
      context,
      message,
      stack: error?.stack,
      meta,
    }).catch(() => {}); // never throw from the logger itself
  }
}
