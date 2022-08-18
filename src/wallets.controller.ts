import { Controller, Get, HttpStatus, Param, Res } from "@nestjs/common";
import { KujiraService } from "./kujira/kujira.service";
import { TasksService } from "./scheduler/task.service";

@Controller()
export class WalletsController {

  constructor(
    private readonly tasksService: TasksService,
    private readonly kujiraService: KujiraService,
  ) {}

  @Get('/wallets')
  getWallets(@Res() res) {
    res.status(HttpStatus.OK)
      .send(this.tasksService.getWallets());
  }

  @Get('/wallets/:address/balances')
  async getBalances(@Param('address') address: string, @Res() res) {
    const wallet = this.tasksService.getWallet(address)
    const balances = await this.kujiraService.getBalances(wallet);
    res.status(HttpStatus.OK)
      .send(balances);
  }
}