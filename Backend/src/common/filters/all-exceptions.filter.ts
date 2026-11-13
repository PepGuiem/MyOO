import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';

/** Forma de TODAS las respuestas de error de la API. */
export interface ApiErrorBody {
  statusCode: number;
  error: string;
  message: string | string[];
  path: string;
  timestamp: string;
  [extra: string]: unknown;
}

/**
 * Filtro global de excepciones.
 * - Da un formato consistente a todos los errores.
 * - Traduce errores conocidos de Prisma a códigos HTTP útiles.
 * - Nunca devuelve SQL, trazas internas ni datos sensibles: los errores
 *   inesperados se registran en el log del servidor y el cliente solo ve
 *   "Internal server error".
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { statusCode, error, message, extra } = this.resolve(exception);

    if (statusCode >= 500) {
      // Para el monitor: solo la clase del error, nunca el mensaje.
      response.locals.errorName =
        exception instanceof Error ? exception.constructor.name : 'Error';
      // Solo método y ruta: no registramos cuerpos de petición ni cabeceras.
      this.logger.error(
        `${request.method} ${request.url} -> ${statusCode}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const body: ApiErrorBody = {
      ...extra,
      statusCode,
      error,
      message,
      path: request.url,
      timestamp: new Date().toISOString(),
    };
    response.status(statusCode).json(body);
  }

  private resolve(exception: unknown): {
    statusCode: number;
    error: string;
    message: string | string[];
    extra: Record<string, unknown>;
  } {
    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'string') {
        return { statusCode, error: exception.name, message: res, extra: {} };
      }
      const { message, error, ...extra } = res as Record<string, unknown>;
      delete extra.statusCode;
      return {
        statusCode,
        error: typeof error === 'string' ? error : exception.name,
        message:
          typeof message === 'string' || Array.isArray(message)
            ? (message as string | string[])
            : exception.message,
        extra,
      };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      switch (exception.code) {
        case 'P2002': // violación de restricción UNIQUE
          return {
            statusCode: HttpStatus.CONFLICT,
            error: 'Conflict',
            message: 'A resource with these values already exists',
            extra: {},
          };
        case 'P2003': // violación de clave foránea
          return {
            statusCode: HttpStatus.BAD_REQUEST,
            error: 'Bad Request',
            message:
              'A related resource does not exist or does not belong to you',
            extra: {},
          };
        case 'P2025': // registro no encontrado
          return {
            statusCode: HttpStatus.NOT_FOUND,
            error: 'Not Found',
            message: 'Resource not found',
            extra: {},
          };
      }
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'Internal Server Error',
      message: 'Internal server error',
      extra: {},
    };
  }
}
