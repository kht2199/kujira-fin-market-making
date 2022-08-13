import { NestFactory, Reflector } from "@nestjs/core";
import { AppModule } from './app.module';
import { HttpExceptionFilter } from "./http-exception.filters";
import { ClassSerializerInterceptor, ValidationPipe } from "@nestjs/common";
import { FastifyAdapter, NestFastifyApplication } from "@nestjs/platform-fastify";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter()
  );

  setupSwagger(app);

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
  await app.listen(3000, '0.0.0.0');
}

function setupSwagger(app: NestFastifyApplication) {
  const options = new DocumentBuilder()
    .setTitle('NestJS API Docs')
    .setDescription('NestJS API description')
    .setVersion('1.0.0')
    .build();

  const document = SwaggerModule.createDocument(app, options);
  SwaggerModule.setup('api-docs', app, document);

}
(async () => await bootstrap())();
