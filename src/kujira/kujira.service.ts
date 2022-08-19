import { Injectable, Logger } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { Trading } from "../app/trading";
import data from "../../contracts.json";
import { KujiraClientService } from "./kujira-client-service";
import { TradingBalance } from "../app/trading-balance";
import { TradingOrders } from "../app/trading-orders";
import { Contract } from "../app/contract";
import { Wallet } from "../app/wallet";
import { Coin } from "@cosmjs/stargate";
import { OrderRequest } from "../app/order-request";
import { OrderRequestDelta } from "../app/order-request-delta";
import { asc, desc } from "../util/util";

@Injectable()
export class KujiraService {
  // noinspection JSUnusedLocalSymbols
  private readonly logger = new Logger(KujiraService.name);

  private contracts: Contract[] = data.map(d => new Contract(d)) as Contract[];

  constructor(
    private readonly httpService: HttpService,
    private readonly client: KujiraClientService,
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

  getContract(contractAddress: string): Contract {
    const contract = this.contracts.filter(c => c.address === contractAddress)[0];
    if (!contract) {
      throw new Error("Contract not exists.");
    }
    return contract;
  }

  async getBalances(wallet: Wallet): Promise<Balance[]> {
    return await this.client.getBalances(wallet);
  }

  async getTradingBalance(wallet: Wallet, contract: Contract): Promise<TradingBalance> {
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

  async getOrders(trading: Trading): Promise<TradingOrders> {
    const { wallet, contract } = trading;
    return new TradingOrders(await this.client.getOrders(wallet, contract));
  }

  public toOrderRequests(contract: Contract, trading: Trading, marketPrice: number, orders: OrderRequestDelta[]): OrderRequest[] {
    let prevTotalValue;
    let prevBaseAmount;
    let prevQuoteAmount;
    return orders
      .map(o => {
        const {balance, targetRate, orderAmountMin} = trading;
        if (!prevTotalValue) {
          prevTotalValue = balance.baseAmount * o.price + balance.quoteAmount;
          const baseAmount = prevTotalValue * targetRate / o.price;
          const deltaBaseAmount = baseAmount - balance.baseAmount;
          if (Math.abs(deltaBaseAmount) < orderAmountMin) {
            prevTotalValue = undefined;
            return;
          }
          const deltaQuoteAmount = deltaBaseAmount * o.price * -1;
          prevBaseAmount = balance.baseAmount + deltaBaseAmount;
          prevQuoteAmount = balance.quoteAmount + deltaQuoteAmount;
          return new OrderRequest(
            contract,
            o.side,
            o.price,
            o.side === "Sell" ? deltaBaseAmount : (deltaBaseAmount * o.price)
          );
        }
        const totalValue = prevBaseAmount * o.price + prevQuoteAmount;
        const baseAmount = totalValue * targetRate / o.price;
        const deltaBaseAmount = baseAmount - prevBaseAmount;
        const deltaQuoteAmount = deltaBaseAmount * o.price * -1;
        prevBaseAmount = baseAmount;
        prevQuoteAmount = prevQuoteAmount + deltaQuoteAmount;
        return new OrderRequest(
          contract,
          o.side,
          o.price,
          o.side === "Sell" ? deltaBaseAmount : (deltaBaseAmount * o.price)
        );
      })
      .filter(o => !!o);
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

  createOrderRequests(trading: Trading, marketPrice: number) {
    const {contract, deltaRates, targetRate} = trading;
    const { baseAmount, quoteAmount} = trading.balance;
    let tps: OrderRequestDelta[] = deltaRates
      .map(r => new OrderRequestDelta(r, marketPrice, baseAmount, quoteAmount, targetRate))
    const sellOrders = tps.filter(tp => tp.side === 'Sell')
      .sort((n1, n2) => asc(n1.price, n2.price));
    const buyOrders = tps.filter(tp => tp.side === 'Buy')
      .sort((n1, n2) => desc(n1.price, n2.price));
    return [
      ...this.toOrderRequests(contract, trading, marketPrice, sellOrders),
      ...this.toOrderRequests(contract, trading, marketPrice, buyOrders)
    ].filter(o => o.amount !== 0)
  }
}
