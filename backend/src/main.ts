import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { NextFunction, Request, Response } from 'express';
import { basename, extname, join } from 'path';
import { AppModule } from './app.module';
import { EnvironmentVariables } from './config/environment';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const environment = app.get(ConfigService<EnvironmentVariables, true>);
  const nodeEnvironment = environment.getOrThrow('NODE_ENV', { infer: true });
  const allowedOrigins = new Set(environment.getOrThrow('WEB_ORIGINS', { infer: true }));
  const trustProxyHops = environment.getOrThrow('TRUST_PROXY_HOPS', { infer: true });

  app.enableShutdownHooks();
  if (trustProxyHops > 0) app.set('trust proxy', trustProxyHops);
  app.getHttpAdapter().getInstance().disable('x-powered-by');
  app.use(helmet({
    // Swagger usa scripts inline; el frontend aplica su propia política CSP.
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }));
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });
  app.use(cookieParser());
  app.enableCors({
    origin: (origin, callback) => callback(null, !origin || allowedOrigins.has(origin)),
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type'],
    maxAge: 600,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
      validationError: { target: false, value: false },
    }),
  );

  app.setGlobalPrefix('api');
  app.useStaticAssets(join(process.cwd(), 'uploads'), {
    prefix: '/uploads/',
    setHeaders: (res, filePath) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      if (extname(filePath).toLowerCase() === '.pdf') {
        // El visor científico usa un iframe sandboxeado desde el frontend. La
        // allowlist evita que sitios de terceros incrusten documentos subidos.
        res.removeHeader('X-Frame-Options');
        res.setHeader('Content-Security-Policy', `default-src 'none'; sandbox; frame-ancestors 'self' ${[...allowedOrigins].join(' ')}`);
        const safeName = basename(filePath).replace(/[^a-zA-Z0-9._-]/g, '_');
        res.setHeader('Content-Disposition', `inline; filename="${safeName}"`);
      } else {
        res.setHeader('X-Frame-Options', 'DENY');
        res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
      }
    },
  });

  const swaggerEnabled = nodeEnvironment !== 'production' || environment.getOrThrow('ENABLE_SWAGGER', { infer: true });
  if (swaggerEnabled) {
    const config = new DocumentBuilder()
      .setTitle('Portal ISI API')
      .setDescription('API del portal académico gamificado de Ingeniería de Sistemas Informáticos')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, document);
  }

  const port = environment.getOrThrow('PORT', { infer: true });
  await app.listen(port);
  console.log(`API lista en http://localhost:${port}${swaggerEnabled ? ' — Swagger en /docs' : ''}`);
}
bootstrap();
