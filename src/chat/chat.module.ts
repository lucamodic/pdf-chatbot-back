import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ChatHistory, ChatHistorySchema } from './history.schema';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';
import { HistoryService } from './history.service';
import { HistoryController } from './history.controller';
import { RagModule } from '../rag/rag.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: ChatHistory.name, schema: ChatHistorySchema }]),
    RagModule,
    AuthModule,
  ],
  providers: [ChatGateway, ChatService, HistoryService],
  controllers: [HistoryController],
})
export class ChatModule {}
