import { Body, Controller, Delete, Get, HttpStatus, Logger, Param, Post, Put, Res } from "@nestjs/common";
import { Response } from "express";
import { KujiraService } from "./kujira/kujira.service";
import { Trading } from "./app/trading";
import { TradingAddDto } from "./dto/trading-add.dto";
import { ResponseDto } from "./dto/response.dto";
import { TasksService } from "./scheduler/task.service";

@Controller()
export class TradingsController {
  private readonly logger = new Logger(TradingsController.name);

  constructor(
    private readonly tasksService: TasksService
  ) {}

  @Get('/tradings')
  getTradings() {
    return this.tasksService.getTradings();
  }

  @Get('/tradings/:id')
  async getTrading(@Param() params) {
    return await this.tasksService.getTrading(params.id);
  }

  @Post('/tradings/:id/resume')
  resumeTrading(@Param('id') id: string, @Res() res) {
    this.tasksService.resumeTrading(id);
    res.status(HttpStatus.OK).send(ResponseDto.OK);
  }

  @Post('/tradings/:id/stop')
  stopTrading(@Param('id') id: string, @Res() res) {
    this.tasksService.stopTrading(id);
    res.status(HttpStatus.OK).send(ResponseDto.OK);
  }

  @Post('/tradings/:id')
  postTrading(@Param('id') id: string, @Body() body: TradingAddDto, @Res() res) {
    this.tasksService.modifyTrading(id, body)
      .then(() => res.status(HttpStatus.OK).send(ResponseDto.OK));
  }

  @Delete('/tradings/:id')
  deleteTrading(@Param('id') id: string, @Res() res) {
    this.tasksService.deleteTrading(id)
      .then(() => res.status(HttpStatus.OK).send(ResponseDto.OK))
  }

  @Put('/tradings')
  async putTrading(@Body() body: TradingAddDto, @Res() res) {
    const wallet = this.tasksService.getWallet(body.account);
    if (!wallet) {
      throw new Error('Wallet not exists.');
    }
    await this.tasksService.addTrading(wallet, body);
    res.status(HttpStatus.OK).send(ResponseDto.OK);
  }

}