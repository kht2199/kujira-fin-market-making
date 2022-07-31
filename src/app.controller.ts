import { Controller, Get, HttpStatus, Res } from "@nestjs/common";
import { Response } from "express";

@Controller()
export class AppController {
  constructor() {}

  @Get('/info')
  getInfo(@Res() res: Response) {
    res.status(HttpStatus.OK)
      .json({
        version: process.env.VERSION,
      });
  }
}
