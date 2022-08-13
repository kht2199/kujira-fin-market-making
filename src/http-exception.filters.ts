import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger, NotFoundException } from "@nestjs/common";

@Catch(HttpException, NotFoundException)
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();
    const status = exception.getStatus();
    response
      .status(status)
      .send(exception.getResponse());
  }
}