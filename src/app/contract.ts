export class Contract {
  static readonly denomSymbolMap: Map<string, { denom: Denom, symbol: string, decimal: number }> =
    new Map<string, { denom: Denom, symbol: string, decimal: number }>();

  public readonly address: string;
  public readonly denoms: {
    base: Denom;
    quote: Denom;
  };

  public readonly is_bootstrapping: boolean;
  public readonly owner: string;
  public readonly price_precision: { decimal_places: number };
  public readonly decimal_delta: number;
  public readonly baseSymbol: string;
  public readonly quoteSymbol: string;

  constructor(data: any) {
    this.address = data.address;
    this.denoms = data.denoms;
    this.is_bootstrapping = data.is_bootstrapping;
    this.owner = data.owner;
    this.price_precision = data.price_precision;
    this.decimal_delta = data.decimal_delta;
    const [b, q] = Contract.getSymbol(this);
    this.baseSymbol = b;
    this.quoteSymbol = q;
  }

  get symbols() {
    return [this.baseSymbol, this.quoteSymbol];
  }

  get market() {
    return `${this.baseSymbol}/${this.quoteSymbol}`;
  }

  static getSymbol(contract: Contract): string[] {
    return [
      Contract.denomSymbolMap.get(contract.denoms.base).symbol,
      Contract.denomSymbolMap.get(contract.denoms.quote).symbol,
    ]
  }
}
