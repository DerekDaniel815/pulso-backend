import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

export class DeactivatePushTokenDto {
  @ApiProperty({ example: 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]' })
  @IsString()
  @MaxLength(255)
  token: string;
}
