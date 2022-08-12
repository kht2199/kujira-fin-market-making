import { Injectable, Logger } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { Trading } from "../app/trading";
import { TelegramService } from "nestjs-telegram";
import data from "../../contracts.json";
import { KujiraClientService } from "./kujira-client-service";
import { TradingStateExecutor } from "../app/trading-state-executor";
import { TradingBalance } from "../app/trading-balance";
import { TradingOrders } from "../app/trading-orders";
import { TradingState } from "../app/trading-state";
import { Contract } from "../app/contract";
import { Wallet } from "../app/wallet";
import { TradingDto } from "../dto/trading.dto";
import { WalletDto } from "../dto/wallet.dto";
import { Coin } from "@cosmjs/stargate";
import { TradingAddDto } from "../dto/trading-add.dto";
import { WalletService } from "../service/wallet.service";
import { TradingService } from "../service/trading.service";
import { OrderRequest } from "../app/order-request";
import { OrderRequestDelta } from "../app/order-request-delta";

@Injectable()
export class KujiraService {
  // noinspection JSUnusedLocalSymbols
  private readonly logger = new Logger(KujiraService.name);

  private wallets: Map<Wallet, Trading[]> = new Map<Wallet, Trading[]>();

  private contracts: Contract[] = data.map(d => new Contract(d)) as Contract[];

  private CHAT_ID: string = process.env.TELEGRAM_CHAT_ID;

  constructor(
    private readonly httpService: HttpService,
    private readonly telegram: TelegramService,
    private readonly client: KujiraClientService,
    private readonly walletService: WalletService,
    private readonly tradingService: TradingService
  ) {
  }

  async connect(endpoint: string, mnemonic: string): Promise<Wallet> {
    if (!mnemonic) {
      throw new Error("!mnemonic");
    }
    return await this.client.sign(endpoint, mnemonic);
  }

