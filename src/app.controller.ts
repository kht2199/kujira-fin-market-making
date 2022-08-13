import { Controller, Get, HttpStatus, Res } from "@nestjs/common";

@Controller()
export class AppController {
  constructor() {}

  @Get('/info')
  getInfo(@Res() res) {
    res.status(HttpStatus.OK)
      .send({
        version: process.env.VERSION,
      });
  }
}
