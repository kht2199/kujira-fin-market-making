import { coins, DeliverTxResponse, GasPrice, MsgSendEncodeObject } from "@cosmjs/stargate";
import * as kujiraClient from "kujira.js";
import { FinClient, registry, tx } from "kujira.js";
import { MsgSend } from "cosmjs-types/cosmos/bank/v1beta1/tx";
import { ExecuteResult, SigningCosmWasmClient } from "@cosmjs/cosmwasm-stargate";
import { Buffer } from "buffer";
import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";
import { lastValueFrom, map } from "rxjs";
import { BookResponse } from "kujira.js/lib/cjs/fin";
import { HttpService } from "@nestjs/axios";
import { Injectable } from "@nestjs/common";
import { OrderResponse } from "kujira.js/src/fin";
import { Contract } from "../app/contract";
import { Wallet } from "../app/wallet";

@Injectable()
export class KujiraClientService {

  private readonly _lcdUrl: string = process.env.ENDPOINT_LCD;

  private readonly _balanceUrl: string = `${this._lcdUrl}/cosmos/bank/v1beta1/balances`;

  constructor(
    private readonly httpService: HttpService,
  ) {}

  getBalances(wallet: Wallet): Promise<Balance[]> {
    return lastValueFrom(
      this.httpService.get(`${this._balanceUrl}/${wallet.account.address}`)
        .pipe(
          map((res) => res.data.balances),
        ),
    );
  }

  // TODO market price caching.
  async getMarketPrice(wallet: Wallet, contract: Contract) {
    const orders = await this.books(wallet, contract, {
      limit: 1,
    });
    if (orders.base.length !== 1) throw new Error('orders.base.length !== 1');
    if (orders.quote.length !== 1) throw new Error('orders.quote.length !== 1');
    const base = Number(orders.base[0].quote_price);
    const quote = Number(orders.quote[0].quote_price);
    return (base + quote) / 2;
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

  async sign(endpoint: string, mnemonic: string) {
    const signer = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, {
      prefix: 'kujira',
    });
    const client: SigningCosmWasmClient =
      await SigningCosmWasmClient.connectWithSigner(endpoint, signer, {
        registry,
        gasPrice: GasPrice.fromString('0.00125ukuji'),
      });
    const accounts = await signer.getAccounts();
    return new Wallet({
      client,
      signer,
      account: accounts[0],
      endpoint,
      mnemonic,
    });
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
      .then((res) => res.orders.map((o) => this.toOrder(contract, o)));
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

  private toOrder(contract: Contract, o: OrderResponse): Order {
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
  }
}