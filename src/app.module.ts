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
import { PrismaService } from "./config/prisma.service";
import { WalletService } from "./service/wallet.service";
import { TradingService } from "./service/trading.service";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { EventService } from "./service/event.service";

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
    EventEmitterModule.forRoot(),
  ],
  controllers: [AppController, TradingsController, WalletsController],
  providers: [
    KujiraClientService, KujiraService,
    PrismaService, TasksService,
    WalletService, TradingService,
    EventService,
  ],
})
export class AppModule {}
