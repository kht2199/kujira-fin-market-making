import { v4 as uuid } from "uuid";
import { TradingBalance } from "./trading-balance";
import { TradingState } from "./trading-state";

export class Trading {

  readonly uuid: string;

  private _state: TradingState = TradingState.INITIALIZE;

  private _balance: TradingBalance;

  public ongoing: boolean = false;

  private _preparedOrders: OrderRequest[] = [];

  private _fulfilledOrders: Order[] = [];

  lastMarketPrice: number;

  constructor(
    private readonly _baseSymbol: string,
    private readonly _quoteSymbol: string,
    private _wallet: Wallet,
    private _contract: Contract,
    private _deltaRates: number[],
    private _targetRate: number,
    private _orderAmountMin: number,
  ) {
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

  get baseSymbol(): string {
    return this._baseSymbol;
  }

  get quoteSymbol(): string {
    return this._quoteSymbol;
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

}
