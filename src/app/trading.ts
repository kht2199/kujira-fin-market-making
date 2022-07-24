import { v4 as uuid } from "uuid";

export enum ClientState {
  INITIALIZE = 'INITIALIZE',
  ORDER = 'ORDER',
  ORDER_PREPARED = 'ORDER_PREPARED',
  FULFILLED_ORDERS = 'FULFILLED_ORDERS',
  ORDER_EMPTY_SIDE_WITH_GAP = 'ORDER_EMPTY_SIDE_WITH_GAP',
  CANCEL_ALL_ORDERS = 'CANCEL_ALL_ORDERS',
  ORDER_CHECK = 'ORDER_CHECK',
  WAITING_ALL_ORDER_COMPLETE = 'WAITING_ALL_ORDER_COMPLETE',
}

export class Trading {

  readonly uuid: string;

  private _state: ClientState = ClientState.INITIALIZE;

  private _balance: TradingBalance;

  public ongoing: boolean = false;

  private _preparedOrders: OrderRequest[] = [];

  constructor(
    private readonly _baseSymbol: string,
    private readonly _quoteSymbol: string,
    private _wallet: Wallet,
    private _contract: Contract,
    private _deltaRates: number[],
    private _targetRate: number,
  ) {
    this.uuid = uuid().slice(0, 5);
    this._targetRate = _targetRate;
  }

  get state(): ClientState {
    return this._state;
  }

  set state(value: ClientState) {
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

  addPreparedOrders(items: OrderRequest[]) {
    this._preparedOrders.push(...items)
  }
}
