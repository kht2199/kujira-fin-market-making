import { OrderResponse } from "kujira.js/lib/cjs/fin";
import { Contract } from "../app/contract";

declare global {
  type Denom = string;

  interface Balance {
    denom: Denom;
    amount: string;
  }

  type OrderState = 'Open' | 'Partial' | 'Closed';

  type OrderSide = 'Buy' | 'Sell';

  interface Order extends OrderResponse {
    state: OrderState;
    side: OrderSide;
    base: Denom;
    quote: Denom;
  }
}

export {};
