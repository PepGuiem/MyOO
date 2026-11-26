// Primero: arreglos para Vercel (rutas de node_modules y dependencias).
import './vercel-module-paths';
import './vercel-deps';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { setupApp } from './app.setup';

async function bootstrap(): Promise<void> {
  // rawBody: el webhook de Stripe comprueba la firma sobre el cuerpo exacto.
  const app = await NestFactory.create(AppModule, { rawBody: true });
  setupApp(app);

  const config = app.get(ConfigService);
  const port = config.getOrThrow<number>('PORT');

  // Documentación interactiva de la API (no se publica en producción).
  if (config.getOrThrow<string>('NODE_ENV') !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('MyOO API')
      .setDescription('Armarios, prendas y outfits')
      .setVersion('0.1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
  }

  await app.listen(port);
  Logger.log(`API escuchando en http://localhost:${port}/api`, 'Bootstrap');
  Logger.log(`Swagger en http://localhost:${port}/api/docs`, 'Bootstrap');
}

void bootstrap();
