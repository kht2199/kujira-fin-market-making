
export class OrderRequestDelta {

  private readonly _price: number;

  private readonly _base: number;

  private readonly _side: OrderSide;

  constructor(rate: number, marketPrice: number, baseAmount: number, quoteAmount: number, targetRate: number) {
    this._price = marketPrice + marketPrice * rate;
    const totalVale = baseAmount * this._price + quoteAmount;
    this._side = baseAmount * this._price / totalVale > targetRate ? 'Sell' : 'Buy';
  }

  get price(): number {
    return this._price;
  }

  get base(): number {
    return this._base;
  }

  get side(): OrderSide {
    return this._side;
  }
}