import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { ASSET_LIMITS, AssetsService, type UploadedImageFile } from './assets.service';

@ApiTags('assets')
@ApiBearerAuth()
@Controller('assets')
export class AssetsController {
  constructor(private readonly assets: AssetsService) {}

  /**
   * Sube una imagen (PNG, JPEG o WebP, máx. 2 MB y 4096 px) para usarla en
   * logos, estampados y parches. El tipo se comprueba por el contenido real.
   */
  @Post()
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', required: ['file'], properties: { file: { type: 'string', format: 'binary' } } } })
  @UseInterceptors(
    FileInterceptor('file', {
      // En memoria (sin escribir en disco hasta validar) y con límites de multer.
      limits: { fileSize: ASSET_LIMITS.maxBytes, files: 1, fields: 0, parts: 2 },
    }),
  )
  upload(@CurrentUser() user: AuthenticatedUser, @UploadedFile() file: UploadedImageFile | undefined) {
    return this.assets.upload(user.id, file);
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.assets.list(user.id);
  }

  /** Contenido de la imagen. Solo para su dueño (requiere el token). */
  @Get(':id/content')
  async content(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { data, mimeType } = await this.assets.content(user.id, id);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // Aunque alguien abra la URL directamente, no se ejecuta nada.
    res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; sandbox");
    return new StreamableFile(data, { type: mimeType, length: data.length, disposition: 'inline' });
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.assets.remove(user.id, id);
  }
}
