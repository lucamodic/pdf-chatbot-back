import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ActivityLogDocument = ActivityLog & Document;

@Schema({ collection: 'activity_logs', timestamps: true })
export class ActivityLog {
  @Prop({ required: true }) level: string;       // 'error' | 'warn'
  @Prop({ required: true }) context: string;     // e.g. 'ChatService'
  @Prop({ required: true }) message: string;
  @Prop() stack?: string;
  @Prop({ type: Object }) meta?: Record<string, any>;
}

export const ActivityLogSchema = SchemaFactory.createForClass(ActivityLog);
