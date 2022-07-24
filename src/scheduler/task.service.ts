import { Injectable } from "@nestjs/common";
import { SchedulerRegistry } from "@nestjs/schedule";
import { KujiraService } from "../kujira/kujira.service";
import { Trading } from "../app/trading";
import { TelegramService } from "nestjs-telegram";
import { KujiraClientService } from "../kujira/kujira-client-service";

@Injectable()
export class TasksService {

  constructor(
    private readonly telegram: TelegramService,
    private schedulerRegistry: SchedulerRegistry,
    private kujiraService: KujiraService,
    private clientService: KujiraClientService,
  ) {

    const interval = process.env.INTERVAL || 5000;
    const rates: number[] = process.env.RATES.split(',')
      .map(s => s.trim())
      .map(s => Number(s))
      .filter(s => !!s);
    const endpoint = process.env.ENDPOINT;
    const mnemonic = process.env.MNEMONIC;
    const contract = kujiraService.getContract(process.env.CONTRACT);
    const baseSymbol = kujiraService.toSymbol(contract.denoms.base)
    const quoteSymbol = kujiraService.toSymbol(contract.denoms.quote)
    kujiraService.connect(endpoint, mnemonic)
      .then(async wallet => {
        let targetRate = process.env.TARGET_RATE ? Number(process.env.TARGET_RATE) : undefined;
        if (!targetRate) {
          const balances = await this.clientService.getBalances(wallet, contract);
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
          const balance = new TradingBalance(base, quote, baseSymbol, quoteSymbol);
          const marketPrice = await clientService.getMarketPrice(wallet, contract);
          targetRate = balance.calculateRate(marketPrice);
        }
        return new Trading(
          baseSymbol, quoteSymbol,
          wallet, contract, rates, targetRate
        );
      })
      .then((trading) => kujiraService.addTrading(trading));
    this.addNewInterval(
      'Market Making',
      +interval,
      () => kujiraService.startMarketMakings(),
    );
  }

  addNewInterval(
    intervalName: string,
    intervalTime: number,
    callback: Function,
  ) {
    const interval = setInterval(callback, intervalTime);
    this.schedulerRegistry.addInterval(intervalName, interval);
  }
}
