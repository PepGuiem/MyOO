import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

/**
 * Hash y verificación de contraseñas con Argon2id.
 * Usamos los parámetros por defecto de la librería `argon2`
 * (64 MiB de memoria, 3 iteraciones, paralelismo 4), que superan
 * las recomendaciones mínimas de OWASP para Argon2id.
 */
@Injectable()
export class PasswordService {
  private dummyHash?: Promise<string>;

  hash(plain: string): Promise<string> {
    return argon2.hash(plain, { type: argon2.argon2id });
  }

  async verify(hash: string, plain: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plain);
    } catch {
      // Hash corrupto o con formato inesperado: tratamos como no válido.
      return false;
    }
  }

  /**
   * Cuando el email no existe, igualmente verificamos contra un hash
   * "señuelo" para que la respuesta tarde lo mismo. Así es más difícil
   * averiguar qué emails están registrados midiendo tiempos.
   */
  async verifyDummy(plain: string): Promise<void> {
    this.dummyHash ??= this.hash('dummy-password-for-timing-1');
    await this.verify(await this.dummyHash, plain);
  }
}
