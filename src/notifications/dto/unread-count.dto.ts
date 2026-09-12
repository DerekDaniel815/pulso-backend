import { ApiProperty } from '@nestjs/swagger';

export class UnreadCountResponseDto {
  @ApiProperty()
  count: number;
}

export class MarkAllReadResponseDto {
  @ApiProperty()
  count: number;
}
