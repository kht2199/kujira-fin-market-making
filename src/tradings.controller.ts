import { Body, Controller, Get, HttpStatus, Logger, Param, Post, Put, Res } from "@nestjs/common";
import { Response } from "express";
import { KujiraService } from "./kujira/kujira.service";
import { Trading } from "./app/trading";
import { TradingAddDto } from "./dto/trading-add.dto";
import { ResponseDto } from "./dto/response.dto";

@Controller()
export class TradingsController {
  private readonly logger = new Logger(TradingsController.name);

  constructor(private readonly kujiraService: KujiraService) {}

  @Get('/tradings')
  getTradings() {
    return this.kujiraService.getTradings();
  }

  @Get('/tradings/:id')
  async getTrading(@Param() params) {
    return await this.kujiraService.getTrading(params.id);
  }

  @Post('/tradings/:id/resume')
  resumeTrading(@Param('id') id: string, @Res() res: Response) {
    this.kujiraService.resumeTrading(id);
    res.status(HttpStatus.OK).json(ResponseDto.OK);
  }

  @Post('/tradings/:id/stop')
  stopTrading(@Param('id') id: string, @Res() res: Response) {
    this.kujiraService.stopTrading(id);
    res.status(HttpStatus.OK).json(ResponseDto.OK);
  }

  @Post('/tradings/:id')
  postTrading(@Param('id') id: string, @Body() body: TradingAddDto, @Res() res: Response) {
    this.kujiraService.modifyTrading(id, body)
      .then(() => res.status(HttpStatus.OK).json(ResponseDto.OK));
  }

  @Put('/tradings')
  putTrading(@Body() body: TradingAddDto, @Res() res: Response) {
    const wallet = this.kujiraService.getWallet(body.account);
    const contract = this.kujiraService.getContract(body.contract);
    if (!wallet || !contract) {
      throw new Error('Wallet or Contract not exists.');
    }
    const trading = new Trading(wallet, contract, body.deltaRates, body.targetRate, body.orderAmountMin);
    this.kujiraService.addTrading(wallet, trading);
    res.status(HttpStatus.OK).json(ResponseDto.OK);
  }
}