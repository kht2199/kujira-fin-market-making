// noinspection JSMismatchedCollectionQueryUpdate

import { Logger } from "@nestjs/common";
import { KujiraService } from "../kujira.service";
import { v4 as uuid } from "uuid";
import { asc, desc } from "../util/util";
import { KujiraClientService } from "../client/kujira-client-service";

enum ClientState {
  INITIALIZE = 'INITIALIZE',
  ORDER = 'ORDER',
  ORDER_PREPARED = 'ORDER_PREPARED',
  FULFILLED_ORDERS = 'FULFILLED_ORDERS',
  ORDER_EMPTY_SIDE_WITH_GAP = 'ORDER_EMPTY_SIDE_WITH_GAP',
  CANCEL_ALL_ORDERS = 'CANCEL_ALL_ORDERS',
  ORDER_CHECK = 'ORDER_CHECK',
  WAITING_ALL_ORDER_COMPLETE = 'WAITING_ALL_ORDER_COMPLETE',
}

export class Trading {
  private readonly logger = new Logger(Trading.name);

  readonly uuid: string;

  private _state: ClientState = ClientState.INITIALIZE;

  private balance: TradingBalance;

  public ongoing: boolean = false;

  private _targetRate: number | undefined;

  private currentOrders: TradingOrders;

  private preparedOrders: OrderRequest[] = [];

  constructor(
    private readonly _service: KujiraClientService,
    private readonly _kujira: KujiraService,
    private readonly baseSymbol: string,
    private readonly quoteSymbol: string,
    private _wallet: Wallet,
    private _contract: Contract,
    private _deltaRates: number[],
    _targetRate?: number,
  ) {
    this.uuid = uuid().slice(0, 5);
    this._targetRate = _targetRate;
  }

  async next() {
    let message;
    let marketPrice: number;
    switch (this._state) {
      case ClientState.INITIALIZE:
        marketPrice = await this.getMarketPrice();
        await this.fetchBalances(marketPrice);
        const balanceRate = this.balance.calculateRate(marketPrice);
        if (!this._targetRate) {
          this._targetRate = balanceRate;
        }
        if (Math.abs(balanceRate - this._targetRate) >= this._deltaRates[0]) {
          throw new Error(`current rate[${balanceRate}] is greater than config rate[${this._deltaRates[0]}].`);
        }
        // 진행중인 주문이 있으면, ORDER_CHECK 로 변경한다.
        await this.fetchOrders();
        if (this.currentOrders.length === 1) {
          this._state = ClientState.CANCEL_ALL_ORDERS;
          return;
        } else if (this.currentOrders.length > 1) {
          this._state = ClientState.ORDER_CHECK;
          return;
        }
        this._state = ClientState.ORDER;
        return;
      case ClientState.ORDER:
        // TODO market price caching.
        marketPrice = await this.getMarketPrice();
        await this.fetchBalances(marketPrice)
        const base = +this.balance.baseAmount;
        const quote = +this.balance.quoteAmount;
        this.logger.debug(`delta: ${this._deltaRates}, base: ${base}, quote: ${quote}, target: ${this._targetRate}`);
        let tps: OrderMarketMaking[] = this._deltaRates
          .map(r => [r, -r]).flat()
          .map(r => Trading.toOrderMarketMaking(r, marketPrice, base, quote, this._targetRate));
        const notNormal = tps.filter(tp => !tp.normal);
        if (notNormal.length > 0) {
          this.logger.warn(`[price] found gap between market price{${marketPrice}} and order price{${notNormal[0].price}}`)
          this.logger.warn(`[orders] prepared: ${JSON.stringify(tps)}`)
        }
        // 주문수량의 주문정보{o}를 생성한다.
        const sellOrders = tps.filter(tp => tp.side === 'Sell')
          .sort((n1, n2) => asc(n1.price, n2.price));
        const buyOrders = tps.filter(tp => tp.side === 'Buy')
          .sort((n1, n2) => desc(n1.price, n2.price));
        this.preparedOrders = [
          ...this.toOrderRequests(this._contract, sellOrders),
          ...this.toOrderRequests(this._contract, buyOrders)
        ];
        this._state = ClientState.ORDER_PREPARED;
        return this.next();
      case ClientState.ORDER_PREPARED:
        this.logger.log(`[orders] ${JSON.stringify(this.preparedOrders)}`);
        await this._service.orders(this._wallet, this.preparedOrders);
        message = this.preparedOrders
          .sort((n1, n2) => desc(n1.price, n2.price))
          .map(o => `${o.side} ${o.amount.toFixed(4)} ${o.side === 'Sell' ? this.baseSymbol : this.quoteSymbol} at ${o.price.toFixed(this._contract.price_precision.decimal_places)} ${this.quoteSymbol}`).join('\n');
        this._kujira.sendMessage(`[orders] submit\n${message}`);
        this._state = ClientState.ORDER_CHECK;
        this.preparedOrders = [];
        return;
      case ClientState.ORDER_CHECK:
        await this.fetchOrders();
        if (this.currentOrders.length === 0) {
          this._state = ClientState.ORDER;
          return;
        }
        // 진행중인 주문이 있는 경우, {n}개의 주문이 완료됨을 기다린다.
        if (this.currentOrders.lengthFulfilled >= this.currentOrders.length / 2) {
          this._state = ClientState.FULFILLED_ORDERS;
          return;
        }

        if (this.currentOrders.isRemainsOneSide) {
          marketPrice = await this.getMarketPrice();
          const percent = this.currentOrders.calculateMinimumPriceGapPercentOfUnfilled(marketPrice);
          if (percent > 0.02) {
            this.logger.warn(`[order state] market price: ${marketPrice} percent: ${percent}`);
            this._state = ClientState.ORDER_EMPTY_SIDE_WITH_GAP;
            return;
          }
        }
        this.logger.log(`[order state] idxs: ${this.currentOrders.orderIds.join(',')} fulfilled: ${this.currentOrders.lengthFulfilled}`)
        return;
      case ClientState.ORDER_EMPTY_SIDE_WITH_GAP:
      case ClientState.FULFILLED_ORDERS:
      case ClientState.CANCEL_ALL_ORDERS:
        await this.fetchOrders();
        if (this.currentOrders.lengthFilled > 0) {
          const filledOrder: Order[] = this.currentOrders.filledOrders;
          message = `[orders] withdraw: ${filledOrder.map(o => o.idx).join(',')}`;
          this.logger.log(message);
          await this._service.ordersWithdraw(this._wallet, this._contract, filledOrder);
          this._kujira.sendMessage(message);
        }
        if (this.currentOrders.lengthUnfilled > 0) {
          const unfulfilledOrders: Order[] = this.currentOrders.unfulfilledOrders;
          message = `[orders] cancel: ${unfulfilledOrders.map(o => o.idx).join(',')}`;
          this.logger.log(message);
          await this._service.ordersCancel(this._wallet, this._contract, unfulfilledOrders);
          this._kujira.sendMessage(message);
        }
        this._state = ClientState.ORDER;
        return;
      case ClientState.WAITING_ALL_ORDER_COMPLETE:
        await this.fetchOrders()
        if (this.currentOrders.isEmpty) {
          this._state = ClientState.ORDER;
          return;
        }
        if (this.currentOrders.isAllClosedOrdersEmpty) {
          this._state = ClientState.FULFILLED_ORDERS;
        }
        return;
    }
  }

