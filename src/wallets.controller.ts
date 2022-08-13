import { Controller, Get, HttpStatus, Param, Res } from "@nestjs/common";
import { Response } from "express";
import { KujiraService } from "./kujira/kujira.service";
import { TasksService } from "./scheduler/task.service";

@Controller()
export class WalletsController {

  constructor(
    private readonly tasksService: TasksService,
    private readonly kujiraService: KujiraService,
  ) {}

  @Get('/wallets')
  getWallets(@Res() res: Response) {
    res.status(HttpStatus.OK)
      .json(this.tasksService.getWallets());
  }

  @Get('/wallets/:address/balances')
  getBalances(@Param() params, @Res() res: Response) {
    const wallet = this.tasksService.getWallet(params.address)
    this.kujiraService.getBalances(wallet)
      .then(balances => {
        res.status(HttpStatus.OK)
          .json(balances);
      })
  }
}