  // noinspection JSUnusedGlobalSymbols
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
    this.logger.log(`[start] ${trading.uuid} ${trading.contract.market} ${beforeState}`);
    try {
      await TradingStateExecutor.next(trading, this);
      trading.ongoing = false;
    } catch (e) {
      if (e instanceof Error) {
        this.logger.error(e.stack);
      } else {
        this.logger.error(e);
      }
    } finally {
      const afterState = trading.state;
      this.logger.log(`[end] ${trading.uuid} ${trading.contract.market} ${beforeState} ${beforeState !== afterState ? `=> ${afterState}` : ""}`);
      trading.ongoing = false;
    }
  }

  sendMessage(message: string): void {
    if (!this.CHAT_ID) {
      return;
    }
    this.logger.debug(message);
    this.telegram.sendMessage({ chat_id: this.CHAT_ID, text: message }).subscribe({
      error: e => this.logger.error(JSON.stringify(e))
    });
  }

  async addTrading(wallet: Wallet, trading: Trading) {
    if (!this.wallets.has(wallet)) throw new Error("wallet not found in map");
    const [base, quote] = trading.contract.symbols;
    this.sendMessage(`[trading] Market [${base}/${quote}] added to account\n${trading.toString()}`);
    this.wallets.get(wallet).push(trading);
    await this.tradingService.addTrading(trading);
  }

  getContract(contractAddress: string): Contract {
    const contract = this.contracts.filter(c => c.address === contractAddress)[0];
    if (!contract) {
      throw new Error("Contract not exists.");
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
        denom: coin.denom as Denom
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
    return new TradingOrders(await this.client.getOrders(wallet, contract));
  }

  /**
   * @param contract
   * @param orders amount should greater than prev item.
   */
  public toOrderRequests(contract: Contract, orders: OrderRequestDelta[]): OrderRequest[] {
    let prevQuantity = 0;
    return orders
      .map(o => {
        const temp = o.dq;
        o.dq = Math.abs(Math.abs(o.dq) - Math.abs(prevQuantity));
        prevQuantity = temp;
        return o;
      })
      .map(o => {
        const amount = o.side === "Sell" ? o.dq : (o.dq * o.price);
        return new OrderRequest(
          contract,
          o.side,
          o.price,
          amount
        );
      });
  }

  getTradings(): TradingDto[] {
    const tradings = Array.from(this.wallets.values()).flat();
    return tradings.map(t => new TradingDto(t));
  }

  async getTrading(id: string): Promise<TradingDto> {
    const tradings = Array.from(this.wallets.values()).flat();
    const trading = tradings
      .filter(t => t.uuid === id)[0];
    if (!trading) throw new Error();
    return new TradingDto(trading);
  }

  async modifyTrading(uuid: string, body: TradingAddDto) {
    const tradings: Trading[] = Array.from(this.wallets.values()).flat();
    const trading: Trading = tradings.filter(t => t.uuid === uuid)[0];
    if (!trading) {
      this.logger.error(`trading[${uuid}] is not exists.`);
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
      messages.push(`target rate: ${trading.targetRate} to ${body.targetRate}`);
    }
    trading.deltaRates = body.deltaRates;
    trading.orderAmountMin = body.orderAmountMin;
    trading.targetRate = body.targetRate;
    await this.tradingService.updateTrading(trading);
    if (messages.length > 0) {
      this.sendMessage(`[config] changed ${trading.contract.market}\n${messages.join("\n")}`);
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

  async addWallets(wallets: Wallet[]) {
    await this.walletService.addWallets(wallets);
    wallets.forEach(wallet => {
      this.tradingService.getTradings(wallet)
        .then((tradings) =>
          tradings.map(t => {
            const trading = new Trading(wallet, this.getContract(t.contract), t.deltaRates.split(",").map(d => +d), t.targetRate, t.orderAmountMin);
            trading.uuid = t.uuid;
            return trading;
          })
        )
        .then(tradings => this.wallets.set(wallet, tradings));
    });
  }

  getWallet(accountAddress: string) {
    const wallets: Wallet[] = Array.from(this.wallets.keys());
    const wallet = wallets.filter(w => w.account.address === accountAddress)[0];
    if (!wallet) {
      const message = "wallet not exists";
      this.logger.error(message);
      throw new Error(message);
    }
    return wallet;
  }

  async deleteTrading(id: string) {
    await this.tradingService.deleteTrading(id);
    this.wallets.forEach((tradings, wallet) => {
      if (tradings.find(t => t.uuid === id)) {
        this.wallets.set(wallet, tradings.filter(t => t.uuid !== id))
      }
    })
  }

  async saveStat(trading: Trading, marketPrice: number) {
    const { balance, contract } = trading;
    const { baseAmount, quoteAmount } = balance;
    const totalValue = baseAmount * marketPrice + quoteAmount;
    const balanceRate = trading.balance.calculateRate(marketPrice);
    const [base, quote] = contract.symbols;
    const stat = {
      totalValue,
      balanceRate,
      base,
      baseAmount,
      quoteAmount,
      quote,
      marketPrice,
    };
    await this.walletService.addStat(stat);
  }

  async saveFilledOrders(trading: Trading, filledOrders: Order[]) {
    await this.tradingService.addFilledOrderHistory(trading, filledOrders);
  }

  async getMarketPrice(wallet: Wallet, contract: Contract) {
    return this.client.getMarketPrice(wallet, contract);
  }

  async orders(wallet: Wallet, preparedOrders: OrderRequest[]) {
    return this.client.orders(wallet, preparedOrders);
  }

  async ordersWithdraw(wallet: Wallet, contract: Contract, filledOrder: Order[]) {
    return this.client.ordersWithdraw(wallet, contract, filledOrder);
  }

  async ordersCancel(wallet: Wallet, contract: Contract, unfulfilledOrders: Order[]) {
    return this.client.ordersCancel(wallet, contract, unfulfilledOrders);
  }

}
