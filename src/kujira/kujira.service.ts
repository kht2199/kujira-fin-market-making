// noinspection JSUnusedGlobalSymbols

import {Injectable, Logger} from "@nestjs/common";
import {HttpService} from "@nestjs/axios";
import {Trading} from "../app/trading";
import {TelegramService} from "nestjs-telegram";
import data from "../../contracts.json";
import {KujiraClientService} from "./kujira-client-service";
import {TradingStateExecutor} from "../app/trading-state-executor";
import {v4 as uuid} from "uuid";
import {TradingBalance} from "../app/trading-balance";
import {TradingOrders} from "../app/trading-orders";

@Injectable()
export class KujiraService {
  // noinspection JSUnusedLocalSymbols
  private readonly logger = new Logger(KujiraService.name);

  private tradings: Trading[] = [];

  private contracts: Contract[] = data as Contract[];

  private CHAT_ID: string = process.env.TELEGRAM_CHAT_ID;

  constructor(
    private readonly httpService: HttpService,
    private readonly telegram: TelegramService,
    private readonly client: KujiraClientService,
  ) {}

  async connect(endpoint: string, mnemonic: string): Promise<Wallet> {
    if (!mnemonic) {
      throw new Error('!mnemonic');
    }
    return await this.client.sign(endpoint, mnemonic);
  }

  async reconnect(wallet: Wallet) {
    return await this.client.sign(wallet.endpoint, wallet.mnemonic);
  }

  startMarketMakings() {
    (async () => await Promise.all(this.tradings.map(trading => this.startMarketMaking(trading))))();
  }

  private async startMarketMaking(trading: Trading) {
    if (trading.ongoing) return;
    trading.ongoing = true;
    const beforeState = trading.state;
    this.logger.log(`[start] ${trading.uuid} ${beforeState}`)
    try {
      await TradingStateExecutor.next(trading, this, this.client);
      trading.ongoing = false;
    } catch (e) {
      if (e instanceof Error) {
        this.logger.error(e.stack);
      } else {
        this.logger.error(e);
      }
    } finally {
      const afterState = trading.state;
      this.logger.log(`[end] ${trading.uuid} ${beforeState} ${beforeState !== afterState ? `=> ${afterState}` : ''}`)
      trading.ongoing = false;
    }
  }

  sendMessage(message: string): void {
    if (!this.CHAT_ID) {
      return;
    }
    this.telegram.sendMessage({ chat_id: this.CHAT_ID, text: message }).subscribe()
  }

  addTrading(trading: Trading) {
    this.tradings.push(trading);
  }

  toSymbol(denom: Denom) {
    switch (denom) {
      case 'ukuji':
        return 'KUJI';
      case 'factory/kujira1ltvwg69sw3c5z99c6rr08hal7v0kdzfxz07yj5/demo':
        return 'DEMO';
      case 'ibc/295548A78785A1007F232DE286149A6FF512F180AF5657780FC89C009E2C348F':
        return 'axlUSDC';
      case 'ibc/1B38805B1C75352B28169284F96DF56BDEBD9E8FAC005BDCC8CF0378C82AA8E7':
        return 'wETH';
      case 'ibc/27394FB092D2ECCD56123C74F36E4C1F926001CEADA9CA97EA622B25F41E5EB2':
        return 'ATOM';
      case 'ibc/47BD209179859CDE4A2806763D7189B6E6FE13A17880FE2B42DE1E6C1E329E23':
        return 'OSMO';
      case 'ibc/EFF323CC632EC4F747C61BCE238A758EFDB7699C3226565F7C20DA06509D59A5':
        return 'JUNO';
      case 'ibc/F3AA7EF362EC5E791FE78A0F4CCC69FEE1F9A7485EB1A8CAB3F6601C00522F10':
        return 'EVMOS';
      case 'ibc/A358D7F19237777AF6D8AD0E0F53268F8B18AE8A53ED318095C14D6D7F3B2DB5':
        return 'SCRT';
      default:
        return denom;
    }
  }

  getContract(contractAddress: string): Contract {
    const contract = this.contracts.filter(c => c.address === contractAddress)[0];
    if (!contract) {
      throw new Error('Contract not exists.')
    }
    return contract;
  }

  async fetchBalances(wallet: Wallet, contract: Contract): Promise<TradingBalance> {
    const balances = await this.client.getBalances(wallet, contract);
    const base = balances.filter((b) => b.denom === contract.denoms.base)[0];
    const quote = balances.filter((b) => b.denom === contract.denoms.quote)[0];
    const baseSymbol = this.toSymbol(base.denom);
    const quoteSymbol = this.toSymbol(quote.denom);
    if (!base) {
      const message = `invalid base balance: ${contract.denoms.base}`;
      throw new Error(message);
    }
    if (!quote) {
      const message = `invalid quote balance: ${contract.denoms.quote}`;
      throw new Error(message);
    }
    return new TradingBalance(base, quote, baseSymbol, quoteSymbol);
  }

  async fetchOrders(trading: Trading): Promise<TradingOrders> {
    const { wallet, contract } = trading;
    return new TradingOrders(await this.client.getOrders(wallet, contract))
  }

  public toOrderMarketMaking(rate: number, marketPrice: number, baseQuantity: number, quoteQuantity: number, targetRate: number): OrderMarketMaking {
    // 자산비율이 주문비율{1%,2%}에 해당하는 목표가격을 {tp1, tp2} 찾는다.
    const price = marketPrice + marketPrice * rate;
    // 주문비율의 가격에서 변동자산가치를{tot1, tot2} 계산한다.
    const tot = baseQuantity * price + quoteQuantity;
    // 변동자산가치에서 목표비율을 곱해 목표가의 갯수를{base}를 계산한다.
    const base = tot * targetRate / price;
    // 목표수량과 현재 수량만큼의 차이인 주문수량{dq1, dq2} 계산한다.
    const dq = base - baseQuantity;
    // 부호가 다르면, 가격 이격이 발생.
    const normal = rate * dq < 0;
    return { price, base, dq, normal, side: dq > 0 ? 'Buy' : 'Sell'};
  }

  /**
   * @param contract
   * @param orders amount should greater than prev item.
   */
  public toOrderRequests(contract: Contract, orders: OrderMarketMaking[]): OrderRequest[] {
    let prevQuantity = 0;
    return orders
      .map(o => {
        const res = {
          ...o,
          dq: Math.abs(Math.abs(o.dq) - Math.abs(prevQuantity))
        };
        prevQuantity = o.dq;
        return res;
      })
      .map(o => {
        const amount = o.side === 'Sell' ? o.dq : (o.dq * o.price);
        return {
          uuid: uuid(),
          contract,
          side: o.side,
          price: o.price,
          amount,
        }
      });
  }
}
