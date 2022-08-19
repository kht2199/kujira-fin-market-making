
export class OrderRequestDelta {

  private readonly _price: number;

  private readonly _base: number;

  private readonly _dq: number;

  private readonly _side: OrderSide;

  private readonly _rate: number;

  constructor(rate: number, marketPrice: number, baseAmount: number, quoteAmount: number, targetRate: number) {
    this._rate = rate;
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

  get dq(): number {
    return this._dq;
  }

  get side(): OrderSide {
    return this._side;
  }

  get rate(): number {
    return this._rate;
  }
}