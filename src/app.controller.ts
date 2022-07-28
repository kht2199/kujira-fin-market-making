import { Body, Controller, Get, HttpStatus, Param, Post, Res } from "@nestjs/common";
import { Response } from "express";
import { KujiraService } from "./kujira/kujira.service";

@Controller()
export class AppController {
  constructor(private readonly kujiraService: KujiraService) {}

  @Get('/info')
  getInfo(@Res() res: Response) {
    res.status(HttpStatus.OK)
      .json({
        version: 1,
      });
  }

  @Get('/tradings')
  getTradings(@Res() res: Response) {
    res.status(HttpStatus.OK)
      .json(this.kujiraService.getTradings());
  }

  @Get('/tradings/:id')
  async getTrading(@Param() params, @Res() res: Response) {
    const trading = await this.kujiraService.getTrading(params.id);
    res.status(HttpStatus.OK)
      .json(trading);
  }

  @Post('/tradings/:id')
  postTrading(@Param('id') id: string, @Body() body: TradingDto, @Res() res: Response) {
    body.uuid = id;
    const trading = this.kujiraService.modifyTrading(body);
    res.status(HttpStatus.OK)
      .json(trading);
  }
}
