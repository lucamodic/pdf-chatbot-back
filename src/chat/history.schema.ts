import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type HistoryDocument = ChatHistory & Document;

@Schema({ timestamps: true })
export class ChatHistory {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ required: true }) question: string;
  @Prop({ required: true }) answer: string;

  @Prop({
    type: [{ chunkId: String, heading: String, snippet: String }],
    default: [],
  })
  sources: { chunkId: string; heading: string; snippet: string }[];
}

export const ChatHistorySchema = SchemaFactory.createForClass(ChatHistory);
ChatHistorySchema.index({ userId: 1, createdAt: -1 });
