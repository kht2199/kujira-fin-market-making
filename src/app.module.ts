import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { ScheduleModule } from "@nestjs/schedule";
import { TasksService } from "./scheduler/task.service";
import { ConfigModule } from "@nestjs/config";
import { HttpModule } from "@nestjs/axios";
import { KujiraService } from "./kujira/kujira.service";
import { TelegramModule } from "nestjs-telegram";
import { KujiraClientService } from "./kujira/kujira-client-service";

@Module({
  imports: [
    HttpModule,
    ScheduleModule.forRoot(),
    ConfigModule.forRoot({
      envFilePath: [`.env.${process.env.NODE_ENV}`, '.env'],
    }),
    TelegramModule.forRoot({
      botKey: process.env.TELEGRAM_BOT
    }),
  ],
  controllers: [AppController],
  providers: [TasksService, KujiraService, KujiraClientService],
})
export class AppModule {}
