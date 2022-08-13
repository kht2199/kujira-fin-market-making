import { Injectable, Logger } from "@nestjs/common";
import { TelegramService } from "nestjs-telegram";
import { OnEvent } from "@nestjs/event-emitter";
import { MessageEvent } from "../event/message.event";
import { OrderFilledEvent } from "../event/order-filled.event";
import { TradingService } from "./trading.service";
import { OrderPrepareEvent } from "../event/order-prepare.event";
import { WalletService } from "./wallet.service";
import { OrderPreparedEvent } from "../event/order-prepared.event";

@Injectable()
export class EventService {
  private readonly logger = new Logger(EventService.name);

  private CHAT_ID: string = process.env.TELEGRAM_CHAT_ID;

  constructor(
    private readonly telegram: TelegramService,
    private readonly tradingService: TradingService,
    private readonly walletService: WalletService,
  ) {
  }

  @OnEvent(OrderPreparedEvent.NAME)
  async handleOrderPreparedEvent(payload: OrderPreparedEvent) {
    this.sendMessage(payload.message);
  }

  @OnEvent(OrderPrepareEvent.NAME)
  async handleOrderPrepareEvent(payload: OrderPrepareEvent) {
    const { trading, marketPrice } = payload;
    const { balance, contract } = trading;
    const { baseAmount, quoteAmount } = balance;
    const totalValue = baseAmount * marketPrice + quoteAmount;
    const balanceRate = trading.balance.calculateRate(marketPrice);
    const [base, quote] = contract.symbols;
    const stat = {
      totalValue,
      balanceRate,
      base,
      baseAmount,
      quoteAmount,
      quote,
      marketPrice,
    };
    await this.walletService.addStat(stat);
    this.sendMessage(payload.message);
  }

  @OnEvent(OrderFilledEvent.NAME)
  async handleOrderFilledEvent(payload: OrderFilledEvent) {
    await this.tradingService.addFilledOrderHistory(payload.trading, payload.filledOrders);
    this.sendMessage(payload.message);
  }

  @OnEvent(MessageEvent.NAME)
  handleMessageEvent(payload: MessageEvent) {
    this.logger.debug(payload);
    this.sendMessage(payload.message);
  }

  sendMessage(message: string) {
    if (!this.CHAT_ID) {
      return;
    }
    this.telegram.sendMessage({ chat_id: this.CHAT_ID, text: message }).subscribe({
      error: e => this.logger.error(JSON.stringify(e))
    });
  }
}