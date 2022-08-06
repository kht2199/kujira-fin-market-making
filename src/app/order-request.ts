import { Contract } from "./contract";
import { v4 as uuid } from "uuid";

export class OrderRequest {
  uuid: string;
  contract: Contract;
  side: OrderSide;
  price: number;
  amount: number;

  constructor(contract: Contract, side: OrderSide, price: number, amount: number) {
    this.uuid = uuid();
    this.contract = contract;
    this.side = side;
    this.price = price;
    this.amount = amount;
  }

  toString() {
    const [baseSymbol, quoteSymbol] = this.contract.symbols;
    return `${this.side} ${this.amount.toFixed(4)} ${this.side === 'Sell' ? baseSymbol : quoteSymbol} at ${this.price.toFixed(this.contract.price_precision.decimal_places)} ${quoteSymbol}`
  }
}