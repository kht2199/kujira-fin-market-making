import { Trading } from "./trading";
import { asc, desc } from "../util/util";
import { KujiraService } from "../kujira/kujira.service";
import { Logger } from "@nestjs/common";
import { TradingState } from "./trading-state";
import { TradingOrders } from "./trading-orders";
import { OrderRequestDelta } from "./order-request-delta";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { MessageEvent } from "../event/message.event";
import { OrderFilledEvent } from "../event/order-filled.event";
import { OrderPrepareEvent } from "../event/order-prepare.event";
import { OrderPreparedEvent } from "../event/order-prepared.event";

const orderToString = (o: Order, baseSymbol: string, quoteSymbol: string) => {
  return `${o.side} ${o.original_offer_amount} ${o.side === 'Sell' ? baseSymbol : quoteSymbol} at ${o.quote_price} ${quoteSymbol}`
}

export class TradingStateExecutor {
  private readonly logger = new Logger(TradingStateExecutor.name);

  constructor(
    private readonly emitter: EventEmitter2,
  ) {}

  async next(trading: Trading, kujira: KujiraService) {
    const { state, wallet, contract, deltaRates, targetRate } = trading;
    const [baseSymbol, quoteSymbol] = contract.symbols;
    let currentOrders: TradingOrders;
    let marketPrice: number;
    if (trading.sleepIntervals > 0) {
      --trading.sleepIntervals;
      return;
    }
    switch (state) {
      case TradingState.INITIALIZE:
        marketPrice = await kujira.getMarketPrice(wallet, contract);
        trading.balance = await kujira.getTradingBalance(wallet, contract);
        currentOrders = await kujira.getOrders(trading);
        if (currentOrders.length === 1) {
          trading.state = TradingState.CLOSE_ORDERS;
          return;
        } else if (currentOrders.length > 1) {
          trading.state = TradingState.ORDER_CHECK;
          trading.fulfilledOrders = currentOrders.fulfilledOrders;
          return;
        }
        trading.state = TradingState.ORDER;
        return;
      case TradingState.ORDER:
        currentOrders = await kujira.getOrders(trading);
        if (currentOrders.length >= 1) {
          trading.state = TradingState.CLOSE_ORDERS;
          return;
        }
        marketPrice = await kujira.getMarketPrice(wallet, contract);
        trading.balance = await kujira.getTradingBalance(wallet, contract);
        trading.preparedOrders = kujira.createOrderRequests(trading, marketPrice);
        if (trading.preparedOrders.length === 0) {
          this.logger.warn('[orders] prepared orders empty');
          return;
        }
        this.emitter.emit(OrderPrepareEvent.NAME, new OrderPrepareEvent(trading, marketPrice));
        trading.state = TradingState.ORDER_PREPARED;
        return;
      case TradingState.ORDER_PREPARED:
        await kujira.orders(wallet, trading.preparedOrders);
        this.emitter.emit(OrderPreparedEvent.NAME, new OrderPreparedEvent(trading));
        trading.state = TradingState.ORDER_CHECK;
        return;
      case TradingState.ORDER_CHECK:
        marketPrice = await kujira.getMarketPrice(wallet, contract);
        if (!trading.isChangedPrice(marketPrice)) {
          return;
        }
        trading.lastMarketPrice = marketPrice;
        currentOrders = await kujira.getOrders(trading);
        if (currentOrders.length === 0) {
          trading.state = TradingState.ORDER;
          return;
        }
        const fulfilledOrderIds = trading.fulfilledOrders.map(o => o.idx);
        if (fulfilledOrderIds.length !== currentOrders.fulfilledOrders.length) {
          const fulfilledOrdersFiltered = currentOrders.fulfilledOrders
            .filter(a => fulfilledOrderIds.indexOf(a.idx) === -1)
          if (fulfilledOrdersFiltered.length > 0) {
            const message = fulfilledOrdersFiltered
              .sort((o1, o2) => desc(+o1.quote_price, +o2.quote_price))
              .map(o => orderToString(o, baseSymbol, quoteSymbol))
              .join('\n');
            this.emitter.emit(MessageEvent.NAME, new MessageEvent(
              `[orders] filled ${baseSymbol}/${quoteSymbol}\n${message}`
            ));
          }
          trading.fulfilledOrders = currentOrders.fulfilledOrders;
        }
        if (currentOrders.lengthFulfilled >= currentOrders.length / 2) {
          // if schedule INTERVAL is 10_000, sleep for 3 * 10 seconds.
          trading.sleepIntervals = 3;
          trading.state = TradingState.CLOSE_ORDERS;
          return;
        }

        if (currentOrders.isRemainsOneSide) {
          const percent = currentOrders.calculateMinimumPriceGapPercentOfUnfilled(marketPrice);
          if (percent > 0.03) {
            this.logger.warn(`[order] market price: ${marketPrice} percent: ${percent}`);
            trading.state = TradingState.ORDER_EMPTY_SIDE_WITH_GAP;
            return;
          }
        }
        this.logger.log(`[order] idxs ${baseSymbol}/${quoteSymbol}: ${currentOrders.orderIds.join(',')} fulfilled: ${currentOrders.lengthFulfilled}`)
        return;
      case TradingState.ORDER_EMPTY_SIDE_WITH_GAP:
      case TradingState.CLOSE_FOR_STOP:
      case TradingState.CLOSE_ORDERS:
        currentOrders = await kujira.getOrders(trading);
        if (currentOrders.lengthFilled > 0) {
          const filledOrders: Order[] = currentOrders.filledOrders;
          await kujira.ordersWithdraw(wallet, contract, filledOrders);
          this.emitter.emit(OrderFilledEvent.NAME, new OrderFilledEvent(trading, filledOrders));
        }
        if (currentOrders.lengthUnfulfilled > 0) {
          const unfulfilledOrders: Order[] = currentOrders.unfulfilledOrders;
          await kujira.ordersCancel(wallet, contract, unfulfilledOrders);
          this.emitter.emit(MessageEvent.NAME, new MessageEvent(
            `[orders] cancel ${baseSymbol}/${quoteSymbol}: ${unfulfilledOrders.map(o => o.idx).join(',')}`
          ));
        }
        if (state === TradingState.CLOSE_FOR_STOP) {
          trading.state = TradingState.STOP;
          return;
        }
        trading.state = TradingState.ORDER;
        return;
    }
  }
}