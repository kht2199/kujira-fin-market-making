import { Injectable, Logger } from "@nestjs/common";
import { SchedulerRegistry } from "@nestjs/schedule";
import { KujiraService } from "../kujira/kujira.service";
import { TelegramService } from "nestjs-telegram";
import { Wallet } from "../app/wallet";
import { Trading } from "../app/trading";
import { TradingState } from "../app/trading-state";
import { TradingStateExecutor } from "../app/trading-state-executor";
import { TradingService } from "../service/trading.service";
import { TradingDto } from "../dto/trading.dto";
import { TradingAddDto } from "../dto/trading-add.dto";
import { MessageEvent } from "../event/message.event";
import { WalletDto } from "../dto/wallet.dto";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { WalletService } from "../service/wallet.service";
import { Contract } from "../app/contract";
import { lastValueFrom, map } from "rxjs";
import { HttpService } from "@nestjs/axios";

@Injectable()
export class TasksService {

  private readonly logger = new Logger(TasksService.name);

  private wallets: Map<Wallet, Trading[]> = new Map<Wallet, Trading[]>();

  private readonly executor: TradingStateExecutor;

  constructor(
    private readonly telegram: TelegramService,
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly walletService: WalletService,
    private readonly tradingService: TradingService,
    private readonly emitter: EventEmitter2,
    private readonly kujiraService: KujiraService,
    private readonly httpService: HttpService,
  ) {
    this.executor = new TradingStateExecutor(emitter);
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
      .then(wallets => this.addWallets(wallets));
    this.addNewInterval(
      'Market Making',
      interval,
      async () => await this.asyncCallWithTimeout(this.startMarketMakings(), interval),
    );
  }

  async getTrading(id: string): Promise<TradingDto> {
    const tradings = Array.from(this.wallets.values()).flat();
    const trading = tradings
      .filter(t => t.uuid === id)[0];
    if (!trading) throw new Error();
    return new TradingDto(trading);
  }

  async modifyTrading(uuid: string, body: TradingAddDto): Promise<void> {
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
    if (messages.length > 0) {
      trading.deltaRates = body.deltaRates;
      trading.orderAmountMin = body.orderAmountMin;
      trading.targetRate = body.targetRate;
      await this.tradingService.updateTrading(trading);
      this.emitter.emit(MessageEvent.NAME, new MessageEvent(
        `[config] changed ${trading.contract.market}\n${messages.join("\n")}`
      ));
    }
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
            const trading = new Trading(wallet, this.kujiraService.getContract(t.contract), t.deltaRates.split(",").map(d => +d), t.targetRate, t.orderAmountMin);
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

  getTradings(): TradingDto[] {
    const tradings = Array.from(this.wallets.values()).flat();
    return tradings.map(t => new TradingDto(t));
  }

  async deleteTrading(id: string) {
    await this.tradingService.deleteTrading(id);
    this.wallets.forEach((tradings, wallet) => {
      if (tradings.find(t => t.uuid === id)) {
        this.wallets.set(wallet, tradings.filter(t => t.uuid !== id))
      }
    })
  }

  async addTrading(wallet: Wallet, dto: TradingAddDto) {
    const contract = this.kujiraService.getContract(dto.contract);
    const trading = new Trading(wallet, contract, dto.deltaRates, dto.targetRate, dto.orderAmountMin);
    const [base, quote] = trading.contract.symbols;
    this.emitter.emit(MessageEvent.NAME, new MessageEvent(
      `[trading] Market [${base}/${quote}] added to account\n${trading.toString()}`
    ));
    this.wallets.get(wallet).push(trading);
    await this.tradingService.addTrading(trading);
  }

  addNewInterval(
    intervalName: string,
    intervalTime: number,
    callback: Function,
  ) {
    const interval = setInterval(callback, intervalTime);
    this.schedulerRegistry.addInterval(intervalName, interval);
  }

  async startMarketMakings() {
    const tradings = Array.from(this.wallets.values()).flat();
    return Promise.all(Array.from(tradings)
        .filter(trading => trading.state !== TradingState.STOP)
        .map(trading => this.startMarketMaking(trading)));
  }

  private async startMarketMaking(trading: Trading) {
    const beforeState = trading.state;
    this.logger.log(`[start] ${trading.uuid} ${trading.contract.market} ${beforeState}`);
    try {
      await this.executor.next(trading, this.kujiraService);
    } catch (e) {
      if (e instanceof Error) {
        this.logger.error(e.stack);
      } else {
        this.logger.error(e);
      }
    } finally {
      const afterState = trading.state;
      this.logger.log(`[end] ${trading.uuid} ${trading.contract.market} ${beforeState} ${beforeState !== afterState ? `=> ${afterState}` : ""}`);
    }
  }

  async asyncCallWithTimeout(asyncPromise, timeLimit) {
    let timeoutHandle;

    const timeoutPromise = new Promise((_resolve, reject) => {
      timeoutHandle = setTimeout(
        () => reject(new Error('Async call timeout limit reached')),
        timeLimit
      );
    });

    return Promise.race([asyncPromise, timeoutPromise]).then(result => {
      clearTimeout(timeoutHandle);
      return result;
    })
      .catch(e => this.logger.error(e));
  }
}
