import { Injectable } from "@nestjs/common";
import { SchedulerRegistry } from "@nestjs/schedule";
import { KujiraService } from "../kujira/kujira.service";
import { TelegramService } from "nestjs-telegram";

@Injectable()
export class TasksService {

  constructor(
    private readonly telegram: TelegramService,
    private schedulerRegistry: SchedulerRegistry,
    private kujiraService: KujiraService
  ) {
    const interval = +process.env.INTERVAL || 10000;
    if (interval < 10000) throw new Error(`INTERVAL is too short. ${interval}`);
    const endpoint = process.env.ENDPOINT;
    if (!endpoint) throw new Error('ENDPOINT not exists');
    const mnemonics = process.env.MNEMONIC
    if (!mnemonics) throw new Error('MNEMONIC not exists');
    mnemonics.split(',')
      .forEach(m => kujiraService.connect(endpoint, m)
        .then(res => kujiraService.addWallet(res))
      );
    if (process.env.SCHEDULE === 'false') return;
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
