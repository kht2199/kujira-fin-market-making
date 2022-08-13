import { Contract } from "../app/contract";
import { Trading } from "../app/trading";

export class OrderFilledEvent {

  private readonly _message: string;

  constructor(
    public readonly trading: Trading,
    public readonly filledOrders: Order[]
  ) {
    const {baseSymbol, quoteSymbol} = trading.contract;
    this._message = `[orders] withdraw ${baseSymbol}/${quoteSymbol}: ${filledOrders.map(o => o.idx).join(',')}`;
  }

  public static NAME: string = 'order.filled';

  get message(): string {
    return this._message;
  }

}