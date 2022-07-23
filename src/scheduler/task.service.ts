import { Injectable, Logger } from "@nestjs/common";
import { SchedulerRegistry } from "@nestjs/schedule";
import { KujiraService } from "../kujira.service";
import { Trading } from "../app/trading";
import data from "../data/contracts.json";
import { TelegramService } from "nestjs-telegram";

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  private contracts: Contract[] = data as Contract[];

  constructor(
    private readonly telegram: TelegramService,
    private schedulerRegistry: SchedulerRegistry,
    private kujiraService: KujiraService,
  ) {
    const contract = this.contracts
      .filter(c => kujiraService.toSymbol(c.denoms.base) === 'KUJI')
      .filter(c => kujiraService.toSymbol(c.denoms.quote) === 'axlUSDC')[0]
    ;
    if (!contract) {
      throw new Error('Contract not exists.')
    }
    const targetRate = process.env.TARGET_RATE ? Number(process.env.TARGET_RATE) : undefined;
    const interval = process.env.INTERVAL || 5000;
    const rates: number[] = process.env.RATES.split(',')
      .map(s => s.trim())
      .map(s => Number(s))
      .filter(s => !!s);
    const endpoint = process.env.ENDPOINT;
    const mnemonic = process.env.MNEMONIC;
    kujiraService.connect(endpoint, mnemonic)
      .then(wallet => new Trading(telegram, kujiraService, wallet, contract, rates, targetRate))
      .then((trading) => kujiraService.addTrading(trading))
      .then(() => {
        this.addNewInterval(
          'Market Making',
          +interval,
          () => kujiraService.startMarketMaking(),
        )
      })

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
