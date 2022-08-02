import { Wallet } from "../app/wallet";
import { Trading } from "../app/trading";
import { Injectable } from "@nestjs/common";
import { PrismaService } from "../config/prisma.service";
import { WalletService } from "./wallet.service";

@Injectable()
export class TradingService {

  constructor(
    private prisma: PrismaService,
    private walletService: WalletService,
  ) {}

  async getTradings(wallet: Wallet) {
    return this.prisma.trading.findMany({
      where: {
        walletId: wallet.account.address
      }
    })
  }

  async addTrading(trading: Trading) {
    const wallet = await this.walletService.getWallet(trading.wallet.account.address);
    return await this.prisma.trading.create({
      data: {
        uuid: trading.uuid,
        contract: trading.contract.address,
        deltaRates: trading.deltaRates.join(','),
        targetRate: trading.targetRate,
        orderAmountMin: trading.orderAmountMin,
        wallet: {
          connect: wallet,
        },
      },
    })
  }

  async updateTrading(trading: Trading) {
    await this.prisma.trading.update({
      data: {
        deltaRates: trading.deltaRates.join(','),
        targetRate: trading.targetRate,
        orderAmountMin: trading.orderAmountMin,
      },
      where: {
        uuid: trading.uuid
      }
    })
  }
}