import { Injectable } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { Wallet } from "../app/wallet";
import { Trading } from "../app/trading";

@Injectable()
export class DatabaseService {

  private prisma: PrismaClient;

  constructor() {
    this.prisma = new PrismaClient({
      // log: ['query', 'info', 'warn', 'error']
    });
  }

  async deleteWalletsNotIn(addresses: string[]) {
    await this.prisma.wallet.deleteMany({
      where: { address: {
          notIn: addresses,
        }
      }
    })
  }

  async getWallet(address: string) {
    return await this.prisma.wallet.findUnique({
      where: { address }
    })
  }

  async addWallets(wallets: Wallet[]) {
    wallets.map(async (wallet) => {
      const w = await this.getWallet(wallet.account.address);
      if (!w) {
        await this.prisma.wallet.create({
          data: {
            address: wallet.account.address,
          },
        })
      }
    })
  }

  async getTradings(wallet: Wallet) {
    return this.prisma.trading.findMany({
      where: {
        walletId: wallet.account.address
      }
    })
  }

  async addTrading(trading: Trading) {
    const wallet = await this.getWallet(trading.wallet.account.address);
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
}
