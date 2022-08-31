import { Body, Controller, Delete, Get, Logger, Param, Post, Put } from "@nestjs/common";
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
  resumeTrading(@Param('id') id: string) {
    this.tasksService.resumeTrading(id);
    return ResponseDto.OK;
  }

  @Post('/tradings/:id/stop')
  stopTrading(@Param('id') id: string) {
    this.tasksService.stopTrading(id);
    return ResponseDto.OK;
  }

  @Post('/tradings/:id')
  async postTrading(@Param('id') id: string, @Body() body: TradingAddDto) {
    await this.tasksService.modifyTrading(id, body);
    return ResponseDto.OK;
  }

  @Delete('/tradings/:id')
  async deleteTrading(@Param('id') id: string) {
    await this.tasksService.deleteTrading(id);
    return ResponseDto.OK;
  }

  @Put('/tradings')
  async putTrading(@Body() body: TradingAddDto) {
    const wallet = this.tasksService.getWallet(body.account);
    if (!wallet) {
      throw new Error('Wallet not exists.');
    }
    await this.tasksService.addTrading(wallet, body);
    return ResponseDto.OK;
  }

}