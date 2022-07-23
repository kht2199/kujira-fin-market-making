// noinspection JSUnusedGlobalSymbols

import { Injectable, Logger } from "@nestjs/common";
import { lastValueFrom, map } from "rxjs";
import { HttpService } from "@nestjs/axios";
import { BookResponse } from "kujira.js/lib/cjs/fin";
import * as kujiraClient from "kujira.js";
import { FinClient, registry, tx } from "kujira.js";
import { MsgSend } from "cosmjs-types/cosmos/bank/v1beta1/tx";
import { Coin, coins, DeliverTxResponse, GasPrice, MsgSendEncodeObject } from "@cosmjs/stargate";
import { Buffer } from "buffer";
import { OrderResponse } from "kujira.js/src/fin";
import { ExecuteResult, SigningCosmWasmClient } from "@cosmjs/cosmwasm-stargate";
import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";
import { Trading } from "./app/trading";

const toOrder = (contract: Contract, o: OrderResponse): Order => {
  let state: OrderState = 'Open';
  if (o.filled_amount !== '0' && o.offer_amount !== '0') {
    state = 'Partial';
  } else if (o.filled_amount !== '0' && o.offer_amount === '0') {
    state = 'Closed';
  }
  const decimal_delta = contract.decimal_delta || 0;
  const side =
    (o.offer_denom as any).native === contract.denoms.base ? 'Sell' : 'Buy';
  const amount_delta = (contract.decimal_delta || 0) + 6;
  return {
    ...o,
    quote_price: `${+o.quote_price * 10 ** decimal_delta}`,
    offer_amount: `${+o.offer_amount / 10 ** amount_delta}`,
    original_offer_amount: `${+o.original_offer_amount / 10 ** amount_delta}`,
    filled_amount: `${+o.filled_amount / 10 ** amount_delta}`,
    state,
    quote: contract.denoms.quote,
    base: contract.denoms.base,
    side,
  };
};

async function sign(endpoint: string, mnemonic: string) {
  const signer = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, {
    prefix: 'kujira',
  });
  const client: SigningCosmWasmClient =
    await SigningCosmWasmClient.connectWithSigner(endpoint, signer, {
      registry,
      gasPrice: GasPrice.fromString('0.00125ukuji'),
    });
  const accounts = await signer.getAccounts();
  const wallet: Wallet = {
    client,
    signer,
    account: accounts[0],
    endpoint,
    mnemonic,
  };
  return wallet;
}

@Injectable()
export class KujiraService {
  // noinspection JSUnusedLocalSymbols
  private readonly logger = new Logger(KujiraService.name);

  private _lcdUrl: string = 'https://lcd.kaiyo.kujira.setten.io';

  private _balanceUrl: string = `${this._lcdUrl}/cosmos/bank/v1beta1/balances`;

  private trading: Trading;

  constructor(private httpService: HttpService) {}

  async connect(endpoint: string, mnemonic: string): Promise<Wallet> {
    if (!mnemonic) {
      throw new Error('!mnemonic');
    }
    return await sign(endpoint, mnemonic);
  }

  async reconnect(wallet: Wallet) {
    return await sign(wallet.endpoint, wallet.mnemonic);
  }

  fetchBalance(wallet: Wallet, contract: Contract, denom: Denom): Promise<Balance> {
    return wallet.client.getBalance(wallet.account.address, denom)
      .then((coin: Coin) => ({
        amount: `${
          +coin.amount / 10 ** (6 + (contract.decimal_delta || 0))
        }`,
        denom: coin.denom as Denom,
      }))
  }

  fetchBalances(wallet: Wallet, contract: Contract): Promise<Balance[]> {
    return lastValueFrom(
      this.httpService.get(`${this._balanceUrl}/${wallet.account.address}`)
        .pipe(
          map((res) => res.data.balances),
          map((balances) =>
            balances.map((coin: Coin) => ({
              amount: `${
                +coin.amount / 10 ** (6 + (contract.decimal_delta || 0))
              }`,
              denom: coin.denom as Denom,
            })),
          ),
        ),
    );
  }

  async books(
    wallet: Wallet,
    contract: Contract,
    { limit, offset = 0 }: { limit: number; offset?: number },
  ): Promise<BookResponse> {
    const { account, client } = wallet;
    const finClient: FinClient = new FinClient(
      client,
      account.address,
      contract.address,
    );
    return finClient.book({ limit, offset });
  }

