
export class TradingBalance {

  public readonly baseAmount: number;

  public readonly quoteAmount: number;

  constructor(
    public base: Balance, public quote: Balance
  ) {
    this.baseAmount = Number(this.base.amount);
    this.quoteAmount = Number(this.quote.amount);
  }

  public calculateRate(marketPrice: number): number {
    const baseValue = this.baseAmount * marketPrice;
    const totalValue = baseValue + this.quoteAmount;
    return baseValue / totalValue;
  }

  public calculateValue(marketPrice: number): number {
    const baseValue = this.baseAmount * marketPrice;
    return baseValue + this.quoteAmount;
  }
}