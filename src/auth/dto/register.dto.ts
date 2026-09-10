import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ maxLength: 100 })
  @IsString()
  @MaxLength(100)
  nombres: string;

  @ApiProperty({ maxLength: 100 })
  @IsString()
  @MaxLength(100)
  apellidos: string;

  @ApiProperty()
  @IsEmail()
  @MaxLength(150)
  correo: string;

  @ApiPropertyOptional({ maxLength: 30 })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  telefono?: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(255)
  password: string;
}
