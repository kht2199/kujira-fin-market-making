
export class OrderRequestDelta {
  private _price: number;
  private _base: number;
  private _dq: number;
  private _side: OrderSide;
  private _rate: number;

  constructor(rate: number, marketPrice: number, baseAmount: number, quoteAmount: number, targetRate: number) {
    this._rate = rate;
    // 자산비율이 주문비율{1%,2%}에 해당하는 목표가격을 {tp1, tp2} 찾는다.
    this._price = marketPrice + marketPrice * rate;
    // 주문비율의 가격에서 변동자산가치를{tot1, tot2} 계산한다.
    const tot = baseAmount * this.price + quoteAmount;
    // 변동자산가치에서 목표비율을 곱해 목표가의 갯수를{base}를 계산한다.
    this._base = tot * targetRate / this.price;
    // 목표수량과 현재 수량만큼의 차이인 주문수량{dq1, dq2} 계산한다.
    this._dq = this.base - baseAmount;
    // 부호가 다르면, 가격 이격이 발생.
    this._side = this.dq > 0 ? 'Buy' : 'Sell';
  }

  normal() {
    return this._rate * this._dq < 0
  }

  get price(): number {
    return this._price;
  }

  get base(): number {
    return this._base;
  }

  get dq(): number {
    return this._dq;
  }

  get side(): OrderSide {
    return this._side;
  }

  get rate(): number {
    return this._rate;
  }

  set price(value: number) {
    this._price = value;
  }

  set dq(value: number) {
    this._dq = value;
  }
}