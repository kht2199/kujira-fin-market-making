import { AccountData, OfflineSigner } from '@cosmjs/launchpad';
import { SigningCosmWasmClient } from '@cosmjs/cosmwasm-stargate';
import { DirectSecp256k1HdWallet } from '@cosmjs/proto-signing';
import { OrderResponse } from 'kujira.js/lib/cjs/fin';

declare global {
  type Denom =
    | 'ukuji'
    | 'factory/kujira1ltvwg69sw3c5z99c6rr08hal7v0kdzfxz07yj5/demo'
    | 'ibc/1B38805B1C75352B28169284F96DF56BDEBD9E8FAC005BDCC8CF0378C82AA8E7'
    | 'ibc/295548A78785A1007F232DE286149A6FF512F180AF5657780FC89C009E2C348F'
    | 'ibc/27394FB092D2ECCD56123C74F36E4C1F926001CEADA9CA97EA622B25F41E5EB2'
    | 'ibc/47BD209179859CDE4A2806763D7189B6E6FE13A17880FE2B42DE1E6C1E329E23'
    | 'ibc/EFF323CC632EC4F747C61BCE238A758EFDB7699C3226565F7C20DA06509D59A5'
    | 'ibc/F3AA7EF362EC5E791FE78A0F4CCC69FEE1F9A7485EB1A8CAB3F6601C00522F10'
    | 'ibc/A358D7F19237777AF6D8AD0E0F53268F8B18AE8A53ED318095C14D6D7F3B2DB5';

  interface Wallet {
    signer: OfflineSigner | DirectSecp256k1HdWallet;
    account: AccountData;
    client: SigningCosmWasmClient;
    endpoint: string;
    mnemonic: string;
  }

  interface Contract {
    address: string;
    denoms: {
      base: Denom;
      quote: Denom;
    };
    is_bootstrapping: boolean;
    owner: string;
    price_precision: {
      decimal_places: number;
    };
    decimal_delta: number;
  }

  interface Balance {
    denom: Denom;
    amount: string;
  }

  //
  type OrderState = 'Open' | 'Partial' | 'Closed';
  type OrderSide = 'Buy' | 'Sell';

  interface Order extends OrderResponse {
    state: OrderState;
    side: OrderSide;
    base: Denom;
    quote: Denom;
  }

  interface OrderRequest {
    uuid: string;
    contract: Contract;
    side: OrderSide;
    price: number;
    amount: number;
  }

  interface OrderRequestSimulation {
    side: OrderSide;
    price: number;
    amount: number;
  }

  interface OrderMarketMaking {
    price: number;
    tot: number;
    base: number;
    dq: number;
    rate: number;
    normal: boolean;
  }
}

export {};
