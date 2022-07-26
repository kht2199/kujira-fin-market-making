import { Injectable } from "@nestjs/common";
import { SchedulerRegistry } from "@nestjs/schedule";
import { KujiraService } from "../kujira/kujira.service";
import { Trading } from "../app/trading";
import { TelegramService } from "nestjs-telegram";
import { KujiraClientService } from "../kujira/kujira-client-service";
import { validateRate } from "../util/util";

@Injectable()
export class TasksService {

  constructor(
    private readonly telegram: TelegramService,
    private schedulerRegistry: SchedulerRegistry,
    private kujiraService: KujiraService,
    private clientService: KujiraClientService,
  ) {

    const interval = +process.env.INTERVAL || 10000;
    const rates: number[] = process.env.RATES.split(',')
      .map(s => s.trim())
      .map(s => Number(s));
    const endpoint = process.env.ENDPOINT;
    const mnemonic = process.env.MNEMONIC;
    const orderAmountMin = process.env.ORDER_AMOUNT_MIN || 0;
    const contract = kujiraService.getContract(process.env.CONTRACT);
    const baseSymbol = kujiraService.toSymbol(contract.denoms.base)
    const quoteSymbol = kujiraService.toSymbol(contract.denoms.quote)
    let targetRate = +process.env.TARGET_RATE || undefined;
    // validation
    if (rates.length <= 1) throw new Error(`RATES length is too short. ${rates.length}`);
    if (interval < 10000) throw new Error(`INTERVAL is too short. ${interval}`);
    validateRate(interval, 'TARGET_RATE');
    if (targetRate <= 0 || targetRate >= 1) throw new Error(`TARGET_RATE should between 0 and 1 or blank. ${targetRate}`);
    rates.forEach(r => validateRate(r, 'RATES'));
    kujiraService.connect(endpoint, mnemonic)
      .then(async wallet => {
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