  async fetchOrders(): Promise<void> {
    this.currentOrders = new TradingOrders(await this._service.getOrders(this._wallet, this._contract))
  }

  async fetchBalances(marketPrice: number) {
    const balances = await this._service.getBalances(
      this._wallet,
      this._contract,
    );
    const base = balances.filter((b) => b.denom === this._contract.denoms.base)[0];
    const quote = balances.filter((b) => b.denom === this._contract.denoms.quote)[0];
    if (!base) {
      const message = `invalid base balance: ${this._contract.denoms.base}`;
      throw new Error(message);
    }
    if (!quote) {
      const message = `invalid quote balance: ${this._contract.denoms.quote}`;
      throw new Error(message);
    }
    this.balance = new TradingBalance(base, quote, this.baseSymbol, this.quoteSymbol);
    this.logger.log(`[balances] base/quote: ${this.balance.baseAmount}${this.baseSymbol}/${this.balance.quoteAmount}${this.quoteSymbol}, balanceRate: ${this.balance.calculateRate(marketPrice)}, targetRate: ${this._targetRate}`);
  }

  async getMarketPrice() {
    const orders = await this._service.books(this._wallet, this._contract, {
      limit: 1,
    });
    if (orders.base.length !== 1) throw new Error('orders.base.length !== 1');
    if (orders.quote.length !== 1) throw new Error('orders.quote.length !== 1');
    const base = Number(orders.base[0].quote_price);
    const quote = Number(orders.quote[0].quote_price);
    const marketPrice = (base + quote) / 2;
    this.logger.log(`[market] price: ${marketPrice}`)
    return marketPrice;
  }

  toOrderRequests(contract: Contract, orders: OrderMarketMaking[]): OrderRequest[] {
    let prevQuantities = 0;
    return orders
      .map(o => {
        const quantity = Math.abs(o.dq) - prevQuantities;
        const o2 = {
          ...o,
          dq: quantity
        };
        prevQuantities += quantity;
        return o2;
      })
      .map(o => {
        const amount = Math.abs(o.side === 'Sell' ? o.dq : (o.dq * o.price));
        return {
          uuid: uuid(),
          contract,
          side: o.side,
          price: o.price,
          amount,
        }
      });
  }

  public static toOrderMarketMaking(rate: number, marketPrice: number, baseQuantity: number, quoteQuantity: number, targetRate: number): OrderMarketMaking {
    // 자산비율이 주문비율{1%,2%}에 해당하는 목표가격을 {tp1, tp2} 찾는다.
    const price = marketPrice + marketPrice * rate;
    // 주문비율의 가격에서 변동자산가치를{tot1, tot2} 계산한다.
    const tot = baseQuantity * price + quoteQuantity;
    // 변동자산가치에서 목표비율을 곱해 목표가의 갯수를{base}를 계산한다.
    const base = tot * targetRate / price;
    // 목표수량과 현재 수량만큼의 차이인 주문수량{dq1, dq2} 계산한다.
    const dq = base - baseQuantity;
    // 부호가 다르면, 가격 이격이 발생.
    const normal = rate * dq < 0;
    return { price, base, dq, normal, side: dq > 0 ? 'Buy' : 'Sell'};
  }

  get state(): ClientState {
    return this._state;
  }

}
