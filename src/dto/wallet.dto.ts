import { Wallet } from "../app/wallet";

export class WalletDto {

  readonly endpoint: string;
  readonly account: { address: string };

  constructor(wallet: Wallet) {
    this.endpoint = wallet.endpoint;
    this.account = {
      address: wallet.account.address,
    }
  }
}