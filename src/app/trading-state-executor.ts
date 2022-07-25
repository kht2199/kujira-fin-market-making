import { Trading } from "./trading";
import { asc, desc, removeItems } from "../util/util";
import { KujiraService } from "../kujira/kujira.service";
import { KujiraClientService } from "../kujira/kujira-client-service";
import { Logger } from "@nestjs/common";
import { TradingState } from "./trading-state";
import { TradingOrders } from "./trading-orders";

const orderRequestToString = (o: OrderRequest, baseSymbol: string, quoteSymbol, contract: Contract) => {
  return `${o.side} ${o.amount.toFixed(4)} ${o.side === 'Sell' ? baseSymbol : quoteSymbol} at ${o.price.toFixed(contract.price_precision.decimal_places)} ${quoteSymbol}`
}

const orderToString = (o: Order, baseSymbol: string, quoteSymbol) => {
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
    const { state, wallet, contract, deltaRates, baseSymbol, quoteSymbol } = trading;
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
        if (Math.abs(balanceRate - targetRate) >= deltaRates[0]) {
          throw new Error(`current rate[${balanceRate}] is greater than config rate[${deltaRates[0]}].`);
        }
        // 진행중인 주문이 있으면, ORDER_CHECK 로 변경한다.
        currentOrders = await kujira.fetchOrders(trading);
        if (currentOrders.length === 1) {
          trading.state = TradingState.CANCEL_ALL_ORDERS;
          return;
        } else if (currentOrders.length > 1) {
          trading.state = TradingState.ORDER_CHECK;
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
        message = `[stat] value: ${(baseAmount * quoteAmount).toFixed(5)} balance: ${value} ${quoteSymbol}, balance rate: ${balanceRate.toFixed(5)}, target rate: ${targetRate.toFixed(5)}, base: ${baseAmount.toFixed(5)} ${baseSymbol}, quote: ${quoteAmount.toFixed(5)} ${quoteSymbol}`;
        kujira.sendMessage(message);
        TradingStateExecutor.logger.debug(message)
        let tps: OrderMarketMaking[] = deltaRates
          .map(r => [r, -r])
          .map(arr => {
            arr.push(0);
            return arr;
          }).flat()
          .map(r => kujira.toOrderMarketMaking(r, marketPrice, baseAmount, quoteAmount, targetRate))
          .filter(o => Math.abs(o.dq) >= trading.orderAmountMin);
        const notNormal = tps.filter(tp => !tp.normal);
        if (notNormal.length > 0) {
          TradingStateExecutor.logger.warn(`[price] found gap between market price{${marketPrice}} and order price{${notNormal[0].price}}`)
          TradingStateExecutor.logger.warn(`[orders] prepared: ${JSON.stringify(tps)}`)
        }
        // 주문수량의 주문정보{o}를 생성한다.
        const sellOrders = tps.filter(tp => tp.side === 'Sell')
          .sort((n1, n2) => asc(n1.price, n2.price));
        const buyOrders = tps.filter(tp => tp.side === 'Buy')
          .sort((n1, n2) => desc(n1.price, n2.price));
        trading.preparedOrders = [...kujira.toOrderRequests(contract, sellOrders), ...kujira.toOrderRequests(contract, buyOrders)]
          .filter(o => o.amount !== 0);
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
        trading.preparedOrders = [];
        trading.fulfilledOrders = [];
        return;
      case TradingState.ORDER_CHECK:
        currentOrders = await kujira.fetchOrders(trading);
        if (currentOrders.length === 0) {
          trading.state = TradingState.ORDER;
          return;
        }
        const fulfilledOrderIds = currentOrders.fulfilledOrders.map(o => o.idx);
        if (fulfilledOrderIds.length !== trading.fulfilledOrders.length) {
          if (trading.fulfilledOrders.length > 0) {
            kujira.sendMessage(`[orders] filled: ${removeItems(trading.fulfilledOrders, fulfilledOrderIds).map(o => orderToString(o, baseSymbol, quoteSymbol)).join('\n')}`);
          }
          trading.fulfilledOrders = currentOrders.fulfilledOrders;
        }
        // 진행중인 주문이 있는 경우, {n}개의 주문이 완료됨을 기다린다.
        if (currentOrders.lengthFulfilled >= currentOrders.length / 2) {
          trading.state = TradingState.FULFILLED_ORDERS;
          return;
        }

        if (currentOrders.isRemainsOneSide) {
          marketPrice = await client.getMarketPrice(wallet, contract);
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
      case TradingState.FULFILLED_ORDERS:
      case TradingState.CANCEL_ALL_ORDERS:
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
        trading.state = TradingState.ORDER;
        return;
      case TradingState.WAITING_ALL_ORDER_COMPLETE:
        currentOrders = await kujira.fetchOrders(trading);
        if (currentOrders.isEmpty) {
          trading.state = TradingState.ORDER;
          return;
        }
        if (currentOrders.isAllClosedOrdersEmpty) {
          trading.state = TradingState.FULFILLED_ORDERS;
        }
        return;
    }
  }
}