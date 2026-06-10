import { IsString, IsNotEmpty, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyWatermarkDto {
  @ApiProperty({
    description: '待验证的视频 URL（MinIO 或公开 URL）',
    maxLength: 2000,
    example: 'http://minio:9000/tikstream/video_abc123.mp4',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  video_url!: string;
}
