import { Trading } from "../app/trading";

export class OrderPrepareEvent {

  public static readonly NAME: string = 'order.prepare';

  private readonly _message: string;

  constructor(
    public readonly trading: Trading,
    public readonly marketPrice: number,
  ) {
    this._message = trading.toStringStat(marketPrice)
  }

  get message(): string {
    return this._message;
  }
}