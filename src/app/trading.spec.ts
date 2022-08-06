import { Test, TestingModule } from "@nestjs/testing";
import { KujiraService } from "../kujira/kujira.service";
import { HttpModule } from "@nestjs/axios";
import { ConfigModule } from "@nestjs/config";
import { TelegramModule } from "nestjs-telegram";
import { KujiraClientService } from "../kujira/kujira-client-service";
import { OrderRequestDelta } from "./order-request-delta";
import { WalletService } from "../service/wallet.service";
import { TradingService } from "../service/trading.service";
import { PrismaService } from "../config/prisma.service";

describe("Trading.ts", () => {
  let service: KujiraService;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      imports: [
        HttpModule,
        ConfigModule.forRoot({
          envFilePath: [`.env.${process.env.NODE_ENV}`, '.env'],
        }),
        TelegramModule.forRoot({
          botKey: process.env.TELEGRAM_BOT
        }),
      ],
      providers: [KujiraClientService, KujiraService, WalletService, TradingService, PrismaService],
    }).compile();
    service = app.get<KujiraService>(KujiraService);
  });

  describe("시장가가 상승/하락시 주문정보", () => {
    const base = 10;
    const quote = 10;
    const marketPrice = 100;
    const targetRate = base * 100 / (base * 100 + quote);
    it("0.01 퍼센트 상위 가격인 101에서 매도주문이 발생해야한다", () => {
      let order = new OrderRequestDelta(0.01, marketPrice, base, quote, targetRate);
      expect(order).toMatchObject({ _price: 101, _side: "Sell" });
    });
    it("0.01 퍼센트 하위 가격인 99에서 매수주문이 발생해야한다", () => {
      let order = new OrderRequestDelta(-0.01, marketPrice, base, quote, targetRate);
      expect(order).toMatchObject({ _price: 99, _side: "Buy" });
    });
  });

  describe("지정가를 통해 비율 조회", () => {
    const price = 23.33;
    const base = 5;
    const quote = 100;
    const baseValue = price * base;
    const totalValue = baseValue + quote;
    expect(baseValue / totalValue).toEqual(0.5384260327717517);
  })
});
