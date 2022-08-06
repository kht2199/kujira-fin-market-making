import { v4 as uuid } from "uuid";
import { TradingBalance } from "./trading-balance";
import { TradingState } from "./trading-state";
import { Contract } from "./contract";
import { Wallet } from "./wallet";
import { OrderRequest } from "./order-request";

export class Trading {

  uuid: string;

  private _state: TradingState = TradingState.INITIALIZE;

  private _balance: TradingBalance;

  public ongoing: boolean = false;

  private _preparedOrders: OrderRequest[] = [];

  private _fulfilledOrders: Order[] = [];

  lastMarketPrice: number;

  constructor(
    private _wallet: Wallet,
    private _contract: Contract,
    private _deltaRates: number[],
    private _targetRate: number,
    private _orderAmountMin: number,
  ) {
    this.state = TradingState.STOP;
    this.uuid = uuid().slice(0, 6);
    this._targetRate = _targetRate;
  }

  isChangedPrice(marketPrice: number) {
    return this.lastMarketPrice !== marketPrice;
  }

  get state(): TradingState {
    return this._state;
  }

  set state(value: TradingState) {
    switch (value) {
      case TradingState.ORDER_CHECK:
        this.preparedOrders = [];
        this.fulfilledOrders = [];
        break;
    }
    this._state = value;
  }

  get wallet(): Wallet {
    return this._wallet;
  }

  get contract(): Contract {
    return this._contract;
  }

  get targetRate(): number | undefined {
    return this._targetRate;
  }

  set targetRate(value: number | undefined) {
    this._targetRate = value;
  }

  get deltaRates(): number[] {
    return this._deltaRates;
  }

  set deltaRates(value: number[]) {
    this._deltaRates = value;
  }

  set orderAmountMin(value: number) {
    this._orderAmountMin = value;
  }

  get balance(): TradingBalance {
    return this._balance;
  }

  set balance(value: TradingBalance) {
    this._balance = value;
  }

  get preparedOrders(): OrderRequest[] {
    return this._preparedOrders;
  }

  set preparedOrders(value: OrderRequest[]) {
    this._preparedOrders = value;
  }

  get orderAmountMin(): number {
    return this._orderAmountMin;
  }

  get fulfilledOrders(): Order[] {
    return this._fulfilledOrders;
  }

  set fulfilledOrders(value: Order[]) {
    this._fulfilledOrders = value;
  }

  toString() {
    const messages = [];
    messages.push(`uuid: ${this.uuid}`);
    messages.push(`rates: ${this._deltaRates}`);
    messages.push(`target rate: ${this.targetRate}`);
    messages.push(`minimum order: ${this.orderAmountMin}`);
    return messages.join('\n');
  }

  toStringStat(marketPrice: number) {
    const {baseAmount, quoteAmount} = this.balance;
    const balanceRate = this.balance.calculateRate(marketPrice);
    const value = balanceRate.toFixed(5);
    const [b, q] = this.contract.symbols;
    return `[stat] total balance: ${value} ${q}
market price:${marketPrice}
balance base: ${baseAmount.toFixed(5)} ${b}
balance quote: ${quoteAmount.toFixed(5)} ${q}
balance rate: ${balanceRate.toFixed(5)}
target rate: ${this.targetRate.toFixed(5)}`;
  }
}
