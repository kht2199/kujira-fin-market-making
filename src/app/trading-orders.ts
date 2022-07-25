
export class TradingOrders {

  private readonly _fulfilledOrders: Order[];

  private readonly _unfulfilledOrders: Order[];

  private readonly _unfulfilledSellOrders: Order[];

  private readonly _unfulfilledBuyOrders: Order[];

  private readonly _filledOrders: Order[];

  constructor(private orders: Order[]) {
    this._fulfilledOrders = orders.filter(o => o.state === 'Closed');
    this._filledOrders = orders.filter(o => o.state === 'Closed' || o.state === 'Partial');
    this._unfulfilledOrders = orders.filter(o => o.state !== 'Closed');
    this._unfulfilledBuyOrders = this._unfulfilledOrders.filter(o => o.side == 'Buy');
    this._unfulfilledSellOrders = this._unfulfilledOrders.filter(o => o.side == 'Sell');
  }

  get isRemainsOneSide(): boolean {
    if (this._unfulfilledOrders.length === 0) {
      return false;
    }
    return this._unfulfilledBuyOrders.length === 0 || this._unfulfilledSellOrders.length === 0;
  }

  get length(): number {
    return this.orders.length;
  }

  get lengthFilled(): number {
    return this._filledOrders.length;
  }

  get lengthFulfilled(): number {
    return this._fulfilledOrders.length;
  }

  get lengthUnfulfilled(): number {
    return this._unfulfilledOrders.length;
  }

  get isEmpty(): boolean {
    return this.orders.length === 0;
  }

  get orderIds(): string[] {
    return this.orders.map(o => o.idx);
  }

  // noinspection JSUnusedGlobalSymbols
  get fulfilledOrders(): Order[] {
    return this._fulfilledOrders;
  }

  get unfulfilledOrders(): Order[] {
    return this._unfulfilledOrders;
  }

  get filledOrders(): Order[] {
    return this._filledOrders;
  }

  calculateMinimumPriceGapOfUnfilled(marketPrice: number): number {
    return Math.min(...this._unfulfilledOrders.map(o => Math.abs(+o.quote_price - marketPrice)))
  }

  /**
   * e.g. market 100usd, gap 3usd => 3 / 100 => 3%
   */
  calculateMinimumPriceGapPercentOfUnfilled(marketPrice: number): number {
    const gap = this.calculateMinimumPriceGapOfUnfilled(marketPrice);
    return Math.abs(marketPrice - gap) / marketPrice;
  }
}