import { Trading } from "./trading";

describe("Trading.ts", () => {
  describe("시장가가 상승/하락시 주문정보", () => {
    const base = 10;
    const quote = 10;
    const marketPrice = 100;
    const targetRate = base * 100 / (base * 100 + quote);
    it("0.01 퍼센트 상위 가격인 101에서 매도주문이 발생해야한다", () => {
      let order = Trading.toOrderMarketMaking(0.01, marketPrice, base, quote, targetRate);
      expect(order).toMatchObject({ price: 101, side: "Sell" });
    });
    it("0.01 퍼센트 하위 가격인 99에서 매수주문이 발생해야한다", () => {
      let order = Trading.toOrderMarketMaking(-0.01, marketPrice, base, quote, targetRate);
      expect(order).toMatchObject({ price: 99, side: "Buy" });
    });
  });
});
