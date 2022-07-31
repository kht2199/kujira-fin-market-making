// noinspection JSUnusedGlobalSymbols

import { HttpStatus, Injectable, Logger } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { Trading } from "../app/trading";
import { TelegramService } from "nestjs-telegram";
import data from "../../contracts.json";
import { KujiraClientService } from "./kujira-client-service";
import { TradingStateExecutor } from "../app/trading-state-executor";
import { v4 as uuid } from "uuid";
import { TradingBalance } from "../app/trading-balance";
import { TradingOrders } from "../app/trading-orders";
import { TradingState } from "../app/trading-state";
import { Contract } from "../app/contract";
import { Wallet } from "../app/wallet";
import { TradingDto } from "../dto/trading.dto";
import { WalletDto } from "../dto/wallet.dto";
import { Coin } from "@cosmjs/stargate";
import coinsJson from '../../denoms.json'
import { TradingAddDto } from "../dto/trading-add.dto";
import { ResponseDto } from "../dto/response.dto";

@Injectable()
export class KujiraService {
  // noinspection JSUnusedLocalSymbols
  private readonly logger = new Logger(KujiraService.name);

  private wallets: Map<Wallet, Trading[]> = new Map<Wallet, Trading[]>();

  private contracts: Contract[] = data.map(d => new Contract(d)) as Contract[];

  public static readonly denomSymbolMap: Map<string, { denom: Denom, symbol: string, decimal: number }> =
    new Map<string, { denom: Denom, symbol: string, decimal: number }>();

  static {
    coinsJson.forEach((c) => KujiraService.denomSymbolMap.set(c.denom, c))
  }

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
    const tradings = Array.from(this.wallets.values()).flat();
    (async () => await Promise.all(Array.from(tradings).map(trading => this.startMarketMaking(trading))))();
  }

  private async startMarketMaking(trading: Trading) {
    if (trading.ongoing || trading.state === TradingState.STOP) return;
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

  addTrading(wallet: Wallet, trading: Trading) {
    if (!this.wallets.has(wallet)) throw new Error('wallet not found in map');
    this.wallets.get(wallet).push(trading);
  }

  getContract(contractAddress: string): Contract {
    const contract = this.contracts.filter(c => c.address === contractAddress)[0];
    if (!contract) {
      throw new Error('Contract not exists.')
    }
    return contract;
  }

  async fetchAllBalances(wallet: Wallet): Promise<Balance[]> {
    return this.client.getBalances(wallet);
  }

  async fetchBalances(wallet: Wallet, contract: Contract): Promise<TradingBalance> {
    const balances = (await this.client.getBalances(wallet))
      .map((coin: Coin) => ({
        amount: `${
          +coin.amount / 10 ** (6 + (contract.decimal_delta || 0))
        }`,
        denom: coin.denom as Denom,
      }));
    const base = balances.filter((b) => b.denom === contract.denoms.base)[0];
    const quote = balances.filter((b) => b.denom === contract.denoms.quote)[0];
    if (!base) {
      const message = `invalid base balance: ${contract.denoms.base}`;
      throw new Error(message);
    }
    if (!quote) {
      const message = `invalid quote balance: ${contract.denoms.quote}`;
      throw new Error(message);
    }
    return new TradingBalance(base, quote);
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

  getTradings(): TradingDto[] {
    const tradings = Array.from(this.wallets.values()).flat();
    return tradings.map(t => new TradingDto(t))
  }

  async getTrading(id: string): Promise<TradingDto> {
    const tradings = Array.from(this.wallets.values()).flat();
    const trading = tradings
      .filter(t => t.uuid === id)[0]
    if (!trading) throw new Error();
    return new TradingDto(trading);
  }

  modifyTrading(uuid: string, body: TradingAddDto) {
    const tradings = Array.from(this.wallets.values()).flat();
    const trading = tradings.filter(t => t.uuid === uuid)[0];
    if (!trading) {
      this.logger.error(`trading[${uuid}] is not exists.`)
      throw new Error(uuid);
    }
    const messages = [];
    if (trading.deltaRates.length !== body.deltaRates.length
        || trading.deltaRates.filter(d => body.deltaRates.indexOf(d) === -1).length > 0) {
      messages.push(`rates: ${trading.deltaRates} to ${body.deltaRates}`);
    }
    if (trading.orderAmountMin !== body.orderAmountMin) {
      messages.push(`minimum amount: ${trading.orderAmountMin} to ${body.orderAmountMin}`);
    }
    if (trading.targetRate !== body.targetRate) {
      messages.push(`minimum amount: ${trading.targetRate} to ${body.targetRate}`);
    }
    trading.deltaRates = body.deltaRates
    trading.orderAmountMin = body.orderAmountMin;
    trading.targetRate = body.targetRate;
    if (messages.length > 0) {
      this.sendMessage(`[config] changed manually\n${messages.join('\n')}`);
    }
    return new TradingDto(trading);
  }

  stopTrading(id: string) {
    const tradings = Array.from(this.wallets.values()).flat();
    const trading = tradings.filter(t => t.uuid === id)[0];
    if (!trading) throw new Error(id);
    trading.state = TradingState.CLOSE_FOR_STOP;
  }

  resumeTrading(id: string) {
    const tradings = Array.from(this.wallets.values()).flat();
    const trading = tradings.filter(t => t.uuid === id)[0];
    if (!trading) throw new Error(id);
    trading.state = TradingState.INITIALIZE;
  }

  getWallets(): WalletDto[] {
    const wallets: Wallet[] = Array.from(this.wallets.keys());
    return wallets.map(w => new WalletDto(w));
  }

  addWallet(wallet: Wallet) {
    this.wallets.set(wallet, []);
  }

  getWallet(accountAddress: string) {
    const wallets: Wallet[] = Array.from(this.wallets.keys());
    const wallet = wallets.filter(w => w.account.address === accountAddress)[0];
    if (!wallet) {
      const message = 'wallet not exists';
      this.logger.error(message);
      throw new Error(message);
    }
    return wallet;
  }

  getSymbol(contract: Contract): string[] {
    return [
      KujiraService.denomSymbolMap.get(contract.denoms.base).symbol,
      KujiraService.denomSymbolMap.get(contract.denoms.quote).symbol,
    ]
  }
}
