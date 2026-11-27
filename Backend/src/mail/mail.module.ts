import { Global, Module } from '@nestjs/common';
import { MailController } from './mail.controller';
import { MailNoticesService } from './mail-notices.service';
import { MailService } from './mail.service';

/**
 * Correo con Resend (opcional): enlaces de verificar email y de contraseña
 * olvidada (los usa auth) y avisos de pagos y de mensajes. Global porque lo
 * usan auth, billing y chat; así ninguno tiene que importar a los demás.
 */
@Global()
@Module({
  controllers: [MailController],
  providers: [MailService, MailNoticesService],
  exports: [MailService, MailNoticesService],
})
export class MailModule {}
