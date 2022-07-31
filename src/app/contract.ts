export class Contract {
  public readonly address: string;
  public readonly denoms: {
    base: Denom;
    quote: Denom;
  };
  public readonly is_bootstrapping: boolean;
  public readonly owner: string;
  public readonly price_precision: { decimal_places: number };
  public readonly decimal_delta: number;

  constructor(data: any) {
    this.address = data.address;
    this.denoms = data.denoms;
    this.is_bootstrapping = data.is_bootstrapping;
    this.owner = data.owner;
    this.price_precision = data.price_precision;
    this.decimal_delta = data.decimal_delta;
  }

}