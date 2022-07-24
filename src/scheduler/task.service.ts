import { Injectable } from "@nestjs/common";
import { SchedulerRegistry } from "@nestjs/schedule";
import { KujiraService } from "../kujira.service";
import { Trading } from "../app/trading";
import { TelegramService } from "nestjs-telegram";
import { KujiraClientService } from "../client/kujira-client-service";

@Injectable()
export class TasksService {

  constructor(
    private readonly telegram: TelegramService,
    private schedulerRegistry: SchedulerRegistry,
    private kujiraService: KujiraService,
    private clientService: KujiraClientService,
  ) {

    const targetRate = process.env.TARGET_RATE ? Number(process.env.TARGET_RATE) : undefined;
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
      .then(wallet => new Trading(
        clientService,
        kujiraService,
        baseSymbol, quoteSymbol,
        wallet, contract, rates, targetRate
      ))
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