  async orders(wallet: Wallet, orders: OrderRequest[]): Promise<DeliverTxResponse> {
    if (orders.length === 0) return Promise.reject('orders empty');
    const {client, account} = wallet;
    const msgs = orders.map(o => {
      const { contract } = o;
      const { denoms, decimal_delta, price_precision: {decimal_places} } = contract;
      const denom = o.side === 'Buy'
        ? denoms.quote
        : denoms.base;
      let price = decimal_delta
        ? (o.price /= 10 ** decimal_delta).toFixed(decimal_delta + decimal_places)
        : o.price.toFixed((decimal_delta || 0) + decimal_places);
      let amount = o.amount * 10 ** 6;
      if (o.side === 'Sell') {
        amount *= 10 ** (decimal_delta || 0);
      }
      const amountString = amount.toFixed(0);
      const data = {
        sender: account.address,
        contract: contract.address,
        msg: Buffer.from(JSON.stringify({submit_order: {price}})),
        funds: coins(amountString, denom),
      };
      return tx.wasm.msgExecuteContract(data);
    });
    return client.signAndBroadcast(account.address, msgs, 'auto');
  }

  async ordersCancel(wallet: Wallet, contract: Contract, orders: Order[]): Promise<ExecuteResult> {
    const {client, account} = wallet;
    const finClient: FinClient = new FinClient(client, account.address, contract.address);
    return finClient.retractOrders({ orderIdxs: orders.map(o => `${o.idx}`) });
  }

  async getOrders(wallet: Wallet, contract: Contract): Promise<Order[]> {
    const { client, account } = wallet;
    const finClient: FinClient = new FinClient(
      client,
      account.address,
      contract.address,
    );
    return finClient
      .ordersByUser({
        address: account.address,
        limit: 100,
      })
      .then((res) => res.orders.map((o) => toOrder(contract, o)));
  }

  async send(
    wallet: Wallet,
    sendTo: string,
    amount: string,
    denom: string,
  ): Promise<DeliverTxResponse> {
    const { client, account } = wallet;
    const msg: MsgSend = MsgSend.fromPartial({
      fromAddress: account.address,
      toAddress: sendTo,
      amount: coins(amount, denom),
    });
    const msgAny: MsgSendEncodeObject = {
      typeUrl: '/cosmos.bank.v1beta1.MsgSend',
      value: msg,
    };
    return client.signAndBroadcast(account.address, [msgAny], 'auto', '1');
  }

  async ordersWithdraw(wallet: Wallet, contract: Contract, orders: Order[]) {
    const client = new kujiraClient.FinClient(
      wallet.client,
      wallet.account.address,
      contract.address,
    );
    return client.withdrawOrders({
      orderIdxs: orders.filter((o) => +o.filled_amount).map((o) => o.idx),
    });
  }

  async startMarketMaking() {
    if (this.trading.ongoing) return;
    this.trading.ongoing = true;
    const beforeState = this.trading.printStart();
    try {
      await this.trading.next();
      this.trading.ongoing = false;
    } catch (e) {
      if (e instanceof Error) {
        this.logger.error(e.stack);
      } else {
        this.logger.error(e);
      }
    } finally {
      this.trading.printEnd(beforeState);
      this.trading.ongoing = false;
    }
  }

  addTrading(trading: Trading) {
    this.trading = trading;
  }

  toSymbol(denom: Denom) {
    switch (denom) {
      case 'ukuji':
        return 'KUJI';
      case 'factory/kujira1ltvwg69sw3c5z99c6rr08hal7v0kdzfxz07yj5/demo':
        return 'DEMO';
      case 'ibc/295548A78785A1007F232DE286149A6FF512F180AF5657780FC89C009E2C348F':
        return 'axlUSDC';
      case 'ibc/1B38805B1C75352B28169284F96DF56BDEBD9E8FAC005BDCC8CF0378C82AA8E7':
        return 'wETH';
      case 'ibc/27394FB092D2ECCD56123C74F36E4C1F926001CEADA9CA97EA622B25F41E5EB2':
        return 'ATOM';
      case 'ibc/47BD209179859CDE4A2806763D7189B6E6FE13A17880FE2B42DE1E6C1E329E23':
        return 'OSMO';
      case 'ibc/EFF323CC632EC4F747C61BCE238A758EFDB7699C3226565F7C20DA06509D59A5':
        return 'JUNO';
      case 'ibc/F3AA7EF362EC5E791FE78A0F4CCC69FEE1F9A7485EB1A8CAB3F6601C00522F10':
        return 'EVMOS';
      case 'ibc/A358D7F19237777AF6D8AD0E0F53268F8B18AE8A53ED318095C14D6D7F3B2DB5':
        return 'SCRT';
      default:
        return denom;
    }
  }
}
