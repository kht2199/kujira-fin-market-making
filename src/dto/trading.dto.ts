import { Trading } from "../app/trading";
import { TradingState } from "../app/trading-state";
import { Contract } from "../app/contract";
import { Expose } from "class-transformer";

export class TradingDto {

  @Expose({ name: 'uuid' })
  private readonly _uuid: string;
  @Expose({ name: 'state' })
  private readonly _state: TradingState;
  @Expose({ name: 'wallet' })
  private readonly _wallet: { account: { address: string } };
  @Expose({ name: 'contract' })
  private readonly _contract: Contract;
  @Expose({ name: 'deltaRates' })
  private readonly _deltaRates: number[];
  @Expose({ name: 'targetRate' })
  private readonly _targetRate: number;
  @Expose({ name: 'orderAmountMin' })
  private readonly _orderAmountMin: number;

  constructor(trading: Trading) {
    this._uuid = trading.uuid;
    this._state = trading.state;
    this._wallet = {
      account: {
        address: trading.wallet.account.address
      }
    };
    this._contract = trading.contract;
    this._deltaRates = trading.deltaRates;
    this._targetRate = trading.targetRate;
    this._orderAmountMin = trading.orderAmountMin;
  }


  get uuid(): string {
    return this._uuid;
  }

  get state(): TradingState {
    return this._state;
  }

  get wallet(): { account: { address: string } } {
    return this._wallet;
  }

  get contract(): Contract {
    return this._contract;
  }

  get deltaRates(): number[] {
    return this._deltaRates;
  }

  get targetRate(): number {
    return this._targetRate;
  }

  get orderAmountMin(): number {
    return this._orderAmountMin;
  }
}