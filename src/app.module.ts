import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { ScheduleModule } from "@nestjs/schedule";
import { TasksService } from "./scheduler/task.service";
import { ConfigModule } from "@nestjs/config";
import { HttpModule } from "@nestjs/axios";
import { KujiraService } from "./kujira/kujira.service";
import { TelegramModule } from "nestjs-telegram";
import { KujiraClientService } from "./kujira/kujira-client-service";
import { TradingsController } from "./tradings.controller";
import { WalletsController } from "./wallets.controller";
import { DatabaseService } from "./db/database.service";

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
  controllers: [AppController, TradingsController, WalletsController],
  providers: [TasksService, KujiraService, KujiraClientService, DatabaseService],
})
export class AppModule {}
