import { ClientState, Trading } from "./trading";
import { asc, desc } from "../util/util";
import { KujiraService } from "../kujira/kujira.service";
import { KujiraClientService } from "../kujira/kujira-client-service";
import { Logger } from "@nestjs/common";

export class TradingState {
  private static readonly logger = new Logger(TradingState.name);

  static async next(trading: Trading, kujira: KujiraService, client: KujiraClientService) {
    const { state, wallet, contract, deltaRates, preparedOrders, baseSymbol, quoteSymbol } = trading;
    let { targetRate } = trading;
    let currentOrders;
    let message;
    let marketPrice: number;
    switch (state) {
      case ClientState.INITIALIZE:
        marketPrice = await client.getMarketPrice(wallet, contract);
        trading.balance = await kujira.fetchBalances(trading);
        const balanceRate = trading.balance.calculateRate(marketPrice);
        if (!targetRate) {
          targetRate = trading.targetRate = balanceRate;
        }
        if (Math.abs(balanceRate - targetRate) >= deltaRates[0]) {
          throw new Error(`current rate[${balanceRate}] is greater than config rate[${deltaRates[0]}].`);
        }
        // 진행중인 주문이 있으면, ORDER_CHECK 로 변경한다.
        currentOrders = await kujira.fetchOrders(trading);
        if (currentOrders.length === 1) {
          trading.state = ClientState.CANCEL_ALL_ORDERS;
          return;
        } else if (currentOrders.length > 1) {
          trading.state = ClientState.ORDER_CHECK;
          return;
        }
        trading.state = ClientState.ORDER;
        return;
      case ClientState.ORDER:
        // TODO market price caching.
        marketPrice = await client.getMarketPrice(wallet, contract);
        trading.balance = await kujira.fetchBalances(trading);
        const { baseAmount, quoteAmount } = trading.balance;
        TradingState.logger.debug(`delta: ${deltaRates}, base: ${baseAmount}, quote: ${quoteAmount}, target: ${targetRate}`);
        let tps: OrderMarketMaking[] = deltaRates
          .map(r => [r, -r]).flat()
          .map(r => kujira.toOrderMarketMaking(r, marketPrice, baseAmount, quoteAmount, targetRate));
        const notNormal = tps.filter(tp => !tp.normal);
        if (notNormal.length > 0) {
          TradingState.logger.warn(`[price] found gap between market price{${marketPrice}} and order price{${notNormal[0].price}}`)
          TradingState.logger.warn(`[orders] prepared: ${JSON.stringify(tps)}`)
        }
        // 주문수량의 주문정보{o}를 생성한다.
        const sellOrders = tps.filter(tp => tp.side === 'Sell')
          .sort((n1, n2) => asc(n1.price, n2.price));
        const buyOrders = tps.filter(tp => tp.side === 'Buy')
          .sort((n1, n2) => desc(n1.price, n2.price));
        trading.addPreparedOrders(kujira.toOrderRequests(contract, sellOrders));
        trading.addPreparedOrders(kujira.toOrderRequests(contract, buyOrders));
        trading.state = ClientState.ORDER_PREPARED;
        return this.next(trading, kujira, client);
      case ClientState.ORDER_PREPARED:
        TradingState.logger.log(`[orders] ${JSON.stringify(preparedOrders)}`);
        await client.orders(wallet, preparedOrders);
        message = preparedOrders
          .sort((n1, n2) => desc(n1.price, n2.price))
          .map(o => `${o.side} ${o.amount.toFixed(4)} ${o.side === 'Sell' ? baseSymbol : quoteSymbol} at ${o.price.toFixed(contract.price_precision.decimal_places)} ${quoteSymbol}`).join('\n');
        kujira.sendMessage(`[orders] submit\n${message}`);
        trading.state = ClientState.ORDER_CHECK;
        trading.preparedOrders = [];
        return;
      case ClientState.ORDER_CHECK:
        currentOrders = await kujira.fetchOrders(trading);
        if (currentOrders.length === 0) {
          trading.state = ClientState.ORDER;
          return;
        }
        // 진행중인 주문이 있는 경우, {n}개의 주문이 완료됨을 기다린다.
        if (currentOrders.lengthFulfilled >= currentOrders.length / 2) {
          trading.state = ClientState.FULFILLED_ORDERS;
          return;
        }

        if (currentOrders.isRemainsOneSide) {
          marketPrice = await client.getMarketPrice(wallet, contract);
          const percent = currentOrders.calculateMinimumPriceGapPercentOfUnfilled(marketPrice);
          if (percent > 0.02) {
            TradingState.logger.warn(`[order state] market price: ${marketPrice} percent: ${percent}`);
            trading.state = ClientState.ORDER_EMPTY_SIDE_WITH_GAP;
            return;
          }
        }
        TradingState.logger.log(`[order state] idxs: ${currentOrders.orderIds.join(',')} fulfilled: ${currentOrders.lengthFulfilled}`)
        return;
      case ClientState.ORDER_EMPTY_SIDE_WITH_GAP:
      case ClientState.FULFILLED_ORDERS:
      case ClientState.CANCEL_ALL_ORDERS:
        currentOrders = await kujira.fetchOrders(trading);
        if (currentOrders.lengthFilled > 0) {
          const filledOrder: Order[] = currentOrders.filledOrders;
          message = `[orders] withdraw: ${filledOrder.map(o => o.idx).join(',')}`;
          TradingState.logger.log(message);
          await client.ordersWithdraw(wallet, contract, filledOrder);
          kujira.sendMessage(message);
        }
        if (currentOrders.lengthUnfilled > 0) {
          const unfulfilledOrders: Order[] = currentOrders.unfulfilledOrders;
          message = `[orders] cancel: ${unfulfilledOrders.map(o => o.idx).join(',')}`;
          TradingState.logger.log(message);
          await client.ordersCancel(wallet, contract, unfulfilledOrders);
          kujira.sendMessage(message);
        }
        trading.state = ClientState.ORDER;
        return;
      case ClientState.WAITING_ALL_ORDER_COMPLETE:
        currentOrders = await kujira.fetchOrders(trading);
        if (currentOrders.isEmpty) {
          trading.state = ClientState.ORDER;
          return;
        }
        if (currentOrders.isAllClosedOrdersEmpty) {
          trading.state = ClientState.FULFILLED_ORDERS;
        }
        return;
    }
  }
}