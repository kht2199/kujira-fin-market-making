import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger, NotFoundException } from "@nestjs/common";
import { Request, Response } from "express";

@Catch(HttpException, NotFoundException)
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const status = exception.getStatus();
    response
      .status(status)
      .json(exception.getResponse());
  }
}