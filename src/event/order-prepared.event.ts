import { Trading } from "../app/trading";
import { desc } from "../util/util";

export class OrderPreparedEvent {

  public static readonly NAME: string = 'order.prepared';

  private readonly _message: string;

  constructor(
    private readonly trading: Trading
  ) {
    const { baseSymbol, quoteSymbol } = trading.contract;
    const message = trading.preparedOrders
      .sort((n1, n2) => desc(n1.price, n2.price))
      .map(o => o.toString())
      .join('\n')
    this._message = `[orders] submit ${baseSymbol}/${quoteSymbol}\n${message}`;
  }

  get message(): string {
    return this._message;
  }
}