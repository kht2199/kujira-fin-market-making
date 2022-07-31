import { AccountData, OfflineSigner } from "@cosmjs/launchpad";
import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";
import { SigningCosmWasmClient } from "@cosmjs/cosmwasm-stargate";

export class Wallet {

  signer: OfflineSigner | DirectSecp256k1HdWallet;
  account: AccountData;
  client: SigningCosmWasmClient;
  endpoint: string;
  mnemonic: string;

  constructor({
                client,
                signer,
                account,
                endpoint,
                mnemonic,
              }) {
    this.signer = signer;
    this.client = client;
    this.account = account;
    this.endpoint = endpoint;
  }
}