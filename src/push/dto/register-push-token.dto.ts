import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, Matches, MaxLength } from 'class-validator';

export const PUSH_PLATFORMS = ['android', 'ios'] as const;

export class RegisterPushTokenDto {
  @ApiProperty({ example: 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]' })
  @IsString()
  @MaxLength(255)
  @Matches(/^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/, {
    message: 'token debe ser un Expo push token',
  })
  token: string;

  @ApiProperty({ enum: PUSH_PLATFORMS, example: 'android' })
  @IsIn(PUSH_PLATFORMS)
  platform: (typeof PUSH_PLATFORMS)[number];
}
