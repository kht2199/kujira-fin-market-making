import { NestFactory, Reflector } from "@nestjs/core";
import { AppModule } from './app.module';
import { HttpExceptionFilter } from "./http-exception.filters";
import { ClassSerializerInterceptor, ValidationPipe } from "@nestjs/common";
import { FastifyAdapter, NestFastifyApplication } from "@nestjs/platform-fastify";

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter()
  );
  app.enableCors();
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      enableDebugMessages: true,
      disableErrorMessages: false,
    })
  );
  await app.listen(3000);
}
(async () => await bootstrap())();
