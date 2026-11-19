/**
 * Solo para Vercel: importa todas las dependencias desde un archivo SIN
 * decoradores. El build de Vercel no sigue los imports de los archivos con
 * decoradores (servicios, módulos, controladores de Nest) y dejaba fuera de la
 * función paquetes como @prisma/client o argon2.
 * https://github.com/vercel/vercel/issues/17712
 *
 * Si añades una dependencia nueva al backend, añádela también aquí.
 */
import '@nestjs/common';
import '@nestjs/config';
import '@nestjs/core';
import '@nestjs/jwt';
import '@nestjs/platform-express';
import '@nestjs/swagger';
import '@nestjs/throttler';
import '@prisma/client';
import 'argon2';
import 'class-transformer';
import 'class-validator';
import 'helmet';
import 'reflect-metadata';
import 'rxjs';
import 'ws';

// Vercel Blob (imágenes en producción). Solo se instala en el build de
// Vercel; en local no hace falta y se usa el disco.
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@vercel/blob');
} catch {
  // sin Vercel Blob
}
