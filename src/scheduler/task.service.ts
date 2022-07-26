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
      .map(s => Number(s));
    const endpoint = process.env.ENDPOINT;
    const mnemonic = process.env.MNEMONIC;
    const orderAmountMin = process.env.ORDER_AMOUNT_MIN || 0;
    const contract = kujiraService.getContract(process.env.CONTRACT);
    const baseSymbol = kujiraService.toSymbol(contract.denoms.base)
    const quoteSymbol = kujiraService.toSymbol(contract.denoms.quote)
    kujiraService.connect(endpoint, mnemonic)
      .then(async wallet => {
        let targetRate = process.env.TARGET_RATE ? Number(process.env.TARGET_RATE) : undefined;
        if (!targetRate) {
          const balances = await this.kujiraService.fetchBalances(wallet, contract);
          const marketPrice = await clientService.getMarketPrice(wallet, contract);
          targetRate = balances.calculateRate(marketPrice);
        }
        return new Trading(
          baseSymbol, quoteSymbol,
          wallet, contract, rates, targetRate,
          Number(orderAmountMin)
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
