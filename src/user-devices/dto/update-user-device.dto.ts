import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { VisibilidadPreferida } from '../../common/enums.js';

export class UpdateUserDeviceDto {
  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  alias?: string;

  @ApiPropertyOptional({ enum: VisibilidadPreferida })
  @IsOptional()
  @IsEnum(VisibilidadPreferida)
  visibilidadPreferida?: VisibilidadPreferida;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  ubicacionActiva?: boolean;
}
