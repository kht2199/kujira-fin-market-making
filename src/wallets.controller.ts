import { Controller, Get, HttpStatus, Logger, Param, Res } from "@nestjs/common";
import { Response } from "express";
import { KujiraService } from "./kujira/kujira.service";

@Controller()
export class WalletsController {
  private readonly logger = new Logger(WalletsController.name);

  constructor(private readonly kujiraService: KujiraService) {}

  @Get('/wallets')
  getWallets(@Res() res: Response) {
    res.status(HttpStatus.OK)
      .json(this.kujiraService.getWallets());
  }

  @Get('/wallets/:address/balances')
  getBalances(@Param() params, @Res() res: Response) {
    const wallet = this.kujiraService.getWallet(params.address)
    this.kujiraService.fetchAllBalances(wallet)
      .then(balances => {
        res.status(HttpStatus.OK)
          .json(balances);
      })
  }
}