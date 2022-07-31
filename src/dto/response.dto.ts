import { HttpStatus } from "@nestjs/common";

export class ResponseDto {

  public static readonly OK = new ResponseDto();

  statusCode: HttpStatus = HttpStatus.OK;

  message: string | undefined;

  constructor(statusCode: HttpStatus = HttpStatus.OK, message: string | undefined = undefined) {
    this.statusCode = statusCode;
    this.message = message;
  }

  static of(status: HttpStatus) {
    return new ResponseDto(status)
  }
}