import { Injectable } from "@nestjs/common";
import { SchedulerRegistry } from "@nestjs/schedule";
import { KujiraService } from "../kujira/kujira.service";
import { TelegramService } from "nestjs-telegram";

@Injectable()
export class TasksService {

  constructor(
    private readonly telegram: TelegramService,
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly kujiraService: KujiraService
  ) {
    const interval = +process.env.INTERVAL || 10000;
    if (interval < 10000) throw new Error(`INTERVAL is too short. ${interval}`);
    const endpoint = process.env.ENDPOINT;
    if (!endpoint) throw new Error('ENDPOINT not exists');
    const mnemonics = process.env.MNEMONIC
    if (!mnemonics) throw new Error('MNEMONIC not exists');
    Promise.all(
      mnemonics.split(',')
        .map(m => kujiraService.connect(endpoint, m.trim()))
    )
      .then(wallets => kujiraService.addWallets(wallets));
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
