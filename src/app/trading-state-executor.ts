import { Trading } from "./trading";
import { asc, desc, removeItemsFromIds } from "../util/util";
import { KujiraService } from "../kujira/kujira.service";
import { KujiraClientService } from "../kujira/kujira-client-service";
import { Logger } from "@nestjs/common";
import { TradingState } from "./trading-state";
import { TradingOrders } from "./trading-orders";
import { Contract } from "./contract";

const orderRequestToString = (o: OrderRequest, baseSymbol: string, quoteSymbol, contract: Contract) => {
  return `${o.side} ${o.amount.toFixed(4)} ${o.side === 'Sell' ? baseSymbol : quoteSymbol} at ${o.price.toFixed(contract.price_precision.decimal_places)} ${quoteSymbol}`
}

const orderToString = (o: Order, baseSymbol: string, quoteSymbol: string) => {
  return `${o.side} ${o.filled_amount} ${o.side === 'Sell' ? baseSymbol : quoteSymbol} at ${o.quote_price} ${quoteSymbol}`
}

export class TradingStateExecutor {
  private static readonly logger = new Logger(TradingStateExecutor.name);

  private constructor() {}

  /**
   * @param trading
   * @param kujira
   * @param client TODO remove client dependency at TradingState
   */
  static async next(trading: Trading, kujira: KujiraService, client: KujiraClientService) {
    const { state, wallet, contract, deltaRates } = trading;
    const [baseSymbol, quoteSymbol] = kujira.getSymbol(contract);
    let { targetRate } = trading;
    let currentOrders: TradingOrders;
    let message: string;
    let marketPrice: number;
    let balanceRate: number;
    switch (state) {
      case TradingState.INITIALIZE:
        marketPrice = await client.getMarketPrice(wallet, contract);
        trading.balance = await kujira.fetchBalances(wallet, contract);
        balanceRate = trading.balance.calculateRate(marketPrice);
        if (!targetRate) {
          targetRate = trading.targetRate = balanceRate;
        }
        if (Math.abs(balanceRate - targetRate) > Math.max(...deltaRates.map(r => Math.abs(r)))) {
          throw new Error(`current wallet ratio [${balanceRate}] must less than config TARGET_RATE`);
        }
        currentOrders = await kujira.fetchOrders(trading);
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
        marketPrice = await client.getMarketPrice(wallet, contract);
        trading.balance = await kujira.fetchBalances(wallet, contract);
        const { baseAmount, quoteAmount} = trading.balance;
        const value = trading.balance.calculateValue(marketPrice).toFixed(5);
        balanceRate = trading.balance.calculateRate(marketPrice);
        message = `[stat] valuation(quote * base / market): ${(baseAmount * quoteAmount / marketPrice).toFixed(5)}\ntotal balance: ${value} ${quoteSymbol}\nmarket price:${marketPrice}\nbalance base: ${baseAmount.toFixed(5)} ${baseSymbol}\nbalance quote: ${quoteAmount.toFixed(5)} ${quoteSymbol}\nbalance rate: ${balanceRate.toFixed(5)}\ntarget rate: ${targetRate.toFixed(5)}`;
        kujira.sendMessage(message);
        TradingStateExecutor.logger.debug(message)
        let tps: OrderMarketMaking[] = deltaRates
          .map(r => kujira.toOrderMarketMaking(r, marketPrice, baseAmount, quoteAmount, targetRate))
          .filter(o => Math.abs(o.dq) >= trading.orderAmountMin);
        const notNormal = tps.filter(tp => !tp.normal);
        if (notNormal.length > 0) {
          TradingStateExecutor.logger.warn(`[price] found gap between market price{${marketPrice}} and order price{${notNormal[0].price}}`)
          TradingStateExecutor.logger.warn(`[orders] prepared: ${JSON.stringify(tps)}`)
        }
        const sellOrders = tps.filter(tp => tp.side === 'Sell')
          .sort((n1, n2) => asc(n1.price, n2.price));
        const buyOrders = tps.filter(tp => tp.side === 'Buy')
          .sort((n1, n2) => desc(n1.price, n2.price));
        trading.preparedOrders = [...kujira.toOrderRequests(contract, sellOrders), ...kujira.toOrderRequests(contract, buyOrders)]
          .filter(o => o.amount !== 0);
        if (trading.preparedOrders.length === 0) {
          this.logger.log('prepared orders empty');
          return;
        }
        trading.state = TradingState.ORDER_PREPARED;
        return;
      case TradingState.ORDER_PREPARED:
        TradingStateExecutor.logger.log(`[orders] ${JSON.stringify(trading.preparedOrders)}`);
        await client.orders(wallet, trading.preparedOrders);
        message = trading.preparedOrders
          .sort((n1, n2) => desc(n1.price, n2.price))
          .map(o => orderRequestToString(o, baseSymbol, quoteSymbol, contract))
          .join('\n');
        kujira.sendMessage(`[orders] submit\n${message}`);
        trading.state = TradingState.ORDER_CHECK;
        return;
      case TradingState.ORDER_CHECK:
        marketPrice = await client.getMarketPrice(wallet, contract);
        if (!trading.isChangedPrice(marketPrice)) {
          return;
        }
        trading.lastMarketPrice = marketPrice;
        currentOrders = await kujira.fetchOrders(trading);
        if (currentOrders.length === 0) {
          trading.state = TradingState.ORDER;
          return;
        }
        const fulfilledOrderIds = currentOrders.fulfilledOrders.map(o => o.idx);
        if (fulfilledOrderIds.length !== trading.fulfilledOrders.length) {
          const fulfilledOrdersForMessage = removeItemsFromIds(trading.fulfilledOrders, fulfilledOrderIds);
          if (fulfilledOrdersForMessage.length > 0) {
            this.logger.log(JSON.stringify(fulfilledOrdersForMessage));
            const message = fulfilledOrdersForMessage.map(o => orderToString(o, baseSymbol, quoteSymbol)).join('\n');
            kujira.sendMessage(`[orders] filled: ${message}`);
          }
          trading.fulfilledOrders = currentOrders.fulfilledOrders;
        }
        if (currentOrders.lengthFulfilled >= currentOrders.length / 2) {
          trading.state = TradingState.CLOSE_ORDERS;
          return;
        }

        if (currentOrders.isRemainsOneSide) {
          const percent = currentOrders.calculateMinimumPriceGapPercentOfUnfilled(marketPrice);
          if (percent > 0.05) {
            TradingStateExecutor.logger.warn(`[order state] market price: ${marketPrice} percent: ${percent}`);
            trading.state = TradingState.ORDER_EMPTY_SIDE_WITH_GAP;
            return;
          }
        }
        TradingStateExecutor.logger.log(`[order state] idxs: ${currentOrders.orderIds.join(',')} fulfilled: ${currentOrders.lengthFulfilled}`)
        return;
      case TradingState.ORDER_EMPTY_SIDE_WITH_GAP:
      case TradingState.CLOSE_FOR_STOP:
      case TradingState.CLOSE_ORDERS:
        currentOrders = await kujira.fetchOrders(trading);
        if (currentOrders.lengthFilled > 0) {
          const filledOrder: Order[] = currentOrders.filledOrders;
          message = `[orders] withdraw: ${filledOrder.map(o => o.idx).join(',')}`;
          TradingStateExecutor.logger.log(message);
          await client.ordersWithdraw(wallet, contract, filledOrder);
          kujira.sendMessage(message);
        }
        if (currentOrders.lengthUnfulfilled > 0) {
          const unfulfilledOrders: Order[] = currentOrders.unfulfilledOrders;
          message = `[orders] cancel: ${unfulfilledOrders.map(o => o.idx).join(',')}`;
          TradingStateExecutor.logger.log(message);
          await client.ordersCancel(wallet, contract, unfulfilledOrders);
          kujira.sendMessage(message);
        }
        if (state === TradingState.CLOSE_FOR_STOP) {
          trading.state = TradingState.STOP;
          return
        }
        trading.state = TradingState.ORDER;
        return;
    }
  }
}