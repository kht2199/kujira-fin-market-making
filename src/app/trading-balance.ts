
export class TradingBalance {

  private readonly _baseAmount: number;

  private readonly _quoteAmount: number;

  constructor(
    public base: Balance, public quote: Balance
  ) {
    this._baseAmount = Number(this.base.amount);
    this._quoteAmount = Number(this.quote.amount);
  }

  public calculateRate(marketPrice: number): number {
    const baseValue = this._baseAmount * marketPrice;
    const totalValue = baseValue + this._quoteAmount;
    return baseValue / totalValue;
  }

  public calculateValue(marketPrice: number): number {
    const baseValue = this._baseAmount * marketPrice;
    return baseValue + this._quoteAmount;
  }

  get baseAmount(): number {
    return this._baseAmount;
  }

  get quoteAmount(): number {
    return this._quoteAmount;
  }
}